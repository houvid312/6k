import { Attendance, PayrollEntry, PayrollPeriod, PeriodStatus, PeriodType, Worker } from '../domain/entities';
import { PaymentMethod } from '../domain/enums';
import {
  IAttendanceRepository,
  ICreditRepository,
  IExpenseRepository,
  IPayrollRepository,
  IWorkerRepository,
} from '../domain/interfaces/repositories';
import { todayColombia } from '../utils/dates';

export interface PayrollReport {
  storeId: string;
  periodType: PeriodType;
  periodStart: string;
  periodEnd: string;
  status: PeriodStatus;
  periodId?: string;
  entries: PayrollEntry[];
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
}

export type PayrollDeductionOverrides = Record<string, number>;

export class PayrollService {
  constructor(
    private workerRepo: IWorkerRepository,
    private attendanceRepo: IAttendanceRepository,
    private creditRepo: ICreditRepository,
    private payrollRepo: IPayrollRepository,
    private expenseRepo: IExpenseRepository,
  ) {}

  async calculatePayroll(
    storeId: string,
    startDate: string,
    endDate: string,
    deductionOverrides: PayrollDeductionOverrides = {},
  ): Promise<PayrollEntry[]> {
    const [workers, attendance] = await Promise.all([
      this.workerRepo.getByStore(storeId),
      this.attendanceRepo.getByStoreDateRange(storeId, startDate, endDate),
    ]);
    const workerMap = new Map(workers.map((worker) => [worker.id, worker]));
    const attendanceByWorker = new Map<string, Attendance[]>();

    for (const record of attendance) {
      if (record.status === 'DRAFT' || record.actualHours <= 0) continue;
      const workerRecords = attendanceByWorker.get(record.workerId) ?? [];
      workerRecords.push(record);
      attendanceByWorker.set(record.workerId, workerRecords);
    }

    const entries: PayrollEntry[] = [];
    for (const [workerId, workerAttendance] of attendanceByWorker) {
      const worker = workerMap.get(workerId);
      if (!worker) continue;
      const totalHours = roundHours(workerAttendance.reduce((sum, record) => sum + record.actualHours, 0));
      const grossPay = workerAttendance.reduce((sum, record) => sum + record.subtotal, 0);
      const activeCredits = await this.creditRepo.getActiveByWorker(workerId);
      const activeDebt = activeCredits.reduce((sum, credit) => sum + credit.balance, 0);
      const defaultDeduction = Math.min(activeDebt, grossPay);
      const requestedDeduction = deductionOverrides[workerId] ?? defaultDeduction;
      const debtDeduction = Math.max(0, Math.min(requestedDeduction, activeDebt, grossPay));
      const unplannedCount = workerAttendance.filter((record) => record.isUnplanned).length;

      entries.push({
        id: `payroll-${storeId}-${workerId}-${startDate}`,
        periodStart: startDate,
        periodEnd: endDate,
        workerId,
        storeId,
        totalHours,
        hourlyRate: resolveEntryRate(worker, workerAttendance),
        grossPay,
        activeDebt,
        debtDeduction,
        debtCreditIds: activeCredits.map((credit) => credit.id),
        attendanceIds: workerAttendance.map((record) => record.id),
        deductions: debtDeduction,
        netPay: grossPay - debtDeduction,
        notes: unplannedCount > 0 ? `${unplannedCount} turno(s) sin horario` : undefined,
      });
    }

    return entries.sort((a, b) => a.workerId.localeCompare(b.workerId));
  }

  async generateReport(
    storeId: string,
    periodType: PeriodType,
    startDate: string,
    endDate: string,
    deductionOverrides?: PayrollDeductionOverrides,
  ): Promise<PayrollReport> {
    const existingPeriod = await this.payrollRepo.getPeriod(storeId, periodType, startDate, endDate);
    if (existingPeriod?.status === 'CERRADA' || existingPeriod?.status === 'PAGADA') {
      return this.buildReportFromPeriod(existingPeriod);
    }

    const persistedEntries = existingPeriod ? await this.payrollRepo.getEntries(existingPeriod.id) : [];
    const persistedDeductions = Object.fromEntries(
      persistedEntries.map((entry) => [entry.workerId, entry.debtDeduction]),
    );
    const entries = await this.calculatePayroll(
      storeId,
      startDate,
      endDate,
      deductionOverrides ?? persistedDeductions,
    );

    return this.buildReport({
      storeId,
      periodType,
      periodStart: startDate,
      periodEnd: endDate,
      status: existingPeriod?.status ?? 'BORRADOR',
      periodId: existingPeriod?.id,
      entries,
    });
  }

