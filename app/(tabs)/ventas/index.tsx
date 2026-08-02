import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet, Alert, ScrollView, KeyboardAvoidingView, Platform, useWindowDimensions } from 'react-native';
import {
  Text,
  FAB,
  Card,
  Chip,
  Divider,
  Portal,
  Modal,
  Button,
  useTheme,
  IconButton,
  Snackbar,
  TextInput,
  SegmentedButtons,
} from 'react-native-paper';
import { router, usePathname } from 'expo-router';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { CurrencyInput } from '../../../src/components/common/CurrencyInput';
import { ProductGrid } from '../../../src/components/ventas/ProductGrid';
import { SizeSelector } from '../../../src/components/ventas/SizeSelector';
import { CartSummary } from '../../../src/components/ventas/CartSummary';
import { PaymentMethodPicker } from '../../../src/components/ventas/PaymentMethodPicker';
import { AdditionSelector } from '../../../src/components/ventas/AdditionSelector';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useSaleStore, CartItem, CartItemAddition } from '../../../src/stores/useSaleStore';
import { Product, Sale, ProductFormat, AdditionCatalogItem, Customer, Supply } from '../../../src/domain/entities';
import {
  PaymentMethod,
  InventoryLevel,
  WriteoffReason,
  UserRole,
  PACKAGING_LABEL_BY_ID,
  PACKAGING_OPTIONS,
  PACKAGING_SALE_PRICE_COP_BY_ID,
  PACKAGING_SUPPLY_IDS,
} from '../../../src/domain/enums';
import { supabase } from '../../../src/lib/supabase';
import { SearchableSelect } from '../../../src/components/common/SearchableSelect';
import { CalendarPickerModal } from '../../../src/components/common/CalendarPickerModal';
import { useMasterDataStore } from '../../../src/stores/useMasterDataStore';
import { formatCOP } from '../../../src/utils/currency';
import { colombiaDateRangeToUtc, formatDate, todayColombia, toISODate } from '../../../src/utils/dates';

