import { CashClosing, DenominationCount } from '../domain/entities';
import { ICashClosingRepository, ISaleRepository, IExpenseRepository } from '../domain/interfaces/repositories';
import { AlertService } from './AlertService';

/** Denomination values matching the DenominationCount keys. */
const DENOMINATION_VALUES: Record<keyof DenominationCount, number> = {
  bills100k: 100000,
  bills50k: 50000,
  bills20k: 20000,
  bills10k: 10000,
  bills5k: 5000,
  bills2k: 2000,
  coins: 1,
};

export class CashClosingService {
  constructor(
    private cashClosingRepo: ICashClosingRepository,
    private saleRepo: ISaleRepository,
    private expenseRepo: IExpenseRepository,
    private alertService?: AlertService,
  ) {}

  /**
   * Calculates total cash from denomination counts.
   */
  calculateDenominationTotal(denominations: DenominationCount): number {
    let total = 0;
    for (const [key, value] of Object.entries(DENOMINATION_VALUES)) {
      total += (denominations[key as keyof DenominationCount] ?? 0) * value;
    }
    return total;
  }

  /**
   * Creates a cash closing with auto-calculated discrepancy.
   */
  async createClosing(
    storeId: string,
    date: string,
    denominations: DenominationCount,
    bankTotal: number,
    expenses: number,
  ): Promise<CashClosing> {
    const cashTotal = this.calculateDenominationTotal(denominations);
    const actualTotal = cashTotal + bankTotal;

    // Expected total from sales
    const summary = await this.saleRepo.getDailySummary(storeId, date);
    const expectedTotal = summary.totalAmount;

    const discrepancy = actualTotal - (expectedTotal - expenses);

    const closing = await this.cashClosingRepo.create({
      storeId,
      date,
      denominations,
      bankTotal,
      expectedTotal,
      actualTotal,
      discrepancy,
      expenses,
    } as Omit<CashClosing, 'id'>);

    // Trigger inventory validation after cash closing
    if (this.alertService) {
      try {
        await this.alertService.triggerPostClosingValidation(storeId, date);
      } catch {
        // Don't fail the cash closing if alert generation fails
      }
    }

    return closing;
  }

  /**
   * Gets expected totals from daily sales.
   */
  async getDailyExpected(storeId: string, date: string) {
    return this.saleRepo.getDailySummary(storeId, date);
  }

  /**
   * Gets a cash closing by store and date.
   */
  async getClosingByDate(storeId: string, date: string): Promise<CashClosing | null> {
    return this.cashClosingRepo.getByDate(storeId, date);
  }

  /**
   * Gets all closings for a store in a date range.
   */
  async getClosingsByDateRange(
    storeId: string,
    from: string,
    to: string,
  ): Promise<CashClosing[]> {
    return this.cashClosingRepo.getByDateRange(storeId, from, to);
  }
}