  async saveReport(report: PayrollReport, status: PeriodStatus = 'BORRADOR'): Promise<PayrollPeriod> {
    if (report.status === 'PAGADA') {
      throw new Error('La nomina ya esta pagada y no se puede modificar');
    }

    const normalizedReport = this.buildReport({ ...report, status });
    return this.payrollRepo.savePeriod({
      storeId: normalizedReport.storeId,
      periodType: normalizedReport.periodType,
      startDate: normalizedReport.periodStart,
      endDate: normalizedReport.periodEnd,
      status,
      totalGross: normalizedReport.totalGross,
      totalDeductions: normalizedReport.totalDeductions,
      totalNet: normalizedReport.totalNet,
    }, normalizedReport.entries.map(({ id: _id, ...entry }) => entry));
  }

  async payReport(report: PayrollReport): Promise<PayrollPeriod> {
    if (report.status === 'PAGADA' && report.periodId) {
      const paidPeriod = await this.payrollRepo.getPeriodById(report.periodId);
      if (paidPeriod) return paidPeriod;
    }

    const closedPeriod = report.periodId
      ? await this.saveReport(report, 'CERRADA')
      : await this.saveReport(report, 'CERRADA');
    const entries = await this.payrollRepo.getEntries(closedPeriod.id);
    const paymentDate = todayColombia();

    const expense = await this.expenseRepo.create({
      storeId: report.storeId,
      date: paymentDate,
      category: 'Nomina',
      description: `Nomina ${report.periodStart} a ${report.periodEnd}`,
      amount: closedPeriod.totalGross,
      paymentMethod: PaymentMethod.EFECTIVO,
    });

    for (const entry of entries) {
      await this.applyDebtDeduction(entry, closedPeriod, paymentDate);
    }

    return this.payrollRepo.markPaid(closedPeriod.id, expense.id);
  }

  private async buildReportFromPeriod(period: PayrollPeriod): Promise<PayrollReport> {
    const entries = await this.payrollRepo.getEntries(period.id);
    return this.buildReport({
      storeId: period.storeId ?? '',
      periodType: period.periodType,
      periodStart: period.startDate,
      periodEnd: period.endDate,
      status: period.status,
      periodId: period.id,
      entries,
    });
  }

  private buildReport(input: Omit<PayrollReport, 'totalGross' | 'totalDeductions' | 'totalNet'>): PayrollReport {
    const totalGross = input.entries.reduce((sum, entry) => sum + entry.grossPay, 0);
    const totalDeductions = input.entries.reduce((sum, entry) => sum + entry.deductions, 0);
    const totalNet = input.entries.reduce((sum, entry) => sum + entry.netPay, 0);
    return {
      ...input,
      totalGross,
      totalDeductions,
      totalNet,
    };
  }

  private async applyDebtDeduction(
    entry: PayrollEntry,
    period: PayrollPeriod,
    paymentDate: string,
  ): Promise<void> {
    let remaining = entry.debtDeduction;
    if (remaining <= 0) return;

    const activeCredits = await this.creditRepo.getActiveByWorker(entry.workerId);
    const orderedCredits = activeCredits
      .filter((credit) => entry.debtCreditIds.length === 0 || entry.debtCreditIds.includes(credit.id))
      .sort((a, b) => a.date.localeCompare(b.date));

    for (const credit of orderedCredits) {
      if (remaining <= 0) break;
      const amount = Math.min(remaining, credit.balance);
      await this.creditRepo.applyPayment({
        creditEntryId: credit.id,
        workerId: entry.workerId,
        storeId: period.storeId,
        payrollPeriodId: period.id,
        payrollEntryId: entry.id,
        amount,
        date: paymentDate,
        source: 'PAYROLL',
        notes: `Descuento de nomina ${period.startDate} a ${period.endDate}`,
      });
      remaining -= amount;
    }
  }
}

function roundHours(hours: number): number {
  return Math.round(hours * 100) / 100;
}

function resolveEntryRate(worker: Worker, attendance: Attendance[]): number {
  if (attendance.length === 0) return worker.hourlyRate;
  const rate = attendance[0].hourlyRate;
  return attendance.every((record) => record.hourlyRate === rate) ? rate : worker.hourlyRate;
}
