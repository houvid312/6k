import { ISaleRepository, IInventoryRepository, ISupplyRepository, IExpenseRepository, IPurchaseRepository } from '../domain/interfaces/repositories';
import { IRecipeRepository } from '../domain/interfaces/repositories/IRecipeRepository';
import { IProductRepository } from '../domain/interfaces/repositories/IProductRepository';

export interface DailySummary {
  date: string;
  totalSales: number;
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
}

export interface SalesTrendPoint {
  date: string;
  revenue: number;
  count: number;
}

export interface TopProduct {
  productId: string;
  totalQuantity: number;
  totalRevenue: number;
}

export interface ProductMargin {
  productId: string;
  productName: string;
  revenue: number;
  ingredientCost: number;
  margin: number;
  marginPercent: number;
  portionsSold: number;
}

export class DashboardService {
  constructor(
    private saleRepo: ISaleRepository,
    private inventoryRepo: IInventoryRepository,
    private supplyRepo: ISupplyRepository,
    private expenseRepo: IExpenseRepository,
    private purchaseRepo: IPurchaseRepository,
    private recipeRepo?: IRecipeRepository,
    private productRepo?: IProductRepository,
  ) {}

  /**
   * Returns a complete daily summary for a store.
   */
  async getDailySummary(storeId: string, date: string): Promise<DailySummary> {
    const salesData = await this.saleRepo.getDailySummary(storeId, date);
    const expenses = await this.expenseRepo.getByDateRange(storeId, date, date + 'T23:59:59');
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

    return {
      date,
      totalSales: salesData.salesCount,
      totalRevenue: salesData.totalAmount,
      totalExpenses,
      netIncome: salesData.totalAmount - totalExpenses,
    };
  }

  /**
   * Calculates the food cost percentage.
   * Food cost % = (cost of purchases / total revenue) * 100
   */
  async getFoodCostPercentage(
    startDate: string,
    endDate: string,
    storeId: string,
  ): Promise<number> {
    const purchases = await this.purchaseRepo.getByDateRange(startDate, endDate);
    const totalPurchaseCost = purchases.reduce((sum, p) => sum + p.priceCOP, 0);

    const sales = await this.saleRepo.getByDateRange(storeId, startDate, endDate);
    const totalRevenue = sales.reduce((sum, s) => sum + s.totalAmount, 0);

    if (totalRevenue === 0) return 0;
    return Math.round((totalPurchaseCost / totalRevenue) * 10000) / 100;
  }

  /**
   * Returns sales trend data points for a date range.
   */
  async getSalesTrend(
    storeId: string,
    startDate: string,
    endDate: string,
  ): Promise<SalesTrendPoint[]> {
    const sales = await this.saleRepo.getByDateRange(storeId, startDate, endDate);

    const byDate = new Map<string, { revenue: number; count: number }>();
    for (const sale of sales) {
      const dateKey = sale.timestamp.substring(0, 10);
      const existing = byDate.get(dateKey) ?? { revenue: 0, count: 0 };
      existing.revenue += sale.totalAmount;
      existing.count += 1;
      byDate.set(dateKey, existing);
    }

    return Array.from(byDate.entries())
      .map(([date, data]) => ({
        date,
        revenue: data.revenue,
        count: data.count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Returns top selling products by revenue.
   */
  async getTopProducts(
    storeId: string,
    startDate: string,
    endDate: string,
    limit: number = 5,
  ): Promise<TopProduct[]> {
    const sales = await this.saleRepo.getByDateRange(storeId, startDate, endDate);

    const productMap = new Map<string, { quantity: number; revenue: number }>();

    for (const sale of sales) {
      for (const item of sale.items) {
        const existing = productMap.get(item.productId) ?? { quantity: 0, revenue: 0 };
        existing.quantity += item.quantity;
        existing.revenue += item.subtotal;
        productMap.set(item.productId, existing);
      }
    }

    return Array.from(productMap.entries())
      .map(([productId, data]) => ({
        productId,
        totalQuantity: data.quantity,
        totalRevenue: data.revenue,
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, limit);
  }

  /**
   * Calculates product margins by comparing revenue vs ingredient cost.
   */
  async getProductMargins(
    storeId: string,
    startDate: string,
    endDate: string,
  ): Promise<ProductMargin[]> {
    const sales = await this.saleRepo.getByDateRange(storeId, startDate, endDate);

    // Aggregate revenue and portions per product
    const productData = new Map<string, { revenue: number; portions: number }>();
    for (const sale of sales) {
      for (const item of sale.items) {
        const existing = productData.get(item.productId) ?? { revenue: 0, portions: 0 };
        existing.revenue += item.subtotal;
        existing.portions += item.portions;
        productData.set(item.productId, existing);
      }
    }

    // Get product names
    const products = this.productRepo ? await this.productRepo.getAll() : [];
    const productNameMap = new Map(products.map((p) => [p.id, p.name]));

    // Get recipes for cost calculation
    const recipes = this.recipeRepo ? await this.recipeRepo.getAll() : [];
    const recipeByProduct = new Map(recipes.map((r) => [r.productId, r]));

    // Calculate average cost per gram from purchases
    const purchases = await this.purchaseRepo.getByDateRange(startDate, endDate);
    const supplyCost = new Map<string, { totalCost: number; totalGrams: number }>();
    for (const purchase of purchases) {
      const existing = supplyCost.get(purchase.supplyId) ?? { totalCost: 0, totalGrams: 0 };
      existing.totalCost += purchase.priceCOP;
      existing.totalGrams += purchase.quantityGrams;
      supplyCost.set(purchase.supplyId, existing);
    }

    const DEFAULT_COST_PER_GRAM = 5; // COP/gram fallback

    const results: ProductMargin[] = [];

    for (const [productId, data] of productData.entries()) {
      const recipe = recipeByProduct.get(productId);
      let costPerPortion = 0;

      if (recipe) {
        for (const ingredient of recipe.ingredients) {
          const sc = supplyCost.get(ingredient.supplyId);
          const costPerGram = sc && sc.totalGrams > 0
            ? sc.totalCost / sc.totalGrams
            : DEFAULT_COST_PER_GRAM;
          costPerPortion += ingredient.gramsPerPortion * costPerGram;
        }
      }

      const ingredientCost = costPerPortion * data.portions;
      const margin = data.revenue - ingredientCost;
      const marginPercent = data.revenue > 0 ? (margin / data.revenue) * 100 : 0;

      results.push({
        productId,
        productName: productNameMap.get(productId) ?? productId,
        revenue: Math.round(data.revenue),
        ingredientCost: Math.round(ingredientCost),
        margin: Math.round(margin),
        marginPercent: Math.round(marginPercent * 10) / 10,
        portionsSold: data.portions,
      });
    }

    return results.sort((a, b) => b.revenue - a.revenue);
  }
}
