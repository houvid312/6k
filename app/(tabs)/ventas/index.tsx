import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { Product, Sale, ProductFormat, AdditionCatalogItem } from '../../../src/domain/entities';
import { PaymentMethod, InventoryLevel, WriteoffReason, UserRole } from '../../../src/domain/enums';
import { supabase } from '../../../src/lib/supabase';
import { SearchableSelect } from '../../../src/components/common/SearchableSelect';
import { useMasterDataStore } from '../../../src/stores/useMasterDataStore';
import { formatCOP } from '../../../src/utils/currency';
import { formatDate, todayColombia } from '../../../src/utils/dates';

export default function VentasScreen() {
  const theme = useTheme();
  const { saleService, writeoffService, cashClosingService, expenseRepo, productFormatRepo, productStoreAssignmentRepo, additionCatalogRepo } = useDI();
  const { selectedStoreId, userId, userRole } = useAppStore();
  const { products: cachedProducts, supplies } = useMasterDataStore();
  const {
    cart,
    cartPackagingSupplyId,
    pendingSales,
    addToCart,
    removeFromCart,
    updateQuantity,
    updateCustomerNote,
    setCartPackaging,
    clearCart,
    setPendingSales,
  } = useSaleStore();
  const scrollRef = useRef<ScrollView>(null);
  const pathname = usePathname();

  // V5: Calculadora de cambio
  const [amountReceived, setAmountReceived] = useState(0);

  // V1: Check if cash opening exists for today (re-check on focus return)
  const [needsOpening, setNeedsOpening] = useState(false);
  useEffect(() => {
    if (!selectedStoreId) return;
    (async () => {
      try {
        const today = todayColombia();
        const hasOpening = await cashClosingService.hasOpeningForToday(selectedStoreId, today);
        setNeedsOpening(!hasOpening);
      } catch {
        setNeedsOpening(false);
      }
    })();
  }, [selectedStoreId, cashClosingService, pathname]);

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
  const [isPaid, setIsPaid] = useState(true);
  const [observations, setObservations] = useState('');
  const [modalQuantity, setModalQuantity] = useState(1);
  const [formatsByProductId, setFormatsByProductId] = useState<Record<string, ProductFormat[]>>({});
  const [availableAdditions, setAvailableAdditions] = useState<AdditionCatalogItem[]>([]);
  const [selectedAdditions, setSelectedAdditions] = useState<CartItemAddition[]>([]);
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

  // Porciones disponibles por tipo de pizza
  const [portionsModalVisible, setPortionsModalVisible] = useState(false);
  const [availablePortions, setAvailablePortions] = useState<Record<string, number>>({});
  const [portionsInput, setPortionsInput] = useState<Record<string, string>>({});
  const portionsSet = Object.keys(availablePortions).length > 0;

  // Porciones vendidas hoy por producto
  const [soldPortions, setSoldPortions] = useState<Record<string, number>>({});

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
      if (data && data.length > 0) {
        const map: Record<string, number> = {};
        for (const row of data) map[row.product_id] = row.portions;
        setAvailablePortions(map);
      }
    })();
  }, [selectedStoreId]);

  // Cargar porciones vendidas hoy
  const loadSoldPortions = useCallback(async () => {
    if (!selectedStoreId) return;
    const today = todayColombia();
    const startOfDay = `${today}T00:00:00`;
    const endOfDay = `${today}T23:59:59`;
    const { data } = await supabase
      .from('sale_items')
      .select('product_id, portions, sales!inner(store_id, created_at)')
      .eq('sales.store_id', selectedStoreId)
      .gte('sales.created_at', startOfDay)
      .lte('sales.created_at', endOfDay);

    if (data) {
      const map: Record<string, number> = {};
      for (const row of data) {
        map[row.product_id] = (map[row.product_id] ?? 0) + row.portions;
      }
      setSoldPortions(map);
    }
  }, [selectedStoreId]);

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
  }, [bajaSupplyId, bajaGrams, bajaLevel, bajaReason, bajaNotes, selectedStoreId, userId, writeoffService]);

  // V7: Compra en turno handler
  const handleCompraTurnoSubmit = useCallback(async () => {
    if (!compraTurnoDesc.trim() || compraTurnoAmount <= 0) {
      Alert.alert('Error', 'Ingresa una descripcion y un monto valido');
      return;
    }
    setCompraTurnoSubmitting(true);
    try {
      await expenseRepo.create({
        date: todayColombia(),
        storeId: selectedStoreId,
        category: 'Compra Turno',
        description: compraTurnoDesc.trim(),
        amount: compraTurnoAmount,
        paymentMethod: PaymentMethod.EFECTIVO,
      });
      setCompraTurnoVisible(false);
      setCompraTurnoDesc('');
      setCompraTurnoAmount(0);
      setSnackbar({ visible: true, success: true, message: `Compra registrada: ${formatCOP(compraTurnoAmount)}` });
    } catch {
      setSnackbar({ visible: true, success: false, message: 'Error al registrar la compra' });
    } finally {
      setCompraTurnoSubmitting(false);
    }
  }, [compraTurnoDesc, compraTurnoAmount, selectedStoreId, expenseRepo]);

  const selectedProduct = products.find((p) => p.id === selectedProductId);

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
      setBeverageQuantity(1);
      setBeverageModalVisible(true);
    } else {
      // Multiple formats: show format selector
      setSelectedProductId(productId);
      setSelectedFormatId(activeFormats[0]?.id ?? null);
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

    addToCart({
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      formatId: format.id,
      formatName: format.name,
      portionsPerUnit: format.portions,
      quantity: modalQuantity,
      unitPrice: format.price,
      additions: selectedAdditions.length > 0 ? selectedAdditions : undefined,
    });
    setSizeModalVisible(false);
    setSelectedProductId(null);
    setSelectedFormatId(null);
    setModalQuantity(1);
    setSelectedAdditions([]);
  }, [selectedProduct, selectedFormatId, modalQuantity, addToCart, formatsByProductId, selectedAdditions]);

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
      portionsPerUnit: format.portions,
      quantity: beverageQuantity,
      unitPrice: format.price,
      additions: selectedAdditions.length > 0 ? selectedAdditions : undefined,
    });
    setBeverageModalVisible(false);
    setSelectedAdditions([]);
    setSelectedProductId(null);
    setBeverageQuantity(1);
  }, [selectedProduct, beverageQuantity, addToCart, formatsByProductId]);

  const totalAmount = cart.reduce((sum, i) => sum + i.subtotal, 0);

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

  const handleSubmitSale = useCallback(async () => {
    const effectiveCash = paymentMethod === PaymentMethod.TRANSFERENCIA ? 0
      : paymentMethod === PaymentMethod.EFECTIVO ? totalAmount
      : cashAmount;
    const effectiveBank = paymentMethod === PaymentMethod.EFECTIVO ? 0
      : paymentMethod === PaymentMethod.TRANSFERENCIA ? totalAmount
      : bankAmount;

    if (paymentMethod === PaymentMethod.MIXTO && effectiveCash + effectiveBank < totalAmount) {
      Alert.alert('Error', 'Los montos no cubren el total de la venta');
      return;
    }

    setSubmitting(true);
    try {
      const items = cart.map((c) => ({
        productId: c.productId,
        formatId: c.formatId,
        formatName: c.formatName,
        portionsPerUnit: c.portionsPerUnit,
        quantity: c.quantity,
        unitPrice: c.unitPrice,
        additions: c.additions.length > 0 ? c.additions : undefined,
      }));

      const customerNotes = cart
        .filter((c) => c.customerNote.trim())
        .map((c) => `${c.productName}: ${c.customerNote.trim()}`)
        .join(' | ');

      const sale = await saleService.createSale(
        selectedStoreId,
        items,
        paymentMethod,
        effectiveCash,
        effectiveBank,
        observations || undefined,
        isPaid,
        customerNotes || undefined,
        cartPackagingSupplyId,
      );

      const totalPortions = cart.reduce((sum, i) => sum + i.portions, 0);
      const paidLabel = isPaid ? '' : ' (PENDIENTE DE PAGO)';

      clearCart();
      setCashAmount(0);
      setBankAmount(0);
      setAmountReceived(0);
      setPaymentMethod(PaymentMethod.EFECTIVO);
      setObservations('');
      setIsPaid(true);
      setReadyToConfirm(false);

      setSnackbar({
        visible: true,
        success: true,
        message: `Venta registrada: ${totalPortions} porc. por ${formatCOP(sale.totalAmount)}${paidLabel}`,
      });

      // Actualizar porciones vendidas localmente
      const updatedSold = { ...soldPortions };
      for (const c of cart) {
        const prod = products.find((p) => p.id === c.productId);
        if (prod?.hasRecipe) {
          updatedSold[c.productId] = (updatedSold[c.productId] ?? 0) + c.portions;
        }
      }
      setSoldPortions(updatedSold);

      // Descontar porciones vendidas
      if (portionsSet) {
        const updated = { ...availablePortions };
        for (const c of cart) {
          if (updated[c.productId] !== undefined) {
            updated[c.productId] = Math.max(0, updated[c.productId] - c.portions);
          }
        }
        setAvailablePortions(updated);
        savePortionsToDB(updated);
      }

      loadPendingSales();
    } catch (error) {
      console.error('Error registrando venta:', error);
      setSnackbar({
        visible: true,
        success: false,
        message: `No se pudo registrar la venta: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setSubmitting(false);
    }
  }, [cart, paymentMethod, cashAmount, bankAmount, totalAmount, selectedStoreId, saleService, clearCart, isPaid, observations, loadPendingSales, portionsSet, availablePortions, savePortionsToDB, soldPortions, products]);

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
    const isFullyDone = !!(completed && completed.isPaid && completed.isDispatched);
    setPendingSales(merged.filter((s) => !(s.isPaid && s.isDispatched)));
    return isFullyDone;
  }, [pendingSales, setPendingSales]);

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
      setSnackbar({
        visible: true,
        success: true,
        message: done ? `${formatCOP(sale.totalAmount)} — Venta completada` : `${formatCOP(sale.totalAmount)} — Despachado`,
      });
    } catch {
      setSnackbar({ visible: true, success: false, message: 'Error al marcar como despachada' });
    }
  }, [saleService, updatePendingSale]);

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
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scrollContent, { minHeight: windowHeight }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <StoreSelector excludeProductionCenter />
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {formatDate(new Date())}
          </Text>
        </View>

        {/* V1: Cash opening banner */}
        {needsOpening && (
          <Card style={{ borderRadius: 12, marginBottom: 12, borderWidth: 2, borderColor: '#F57C00' }} mode="elevated">
            <Card.Content style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text variant="titleSmall" style={{ fontWeight: '700', color: '#F57C00' }}>
                  Caja sin abrir
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Registra la base de efectivo del turno
                </Text>
              </View>
              <Button
                mode="contained"
                compact
                buttonColor="#F57C00"
                textColor="#FFFFFF"
                icon="cash-register"
                onPress={() => router.push('/(tabs)/ventas/apertura-caja')}
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 }}>
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
                  {!sale.isPaid && (sale.paymentMethod === PaymentMethod.EFECTIVO || sale.paymentMethod === PaymentMethod.MIXTO) && (
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
                Carrito
              </Text>
              {cart.length > 0 && (
                <IconButton
                  icon="delete-sweep"
                  size={20}
                  onPress={clearCart}
                  iconColor={theme.colors.error}
                />
              )}
            </View>
            <CartSummary
              items={cart}
              onRemove={removeFromCart}
              onUpdateQuantity={updateQuantity}
              onUpdateNote={updateCustomerNote}
              packagingSupplyId={cartPackagingSupplyId}
              onPackagingChange={setCartPackaging}
            />

            {/* V4: Payment method, isPaid, and observations always visible */}
            <Divider style={styles.divider} />

            <Text variant="titleSmall" style={{ fontWeight: '600', marginBottom: 8 }}>
              Metodo de Pago
            </Text>
            <PaymentMethodPicker value={paymentMethod} onChange={setPaymentMethod} />

            {cart.length > 0 && paymentMethod === PaymentMethod.MIXTO && (
              <View style={styles.mixtoInputs}>
                <CurrencyInput
                  value={cashAmount}
                  onChangeValue={setCashAmount}
                  label="Efectivo"
                  style={styles.halfInput}
                />
                <CurrencyInput
                  value={bankAmount}
                  onChangeValue={setBankAmount}
                  label="Transferencia"
                  style={styles.halfInput}
                />
              </View>
            )}

            {/* V5: Calculadora de cambio */}
            {cart.length > 0 && (paymentMethod === PaymentMethod.EFECTIVO || paymentMethod === PaymentMethod.MIXTO) && (
              <View style={{ marginTop: 10 }}>
                <CurrencyInput
                  value={amountReceived}
                  onChangeValue={setAmountReceived}
                  label="Monto Recibido"
                />
                {amountReceived > 0 && (() => {
                  const cashPortion = paymentMethod === PaymentMethod.MIXTO ? cashAmount : totalAmount;
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
                onPress={() => setIsPaid(!isPaid)}
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
          </Card.Content>
        </Card>

        {/* Product Grid */}
        <ProductGrid
          products={products}
          onSelect={handleProductSelect}
          selectedId={selectedProductId ?? undefined}
          availablePortions={portionsSet ? availablePortions : undefined}
          soldPortions={Object.keys(soldPortions).length > 0 ? soldPortions : undefined}
        />

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

        {/* Quick nav — moved to bottom (V2) */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12, flexGrow: 0 }}>
          <View style={styles.navRow}>
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
              icon="cash-lock"
              compact
              onPress={() => router.push('/(tabs)/ventas/cierre-caja')}
            >
              Cierre
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
              icon="package-variant-remove"
              compact
              onPress={() => {
              if (userRole !== UserRole.ADMIN) setBajaLevel(String(InventoryLevel.STORE));
              setBajaModalVisible(true);
            }}
            >
              Baja
            </Button>
            <Button
              mode="outlined"
              icon="food"
              compact
              onPress={() => router.push('/(tabs)/ventas/consumo-ventas')}
            >
              Consumo
            </Button>
            <Button
              mode="outlined"
              icon="cart-plus"
              compact
              onPress={() => setCompraTurnoVisible(true)}
            >
              Compra Turno
            </Button>
          </View>
        </ScrollView>

      </ScrollView>

      {/* Submit FAB */}
      <Portal>
        {cart.length > 0 && (
          <FAB
            icon={readyToConfirm ? 'check-bold' : 'eye'}
            label={readyToConfirm ? `Confirmar ${formatCOP(totalAmount)}` : `Revisar ${formatCOP(totalAmount)}`}
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
            onSelect={(formatId) => { setSelectedFormatId(formatId); setModalQuantity(1); }}
          />
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
            return (
            <View style={styles.sizeInfo}>
              <Text variant="bodyLarge" style={{ fontWeight: '600' }}>
                {formatCOP(fmt.price * modalQuantity + additionsTotal)} - {fmt.portions * modalQuantity} porciones
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
          <Text variant="bodyLarge" style={{ fontWeight: '600', textAlign: 'center', marginTop: 12 }}>
            {formatCOP(
              (formatsByProductId[selectedProduct?.id ?? '']?.filter((f) => f.isActive)?.[0]?.price ?? 0) * beverageQuantity
              + selectedAdditions.reduce((s, a) => s + a.price * a.quantity, 0)
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
                // Sumar lo ingresado al disponible actual
                const updated = { ...availablePortions };
                for (const [id, val] of Object.entries(portionsInput)) {
                  const n = parseInt(val, 10);
                  if (n > 0) {
                    updated[id] = (updated[id] ?? 0) + n;
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

                {userRole === UserRole.ADMIN ? (
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

      {/* V7: Compra en Turno Modal */}
      <Portal>
        <Modal
          visible={compraTurnoVisible}
          onDismiss={() => setCompraTurnoVisible(false)}
          contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}
        >
          <Text variant="titleLarge" style={{ fontWeight: 'bold', marginBottom: 4 }}>
            Compra en Turno
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>
            Registra compras de insumos con dinero de la caja
          </Text>
          <TextInput
            label="Descripcion"
            value={compraTurnoDesc}
            onChangeText={setCompraTurnoDesc}
            mode="outlined"
            dense
            style={{ marginBottom: 12 }}
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
              disabled={!compraTurnoDesc.trim() || compraTurnoAmount <= 0 || compraTurnoSubmitting}
              buttonColor="#E63946"
            >
              Registrar Compra
            </Button>
          </View>
        </Modal>
      </Portal>

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
    paddingBottom: 160,
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
