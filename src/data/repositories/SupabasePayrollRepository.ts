import { supabase } from '../../lib/supabase';
import { PayrollEntry, PayrollPeriod, PeriodStatus, PeriodType } from '../../domain/entities';
import { IPayrollRepository, SavePayrollPeriodInput } from '../../domain/interfaces/repositories';

interface PayrollPeriodRow {
  id: string;
  store_id: string | null;
  period_type: string;
  start_date: string;
  end_date: string;
  status: string;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  closed_at: string | null;
  paid_at: string | null;
  expense_id: string | null;
  notes: string | null;
  created_at: string;
}

interface PayrollEntryRow {
  id: string;
  period_id: string | null;
  period_start: string;
  period_end: string;
  worker_id: string;
  store_id: string | null;
  total_hours: number;
  hourly_rate: number;
  gross_pay: number;
  active_debt: number;
  debt_deduction: number;
  debt_credit_ids: string[] | null;
  attendance_ids: string[] | null;
  deductions: number;
  net_pay: number;
  notes: string | null;
}

function periodToEntity(row: PayrollPeriodRow): PayrollPeriod {
  return {
    id: row.id,
    storeId: row.store_id ?? undefined,
    periodType: row.period_type as PeriodType,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status as PeriodStatus,
    totalGross: row.total_gross,
    totalDeductions: row.total_deductions,
    totalNet: row.total_net,
    closedAt: row.closed_at ?? undefined,
    paidAt: row.paid_at ?? undefined,
    expenseId: row.expense_id ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

function entryToEntity(row: PayrollEntryRow): PayrollEntry {
  return {
    id: row.id,
    periodId: row.period_id ?? undefined,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    workerId: row.worker_id,
    storeId: row.store_id ?? undefined,
    totalHours: row.total_hours,
    hourlyRate: row.hourly_rate,
    grossPay: row.gross_pay,
    activeDebt: row.active_debt,
    debtDeduction: row.debt_deduction,
    debtCreditIds: row.debt_credit_ids ?? [],
    attendanceIds: row.attendance_ids ?? [],
    deductions: row.deductions,
    netPay: row.net_pay,
    notes: row.notes ?? undefined,
  };
}

function entryToRow(entry: Omit<PayrollEntry, 'id'>, periodId: string): Record<string, unknown> {
  return {
    period_id: periodId,
    period_start: entry.periodStart,
    period_end: entry.periodEnd,
    worker_id: entry.workerId,
    store_id: entry.storeId ?? null,
    total_hours: entry.totalHours,
    hourly_rate: entry.hourlyRate,
    gross_pay: entry.grossPay,
    active_debt: entry.activeDebt,
    debt_deduction: entry.debtDeduction,
    debt_credit_ids: entry.debtCreditIds,
    attendance_ids: entry.attendanceIds,
    deductions: entry.deductions,
    net_pay: entry.netPay,
    notes: entry.notes ?? null,
  };
}

export class SupabasePayrollRepository implements IPayrollRepository {
  async getPeriod(
    storeId: string,
    periodType: PeriodType,
    startDate: string,
    endDate: string,
  ): Promise<PayrollPeriod | null> {
    const { data, error } = await supabase
      .from('payroll_periods')
      .select('*')
      .eq('store_id', storeId)
      .eq('period_type', periodType)
      .eq('start_date', startDate)
      .eq('end_date', endDate)
      .maybeSingle();
    if (error) throw error;
    return data ? periodToEntity(data as PayrollPeriodRow) : null;
  }

  async getPeriodById(periodId: string): Promise<PayrollPeriod | null> {
    const { data, error } = await supabase
      .from('payroll_periods')
      .select('*')
      .eq('id', periodId)
      .maybeSingle();
    if (error) throw error;
    return data ? periodToEntity(data as PayrollPeriodRow) : null;
  }

  async getEntries(periodId: string): Promise<PayrollEntry[]> {
    const { data, error } = await supabase
      .from('payroll_entries')
      .select('*')
      .eq('period_id', periodId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data as PayrollEntryRow[]).map(entryToEntity);
  }

  async savePeriod(input: SavePayrollPeriodInput, entries: Omit<PayrollEntry, 'id'>[]): Promise<PayrollPeriod> {
    const existing = await this.getPeriod(input.storeId, input.periodType, input.startDate, input.endDate);
    if (existing?.status === 'PAGADA') {
      throw new Error('La nomina ya esta pagada y no se puede modificar');
    }

    const periodRow = {
      store_id: input.storeId,
      period_type: input.periodType,
      start_date: input.startDate,
      end_date: input.endDate,
      status: input.status,
      total_gross: input.totalGross,
      total_deductions: input.totalDeductions,
      total_net: input.totalNet,
      closed_at: input.status === 'CERRADA' || input.status === 'PAGADA' ? new Date().toISOString() : null,
      paid_at: input.status === 'PAGADA' ? new Date().toISOString() : null,
      notes: input.notes ?? null,
    };

    const { data, error } = existing
      ? await supabase
        .from('payroll_periods')
        .update(periodRow)
        .eq('id', existing.id)
        .select()
        .single()
      : await supabase
        .from('payroll_periods')
        .insert(periodRow)
        .select()
        .single();
    if (error) throw error;

    const period = periodToEntity(data as PayrollPeriodRow);
    const { error: deleteError } = await supabase
      .from('payroll_entries')
      .delete()
      .eq('period_id', period.id);
    if (deleteError) throw deleteError;

    if (entries.length > 0) {
      const { error: insertError } = await supabase
        .from('payroll_entries')
        .insert(entries.map((entry) => entryToRow(entry, period.id)));
      if (insertError) throw insertError;
    }

    return period;
  }

  async markPaid(periodId: string, expenseId?: string): Promise<PayrollPeriod> {
    const { data, error } = await supabase
      .from('payroll_periods')
      .update({
        status: 'PAGADA',
        paid_at: new Date().toISOString(),
        expense_id: expenseId ?? null,
      })
      .eq('id', periodId)
      .select()
      .single();
    if (error) throw error;
    return periodToEntity(data as PayrollPeriodRow);
  }
}
