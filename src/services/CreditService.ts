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
  async registerPayment(
    creditId: string,
    paymentAmount: number,
    paymentMethod: PaymentMethod = PaymentMethod.EFECTIVO,
    notes: string = 'Abono manual',
  ): Promise<CreditEntry> {
    const all = await this.creditRepo.getAll();
    const credit = all.find((c) => c.id === creditId);
    if (!credit) {
      throw new Error(`Credit '${creditId}' not found`);
    }

    if (!credit.storeId) {
      throw new Error(`Credit '${creditId}' does not have an associated storeId`);
    }

    const income = await this.incomeRepo.create({
      storeId: credit.storeId,
      date: todayColombia(),
      category: 'Abono Cartera',
      description: `Abono de cartera (${credit.concept}) - ${paymentMethod === PaymentMethod.TRANSFERENCIA ? 'Bancos / Transferencia' : 'Efectivo'}`,
      amount: paymentAmount,
      paymentMethod,
    });

    await this.creditRepo.applyPayment({
      creditEntryId: creditId,
      workerId: credit.workerId,
      storeId: credit.storeId,
      amount: paymentAmount,
      date: todayColombia(),
      source: 'MANUAL',
      notes,
      paymentMethod,
      incomeId: income.id,
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

  /**
   * Gets all payments for a set of credit IDs.
   */
  async getPaymentsByCreditIds(creditIds: string[]): Promise<CreditPayment[]> {
    return this.creditRepo.getPaymentsByCreditIds(creditIds);
  }

  /**
   * Registers a payment distributed across multiple credits from a local store for transfer debts.
   * Creates 1 consolidated expense (or 2 if mixed), and distributes the payment across selected credits.
   */
  async registerMultipleLocalPayments(params: {
    creditIds: string[];
    paymentMethod: PaymentMethod | 'MIXTO';
    paymentAmount: number;
    cashPart?: number;
    bankPart?: number;
    notes?: string;
  }): Promise<CreditPayment[]> {
    const { creditIds, paymentMethod, paymentAmount, cashPart = 0, bankPart = 0, notes } = params;
    if (!creditIds || creditIds.length === 0) {
      throw new Error('Debes seleccionar al menos un crédito para realizar el pago');
    }

    const allCredits = await this.creditRepo.getAll();
    const credits = creditIds
      .map((id) => allCredits.find((c) => c.id === id))
      .filter((c): c is CreditEntry => c !== undefined && !c.isPaid && c.balance > 0)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); // FIFO (más antiguo primero)

    if (credits.length === 0) {
      throw new Error('No se encontraron créditos pendientes activos para los IDs seleccionados');
    }

    const storeId = credits[0].storeId;
    if (!storeId) {
      throw new Error('Los créditos no tienen una sede asociada');
    }

    const totalBalance = credits.reduce((sum, c) => sum + c.balance, 0);
    const totalToPay = paymentMethod === 'MIXTO' ? cashPart + bankPart : paymentAmount;

    if (totalToPay <= 0) {
      throw new Error('El monto a pagar debe ser mayor a cero');
    }
    if (totalToPay > totalBalance) {
      throw new Error(`El monto a pagar (${totalToPay}) supera el saldo total de los créditos seleccionados (${totalBalance})`);
    }

    const refs = credits
      .map((c) => c.concept.replace(/Cobro interno traslado\s*/i, '#'))
      .join(', ');

    // 1. Crear egreso(s) consolidado(s) en la sede
    let expenseCashId: string | undefined;
    let expenseBankId: string | undefined;
    let singleExpenseId: string | undefined;

    if (paymentMethod === 'MIXTO') {
      if (cashPart > 0) {
        const expCash = await this.expenseRepo.create({
          storeId,
          date: todayColombia(),
          category: 'Traslado',
          description: `Pago traslados Efectivo (Pendiente confirmación) - Refs: ${refs}`,
          amount: cashPart,
          paymentMethod: PaymentMethod.EFECTIVO,
          isFixed: false,
        });
        expenseCashId = expCash.id;
      }
      if (bankPart > 0) {
        const expBank = await this.expenseRepo.create({
          storeId,
          date: todayColombia(),
          category: 'Traslado',
          description: `Pago traslados Transferencia (Pendiente confirmación) - Refs: ${refs}`,
          amount: bankPart,
          paymentMethod: PaymentMethod.TRANSFERENCIA,
          isFixed: false,
        });
        expenseBankId = expBank.id;
      }
    } else {
      const singleExp = await this.expenseRepo.create({
        storeId,
        date: todayColombia(),
        category: 'Traslado',
        description: `Pago traslados ${paymentMethod === PaymentMethod.TRANSFERENCIA ? 'Bancos' : 'Efectivo'} (Pendiente confirmación) - Refs: ${refs}`,
        amount: totalToPay,
        paymentMethod: paymentMethod as PaymentMethod,
        isFixed: false,
      });
      singleExpenseId = singleExp.id;
    }

    // 2. Distribuir el pago en los créditos (FIFO)
    const payments: CreditPayment[] = [];

    if (paymentMethod === 'MIXTO') {
      let remCash = cashPart;
      let remBank = bankPart;

      for (const credit of credits) {
        let need = credit.balance;

        if (remCash > 0 && need > 0) {
          const alloc = Math.min(need, remCash);
          const p = await this.creditRepo.applyPayment({
            creditEntryId: credit.id,
            workerId: credit.workerId,
            storeId: credit.storeId,
            amount: alloc,
            date: todayColombia(),
            source: 'MANUAL',
            notes: notes || `Abono Efectivo (Pago consolidado refs: ${refs})`,
            paymentMethod: PaymentMethod.EFECTIVO,
            status: 'PENDING',
            expenseId: expenseCashId,
          });
          payments.push(p);
          remCash -= alloc;
          need -= alloc;
        }

        if (remBank > 0 && need > 0) {
          const alloc = Math.min(need, remBank);
          const p = await this.creditRepo.applyPayment({
            creditEntryId: credit.id,
            workerId: credit.workerId,
            storeId: credit.storeId,
            amount: alloc,
            date: todayColombia(),
            source: 'MANUAL',
            notes: notes || `Abono Transferencia (Pago consolidado refs: ${refs})`,
            paymentMethod: PaymentMethod.TRANSFERENCIA,
            status: 'PENDING',
            expenseId: expenseBankId,
          });
          payments.push(p);
          remBank -= alloc;
          need -= alloc;
        }

        if (remCash <= 0 && remBank <= 0) break;
      }
    } else {
      let remaining = totalToPay;

      for (const credit of credits) {
        if (remaining <= 0) break;
        const alloc = Math.min(credit.balance, remaining);
        if (alloc > 0) {
          const p = await this.creditRepo.applyPayment({
            creditEntryId: credit.id,
            workerId: credit.workerId,
            storeId: credit.storeId,
            amount: alloc,
            date: todayColombia(),
            source: 'MANUAL',
            notes: notes || `Abono traslado (Pago consolidado refs: ${refs})`,
            paymentMethod: paymentMethod as PaymentMethod,
            status: 'PENDING',
            expenseId: singleExpenseId,
          });
          payments.push(p);
          remaining -= alloc;
        }
      }
    }

    return payments;
  }

  /**
   * Registers a payment distributed across multiple standard credits (workers, customers).
   */
  async registerMultiplePayments(params: {
    creditIds: string[];
    paymentMethod: PaymentMethod | 'MIXTO';
    paymentAmount: number;
    cashPart?: number;
    bankPart?: number;
    notes?: string;
  }): Promise<CreditPayment[]> {
    const { creditIds, paymentMethod, paymentAmount, cashPart = 0, bankPart = 0, notes } = params;
    if (!creditIds || creditIds.length === 0) {
      throw new Error('Debes seleccionar al menos un crédito');
    }

    const allCredits = await this.creditRepo.getAll();
    const credits = creditIds
      .map((id) => allCredits.find((c) => c.id === id))
      .filter((c): c is CreditEntry => c !== undefined && !c.isPaid && c.balance > 0)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (credits.length === 0) {
      throw new Error('No se encontraron créditos activos');
    }

    const storeId = credits[0].storeId;
    if (!storeId) {
      throw new Error('Los créditos no tienen una sede asociada');
    }

    const totalBalance = credits.reduce((sum, c) => sum + c.balance, 0);
    const totalToPay = paymentMethod === 'MIXTO' ? cashPart + bankPart : paymentAmount;

    if (totalToPay <= 0 || totalToPay > totalBalance) {
      throw new Error(`El abono (${totalToPay}) no es válido o supera el saldo (${totalBalance})`);
    }

    // 1. Crear ingreso(s) en la sede
    let incomeCashId: string | undefined;
    let incomeBankId: string | undefined;
    let singleIncomeId: string | undefined;

    if (paymentMethod === 'MIXTO') {
      if (cashPart > 0) {
        const inc = await this.incomeRepo.create({
          storeId,
          date: todayColombia(),
          category: 'Abono Cartera',
          description: `Abono de cartera consolidado Efectivo (${credits.length} créditos)`,
          amount: cashPart,
          paymentMethod: PaymentMethod.EFECTIVO,
        });
        incomeCashId = inc.id;
      }
      if (bankPart > 0) {
        const inc = await this.incomeRepo.create({
          storeId,
          date: todayColombia(),
          category: 'Abono Cartera',
          description: `Abono de cartera consolidado Transferencia (${credits.length} créditos)`,
          amount: bankPart,
          paymentMethod: PaymentMethod.TRANSFERENCIA,
        });
        incomeBankId = inc.id;
      }
    } else {
      const inc = await this.incomeRepo.create({
        storeId,
        date: todayColombia(),
        category: 'Abono Cartera',
        description: `Abono de cartera consolidado (${credits.length} créditos)`,
        amount: totalToPay,
        paymentMethod: paymentMethod as PaymentMethod,
      });
      singleIncomeId = inc.id;
    }

    // 2. Distribuir a los créditos
    const payments: CreditPayment[] = [];
    let remCash = cashPart;
    let remBank = bankPart;
    let remaining = totalToPay;

    for (const credit of credits) {
      let need = credit.balance;

      if (paymentMethod === 'MIXTO') {
        if (remCash > 0 && need > 0) {
          const alloc = Math.min(need, remCash);
          const p = await this.creditRepo.applyPayment({
            creditEntryId: credit.id,
            workerId: credit.workerId,
            storeId: credit.storeId,
            amount: alloc,
            date: todayColombia(),
            source: 'MANUAL',
            notes: notes || 'Abono manual en Efectivo (Parte de pago consolidado)',
            paymentMethod: PaymentMethod.EFECTIVO,
            incomeId: incomeCashId,
          });
          payments.push(p);
          remCash -= alloc;
          need -= alloc;
        }

        if (remBank > 0 && need > 0) {
          const alloc = Math.min(need, remBank);
          const p = await this.creditRepo.applyPayment({
            creditEntryId: credit.id,
            workerId: credit.workerId,
            storeId: credit.storeId,
            amount: alloc,
            date: todayColombia(),
            source: 'MANUAL',
            notes: notes || 'Abono manual por Transferencia (Parte de pago consolidado)',
            paymentMethod: PaymentMethod.TRANSFERENCIA,
            incomeId: incomeBankId,
          });
          payments.push(p);
          remBank -= alloc;
          need -= alloc;
        }

        if (remCash <= 0 && remBank <= 0) break;
      } else {
        if (remaining <= 0) break;
        const alloc = Math.min(need, remaining);
        if (alloc > 0) {
          const p = await this.creditRepo.applyPayment({
            creditEntryId: credit.id,
            workerId: credit.workerId,
            storeId: credit.storeId,
            amount: alloc,
            date: todayColombia(),
            source: 'MANUAL',
            notes: notes || 'Abono manual consolidado',
            paymentMethod: paymentMethod as PaymentMethod,
            incomeId: singleIncomeId,
          });
          payments.push(p);
          remaining -= alloc;
        }
      }
    }

    return payments;
  }

  /**
   * Confirms multiple pending local payments in batch.
   */
  async confirmMultipleLocalPayments(paymentIds: string[]): Promise<CreditPayment[]> {
    const results: CreditPayment[] = [];
    for (const pid of paymentIds) {
      const res = await this.confirmLocalPayment(pid);
      results.push(res);
    }
    return results;
  }

  /**
   * Deletes a payment that was previously rejected, cleaning up the history.
   */
  async deleteRejectedPayment(paymentId: string): Promise<void> {
    const payment = await this.creditRepo.getPaymentById(paymentId);
    if (!payment) {
      throw new Error(`Payment '${paymentId}' not found`);
    }

    if (payment.status !== 'REJECTED') {
      throw new Error('Solo se pueden eliminar abonos que hayan sido rechazados');
    }

    await this.creditRepo.deletePayment(paymentId);
  }
}

