import { PayrollEntry } from '../domain/entities';
import { IWorkerRepository, IAttendanceRepository, ICreditRepository } from '../domain/interfaces/repositories';

export interface PayrollReport {
  periodStart: string;
  periodEnd: string;
  entries: PayrollEntry[];
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
}

export class PayrollService {
  constructor(
    private workerRepo: IWorkerRepository,
    private attendanceRepo: IAttendanceRepository,
    private creditRepo: ICreditRepository,
  ) {}

  /**
   * Calculates payroll for all workers based on attendance in a date range.
   */
  async calculatePayroll(
    startDate: string,
    endDate: string,
  ): Promise<PayrollEntry[]> {
    const workers = await this.workerRepo.getAll();
    const activeWorkers = workers.filter((w) => w.isActive);
    const entries: PayrollEntry[] = [];

    for (const worker of activeWorkers) {
      const attendance = await this.attendanceRepo.getByWorkerDateRange(
        worker.id,
        startDate,
        endDate,
      );

      const totalHours = attendance.reduce((sum, a) => sum + a.actualHours, 0);
      const grossPay = totalHours * worker.hourlyRate;

      entries.push({
        id: `payroll-${worker.id}-${startDate}`,
        periodStart: startDate,
        periodEnd: endDate,
        workerId: worker.id,
        totalHours,
        grossPay,
        deductions: 0,
        netPay: grossPay,
      });
    }

    return entries;
  }

  /**
   * Applies credit deductions to payroll entries.
   */
  async applyDeductions(entries: PayrollEntry[]): Promise<PayrollEntry[]> {
    const result: PayrollEntry[] = [];

    for (const entry of entries) {
      const activeCredits = await this.creditRepo.getActiveByWorker(entry.workerId);
      const totalDebt = activeCredits.reduce((sum, c) => sum + c.balance, 0);
      const deduction = Math.min(totalDebt, entry.grossPay);

      result.push({
        ...entry,
        deductions: deduction,
        netPay: entry.grossPay - deduction,
      });
    }

    return result;
  }

  /**
   * Generates a complete payroll report with deductions applied.
   */
  async generateReport(startDate: string, endDate: string): Promise<PayrollReport> {
    const rawEntries = await this.calculatePayroll(startDate, endDate);
    const entries = await this.applyDeductions(rawEntries);

    const totalGross = entries.reduce((sum, e) => sum + e.grossPay, 0);
    const totalDeductions = entries.reduce((sum, e) => sum + e.deductions, 0);
    const totalNet = entries.reduce((sum, e) => sum + e.netPay, 0);

    return {
      periodStart: startDate,
      periodEnd: endDate,
      entries,
      totalGross,
      totalDeductions,
      totalNet,
    };
  }
}