export default function VentasScreen() {
  const theme = useTheme();
  const { saleService, writeoffService, cashClosingService, creditService, expenseRepo, productFormatRepo, productStoreAssignmentRepo, additionCatalogRepo, customerRepo, inventoryRepo } = useDI();
  const { selectedStoreId, userId, userRole } = useAppStore();
  const { products: cachedProducts, supplies, workers } = useMasterDataStore();
  const {
    cart,
    cartPackagingSupplyId,
    pendingSales,
    salesDate,
    setSalesDate,
    addToCart,
    removeFromCart,
    updateQuantity,
    updateCustomerNote,
    setCart,
    setCartPackaging,
    clearCart,
    setPendingSales,
  } = useSaleStore();
  const scrollRef = useRef<ScrollView>(null);
  const pathname = usePathname();

  // V5: Calculadora de cambio
  const [amountReceived, setAmountReceived] = useState(0);

  const isGerente = userRole === UserRole.GERENTE || userRole === UserRole.ADMIN_LOCAL;
  const [calendarVisible, setCalendarVisible] = useState(false);

  // V1: Check if cash opening exists for selected salesDate (re-check on focus return)
  const [needsOpening, setNeedsOpening] = useState(false);
  useEffect(() => {
    if (!selectedStoreId) return;
    (async () => {
      try {
        const hasOpening = await cashClosingService.hasOpeningForToday(selectedStoreId, salesDate);
        setNeedsOpening(!hasOpening);
      } catch {
        setNeedsOpening(false);
      }
    })();
  }, [selectedStoreId, salesDate, cashClosingService, pathname]);

  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedFormatId, setSelectedFormatId] = useState<string | null>(null);
  const [sizeModalVisible, setSizeModalVisible] = useState(false);
  const [beverageModalVisible, setBeverageModalVisible] = useState(false);
  const [beverageQuantity, setBeverageQuantity] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.EFECTIVO);
  const [cashAmount, setCashAmount] = useState(0);
  const [bankAmount, setBankAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [readyToConfirm, setReadyToConfirm] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  const [observations, setObservations] = useState('');
  const [modalQuantity, setModalQuantity] = useState(1);
  const [formatsByProductId, setFormatsByProductId] = useState<Record<string, ProductFormat[]>>({});
  const [availableAdditions, setAvailableAdditions] = useState<AdditionCatalogItem[]>([]);
  const [selectedAdditions, setSelectedAdditions] = useState<CartItemAddition[]>([]);
  const [selectedPackagingSupplyId, setSelectedPackagingSupplyId] = useState<string | undefined>();
  const [snackbar, setSnackbar] = useState<{ visible: boolean; success: boolean; message: string }>({
    visible: false,
    success: true,
    message: '',
  });

  // Baja (writeoff) modal state
  const [bajaModalVisible, setBajaModalVisible] = useState(false);
  const [bajaSupplyId, setBajaSupplyId] = useState<string>('');
  const [bajaLevel, setBajaLevel] = useState<string>(String(InventoryLevel.STORE));
  const [bajaGrams, setBajaGrams] = useState('');
  const [bajaReason, setBajaReason] = useState<WriteoffReason>(WriteoffReason.DAMAGED);
  const [bajaNotes, setBajaNotes] = useState('');
  const [bajaSubmitting, setBajaSubmitting] = useState(false);
  const [bajaMode, setBajaMode] = useState<'supply' | 'product'>('supply');  // V8
  const [bajaProductId, setBajaProductId] = useState<string>('');             // V8
  const [bajaPortions, setBajaPortions] = useState('');                       // V8

  // V7: Compra en turno modal state
  const [compraTurnoVisible, setCompraTurnoVisible] = useState(false);
  const [compraTurnoDesc, setCompraTurnoDesc] = useState('');
  const [compraTurnoAmount, setCompraTurnoAmount] = useState(0);
  const [compraTurnoSubmitting, setCompraTurnoSubmitting] = useState(false);
  const [salidaType, setSalidaType] = useState<string>('COMPRA');
  const [salidaWorkerId, setSalidaWorkerId] = useState<string>('');
  const [salidaPaymentMethod, setSalidaPaymentMethod] = useState<PaymentMethod>(PaymentMethod.EFECTIVO);
  const [salidaSupplyId, setSalidaSupplyId] = useState<string>('');
  const [salidaBags, setSalidaBags] = useState<string>('1');

  const authorizedSupplies = useMemo(() => {
    return supplies.filter((s: Supply) => (s.isActive ?? true) && s.allowLocalPurchase);
  }, [supplies]);

  const selectedAuthorizedSupply = useMemo(() => {
    return authorizedSupplies.find((s: Supply) => s.id === salidaSupplyId);
  }, [authorizedSupplies, salidaSupplyId]);

  // Estados deudor para fiados (isPaid = false)
  const [isCredit, setIsCredit] = useState<boolean>(false);
  const [debtorType, setDebtorType] = useState<string>('TRABAJADOR');
  const [debtorWorkerId, setDebtorWorkerId] = useState<string>('');
  const [debtorCustomerId, setDebtorCustomerId] = useState<string>('');
  const [debtorName, setDebtorName] = useState<string>('');

  // Clientes y modal de registro de cliente
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [newCustomerModalVisible, setNewCustomerModalVisible] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');
  const [newCustSubmitting, setNewCustSubmitting] = useState(false);

  // Porciones disponibles por tipo de pizza
  const [portionsModalVisible, setPortionsModalVisible] = useState(false);
  const [availablePortions, setAvailablePortions] = useState<Record<string, number>>({});
  const [portionsInput, setPortionsInput] = useState<Record<string, string>>({});
  const portionsSet = Object.keys(availablePortions).length > 0;

  // Porciones vendidas hoy por producto
  const [soldPortions, setSoldPortions] = useState<Record<string, number>>({});
  const [soldPackaging, setSoldPackaging] = useState<Record<string, number>>({});
  const [soldAdditionsCount, setSoldAdditionsCount] = useState(0);
  const [soldDiamondAdditionsCount, setSoldDiamondAdditionsCount] = useState(0);
  const [totalSalesToday, setTotalSalesToday] = useState(0);

  // Cargar porciones del día desde BD
  useEffect(() => {
    if (!selectedStoreId) return;
    (async () => {
      const today = todayColombia();
      const { data } = await supabase
        .from('shift_portions')
        .select('product_id, portions')
        .eq('store_id', selectedStoreId)
        .eq('date', today);
      const map: Record<string, number> = {};
      if (data && data.length > 0) {
        for (const row of data) map[row.product_id] = row.portions;
      }
      setAvailablePortions(map);
    })();
  }, [selectedStoreId]);

  // Cargar porciones vendidas hoy/fecha activa, empaques y total en dinero
  const loadSoldPortions = useCallback(async () => {
    if (!selectedStoreId) return;
    const activeDate = salesDate || todayColombia();
    const { fromUtc: startOfDay, toUtc: endOfDay } = colombiaDateRangeToUtc(activeDate, activeDate);

    // 1. Porciones, bebidas y empaques por item
    const { data: itemData } = await supabase
      .from('sale_items')
      .select('id, product_id, format_name, portions, quantity, packaging_supply_id, packaging_quantity, packaging_total, sales!inner(id, store_id, created_at)')
      .eq('sales.store_id', selectedStoreId)
      .gte('sales.created_at', startOfDay)
      .lte('sales.created_at', endOfDay);

    const portionMap: Record<string, number> = {};
    const packagingMap: Record<string, number> = {};
    let normalAddCount = 0;
    let diamondAddCount = 0;

    if (itemData) {
      for (const row of itemData) {
        portionMap[row.product_id] = (portionMap[row.product_id] ?? 0) + (row.portions || row.quantity || 0);

        if (row.packaging_supply_id && ((row.packaging_quantity ?? 0) > 0 || (row.packaging_total ?? 0) > 0)) {
          const qty = row.packaging_quantity && row.packaging_quantity > 0 ? row.packaging_quantity : 1;
          packagingMap[row.packaging_supply_id] = (packagingMap[row.packaging_supply_id] ?? 0) + qty;
        }
      }

      const itemIds = itemData.map((it) => it.id);
      if (itemIds.length > 0) {
        const { data: addData } = await supabase
          .from('sale_item_additions')
          .select('sale_item_id, quantity')
          .in('sale_item_id', itemIds);

        if (addData) {
          for (const add of addData) {
            const itemRow = itemData.find((it) => it.id === add.sale_item_id);
            const product = products.find((p) => p.id === itemRow?.product_id);
            const isDiamond = (product?.name ?? '').toLowerCase().includes('diamante') || (itemRow?.format_name ?? '').toLowerCase().includes('diamante');
            if (isDiamond) {
              diamondAddCount += add.quantity;
            } else {
              normalAddCount += add.quantity;
            }
          }
        }
      }
    }

    setSoldAdditionsCount(normalAddCount);
    setSoldDiamondAdditionsCount(diamondAddCount);

    // 2. Ventas totales en dinero y empaques a nivel de orden
    const { data: salesData } = await supabase
      .from('sales')
      .select('id, total_amount, packaging_supply_id, packaging_total')
      .eq('store_id', selectedStoreId)
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay);

    if (salesData) {
      const totalAmountToday = salesData.reduce((sum, s) => sum + s.total_amount, 0);
      setTotalSalesToday(totalAmountToday);

      for (const s of salesData) {
        if (s.packaging_supply_id && (s.packaging_total ?? 0) > 0) {
          const hasItemPkg = itemData?.some((it) => (it.sales as unknown as { id: string })?.id === s.id && it.packaging_supply_id === s.packaging_supply_id);
          if (!hasItemPkg) {
            packagingMap[s.packaging_supply_id] = (packagingMap[s.packaging_supply_id] ?? 0) + 1;
          }
        }
      }
    }

    setSoldPortions(portionMap);
    setSoldPackaging(packagingMap);
  }, [selectedStoreId, salesDate, products]);

  useEffect(() => {
    loadSoldPortions();
  }, [loadSoldPortions]);

  // Guardar porciones en BD
  const savePortionsToDB = useCallback(async (portions: Record<string, number>) => {
    if (!selectedStoreId) return;
    const today = todayColombia();
    const rows = Object.entries(portions).map(([productId, count]) => ({
      store_id: selectedStoreId,
      product_id: productId,
      date: today,
      portions: count,
    }));
    // Upsert: insertar o actualizar si ya existe (store_id, product_id, date) es UNIQUE
    await supabase
      .from('shift_portions')
      .upsert(rows, { onConflict: 'store_id,product_id,date' });
  }, [selectedStoreId]);

  // Cargar productos disponibles en este local
  useEffect(() => {
    if (!selectedStoreId) {
      setProducts(cachedProducts.filter((p) => p.isActive));
      return;
    }
    (async () => {
      try {
        const assignedIds = await productStoreAssignmentRepo.getProductIdsByStore(selectedStoreId);
        const assignedSet = new Set(assignedIds);
        setProducts(cachedProducts.filter((p) => p.isActive && assignedSet.has(p.id)));
      } catch {
        setProducts(cachedProducts.filter((p) => p.isActive));
      }
    })();
  }, [selectedStoreId, cachedProducts, productStoreAssignmentRepo]);

  // Cargar formatos de todos los productos
  useEffect(() => {
    const ids = cachedProducts.map((p) => p.id);
    if (ids.length === 0) return;
    (async () => {
      try {
        const formats = await productFormatRepo.getByProductIds(ids);
        const map: Record<string, ProductFormat[]> = {};
        for (const f of formats) {
          if (!map[f.productId]) map[f.productId] = [];
          map[f.productId].push(f);
        }
        setFormatsByProductId(map);
      } catch {
        // silently fail
      }
    })();
  }, [cachedProducts, productFormatRepo]);

  const loadCustomers = useCallback(async () => {
    setLoadingCustomers(true);
    try {
      const list = await customerRepo.getAll();
      setCustomers(list.filter((c) => c.isActive));
    } catch (e) {
      console.error('Error loading customers:', e);
    } finally {
      setLoadingCustomers(false);
    }
  }, [customerRepo]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const handleCreateCustomer = useCallback(async () => {
    if (!newCustName.trim()) {
      Alert.alert('Error', 'Por favor ingresa el nombre del cliente');
      return;
    }
    setNewCustSubmitting(true);
    try {
      const created = await customerRepo.create({
        name: newCustName.trim(),
        phone: newCustPhone.trim() || undefined,
        email: newCustEmail.trim() || undefined,
      });
      await loadCustomers();
      setDebtorCustomerId(created.id);
      setDebtorName(created.name);
      setNewCustomerModalVisible(false);
      setNewCustName('');
      setNewCustPhone('');
      setNewCustEmail('');
      setSnackbar({ visible: true, success: true, message: `Cliente registrado: ${created.name}` });
    } catch (err) {
      Alert.alert('Error', 'No se pudo registrar el cliente');
    } finally {
      setNewCustSubmitting(false);
    }
  }, [newCustName, newCustPhone, newCustEmail, customerRepo, loadCustomers]);

  const loadPendingSales = useCallback(async () => {
    if (!selectedStoreId) return;
    try {
      const unpaid = await saleService.getUnpaidSales(selectedStoreId);
      setPendingSales(unpaid);
    } catch {
      // silently fail
    }
  }, [selectedStoreId, saleService, setPendingSales]);

  useEffect(() => {
    loadPendingSales();
  }, [loadPendingSales]);

  const handleBajaSubmit = useCallback(async () => {
    if (bajaMode === 'supply') {
      const grams = parseFloat(bajaGrams);
      if (!bajaSupplyId || !grams || grams <= 0) {
        Alert.alert('Error', 'Selecciona un insumo e ingresa una cantidad valida');
        return;
      }
      setBajaSubmitting(true);
      try {
        await writeoffService.createRequest(
          selectedStoreId,
          bajaSupplyId,
          Number(bajaLevel) as InventoryLevel,
          grams,
          bajaReason,
          bajaNotes,
          userId,
        );
        setBajaModalVisible(false);
        setBajaSupplyId('');
        setBajaGrams('');
        setBajaNotes('');
        setBajaReason(WriteoffReason.DAMAGED);
        setBajaLevel(String(InventoryLevel.STORE));
        setSnackbar({ visible: true, success: true, message: 'Baja registrada. Pendiente de aprobacion.' });
      } catch {
        setSnackbar({ visible: true, success: false, message: 'Error al registrar la baja' });
      } finally {
        setBajaSubmitting(false);
      }
    } else {
      const portions = parseInt(bajaPortions, 10);
      if (!bajaProductId || !portions || portions <= 0) {
        Alert.alert('Error', 'Selecciona un producto e ingresa una cantidad valida');
        return;
      }
      setBajaSubmitting(true);
      try {
        await writeoffService.createRequest(
          selectedStoreId,
          undefined,
          InventoryLevel.STORE,
          portions,
          bajaReason,
          bajaNotes,
          userId,
          bajaProductId,
        );
        setBajaModalVisible(false);
        setBajaProductId('');
        setBajaPortions('');
        setBajaNotes('');
        setBajaReason(WriteoffReason.DAMAGED);
        setSnackbar({ visible: true, success: true, message: 'Baja registrada. Pendiente de aprobacion.' });
      } catch {
        setSnackbar({ visible: true, success: false, message: 'Error al registrar la baja' });
      } finally {
        setBajaSubmitting(false);
      }
    }
  }, [
    bajaMode,
    bajaSupplyId,
    bajaGrams,
    bajaLevel,
    bajaProductId,
    bajaPortions,
    bajaReason,
    bajaNotes,
    selectedStoreId,
    userId,
    writeoffService,
  ]);

  // V7: Compra en turno handler
  const handleCompraTurnoSubmit = useCallback(async () => {
    if (salidaType === 'ADELANTO' && !salidaWorkerId) {
      Alert.alert('Error', 'Por favor selecciona el trabajador para el adelanto');
      return;
    }
    if (salidaType === 'COMPRA' && !salidaSupplyId && !compraTurnoDesc.trim()) {
      Alert.alert('Error', 'Por favor ingresa una descripción para la compra o selecciona un insumo');
      return;
    }
    if (compraTurnoAmount <= 0) {
      Alert.alert('Error', 'Ingresa un monto válido');
      return;
    }
    setCompraTurnoSubmitting(true);
    try {
      const selectedWorker = workers.find((w) => w.id === salidaWorkerId);
      const category = salidaType === 'ADELANTO' ? 'Adelanto' : 'Compra Turno';
      let desc = compraTurnoDesc.trim();
      let totalGramsAdded = 0;

      if (salidaType === 'COMPRA' && selectedAuthorizedSupply) {
        const bagsCount = parseFloat(salidaBags) || 1;
        totalGramsAdded = bagsCount * selectedAuthorizedSupply.gramsPerBag;
        const detailStr = `${bagsCount} bolsa(s) / ${totalGramsAdded}g`;
        desc = desc
          ? `Compra local: ${selectedAuthorizedSupply.name} (${detailStr}) - ${desc}`
          : `Compra local: ${selectedAuthorizedSupply.name} (${detailStr})`;
      } else if (salidaType === 'ADELANTO') {
        desc = `Adelanto a ${selectedWorker ? selectedWorker.name : 'trabajador'}${compraTurnoDesc.trim() ? `: ${compraTurnoDesc.trim()}` : ''}`;
      }

      const payMethod = salidaType === 'ADELANTO' ? salidaPaymentMethod : PaymentMethod.EFECTIVO;

      await expenseRepo.create({
        date: todayColombia(),
        storeId: selectedStoreId,
        category,
        description: desc,
        amount: compraTurnoAmount,
        paymentMethod: payMethod,
        workerId: salidaType === 'ADELANTO' ? salidaWorkerId : undefined,
        isFixed: category === 'Adelanto',
      });

      if (salidaType === 'COMPRA' && selectedAuthorizedSupply && totalGramsAdded > 0) {
        await inventoryRepo.addGrams(selectedStoreId, selectedAuthorizedSupply.id, totalGramsAdded, InventoryLevel.STORE);
      }

      setCompraTurnoVisible(false);
      setCompraTurnoDesc('');
      setCompraTurnoAmount(0);
      setSalidaType('COMPRA');
      setSalidaWorkerId('');
      setSalidaSupplyId('');
      setSalidaBags('1');
      setSalidaPaymentMethod(PaymentMethod.EFECTIVO);

      let successMsg = `Compra registrada: ${formatCOP(compraTurnoAmount)}`;
      if (salidaType === 'ADELANTO') {
        successMsg = `Adelanto registrado: ${formatCOP(compraTurnoAmount)}`;
      } else if (selectedAuthorizedSupply && totalGramsAdded > 0) {
        successMsg = `Compra de ${selectedAuthorizedSupply.name} registrada (${formatCOP(compraTurnoAmount)}) y +${totalGramsAdded}g cargados al inventario.`;
      }

      setSnackbar({
        visible: true,
        success: true,
        message: successMsg,
      });
    } catch {
      setSnackbar({
        visible: true,
        success: false,
        message: salidaType === 'ADELANTO' ? 'Error al registrar el adelanto' : 'Error al registrar la compra',
      });
    } finally {
      setCompraTurnoSubmitting(false);
    }
  }, [compraTurnoDesc, compraTurnoAmount, selectedStoreId, expenseRepo, inventoryRepo, salidaType, salidaWorkerId, salidaSupplyId, salidaBags, selectedAuthorizedSupply, salidaPaymentMethod, workers]);

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const getPackagingSalePrice = useCallback((packagingSupplyId?: string) => {
    if (!packagingSupplyId) return 0;

    const label = (PACKAGING_LABEL_BY_ID[packagingSupplyId] ?? '').toLowerCase();

    // 1. Prioridad: Precio del Formato de Producto configurado en Productos (Categoría OTRO)
    const matchingProduct = cachedProducts.find((p) => p.category === 'OTRO' && (
      p.id === packagingSupplyId || (label && p.name.toLowerCase().includes(label))
    ));
    if (matchingProduct) {
      const formats = formatsByProductId[matchingProduct.id]?.filter((f) => f.isActive) ?? [];
      if (formats.length > 0 && formats[0].price > 0) return formats[0].price;
    }

    // 2. Prioridad: Precio de venta registrado en el Insumo
    const supply = supplies.find((s) => s.id === packagingSupplyId);
    if (supply && supply.salePriceCop > 0) return supply.salePriceCop;

    // 3. Respaldo estático
    return PACKAGING_SALE_PRICE_COP_BY_ID[packagingSupplyId] ?? 0;
  }, [cachedProducts, formatsByProductId, supplies]);

  const suggestPackagingSupplyId = useCallback((format?: ProductFormat) => {
    if (!format) return undefined;
    const name = format.name.toLowerCase();
    if (format.portions >= 8 || name.includes('familiar')) return PACKAGING_SUPPLY_IDS.CAJA_FAMILIAR;
    if (format.portions >= 4 || name.includes('mediana')) return PACKAGING_SUPPLY_IDS.CAJA_MEDIANA;
    if (format.portions <= 1 || name.includes('individual') || name.includes('diamante')) {
      return PACKAGING_SUPPLY_IDS.EMPAQUE_DIAMANTE_INDIVIDUAL;
    }
    return undefined;
  }, []);

  const handleFormatSelect = useCallback((formatId: string) => {
    setSelectedFormatId(formatId);
    setModalQuantity(1);
    setSelectedPackagingSupplyId(undefined);
  }, []);

  const renderPackagingSelector = useCallback((quantity: number) => {
    if (selectedProduct?.category !== 'PIZZA') return null;
    const selectedPrice = getPackagingSalePrice(selectedPackagingSupplyId);
    const isBox = selectedPackagingSupplyId === PACKAGING_SUPPLY_IDS.CAJA_FAMILIAR
      || selectedPackagingSupplyId === PACKAGING_SUPPLY_IDS.CAJA_MEDIANA;
    const selectedFormat = formatsByProductId[selectedProductId ?? '']?.find((f) => f.id === selectedFormatId);
    const calcPkgQty = (selectedFormat?.portions === 1 && isBox) ? 1 : quantity;

    return (
      <View style={styles.modalPackagingSection}>
        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 6 }}>
          Empaque
        </Text>
        <View style={styles.modalPackagingRow}>
          <Chip
            selected={!selectedPackagingSupplyId}
            onPress={() => setSelectedPackagingSupplyId(undefined)}
            mode="flat"
            icon="close"
            selectedColor={!selectedPackagingSupplyId ? theme.colors.primary : theme.colors.onSurfaceVariant}
            style={{
              backgroundColor: !selectedPackagingSupplyId ? theme.colors.primaryContainer : theme.colors.surfaceVariant,
            }}
            compact
          >
            Sin caja
          </Chip>
          {PACKAGING_OPTIONS.map((opt) => {
            const price = getPackagingSalePrice(opt.id);
            return (
              <Chip
                key={opt.id}
                selected={selectedPackagingSupplyId === opt.id}
                onPress={() => setSelectedPackagingSupplyId(selectedPackagingSupplyId === opt.id ? undefined : opt.id)}
                mode="flat"
                icon={opt.icon}
                selectedColor={selectedPackagingSupplyId === opt.id ? theme.colors.primary : theme.colors.onSurfaceVariant}
                style={{
                  backgroundColor: selectedPackagingSupplyId === opt.id ? theme.colors.primaryContainer : theme.colors.surfaceVariant,
                }}
                compact
              >
                {price > 0 ? `${opt.shortLabel} +${formatCOP(price)}` : opt.shortLabel}
              </Chip>
            );
          })}
        </View>
        {selectedPackagingSupplyId && (
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
            {PACKAGING_LABEL_BY_ID[selectedPackagingSupplyId] ?? 'Empaque'} · {calcPkgQty} und. · {formatCOP(selectedPrice * calcPkgQty)}
          </Text>
        )}
      </View>
    );
  }, [formatsByProductId, getPackagingSalePrice, selectedFormatId, selectedPackagingSupplyId, selectedProduct?.category, selectedProductId, theme.colors.onSurfaceVariant, theme.colors.primary, theme.colors.primaryContainer, theme.colors.surfaceVariant]);

  const handleProductSelect = useCallback((productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    const activeFormats = formatsByProductId[productId]?.filter((f) => f.isActive) ?? [];

    if (activeFormats.length === 0) {
      setSnackbar({ visible: true, success: false, message: `"${product.name}" no tiene formatos activos. Configúralo en Inventario → Productos.` });
      return;
    }

    if (activeFormats.length <= 1) {
      // Single format: simple quantity modal
      setSelectedProductId(productId);
      setSelectedFormatId(activeFormats[0]?.id ?? null);
      setSelectedPackagingSupplyId(undefined);
      setBeverageQuantity(1);
      setBeverageModalVisible(true);
    } else {
      // Multiple formats: show format selector
      setSelectedProductId(productId);
      setSelectedFormatId(activeFormats[0]?.id ?? null);
      setSelectedPackagingSupplyId(undefined);
      setModalQuantity(1);
      setSizeModalVisible(true);
    }
  }, [products, formatsByProductId]);

  // Cargar adiciones cuando cambia el formato seleccionado
  useEffect(() => {
    setAvailableAdditions([]);
    setSelectedAdditions([]);
    if (!selectedFormatId) return;
    additionCatalogRepo
      .getByFormatId(selectedFormatId)
      .then(setAvailableAdditions)
      .catch((err) => console.error('Error cargando adiciones:', err));
  }, [selectedFormatId, additionCatalogRepo]);

  const handleToggleAddition = useCallback((addition: AdditionCatalogItem) => {
    setSelectedAdditions((prev) => {
      const exists = prev.find((a) => a.additionCatalogId === addition.id);
      if (exists) return prev.filter((a) => a.additionCatalogId !== addition.id);
      return [...prev, {
        additionCatalogId: addition.id,
        supplyId: addition.supplyId,
        name: addition.name,
        price: addition.price,
        grams: addition.grams,
        quantity: 1,
      }];
    });
  }, []);

  const handleUpdateAdditionQuantity = useCallback((additionCatalogId: string, qty: number) => {
    if (qty <= 0) {
      setSelectedAdditions((prev) => prev.filter((a) => a.additionCatalogId !== additionCatalogId));
      return;
    }
    setSelectedAdditions((prev) =>
      prev.map((a) => a.additionCatalogId === additionCatalogId ? { ...a, quantity: qty } : a),
    );
  }, []);

  const handleSizeConfirm = useCallback(() => {
    if (!selectedProduct || !selectedFormatId) return;
    const format = formatsByProductId[selectedProduct.id]?.find((f) => f.id === selectedFormatId);
    if (!format) return;

    const isBox = selectedPackagingSupplyId === PACKAGING_SUPPLY_IDS.CAJA_FAMILIAR
      || selectedPackagingSupplyId === PACKAGING_SUPPLY_IDS.CAJA_MEDIANA;
    const pkgQty = (format.portions === 1 && isBox) ? 1 : modalQuantity;

    addToCart({
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      formatId: format.id,
      formatName: format.name,
      portionsPerUnit: selectedProduct.category === 'PIZZA' ? format.portions : 0,
      quantity: modalQuantity,
      unitPrice: format.price,
      additions: selectedAdditions.length > 0 ? selectedAdditions : undefined,
      packagingSupplyId: selectedPackagingSupplyId,
      packagingLabel: selectedPackagingSupplyId ? PACKAGING_LABEL_BY_ID[selectedPackagingSupplyId] : undefined,
      packagingUnitPrice: getPackagingSalePrice(selectedPackagingSupplyId),
      packagingQuantity: selectedPackagingSupplyId ? pkgQty : 0,
    });
    setSizeModalVisible(false);
    setSelectedProductId(null);
    setSelectedFormatId(null);
    setModalQuantity(1);
    setSelectedAdditions([]);
    setSelectedPackagingSupplyId(undefined);
  }, [addToCart, formatsByProductId, getPackagingSalePrice, modalQuantity, selectedAdditions, selectedPackagingSupplyId, selectedFormatId, selectedProduct]);

  const handleBeverageConfirm = useCallback(() => {
    if (!selectedProduct) return;
    const formats = formatsByProductId[selectedProduct.id]?.filter((f) => f.isActive) ?? [];
    const format = formats[0];
    if (!format) return;

    addToCart({
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      formatId: format.id,
      formatName: format.name,
      portionsPerUnit: selectedProduct.category === 'PIZZA' ? format.portions : 0,
      quantity: beverageQuantity,
      unitPrice: format.price,
      additions: selectedAdditions.length > 0 ? selectedAdditions : undefined,
      packagingSupplyId: selectedProduct.category === 'PIZZA' ? selectedPackagingSupplyId : undefined,
      packagingLabel: selectedProduct.category === 'PIZZA' && selectedPackagingSupplyId ? PACKAGING_LABEL_BY_ID[selectedPackagingSupplyId] : undefined,
      packagingUnitPrice: selectedProduct.category === 'PIZZA' ? getPackagingSalePrice(selectedPackagingSupplyId) : 0,
    });
    setBeverageModalVisible(false);
    setSelectedAdditions([]);
    setSelectedProductId(null);
    setBeverageQuantity(1);
    setSelectedPackagingSupplyId(undefined);
  }, [addToCart, beverageQuantity, formatsByProductId, getPackagingSalePrice, selectedAdditions, selectedPackagingSupplyId, selectedProduct]);

  const totalAmount = cart.reduce((sum, i) => sum + i.subtotal, 0);
  const mixedPaymentEditedFieldRef = useRef<'cash' | 'bank'>('cash');

  const clampTenderAmount = useCallback((value: number) => {
    if (!Number.isFinite(value)) return 0;
    return Math.min(Math.max(value, 0), totalAmount);
  }, [totalAmount]);

  const normalizeMixedPayment = useCallback((anchor: 'cash' | 'bank' = mixedPaymentEditedFieldRef.current) => {
    if (anchor === 'bank') {
      const bank = clampTenderAmount(bankAmount);
      return {
        cash: Math.max(totalAmount - bank, 0),
        bank,
      };
    }

    const cash = clampTenderAmount(cashAmount);
    return {
      cash,
      bank: Math.max(totalAmount - cash, 0),
    };
  }, [bankAmount, cashAmount, clampTenderAmount, totalAmount]);

  const handleMixedCashChange = useCallback((value: number) => {
    const cash = clampTenderAmount(value);
    mixedPaymentEditedFieldRef.current = 'cash';
    setCashAmount(cash);
    setBankAmount(Math.max(totalAmount - cash, 0));
  }, [clampTenderAmount, totalAmount]);

  const handleMixedBankChange = useCallback((value: number) => {
    const bank = clampTenderAmount(value);
    mixedPaymentEditedFieldRef.current = 'bank';
    setBankAmount(bank);
    setCashAmount(Math.max(totalAmount - bank, 0));
  }, [clampTenderAmount, totalAmount]);

  const handlePaymentMethodChange = useCallback((method: PaymentMethod) => {
    if (method === paymentMethod) return;

    setPaymentMethod(method);

    if (method === PaymentMethod.EFECTIVO) {
      mixedPaymentEditedFieldRef.current = 'cash';
      setCashAmount(totalAmount);
      setBankAmount(0);
      return;
    }

    if (method === PaymentMethod.TRANSFERENCIA) {
      mixedPaymentEditedFieldRef.current = 'bank';
      setCashAmount(0);
      setBankAmount(totalAmount);
      setAmountReceived(0);
      return;
    }

    if (paymentMethod === PaymentMethod.TRANSFERENCIA) {
      mixedPaymentEditedFieldRef.current = 'bank';
      setCashAmount(0);
      setBankAmount(totalAmount);
      return;
    }

    mixedPaymentEditedFieldRef.current = 'cash';
    setCashAmount(totalAmount);
    setBankAmount(0);
  }, [paymentMethod, totalAmount]);

  useEffect(() => {
    if (paymentMethod !== PaymentMethod.MIXTO) return;
    const normalized = normalizeMixedPayment();
    if (cashAmount !== normalized.cash) setCashAmount(normalized.cash);
    if (bankAmount !== normalized.bank) setBankAmount(normalized.bank);
  }, [bankAmount, cashAmount, normalizeMixedPayment, paymentMethod]);

  // V6 fix: only reset confirm state when cart becomes empty (not on every item change)
  const prevCartLengthRef = useRef(cart.length);
  useEffect(() => {
    if (prevCartLengthRef.current > 0 && cart.length === 0) {
      setReadyToConfirm(false);
    }
    prevCartLengthRef.current = cart.length;
  }, [cart.length]);

  const scrollToTop = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }, 300);
  }, []);

  const saleToCartItems = useCallback((sale: Sale): CartItem[] => sale.items.map((item, index) => {
    const product = products.find((p) => p.id === item.productId);
    const portionsPerUnit = item.quantity > 0 ? item.portions / item.quantity : item.portions;

    return {
      cartItemId: `sale-${sale.id}-${item.id || index}`,
      productId: item.productId,
      productName: product?.name ?? item.formatName ?? 'Producto',
      formatId: item.formatId ?? '',
      formatName: item.formatName,
      portionsPerUnit: Math.max(1, portionsPerUnit || 1),
      quantity: item.quantity,
      portions: item.portions,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
      customerNote: '',
      additions: item.additions ?? [],
      additionsTotal: item.additionsTotal ?? 0,
      packagingSupplyId: item.packagingSupplyId ?? (index === 0 ? sale.packagingSupplyId : undefined),
      packagingLabel: item.packagingLabel ?? (item.packagingSupplyId ? PACKAGING_LABEL_BY_ID[item.packagingSupplyId] : undefined),
      packagingUnitPrice: item.packagingUnitPrice ?? 0,
      packagingQuantity: item.packagingQuantity ?? (item.packagingSupplyId ? item.quantity : 0),
      packagingTotal: item.packagingTotal ?? 0,
    };
  }), [products]);

  const getCartPortionsByProduct = useCallback((items: CartItem[]) => {
    const totals: Record<string, number> = {};
    for (const item of items) {
      const product = products.find((p) => p.id === item.productId);
      if (product?.hasRecipe) {
        totals[item.productId] = (totals[item.productId] ?? 0) + item.portions;
      }
    }
    return totals;
  }, [products]);

  const getSalePortionsByProduct = useCallback((sale: Sale | null) => {
    if (!sale) return {};
    const totals: Record<string, number> = {};
    for (const item of sale.items) {
      const product = products.find((p) => p.id === item.productId);
      if (product?.hasRecipe) {
        totals[item.productId] = (totals[item.productId] ?? 0) + item.portions;
      }
    }
    return totals;
  }, [products]);

  const applyPortionDelta = useCallback((previousSale: Sale | null, nextCart: CartItem[]) => {
    const previous = getSalePortionsByProduct(previousSale);
    const next = getCartPortionsByProduct(nextCart);
    const productIds = new Set([...Object.keys(previous), ...Object.keys(next)]);
    const updatedSold = { ...soldPortions };
    const updatedAvailable = { ...availablePortions };

    productIds.forEach((productId) => {
      const delta = (next[productId] ?? 0) - (previous[productId] ?? 0);
      if (delta === 0) return;

      updatedSold[productId] = Math.max(0, (updatedSold[productId] ?? 0) + delta);
      if (portionsSet && updatedAvailable[productId] !== undefined) {
        updatedAvailable[productId] = Math.max(0, updatedAvailable[productId] - delta);
      }
    });

    setSoldPortions(updatedSold);
    if (portionsSet) {
      setAvailablePortions(updatedAvailable);
      savePortionsToDB(updatedAvailable);
    }
  }, [availablePortions, getCartPortionsByProduct, getSalePortionsByProduct, portionsSet, savePortionsToDB, soldPortions]);

  const handleCancelEdit = useCallback(() => {
    setEditingSale(null);
    clearCart();
    setCashAmount(0);
    setBankAmount(0);
    setAmountReceived(0);
    setPaymentMethod(PaymentMethod.EFECTIVO);
    setObservations('');
    setIsPaid(false);
    setReadyToConfirm(false);
  }, [clearCart]);

  const handleEditPendingSale = useCallback((sale: Sale) => {
    if (sale.isDispatched) {
      setSnackbar({ visible: true, success: false, message: 'No se puede editar una orden despachada' });
      return;
    }

    setCart(saleToCartItems(sale), sale.packagingSupplyId);
    setEditingSale(sale);
    mixedPaymentEditedFieldRef.current = sale.paymentMethod === PaymentMethod.TRANSFERENCIA ? 'bank' : 'cash';
    setPaymentMethod(sale.paymentMethod);
    setCashAmount(sale.cashAmount);
    setBankAmount(sale.bankAmount);
    setAmountReceived(0);
    setIsPaid(sale.isPaid);
    setIsCredit(sale.isCredit ?? false);
    setDebtorType(sale.debtorType ?? 'TRABAJADOR');
    setDebtorWorkerId(sale.debtorWorkerId ?? '');
    setDebtorCustomerId(sale.debtorCustomerId ?? '');
    setDebtorName(sale.debtorName ?? '');
    setObservations(sale.observations ?? '');
    setReadyToConfirm(false);
    scrollToTop();
  }, [saleToCartItems, scrollToTop, setCart]);

  const handleSubmitSale = useCallback(async () => {
    if (!isPaid && isCredit) {
      if (debtorType === 'TRABAJADOR' && !debtorWorkerId) {
        setSnackbar({ visible: true, success: false, message: 'Por favor selecciona el trabajador a quien se le fía' });
        return;
      }
      if (debtorType === 'CLIENTE' && !debtorCustomerId) {
        setSnackbar({ visible: true, success: false, message: 'Por favor selecciona el cliente a quien se le fía' });
        return;
      }
    }

    const mixedAmounts = normalizeMixedPayment();
    const effectiveCash = paymentMethod === PaymentMethod.TRANSFERENCIA ? 0
      : paymentMethod === PaymentMethod.EFECTIVO ? totalAmount
      : mixedAmounts.cash;
    const effectiveBank = paymentMethod === PaymentMethod.EFECTIVO ? 0
      : paymentMethod === PaymentMethod.TRANSFERENCIA ? totalAmount
      : mixedAmounts.bank;

    setSubmitting(true);
    try {
      const submittedCart = [...cart];
      const previousSale = editingSale;
      const items = submittedCart.map((c) => ({
        productId: c.productId,
        formatId: c.formatId,
        formatName: c.formatName,
        portionsPerUnit: c.portionsPerUnit,
        quantity: c.quantity,
        unitPrice: c.unitPrice,
        additions: c.additions.length > 0 ? c.additions : undefined,
        packagingSupplyId: c.packagingSupplyId,
        packagingLabel: c.packagingLabel,
        packagingUnitPrice: c.packagingUnitPrice,
        packagingQuantity: c.packagingQuantity,
      }));

      const customerNotes = submittedCart
        .filter((c) => c.customerNote.trim())
        .map((c) => `${c.productName}: ${c.customerNote.trim()}`)
        .join(' | ');
      const customerNoteForSubmit = customerNotes || previousSale?.customerNote || undefined;
      const customTimestamp = salesDate !== todayColombia()
        ? `${salesDate}T${new Date().toTimeString().slice(0, 8)}-05:00`
        : undefined;

      const sale = previousSale
        ? await saleService.updateSale(
            previousSale.id,
            selectedStoreId,
            items,
            paymentMethod,
            effectiveCash,
            effectiveBank,
            observations || undefined,
            isPaid,
            customerNoteForSubmit,
            cartPackagingSupplyId,
            isCredit,
            debtorName || undefined,
            debtorType || undefined,
            debtorWorkerId || undefined,
            debtorCustomerId || undefined,
            customTimestamp,
          )
        : await saleService.createSale(
            selectedStoreId,
            items,
            paymentMethod,
            effectiveCash,
            effectiveBank,
            observations || undefined,
            isPaid,
            customerNoteForSubmit,
            cartPackagingSupplyId,
            isCredit,
            debtorName || undefined,
            debtorType || undefined,
            debtorWorkerId || undefined,
            debtorCustomerId || undefined,
            customTimestamp,
          );

      const totalPortions = submittedCart.reduce((sum, i) => sum + i.portions, 0);
      const paidLabel = isPaid ? '' : isCredit ? ' (FIADO)' : ' (PENDIENTE DE PAGO)';

      clearCart();
      setEditingSale(null);
      setCashAmount(0);
      setBankAmount(0);
      setAmountReceived(0);
      setPaymentMethod(PaymentMethod.EFECTIVO);
      setObservations('');
      setIsPaid(false);
      setIsCredit(false);
      setDebtorType('TRABAJADOR');
      setDebtorWorkerId('');
      setDebtorCustomerId('');
      setDebtorName('');
      setReadyToConfirm(false);

      setSnackbar({
        visible: true,
        success: true,
        message: previousSale
          ? `Orden actualizada: ${totalPortions} porc. por ${formatCOP(sale.totalAmount)}${paidLabel}`
          : `Venta registrada: ${totalPortions} porc. por ${formatCOP(sale.totalAmount)}${paidLabel}`,
      });

      applyPortionDelta(previousSale, submittedCart);

      loadPendingSales();
      loadSoldPortions();
    } catch (error) {
      console.error('Error registrando venta:', error);
      setSnackbar({
        visible: true,
        success: false,
        message: `No se pudo ${editingSale ? 'actualizar' : 'registrar'} la venta: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setSubmitting(false);
    }
  }, [applyPortionDelta, cart, cartPackagingSupplyId, clearCart, editingSale, isPaid, isCredit, debtorType, debtorWorkerId, debtorCustomerId, debtorName, loadPendingSales, loadSoldPortions, normalizeMixedPayment, observations, paymentMethod, saleService, selectedStoreId, totalAmount]);

  const handleFabPress = useCallback(() => {
    if (cart.length === 0) {
      Alert.alert('Error', 'Agrega productos al carrito primero');
      return;
    }

    if (!readyToConfirm) {
      // First press: scroll to top to review cart + payment
      setReadyToConfirm(true);
      scrollToTop();
      return;
    }

    // Second press: confirm and submit
    handleSubmitSale();
  }, [cart, readyToConfirm, scrollToTop, handleSubmitSale]);

  const updatePendingSale = useCallback((saleId: string, updates: Partial<Sale>): boolean => {
    const merged = pendingSales.map((s) => s.id === saleId ? { ...s, ...updates } : s);
    const completed = merged.find((s) => s.id === saleId);
    const isFullyDone = !!(completed && (completed.isPaid || completed.isCredit) && completed.isDispatched);
    if (editingSale?.id === saleId && completed) {
      setEditingSale(completed);
      if (updates.isPaid !== undefined) setIsPaid(updates.isPaid);
      if (updates.paymentMethod !== undefined) handlePaymentMethodChange(updates.paymentMethod);
    }
    setPendingSales(merged.filter((s) => !((s.isPaid || s.isCredit) && s.isDispatched)));
    return isFullyDone;
  }, [editingSale, handlePaymentMethodChange, pendingSales, setPendingSales]);

  const handleMarkAsPaid = useCallback(async (sale: Sale) => {
    try {
      await saleService.markAsPaid(sale.id);
      const done = updatePendingSale(sale.id, { isPaid: true });
      setSnackbar({
        visible: true,
        success: true,
        message: done ? `${formatCOP(sale.totalAmount)} — Venta completada` : `${formatCOP(sale.totalAmount)} — Pagado`,
      });
    } catch {
      setSnackbar({ visible: true, success: false, message: 'Error al marcar como pagada' });
    }
  }, [saleService, updatePendingSale]);

  const handleMarkAsUnpaid = useCallback(async (sale: Sale) => {
    try {
      await saleService.markAsUnpaid(sale.id);
      updatePendingSale(sale.id, { isPaid: false });
      setSnackbar({ visible: true, success: true, message: `${formatCOP(sale.totalAmount)} — Marcado como no pagado` });
    } catch {
      setSnackbar({ visible: true, success: false, message: 'Error al desmarcar pago' });
    }
  }, [saleService, updatePendingSale]);

  const handleMarkAsDispatched = useCallback(async (sale: Sale) => {
    try {
      await saleService.markAsDispatched(sale.id);
      const done = updatePendingSale(sale.id, { isDispatched: true });
      if (editingSale?.id === sale.id) {
        handleCancelEdit();
      }
      setSnackbar({
        visible: true,
        success: true,
        message: done ? `${formatCOP(sale.totalAmount)} — Venta completada` : `${formatCOP(sale.totalAmount)} — Despachado`,
      });
    } catch {
      setSnackbar({ visible: true, success: false, message: 'Error al marcar como despachada' });
    }
  }, [editingSale, handleCancelEdit, saleService, updatePendingSale]);

  // Change calculator for pending sales
  const [pendingAmountReceived, setPendingAmountReceived] = useState<Record<string, number>>({});

  // Auto-dismiss toast
  useEffect(() => {
    if (!snackbar.visible) return;
    const timer = setTimeout(() => setSnackbar((s) => ({ ...s, visible: false })), 4000);
    return () => clearTimeout(timer);
  }, [snackbar.visible]);

  const formatTime = (timestamp: string) => {
    const d = new Date(timestamp);
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  };

  const { height: windowHeight } = useWindowDimensions();

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background, minHeight: windowHeight }]}
      behavior={Platform.OS === 'web' ? undefined : Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Sticky Header and Quick Actions Bar */}
      <View style={{ paddingHorizontal: 12, paddingTop: 12, backgroundColor: theme.colors.background }}>
        <View style={styles.headerRow}>
          <StoreSelector excludeProductionCenter />
          {isGerente ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Chip
                compact
                icon="calendar-edit"
                onPress={() => setCalendarVisible(true)}
                style={{ backgroundColor: salesDate !== todayColombia() ? '#D32F2F' : '#2A2A2A' }}
                textStyle={{ color: '#FFF', fontSize: 11, fontWeight: '700' }}
              >
                {salesDate === todayColombia() ? '⚡ Hoy' : `🗓️ ${formatDate(salesDate)}`}
              </Chip>
            </View>
          ) : (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {formatDate(new Date())}
            </Text>
          )}
        </View>

        {isGerente && salesDate !== todayColombia() && (
          <View style={{ backgroundColor: '#B71C1C', padding: 6, paddingHorizontal: 10, borderRadius: 8, marginTop: 4, marginBottom: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '700', flex: 1 }}>
              ⚠️ MODO RETROACTIVO: Registrando ventas para {formatDate(salesDate)} ({salesDate})
            </Text>
            <Button compact mode="text" labelStyle={{ color: '#FFF', fontSize: 10, fontWeight: '700' }} onPress={() => setSalesDate(todayColombia())}>
              Volver a Hoy
            </Button>
          </View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4, flexGrow: 0 }}>
          <View style={styles.navRow}>
            <Button
              mode="outlined"
              icon="cash-minus"
              compact
              onPress={() => {
                setSalidaType('COMPRA');
                setSalidaWorkerId('');
                setCompraTurnoDesc('');
                setCompraTurnoAmount(0);
                setCompraTurnoVisible(true);
              }}
            >
              Salida Caja
            </Button>
            <Button
              mode="outlined"
              icon="package-variant-remove"
              compact
              onPress={() => {
                if (userRole !== UserRole.GERENTE && userRole !== UserRole.ADMIN_LOCAL) setBajaLevel(String(InventoryLevel.STORE));
                setBajaModalVisible(true);
              }}
            >
              Baja
            </Button>
            <Button
              mode="outlined"
              icon="clipboard-check-outline"
              compact
              onPress={() => router.push('/(tabs)/inventario/cierre-fisico')}
            >
              Conteo
            </Button>
            <Button
              mode="outlined"
              icon="cash-lock"
              compact
              onPress={() => router.push(`/(tabs)/ventas/cierre-caja?date=${salesDate}` as any)}
            >
              Cierre ({salesDate === todayColombia() ? 'Hoy' : salesDate})
            </Button>
            <Button
              mode="outlined"
              icon="history"
              compact
              onPress={() => router.push('/(tabs)/ventas/historial')}
            >
              Historial
            </Button>
            <Button
              mode="outlined"
              icon="food"
              compact
              onPress={() => router.push('/(tabs)/ventas/consumo-ventas')}
            >
              Consumo
            </Button>
          </View>
        </ScrollView>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scrollContent, { minHeight: windowHeight, paddingTop: 4 }]}
        keyboardShouldPersistTaps="handled"
      >

        {/* V1: Cash opening banner */}
        {needsOpening && (
          <Card style={{ borderRadius: 12, marginBottom: 12, borderWidth: 2, borderColor: '#F57C00' }} mode="elevated">
            <Card.Content style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text variant="titleSmall" style={{ fontWeight: '700', color: '#F57C00' }}>
                  Caja sin abrir ({salesDate === todayColombia() ? 'Hoy' : formatDate(salesDate)})
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Registra la base de efectivo del turno para la fecha {salesDate}
                </Text>
              </View>
              <Button
                mode="contained"
                compact
                buttonColor="#F57C00"
                textColor="#FFFFFF"
                icon="cash-register"
                onPress={() => router.push(`/(tabs)/ventas/apertura-caja?date=${salesDate}` as any)}
              >
                Abrir Caja
              </Button>
            </Card.Content>
          </Card>
        )}

        {/* Pending Sales */}
        {pendingSales.length > 0 && (
          <View style={styles.pendingSection}>
            <Text
              variant="titleSmall"
              style={{ fontWeight: '600', color: theme.colors.error, marginBottom: 8 }}
            >
              Pendientes ({pendingSales.length})
            </Text>
            {pendingSales.map((sale) => {
              const itemsSummary = sale.items
                .map((i) => `${i.portions} porc. ${products.find((p) => p.id === i.productId)?.name ?? ''}`)
                .join(', ');
              const received = pendingAmountReceived[sale.id] ?? 0;

              return (
                <View
                  key={sale.id}
                  style={[styles.pendingItem, { backgroundColor: theme.colors.errorContainer }]}
                >
                  <View style={styles.pendingTopRow}>
                    <Text variant="titleSmall" style={{ fontWeight: '700', color: theme.colors.onErrorContainer }}>
                      {formatCOP(sale.totalAmount)}
                    </Text>
                    <Text variant="labelMedium" style={{ color: theme.colors.onErrorContainer }}>
                      {formatTime(sale.timestamp)}
                    </Text>
                  </View>
                  <Text variant="bodySmall" style={{ color: theme.colors.onErrorContainer, marginTop: 4 }} numberOfLines={2}>
                    {itemsSummary}
                  </Text>
                  {(sale.customerNote || sale.observations) ? (
                    <Text variant="bodySmall" style={{ color: theme.colors.onErrorContainer, fontWeight: '700', marginTop: 6 }} numberOfLines={1}>
                      {[sale.customerNote, sale.observations].filter(Boolean).join(' · ')}
                    </Text>
                  ) : null}

                  {/* Payment row */}
                  <View style={styles.pendingActionsRow}>
                    {sale.isPaid ? (
                      <Chip
                        compact
                        icon="check-circle"
                        textStyle={{ fontSize: 11, color: '#66BB6A' }}
                        style={{ backgroundColor: '#1C3D2A' }}
                        onPress={() => handleMarkAsUnpaid(sale)}
                      >
                        Pagado
                      </Chip>
                    ) : sale.isCredit ? (
                      <Chip
                        compact
                        icon="account-cash"
                        textStyle={{ fontSize: 11, color: '#FFB74D' }}
                        style={{ backgroundColor: '#4E342E' }}
                      >
                        Fiado a: {sale.debtorName || 'Cliente'}
                      </Chip>
                    ) : (
                      <>
                        <Button
                          mode="contained"
                          compact
                          onPress={() => handleMarkAsPaid(sale)}
                          buttonColor="#388E3C"
                          textColor="#FFFFFF"
                          labelStyle={{ fontSize: 12 }}
                          icon="check"
                        >
                          Ya pago
                        </Button>
                        {([PaymentMethod.EFECTIVO, PaymentMethod.TRANSFERENCIA] as const).map((pm) => (
                          <Chip
                            key={pm}
                            compact
                            selected={sale.paymentMethod === pm}
                            onPress={async () => {
                              if (sale.paymentMethod === pm) return;
                              try {
                                await saleService.updatePaymentMethod(sale.id, pm);
                                updatePendingSale(sale.id, { paymentMethod: pm });
                              } catch { /* ignore */ }
                            }}
                            textStyle={{ fontSize: 10, color: sale.paymentMethod === pm ? '#FFF' : '#999' }}
                            style={{ backgroundColor: sale.paymentMethod === pm ? '#555' : '#2A2A2A' }}
                            showSelectedOverlay={false}
                          >
                            {pm === PaymentMethod.EFECTIVO ? 'Efectivo' : 'Transfer.'}
                          </Chip>
                        ))}
                      </>
                    )}
                    {!sale.isDispatched && (
                      <Button
                        mode={editingSale?.id === sale.id ? 'contained' : 'outlined'}
                        compact
                        onPress={() => handleEditPendingSale(sale)}
                        buttonColor={editingSale?.id === sale.id ? '#5E6AD2' : undefined}
                        textColor={editingSale?.id === sale.id ? '#FFFFFF' : '#F5F0EB'}
                        labelStyle={{ fontSize: 12 }}
                        icon="pencil"
                      >
                        {editingSale?.id === sale.id ? 'Editando' : 'Editar'}
                      </Button>
                    )}
                    {sale.isDispatched ? (
                      <Chip compact icon="check-circle" textStyle={{ fontSize: 11, color: '#64B5F6' }} style={{ backgroundColor: '#1A3A5C' }}>
                        Despachado
                      </Chip>
                    ) : (
                      <Button
                        mode="contained"
                        compact
                        onPress={() => handleMarkAsDispatched(sale)}
                        buttonColor="#1565C0"
                        textColor="#FFFFFF"
                        labelStyle={{ fontSize: 12 }}
                        icon="truck-delivery"
                      >
                        Despachar
                      </Button>
                    )}
                  </View>

                  {/* Change calculator for unpaid cash sales */}
                  {!sale.isPaid && !sale.isCredit && (sale.paymentMethod === PaymentMethod.EFECTIVO || sale.paymentMethod === PaymentMethod.MIXTO) && (
                    <View style={{ marginTop: 6 }}>
                      <CurrencyInput
                        value={received}
                        onChangeValue={(v) => setPendingAmountReceived((prev) => ({ ...prev, [sale.id]: v }))}
                        label="Monto Recibido"
                      />
                      {received > 0 && (
                        <Text
                          variant="bodyMedium"
                          style={{
                            fontWeight: 'bold',
                            marginTop: 4,
                            color: received >= sale.totalAmount ? '#4CAF50' : '#F44336',
                          }}
                        >
                          Cambio: {formatCOP(Math.max(0, received - sale.totalAmount))}
                          {received < sale.totalAmount ? ` (Faltan ${formatCOP(sale.totalAmount - received)})` : ''}
                        </Text>
                      )}
                    </View>
                  )}

                  <Text variant="labelSmall" style={{ color: theme.colors.onErrorContainer, opacity: 0.5, fontSize: 10, marginTop: 4 }} numberOfLines={1}>
                    {sale.workerName ?? ''}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* V3: Cart + Payment moved above ProductGrid */}
        <Card style={[styles.cartCard, readyToConfirm && styles.cartCardReady]} mode="elevated">
          <Card.Content>
            <View style={styles.cartHeader}>
              <Text variant="titleMedium" style={{ fontWeight: '600' }}>
                {editingSale ? 'Editar orden pendiente' : 'Carrito'}
              </Text>
              {cart.length > 0 && (
                <IconButton
                  icon="delete-sweep"
                  size={20}
                  onPress={editingSale ? handleCancelEdit : clearCart}
                  iconColor={theme.colors.error}
                />
              )}
            </View>
            {editingSale && (
              <View style={styles.editingBanner}>
                <View style={{ flex: 1 }}>
                  <Text variant="labelLarge" style={styles.editingBannerTitle}>
                    Orden {editingSale.id.slice(0, 6)} en edicion
                  </Text>
                  <Text variant="bodySmall" style={styles.editingBannerMeta}>
                    {formatTime(editingSale.timestamp)} · Antes {formatCOP(editingSale.totalAmount)}
                  </Text>
                </View>
                <Button
                  mode="text"
                  compact
                  icon="close"
                  onPress={handleCancelEdit}
                  textColor="#F5F0EB"
                >
                  Cancelar
                </Button>
              </View>
            )}
            <CartSummary
              items={cart}
              onRemove={removeFromCart}
              onUpdateQuantity={updateQuantity}
              onUpdateNote={updateCustomerNote}
              packagingSupplyId={cartPackagingSupplyId}
              onPackagingChange={setCartPackaging}
            />

            {cart.length > 0 && (
              <>
                {/* V4: Payment method, isPaid, and observations always visible */}
                <Divider style={styles.divider} />

                <Text variant="titleSmall" style={{ fontWeight: '600', marginBottom: 8 }}>
                  Metodo de Pago
                </Text>
                <PaymentMethodPicker value={paymentMethod} onChange={handlePaymentMethodChange} />

                {paymentMethod === PaymentMethod.MIXTO && (
                  <View style={styles.mixtoInputs}>
                    <CurrencyInput
                      value={cashAmount}
                      onChangeValue={handleMixedCashChange}
                      label="Efectivo"
                      style={styles.halfInput}
                    />
                    <CurrencyInput
                      value={bankAmount}
                      onChangeValue={handleMixedBankChange}
                      label="Transferencia"
                      style={styles.halfInput}
                    />
                  </View>
                )}

                {/* V5: Calculadora de cambio */}
                {(paymentMethod === PaymentMethod.EFECTIVO || paymentMethod === PaymentMethod.MIXTO) && (
                  <View style={{ marginTop: 10 }}>
                    <CurrencyInput
                      value={amountReceived}
                      onChangeValue={setAmountReceived}
                      label="Monto Recibido"
                    />
                    {amountReceived > 0 && (() => {
                      const cashPortion = paymentMethod === PaymentMethod.MIXTO ? normalizeMixedPayment().cash : totalAmount;
                      const change = amountReceived - cashPortion;
                      return (
                        <Text
                          variant="titleMedium"
                          style={{
                            fontWeight: 'bold',
                            marginTop: 6,
                            color: change >= 0 ? '#4CAF50' : '#F44336',
                          }}
                        >
                          Cambio: {formatCOP(Math.max(0, change))}
                          {change < 0 ? ` (Faltan ${formatCOP(Math.abs(change))})` : ''}
                        </Text>
                      );
                    })()}
                  </View>
                )}

                <Divider style={styles.divider} />

                {/* Paid toggle — always visible */}
                <View style={styles.paidRow}>
                  <Text variant="bodyMedium" style={{ flex: 1 }}>
                    {isPaid ? 'Pagado' : 'Pendiente de pago'}
                  </Text>
                  <Chip
                    selected={isPaid}
                    onPress={() => {
                      const next = !isPaid;
                      setIsPaid(next);
                      if (next) {
                        setDebtorType('TRABAJADOR');
                        setDebtorWorkerId('');
                        setDebtorName('');
                      }
                    }}
                    mode="flat"
                    selectedColor={isPaid ? theme.colors.primary : theme.colors.error}
                    style={{
                      backgroundColor: isPaid
                        ? theme.colors.primaryContainer
                        : theme.colors.errorContainer,
                    }}
                  >
                    {isPaid ? 'Pagado' : 'No pagado'}
                  </Chip>
                </View>

                {!isPaid && (
                  <View style={{ marginTop: 8, padding: 8, backgroundColor: theme.colors.elevation.level1, borderRadius: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text variant="bodyMedium" style={{ fontWeight: '600', color: theme.colors.onSurface }}>
                        ¿Registrar como Crédito (Fiado)?
                      </Text>
                      <Chip
                        selected={isCredit}
                        onPress={() => {
                          const next = !isCredit;
                          setIsCredit(next);
                          if (!next) {
                            setDebtorType('TRABAJADOR');
                            setDebtorWorkerId('');
                            setDebtorName('');
                          }
                        }}
                        mode="flat"
                        selectedColor={isCredit ? theme.colors.primary : theme.colors.onSurfaceVariant}
                        style={{
                          backgroundColor: isCredit
                            ? theme.colors.primaryContainer
                            : theme.colors.surfaceVariant,
                        }}
                      >
                        {isCredit ? 'Fiar' : 'No fiar'}
                      </Chip>
                    </View>

                    {isCredit && (
                      <>
                        <SegmentedButtons
                          value={debtorType}
                          onValueChange={(val) => {
                            setDebtorType(val);
                            setDebtorWorkerId('');
                            setDebtorCustomerId('');
                            setDebtorName('');
                          }}
                          buttons={[
                            { value: 'TRABAJADOR', label: 'Trabajador' },
                            { value: 'CLIENTE', label: 'Cliente Especial' },
                          ]}
                          style={{ marginBottom: 12 }}
                          density="small"
                        />

                        {debtorType === 'TRABAJADOR' ? (
                          <SearchableSelect
                            options={workers
                              .filter((w) => w.isActive)
                              .map((w) => ({ value: w.id, label: w.name, subtitle: w.role }))}
                            selectedValue={debtorWorkerId}
                            placeholder="Seleccionar Trabajador"
                            icon="account"
                            onSelect={(id) => {
                              setDebtorWorkerId(id);
                              const w = workers.find((x) => x.id === id);
                              setDebtorName(w ? w.name : '');
                            }}
                          />
                        ) : (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={{ flex: 1 }}>
                              <SearchableSelect
                                options={customers.map((c) => ({ value: c.id, label: c.name, subtitle: c.phone || 'Sin teléfono' }))}
                                selectedValue={debtorCustomerId}
                                placeholder="Seleccionar Cliente"
                                icon="account-tie"
                                onSelect={(id) => {
                                  setDebtorCustomerId(id);
                                  const c = customers.find((x) => x.id === id);
                                  setDebtorName(c ? c.name : '');
                                }}
                              />
                            </View>
                            <IconButton
                              icon="plus"
                              mode="contained"
                              containerColor={theme.colors.primaryContainer}
                              iconColor={theme.colors.onPrimaryContainer}
                              onPress={() => setNewCustomerModalVisible(true)}
                              style={{ margin: 0 }}
                            />
                          </View>
                        )}
                      </>
                    )}
                  </View>
                )}

                <Divider style={styles.divider} />

                <TextInput
                  label="Observaciones (opcional)"
                  value={observations}
                  onChangeText={setObservations}
                  mode="outlined"
                  multiline
                  numberOfLines={2}
                  dense
                  style={styles.observationsInput}
                />
              </>
            )}
          </Card.Content>
        </Card>

        {/* Product Grid */}
        <View style={styles.productGridSection}>
          <ProductGrid
            products={products}
            onSelect={handleProductSelect}
            selectedId={selectedProductId ?? undefined}
            availablePortions={portionsSet ? availablePortions : undefined}
            soldPortions={Object.keys(soldPortions).length > 0 ? soldPortions : undefined}
            soldPackaging={Object.keys(soldPackaging).length > 0 ? soldPackaging : undefined}
            soldAdditionsCount={soldAdditionsCount}
            soldDiamondAdditionsCount={soldDiamondAdditionsCount}
            totalSalesToday={totalSalesToday}
          />
        </View>

        {/* V2: Porciones and Quick nav moved to bottom */}
        <Button
          mode={portionsSet ? 'contained' : 'outlined'}
          icon="pizza"
          onPress={() => {
            const input: Record<string, string> = {};
            for (const p of products.filter((pr) => pr.hasRecipe)) {
              input[p.id] = '0';
            }
            setPortionsInput(input);
            setPortionsModalVisible(true);
          }}
          style={{ marginTop: 12, marginBottom: 12, borderRadius: 8 }}
          compact
        >
          {portionsSet
            ? `Porciones: ${Object.values(availablePortions).reduce((s, v) => s + v, 0)} disponibles`
            : 'Cargar porciones disponibles'}
        </Button>

        {/* Nav row removed from bottom */}

      </ScrollView>

      {/* Submit FAB */}
      <Portal>
        {cart.length > 0 && (
          <FAB
            icon={readyToConfirm ? 'check-bold' : 'eye'}
            label={
              readyToConfirm
                ? `${editingSale ? 'Actualizar' : 'Confirmar'} ${formatCOP(totalAmount)}`
                : `${editingSale ? 'Revisar edicion' : 'Revisar'} ${formatCOP(totalAmount)}`
            }
            onPress={handleFabPress}
            loading={submitting}
            style={[styles.fab, { backgroundColor: readyToConfirm ? '#388E3C' : theme.colors.primary }]}
            color="#FFFFFF"
          />
        )}
      </Portal>

      {/* Size Selector Modal */}
      <Portal>
        <Modal
          visible={sizeModalVisible}
          onDismiss={() => setSizeModalVisible(false)}
          contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}
        >
          <Text variant="titleLarge" style={{ fontWeight: 'bold', marginBottom: 8 }}>
            {selectedProduct?.name}
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>
            Selecciona el tamano
          </Text>
          <SizeSelector
            formats={formatsByProductId[selectedProduct?.id ?? '']?.filter((f) => f.isActive) ?? []}
            selected={selectedFormatId}
            onSelect={handleFormatSelect}
          />
          {selectedFormatId && renderPackagingSelector(modalQuantity)}
          {selectedFormatId && availableAdditions.length > 0 && (
            <AdditionSelector
              additions={availableAdditions}
              selected={selectedAdditions}
              onToggle={handleToggleAddition}
              onUpdateQuantity={handleUpdateAdditionQuantity}
            />
          )}
          {selectedFormatId && (() => {
            const fmt = formatsByProductId[selectedProduct?.id ?? '']?.find((f) => f.id === selectedFormatId);
            if (!fmt) return null;
            const additionsTotal = selectedAdditions.reduce((s, a) => s + a.price * a.quantity, 0);
            const isBox = selectedPackagingSupplyId === PACKAGING_SUPPLY_IDS.CAJA_FAMILIAR
              || selectedPackagingSupplyId === PACKAGING_SUPPLY_IDS.CAJA_MEDIANA;
            const modalPkgQty = (fmt.portions === 1 && isBox) ? 1 : modalQuantity;
            const packagingTotal = getPackagingSalePrice(selectedPackagingSupplyId) * (selectedPackagingSupplyId ? modalPkgQty : 0);
            return (
            <View style={styles.sizeInfo}>
              <Text variant="bodyLarge" style={{ fontWeight: '600' }}>
                {formatCOP(fmt.price * modalQuantity + additionsTotal + packagingTotal)} - {fmt.portions * modalQuantity} porciones
              </Text>
              <View style={styles.modalQuantityRow}>
                <IconButton
                  icon="minus-circle"
                  size={28}
                  onPress={() => setModalQuantity((q) => Math.max(1, q - 1))}
                  disabled={modalQuantity <= 1}
                />
                <Text variant="titleLarge" style={{ fontWeight: 'bold', minWidth: 40, textAlign: 'center' }}>
                  {modalQuantity}
                </Text>
                <IconButton
                  icon="plus-circle"
                  size={28}
                  onPress={() => setModalQuantity((q) => q + 1)}
                />
              </View>
            </View>
            );
          })()}
          <Divider style={{ marginVertical: 16 }} />
          <View style={styles.modalActions}>
            <Button onPress={() => setSizeModalVisible(false)}>Cancelar</Button>
            <Button
              mode="contained"
              onPress={handleSizeConfirm}
              disabled={!selectedFormatId}
            >
              Agregar al carrito
            </Button>
          </View>
        </Modal>

        {/* Single-format / Beverage Quantity Modal */}
        <Modal
          visible={beverageModalVisible}
          onDismiss={() => setBeverageModalVisible(false)}
          contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}
        >
          <Text variant="titleLarge" style={{ fontWeight: 'bold', marginBottom: 16 }}>
            {selectedProduct?.name}
          </Text>
          {selectedProduct?.category === 'PIZZA' && availableAdditions.length > 0 && (
            <AdditionSelector
              additions={availableAdditions}
              selected={selectedAdditions}
              onToggle={handleToggleAddition}
              onUpdateQuantity={handleUpdateAdditionQuantity}
            />
          )}
          {renderPackagingSelector(beverageQuantity)}
          <Text variant="bodyLarge" style={{ fontWeight: '600', textAlign: 'center', marginTop: 12 }}>
            {formatCOP(
              (formatsByProductId[selectedProduct?.id ?? '']?.filter((f) => f.isActive)?.[0]?.price ?? 0) * beverageQuantity
              + selectedAdditions.reduce((s, a) => s + a.price * a.quantity, 0)
              + getPackagingSalePrice(selectedPackagingSupplyId) * (selectedProduct?.category === 'PIZZA' && selectedPackagingSupplyId ? beverageQuantity : 0)
            )}
          </Text>
          <View style={styles.modalQuantityRow}>
            <IconButton
              icon="minus-circle"
              size={28}
              onPress={() => setBeverageQuantity((q) => Math.max(1, q - 1))}
              disabled={beverageQuantity <= 1}
            />
            <Text variant="titleLarge" style={{ fontWeight: 'bold', minWidth: 40, textAlign: 'center' }}>
              {beverageQuantity}
            </Text>
            <IconButton
              icon="plus-circle"
              size={28}
              onPress={() => setBeverageQuantity((q) => q + 1)}
            />
          </View>
          <Divider style={{ marginVertical: 16 }} />
          <View style={styles.modalActions}>
            <Button onPress={() => setBeverageModalVisible(false)}>Cancelar</Button>
            <Button mode="contained" onPress={handleBeverageConfirm}>
              Agregar al carrito
            </Button>
          </View>
        </Modal>
      </Portal>

      {/* Portions Modal */}
      <Portal>
        <Modal
          visible={portionsModalVisible}
          onDismiss={() => setPortionsModalVisible(false)}
          contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface, maxHeight: '80%' }]}
        >
          <Text variant="titleLarge" style={{ fontWeight: 'bold', marginBottom: 4 }}>
            Porciones Disponibles
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>
            Ingresa las porciones que llegan. Se suman al disponible actual.
          </Text>
          <ScrollView>
            {products.filter((p) => p.hasRecipe).map((pizza) => {
              const current = availablePortions[pizza.id] ?? 0;
              return (
                <View key={pizza.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium" style={{ color: '#F5F0EB' }} numberOfLines={1}>
                      {pizza.name}
                    </Text>
                    {current > 0 && (
                      <Text variant="bodySmall" style={{ color: '#888', fontSize: 11 }}>
                        Disponible: {current}
                      </Text>
                    )}
                  </View>
                  <TextInput
                    value={portionsInput[pizza.id] ?? '0'}
                    onChangeText={(v) => setPortionsInput((prev) => ({ ...prev, [pizza.id]: v.replace(/[^0-9]/g, '') }))}
                    keyboardType="numeric"
                    mode="outlined"
                    dense
                    style={{ width: 80, backgroundColor: '#111111' }}
                    outlineColor="#333"
                    activeOutlineColor="#E63946"
                    textColor="#F5F0EB"
                  />
                </View>
              );
            })}
          </ScrollView>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
            <Button mode="text" onPress={() => setPortionsModalVisible(false)}>
              Cancelar
            </Button>
            <Button
              mode="contained"
              buttonColor="#E63946"
              textColor="#FFFFFF"
              onPress={() => {
                // Sumar lo ingresado al disponible actual, restando lo ya vendido si es primera carga
                const updated = { ...availablePortions };
                for (const [id, val] of Object.entries(portionsInput)) {
                  const n = parseInt(val, 10);
                  if (n > 0) {
                    const isAlreadyLoaded = availablePortions[id] !== undefined;
                    if (isAlreadyLoaded) {
                      updated[id] = (updated[id] ?? 0) + n;
                    } else {
                      const sold = soldPortions[id] ?? 0;
                      updated[id] = Math.max(0, n - sold);
                    }
                  }
                }
                setAvailablePortions(updated);
                savePortionsToDB(updated);
                setPortionsModalVisible(false);
              }}
            >
              Guardar
            </Button>
          </View>
        </Modal>
      </Portal>

      {/* Baja Modal — V8: supports both supply and product writeoffs */}
      <Portal>
        <Modal
          visible={bajaModalVisible}
          onDismiss={() => setBajaModalVisible(false)}
          contentContainerStyle={[styles.bajaModal, { backgroundColor: theme.colors.surface }]}
        >
          <Text variant="titleLarge" style={{ fontWeight: 'bold', marginBottom: 4 }}>
            Registrar Baja
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
            Requiere aprobacion de un administrador
          </Text>

          <Divider style={{ marginBottom: 12 }} />

          <ScrollView showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }}>
            {/* V8: Toggle Insumo / Producto */}
            <SegmentedButtons
              value={bajaMode}
              onValueChange={(v) => { setBajaMode(v as 'supply' | 'product'); setBajaSupplyId(''); setBajaProductId(''); }}
              buttons={[
                { value: 'supply', label: 'Insumo' },
                { value: 'product', label: 'Producto' },
              ]}
              density="medium"
              style={{ marginBottom: 12 }}
            />

            {bajaMode === 'supply' ? (
              <>
                <Text variant="labelLarge" style={{ marginBottom: 6 }}>Insumo</Text>
                <SearchableSelect
                  options={supplies.map((s) => ({ value: s.id, label: s.name }))}
                  selectedValue={bajaSupplyId}
                  placeholder="Seleccionar insumo"
                  icon="package-variant"
                  onSelect={setBajaSupplyId}
                />

                {userRole === UserRole.GERENTE || userRole === UserRole.ADMIN_LOCAL ? (
                  <>
                    <Text variant="labelLarge" style={{ marginBottom: 6 }}>Nivel de inventario</Text>
                    <SegmentedButtons
                      value={bajaLevel}
                      onValueChange={setBajaLevel}
                      buttons={[
                        { value: String(InventoryLevel.RAW), label: 'Mat. Prima' },
                        { value: String(InventoryLevel.PROCESSED), label: 'Procesado' },
                        { value: String(InventoryLevel.STORE), label: 'Local' },
                      ]}
                      density="medium"
                      style={{ marginBottom: 12 }}
                    />
                  </>
                ) : (
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
                    Nivel: Local (tienda)
                  </Text>
                )}

                <Text variant="labelLarge" style={{ marginBottom: 6 }}>Cantidad (gramos)</Text>
                <TextInput
                  value={bajaGrams}
                  onChangeText={(v) => setBajaGrams(v.replace(/[^0-9.]/g, ''))}
                  keyboardType="numeric"
                  mode="outlined"
                  dense
                  placeholder="Ej: 500"
                  style={{ marginBottom: 12 }}
                />
              </>
            ) : (
              <>
                <Text variant="labelLarge" style={{ marginBottom: 6 }}>Producto</Text>
                <SearchableSelect
                  options={products.filter((p) => p.hasRecipe).map((p) => ({ value: p.id, label: p.name }))}
                  selectedValue={bajaProductId}
                  placeholder="Seleccionar producto"
                  icon="pizza"
                  onSelect={setBajaProductId}
                />

                <Text variant="labelLarge" style={{ marginBottom: 6 }}>Cantidad (porciones)</Text>
                <TextInput
                  value={bajaPortions}
                  onChangeText={(v) => setBajaPortions(v.replace(/[^0-9]/g, ''))}
                  keyboardType="numeric"
                  mode="outlined"
                  dense
                  placeholder="Ej: 8"
                  style={{ marginBottom: 12 }}
                />
              </>
            )}

            <Text variant="labelLarge" style={{ marginBottom: 6 }}>Razon</Text>
            <View style={styles.reasonChips}>
              {([
                { value: WriteoffReason.DAMAGED, label: 'Danado' },
                { value: WriteoffReason.EXPIRED, label: 'Vencido' },
                { value: WriteoffReason.SPILLED, label: 'Derrame' },
                { value: WriteoffReason.CONTAMINATED, label: 'Contaminado' },
                { value: WriteoffReason.OTHER, label: 'Otro' },
              ] as const).map((opt) => (
                <Chip
                  key={opt.value}
                  selected={bajaReason === opt.value}
                  onPress={() => setBajaReason(opt.value)}
                  mode="outlined"
                  compact
                  style={{
                    backgroundColor: bajaReason === opt.value ? theme.colors.primaryContainer : 'transparent',
                  }}
                  selectedColor={bajaReason === opt.value ? theme.colors.primary : theme.colors.onSurface}
                >
                  {opt.label}
                </Chip>
              ))}
            </View>

            <TextInput
              label="Notas (opcional)"
              value={bajaNotes}
              onChangeText={setBajaNotes}
              mode="outlined"
              dense
              multiline
              numberOfLines={2}
              style={{ marginBottom: 8 }}
            />
          </ScrollView>

          <Divider style={{ marginVertical: 8 }} />
          <View style={styles.modalActions}>
            <Button onPress={() => setBajaModalVisible(false)}>Cancelar</Button>
            <Button
              mode="contained"
              onPress={handleBajaSubmit}
              loading={bajaSubmitting}
              disabled={bajaMode === 'supply' ? (!bajaSupplyId || !bajaGrams || bajaSubmitting) : (!bajaProductId || !bajaPortions || bajaSubmitting)}
              buttonColor="#E63946"
            >
              Registrar Baja
            </Button>
          </View>
        </Modal>
      </Portal>

      {/* V7: Salida de Caja Modal */}
      <Portal>
        <Modal
          visible={compraTurnoVisible}
          onDismiss={() => setCompraTurnoVisible(false)}
          contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}
        >
          <Text variant="titleLarge" style={{ fontWeight: 'bold', marginBottom: 4 }}>
            Salida de Caja
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>
            Registra egresos o adelantos con dinero en efectivo de la caja
          </Text>

          <SegmentedButtons
            value={salidaType}
            onValueChange={(val) => {
              setSalidaType(val);
              setSalidaWorkerId('');
            }}
            buttons={[
              { value: 'COMPRA', label: 'Compra Insumos' },
              { value: 'ADELANTO', label: 'Adelanto Nómina' },
            ]}
            style={{ marginBottom: 16 }}
            density="small"
          />

          {salidaType === 'COMPRA' && (
            <View style={{ marginBottom: 12 }}>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
                Insumo Autorizado (Cargue directo a inventario):
              </Text>
              <SearchableSelect
                options={[
                  { value: '', label: 'Ninguno (Gasto general sin inventario)' },
                  ...authorizedSupplies.map((s: Supply) => ({
                    value: s.id,
                    label: s.name,
                    subtitle: `${s.gramsPerBag}g/bolsa • Autorizado`,
                  })),
                ]}
                selectedValue={salidaSupplyId}
                placeholder="Seleccionar Insumo Autorizado (Opcional)"
                icon="cube-outline"
                onSelect={(val) => {
                  setSalidaSupplyId(val);
                  setSalidaBags('1');
                }}
              />

              {selectedAuthorizedSupply && (
                <View style={{ marginTop: 10, padding: 10, backgroundColor: theme.colors.surfaceVariant, borderRadius: 8 }}>
                  <Text variant="bodyMedium" style={{ fontWeight: '600', color: theme.colors.primary, marginBottom: 6 }}>
                    📦 Cargue Directo: {selectedAuthorizedSupply.name}
                  </Text>
                  <TextInput
                    label="Cantidad de Bolsas / Unidades"
                    value={salidaBags}
                    onChangeText={setSalidaBags}
                    keyboardType="decimal-pad"
                    mode="outlined"
                    dense
                    style={{ marginBottom: 4 }}
                  />
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    Se cargarán {((parseFloat(salidaBags) || 0) * selectedAuthorizedSupply.gramsPerBag).toLocaleString()}g al inventario del local.
                  </Text>
                </View>
              )}
            </View>
          )}

          {salidaType === 'ADELANTO' && (
            <>
              <View style={{ marginBottom: 12 }}>
                <SearchableSelect
                  options={workers
                    .filter((w) => {
                      if (!w.isActive) return false;
                      if ([UserRole.GERENTE, UserRole.RODY].includes(userRole)) return true;
                      if (!w.storeIds || w.storeIds.length === 0) return true;
                      const userStoreIds = useAppStore.getState().storeIds;
                      return w.storeIds.some((id) => id === selectedStoreId || userStoreIds.includes(id));
                    })
                    .map((w) => ({ value: w.id, label: w.name, subtitle: w.role }))}
                  selectedValue={salidaWorkerId}
                  placeholder="Seleccionar Trabajador"
                  icon="account"
                  onSelect={setSalidaWorkerId}
                />
              </View>
              <Text variant="bodyMedium" style={{ fontWeight: '600', marginBottom: 8, marginTop: 4 }}>
                Medio de Pago
              </Text>
              <SegmentedButtons
                value={salidaPaymentMethod}
                onValueChange={(val) => setSalidaPaymentMethod(val as PaymentMethod)}
                buttons={[
                  { value: PaymentMethod.EFECTIVO, label: 'Efectivo' },
                  { value: PaymentMethod.TRANSFERENCIA, label: 'Banco' },
                ]}
                style={{ marginBottom: 12 }}
                density="small"
              />
            </>
          )}

          <TextInput
            label="Descripcion"
            value={compraTurnoDesc}
            onChangeText={setCompraTurnoDesc}
            mode="outlined"
            dense
            style={{ marginBottom: 12 }}
            placeholder={salidaType === 'ADELANTO' ? 'Opcional (Ej. Primera quincena)' : 'Opcional si elegiste insumo, u obligatorio si es gasto general'}
          />
          <CurrencyInput
            value={compraTurnoAmount}
            onChangeValue={setCompraTurnoAmount}
            label="Monto"
          />
          <View style={[styles.modalActions, { marginTop: 16 }]}>
            <Button onPress={() => setCompraTurnoVisible(false)}>Cancelar</Button>
            <Button
              mode="contained"
              onPress={handleCompraTurnoSubmit}
              loading={compraTurnoSubmitting}
              disabled={
                compraTurnoAmount <= 0 ||
                compraTurnoSubmitting ||
                (salidaType === 'COMPRA' && !salidaSupplyId && !compraTurnoDesc.trim()) ||
                (salidaType === 'ADELANTO' && !salidaWorkerId)
              }
              buttonColor="#E63946"
            >
              Registrar Salida
            </Button>
          </View>
        </Modal>
      </Portal>

      {/* V7: Registrar Cliente Modal */}
      <Portal>
        <Modal
          visible={newCustomerModalVisible}
          onDismiss={() => {
            if (!newCustSubmitting) {
              setNewCustomerModalVisible(false);
              setNewCustName('');
              setNewCustPhone('');
              setNewCustEmail('');
            }
          }}
          contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}
        >
          <Text variant="titleLarge" style={{ fontWeight: 'bold', marginBottom: 4 }}>
            Registrar Nuevo Cliente
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>
            Crea un cliente nuevo para habilitarle ventas a crédito
          </Text>
          <TextInput
            label="Nombre Completo"
            value={newCustName}
            onChangeText={setNewCustName}
            mode="outlined"
            dense
            style={{ marginBottom: 12 }}
          />
          <TextInput
            label="Teléfono (Opcional)"
            value={newCustPhone}
            onChangeText={setNewCustPhone}
            mode="outlined"
            dense
            keyboardType="phone-pad"
            style={{ marginBottom: 12 }}
          />
          <TextInput
            label="Correo Electrónico (Opcional)"
            value={newCustEmail}
            onChangeText={setNewCustEmail}
            mode="outlined"
            dense
            keyboardType="email-address"
            style={{ marginBottom: 16 }}
          />
          <View style={styles.modalActions}>
            <Button onPress={() => setNewCustomerModalVisible(false)} disabled={newCustSubmitting}>
              Cancelar
            </Button>
            <Button
              mode="contained"
              onPress={handleCreateCustomer}
              loading={newCustSubmitting}
              disabled={!newCustName.trim() || newCustSubmitting}
              buttonColor="#E63946"
            >
              Registrar Cliente
            </Button>
          </View>
        </Modal>
      </Portal>

      <CalendarPickerModal
        visible={calendarVisible}
        onDismiss={() => setCalendarVisible(false)}
        onSelect={(date: string) => {
          setSalesDate(date);
          setCalendarVisible(false);
        }}
        selectedDate={salesDate}
      />

      {/* Feedback toast — top of screen */}
      {snackbar.visible && (
        <View
          style={{
            position: 'absolute',
            top: 8,
            left: 12,
            right: 12,
            zIndex: 999,
            backgroundColor: snackbar.success ? '#4CAF50' : '#B71C1C',
            borderRadius: 8,
            padding: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            elevation: 10,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.3,
            shadowRadius: 4,
          }}
        >
          <Text style={{ color: '#FFFFFF', flex: 1, fontWeight: '600' }}>
            {snackbar.message}
          </Text>
          <IconButton
            icon="close"
            size={16}
            iconColor="#FFFFFF"
            onPress={() => setSnackbar((s) => ({ ...s, visible: false }))}
            style={{ margin: 0 }}
          />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 12,
    paddingBottom: 180,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  navRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sectionTitle: {
    marginBottom: 8,
  },
  pendingSection: {
    marginBottom: 12,
  },
  pendingItem: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  pendingTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pendingActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 6,
  },
  pendingBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  topConfirmButton: {
    marginBottom: 12,
    borderRadius: 8,
  },
  cartCard: {
    borderRadius: 12,
    marginTop: 4,
    marginBottom: 4,
  },
  cartCardReady: {
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  cartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  editingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    backgroundColor: '#26315F',
    borderWidth: 1,
    borderColor: '#5E6AD2',
  },
  editingBannerTitle: {
    color: '#F5F0EB',
    fontWeight: '700',
  },
  editingBannerMeta: {
    color: '#C7CBE8',
    marginTop: 2,
  },
  mixtoInputs: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  halfInput: {
    flex: 1,
  },
  divider: {
    marginVertical: 10,
  },
  paidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  observationsInput: {
    marginTop: 6,
  },
  productGridSection: {
    width: '100%',
    alignSelf: 'stretch',
  },
  fab: {
    position: 'absolute',
    bottom: 80,
    left: 12,
    right: 12,
    borderRadius: 28,
    elevation: 8,
    zIndex: 10,
  },
  modal: {
    margin: 16,
    padding: 20,
    borderRadius: 16,
  },
  sizeInfo: {
    alignItems: 'center',
    marginTop: 16,
  },
  modalQuantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  modalPackagingSection: {
    marginTop: 12,
  },
  modalPackagingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  bajaModal: {
    margin: 16,
    padding: 20,
    borderRadius: 16,
    maxHeight: '80%',
  },
  reasonChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
});
