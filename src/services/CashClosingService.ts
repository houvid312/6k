import { CashClosing, DenominationCount } from '../domain/entities';
import { ClosingStatus } from '../domain/enums';
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
   * Creates a cash closing in DRAFT status with auto-calculated discrepancy.
   * Generates alerts immediately so they can be reviewed.
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
      status: ClosingStatus.DRAFT,
    } as Omit<CashClosing, 'id'>);

    // Generate alerts for review
    await this.generateAlerts(storeId, date);

    return closing;
  }

  /**
   * Updates a closing (only allowed in DRAFT or CONFIRMED status).
   * Recalculates discrepancy and regenerates alerts.
   */
  async updateClosing(
    id: string,
    storeId: string,
    date: string,
    denominations: DenominationCount,
    bankTotal: number,
    expenses: number,
  ): Promise<CashClosing> {
    const existing = await this.cashClosingRepo.getByDate(storeId, date);
    if (!existing) throw new Error('Cierre no encontrado');
    if (existing.status === ClosingStatus.APPROVED) {
      throw new Error('No se puede editar un cierre aprobado');
    }

    const cashTotal = this.calculateDenominationTotal(denominations);
    const actualTotal = cashTotal + bankTotal;

    const summary = await this.saleRepo.getDailySummary(storeId, date);
    const expectedTotal = summary.totalAmount;
    const discrepancy = actualTotal - (expectedTotal - expenses);

    const closing = await this.cashClosingRepo.update(id, {
      denominations,
      bankTotal,
      expectedTotal,
      actualTotal,
      discrepancy,
      expenses,
    });

    // Regenerate alerts with updated data
    await this.generateAlerts(storeId, date);

    return closing;
  }

  /**
   * Collaborator confirms the closing.
   */
  async confirmClosing(id: string, workerId: string): Promise<CashClosing> {
    return this.cashClosingRepo.updateStatus(id, ClosingStatus.CONFIRMED, workerId);
  }

  /**
   * Admin returns closing to DRAFT for corrections.
   */
  async returnToDraft(id: string): Promise<CashClosing> {
    return this.cashClosingRepo.updateStatus(id, ClosingStatus.DRAFT);
  }

  /**
   * Admin approves the closing (locks it).
   */
  async approveClosing(id: string, workerId: string): Promise<CashClosing> {
    return this.cashClosingRepo.updateStatus(id, ClosingStatus.APPROVED, workerId);
  }

  /**
   * Regenerates alerts for a given store and date.
   * Can be called independently from the validaciones screen.
   */
  async regenerateAlerts(storeId: string, date: string): Promise<void> {
    await this.generateAlerts(storeId, date);
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

  // --- Private ---

  private async generateAlerts(storeId: string, date: string): Promise<void> {
    if (!this.alertService) return;
    try {
      await this.alertService.triggerPostClosingValidation(storeId, date);
    } catch {
      // Don't fail the cash closing if alert generation fails
    }
  }
}
