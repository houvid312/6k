import { Recipe, Sale, SaleItem, Supply } from '../domain/entities';
import { PaymentMethod, PACKAGING_SUPPLY_IDS } from '../domain/enums';
import { ISaleRepository, DailySummary, IInventoryRepository, IRecipeRepository, ISupplyRepository, IProductRepository } from '../domain/interfaces/repositories';

export interface CreateSaleItemAdditionInput {
  additionCatalogId: string;
  supplyId: string;
  name: string;
  price: number;
  grams: number;
  quantity: number;
}

export interface CreateSaleItemInput {
  productId: string;
  formatId?: string;
  formatName: string;
  portionsPerUnit: number;
  quantity: number;
  unitPrice: number;
  additions?: CreateSaleItemAdditionInput[];
  packagingSupplyId?: string;
  packagingLabel?: string;
  packagingUnitPrice?: number;
  packagingQuantity?: number;
}

export class SaleService {
  constructor(
    private saleRepo: ISaleRepository,
    private inventoryRepo: IInventoryRepository,
    private recipeRepo: IRecipeRepository,
    private supplyRepo: ISupplyRepository,
    private productRepo?: IProductRepository,
  ) {}

  private valueQuantityAtStorePrice(
    supplyById: Map<string, Supply>,
    supplyId: string | undefined,
    quantity: number,
  ): number {
    if (!supplyId || quantity <= 0) return 0;
    const supply = supplyById.get(supplyId);
    if (!supply?.isBillableToStore || supply.gramsPerBag <= 0 || supply.commercialPriceCop <= 0) {
      return 0;
    }
    return Math.round((quantity / supply.gramsPerBag) * supply.commercialPriceCop);
  }

  private getRecipeCost(
    recipeByProductId: Map<string, Recipe>,
    supplyById: Map<string, Supply>,
    productId: string,
    portions: number,
  ): number {
    const recipe = recipeByProductId.get(productId);
    return (recipe?.ingredients ?? []).reduce(
      (sum, ingredient) => sum + this.valueQuantityAtStorePrice(
        supplyById,
        ingredient.supplyId,
        ingredient.gramsPerPortion * portions,
      ),
      0,
    );
  }

