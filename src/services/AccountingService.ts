import { 
  ISaleRepository, 
  IExpenseRepository, 
  IPurchaseRepository, 
  ISupplyRepository, 
  ITransferRepository, 
  IWriteoffRepository 
} from '../domain/interfaces/repositories';
import { Supply } from '../domain/entities';

export interface CostCenterReport {
  storeId: string;
  startDate: string;
  endDate: string;
  isProductionCenter: boolean;
  
  // Revenues
  externalSalesRevenue: number;     // Direct sales to end customers (sales table)
  internalSalesRevenue: number;     // Transfers to locals (transfers table, only for production center)
  totalRevenue: number;             // externalSales + internalSales
  
  // Variable Costs / COGS
  consumedRecipeCost: number;       // For locals: cost of ingredients of sold pizzas at commercial price.
                                    // For production center: cost of ingredients of sold pizzas (if any) at production cost.
  internalTransfersCost: number;    // For locals: cost of supplies bought from production center.
  directPurchasesCost: number;      // For both: direct purchases from other suppliers (purchases table).
  writeoffsCost: number;            // For both: approved write-offs valued accordingly.
  totalVariableCost: number;        // Sum of variables
  
  // Contribution Margin
  contributionMargin: number;       // totalRevenue - totalVariableCost
  
  // Fixed Costs / General Expenses
  fixedExpenses: number;            // Expenses marked as is_fixed = true
  variableExpenses: number;         // Expenses marked as is_fixed = false
  totalExpenses: number;            // Sum of expenses
  
  // Profit
  netProfit: number;                // contributionMargin - fixedExpenses - variableExpenses
}

export class AccountingService {
  constructor(
    private saleRepo: ISaleRepository,
    private expenseRepo: IExpenseRepository,
    private purchaseRepo: IPurchaseRepository,
    private supplyRepo: ISupplyRepository,
    private transferRepo: ITransferRepository,
    private writeoffRepo: IWriteoffRepository,
  ) {}

  async getReport(
    storeId: string,
    isProductionCenter: boolean,
    startDate: string,
    endDate: string,
  ): Promise<CostCenterReport> {
    // 1. Fetch supplies to get commercial_price and production_cost
    const supplies = await this.supplyRepo.getAll(true); // includeProductionCost = true
    const supplyMap = new Map<string, Supply>(supplies.map(s => [s.id, s]));

    // 2. Fetch Sales
    const sales = await this.saleRepo.getByDateRange(storeId, startDate, endDate);
    const paidSales = sales.filter(s => s.isPaid);
    const externalSalesRevenue = paidSales.reduce((sum, s) => sum + s.totalAmount, 0);
    const consumedRecipeCost = paidSales.reduce((sum, s) => sum + (s.totalCostCop ?? 0), 0);

    // 3. Fetch Expenses
    const expenses = await this.expenseRepo.getByDateRange(storeId, startDate, endDate);
    const fixedExpenses = expenses.filter(e => e.isFixed).reduce((sum, e) => sum + e.amount, 0);
    const variableExpenses = expenses.filter(e => !e.isFixed).reduce((sum, e) => sum + e.amount, 0);

    // 4. Fetch Direct Purchases
    const purchases = await this.purchaseRepo.getByDateRange(startDate, endDate, storeId);
    const directPurchasesCost = purchases.reduce((sum, p) => sum + p.priceCOP, 0);

    // 5. Fetch Writeoffs (Bajas)
    const writeoffs = await this.writeoffRepo.getApprovedByStoreAndDateRange(storeId, startDate, endDate);
    let writeoffsCost = 0;
    for (const wo of writeoffs) {
      if (wo.supplyId) {
        const supply = supplyMap.get(wo.supplyId);
        if (supply) {
          const qty = wo.quantityGrams;
          const bagSize = supply.gramsPerBag || 1;
          const unitPrice = isProductionCenter ? (supply.productionCostCop || 0) : (supply.commercialPriceCop || 0);
          writeoffsCost += Math.round((qty / bagSize) * unitPrice);
        }
      }
    }

    // 6. Fetch Transfers
    let internalSalesRevenue = 0;
    let internalTransfersCost = 0;

    if (isProductionCenter) {
      // Production center: its sales are transfers sent to local stores
      const transfers = await this.transferRepo.getReceivedByOrigin(storeId, startDate, endDate);
      internalSalesRevenue = transfers.reduce((sum, t) => sum + (t.totalPriceCop ?? 0), 0);
      internalTransfersCost = transfers.reduce((sum, t) => sum + (t.totalCostCop ?? 0), 0);
    } else {
      // Local store: its internal purchases are transfers received from the production center
      const transfers = await this.transferRepo.getReceivedByDestination(storeId, startDate, endDate);
      internalTransfersCost = transfers.reduce((sum, t) => sum + (t.totalPriceCop ?? 0), 0);
    }

    const totalRevenue = externalSalesRevenue + internalSalesRevenue;
    
    // For local store: variable costs = consumed recipes + internal transfers + direct purchases + writeoffs
    // For production center: variable costs = consumed recipes (external sales) + cost of production of transfers sent + direct purchases (raw materials) + writeoffs
    const totalVariableCost = consumedRecipeCost + (isProductionCenter ? internalTransfersCost : internalTransfersCost) + directPurchasesCost + writeoffsCost;
    
    const contributionMargin = totalRevenue - totalVariableCost;
    const netProfit = contributionMargin - fixedExpenses - variableExpenses;

    return {
      storeId,
      startDate,
      endDate,
      isProductionCenter,
      externalSalesRevenue,
      internalSalesRevenue,
      totalRevenue,
      consumedRecipeCost,
      internalTransfersCost: isProductionCenter ? 0 : internalTransfersCost,
      directPurchasesCost,
      writeoffsCost,
      totalVariableCost,
      contributionMargin,
      fixedExpenses,
      variableExpenses,
      totalExpenses: fixedExpenses + variableExpenses,
      netProfit,
    };
  }
}
