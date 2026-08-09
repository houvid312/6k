import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Alert, Platform, ScrollView } from 'react-native';
import { Card, Text, Button, Chip, Divider, IconButton, Portal, Modal, TextInput, useTheme } from 'react-native-paper';
import { router, useFocusEffect } from 'expo-router';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { KpiCard } from '../../../src/components/common/KpiCard';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { CurrencyInput } from '../../../src/components/common/CurrencyInput';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { Sale, Expense, Purchase, Transfer, CashClosing, CashAuditEntry, DenominationCount, Income } from '../../../src/domain/entities';
import { DenominationCounter } from '../../../src/components/ventas/DenominationCounter';
import { InventoryLevel, PaymentMethod, ClosingStatus } from '../../../src/domain/enums';
import { formatCOP } from '../../../src/utils/currency';
import { formatDate, formatDateTime, toISODate, toISODateTZ, todayColombia } from '../../../src/utils/dates';
import { supabase } from '../../../src/lib/supabase';

function getColombiaDateKey(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00-05:00`);
  if (isNaN(d.getTime())) return dateStr.split('T')[0];
  return toISODateTZ(d);
}

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
  status: CashClosing['status'] | 'AUDIT' | 'DRAFT';
  source: 'CLOSING' | 'MANUAL';
  openingBase: number;
  expectedTotal: number;
  expenses: number;
  theoreticalTotal: number;
  actualTotal: number;
  discrepancy: number;
  notes: string;
  bills100k: number;
  bills50k: number;
  bills20k: number;
  bills10k: number;
  bills5k: number;
  bills2k: number;
  coins: number;
  bankTotal: number;
  cartera: number;
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

function getYearToDateRange() {
  const today = todayColombia();
  const currentDate = new Date(`${today}T12:00:00`);
  return {
    start: `${currentDate.getFullYear()}-01-01`,
    end: today,
  };
}

function getClosingStatusLabel(status: CashClosing['status'] | 'AUDIT' | 'DRAFT'): string {
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
    productRepo,
    creditRepo,
    incomeRepo,
  } = useDI();
  const { selectedStoreId, stores, userRole, setSelectedStore } = useAppStore();
  const selectedStore = stores.find((s) => s.id === selectedStoreId);
  const isGerente = userRole === 'GERENTE';

  type ContaPeriod = 'hoy' | 'ayer' | 'semana' | 'mes' | 'año' | 'rango';
  const [period, setPeriod] = useState<ContaPeriod>('año');
  const [filterPeriod, setFilterPeriod] = useState<ContaPeriod>('año');
  const [appliedStoreId, setAppliedStoreId] = useState(
    userRole === 'GERENTE' ? 'consolidado' : selectedStoreId
  );
  const appliedStore = stores.find((s) => s.id === appliedStoreId) ?? selectedStore;
  const isProductionCenter = appliedStore?.isProductionCenter ?? false;
  const initialRange = getYearToDateRange();
  const [rangeStartDraft, setRangeStartDraft] = useState(initialRange.start);
  const [rangeEndDraft, setRangeEndDraft] = useState(initialRange.end);
  const [rangeStartDate, setRangeStartDate] = useState(initialRange.start);
  const [rangeEndDate, setRangeEndDate] = useState(initialRange.end);
  const [activeView, setActiveView] = useState<'general' | 'diaria' | 'rentabilidad'>('general');

  const [ingresos, setIngresos] = useState(0);
  const [egresos, setEgresos] = useState(0);
  const [generalIngresos, setGeneralIngresos] = useState(0);
  const [generalEgresos, setGeneralEgresos] = useState(0);
  const [salesIncome, setSalesIncome] = useState(0);
  const [fixedExpenses, setFixedExpenses] = useState(0);
  const [variableExpenses, setVariableExpenses] = useState(0);
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
  const [reportIncomes, setReportIncomes] = useState<Income[]>([]);
  const [reportPurchases, setReportPurchases] = useState<Purchase[]>([]);
  const [reportIncomingTransfers, setReportIncomingTransfers] = useState<Transfer[]>([]);
  const [reportOutgoingTransfers, setReportOutgoingTransfers] = useState<Transfer[]>([]);
  const [inventoryValuationRows, setInventoryValuationRows] = useState<InventoryValuationRow[]>([]);
  const [writeoffValuationRows, setWriteoffValuationRows] = useState<WriteoffValuationRow[]>([]);
  const [cashAuditRows, setCashAuditRows] = useState<CashAuditRow[]>([]);
  const [cashAuditYear, setCashAuditYear] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasAppliedFilter, setHasAppliedFilter] = useState(true);

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
  const [auditDenominations, setAuditDenominations] = useState<DenominationCount>({
    bills100k: 0,
    bills50k: 0,
    bills20k: 0,
    bills10k: 0,
    bills5k: 0,
    bills2k: 0,
    coins: 0,
  });
  const [auditBankTotal, setAuditBankTotal] = useState(0);
  const [auditCartera, setAuditCartera] = useState(0);
  const [dbCartera, setDbCartera] = useState(0);
  const [dbCuentasPorPagar, setDbCuentasPorPagar] = useState(0);
  const [reportClosings, setReportClosings] = useState<CashClosing[]>([]);
  const [openingsMap, setOpeningsMap] = useState<Record<string, number>>({});

  // States for general cash breakdown
  const [latestTheoreticalCash, setLatestTheoreticalCash] = useState(0);
  const [latestTheoreticalBank, setLatestTheoreticalBank] = useState(0);
  const [latestTheoreticalCartera, setLatestTheoreticalCartera] = useState(0);
  const [latestTheoreticalBase, setLatestTheoreticalBase] = useState(0);
  const [auditBase, setAuditBase] = useState(0);

  // States for verification and approval modal
  const [approvingClosing, setApprovingClosing] = useState<CashClosing | null>(null);
  const [closingDenoms, setClosingDenoms] = useState<DenominationCount>({
    bills100k: 0,
    bills50k: 0,
    bills20k: 0,
    bills10k: 0,
    bills5k: 0,
    bills2k: 0,
    coins: 0,
  });
  const [closingBankTotal, setClosingBankTotal] = useState(0);
  const [closingExpenses, setClosingExpenses] = useState(0);
  const [closingDate, setClosingDate] = useState('');
  const [closingExpected, setClosingExpected] = useState(0);
  const [closingOpeningBase, setClosingOpeningBase] = useState(0);
  const [closingCreditSales, setClosingCreditSales] = useState(0);

  // Helper date function for chronological lists
  const getDatesInRange = (startStr: string, endStr: string) => {
    const dates: string[] = [];
    const curr = new Date(`${startStr}T12:00:00`);
    const end = new Date(`${endStr}T12:00:00`);
    while (curr <= end) {
      const y = curr.getFullYear();
      const m = String(curr.getMonth() + 1).padStart(2, '0');
      const d = String(curr.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${d}`);
      curr.setDate(curr.getDate() + 1);
    }
    return dates;
  };

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
      } else if (period === 'año') {
        const d = new Date(today + 'T12:00:00');
        startDate = `${d.getFullYear()}-01-01`;
        endDate = today;
      } else {
        startDate = rangeStartDate;
        endDate = rangeEndDate;
      }

      const endDateTime = `${endDate}T23:59:59`;
      let sales: Sale[] = [];
      let allExpenses: Expense[] = [];
      let allIncomes: Income[] = [];
      let purchases: Purchase[] = [];
      let incomingTransfers: Transfer[] = [];
      let outgoingTransfers: Transfer[] = [];
      let storeInventory: any[] = [];
      let approvedWriteoffs: any[] = [];

      if (appliedStoreId === 'consolidado') {
        const fetchPromises = stores.map(async (store) => {
          const [s, e, p, inc, out, inv, wo, closings, audits, inco] = await Promise.all([
            saleService.getSalesByDateRange(store.id, startDate, endDateTime),
            expenseRepo.getByDateRange(store.id, startDate, endDateTime),
            purchaseRepo.getByDateRange(startDate, endDateTime, store.id),
            transferRepo.getReceivedByDestination(store.id, startDate, endDate),
            transferRepo.getReceivedByOrigin(store.id, startDate, endDate),
            inventoryRepo.getByStore(store.id, InventoryLevel.STORE),
            writeoffRepo.getApprovedByStoreAndDateRange(store.id, startDate, endDate),
            cashClosingService.getClosingsByDateRange(store.id, startDate, endDate),
            cashAuditRepo.getByDateRange(store.id, startDate, endDate),
            incomeRepo.getByDateRange(store.id, startDate, endDate),
          ]);
          return { s, e, p, inc, out, inv, wo, closings, audits, inco, storeIsProd: store.isProductionCenter };
        });

        const results = await Promise.all(fetchPromises);
        for (const res of results) {
          sales = [...sales, ...res.s];
          allExpenses = [...allExpenses, ...res.e];
          purchases = [...purchases, ...res.p];
          incomingTransfers = [...incomingTransfers, ...res.inc];
          if (res.storeIsProd) {
            outgoingTransfers = [...outgoingTransfers, ...res.out];
          }
          storeInventory = [...storeInventory, ...res.inv];
          approvedWriteoffs = [...approvedWriteoffs, ...res.wo];
          allIncomes = [...allIncomes, ...res.inco];
        }
      } else {
        const [s, e, p, inc, out, inv, wo, closings, audits, inco] = await Promise.all([
          saleService.getSalesByDateRange(appliedStoreId, startDate, endDateTime),
          expenseRepo.getByDateRange(appliedStoreId, startDate, endDateTime),
          purchaseRepo.getByDateRange(startDate, endDateTime, appliedStoreId),
          transferRepo.getReceivedByDestination(appliedStoreId, startDate, endDate),
          transferRepo.getReceivedByOrigin(appliedStoreId, startDate, endDate),
          inventoryRepo.getByStore(appliedStoreId, InventoryLevel.STORE),
          writeoffRepo.getApprovedByStoreAndDateRange(appliedStoreId, startDate, endDate),
          cashClosingService.getClosingsByDateRange(appliedStoreId, startDate, endDate),
          cashAuditRepo.getByDateRange(appliedStoreId, startDate, endDate),
          incomeRepo.getByDateRange(appliedStoreId, startDate, endDate),
        ]);
        sales = s;
        allExpenses = e;
        purchases = p;
        incomingTransfers = inc;
        outgoingTransfers = out;
        storeInventory = inv;
        approvedWriteoffs = wo;
        allIncomes = inco;
      }

      allExpenses = allExpenses.filter((exp) => exp.category !== 'Adelanto');

      const totalRevenue = sales.reduce((sum, s) => sum + s.totalAmount, 0);
      const totalExpenses = allExpenses.reduce((sum, e) => sum + e.amount, 0);
      const totalPurchases = purchases.reduce((sum, p) => sum + p.priceCOP, 0);
      const totalIncomingTransfers = incomingTransfers.reduce((sum, t) => sum + (t.totalPriceCop ?? 0), 0);
      const totalOutgoingTransfers = isProductionCenter || appliedStoreId === 'consolidado'
        ? outgoingTransfers.reduce((sum, t) => sum + (t.totalPriceCop ?? 0), 0)
        : 0;

      const [, supplies, recipes,, products] = await Promise.all([
        null,
        supplyRepo.getAll(false),
        recipeRepo.getAll(),
        null,
        productRepo.getAll(),
      ]);
      const suppliesById = new Map(supplies.map((supply) => [supply.id, supply]));
      const productsById = new Map(products.map((product) => [product.id, product]));

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
        .map((writeoff): WriteoffValuationRow => {
          let supplyName = 'Insumo';
          let totalValueCop = 0;

          if (writeoff.productId) {
            const product = productsById.get(writeoff.productId);
            supplyName = product ? `${product.name} (Porciones)` : 'Producto';

            const recipe = recipes.find((r) => r.productId === writeoff.productId);
            if (recipe) {
              totalValueCop = recipe.ingredients.reduce(
                (sum, ingredient) =>
                  sum + valueQuantityAtStorePrice(ingredient.supplyId, ingredient.gramsPerPortion * writeoff.quantityGrams),
                0,
              );
            }
          } else if (writeoff.supplyId) {
            const supply = suppliesById.get(writeoff.supplyId);
            supplyName = supply?.name ?? 'Insumo';
            totalValueCop = valueQuantityAtStorePrice(writeoff.supplyId, writeoff.quantityGrams);
          }

          return {
            date: formatDateTime(writeoff.createdAt),
            supplyName,
            quantityGrams: writeoff.quantityGrams,
            reason: writeoff.reason,
            notes: writeoff.notes,
            totalValueCop,
          };
        })
        .sort((a, b) => b.totalValueCop - a.totalValueCop);

      const totalWriteoffInventoryCost = currentWriteoffRows.reduce(
        (sum, writeoff) => sum + writeoff.totalValueCop,
        0,
      );

      const periodIncome = totalRevenue + totalOutgoingTransfers;
      const periodExpenses = totalExpenses + totalPurchases + totalIncomingTransfers;
      const auditYear = String(new Date(`${endDate}T12:00:00`).getFullYear());
      const auditYearStart = `${auditYear}-01-01`;
      let auditRows: CashAuditRow[] = [];
      let cashAuditYearValue = auditYear;

      if (appliedStoreId !== 'consolidado') {
        const anchorDate = '2020-01-01';

        const [credits, closings, audits, openingsRes, ledgerExpenses, ledgerPurchases, creditPaymentsRes, ledgerIncomes] = await Promise.all([
          creditRepo.getAll(),
          cashClosingService.getClosingsByDateRange(appliedStoreId, anchorDate, endDate),
          cashAuditRepo.getByDateRange(appliedStoreId, anchorDate, endDate),
          supabase
            .from('cash_openings')
            .select('date,total')
            .eq('store_id', appliedStoreId)
            .gte('date', anchorDate)
            .lte('date', (() => { const p = endDate.split('-'); const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })()),
          expenseRepo.getByDateRange(appliedStoreId, anchorDate, endDate),
          purchaseRepo.getByDateRange(anchorDate, endDate, appliedStoreId),
          supabase
            .from('credit_payments')
            .select('*, credit_entries(debtor_type, store_id)')
            .gte('date', anchorDate)
            .lte('date', endDate),
          incomeRepo.getByDateRange(appliedStoreId, anchorDate, endDate),
        ]);

        const openingsObj = Object.fromEntries(
          (openingsRes.data || []).map((o: any) => [o.date, o.total])
        );
        setOpeningsMap(openingsObj);

        const openingsByDate = new Map<string, number>(
          (openingsRes.data || []).map((o: any) => [o.date, o.total])
        );

        const appliedStore = stores.find(s => s.id === appliedStoreId);
        const isProd = appliedStore?.isProductionCenter ?? false;

        const totalCartera = isProd
          ? credits.filter(c => c.debtorType === 'LOCAL' && c.balance > 0).reduce((sum, c) => sum + c.balance, 0)
          : credits.filter(c => c.storeId === appliedStoreId && c.debtorType !== 'LOCAL' && c.balance > 0).reduce((sum, c) => sum + c.balance, 0);

        const totalCuentasPorPagar = isProd
          ? 0
          : credits.filter(c => c.storeId === appliedStoreId && c.debtorType === 'LOCAL' && c.balance > 0).reduce((sum, c) => sum + c.balance, 0);

        setDbCartera(totalCartera);
        setDbCuentasPorPagar(totalCuentasPorPagar);
        setReportClosings(closings.filter(c => c.date >= startDate));
        let runningCash = 0;
        let runningBank = 0;
        let runningCartera = 0;
        let runningBaseLocal = 0;
        let previousBase = 0;

        const dates = getDatesInRange(anchorDate, endDate);

        const closingsByDate = new Map(closings.map(c => [c.date, c]));
        const auditsByDate = new Map(audits.map(a => [a.date, a]));

        // Segment expenses and purchases by date and payment method
        const cashExpensesByDate = new Map<string, number>();
        const bankExpensesByDate = new Map<string, number>();
        const cashAdvancesByDate = new Map<string, number>();
        const bankAdvancesByDate = new Map<string, number>();
        for (const exp of ledgerExpenses) {
          const expDate = getColombiaDateKey(exp.date);
          if (exp.category === 'Adelanto') {
            if (exp.paymentMethod === PaymentMethod.EFECTIVO) {
              cashAdvancesByDate.set(expDate, (cashAdvancesByDate.get(expDate) ?? 0) + exp.amount);
            } else {
              bankAdvancesByDate.set(expDate, (bankAdvancesByDate.get(expDate) ?? 0) + exp.amount);
            }
          } else if (exp.category === 'Compra Turno') {
            // Exclude Compra Turno as it is already included in closing.expenses
          } else {
            if (exp.paymentMethod === PaymentMethod.EFECTIVO) {
              cashExpensesByDate.set(expDate, (cashExpensesByDate.get(expDate) ?? 0) + exp.amount);
            } else {
              bankExpensesByDate.set(expDate, (bankExpensesByDate.get(expDate) ?? 0) + exp.amount);
            }
          }
        }

        const cashPurchasesByDate = new Map<string, number>();
        const bankPurchasesByDate = new Map<string, number>();
        for (const pur of ledgerPurchases) {
          const purDate = getColombiaDateKey(pur.timestamp);
          if (pur.paymentMethod === PaymentMethod.EFECTIVO) {
            cashPurchasesByDate.set(purDate, (cashPurchasesByDate.get(purDate) ?? 0) + pur.priceCOP);
          } else {
            bankPurchasesByDate.set(purDate, (bankPurchasesByDate.get(purDate) ?? 0) + pur.priceCOP);
          }
        }

        // Segment incomes by date and payment method
        const cashIncomesByDate = new Map<string, number>();
        const bankIncomesByDate = new Map<string, number>();
        for (const inc of ledgerIncomes) {
          const incDate = getColombiaDateKey(inc.date);
          if (inc.paymentMethod === PaymentMethod.EFECTIVO) {
            cashIncomesByDate.set(incDate, (cashIncomesByDate.get(incDate) ?? 0) + inc.amount);
          } else {
            bankIncomesByDate.set(incDate, (bankIncomesByDate.get(incDate) ?? 0) + inc.amount);
          }
        }

        // Segment credit payments (abonos) by date and payment method
        const cashPaymentsByDate = new Map<string, number>();
        const bankPaymentsByDate = new Map<string, number>();
        const totalPaymentsByDate = new Map<string, number>();
        const cpOutflowPaymentsByDate = new Map<string, number>();

        const creditPayments = (creditPaymentsRes.data || []) as any[];
        for (const p of creditPayments) {
          const entry = p.credit_entries;
          if (!entry) continue;

          // Skip non-confirmed payments (pending/rejected)
          const isConfirmed = p.status === 'CONFIRMED';
          if (!isConfirmed) continue;

          const pDate = getColombiaDateKey(p.date);
          const isCpCredit = entry.debtor_type === 'LOCAL';

          if (isProd) {
            if (isCpCredit) {
              // ONLY add to bank/total payments if this payment does NOT have an associated income record
              if (!p.income_id) {
                bankPaymentsByDate.set(pDate, (bankPaymentsByDate.get(pDate) ?? 0) + p.amount);
              }
              totalPaymentsByDate.set(pDate, (totalPaymentsByDate.get(pDate) ?? 0) + p.amount);
            }
          } else {
            if (entry.store_id === appliedStoreId) {
              if (isCpCredit) {
                // Outflow payment made to CP
                cpOutflowPaymentsByDate.set(pDate, (cpOutflowPaymentsByDate.get(pDate) ?? 0) + p.amount);
              } else {
                // Inflow payment from customer
                if (p.payment_method === PaymentMethod.EFECTIVO) {
                  cashPaymentsByDate.set(pDate, (cashPaymentsByDate.get(pDate) ?? 0) + p.amount);
                } else {
                  bankPaymentsByDate.set(pDate, (bankPaymentsByDate.get(pDate) ?? 0) + p.amount);
                }
                totalPaymentsByDate.set(pDate, (totalPaymentsByDate.get(pDate) ?? 0) + p.amount);
              }
            }
          }
        }

        // Segment credits by date
        const creditsByDate = new Map<string, number>();
        const creditSalesByDate = new Map<string, number>();
        for (const c of credits) {
          const cDate = getColombiaDateKey(c.date);
          const isCpCredit = c.debtorType === 'LOCAL';

          if (isProd) {
            if (isCpCredit) {
              creditsByDate.set(cDate, (creditsByDate.get(cDate) ?? 0) + c.amount);
            }
          } else {
            if (c.storeId === appliedStoreId && !isCpCredit) {
              creditsByDate.set(cDate, (creditsByDate.get(cDate) ?? 0) + c.amount);
              creditSalesByDate.set(cDate, (creditSalesByDate.get(cDate) ?? 0) + c.amount);
            }
          }
        }

        const calculatedAudits: CashAuditRow[] = [];
        let sumIngresosGral = 0;
        let sumEgresosGral = 0;

        for (const date of dates) {
          const closing = closingsByDate.get(date);
          const audit = auditsByDate.get(date);

          const isApproved = closing && (closing.status === ClosingStatus.APPROVED || closing.status === ClosingStatus.CONFIRMED);

          const generalCashExp = (cashExpensesByDate.get(date) ?? 0) + (cashPurchasesByDate.get(date) ?? 0);
          const generalBankExp = (bankExpensesByDate.get(date) ?? 0) + (bankPurchasesByDate.get(date) ?? 0);

          const cashPayToday = cashPaymentsByDate.get(date) ?? 0;
          const bankPayToday = bankPaymentsByDate.get(date) ?? 0;
          const totalPayToday = totalPaymentsByDate.get(date) ?? 0;
          const cpOutflowPayToday = cpOutflowPaymentsByDate.get(date) ?? 0;
          const newCreditsToday = creditsByDate.get(date) ?? 0;
          const creditSalesToday = creditSalesByDate.get(date) ?? 0;

          const dayBankSales = (isApproved ? closing.bankTotal : 0);
          const effectiveClosingBank = (closing && closing.bankTotal > 0) ? closing.bankTotal : 0;

          const salesTransferCash = isApproved ? (closing.expectedTotal - effectiveClosingBank - creditSalesToday - closing.expenses) : 0;
          const salesTransferBank = isApproved ? effectiveClosingBank : 0;

          const registeredOpening = openingsByDate.get(date);
          const openingBaseVal = openingsByDate.get(date) ?? 100000;
          const theoreticalBaseToday = registeredOpening !== undefined ? registeredOpening : (isApproved ? openingBaseVal : runningBaseLocal);
          const baseAdjustmentToCash = (previousBase === 0) ? 0 : (previousBase - theoreticalBaseToday);

          const cashAdvancesToday = cashAdvancesByDate.get(date) ?? 0;
          const bankAdvancesToday = bankAdvancesByDate.get(date) ?? 0;
          const generalCashIncomeToday = cashIncomesByDate.get(date) ?? 0;
          const generalBankIncomeToday = bankIncomesByDate.get(date) ?? 0;

          const grossInflowToday = (isApproved ? closing.expectedTotal : 0) + generalCashIncomeToday + generalBankIncomeToday;
          const grossOutflowToday = (isApproved ? Math.max(0, closing.expenses - cashAdvancesToday) : 0) + generalCashExp + generalBankExp;

          if (date >= startDate) {
            sumIngresosGral += grossInflowToday;
            sumEgresosGral += grossOutflowToday;
          }

          const theoreticalCashToday = runningCash + salesTransferCash + generalCashIncomeToday - generalCashExp + cashPayToday + baseAdjustmentToCash;
          const theoreticalBankToday = runningBank + salesTransferBank + generalBankIncomeToday - generalBankExp - bankAdvancesToday + bankPayToday - cpOutflowPayToday;
          const theoreticalCarteraToday = runningCartera + newCreditsToday - totalPayToday;
          const theoreticalToday = theoreticalCashToday + theoreticalBankToday + theoreticalCarteraToday + theoreticalBaseToday;

          // Pure cumulative math update with base conservation
          runningCash = theoreticalCashToday;
          runningBank = theoreticalBankToday;
          runningCartera = theoreticalCarteraToday;
          runningBaseLocal = theoreticalBaseToday;
          previousBase = theoreticalBaseToday;

          if (audit && date >= startDate) {
            calculatedAudits.push({
              date,
              status: 'AUDIT',
              source: 'MANUAL',
              openingBase: theoreticalBaseToday,
              expectedTotal: grossInflowToday,
              expenses: grossOutflowToday,
              theoreticalTotal: theoreticalToday,
              actualTotal: audit.actualTotal,
              discrepancy: audit.actualTotal - theoreticalToday,
              notes: audit.notes ?? '',
              bills100k: audit.bills100k ?? 0,
              bills50k: audit.bills50k ?? 0,
              bills20k: audit.bills20k ?? 0,
              bills10k: audit.bills10k ?? 0,
              bills5k: audit.bills5k ?? 0,
              bills2k: audit.bills2k ?? 0,
              coins: audit.coins ?? 0,
              bankTotal: audit.bankTotal,
              cartera: audit.cartera,
            });
          } else if (date >= startDate) {
            calculatedAudits.push({
              date,
              status: closing ? closing.status : 'DRAFT',
              source: 'CLOSING',
              openingBase: theoreticalBaseToday,
              expectedTotal: grossInflowToday,
              expenses: grossOutflowToday,
              theoreticalTotal: theoreticalToday,
              actualTotal: theoreticalToday,
              discrepancy: 0,
              notes: '',
              bills100k: 0,
              bills50k: 0,
              bills20k: 0,
              bills10k: 0,
              bills5k: 0,
              bills2k: 0,
              coins: 0,
              bankTotal: runningBank,
              cartera: runningCartera,
            });
          }

          if (date === dates[dates.length - 1]) {
            setLatestTheoreticalCash(runningCash);
            setLatestTheoreticalBank(runningBank);
            setLatestTheoreticalCartera(runningCartera);
            setLatestTheoreticalBase(runningBaseLocal);
          }
        }

        setGeneralIngresos(sumIngresosGral);
        setGeneralEgresos(sumEgresosGral);
        if (dates.length === 0) {
          setLatestTheoreticalCash(0);
          setLatestTheoreticalBank(0);
          setLatestTheoreticalCartera(0);
          setLatestTheoreticalBase(0);
        }
        auditRows = calculatedAudits;
      } else {
        setGeneralIngresos(periodIncome);
        setGeneralEgresos(periodExpenses);
      }

      const fixed = allExpenses.filter(e => e.isFixed).reduce((sum, e) => sum + e.amount, 0);
      const variable = allExpenses.filter(e => !e.isFixed).reduce((sum, e) => sum + e.amount, 0);
      setFixedExpenses(fixed);
      setVariableExpenses(variable);

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
      setReportIncomes(allIncomes);
      setReportPurchases(purchases);
      setReportIncomingTransfers(incomingTransfers);
      setReportOutgoingTransfers(isProductionCenter || appliedStoreId === 'consolidado' ? outgoingTransfers : []);
      setInventoryValuationRows(currentInventoryRows);
      setWriteoffValuationRows(currentWriteoffRows);
      setCashAuditRows([...auditRows].reverse());
      setCashAuditYear(cashAuditYearValue);

      // Transacciones del periodo (últimas 10)
      setRecentSales(sales.slice(0, 10));
      setRecentExpenses(allExpenses.slice(0, 10));
      setRecentPurchases(purchases.slice(0, 10));
      setRecentIncomingTransfers(incomingTransfers.slice(0, 10));
      setRecentOutgoingTransfers(isProductionCenter || appliedStoreId === 'consolidado' ? outgoingTransfers.slice(0, 10) : []);

      // C1: Daily audit data (solo para hoy)
      if (period === 'hoy' && appliedStoreId !== 'consolidado') {
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

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useEffect(() => {
    if (selectedStoreId && selectedStoreId !== appliedStoreId) {
      setAppliedStoreId(selectedStoreId);
    }
  }, [selectedStoreId, appliedStoreId]);

  useEffect(() => {
    if (!isGerente && activeView === 'rentabilidad') {
      setActiveView('general');
    }
  }, [activeView, isGerente]);

  const utilidad = ingresos - egresos;
  const flujoConInventario = utilidad + inventoryAssetValue;
  
  // Margen bruto: Ventas externas + Ventas internas (traslados del centro) - Consumo Recetas - Compras Directas locales
  const margenBruto = salesIncome + internalTransferIncome - soldInventoryCost - purchaseExpenses;
  
  // Margen operativo / Resultado neto de operacion: margen bruto menos bajas/mermas menos gastos fijos/variables
  const resultadoOperativo = margenBruto - writeoffInventoryCost - fixedExpenses - variableExpenses;
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
    const confirmMsg = `¿Seguro que deseas eliminar esta venta de ${formatCOP(sale.totalAmount)}?`;
    const doDelete = async () => {
      try {
        await saleRepo.delete(sale.id);
        loadData();
      } catch (err: any) {
        if (Platform.OS === 'web') {
          window.alert(`Error: ${err?.message || 'No se pudo eliminar la venta'}`);
        } else {
          Alert.alert('Error', err?.message || 'No se pudo eliminar la venta');
        }
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) doDelete();
    } else {
      Alert.alert('Eliminar venta', confirmMsg, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: doDelete },
      ]);
    }
  }, [saleRepo, loadData]);

  const handleDeleteExpense = useCallback((expense: Expense) => {
    if (Platform.OS === 'web') {
      const confirmMsg = `¿Estás seguro de eliminar este egreso (${expense.category}: ${formatCOP(expense.amount)})?`;
      if (window.confirm(confirmMsg)) {
        expenseRepo.delete(expense.id)
          .then(() => {
            loadData();
          })
          .catch((err) => {
            window.alert(`Error al eliminar egreso: ${err?.message || 'Revisa permisos'}`);
          });
      }
      return;
    }
    setDeletingExpense(expense);
    setDeleteExpenseError('');
    setDeleteExpenseModalVisible(true);
  }, [expenseRepo, loadData]);

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

  const handleDeletePurchase = useCallback((purchase: Purchase) => {
    const confirmMsg = `¿Seguro que deseas eliminar esta compra de ${formatCOP(purchase.priceCOP)}?`;
    const doDelete = async () => {
      try {
        await purchaseRepo.delete(purchase.id);
        loadData();
      } catch (err: any) {
        if (Platform.OS === 'web') {
          window.alert(`Error: ${err?.message || 'No se pudo eliminar la compra'}`);
        } else {
          Alert.alert('Error', err?.message || 'No se pudo eliminar la compra');
        }
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) doDelete();
    } else {
      Alert.alert('Eliminar compra', confirmMsg, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: doDelete },
      ]);
    }
  }, [purchaseRepo, loadData]);

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

  const handleOpenAuditModal = useCallback(async () => {
    const defaultDate = todayColombia();
    const existingAudit = cashAuditRows.find((row) => row.date === defaultDate);
    setAuditDate(defaultDate);
    setAuditNotes(existingAudit?.notes ?? '');
    setAuditDenominations({
      bills100k: existingAudit?.bills100k ?? 0,
      bills50k: existingAudit?.bills50k ?? 0,
      bills20k: existingAudit?.bills20k ?? 0,
      bills10k: existingAudit?.bills10k ?? 0,
      bills5k: existingAudit?.bills5k ?? 0,
      bills2k: existingAudit?.bills2k ?? 0,
      coins: existingAudit?.coins ?? 0,
    });
    setAuditBankTotal(latestTheoreticalBank);
    // Pre-fill base from the real cash_opening for today; fall back to theoretical if none registered
    setAuditBase(latestTheoreticalBase);
    setAuditError('');
    setAuditCartera(latestTheoreticalCartera);
    setAuditModalVisible(true);

    try {
      const [freshCredits, todayOpening] = await Promise.all([
        creditRepo.getAll(),
        cashClosingService.getOpeningByDate(appliedStoreId, defaultDate),
      ]);
      const appliedStore = stores.find((s) => s.id === appliedStoreId);
      const isProd = appliedStore?.isProductionCenter ?? false;
      const freshTotal = isProd
        ? freshCredits.filter(c => c.debtorType === 'LOCAL' && c.balance > 0).reduce((sum, c) => sum + c.balance, 0)
        : freshCredits.filter(c => c.storeId === appliedStoreId && c.debtorType !== 'LOCAL' && c.balance > 0).reduce((sum, c) => sum + c.balance, 0);
      setAuditCartera(freshTotal);
      // Override base with the actual registered opening for today if it exists
      if (todayOpening?.total !== undefined && todayOpening.total > 0) {
        setAuditBase(todayOpening.total);
      }
    } catch (err) {
      console.warn('Error reloading fresh data for audit:', err);
    }
  }, [cashAuditRows, latestTheoreticalBank, latestTheoreticalCartera, latestTheoreticalBase, creditRepo, cashClosingService, appliedStoreId, stores]);

  const calculateLiveTheoreticalTotal = useCallback(async (storeId: string, targetDate: string): Promise<number> => {
    try {
      const anchorDate = '2020-01-01';

      const [credits, closings, audits, openingsRes, ledgerExpenses, ledgerPurchases, creditPaymentsRes, ledgerIncomes, salesRes] = await Promise.all([
        creditRepo.getAll(),
        cashClosingService.getClosingsByDateRange(storeId, anchorDate, targetDate),
        cashAuditRepo.getByDateRange(storeId, anchorDate, targetDate),
        supabase
          .from('cash_openings')
          .select('date,total')
          .eq('store_id', storeId)
          .gte('date', anchorDate)
          .lte('date', (() => { const p = targetDate.split('-'); const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })()),
        expenseRepo.getByDateRange(storeId, anchorDate, targetDate),
        purchaseRepo.getByDateRange(anchorDate, targetDate, storeId),
        supabase
          .from('credit_payments')
          .select('*, credit_entries(debtor_type, store_id)')
          .gte('date', anchorDate)
          .lte('date', targetDate),
        incomeRepo.getByDateRange(storeId, anchorDate, targetDate),
        saleService.getSalesByDateRange(storeId, anchorDate, targetDate + 'T23:59:59'),
      ]);

      const openingsByDate = new Map<string, number>(
        (openingsRes.data || []).map((o: any) => [o.date, o.total])
      );

      const closingsByDate = new Map(closings.map(c => [c.date, c]));
      const auditsByDate = new Map(audits.map(a => [a.date, a]));

      const cashExpensesByDate = new Map<string, number>();
      const bankExpensesByDate = new Map<string, number>();
      const cashAdvancesByDate = new Map<string, number>();
      const bankAdvancesByDate = new Map<string, number>();
      for (const exp of ledgerExpenses) {
        const expDate = exp.date.split('T')[0];
        if (exp.category === 'Compra Turno' || exp.category === 'Adelanto') {
          if (exp.paymentMethod === PaymentMethod.EFECTIVO) {
            cashAdvancesByDate.set(expDate, (cashAdvancesByDate.get(expDate) ?? 0) + exp.amount);
          } else {
            bankAdvancesByDate.set(expDate, (bankAdvancesByDate.get(expDate) ?? 0) + exp.amount);
          }
        } else {
          if (exp.paymentMethod === PaymentMethod.EFECTIVO) {
            cashExpensesByDate.set(expDate, (cashExpensesByDate.get(expDate) ?? 0) + exp.amount);
          } else {
            bankExpensesByDate.set(expDate, (bankExpensesByDate.get(expDate) ?? 0) + exp.amount);
          }
        }
      }

      const cashPurchasesByDate = new Map<string, number>();
      const bankPurchasesByDate = new Map<string, number>();
      for (const pur of ledgerPurchases) {
        const purDate = pur.timestamp.split('T')[0];
        if (pur.paymentMethod === PaymentMethod.EFECTIVO) {
          cashPurchasesByDate.set(purDate, (cashPurchasesByDate.get(purDate) ?? 0) + pur.priceCOP);
        } else {
          bankPurchasesByDate.set(purDate, (bankPurchasesByDate.get(purDate) ?? 0) + pur.priceCOP);
        }
      }

      // Segment incomes by date and payment method
      const cashIncomesByDate = new Map<string, number>();
      const bankIncomesByDate = new Map<string, number>();
      for (const inc of ledgerIncomes) {
        const incDate = inc.date.split('T')[0];
        if (inc.paymentMethod === PaymentMethod.EFECTIVO) {
          cashIncomesByDate.set(incDate, (cashIncomesByDate.get(incDate) ?? 0) + inc.amount);
        } else {
          bankIncomesByDate.set(incDate, (bankIncomesByDate.get(incDate) ?? 0) + inc.amount);
        }
      }

      const cashPaymentsByDate = new Map<string, number>();
      const bankPaymentsByDate = new Map<string, number>();
      const totalPaymentsByDate = new Map<string, number>();
      const cpOutflowPaymentsByDate = new Map<string, number>();

      const isProd = stores.find((s) => s.id === storeId)?.isProductionCenter ?? false;

      for (const p of (creditPaymentsRes.data || [])) {
        const pDate = p.date.split('T')[0];
        const entryStoreId = p.credit_entries?.store_id;
        const debtorType = p.credit_entries?.debtor_type;
        const isCpCredit = debtorType === 'LOCAL';

        // Skip non-confirmed payments (pending/rejected)
        const isConfirmed = p.status === 'CONFIRMED';
        if (!isConfirmed) continue;

        if (isProd) {
          if (isCpCredit) {
            // ONLY add to bank/total payments if this payment does NOT have an associated income record
            if (!p.income_id) {
              bankPaymentsByDate.set(pDate, (bankPaymentsByDate.get(pDate) ?? 0) + p.amount);
            }
            totalPaymentsByDate.set(pDate, (totalPaymentsByDate.get(pDate) ?? 0) + p.amount);
          }
        } else {
          if (entryStoreId === storeId) {
            if (isCpCredit) {
              // Outflow payment made to CP
              // ONLY subtract from outflow if this payment does NOT have an associated expense record
              if (!p.expense_id) {
                cpOutflowPaymentsByDate.set(pDate, (cpOutflowPaymentsByDate.get(pDate) ?? 0) + p.amount);
              }
            } else {
              totalPaymentsByDate.set(pDate, (totalPaymentsByDate.get(pDate) ?? 0) + p.amount);
              const isCash = p.notes && String(p.notes).toLowerCase().includes('efectivo');
              if (isCash) {
                cashPaymentsByDate.set(pDate, (cashPaymentsByDate.get(pDate) ?? 0) + p.amount);
              } else {
                bankPaymentsByDate.set(pDate, (bankPaymentsByDate.get(pDate) ?? 0) + p.amount);
              }
            }
          }
        }
      }

      const creditsByDate = new Map<string, number>();
      const creditSalesByDate = new Map<string, number>();
      const bankSalesByDate = new Map<string, number>();
      for (const s of salesRes) {
        const sDate = getColombiaDateKey(s.timestamp);
        if (s.paymentMethod === PaymentMethod.TRANSFERENCIA || (s.bankAmount ?? 0) > 0) {
          const amt = (s.bankAmount ?? 0) > 0 ? s.bankAmount! : s.totalAmount;
          bankSalesByDate.set(sDate, (bankSalesByDate.get(sDate) ?? 0) + amt);
        }
      }
      for (const c of credits) {
        const isCpCredit = c.debtorType === 'LOCAL';
        if (isProd) {
          if (isCpCredit) {
            const cDate = c.date.split('T')[0];
            creditsByDate.set(cDate, (creditsByDate.get(cDate) ?? 0) + c.amount);
          }
        } else {
          if (c.storeId === storeId && !isCpCredit) {
            const cDate = c.date.split('T')[0];
            creditsByDate.set(cDate, (creditsByDate.get(cDate) ?? 0) + c.amount);
            if (c.saleId) {
              creditSalesByDate.set(cDate, (creditSalesByDate.get(cDate) ?? 0) + c.amount);
            }
          }
        }
      }

      let runningCash = 0;
      let runningBank = 0;
      let runningCartera = 0;
      let runningBaseLocal = 0;
      let previousBase = 0;

      const dates = getDatesInRange(anchorDate, targetDate);

      for (const date of dates) {
        const closing = closingsByDate.get(date);
        const openingBaseVal = openingsByDate.get(date) ?? 100000;
        const isApproved = closing && (closing.status === ClosingStatus.APPROVED || closing.status === ClosingStatus.CONFIRMED);

        const generalCashExp = (cashExpensesByDate.get(date) ?? 0) + (cashPurchasesByDate.get(date) ?? 0);
        const generalBankExp = (bankExpensesByDate.get(date) ?? 0) + (bankPurchasesByDate.get(date) ?? 0);

        const cashPayToday = cashPaymentsByDate.get(date) ?? 0;
        const bankPayToday = bankPaymentsByDate.get(date) ?? 0;
        const totalPayToday = totalPaymentsByDate.get(date) ?? 0;
        const cpOutflowPayToday = cpOutflowPaymentsByDate.get(date) ?? 0;
        const newCreditsToday = creditsByDate.get(date) ?? 0;
        const creditSalesToday = creditSalesByDate.get(date) ?? 0;

        const dayBankSales = bankSalesByDate.get(date) ?? 0;
        const effectiveClosingBank = (closing && closing.bankTotal > 0) ? closing.bankTotal : dayBankSales;

        const salesTransferCash = isApproved ? (closing.expectedTotal - effectiveClosingBank - creditSalesToday - closing.expenses) : 0;
        const salesTransferBank = isApproved ? effectiveClosingBank : 0;

        const registeredOpening = openingsByDate.get(date);
        const theoreticalBaseToday = registeredOpening !== undefined ? registeredOpening : (isApproved ? openingBaseVal : runningBaseLocal);
        const baseAdjustmentToCash = (previousBase === 0) ? 0 : (previousBase - theoreticalBaseToday);

        const bankAdvancesToday = bankAdvancesByDate.get(date) ?? 0;
        const generalCashIncomeToday = cashIncomesByDate.get(date) ?? 0;
        const generalBankIncomeToday = bankIncomesByDate.get(date) ?? 0;

        runningCash = runningCash + salesTransferCash + generalCashIncomeToday - generalCashExp + cashPayToday + baseAdjustmentToCash;
        runningBank = runningBank + salesTransferBank + generalBankIncomeToday - generalBankExp - bankAdvancesToday + bankPayToday - cpOutflowPayToday;
        runningCartera = runningCartera + newCreditsToday - totalPayToday;
        runningBaseLocal = theoreticalBaseToday;
        previousBase = theoreticalBaseToday;
      }

      return runningCash + runningBank + runningCartera + runningBaseLocal;
    } catch (err) {
      console.error('Error calculating live theoretical total:', err);
      return 0;
    }
  }, [creditRepo, cashClosingService, cashAuditRepo, expenseRepo, purchaseRepo]);

  const handleSaveCashAudit = useCallback(async () => {
    if (!appliedStoreId) return;
    if (!isValidISODate(auditDate)) {
      setAuditError('Usa una fecha valida con formato YYYY-MM-DD.');
      return;
    }

    // ── Advertencia: verificar que el día tenga cierre aprobado ──────────────
    try {
      const closingForDate = await cashClosingService.getClosingByDate(appliedStoreId, auditDate);
      const isClosingApproved =
        closingForDate?.status === ClosingStatus.APPROVED ||
        closingForDate?.status === ClosingStatus.CONFIRMED;

      if (!isClosingApproved) {
        if (Platform.OS === 'web') {
          const confirmed = window.confirm(
            `⚠️ Cierre pendiente\n\nEl día ${auditDate} no tiene un cierre de caja aprobado.\n\nRegistrar el conteo antes del cierre puede generar descuadres. Se recomienda aprobar el cierre primero.\n\n¿Deseas continuar de todas formas?`
          );
          if (!confirmed) return;
        } else {
          await new Promise<void>((resolve, reject) => {
            Alert.alert(
              '⚠️ Cierre pendiente',
              `El día ${auditDate} no tiene un cierre de caja aprobado.\n\nRegistrar el conteo antes del cierre puede generar descuadres. Se recomienda aprobar el cierre primero.\n\n¿Deseas continuar de todas formas?`,
              [
                { text: 'Cancelar', style: 'cancel', onPress: () => reject(new Error('CANCEL')) },
                { text: 'Continuar', style: 'destructive', onPress: () => resolve() },
              ],
              { cancelable: false }
            );
          });
        }
      }
    } catch (err: any) {
      if (err?.message === 'CANCEL') return; // User chose to go back
      // If the closing check itself fails (network), allow proceeding with a console warning
      console.warn('No se pudo verificar el cierre antes del arqueo:', err);
    }
    // ─────────────────────────────────────────────────────────────────────────

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

      const cashTotal =
        (auditDenominations.bills100k * 100000) +
        (auditDenominations.bills50k * 50000) +
        (auditDenominations.bills20k * 20000) +
        (auditDenominations.bills10k * 10000) +
        (auditDenominations.bills5k * 5000) +
        (auditDenominations.bills2k * 2000) +
        auditDenominations.coins;
      const actualTotalComputed = cashTotal + auditBankTotal + auditCartera + auditBase;

      const expectedTheoretical = await calculateLiveTheoreticalTotal(appliedStoreId, auditDate);
      const discrepancyComputed = actualTotalComputed - expectedTheoretical;

      const entry: Omit<CashAuditEntry, 'id' | 'createdAt' | 'updatedAt'> = {
        storeId: appliedStoreId,
        date: auditDate,
        openingBase: auditBase,
        cashSales,
        cashExpenses,
        theoreticalTotal: expectedTheoretical,
        actualTotal: actualTotalComputed,
        discrepancy: discrepancyComputed,
        notes: auditNotes.trim(),
        bills100k: auditDenominations.bills100k,
        bills50k: auditDenominations.bills50k,
        bills20k: auditDenominations.bills20k,
        bills10k: auditDenominations.bills10k,
        bills5k: auditDenominations.bills5k,
        bills2k: auditDenominations.bills2k,
        coins: auditDenominations.coins,
        bankTotal: auditBankTotal,
        cartera: auditCartera,
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
    auditDate,
    auditDenominations,
    auditBankTotal,
    auditCartera,
    auditNotes,
    cashClosingService,
    saleService,
    expenseRepo,
    purchaseRepo,
    cashAuditRepo,
    loadData,
  ]);

  const handleOpenApproveModal = useCallback(async (closing: CashClosing) => {
    setApprovingClosing(closing);
    setClosingDenoms(closing.denominations);
    setClosingBankTotal(closing.bankTotal);
    setClosingExpenses(closing.expenses);
    setClosingDate(closing.date);
    setClosingExpected(closing.expectedTotal);
    setClosingOpeningBase(100000);
    setClosingCreditSales(0);
    try {
      const [opening, dailySales] = await Promise.all([
        cashClosingService.getOpeningByDate(closing.storeId, closing.date),
        saleService.getDailySummary(closing.storeId, closing.date),
      ]);
      if (opening) {
        setClosingOpeningBase(opening.total);
      }
      if (dailySales) {
        setClosingCreditSales(dailySales.totalCreditAmount ?? 0);
      }
    } catch (err) {
      console.warn('Error fetching opening base/credits for closing approval:', err);
    }
  }, [cashClosingService, saleService]);

  const handleSaveAndApproveClosing = useCallback(async () => {
    if (!approvingClosing) return;
    try {
      if (approvingClosing.status === ClosingStatus.CONFIRMED) {
        await cashClosingService.returnToDraft(approvingClosing.id);
      }
      await cashClosingService.updateClosing(
        approvingClosing.id,
        approvingClosing.storeId,
        closingDate,
        closingDenoms,
        closingBankTotal,
        closingExpenses
      );
      await cashClosingService.approveClosing(approvingClosing.id, '');
      
      if (Platform.OS === 'web') {
        window.alert('Cierre de caja verificado y aprobado correctamente.');
      } else {
        Alert.alert('Éxito', 'Cierre de caja verificado y aprobado correctamente.');
      }
      setApprovingClosing(null);
      loadData();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'No se pudo guardar e ingresar el cierre.';
      if (Platform.OS === 'web') {
        window.alert(errMsg);
      } else {
        Alert.alert('Error', errMsg);
      }
    }
  }, [approvingClosing, closingDate, closingDenoms, closingBankTotal, closingExpenses, cashClosingService, loadData]);

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

    const storeName = appliedStoreId === 'consolidado' ? 'Consolidado Global' : (appliedStore?.name ?? 'Local');
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
      ['Margen bruto', currencyCell(margenBruto), 'Ventas totales menos costos variables de inventario y compras directas.'],
      ['Margen operativo', currencyCell(resultadoOperativo), 'Margen bruto menos mermas aprobadas y gastos operativos. Es lectura de rentabilidad.'],
    ];

    const marginRows: ExcelCell[][] = [
      ['Concepto', 'Valor', 'Descripcion'],
      ['Ventas a clientes', currencyCell(salesIncome), 'Total vendido a clientes en el periodo seleccionado.'],
      ['Ventas internas (Centro Prod.)', currencyCell(internalTransferIncome), 'Facturacion interna al enviar insumos a locales.'],
      ['Costo vendido por recetas', currencyCell(-soldInventoryCost), 'Inventario consumido por ventas a precio de traslado.'],
      ['Compras directas insumos', currencyCell(-purchaseExpenses), 'Compras directas hechas a proveedores locales.'],
      ['Margen bruto', currencyCell(margenBruto), 'Ventas totales menos costos de inventario consumido y compras directas.'],
      ['Bajas y mermas aprobadas', currencyCell(-writeoffInventoryCost), 'Inventario descontado por bajas aprobadas en el periodo.'],
      ['Gastos variables operacionales', currencyCell(-variableExpenses), 'Gastos generales variables de la operacion.'],
      ['Gastos fijos operacionales', currencyCell(-fixedExpenses), 'Gastos generales fijos (arriendo, nomina, servicios).'],
      ['Margen operativo', currencyCell(resultadoOperativo), 'Margen bruto menos mermas y gastos fijos/variables.'],
      ['Inventario actual como activo', currencyCell(inventoryAssetValue), 'Stock que queda en el local valorizado al precio de compra.'],
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
        {isGerente ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsContainer}
          >
            <Chip
              selected={appliedStoreId === 'consolidado'}
              onPress={() => {
                setAppliedStoreId('consolidado');
              }}
              mode={appliedStoreId === 'consolidado' ? 'flat' : 'outlined'}
              icon="earth"
              style={[
                styles.tabChip,
                appliedStoreId === 'consolidado' ? { backgroundColor: theme.colors.primaryContainer } : undefined,
              ]}
            >
              Consolidado Global
            </Chip>
            {stores.map((store) => (
              <Chip
                key={store.id}
                selected={appliedStoreId === store.id}
                onPress={() => {
                  setAppliedStoreId(store.id);
                  setSelectedStore(store.id);
                }}
                mode={appliedStoreId === store.id ? 'flat' : 'outlined'}
                icon={store.isProductionCenter ? 'factory' : 'storefront'}
                style={[
                  styles.tabChip,
                  appliedStoreId === store.id ? { backgroundColor: theme.colors.primaryContainer } : undefined,
                ]}
              >
                {store.name}
              </Chip>
            ))}
          </ScrollView>
        ) : (
          <StoreSelector />
        )}
      </View>

      {/* Nav buttons — permanently visible below the store selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginVertical: 8, paddingHorizontal: 16, maxHeight: 40 }}
      >
        <Button
          mode="outlined"
          compact
          icon="wallet"
          style={{ marginRight: 8, height: 32 }}
          labelStyle={{ fontSize: 12, marginVertical: 4 }}
          onPress={() => router.push('/(tabs)/contabilidad/gastos')}
        >
          Gastos
        </Button>
        <Button
          mode="outlined"
          compact
          icon="wallet-giftcard"
          style={{ marginRight: 8, height: 32 }}
          labelStyle={{ fontSize: 12, marginVertical: 4 }}
          onPress={() => router.push('/(tabs)/contabilidad/ingresos')}
        >
          Ingresos
        </Button>
        <Button
          mode="outlined"
          compact
          icon="bank"
          style={{ marginRight: 8, height: 32 }}
          labelStyle={{ fontSize: 12, marginVertical: 4 }}
          onPress={() => router.push('/(tabs)/contabilidad/bancos')}
        >
          Bancos
        </Button>
        <Button
          mode="outlined"
          compact
          icon="calendar-check"
          style={{ marginRight: 8, height: 32 }}
          labelStyle={{ fontSize: 12, marginVertical: 4 }}
          onPress={() => router.push('/(tabs)/contabilidad/cierres')}
        >
          Cierres
        </Button>

        <Button
          mode="outlined"
          compact
          icon="scale-balance"
          style={{ marginRight: 8, height: 32 }}
          labelStyle={{ fontSize: 12, marginVertical: 4 }}
          onPress={() => router.push('/(tabs)/contabilidad/balances')}
        >
          Balances
        </Button>
      </ScrollView>

      {/* Period filter */}
      <View style={styles.periodRow}>
        {(['hoy', 'ayer', 'semana', 'mes', 'año', 'rango'] as const).map((p) => (
          <Chip
            key={p}
            selected={filterPeriod === p}
            onPress={() => handlePeriodPress(p)}
            mode={filterPeriod === p ? 'flat' : 'outlined'}
            style={filterPeriod === p ? { backgroundColor: theme.colors.primaryContainer } : undefined}
          >
            {p === 'hoy' ? 'Hoy' : p === 'ayer' ? 'Ayer' : p === 'semana' ? 'Semana' : p === 'mes' ? 'Mes' : p === 'año' ? 'Año' : 'Rango'}
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
              selected={activeView === 'general'}
              onPress={() => setActiveView('general')}
              mode={activeView === 'general' ? 'flat' : 'outlined'}
              icon="cash-register"
              style={activeView === 'general' ? { backgroundColor: theme.colors.primaryContainer } : undefined}
            >
              Caja General (Safe/Bank)
            </Chip>
            <Chip
              selected={activeView === 'diaria'}
              onPress={() => setActiveView('diaria')}
              mode={activeView === 'diaria' ? 'flat' : 'outlined'}
              icon="cash"
              style={activeView === 'diaria' ? { backgroundColor: theme.colors.primaryContainer } : undefined}
            >
              Caja Diaria (Ventas)
            </Chip>
            {isGerente && (
              <Chip
                selected={activeView === 'rentabilidad'}
                onPress={() => setActiveView('rentabilidad')}
                mode={activeView === 'rentabilidad' ? 'flat' : 'outlined'}
                icon="chart-line"
                style={activeView === 'rentabilidad' ? { backgroundColor: theme.colors.primaryContainer } : undefined}
              >
                Rentabilidad (P&L)
              </Chip>
            )}
          </View>

          {activeView === 'general' ? (
            <>
              <View style={styles.kpiRow}>
                <KpiCard
                  icon="arrow-down-circle"
                  label="Total Ingresos"
                  value={formatCOP(generalIngresos)}
                  color="#388E3C"
                />
                <KpiCard
                  icon="arrow-up-circle"
                  label="Total Egresos"
                  value={formatCOP(generalEgresos)}
                  color="#D32F2F"
                />
              </View>
              <View style={styles.kpiRow}>
                <KpiCard
                  icon="calculator"
                  label="Debe Haber (Teórico)"
                  value={formatCOP(latestCashAuditTheoretical)}
                  color="#6A5ACD"
                />
                <KpiCard
                  icon="cash-check"
                  label="Conteo Real (HAY)"
                  value={formatCOP(latestCashAuditActual)}
                  color="#1976D2"
                />
              </View>
              <View style={styles.kpiRow}>
                <KpiCard
                  icon="scale-balance"
                  label="Descuadre"
                  value={formatCOP(latestCashAuditDiscrepancy)}
                  color={latestCashAuditDiscrepancy >= 0 ? '#388E3C' : '#D32F2F'}
                />
              </View>

              <Card style={[styles.txCard, { marginTop: 4 }]} mode="outlined">
                <Card.Content style={{ paddingVertical: 10 }}>
                  <Text variant="titleSmall" style={{ fontWeight: '600', marginBottom: 6 }}>
                    Distribución Teórica (Debe Haber)
                  </Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                    <Text variant="bodySmall" style={{ color: '#aaa', marginRight: 8 }}>
                      Efectivo: <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{formatCOP(latestTheoreticalCash)}</Text>
                    </Text>
                    <Text variant="bodySmall" style={{ color: '#aaa', marginRight: 8 }}>
                      Bancos: <Text style={{ color: '#388E3C', fontWeight: 'bold' }}>{formatCOP(latestTheoreticalBank)}</Text>
                    </Text>
                    <Text variant="bodySmall" style={{ color: '#aaa', marginRight: 8 }}>
                      Cartera: <Text style={{ color: '#1976D2', fontWeight: 'bold' }}>{formatCOP(latestTheoreticalCartera)}</Text>
                    </Text>
                    {!isProductionCenter && (
                      <Text variant="bodySmall" style={{ color: '#aaa', marginRight: 8 }}>
                        Base Local: <Text style={{ color: '#E2B13C', fontWeight: 'bold' }}>{formatCOP(latestTheoreticalBase)}</Text>
                      </Text>
                    )}
                    {!isProductionCenter && (
                      <Text variant="bodySmall" style={{ color: '#aaa' }}>
                        Cuentas por Pagar (CP): <Text style={{ color: '#D32F2F', fontWeight: 'bold' }}>{formatCOP(dbCuentasPorPagar)}</Text>
                      </Text>
                    )}
                  </View>
                </Card.Content>
              </Card>

              <Card style={styles.txCard} mode="elevated">
                <Card.Content>
                  <Text variant="titleSmall" style={{ fontWeight: '600', marginBottom: 8 }}>
                    Caja General (Fuerte + Cuenta + Cartera)
                  </Text>
                  <Text variant="bodySmall" style={styles.txInfoText}>
                    Libro diario acumulativo. Cada conteo real reportado reajusta la base para el dia siguiente. La cartera se computa como valor positivo.
                  </Text>
                  <View style={styles.txRow}>
                    <Text variant="bodySmall">Base Inicial (Ayer)</Text>
                    <Text variant="bodySmall" style={{ fontWeight: '600' }}>
                      {latestCashAudit ? formatCOP(latestCashAudit.openingBase) : '$0'}
                    </Text>
                  </View>
                  <View style={styles.txRow}>
                    <Text variant="bodySmall">Ingresos (Traslados aprobados)</Text>
                    <Text variant="bodySmall" style={{ fontWeight: '600', color: '#388E3C' }}>
                      +{latestCashAudit ? formatCOP(latestCashAudit.expectedTotal) : '$0'}
                    </Text>
                  </View>
                  <View style={styles.txRow}>
                    <Text variant="bodySmall">Egresos (Gastos + Compras)</Text>
                    <Text variant="bodySmall" style={{ fontWeight: '600', color: '#D32F2F' }}>
                      -{latestCashAudit ? formatCOP(latestCashAudit.expenses) : '$0'}
                    </Text>
                  </View>
                  <View style={styles.txRow}>
                    <Text variant="bodySmall">Esperado Teórico</Text>
                    <Text variant="bodySmall" style={{ fontWeight: '600', color: '#6A5ACD' }}>
                      {formatCOP(latestCashAuditTheoretical)}
                    </Text>
                  </View>
                  <Divider style={{ marginVertical: 8 }} />
                  <View style={styles.txRow}>
                    <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>Diferencia Descuadre</Text>
                    <Text
                      variant="bodyMedium"
                      style={{ fontWeight: 'bold', color: latestCashAuditDiscrepancy >= 0 ? '#388E3C' : '#D32F2F' }}
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
                Detalle diario (Caja General)
              </Text>

              {cashAuditRows.length === 0 ? (
                <Card style={styles.txCard} mode="elevated">
                  <Card.Content>
                    <Text variant="titleSmall" style={{ fontWeight: '600', marginBottom: 4 }}>
                      Sin conteos registrados
                    </Text>
                    <Text variant="bodySmall" style={styles.txInfoText}>
                      No hay registros de arqueo para el local o periodo seleccionado.
                    </Text>
                  </Card.Content>
                </Card>
              ) : cashAuditRows.map((row) => (
                <Card key={row.date} style={styles.txCard} mode="elevated">
                  <Card.Content>
                    <View style={styles.txRow}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text variant="bodyMedium" style={{ fontWeight: '600' }}>{formatDate(row.date)}</Text>
                        <Text variant="bodySmall" style={{ color: '#999', marginTop: 2 }}>
                          Efectivo: {formatCOP(row.actualTotal - row.bankTotal - row.cartera)} | Cuenta: {formatCOP(row.bankTotal)} | Cartera: {formatCOP(row.cartera)}
                        </Text>
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                          Total Conteo (HAY): {formatCOP(row.actualTotal)}
                        </Text>
                        {row.notes ? (
                          <Text variant="bodySmall" style={{ color: '#DDBB99', fontStyle: 'italic', marginTop: 4 }}>
                            Nota: {row.notes}
                          </Text>
                        ) : null}
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text
                          variant="bodyMedium"
                          style={{ fontWeight: '700', color: row.discrepancy >= 0 ? '#388E3C' : '#D32F2F' }}
                        >
                          {row.discrepancy > 0 ? '+' : ''}{formatCOP(row.discrepancy)}
                        </Text>
                        <Text variant="bodySmall" style={{ color: '#777', fontSize: 10 }}>
                          Descuadre
                        </Text>
                      </View>
                    </View>
                  </Card.Content>
                </Card>
              ))}
            </>
          ) : activeView === 'diaria' ? (
            <>
              <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600', marginBottom: 12 }]}>
                Cierre Caja Diaria (Ventas)
              </Text>
              {reportClosings.length === 0 ? (
                <Card style={styles.txCard} mode="elevated">
                  <Card.Content>
                    <Text variant="titleSmall" style={{ fontWeight: '600', marginBottom: 4 }}>
                      Sin cierres de ventas
                    </Text>
                    <Text variant="bodySmall" style={styles.txInfoText}>
                      No hay registros de cierre en este periodo.
                    </Text>
                  </Card.Content>
                </Card>
              ) : reportClosings.map((closing) => {
                const statusColor = closing.status === ClosingStatus.APPROVED ? '#388E3C' : (closing.status === ClosingStatus.CONFIRMED ? '#1976D2' : '#F57C00');
                const statusText = closing.status === ClosingStatus.APPROVED ? 'Aprobado' : (closing.status === ClosingStatus.CONFIRMED ? 'Pendiente' : 'Borrador');
                const closingOpeningBase = openingsMap[closing.date] ?? 100000;
                return (
                  <Card key={closing.id} style={styles.txCard} mode="elevated">
                    <Card.Content>
                      <View style={styles.txRow}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text variant="bodyMedium" style={{ fontWeight: '600' }}>{formatDate(closing.date)}</Text>
                          <Text variant="bodySmall" style={{ color: '#999', marginTop: 2 }}>
                            Base: {formatCOP(closingOpeningBase)} | Ventas: {formatCOP(closing.expectedTotal)}
                          </Text>
                          <Text variant="bodySmall" style={{ color: '#999' }}>
                            Egresos: {formatCOP(closing.expenses)} | Reportado (HAY): {formatCOP(closing.actualTotal)}
                          </Text>
                          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                            Estado: <Text style={{ color: statusColor, fontWeight: 'bold' }}>{statusText}</Text>
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                          <Text
                            variant="bodyMedium"
                            style={{ fontWeight: '700', color: closing.discrepancy >= 0 ? '#388E3C' : '#D32F2F' }}
                          >
                            {closing.discrepancy > 0 ? '+' : ''}{formatCOP(closing.discrepancy)}
                          </Text>
                          <Text variant="bodySmall" style={{ color: '#777', fontSize: 10, marginBottom: 8 }}>
                            Descuadre
                          </Text>
                          {closing.status !== ClosingStatus.APPROVED && (
                            <Button
                              mode="contained"
                              compact
                              buttonColor="#388E3C"
                              textColor="#FFFFFF"
                              style={{ height: 28, justifyContent: 'center' }}
                              onPress={() => handleOpenApproveModal(closing)}
                            >
                              Aprobar
                            </Button>
                          )}
                        </View>
                      </View>
                    </Card.Content>
                  </Card>
                );
              })}
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
            <Text variant="bodySmall">Gastos variables operacionales</Text>
            <Text variant="bodySmall" style={{ fontWeight: '600', color: '#D32F2F' }}>
              -{formatCOP(variableExpenses)}
            </Text>
          </View>
          <Text variant="bodySmall" style={styles.txInfoText}>
            Egresos generales variables del periodo (clasificados al registrar).
          </Text>
          <View style={styles.txRow}>
            <Text variant="bodySmall">Gastos fijos operacionales</Text>
            <Text variant="bodySmall" style={{ fontWeight: '600', color: '#D32F2F' }}>
              -{formatCOP(fixedExpenses)}
            </Text>
          </View>
          <Text variant="bodySmall" style={styles.txInfoText}>
            Arriendos, nominas fijas y servicios basicos del centro de costos.
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
          mode="contained"
          icon="file-excel"
          buttonColor="#2E7D32"
          textColor="#FFFFFF"
          onPress={handleExportExcel}
          style={{ flex: 1 }}
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
            <IconButton
              icon="delete-outline"
              size={18}
              iconColor="#D32F2F"
              onPress={() => handleDeletePurchase(purchase)}
              style={{ margin: 0 }}
            />
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
          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={true}>
            <TextInput
              label="Fecha"
              value={auditDate}
              onChangeText={setAuditDate}
              mode="outlined"
              dense
              placeholder="YYYY-MM-DD"
              style={{ marginBottom: 12 }}
            />
            
            <Text variant="titleSmall" style={{ fontWeight: '600', marginVertical: 8 }}>
              Efectivo en Caja (Billetes / Monedas)
            </Text>
            
            <DenominationCounter
              denominations={auditDenominations}
              onChange={(key, count) => setAuditDenominations((p) => ({ ...p, [key]: count }))}
              total={
                (auditDenominations.bills100k * 100000) +
                (auditDenominations.bills50k * 50000) +
                (auditDenominations.bills20k * 20000) +
                (auditDenominations.bills10k * 10000) +
                (auditDenominations.bills5k * 5000) +
                (auditDenominations.bills2k * 2000) +
                auditDenominations.coins
              }
            />

            <View style={{ marginVertical: 12 }}>
              <CurrencyInput
                value={auditBankTotal}
                onChangeValue={(val) => setAuditBankTotal(val ?? 0)}
                label="Valor en Cuenta Bancaria (CUENTA)"
              />
            </View>

             <View style={{ marginVertical: 12 }}>
              <CurrencyInput
                value={auditCartera}
                onChangeValue={(val) => setAuditCartera(val ?? 0)}
                label="Valor de Cartera (Cuentas por Cobrar)"
              />
            </View>

            <View style={{ marginVertical: 12 }}>
              <CurrencyInput
                value={auditBase}
                onChangeValue={(val) => setAuditBase(val ?? 0)}
                label="Base en Local (Dinero en caja de ventas)"
              />
            </View>

            <Divider style={{ marginVertical: 12 }} />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>Total General Conteo (HAY):</Text>
              <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                {formatCOP(
                  (auditDenominations.bills100k * 100000) +
                  (auditDenominations.bills50k * 50000) +
                  (auditDenominations.bills20k * 20000) +
                  (auditDenominations.bills10k * 10000) +
                  (auditDenominations.bills5k * 5000) +
                  (auditDenominations.bills2k * 2000) +
                  auditDenominations.coins +
                  auditBankTotal +
                  auditCartera +
                  auditBase
                )}
              </Text>
            </View>

            <TextInput
              label="Notas"
              value={auditNotes}
              onChangeText={setAuditNotes}
              mode="outlined"
              multiline
              numberOfLines={3}
              style={{ marginTop: 4 }}
            />
          </ScrollView>
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

      {/* Verify and Approve Closing Modal */}
      <Portal>
        <Modal
          visible={!!approvingClosing}
          onDismiss={() => setApprovingClosing(null)}
          contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}
        >
          <Text variant="titleLarge" style={{ fontWeight: 'bold', marginBottom: 4 }}>
            Verificar y Aprobar Cierre
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>
            Fecha: {closingDate ? formatDate(closingDate) : ''} | Revisa las denominaciones del cajero y aprueba para ingresar a la Caja General.
          </Text>
          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={true}>
            <DenominationCounter
              denominations={closingDenoms}
              onChange={(key, count) => setClosingDenoms((p) => ({ ...p, [key]: count }))}
              total={
                (closingDenoms.bills100k * 100000) +
                (closingDenoms.bills50k * 50000) +
                (closingDenoms.bills20k * 20000) +
                (closingDenoms.bills10k * 10000) +
                (closingDenoms.bills5k * 5000) +
                (closingDenoms.bills2k * 2000) +
                closingDenoms.coins
              }
            />

            <View style={{ marginVertical: 12 }}>
              <CurrencyInput
                value={closingBankTotal}
                onChangeValue={(val) => setClosingBankTotal(val ?? 0)}
                label="Valor en Cuenta Bancaria (CUENTA)"
              />
            </View>

            <View style={{ marginVertical: 12 }}>
              <CurrencyInput
                value={closingExpenses}
                onChangeValue={(val) => setClosingExpenses(val ?? 0)}
                label="Gastos de Caja (Turno)"
              />
            </View>

            <Divider style={{ marginVertical: 12 }} />

            <Text variant="titleSmall" style={{ fontWeight: 'bold', marginBottom: 8, color: theme.colors.primary }}>
              Resumen de Jornada (Verificación)
            </Text>

            {/* Base */}
            <View style={styles.txRow}>
              <Text variant="bodySmall">Base del día (Apertura)</Text>
              <Text variant="bodySmall" style={{ fontWeight: '600', color: '#E2B13C' }}>
                {formatCOP(closingOpeningBase)}
              </Text>
            </View>

            <Divider style={{ marginVertical: 6 }} />

            {/* Ventas */}
            <View style={styles.txRow}>
              <Text variant="bodySmall" style={{ fontWeight: 'bold' }}>Total Ventas</Text>
              <Text variant="bodySmall" style={{ fontWeight: 'bold' }}>
                {formatCOP(closingExpected)}
              </Text>
            </View>
            <View style={[styles.txRow, { paddingLeft: 12 }]}>
              <Text variant="bodySmall" style={{ color: '#aaa' }}>└ Efectivo Esperado (Ventas)</Text>
              <Text variant="bodySmall" style={{ color: '#F5F0EB' }}>
                {formatCOP(closingExpected - closingBankTotal - closingCreditSales)}
              </Text>
            </View>
            <View style={[styles.txRow, { paddingLeft: 12 }]}>
              <Text variant="bodySmall" style={{ color: '#aaa' }}>└ Transferencias (Bancos)</Text>
              <Text variant="bodySmall" style={{ color: '#388E3C' }}>
                {formatCOP(closingBankTotal)}
              </Text>
            </View>
            <View style={[styles.txRow, { paddingLeft: 12 }]}>
              <Text variant="bodySmall" style={{ color: '#aaa' }}>└ Fiados (Cartera)</Text>
              <Text variant="bodySmall" style={{ color: '#1976D2' }}>
                {formatCOP(closingCreditSales)}
              </Text>
            </View>

            <Divider style={{ marginVertical: 6 }} />

            {/* Egresos */}
            <View style={styles.txRow}>
              <Text variant="bodySmall" style={{ fontWeight: 'bold' }}>Total Egresos (Gastos)</Text>
              <Text variant="bodySmall" style={{ fontWeight: 'bold', color: '#D32F2F' }}>
                -{formatCOP(closingExpenses)}
              </Text>
            </View>

            <Divider style={{ marginVertical: 6 }} />

            {/* Efectivo con y sin base */}
            <View style={styles.txRow}>
              <Text variant="bodySmall">Efectivo esperado (Sin Base)</Text>
              <Text variant="bodySmall" style={{ fontWeight: '600' }}>
                {formatCOP(closingExpected - closingBankTotal - closingCreditSales - closingExpenses)}
              </Text>
            </View>
            <View style={styles.txRow}>
              <Text variant="bodySmall" style={{ fontWeight: 'bold' }}>Efectivo esperado (Con Base)</Text>
              <Text variant="bodySmall" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                {formatCOP(closingOpeningBase + closingExpected - closingBankTotal - closingCreditSales - closingExpenses)}
              </Text>
            </View>

            <Divider style={{ marginVertical: 6 }} />

            {/* Físico contado vs discrepancia */}
            {(() => {
              const cashCounted = 
                (closingDenoms.bills100k * 100000) +
                (closingDenoms.bills50k * 50000) +
                (closingDenoms.bills20k * 20000) +
                (closingDenoms.bills10k * 10000) +
                (closingDenoms.bills5k * 5000) +
                (closingDenoms.bills2k * 2000) +
                closingDenoms.coins;
              const disc = cashCounted - closingOpeningBase - (closingExpected - closingBankTotal - closingCreditSales - closingExpenses);
              return (
                <>
                  <View style={styles.txRow}>
                    <Text variant="bodySmall">Efectivo Contado (Físico en Caja)</Text>
                    <Text variant="bodySmall" style={{ fontWeight: 'bold', color: '#FFF' }}>
                      {formatCOP(cashCounted)}
                    </Text>
                  </View>
                  <View style={[styles.txRow, { marginTop: 4 }]}>
                    <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>Discrepancia (Diferencia)</Text>
                    <Text
                      variant="bodyMedium"
                      style={{
                        fontWeight: 'bold',
                        color: Math.abs(disc) < 1000 ? '#388E3C' : '#D32F2F',
                      }}
                    >
                      {formatCOP(disc)}
                    </Text>
                  </View>
                </>
              );
            })()}
          </ScrollView>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
            <Button
              mode="text"
              onPress={() => setApprovingClosing(null)}
            >
              Cancelar
            </Button>
            <Button
              mode="contained"
              buttonColor="#388E3C"
              textColor="#FFFFFF"
              onPress={handleSaveAndApproveClosing}
            >
              Aprobar Cierre
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
  tabsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 4,
  },
  tabChip: {
    marginRight: 8,
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
