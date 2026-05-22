import { CreditEntry, DebtorType } from '../domain/entities';
import { ICreditRepository } from '../domain/interfaces/repositories';
import { todayColombia } from '../utils/dates';

export class CreditService {
  constructor(private creditRepo: ICreditRepository) {}

  /**
   * Creates a new credit entry.
   */
  async createCredit(
    debtorName: string,
    debtorType: DebtorType,
    concept: string,
    amount: number,
    date: string,
    workerId?: string,
  ): Promise<CreditEntry> {
    return this.creditRepo.create({
      date,
      debtorName,
      debtorType,
      workerId,
      concept,
      amount,
      balance: amount,
      isPaid: false,
    } as Omit<CreditEntry, 'id'>);
  }

  /**
   * Registers a payment against a credit, reducing the balance.
   */
  async registerPayment(creditId: string, paymentAmount: number): Promise<CreditEntry> {
    const all = await this.creditRepo.getAll();
    const credit = all.find((c) => c.id === creditId);
    if (!credit) {
      throw new Error(`Credit '${creditId}' not found`);
    }

    await this.creditRepo.applyPayment({
      creditEntryId: creditId,
      workerId: credit.workerId,
      storeId: credit.storeId,
      amount: paymentAmount,
      date: todayColombia(),
      source: 'MANUAL',
      notes: 'Abono manual',
    });

    const updated = (await this.creditRepo.getAll()).find((c) => c.id === creditId);
    if (!updated) {
      throw new Error(`Credit '${creditId}' not found after payment`);
    }
    return updated;
  }

  /**
   * Gets total outstanding balance for a worker.
   */
  async getBalance(workerId: string): Promise<number> {
    const credits = await this.creditRepo.getActiveByWorker(workerId);
    return credits.reduce((sum, c) => sum + c.balance, 0);
  }

  /**
   * Gets all active (unpaid) debts for a worker.
   */
  async getActiveDebts(workerId: string): Promise<CreditEntry[]> {
    return this.creditRepo.getActiveByWorker(workerId);
  }

  /**
   * Gets all credits by debtor name.
   */
  async getCreditsByDebtor(debtorName: string): Promise<CreditEntry[]> {
    return this.creditRepo.getByDebtor(debtorName);
  }

  /**
   * Gets all credits.
   */
  async getAllCredits(): Promise<CreditEntry[]> {
    return this.creditRepo.getAll();
  }
}
