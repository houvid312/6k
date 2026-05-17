import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Alert, Platform } from 'react-native';
import { Card, Text, Button, Chip, Divider, IconButton, Portal, Modal, TextInput, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { KpiCard } from '../../../src/components/common/KpiCard';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { CurrencyInput } from '../../../src/components/common/CurrencyInput';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { Sale, Expense, Purchase, Transfer, CashClosing, CashAuditEntry } from '../../../src/domain/entities';
import { InventoryLevel, PaymentMethod } from '../../../src/domain/enums';
import { formatCOP } from '../../../src/utils/currency';
import { formatDate, formatDateTime, toISODate, todayColombia } from '../../../src/utils/dates';

interface InventoryValuationRow {
  supplyName: string;
  quantityGrams: number;
  gramsPerBag: number;
  equivalentBags: number;
  unitPriceCop: number;
  totalValueCop: number;
}

interface WriteoffValuationRow {
  date: string;
  supplyName: string;
  quantityGrams: number;
  reason: string;
  notes: string;
  totalValueCop: number;
}

interface CashAuditRow {
  date: string;
  status: CashClosing['status'] | 'AUDIT';
  source: 'CLOSING' | 'MANUAL';
  openingBase: number;
  expectedTotal: number;
  expenses: number;
  theoreticalTotal: number;
  actualTotal: number;
  discrepancy: number;
  notes: string;
}

type ExcelCell = string | number | null | { value: string | number | null; style?: string };

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function currencyCell(value: number): ExcelCell {
  return { value, style: 'Currency' };
}

function decimalCell(value: number): ExcelCell {
  return { value: Number(value.toFixed(2)), style: 'Decimal' };
}

function buildExcelCell(cell: ExcelCell, isHeader = false): string {
  const normalized = typeof cell === 'object' && cell !== null && 'value' in cell
    ? cell
    : { value: cell, style: undefined };
  const value = normalized.value ?? '';
  const type = typeof value === 'number' ? 'Number' : 'String';
  const style = isHeader ? 'Header' : normalized.style;
  const styleAttr = style ? ` ss:StyleID="${style}"` : '';
  const text = type === 'Number' ? String(value) : escapeXml(String(value));
  return `<Cell${styleAttr}><Data ss:Type="${type}">${text}</Data></Cell>`;
}

function buildExcelWorksheet(name: string, rows: ExcelCell[][]): string {
  const safeName = escapeXml(name.slice(0, 31));
  const xmlRows = rows.map((row, rowIndex) => (
    `<Row>${row.map((cell) => buildExcelCell(cell, rowIndex === 0)).join('')}</Row>`
  )).join('');

  return `
    <Worksheet ss:Name="${safeName}">
      <Table>${xmlRows}</Table>
      <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
        <FreezePanes/>
        <FrozenNoSplit/>
        <SplitHorizontal>1</SplitHorizontal>
        <TopRowBottomPane>1</TopRowBottomPane>
        <ActivePane>2</ActivePane>
      </WorksheetOptions>
    </Worksheet>
  `;
}

function buildExcelWorkbook(sheets: { name: string; rows: ExcelCell[][] }[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook
  xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Header">
      <Font ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#E63946" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="Currency">
      <NumberFormat ss:Format="$#,##0;-$#,##0"/>
    </Style>
    <Style ss:ID="Decimal">
      <NumberFormat ss:Format="#,##0.00"/>
    </Style>
  </Styles>
  ${sheets.map((sheet) => buildExcelWorksheet(sheet.name, sheet.rows)).join('')}
</Workbook>`;
}

function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toISODate(new Date(`${value}T12:00:00`)) === value;
}

function getMonthToDateRange() {
  const today = todayColombia();
  const currentDate = new Date(`${today}T12:00:00`);
  return {
    start: toISODate(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)),
    end: today,
  };
}

function getClosingStatusLabel(status: CashClosing['status'] | 'AUDIT'): string {
  if (status === 'AUDIT') return 'Conteo manual';
  if (status === 'APPROVED') return 'Aprobado';
  if (status === 'CONFIRMED') return 'Confirmado';
  return 'Borrador';
}

export default function ContabilidadScreen() {
  const theme = useTheme();
  const {
    saleService,
    expenseRepo,
    saleRepo,
    cashClosingService,
    cashAuditRepo,
    purchaseRepo,
    transferRepo,
    inventoryRepo,
    supplyRepo,
    recipeRepo,
    writeoffRepo,
  } = useDI();
  const { selectedStoreId, stores } = useAppStore();
  const selectedStore = stores.find((s) => s.id === selectedStoreId);

  type ContaPeriod = 'hoy' | 'ayer' | 'semana' | 'mes' | 'rango';
  const [period, setPeriod] = useState<ContaPeriod>('rango');
  const [filterPeriod, setFilterPeriod] = useState<ContaPeriod>('rango');
  const [appliedStoreId, setAppliedStoreId] = useState(selectedStoreId);
  const appliedStore = stores.find((s) => s.id === appliedStoreId) ?? selectedStore;
  const isProductionCenter = appliedStore?.isProductionCenter ?? false;
  const initialRange = getMonthToDateRange();
  const [rangeStartDraft, setRangeStartDraft] = useState(initialRange.start);
  const [rangeEndDraft, setRangeEndDraft] = useState(initialRange.end);
  const [rangeStartDate, setRangeStartDate] = useState(initialRange.start);
  const [rangeEndDate, setRangeEndDate] = useState(initialRange.end);
  const [activeView, setActiveView] = useState<'resultado' | 'arqueo'>('resultado');

  const [ingresos, setIngresos] = useState(0);
  const [egresos, setEgresos] = useState(0);
  const [salesIncome, setSalesIncome] = useState(0);
  const [internalTransferIncome, setInternalTransferIncome] = useState(0);
  const [operatingExpenses, setOperatingExpenses] = useState(0);
  const [purchaseExpenses, setPurchaseExpenses] = useState(0);
  const [internalTransferExpenses, setInternalTransferExpenses] = useState(0);
  const [inventoryAssetValue, setInventoryAssetValue] = useState(0);
  const [soldInventoryCost, setSoldInventoryCost] = useState(0);
  const [writeoffInventoryCost, setWriteoffInventoryCost] = useState(0);
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [recentExpenses, setRecentExpenses] = useState<Expense[]>([]);
  const [recentPurchases, setRecentPurchases] = useState<Purchase[]>([]);
  const [recentIncomingTransfers, setRecentIncomingTransfers] = useState<Transfer[]>([]);
  const [recentOutgoingTransfers, setRecentOutgoingTransfers] = useState<Transfer[]>([]);
  const [periodLabel, setPeriodLabel] = useState('');
  const [reportSales, setReportSales] = useState<Sale[]>([]);
  const [reportExpenses, setReportExpenses] = useState<Expense[]>([]);
  const [reportPurchases, setReportPurchases] = useState<Purchase[]>([]);
  const [reportIncomingTransfers, setReportIncomingTransfers] = useState<Transfer[]>([]);
  const [reportOutgoingTransfers, setReportOutgoingTransfers] = useState<Transfer[]>([]);
  const [inventoryValuationRows, setInventoryValuationRows] = useState<InventoryValuationRow[]>([]);
  const [writeoffValuationRows, setWriteoffValuationRows] = useState<WriteoffValuationRow[]>([]);
  const [cashAuditRows, setCashAuditRows] = useState<CashAuditRow[]>([]);
  const [cashAuditYear, setCashAuditYear] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasAppliedFilter, setHasAppliedFilter] = useState(false);

  // C1: Daily audit
  const [openingBase, setOpeningBase] = useState(0);
  const [todayCashSales, setTodayCashSales] = useState(0);
  const [todayCashExpenses, setTodayCashExpenses] = useState(0);
  const [closingActual, setClosingActual] = useState<number | null>(null);

  // Edit expense modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState(0);
  const [deleteExpenseModalVisible, setDeleteExpenseModalVisible] = useState(false);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);
  const [isDeletingExpense, setIsDeletingExpense] = useState(false);
  const [deleteExpenseError, setDeleteExpenseError] = useState('');
  const [auditModalVisible, setAuditModalVisible] = useState(false);
  const [auditDate, setAuditDate] = useState(todayColombia());
  const [auditActualTotal, setAuditActualTotal] = useState(0);
  const [auditNotes, setAuditNotes] = useState('');
  const [auditSaving, setAuditSaving] = useState(false);
  const [auditError, setAuditError] = useState('');

  const loadData = useCallback(async () => {
    if (!hasAppliedFilter || !appliedStoreId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const today = todayColombia();
      let startDate: string;
      let endDate: string;

      if (period === 'hoy') {
        startDate = today;
        endDate = today;
      } else if (period === 'ayer') {
        const yesterday = new Date(today + 'T12:00:00');
        yesterday.setDate(yesterday.getDate() - 1);
        const yStr = toISODate(yesterday);
        startDate = yStr;
        endDate = yStr;
      } else if (period === 'semana') {
        const weekAgo = new Date(today + 'T12:00:00');
        weekAgo.setDate(weekAgo.getDate() - 7);
        startDate = toISODate(weekAgo);
        endDate = today;
      } else if (period === 'mes') {
        const d = new Date(today + 'T12:00:00');
        startDate = toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
        endDate = today;
      } else {
        startDate = rangeStartDate;
        endDate = rangeEndDate;
      }

      const endDateTime = `${endDate}T23:59:59`;
      const sales = await saleService.getSalesByDateRange(appliedStoreId, startDate, endDateTime);
      const totalRevenue = sales.reduce((sum, s) => sum + s.totalAmount, 0);

      const allExpenses = await expenseRepo.getByDateRange(appliedStoreId, startDate, endDateTime);
      const totalExpenses = allExpenses.reduce((sum, e) => sum + e.amount, 0);

      const purchases = await purchaseRepo.getByDateRange(startDate, endDateTime, appliedStoreId);
      const totalPurchases = purchases.reduce((sum, p) => sum + p.priceCOP, 0);

      const incomingTransfers = await transferRepo.getReceivedByDestination(appliedStoreId, startDate, endDate);
      const totalIncomingTransfers = incomingTransfers.reduce((sum, t) => sum + (t.totalPriceCop ?? 0), 0);

      const outgoingTransfers = await transferRepo.getReceivedByOrigin(appliedStoreId, startDate, endDate);
      const totalOutgoingTransfers = isProductionCenter
        ? outgoingTransfers.reduce((sum, t) => sum + (t.totalPriceCop ?? 0), 0)
        : 0;

      const [storeInventory, supplies, recipes, approvedWriteoffs] = await Promise.all([
        inventoryRepo.getByStore(appliedStoreId, InventoryLevel.STORE),
        supplyRepo.getAll(false),
        recipeRepo.getAll(),
        writeoffRepo.getApprovedByStoreAndDateRange(appliedStoreId, startDate, endDate),
      ]);
      const suppliesById = new Map(supplies.map((supply) => [supply.id, supply]));

      const valueQuantityAtStorePrice = (supplyId: string | undefined, quantity: number) => {
        if (!supplyId || quantity <= 0) return 0;
        const supply = suppliesById.get(supplyId);
        if (!supply?.isBillableToStore || supply.gramsPerBag <= 0 || supply.commercialPriceCop <= 0) {
          return 0;
        }
        return (quantity / supply.gramsPerBag) * supply.commercialPriceCop;
      };

      const currentInventoryValue = storeInventory.reduce((sum, item) => {
        const supply = suppliesById.get(item.supplyId);
        if (!supply?.isBillableToStore || supply.gramsPerBag <= 0 || supply.commercialPriceCop <= 0) {
          return sum;
        }
        const equivalentBags = Math.max(item.quantityGrams, 0) / supply.gramsPerBag;
        return sum + equivalentBags * supply.commercialPriceCop;
      }, 0);
      const currentInventoryRows = storeInventory
        .map((item): InventoryValuationRow | null => {
          const supply = suppliesById.get(item.supplyId);
          if (!supply?.isBillableToStore || supply.gramsPerBag <= 0 || supply.commercialPriceCop <= 0) {
            return null;
          }
          const positiveGrams = Math.max(item.quantityGrams, 0);
          const equivalentBags = positiveGrams / supply.gramsPerBag;
          return {
            supplyName: supply.name,
            quantityGrams: positiveGrams,
            gramsPerBag: supply.gramsPerBag,
            equivalentBags,
            unitPriceCop: supply.commercialPriceCop,
            totalValueCop: equivalentBags * supply.commercialPriceCop,
          };
        })
        .filter((row): row is InventoryValuationRow => !!row && row.quantityGrams > 0)
        .sort((a, b) => b.totalValueCop - a.totalValueCop);

      const recipesByProductId = new Map(recipes.map((recipe) => [recipe.productId, recipe]));
      const totalSoldInventoryCost = sales.reduce((saleSum, sale) => {
        if ((sale.totalCostCop ?? 0) > 0) {
          return saleSum + (sale.totalCostCop ?? 0);
        }

        const itemCost = sale.items.reduce((itemSum, item) => {
          if ((item.totalCostCop ?? 0) > 0) {
            return itemSum + (item.totalCostCop ?? 0);
          }

          const recipe = recipesByProductId.get(item.productId);
          const recipeCost = (recipe?.ingredients ?? []).reduce(
            (sum, ingredient) => sum + valueQuantityAtStorePrice(
              ingredient.supplyId,
              ingredient.gramsPerPortion * item.portions,
            ),
            0,
          );
          const additionsCost = (item.additions ?? []).reduce(
            (sum, addition) => sum + valueQuantityAtStorePrice(
              addition.supplyId,
              addition.grams * addition.quantity,
            ),
            0,
          );
          const packagingCost = valueQuantityAtStorePrice(item.packagingSupplyId, item.packagingQuantity ?? 0);
          return itemSum + recipeCost + additionsCost + packagingCost;
        }, 0);

        const hasItemPackaging = sale.items.some((item) => !!item.packagingSupplyId);
        const legacyPackagingCost = hasItemPackaging
          ? 0
          : valueQuantityAtStorePrice(sale.packagingSupplyId, sale.packagingSupplyId ? 1 : 0);

        return saleSum + itemCost + legacyPackagingCost;
      }, 0);

      const currentWriteoffRows = approvedWriteoffs
        .map((writeoff): WriteoffValuationRow => ({
          date: formatDateTime(writeoff.createdAt),
          supplyName: suppliesById.get(writeoff.supplyId)?.name ?? 'Insumo',
          quantityGrams: writeoff.quantityGrams,
          reason: writeoff.reason,
          notes: writeoff.notes,
          totalValueCop: valueQuantityAtStorePrice(writeoff.supplyId, writeoff.quantityGrams),
        }))
        .sort((a, b) => b.totalValueCop - a.totalValueCop);

      const totalWriteoffInventoryCost = currentWriteoffRows.reduce(
        (sum, writeoff) => sum + writeoff.totalValueCop,
        0,
      );

      const periodIncome = totalRevenue + totalOutgoingTransfers;
      const periodExpenses = totalExpenses + totalPurchases + totalIncomingTransfers;
      const auditYear = String(new Date(`${endDate}T12:00:00`).getFullYear());
      const auditYearStart = `${auditYear}-01-01`;
      const [yearClosings, yearAuditEntries] = await Promise.all([
        cashClosingService.getClosingsByDateRange(appliedStoreId, auditYearStart, endDate),
        cashAuditRepo.getByDateRange(appliedStoreId, auditYearStart, endDate),
      ]);
      const closingByDate = new Map(yearClosings.map((closing) => [closing.date, closing]));
      const manualAuditByDate = new Map(yearAuditEntries.map((entry) => [entry.date, entry]));
      const auditDates = Array.from(new Set([
        ...yearClosings.map((closing) => closing.date),
        ...yearAuditEntries.map((entry) => entry.date),
      ])).sort((a, b) => a.localeCompare(b));
      const openingsByDate = await Promise.all(
        auditDates.map((date) =>
          cashClosingService.getOpeningByDate(appliedStoreId, date).catch(() => null),
        ),
      );
      const auditRows = auditDates.map((date, index): CashAuditRow | null => {
        const manualAudit = manualAuditByDate.get(date);
        if (manualAudit) {
          return {
            date: manualAudit.date,
            status: 'AUDIT',
            source: 'MANUAL',
            openingBase: manualAudit.openingBase,
            expectedTotal: manualAudit.cashSales,
            expenses: manualAudit.cashExpenses,
            theoreticalTotal: manualAudit.theoreticalTotal,
            actualTotal: manualAudit.actualTotal,
            discrepancy: manualAudit.discrepancy,
            notes: manualAudit.notes,
          };
        }

        const closing = closingByDate.get(date);
        if (!closing) return null;
        const openingBaseValue = openingsByDate[index]?.total ?? 0;
        const theoreticalTotal = openingBaseValue + closing.expectedTotal - closing.expenses;
        const actualTotal = closing.actualTotal;
        const discrepancy = actualTotal - theoreticalTotal;

        return {
          date: closing.date,
          status: closing.status,
          source: 'CLOSING',
          openingBase: openingBaseValue,
          expectedTotal: closing.expectedTotal,
          expenses: closing.expenses,
          theoreticalTotal,
          actualTotal,
          discrepancy,
          notes: '',
        };
      }).filter((row): row is CashAuditRow => !!row);

      setSalesIncome(totalRevenue);
      setInternalTransferIncome(totalOutgoingTransfers);
      setOperatingExpenses(totalExpenses);
      setPurchaseExpenses(totalPurchases);
      setInternalTransferExpenses(totalIncomingTransfers);
      setInventoryAssetValue(Math.round(currentInventoryValue));
      setSoldInventoryCost(Math.round(totalSoldInventoryCost));
      setWriteoffInventoryCost(Math.round(totalWriteoffInventoryCost));
      setIngresos(periodIncome);
      setEgresos(periodExpenses);
      setPeriodLabel(startDate === endDate ? startDate : `${startDate} a ${endDate}`);
      setReportSales(sales);
      setReportExpenses(allExpenses);
      setReportPurchases(purchases);
      setReportIncomingTransfers(incomingTransfers);
      setReportOutgoingTransfers(isProductionCenter ? outgoingTransfers : []);
      setInventoryValuationRows(currentInventoryRows);
      setWriteoffValuationRows(currentWriteoffRows);
      setCashAuditRows([...auditRows].reverse());
      setCashAuditYear(auditYear);

      // Transacciones del periodo (últimas 10)
      setRecentSales(sales.slice(0, 10));
      setRecentExpenses(allExpenses.slice(0, 10));
      setRecentPurchases(purchases.slice(0, 10));
      setRecentIncomingTransfers(incomingTransfers.slice(0, 10));
      setRecentOutgoingTransfers(isProductionCenter ? outgoingTransfers.slice(0, 10) : []);

      // C1: Daily audit data (solo para hoy)
      if (period === 'hoy') {
        try {
          const opening = await cashClosingService.getOpeningByDate(appliedStoreId, today);
          setOpeningBase(opening?.total ?? 0);

          const dailySales = await saleService.getDailySummary(appliedStoreId, today);
          setTodayCashSales(dailySales.totalCashAmount ?? dailySales.totalAmount ?? 0);

          const dailyExpenses = allExpenses.reduce((sum, e) => sum + e.amount, 0)
            + purchases
              .filter((p) => p.paymentMethod === PaymentMethod.EFECTIVO)
              .reduce((sum, p) => sum + p.priceCOP, 0);
          setTodayCashExpenses(dailyExpenses);

          const closing = await cashClosingService.getClosingByDate(appliedStoreId, today);
          setClosingActual(closing?.actualTotal ?? null);
        } catch { /* ignore */ }
      }
    } catch {
      // keep defaults
    } finally {
      setLoading(false);
    }
  }, [
    appliedStoreId,
    isProductionCenter,
    saleService,
    expenseRepo,
    cashClosingService,
    cashAuditRepo,
    purchaseRepo,
    transferRepo,
    inventoryRepo,
    supplyRepo,
    recipeRepo,
    writeoffRepo,
    hasAppliedFilter,
    period,
    rangeStartDate,
    rangeEndDate,
  ]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const utilidad = ingresos - egresos;
  const flujoConInventario = utilidad + inventoryAssetValue;
  const margenBruto = salesIncome - soldInventoryCost;
  const resultadoOperativo = margenBruto - operatingExpenses - writeoffInventoryCost;
  const latestCashAudit = cashAuditRows[0];
  const latestCashAuditTheoretical = latestCashAudit?.theoreticalTotal ?? 0;
  const latestCashAuditActual = latestCashAudit?.actualTotal ?? 0;
  const latestCashAuditDiscrepancy = latestCashAudit?.discrepancy ?? 0;
  const maxCashAuditDiscrepancy = cashAuditRows.reduce(
    (max, row) => Math.max(max, Math.abs(row.discrepancy)),
    0,
  );
  const hasPendingFilter = !hasAppliedFilter
    || selectedStoreId !== appliedStoreId
    || filterPeriod !== period
    || (filterPeriod === 'rango' && (rangeStartDraft !== rangeStartDate || rangeEndDraft !== rangeEndDate));

  const handleDeleteSale = useCallback((sale: Sale) => {
    Alert.alert(
      'Eliminar venta',
      `¿Seguro que deseas eliminar esta venta de ${formatCOP(sale.totalAmount)}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await saleRepo.delete(sale.id);
              loadData();
            } catch {
              Alert.alert('Error', 'No se pudo eliminar la venta');
            }
          },
        },
      ],
    );
  }, [saleRepo, loadData]);

  const handleDeleteExpense = useCallback((expense: Expense) => {
    setDeletingExpense(expense);
    setDeleteExpenseError('');
    setDeleteExpenseModalVisible(true);
  }, []);

  const handleConfirmDeleteExpense = useCallback(async () => {
    if (!deletingExpense) return;

    setIsDeletingExpense(true);
    setDeleteExpenseError('');
    try {
      await expenseRepo.delete(deletingExpense.id);
      setDeleteExpenseModalVisible(false);
      setDeletingExpense(null);
      loadData();
    } catch (error) {
      setDeleteExpenseError(
        error instanceof Error
          ? error.message
          : 'No se pudo eliminar el gasto. Revisa permisos e intenta de nuevo.',
      );
    } finally {
      setIsDeletingExpense(false);
    }
  }, [deletingExpense, expenseRepo, loadData]);

  const handleEditExpense = useCallback((expense: Expense) => {
    setEditingExpense(expense);
    setEditDescription(expense.description);
    setEditAmount(expense.amount);
    setEditModalVisible(true);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingExpense) return;
    try {
      await expenseRepo.update(editingExpense.id, {
        description: editDescription,
        amount: editAmount,
      });
      setEditModalVisible(false);
      setEditingExpense(null);
      loadData();
    } catch {
      Alert.alert('Error', 'No se pudo actualizar el gasto');
    }
  }, [editingExpense, editDescription, editAmount, expenseRepo, loadData]);

  const handleOpenAuditModal = useCallback(() => {
    const defaultDate = todayColombia();
    const existingAudit = cashAuditRows.find((row) => row.date === defaultDate);
    setAuditDate(defaultDate);
    setAuditActualTotal(existingAudit?.actualTotal ?? 0);
    setAuditNotes(existingAudit?.notes ?? '');
    setAuditError('');
    setAuditModalVisible(true);
  }, [cashAuditRows]);

  const handleSaveCashAudit = useCallback(async () => {
    if (!appliedStoreId) return;
    if (!isValidISODate(auditDate)) {
      setAuditError('Usa una fecha valida con formato YYYY-MM-DD.');
      return;
    }

    setAuditSaving(true);
    setAuditError('');
    try {
      const [opening, dailySales, dayExpenses, dayPurchases] = await Promise.all([
        cashClosingService.getOpeningByDate(appliedStoreId, auditDate),
        saleService.getDailySummary(appliedStoreId, auditDate),
        expenseRepo.getByDateRange(appliedStoreId, auditDate, `${auditDate}T23:59:59`),
        purchaseRepo.getByDateRange(auditDate, `${auditDate}T23:59:59`, appliedStoreId),
      ]);
      const openingBaseValue = opening?.total ?? 0;
      const cashSales = dailySales.totalCashAmount ?? dailySales.totalAmount ?? 0;
      const cashExpenses = dayExpenses.reduce((sum, expense) => sum + expense.amount, 0)
        + dayPurchases
          .filter((purchase) => purchase.paymentMethod === PaymentMethod.EFECTIVO)
          .reduce((sum, purchase) => sum + purchase.priceCOP, 0);
      const theoreticalTotal = openingBaseValue + cashSales - cashExpenses;

      const entry: Omit<CashAuditEntry, 'id' | 'createdAt' | 'updatedAt'> = {
        storeId: appliedStoreId,
        date: auditDate,
        openingBase: openingBaseValue,
        cashSales,
        cashExpenses,
        theoreticalTotal,
        actualTotal: auditActualTotal,
        discrepancy: auditActualTotal - theoreticalTotal,
        notes: auditNotes.trim(),
      };

      await cashAuditRepo.upsert(entry);
      setAuditModalVisible(false);
      loadData();
    } catch (error) {
      setAuditError(
        error instanceof Error
          ? error.message
          : 'No se pudo guardar el conteo real de caja.',
      );
    } finally {
      setAuditSaving(false);
    }
  }, [
    appliedStoreId,
    auditActualTotal,
    auditDate,
    auditNotes,
    cashAuditRepo,
    cashClosingService,
    expenseRepo,
    loadData,
    purchaseRepo,
    saleService,
  ]);

  const handlePeriodPress = useCallback((nextPeriod: ContaPeriod) => {
    setFilterPeriod(nextPeriod);

    if (nextPeriod === 'rango') {
      const monthToDate = getMonthToDateRange();
      setRangeStartDraft(period === 'rango' ? rangeStartDate : monthToDate.start);
      setRangeEndDraft(period === 'rango' ? rangeEndDate : monthToDate.end);
      return;
    }
  }, [period, rangeStartDate, rangeEndDate]);

  const handleApplyFilter = useCallback(() => {
    if (filterPeriod === 'rango') {
      if (!isValidISODate(rangeStartDraft) || !isValidISODate(rangeEndDraft)) {
        Alert.alert('Rango invalido', 'Usa fechas con formato YYYY-MM-DD.');
        return;
      }
      if (rangeStartDraft > rangeEndDraft) {
        Alert.alert('Rango invalido', 'La fecha inicial no puede ser mayor que la fecha final.');
        return;
      }
      setRangeStartDate(rangeStartDraft);
      setRangeEndDate(rangeEndDraft);
    }

    setHasAppliedFilter(true);
    setAppliedStoreId(selectedStoreId);
    setPeriod(filterPeriod);
  }, [filterPeriod, rangeStartDraft, rangeEndDraft, selectedStoreId]);

  const getStoreName = useCallback((storeId: string) => {
    return stores.find((s) => s.id === storeId)?.name ?? 'Local';
  }, [stores]);

  const formatTransferDate = useCallback((transfer: Transfer) => {
    return transfer.receivedAt ? formatDateTime(transfer.receivedAt) : formatDate(transfer.orderDate);
  }, []);

  const handleExportExcel = useCallback(() => {
    if (Platform.OS !== 'web') {
      Alert.alert('Exportacion no disponible', 'Por ahora el reporte de Excel se descarga desde la version web.');
      return;
    }

    const storeName = appliedStore?.name ?? 'Local';
    const generatedAt = new Date().toISOString();
    const transferDescription = (transfer: Transfer) => {
      const itemCount = transfer.items.length;
      const bags = transfer.items.reduce((sum, item) => sum + item.bagsToSend, 0);
      return `Traslado ${transfer.id.slice(0, 6)} · ${itemCount} insumo(s) · ${bags} bolsa(s)`;
    };

    const summaryRows: ExcelCell[][] = [
      ['Campo', 'Valor', 'Descripcion'],
      ['Tienda', storeName, 'Centro de costo seleccionado en contabilidad.'],
      ['Periodo', periodLabel || period, 'Rango de fechas incluido en el reporte.'],
      ['Generado', formatDateTime(generatedAt), 'Fecha y hora de generacion del archivo.'],
      ['Ingresos', currencyCell(ingresos), 'Ventas a clientes mas facturacion interna cuando aplica.'],
      ['Egresos', currencyCell(egresos), 'Gastos, compras y cargos internos del periodo.'],
      ['Flujo neto', currencyCell(utilidad), 'Ingresos menos egresos. Es lectura de flujo, no margen.'],
      ['Inventario valorizado', currencyCell(inventoryAssetValue), 'Stock actual valorizado al precio de traslado.'],
      ['Flujo + inventario', currencyCell(flujoConInventario), 'Flujo neto mas inventario actual como activo.'],
      ['Margen bruto', currencyCell(margenBruto), 'Ventas a clientes menos costo vendido por recetas.'],
      ['Margen operativo', currencyCell(resultadoOperativo), 'Margen bruto menos mermas aprobadas y gastos operativos. Es lectura de rentabilidad, no se suma al flujo.'],
    ];

    const marginRows: ExcelCell[][] = [
      ['Concepto', 'Valor', 'Descripcion'],
      ['Ventas a clientes', currencyCell(salesIncome), 'Total vendido a clientes en el periodo seleccionado.'],
      ['Costo vendido por recetas', currencyCell(-soldInventoryCost), 'Inventario consumido por ventas, recetas, adiciones y empaques a precio de traslado.'],
      ['Margen bruto', currencyCell(margenBruto), 'Ventas menos costo vendido. Indica si la venta cubre el producto consumido.'],
      ['Bajas y mermas aprobadas', currencyCell(-writeoffInventoryCost), 'Inventario descontado por bajas aprobadas en el periodo.'],
      ['Gastos operativos', currencyCell(-operatingExpenses), 'Gastos registrados por la tienda, sin costo vendido ni cargos internos.'],
      ['Margen operativo', currencyCell(resultadoOperativo), 'Margen bruto menos mermas y gastos operativos. Es una lectura separada del flujo de caja.'],
      ['Inventario actual como activo', currencyCell(inventoryAssetValue), 'Stock que queda en el local valorizado al precio de compra al centro de produccion.'],
    ];

    const transactionRows: ExcelCell[][] = [
      ['Fecha', 'Tipo', 'Descripcion', 'Tercero / centro de costo', 'Valor'],
      ...reportSales.map((sale): ExcelCell[] => [
        formatDateTime(sale.timestamp),
        'Venta',
        `${sale.totalPortions} porcion(es)`,
        storeName,
        currencyCell(sale.totalAmount),
      ]),
      ...reportExpenses.map((expense): ExcelCell[] => [
        formatDate(expense.date),
        'Gasto operativo',
        `${expense.category} · ${expense.description}`,
        storeName,
        currencyCell(-expense.amount),
      ]),
      ...reportPurchases.map((purchase): ExcelCell[] => [
        formatDateTime(purchase.timestamp),
        'Compra de insumos',
        `${purchase.quantityGrams}g`,
        purchase.supplier,
        currencyCell(-purchase.priceCOP),
      ]),
      ...reportIncomingTransfers.map((transfer): ExcelCell[] => [
        formatTransferDate(transfer),
        'Traslado recibido',
        transferDescription(transfer),
        getStoreName(transfer.fromStoreId),
        currencyCell(-(transfer.totalPriceCop ?? 0)),
      ]),
      ...reportOutgoingTransfers.map((transfer): ExcelCell[] => [
        formatTransferDate(transfer),
        'Traslado facturado',
        transferDescription(transfer),
        getStoreName(transfer.toStoreId),
        currencyCell(transfer.totalPriceCop ?? 0),
      ]),
    ];

    const inventoryRows: ExcelCell[][] = [
      ['Insumo', 'Gramos actuales', 'Gramos por bolsa', 'Bolsas equivalentes', 'Precio traslado', 'Valor total'],
      ...inventoryValuationRows.map((row): ExcelCell[] => [
        row.supplyName,
        decimalCell(row.quantityGrams),
        decimalCell(row.gramsPerBag),
        decimalCell(row.equivalentBags),
        currencyCell(row.unitPriceCop),
        currencyCell(Math.round(row.totalValueCop)),
      ]),
    ];

    const writeoffRows: ExcelCell[][] = [
      ['Fecha', 'Insumo', 'Cantidad gramos', 'Razon', 'Notas', 'Valor a precio traslado'],
      ...writeoffValuationRows.map((row): ExcelCell[] => [
        row.date,
        row.supplyName,
        decimalCell(row.quantityGrams),
        row.reason,
        row.notes,
        currencyCell(Math.round(row.totalValueCop)),
      ]),
    ];

    const cashAuditExcelRows: ExcelCell[][] = [
      ['Fecha', 'Origen', 'Estado', 'Base apertura', 'Ventas efectivo', 'Egresos efectivo', 'Saldo teorico', 'Real contado', 'Descuadre', 'Notas'],
      ...[...cashAuditRows].reverse().map((row): ExcelCell[] => [
        row.date,
        row.source === 'MANUAL' ? 'Conteo manual' : 'Cierre de caja',
        getClosingStatusLabel(row.status),
        currencyCell(row.openingBase),
        currencyCell(row.expectedTotal),
        currencyCell(row.expenses),
        currencyCell(row.theoreticalTotal),
        currencyCell(row.actualTotal),
        currencyCell(row.discrepancy),
        row.notes,
      ]),
    ];

    const workbookXml = buildExcelWorkbook([
      { name: 'Resumen', rows: summaryRows },
      { name: 'Informe de margen', rows: marginRows },
      { name: 'Transacciones', rows: transactionRows },
      { name: 'Arqueo caja', rows: cashAuditExcelRows },
      { name: 'Inventario valorizado', rows: inventoryRows },
      { name: 'Mermas', rows: writeoffRows },
    ]);

    const blob = new Blob([workbookXml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeStoreName = storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const safePeriod = (periodLabel || period).replace(/[^0-9a-zA-Z]+/g, '-').replace(/(^-|-$)/g, '');
    link.href = url;
    link.download = `reporte-contabilidad-${safeStoreName || 'local'}-${safePeriod}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [
    appliedStore?.name,
    periodLabel,
    period,
    ingresos,
    egresos,
    utilidad,
    inventoryAssetValue,
    flujoConInventario,
    margenBruto,
    resultadoOperativo,
    salesIncome,
    soldInventoryCost,
    writeoffInventoryCost,
    operatingExpenses,
    reportSales,
    reportExpenses,
    reportPurchases,
    reportIncomingTransfers,
    reportOutgoingTransfers,
    inventoryValuationRows,
    writeoffValuationRows,
    cashAuditRows,
    formatTransferDate,
    getStoreName,
  ]);

  if (loading) {
    return <LoadingIndicator message="Cargando datos contables..." />;
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <StoreSelector />
      </View>

      {/* Period filter */}
      <View style={styles.periodRow}>
        {(['hoy', 'ayer', 'semana', 'mes', 'rango'] as const).map((p) => (
          <Chip
            key={p}
            selected={filterPeriod === p}
            onPress={() => handlePeriodPress(p)}
            mode={filterPeriod === p ? 'flat' : 'outlined'}
            style={filterPeriod === p ? { backgroundColor: theme.colors.primaryContainer } : undefined}
          >
            {p === 'hoy' ? 'Hoy' : p === 'ayer' ? 'Ayer' : p === 'semana' ? 'Semana' : p === 'mes' ? 'Mes' : 'Rango'}
          </Chip>
        ))}
      </View>
      {filterPeriod === 'rango' && (
        <View style={styles.rangeFilter}>
          <TextInput
            label="Desde"
            value={rangeStartDraft}
            onChangeText={setRangeStartDraft}
            mode="outlined"
            dense
            placeholder="YYYY-MM-DD"
            style={styles.rangeInput}
          />
          <TextInput
            label="Hasta"
            value={rangeEndDraft}
            onChangeText={setRangeEndDraft}
            mode="outlined"
            dense
            placeholder="YYYY-MM-DD"
            style={styles.rangeInput}
          />
          <Button
            mode="contained"
            compact
            onPress={handleApplyFilter}
            style={styles.rangeButton}
          >
            Aplicar
          </Button>
          {hasPendingFilter && (
            <Text variant="bodySmall" style={styles.rangeHint}>
              {hasAppliedFilter
                ? `Filtro listo para consultar. Presiona Aplicar para recalcular; datos cargados: ${periodLabel || 'sin periodo'}.`
                : 'Reporte sin cargar. Presiona Aplicar para consultar este rango.'}
            </Text>
          )}
        </View>
      )}
      {filterPeriod !== 'rango' && (
        <View style={styles.applyRow}>
          <Button mode="contained" compact onPress={handleApplyFilter}>
            Aplicar
          </Button>
          {hasPendingFilter && (
            <Text variant="bodySmall" style={styles.rangeHint}>
              {hasAppliedFilter
                ? `Filtro listo para consultar. Presiona Aplicar para recalcular; datos cargados: ${periodLabel || 'sin periodo'}.`
                : 'Reporte sin cargar. Presiona Aplicar para consultar.'}
            </Text>
          )}
        </View>
      )}

      {!hasAppliedFilter ? (
        <Card style={styles.txCard} mode="elevated">
          <Card.Content>
            <Text variant="titleMedium" style={{ fontWeight: '600', marginBottom: 6 }}>
              Reporte pendiente
            </Text>
            <Text variant="bodySmall" style={styles.txInfoText}>
              El modulo no consultara la base de datos hasta que apliques el filtro. Por defecto queda listo el rango del mes actual para revisar antes de cargar.
            </Text>
          </Card.Content>
        </Card>
      ) : (
        <>
          <View style={styles.viewTabs}>
            <Chip
              selected={activeView === 'resultado'}
              onPress={() => setActiveView('resultado')}
              mode={activeView === 'resultado' ? 'flat' : 'outlined'}
              icon="chart-line"
              style={activeView === 'resultado' ? { backgroundColor: theme.colors.primaryContainer } : undefined}
            >
              Resultado
            </Chip>
            <Chip
              selected={activeView === 'arqueo'}
              onPress={() => setActiveView('arqueo')}
              mode={activeView === 'arqueo' ? 'flat' : 'outlined'}
              icon="cash-register"
              style={activeView === 'arqueo' ? { backgroundColor: theme.colors.primaryContainer } : undefined}
            >
              Arqueo caja
            </Chip>
          </View>

          {activeView === 'arqueo' ? (
            <>
              <View style={styles.kpiRow}>
                <KpiCard
                  icon="cash-check"
                  label="Real actual"
                  value={formatCOP(latestCashAuditActual)}
                  color="#1976D2"
                />
                <KpiCard
                  icon="calculator"
                  label="Teorico actual"
                  value={formatCOP(latestCashAuditTheoretical)}
                  color="#6A5ACD"
                />
              </View>
              <View style={styles.kpiRow}>
                <KpiCard
                  icon="scale-balance"
                  label="Descuadre actual"
                  value={formatCOP(latestCashAuditDiscrepancy)}
                  color={latestCashAuditDiscrepancy === 0 ? '#388E3C' : '#D32F2F'}
                />
                <KpiCard
                  icon="chart-timeline-variant"
                  label="Mayor descuadre"
                  value={formatCOP(maxCashAuditDiscrepancy)}
                  color={maxCashAuditDiscrepancy === 0 ? '#388E3C' : '#D32F2F'}
                />
              </View>

              <Card style={styles.txCard} mode="elevated">
                <Card.Content>
                  <Text variant="titleSmall" style={{ fontWeight: '600', marginBottom: 8 }}>
                    Arqueo de caja {cashAuditYear || 'ano'}
                  </Text>
                  <Text variant="bodySmall" style={styles.txInfoText}>
                    Historial anual por centro de costo. Cada registro es un saldo real del dia, por eso el valor actual se toma del ultimo conteo y no de una suma.
                  </Text>
                  <View style={styles.txRow}>
                    <Text variant="bodySmall">Dias auditados</Text>
                    <Text variant="bodySmall" style={{ fontWeight: '600' }}>{cashAuditRows.length}</Text>
                  </View>
                  <View style={styles.txRow}>
                    <Text variant="bodySmall">Ultimo conteo</Text>
                    <Text variant="bodySmall" style={{ fontWeight: '600' }}>
                      {latestCashAudit ? formatDate(latestCashAudit.date) : 'Sin registro'}
                    </Text>
                  </View>
                  <View style={styles.txRow}>
                    <Text variant="bodySmall">Real actual</Text>
                    <Text variant="bodySmall" style={{ fontWeight: '600', color: '#1976D2' }}>
                      {formatCOP(latestCashAuditActual)}
                    </Text>
                  </View>
                  <View style={styles.txRow}>
                    <Text variant="bodySmall">Teorico actual</Text>
                    <Text variant="bodySmall" style={{ fontWeight: '600', color: '#6A5ACD' }}>
                      {formatCOP(latestCashAuditTheoretical)}
                    </Text>
                  </View>
                  <Divider style={{ marginVertical: 8 }} />
                  <View style={styles.txRow}>
                    <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>Diferencia actual</Text>
                    <Text
                      variant="bodyMedium"
                      style={{ fontWeight: 'bold', color: latestCashAuditDiscrepancy === 0 ? '#388E3C' : '#D32F2F' }}
                    >
                      {formatCOP(latestCashAuditDiscrepancy)}
                    </Text>
                  </View>
                </Card.Content>
              </Card>

              <View style={styles.navRow}>
                <Button
                  mode="contained"
                  icon="cash-plus"
                  buttonColor="#E63946"
                  textColor="#FFFFFF"
                  onPress={handleOpenAuditModal}
                >
                  Registrar conteo
                </Button>
                <Button
                  mode="outlined"
                  icon="calendar-check"
                  onPress={() => router.push('/(tabs)/ventas/cierre-caja')}
                >
                  Registrar cierre
                </Button>
                <Button
                  mode="contained"
                  icon="file-excel"
                  buttonColor="#2E7D32"
                  textColor="#FFFFFF"
                  onPress={handleExportExcel}
                >
                  Exportar Excel
                </Button>
              </View>

              <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600' }]}>
                Detalle diario
              </Text>

              {cashAuditRows.length === 0 ? (
                <Card style={styles.txCard} mode="elevated">
                  <Card.Content>
                    <Text variant="titleSmall" style={{ fontWeight: '600', marginBottom: 4 }}>
                      Sin conteos registrados
                    </Text>
                    <Text variant="bodySmall" style={styles.txInfoText}>
                      No hay registros de arqueo para el ano corrido del centro de costo aplicado.
                    </Text>
                  </Card.Content>
                </Card>
              ) : cashAuditRows.map((row) => (
                <Card key={row.date} style={styles.txCard} mode="elevated">
                  <Card.Content>
                    <View style={styles.txRow}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text variant="bodyMedium" style={{ fontWeight: '600' }}>{formatDate(row.date)}</Text>
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          {getClosingStatusLabel(row.status)}
                          {row.source === 'MANUAL' ? ' · saldo real actualizado' : ' · desde cierre'}
                        </Text>
                      </View>
                      <Text
                        variant="bodyMedium"
                        style={{ fontWeight: '700', color: row.discrepancy === 0 ? '#388E3C' : '#D32F2F' }}
                      >
                        {formatCOP(row.discrepancy)}
                      </Text>
                    </View>
                    <Divider style={{ marginVertical: 8 }} />
                    <View style={styles.auditGrid}>
                      <View style={styles.auditCell}>
                        <Text variant="bodySmall" style={styles.txInfoText}>Base</Text>
                        <Text variant="bodySmall" style={styles.auditValue}>{formatCOP(row.openingBase)}</Text>
                      </View>
                      <View style={styles.auditCell}>
                        <Text variant="bodySmall" style={styles.txInfoText}>Ventas</Text>
                        <Text variant="bodySmall" style={styles.auditValue}>{formatCOP(row.expectedTotal)}</Text>
                      </View>
                      <View style={styles.auditCell}>
                        <Text variant="bodySmall" style={styles.txInfoText}>Egresos</Text>
                        <Text variant="bodySmall" style={styles.auditValue}>{formatCOP(row.expenses)}</Text>
                      </View>
                      <View style={styles.auditCell}>
                        <Text variant="bodySmall" style={styles.txInfoText}>Teorico</Text>
                        <Text variant="bodySmall" style={styles.auditValue}>{formatCOP(row.theoreticalTotal)}</Text>
                      </View>
                      <View style={styles.auditCell}>
                        <Text variant="bodySmall" style={styles.txInfoText}>Real</Text>
                        <Text variant="bodySmall" style={styles.auditValue}>{formatCOP(row.actualTotal)}</Text>
                      </View>
                      <View style={styles.auditCell}>
                        <Text variant="bodySmall" style={styles.txInfoText}>Descuadre</Text>
                        <Text
                          variant="bodySmall"
                          style={[
                            styles.auditValue,
                            { color: row.discrepancy === 0 ? '#388E3C' : '#D32F2F' },
                          ]}
                        >
                          {formatCOP(row.discrepancy)}
                        </Text>
                      </View>
                    </View>
                    {!!row.notes && (
                      <Text variant="bodySmall" style={[styles.txInfoText, { marginTop: 8 }]}>
                        {row.notes}
                      </Text>
                    )}
                  </Card.Content>
                </Card>
              ))}
            </>
          ) : (
            <>
          {/* KPI Cards */}
          <Text variant="titleSmall" style={styles.kpiSectionTitle}>
            Flujo de caja
          </Text>
          <View style={styles.kpiRow}>
            <KpiCard icon="arrow-down-circle" label="Ingresos" value={formatCOP(ingresos)} color="#388E3C" />
            <KpiCard icon="arrow-up-circle" label="Egresos" value={formatCOP(egresos)} color="#D32F2F" />
          </View>
          <View style={styles.kpiRow}>
            <KpiCard
              icon="chart-line"
              label="Flujo neto"
              value={formatCOP(utilidad)}
              color={utilidad >= 0 ? '#388E3C' : '#D32F2F'}
            />
            <KpiCard
              icon="package-variant-closed"
              label="Inventario"
              value={formatCOP(inventoryAssetValue)}
              color="#1976D2"
            />
          </View>
          <View style={styles.kpiRow}>
            <KpiCard
              icon="scale-balance"
              label="Flujo + inventario"
              value={formatCOP(flujoConInventario)}
              color={flujoConInventario >= 0 ? '#388E3C' : '#D32F2F'}
            />
          </View>
          <Text variant="bodySmall" style={[styles.txInfoText, styles.kpiHelperText]}>
            Estos indicadores explican caja: ingresos menos salidas y el inventario actual como activo del local.
          </Text>

          <Text variant="titleSmall" style={styles.kpiSectionTitle}>
            Rentabilidad de ventas
          </Text>
          <View style={styles.kpiRow}>
            <KpiCard
              icon="cash-register"
              label="Margen bruto"
              value={formatCOP(margenBruto)}
              color={margenBruto >= 0 ? '#388E3C' : '#D32F2F'}
            />
            <KpiCard
              icon="chart-timeline-variant"
              label="Margen operativo"
              value={formatCOP(resultadoOperativo)}
              color={resultadoOperativo >= 0 ? '#388E3C' : '#D32F2F'}
            />
          </View>
          <Text variant="bodySmall" style={[styles.txInfoText, styles.kpiHelperText]}>
            Esta lectura no se suma al flujo de caja: parte de las ventas a clientes y descuenta costo vendido, mermas y gastos operativos.
          </Text>

      <Card style={styles.txCard} mode="elevated">
        <Card.Content>
          <Text variant="titleSmall" style={{ fontWeight: '600', marginBottom: 8 }}>
            Desglose por centro de costo
          </Text>
          <View style={styles.txRow}>
            <Text variant="bodySmall">Ventas a clientes</Text>
            <Text variant="bodySmall" style={{ fontWeight: '600', color: '#388E3C' }}>
              +{formatCOP(salesIncome)}
            </Text>
          </View>
          {(isProductionCenter || internalTransferIncome > 0) && (
            <View style={styles.txRow}>
              <Text variant="bodySmall">Facturacion interna por traslados</Text>
              <Text variant="bodySmall" style={{ fontWeight: '600', color: '#388E3C' }}>
                +{formatCOP(internalTransferIncome)}
              </Text>
            </View>
          )}
          <Divider style={{ marginVertical: 8 }} />
          <View style={styles.txRow}>
            <Text variant="bodySmall">Gastos operativos</Text>
            <Text variant="bodySmall" style={{ fontWeight: '600', color: '#D32F2F' }}>
              -{formatCOP(operatingExpenses)}
            </Text>
          </View>
          {(isProductionCenter || purchaseExpenses > 0) && (
            <View style={styles.txRow}>
              <Text variant="bodySmall">Compras de insumos</Text>
              <Text variant="bodySmall" style={{ fontWeight: '600', color: '#D32F2F' }}>
                -{formatCOP(purchaseExpenses)}
              </Text>
            </View>
          )}
          {(!isProductionCenter || internalTransferExpenses > 0) && (
            <View style={styles.txRow}>
              <Text variant="bodySmall">Cargos internos por traslados</Text>
              <Text variant="bodySmall" style={{ fontWeight: '600', color: '#D32F2F' }}>
                -{formatCOP(internalTransferExpenses)}
              </Text>
            </View>
          )}
          <Divider style={{ marginVertical: 8 }} />
          <View style={styles.txRow}>
            <Text variant="bodySmall">Inventario valorizado</Text>
            <Text variant="bodySmall" style={{ fontWeight: '600', color: '#1976D2' }}>
              +{formatCOP(inventoryAssetValue)}
            </Text>
          </View>
          <View style={styles.txRow}>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Base de valorizacion
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Precio de traslado
            </Text>
          </View>
          <View style={styles.txRow}>
            <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>Resultado con inventario</Text>
            <Text
              variant="bodyMedium"
              style={{ fontWeight: 'bold', color: flujoConInventario >= 0 ? '#388E3C' : '#D32F2F' }}
            >
              {formatCOP(flujoConInventario)}
            </Text>
          </View>
        </Card.Content>
      </Card>

      <Card style={styles.txCard} mode="elevated">
        <Card.Content>
          <Text variant="titleSmall" style={{ fontWeight: '600', marginBottom: 8 }}>
            Informe de margen
          </Text>
          <Text variant="bodySmall" style={styles.txInfoText}>
            Vista de rentabilidad separada del flujo de caja. Parte de ventas a clientes y descuenta costo vendido, mermas y gastos operativos.
          </Text>
          <View style={styles.txRow}>
            <Text variant="bodySmall">Ventas a clientes</Text>
            <Text variant="bodySmall" style={{ fontWeight: '600', color: '#388E3C' }}>
              +{formatCOP(salesIncome)}
            </Text>
          </View>
          <Text variant="bodySmall" style={styles.txInfoText}>
            Total vendido a clientes en el periodo seleccionado. Es ingreso comercial del local.
          </Text>
          <View style={styles.txRow}>
            <Text variant="bodySmall">Costo vendido por recetas</Text>
            <Text variant="bodySmall" style={{ fontWeight: '600', color: '#D32F2F' }}>
              -{formatCOP(soldInventoryCost)}
            </Text>
          </View>
          <Text variant="bodySmall" style={styles.txInfoText}>
            Inventario consumido por las ventas, calculado con recetas, adiciones y empaques a precio de traslado.
          </Text>
          <View style={[styles.txRow, styles.txSubtotalRow]}>
            <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>Margen bruto</Text>
            <Text
              variant="bodyMedium"
              style={{ fontWeight: 'bold', color: margenBruto >= 0 ? '#388E3C' : '#D32F2F' }}
            >
              {formatCOP(margenBruto)}
            </Text>
          </View>
          <Text variant="bodySmall" style={styles.txInfoText}>
            Ventas menos costo vendido. Muestra si lo vendido cubre el producto consumido.
          </Text>
          <Divider style={{ marginVertical: 8 }} />
          <View style={styles.txRow}>
            <Text variant="bodySmall">Bajas y mermas aprobadas</Text>
            <Text variant="bodySmall" style={{ fontWeight: '600', color: '#D32F2F' }}>
              -{formatCOP(writeoffInventoryCost)}
            </Text>
          </View>
          <Text variant="bodySmall" style={styles.txInfoText}>
            Inventario descontado por bajas aprobadas, como dano, vencimiento, derrame o contaminacion.
          </Text>
          <View style={styles.txRow}>
            <Text variant="bodySmall">Gastos operativos</Text>
            <Text variant="bodySmall" style={{ fontWeight: '600', color: '#D32F2F' }}>
              -{formatCOP(operatingExpenses)}
            </Text>
          </View>
          <Text variant="bodySmall" style={styles.txInfoText}>
            Gastos registrados por la tienda. Tambien aparecen como egreso de caja, pero aqui se muestran dentro de rentabilidad para llegar al margen operativo.
          </Text>
          <View style={[styles.txRow, styles.txSubtotalRow]}>
            <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>Margen operativo</Text>
            <Text
              variant="bodyMedium"
              style={{ fontWeight: 'bold', color: resultadoOperativo >= 0 ? '#388E3C' : '#D32F2F' }}
            >
              {formatCOP(resultadoOperativo)}
            </Text>
          </View>
          <Text variant="bodySmall" style={styles.txInfoText}>
            Margen bruto menos mermas y gastos operativos. No se suma al flujo: responde si las ventas del periodo cubrieron producto consumido y gastos.
          </Text>
          <Divider style={{ marginVertical: 8 }} />
          <View style={styles.txRow}>
            <Text variant="bodySmall">Inventario actual como activo</Text>
            <Text variant="bodySmall" style={{ fontWeight: '600', color: '#1976D2' }}>
              +{formatCOP(inventoryAssetValue)}
            </Text>
          </View>
          <Text variant="bodySmall" style={styles.txInfoText}>
            Stock que todavia queda en el local, valorizado al precio de compra al centro de produccion.
          </Text>
          <View style={styles.txRow}>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Valorizado a precio de traslado
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              No usa costo interno
            </Text>
          </View>
        </Card.Content>
      </Card>

      {/* Nav buttons */}
      <View style={styles.navRow}>
        <Button
          mode="outlined"
          icon="wallet"
          onPress={() => router.push('/(tabs)/contabilidad/gastos')}
        >
          Gastos
        </Button>
        <Button
          mode="outlined"
          icon="bank"
          onPress={() => router.push('/(tabs)/contabilidad/bancos')}
        >
          Bancos
        </Button>
        <Button
          mode="outlined"
          icon="calendar-check"
          onPress={() => router.push('/(tabs)/contabilidad/cierres')}
        >
          Cierres
        </Button>
        <Button
          mode="outlined"
          icon="cart"
          onPress={() => router.push('/(tabs)/inventario/compras')}
        >
          Compras
        </Button>
        <Button
          mode="outlined"
          icon="scale-balance"
          onPress={() => router.push('/(tabs)/contabilidad/balances')}
        >
          Balances
        </Button>
        <Button
          mode="contained"
          icon="file-excel"
          buttonColor="#2E7D32"
          textColor="#FFFFFF"
          onPress={handleExportExcel}
        >
          Exportar Excel
        </Button>
      </View>

      {/* C1: Daily Audit / Arqueo Diario — solo para Hoy */}
      {period === 'hoy' && <Card style={styles.txCard} mode="elevated">
        <Card.Content>
          <Text variant="titleSmall" style={{ fontWeight: '600', marginBottom: 8 }}>
            Arqueo Diario
          </Text>
          <View style={styles.txRow}>
            <Text variant="bodySmall">Apertura</Text>
            <Text variant="bodySmall" style={{ fontWeight: '600' }}>{formatCOP(openingBase)}</Text>
          </View>
          <View style={styles.txRow}>
            <Text variant="bodySmall">+ Ventas Efectivo</Text>
            <Text variant="bodySmall" style={{ fontWeight: '600', color: '#388E3C' }}>{formatCOP(todayCashSales)}</Text>
          </View>
          <View style={styles.txRow}>
            <Text variant="bodySmall">- Egresos Efectivo</Text>
            <Text variant="bodySmall" style={{ fontWeight: '600', color: '#D32F2F' }}>{formatCOP(todayCashExpenses)}</Text>
          </View>
          <View style={[styles.txRow, { borderTopWidth: 1, borderTopColor: '#333', paddingTop: 6, marginTop: 4 }]}>
            <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>Saldo Teorico</Text>
            <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
              {formatCOP(openingBase + todayCashSales - todayCashExpenses)}
            </Text>
          </View>
          {closingActual !== null && (
            <View style={styles.txRow}>
              <Text variant="bodySmall">Conteo Fisico (cierre)</Text>
              <Text variant="bodySmall" style={{ fontWeight: '600' }}>{formatCOP(closingActual)}</Text>
            </View>
          )}
        </Card.Content>
      </Card>}

      {/* Recent transactions */}
      <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600' }]}>
        Transacciones Recientes
      </Text>

      {recentSales.map((sale) => (
        <Card key={sale.id} style={styles.txCard} mode="elevated">
          <Card.Content style={styles.txRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text variant="bodyMedium" style={{ fontWeight: '600' }}>Venta</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {formatDateTime(sale.timestamp)}
              </Text>
            </View>
            <Text variant="bodyMedium" style={{ fontWeight: '600', color: '#388E3C', flexShrink: 0, marginRight: 4 }}>
              +{formatCOP(sale.totalAmount)}
            </Text>
            <IconButton
              icon="delete-outline"
              size={18}
              iconColor="#D32F2F"
              onPress={() => handleDeleteSale(sale)}
              style={{ margin: 0 }}
            />
          </Card.Content>
        </Card>
      ))}

      {recentExpenses.map((expense) => (
        <Card key={expense.id} style={styles.txCard} mode="elevated">
          <Card.Content style={styles.txRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text variant="bodyMedium" style={{ fontWeight: '600' }}>{expense.category}</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={2}>
                {expense.description}
              </Text>
            </View>
            <Text variant="bodyMedium" style={{ fontWeight: '600', color: '#D32F2F', flexShrink: 0, marginRight: 4 }}>
              -{formatCOP(expense.amount)}
            </Text>
            <IconButton
              icon="pencil-outline"
              size={18}
              iconColor="#FF9800"
              onPress={() => handleEditExpense(expense)}
              style={{ margin: 0 }}
            />
            <IconButton
              icon="delete-outline"
              size={18}
              iconColor="#D32F2F"
              onPress={() => handleDeleteExpense(expense)}
              style={{ margin: 0 }}
            />
          </Card.Content>
        </Card>
      ))}

      {recentPurchases.map((purchase) => (
        <Card key={purchase.id} style={styles.txCard} mode="elevated">
          <Card.Content style={styles.txRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text variant="bodyMedium" style={{ fontWeight: '600' }}>Compra de insumos</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={2}>
                {formatDateTime(purchase.timestamp)} · {purchase.supplier}
              </Text>
            </View>
            <Text variant="bodyMedium" style={{ fontWeight: '600', color: '#D32F2F', flexShrink: 0, marginRight: 4 }}>
              -{formatCOP(purchase.priceCOP)}
            </Text>
          </Card.Content>
        </Card>
      ))}

      {recentIncomingTransfers.map((transfer) => (
        <Card key={transfer.id} style={styles.txCard} mode="elevated">
          <Card.Content style={styles.txRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text variant="bodyMedium" style={{ fontWeight: '600' }}>Traslado recibido</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={2}>
                {formatTransferDate(transfer)} · {getStoreName(transfer.fromStoreId)}
              </Text>
            </View>
            <Text variant="bodyMedium" style={{ fontWeight: '600', color: '#D32F2F', flexShrink: 0, marginRight: 4 }}>
              -{formatCOP(transfer.totalPriceCop ?? 0)}
            </Text>
          </Card.Content>
        </Card>
      ))}

      {recentOutgoingTransfers.map((transfer) => (
        <Card key={transfer.id} style={styles.txCard} mode="elevated">
          <Card.Content style={styles.txRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text variant="bodyMedium" style={{ fontWeight: '600' }}>Traslado facturado</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={2}>
                {formatTransferDate(transfer)} · {getStoreName(transfer.toStoreId)}
              </Text>
            </View>
            <Text variant="bodyMedium" style={{ fontWeight: '600', color: '#388E3C', flexShrink: 0, marginRight: 4 }}>
              +{formatCOP(transfer.totalPriceCop ?? 0)}
            </Text>
          </Card.Content>
        </Card>
      ))}
            </>
          )}
        </>
      )}

      <View style={{ height: 100 }} />

      {/* Cash Audit Modal */}
      <Portal>
        <Modal
          visible={auditModalVisible}
          onDismiss={() => {
            if (!auditSaving) {
              setAuditModalVisible(false);
              setAuditError('');
            }
          }}
          contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}
        >
          <Text variant="titleLarge" style={{ fontWeight: 'bold', marginBottom: 4 }}>
            Registrar conteo real
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>
            Guarda el saldo real de caja para el centro de costo aplicado. Si la fecha ya existe, se actualiza.
          </Text>
          <TextInput
            label="Fecha"
            value={auditDate}
            onChangeText={setAuditDate}
            mode="outlined"
            dense
            placeholder="YYYY-MM-DD"
            style={{ marginBottom: 12 }}
          />
          <CurrencyInput
            value={auditActualTotal}
            onChangeValue={setAuditActualTotal}
            label="Valor real contado"
          />
          <TextInput
            label="Notas"
            value={auditNotes}
            onChangeText={setAuditNotes}
            mode="outlined"
            multiline
            numberOfLines={3}
            style={{ marginTop: 12 }}
          />
          {!!auditError && (
            <Text variant="bodySmall" style={{ color: '#D32F2F', marginTop: 12 }}>
              {auditError}
            </Text>
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
            <Button
              mode="text"
              disabled={auditSaving}
              onPress={() => {
                setAuditModalVisible(false);
                setAuditError('');
              }}
            >
              Cancelar
            </Button>
            <Button
              mode="contained"
              buttonColor="#E63946"
              textColor="#FFFFFF"
              loading={auditSaving}
              disabled={auditSaving}
              onPress={handleSaveCashAudit}
            >
              Guardar
            </Button>
          </View>
        </Modal>
      </Portal>

      {/* Edit Expense Modal */}
      <Portal>
        <Modal
          visible={editModalVisible}
          onDismiss={() => setEditModalVisible(false)}
          contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}
        >
          <Text variant="titleLarge" style={{ fontWeight: 'bold', marginBottom: 4 }}>
            Editar Gasto
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>
            {editingExpense?.category}
          </Text>
          <TextInput
            label="Descripcion"
            value={editDescription}
            onChangeText={setEditDescription}
            mode="outlined"
            style={{ marginBottom: 12 }}
          />
          <CurrencyInput
            value={editAmount}
            onChangeValue={setEditAmount}
            label="Monto"
          />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
            <Button mode="text" onPress={() => setEditModalVisible(false)}>
              Cancelar
            </Button>
            <Button
              mode="contained"
              buttonColor="#E63946"
              textColor="#FFFFFF"
              onPress={handleSaveEdit}
            >
              Guardar
            </Button>
          </View>
        </Modal>
      </Portal>

      {/* Delete Expense Modal */}
      <Portal>
        <Modal
          visible={deleteExpenseModalVisible}
          onDismiss={() => {
            if (!isDeletingExpense) {
              setDeleteExpenseModalVisible(false);
              setDeletingExpense(null);
              setDeleteExpenseError('');
            }
          }}
          contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}
        >
          <Text variant="titleLarge" style={{ fontWeight: 'bold', marginBottom: 8 }}>
            Eliminar gasto
          </Text>
          <Text variant="bodyMedium" style={{ marginBottom: 4 }}>
            {deletingExpense?.category}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
            {deletingExpense?.description || 'Sin descripcion'} · {formatCOP(deletingExpense?.amount ?? 0)}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
            Esta accion quita el gasto de contabilidad y recalcula el reporte del periodo.
          </Text>
          {!!deleteExpenseError && (
            <Text variant="bodySmall" style={{ color: '#D32F2F', marginBottom: 12 }}>
              {deleteExpenseError}
            </Text>
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
            <Button
              mode="text"
              disabled={isDeletingExpense}
              onPress={() => {
                setDeleteExpenseModalVisible(false);
                setDeletingExpense(null);
                setDeleteExpenseError('');
              }}
            >
              Cancelar
            </Button>
            <Button
              mode="contained"
              buttonColor="#D32F2F"
              textColor="#FFFFFF"
              loading={isDeletingExpense}
              disabled={isDeletingExpense}
              onPress={handleConfirmDeleteExpense}
            >
              Eliminar
            </Button>
          </View>
        </Modal>
      </Portal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 16,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  kpiSectionTitle: {
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 4,
  },
  kpiHelperText: {
    marginBottom: 12,
    marginTop: -4,
  },
  periodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  rangeFilter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  rangeInput: {
    minWidth: 145,
    flexGrow: 1,
  },
  rangeButton: {
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  rangeHint: {
    width: '100%',
    color: '#A9A3A0',
    lineHeight: 17,
  },
  applyRow: {
    gap: 8,
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  navRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  viewTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  txCard: {
    borderRadius: 8,
    marginBottom: 8,
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  txSubtotalRow: {
    borderTopWidth: 1,
    borderTopColor: '#333',
    marginTop: 6,
    paddingTop: 6,
  },
  txInfoText: {
    color: '#A9A3A0',
    lineHeight: 17,
    marginTop: 2,
    marginBottom: 8,
  },
  auditGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  auditCell: {
    minWidth: 96,
    flexBasis: '30%',
    flexGrow: 1,
  },
  auditValue: {
    fontWeight: '700',
  },
  modal: {
    margin: 16,
    padding: 20,
    borderRadius: 16,
  },
});