  private async buildSaleItems(items: CreateSaleItemInput[]): Promise<{
    saleItems: SaleItem[];
    totalPortions: number;
    totalAmount: number;
    totalCostCop: number;
    grossMarginCop: number;
  }> {
    const [recipes, supplies, products] = await Promise.all([
      this.recipeRepo.getAll(),
      this.supplyRepo.getAll(false),
      this.productRepo ? this.productRepo.getAll() : Promise.resolve([]),
    ]);
    const recipeByProductId = new Map(recipes.map((recipe) => [recipe.productId, recipe]));
    const supplyById = new Map(supplies.map((supply) => [supply.id, supply]));
    const productById = new Map(products.map((p) => [p.id, p]));
    const saleItems: SaleItem[] = [];
    let totalPortions = 0;

    for (const item of items) {
      const product = productById.get(item.productId);
      const isPizza = !product || product.category === 'PIZZA';
      const portions = isPizza ? item.portionsPerUnit * item.quantity : 0;
      const additionsTotal = (item.additions ?? []).reduce((s, a) => s + a.price * a.quantity, 0);
      const isBox = item.packagingSupplyId === PACKAGING_SUPPLY_IDS.CAJA_FAMILIAR
        || item.packagingSupplyId === PACKAGING_SUPPLY_IDS.CAJA_MEDIANA;
      const defaultPkgQty = (item.portionsPerUnit === 1 && isBox) ? 1 : item.quantity;
      const packagingQuantity = item.packagingSupplyId ? (item.packagingQuantity ?? defaultPkgQty) : 0;
      const packagingUnitPrice = item.packagingUnitPrice ?? 0;
      const packagingTotal = packagingUnitPrice * packagingQuantity;
      const subtotal = item.unitPrice * item.quantity + additionsTotal + packagingTotal;
      const recipeCostCop = this.getRecipeCost(recipeByProductId, supplyById, item.productId, portions);
      const additionsCostCop = (item.additions ?? []).reduce(
        (sum, addition) => sum + this.valueQuantityAtStorePrice(
          supplyById,
          addition.supplyId,
          addition.grams * addition.quantity,
        ),
        0,
      );
      const packagingCostCop = this.valueQuantityAtStorePrice(
        supplyById,
        item.packagingSupplyId,
        packagingQuantity,
      );
      const totalCostCop = recipeCostCop + additionsCostCop + packagingCostCop;
      totalPortions += portions;

      saleItems.push({
        id: `si-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        productId: item.productId,
        formatId: item.formatId || undefined,
        formatName: item.formatName,
        quantity: item.quantity,
        portions,
        unitPrice: item.unitPrice,
        subtotal,
        recipeCostCop,
        additionsCostCop,
        packagingCostCop,
        totalCostCop,
        additions: item.additions,
        additionsTotal: additionsTotal || undefined,
        packagingSupplyId: item.packagingSupplyId,
        packagingLabel: item.packagingLabel,
        packagingUnitPrice,
        packagingQuantity,
        packagingTotal,
      });
    }

    return {
      saleItems,
      totalPortions,
      totalAmount: saleItems.reduce((sum, si) => sum + si.subtotal, 0),
      totalCostCop: saleItems.reduce((sum, si) => sum + (si.totalCostCop ?? 0), 0),
      grossMarginCop: saleItems.reduce((sum, si) => sum + si.subtotal, 0)
        - saleItems.reduce((sum, si) => sum + (si.totalCostCop ?? 0), 0),
    };
  }

  /**
   * Creates a sale. Inventory deduction is handled automatically by the DB trigger.
   */
  async createSale(
    storeId: string,
    items: CreateSaleItemInput[],
    paymentMethod: PaymentMethod,
    cashAmount: number,
    bankAmount: number,
    observations?: string,
    isPaid: boolean = true,
    customerNote?: string,
    packagingSupplyId?: string,
    isCredit: boolean = false,
    debtorName?: string,
    debtorType?: string,
    debtorWorkerId?: string,
    debtorCustomerId?: string,
    customTimestamp?: string,
  ): Promise<Sale> {
    const { saleItems, totalPortions, totalAmount, totalCostCop, grossMarginCop } = await this.buildSaleItems(items);

    const sale = await this.saleRepo.create({
      storeId,
      timestamp: customTimestamp ?? new Date().toISOString(),
      items: saleItems,
      totalPortions,
      totalAmount,
      packagingTotal: saleItems.reduce((sum, si) => sum + (si.packagingTotal ?? 0), 0),
      totalCostCop,
      grossMarginCop,
      paymentMethod,
      cashAmount: isCredit ? 0 : cashAmount,
      bankAmount: isCredit ? 0 : bankAmount,
      observations: observations ?? '',
      isPaid,
      isDispatched: false,
      isCredit,
      debtorName,
      debtorType,
      debtorWorkerId,
      debtorCustomerId,
      customerNote: customerNote ?? undefined,
      packagingSupplyId,
    } as Omit<Sale, 'id'>);

    return sale;
  }

  /**
   * Replaces items/payment data for a sale that has not been dispatched.
   */
  async updateSale(
    saleId: string,
    storeId: string,
    items: CreateSaleItemInput[],
    paymentMethod: PaymentMethod,
    cashAmount: number,
    bankAmount: number,
    observations?: string,
    isPaid: boolean = false,
    customerNote?: string,
    packagingSupplyId?: string,
    isCredit: boolean = false,
    debtorName?: string,
    debtorType?: string,
    debtorWorkerId?: string,
    debtorCustomerId?: string,
    customTimestamp?: string,
  ): Promise<Sale> {
    const { saleItems, totalPortions, totalAmount, totalCostCop, grossMarginCop } = await this.buildSaleItems(items);

    return this.saleRepo.update({
      id: saleId,
      storeId,
      timestamp: customTimestamp ?? new Date().toISOString(),
      items: saleItems,
      totalPortions,
      totalAmount,
      packagingTotal: saleItems.reduce((sum, si) => sum + (si.packagingTotal ?? 0), 0),
      totalCostCop,
      grossMarginCop,
      paymentMethod,
      cashAmount: isCredit ? 0 : cashAmount,
      bankAmount: isCredit ? 0 : bankAmount,
      observations: observations ?? '',
      isPaid,
      isDispatched: false,
      isCredit,
      debtorName,
      debtorType,
      debtorWorkerId,
      debtorCustomerId,
      customerNote: customerNote ?? undefined,
      packagingSupplyId,
    });
  }

  /**
   * Returns all sales for a given store.
   */
  async getSalesByStore(storeId: string): Promise<Sale[]> {
    return this.saleRepo.getAll(storeId);
  }

  /**
   * Returns daily summary (count, totals).
   */
  async getDailySummary(storeId: string, date: string): Promise<DailySummary> {
    return this.saleRepo.getDailySummary(storeId, date);
  }

  /**
   * Returns sales for a date range.
   */
  async getSalesByDateRange(storeId: string, startDate: string, endDate: string): Promise<Sale[]> {
    return this.saleRepo.getByDateRange(storeId, startDate, endDate);
  }

  /**
   * Returns unpaid sales for a given store.
   */
  async getUnpaidSales(storeId: string): Promise<Sale[]> {
    return this.saleRepo.getUnpaid(storeId);
  }

  /**
   * Marks a sale as paid.
   */
  async markAsPaid(saleId: string): Promise<void> {
    return this.saleRepo.markAsPaid(saleId);
  }

  async markAsUnpaid(saleId: string): Promise<void> {
    return this.saleRepo.markAsUnpaid(saleId);
  }

  async updatePaymentMethod(saleId: string, paymentMethod: PaymentMethod): Promise<void> {
    return this.saleRepo.updatePaymentMethod(saleId, paymentMethod);
  }

  /**
   * Marks a sale as dispatched.
   */
  async markAsDispatched(saleId: string): Promise<void> {
    return this.saleRepo.markAsDispatched(saleId);
  }
}
