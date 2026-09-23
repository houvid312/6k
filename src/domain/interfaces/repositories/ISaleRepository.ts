import { Sale } from '../../entities/Sale';

export interface DailySummary {
  totalPortions: number;
  totalAmount: number;
  totalCashAmount: number;
  totalBankAmount: number;
  totalCreditAmount: number;
  salesCount: number;
}

export interface DashboardMetrics {
  totalUnits: number;
  totalPesos: number;
  dailyAvgUnits: number;
  dailyAvgPesos: number;
  pizzaDistribution: Record<string, { units: number; pesos: number }>;
  beverageDistribution: Record<string, { units: number; pesos: number }>;
  otherDistribution: Record<string, { units: number; pesos: number }>;
  monthlyDistribution: Record<string, { units: number; pesos: number }>;
}

export interface AccountingPnL {
  netSales: number;
  cogsTotal: number;
  grossProfit: number;
  fixedExpenses: number;
  variableExpenses: number;
  payrollAdvances: number;
  operationalProfit: number;
  cashSales: number;
  bankSales: number;
}

export interface ISaleRepository {
  getAll(storeId?: string): Promise<Sale[]>;
  getById(id: string): Promise<Sale | null>;
  getByDateRange(storeId: string, from: string, to: string, limit?: number): Promise<Sale[]>;
  getDailyLedgerSales(storeId: string, from: string, to: string): Promise<{sales_date: string, cash_sales: number, bank_sales: number}[]>;
  getUnpaid(storeId: string): Promise<Sale[]>;
  create(sale: Omit<Sale, 'id'>): Promise<Sale>;
  update(sale: Sale): Promise<Sale>;
  markAsPaid(saleId: string): Promise<void>;
  markAsUnpaid(saleId: string): Promise<void>;
  updatePaymentMethod(saleId: string, paymentMethod: string): Promise<void>;
  markAsDispatched(saleId: string): Promise<void>;
  delete(saleId: string): Promise<void>;
  getDailySummary(storeId: string, date: string): Promise<DailySummary>;
  getDashboardMetrics(storeId: string, startDate: string, endDate: string): Promise<DashboardMetrics>;
  getAccountingPnL(storeId: string, startDate: string, endDate: string): Promise<AccountingPnL>;
}
