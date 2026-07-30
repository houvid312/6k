import { CreditEntry, CreditPayment, DebtorType } from '../domain/entities';
import { ICreditRepository, IExpenseRepository, IIncomeRepository } from '../domain/interfaces/repositories';
import { PaymentMethod } from '../domain/enums';
import { todayColombia } from '../utils/dates';

export class CreditService {
  constructor(
    private creditRepo: ICreditRepository,
    private expenseRepo: IExpenseRepository,
    private incomeRepo: IIncomeRepository,
  ) {}

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
    saleId?: string,
    expenseId?: string,
    storeId?: string,
    customerId?: string,
  ): Promise<CreditEntry> {
    return this.creditRepo.create({
      date,
      debtorName,
      debtorType,
      workerId,
      customerId,
      storeId,
      saleId,
      expenseId,
      concept,
      amount,
      balance: amount,
      isPaid: false,
    } as Omit<CreditEntry, 'id'>);
  }

  /**
   * Registers a payment against a credit, reducing the balance.
   */
  async registerPayment(creditId: string, paymentAmount: number, notes: string = 'Abono manual'): Promise<CreditEntry> {
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
      notes,
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

  /**
   * Gets all payments for a specific credit.
   */
  async getPaymentsByCredit(creditId: string): Promise<CreditPayment[]> {
    return this.creditRepo.getPaymentsByCredit(creditId);
  }

  /**
   * Registers a payment from a local store for a transfer credit entry.
   * Creates an expense for the local, and a pending credit payment.
   */
  async registerLocalPayment(
    creditId: string,
    amount: number,
    paymentMethod: PaymentMethod,
    notes: string = 'Abono de traslado pendiente de confirmación',
  ): Promise<CreditPayment> {
    const all = await this.creditRepo.getAll();
    const credit = all.find((c) => c.id === creditId);
    if (!credit) {
      throw new Error(`Credit '${creditId}' not found`);
    }

    if (amount <= 0 || amount > credit.balance) {
      throw new Error(`El abono (${amount}) no es válido o supera el saldo (${credit.balance})`);
    }

    // 1. Crear el egreso para el local
    const expense = await this.expenseRepo.create({
      storeId: credit.storeId || '',
      date: todayColombia(),
      category: 'Traslado',
      description: `Pago traslado (Pendiente confirmación) - Ref: ${credit.concept}`,
      amount: amount,
      paymentMethod: paymentMethod,
      isFixed: false,
    });

    // 2. Crear el registro del abono con estado PENDING y el expenseId asociado
    const payment = await this.creditRepo.applyPayment({
      creditEntryId: creditId,
      workerId: credit.workerId,
      storeId: credit.storeId,
      amount: amount,
      date: todayColombia(),
      source: 'MANUAL',
      notes,
      paymentMethod,
      status: 'PENDING',
      expenseId: expense.id,
    });

    return payment;
  }

  /**
   * Confirms a pending local payment.
   * Subtracts the payment amount from the credit balance and creates an income for the production center.
   */
  async confirmLocalPayment(paymentId: string): Promise<CreditPayment> {
    const payment = await this.creditRepo.getPaymentById(paymentId);
    if (!payment) {
      throw new Error(`Payment '${paymentId}' not found`);
    }

    if (payment.status !== 'PENDING') {
      throw new Error(`El pago ya está en estado '${payment.status}' y no se puede confirmar`);
    }

    const allCredits = await this.creditRepo.getAll();
    const credit = allCredits.find((c) => c.id === payment.creditEntryId);
    if (!credit) {
      throw new Error(`Credit '${payment.creditEntryId}' not found`);
    }

    // 1. Crear el ingreso para el Centro de Producción (tienda de origen)
    // El id del Centro de Producción es '00000000-0000-0000-0000-000000000001'
    const PROD_CENTER_ID = '00000000-0000-0000-0000-000000000001';
    const income = await this.incomeRepo.create({
      storeId: PROD_CENTER_ID,
      date: todayColombia(),
      category: 'Traslado',
      description: `Cobro traslado confirmado de ${credit.debtorName} - Ref: ${credit.concept}`,
      amount: payment.amount,
      paymentMethod: payment.paymentMethod || PaymentMethod.TRANSFERENCIA,
    });

    // 2. Actualizar estado del pago a CONFIRMED y asociar el incomeId
    const updatedPayment = await this.creditRepo.updatePaymentStatus(
      paymentId,
      'CONFIRMED',
      income.id,
    );

    // 3. Descontar el saldo de la deuda
    const newBalance = Math.max(0, credit.balance - payment.amount);
    await this.creditRepo.updateBalance(credit.id, newBalance);

    return updatedPayment;
  }

  /**
   * Rejects a pending local payment.
   * Sets status to REJECTED and deletes the associated expense in the local store.
   */
  async rejectLocalPayment(paymentId: string): Promise<CreditPayment> {
    const payment = await this.creditRepo.getPaymentById(paymentId);
    if (!payment) {
      throw new Error(`Payment '${paymentId}' not found`);
    }

    if (payment.status !== 'PENDING') {
      throw new Error(`El pago ya está en estado '${payment.status}' y no se puede rechazar`);
    }

    // 1. Eliminar el egreso asociado si existe
    if (payment.expenseId) {
      try {
        await this.expenseRepo.delete(payment.expenseId);
      } catch (err) {
        console.error('Error deleting associated expense:', err);
      }
    }

    // 2. Actualizar estado del pago a REJECTED
    const updatedPayment = await this.creditRepo.updatePaymentStatus(paymentId, 'REJECTED');

    return updatedPayment;
  }
}
