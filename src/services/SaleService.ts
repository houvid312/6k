import { Sale, SaleItem } from '../domain/entities';
import { PizzaSize, PaymentMethod, PORTIONS_PER_SIZE } from '../domain/enums';
import { ISaleRepository, DailySummary } from '../domain/interfaces/repositories';
import { IInventoryRepository } from '../domain/interfaces/repositories';
import { IRecipeRepository } from '../domain/interfaces/repositories';

export interface CreateSaleItemInput {
  productId: string;
  size: PizzaSize;
  quantity: number;
  unitPrice: number;
}

export class SaleService {
  constructor(
    private saleRepo: ISaleRepository,
    private inventoryRepo: IInventoryRepository,
    private recipeRepo: IRecipeRepository,
  ) {}

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
  ): Promise<Sale> {
    const saleItems: SaleItem[] = [];
    let totalPortions = 0;

    for (const item of items) {
      const portions = PORTIONS_PER_SIZE[item.size] * item.quantity;
      const subtotal = item.unitPrice * item.quantity;
      totalPortions += portions;

      saleItems.push({
        id: `si-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        productId: item.productId,
        size: item.size,
        quantity: item.quantity,
        portions,
        unitPrice: item.unitPrice,
        subtotal,
      });

      // Inventory deduction is handled by the DB trigger (deduct_inventory_on_sale)
    }

    const totalAmount = saleItems.reduce((sum, si) => sum + si.subtotal, 0);

    const sale = await this.saleRepo.create({
      storeId,
      timestamp: new Date().toISOString(),
      items: saleItems,
      totalPortions,
      totalAmount,
      paymentMethod,
      cashAmount,
      bankAmount,
      observations: observations ?? '',
      isPaid,
      isDispatched: false,
      customerNote: customerNote ?? undefined,
    } as Omit<Sale, 'id'>);

    return sale;
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

  /**
   * Marks a sale as dispatched.
   */
  async markAsDispatched(saleId: string): Promise<void> {
    return this.saleRepo.markAsDispatched(saleId);
  }
}
