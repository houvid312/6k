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
import { router } from 'expo-router';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { CurrencyInput } from '../../../src/components/common/CurrencyInput';
import { ProductGrid } from '../../../src/components/ventas/ProductGrid';
import { SizeSelector } from '../../../src/components/ventas/SizeSelector';
import { CartSummary } from '../../../src/components/ventas/CartSummary';
import { PaymentMethodPicker } from '../../../src/components/ventas/PaymentMethodPicker';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useSaleStore, CartItem } from '../../../src/stores/useSaleStore';
import { Product, Sale } from '../../../src/domain/entities';
import { PizzaSize, PaymentMethod, PORTIONS_PER_SIZE, InventoryLevel, WriteoffReason, UserRole } from '../../../src/domain/enums';
import { supabase } from '../../../src/lib/supabase';
import { SearchableSelect } from '../../../src/components/common/SearchableSelect';
import { useMasterDataStore } from '../../../src/stores/useMasterDataStore';
import { formatCOP } from '../../../src/utils/currency';
import { formatDate, todayColombia } from '../../../src/utils/dates';

export default function VentasScreen() {
  const theme = useTheme();
  const { saleService, writeoffService } = useDI();
  const { selectedStoreId, userId, userRole } = useAppStore();
  const { products: cachedProducts, supplies } = useMasterDataStore();
  const {
    cart,
    pendingSales,
    addToCart,
    removeFromCart,
    updateQuantity,
    updateCustomerNote,
    clearCart,
    setPendingSales,
  } = useSaleStore();
  const scrollRef = useRef<ScrollView>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<PizzaSize | null>(null);
  const [sizeModalVisible, setSizeModalVisible] = useState(false);
  const [beverageModalVisible, setBeverageModalVisible] = useState(false);
  const [beverageQuantity, setBeverageQuantity] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.EFECTIVO);
  const [cashAmount, setCashAmount] = useState(0);
  const [bankAmount, setBankAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [readyToConfirm, setReadyToConfirm] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [observations, setObservations] = useState('');
  const [modalQuantity, setModalQuantity] = useState(1);
  const [pricesBySize, setPricesBySize] = useState<Record<string, number>>({});
  const [beveragePrices, setBeveragePrices] = useState<Record<string, number>>({});
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

  // Porciones disponibles por tipo de pizza
  const [portionsModalVisible, setPortionsModalVisible] = useState(false);
  const [availablePortions, setAvailablePortions] = useState<Record<string, number>>({});
  const [portionsInput, setPortionsInput] = useState<Record<string, string>>({});
  const portionsSet = Object.keys(availablePortions).length > 0;

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

  useEffect(() => {
    setProducts(cachedProducts.filter((p) => p.isActive));
  }, [cachedProducts]);

  useEffect(() => {
    (async () => {
      const { data: prices } = await supabase
        .from('product_prices')
        .select('product_id, size, price')
        .eq('is_active', true);

      if (prices) {
        const sizeMap: Record<string, number> = {};
        const bevMap: Record<string, number> = {};
        for (const p of prices) {
          const product = cachedProducts.find((pr) => pr.id === p.product_id);
          if (product?.category === 'BEBIDA') {
            bevMap[p.product_id] = p.price;
          } else if (p.size) {
            sizeMap[`${p.product_id}_${p.size}`] = p.price;
          }
        }
        setPricesBySize(sizeMap);
        setBeveragePrices(bevMap);
      }
    })();
  }, [cachedProducts]);

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

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  const handleProductSelect = useCallback((productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    if (product.category === 'BEBIDA') {
      setSelectedProductId(productId);
      setBeverageQuantity(1);
      setBeverageModalVisible(true);
    } else {
      setSelectedProductId(productId);
      setSelectedSize(PizzaSize.INDIVIDUAL);
      setModalQuantity(1);
      setSizeModalVisible(true);
    }
  }, [products]);

  const handleSizeConfirm = useCallback(() => {
    if (!selectedProduct || !selectedSize) return;

    const price = pricesBySize[`${selectedProduct.id}_${selectedSize}`] ?? 0;
    addToCart({
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      size: selectedSize,
      quantity: modalQuantity,
      unitPrice: price,
    });
    setSizeModalVisible(false);
    setSelectedProductId(null);
    setSelectedSize(null);
    setModalQuantity(1);
  }, [selectedProduct, selectedSize, modalQuantity, addToCart, pricesBySize]);

  const handleBeverageConfirm = useCallback(() => {
    if (!selectedProduct) return;

    const price = beveragePrices[selectedProduct.id] ?? 0;
    addToCart({
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      size: PizzaSize.INDIVIDUAL,
      quantity: beverageQuantity,
      unitPrice: price,
    });
    setBeverageModalVisible(false);
    setSelectedProductId(null);
    setBeverageQuantity(1);
  }, [selectedProduct, beverageQuantity, addToCart, beveragePrices]);

  const totalAmount = cart.reduce((sum, i) => sum + i.subtotal, 0);

  // Reset confirm state when cart changes
  useEffect(() => {
    setReadyToConfirm(false);
  }, [cart.length]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 300);
  }, []);

  const handleTopConfirmPress = useCallback(() => {
    if (cart.length === 0) {
      Alert.alert('Error', 'Agrega productos al carrito primero');
      return;
    }
    scrollToBottom();
  }, [cart, scrollToBottom]);

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
        size: c.size,
        quantity: c.quantity,
        unitPrice: c.unitPrice,
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
      );

      const totalPortions = cart.reduce((sum, i) => sum + i.portions, 0);
      const paidLabel = isPaid ? '' : ' (PENDIENTE DE PAGO)';

      clearCart();
      setCashAmount(0);
      setBankAmount(0);
      setPaymentMethod(PaymentMethod.EFECTIVO);
      setObservations('');
      setIsPaid(false);
      setReadyToConfirm(false);

      setSnackbar({
        visible: true,
        success: true,
        message: `Venta registrada: ${totalPortions} porc. por ${formatCOP(sale.totalAmount)}${paidLabel}`,
      });

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

      if (!isPaid) {
        loadPendingSales();
      }
    } catch (error) {
      setSnackbar({
        visible: true,
        success: false,
        message: 'No se pudo registrar la venta',
      });
    } finally {
      setSubmitting(false);
    }
  }, [cart, paymentMethod, cashAmount, bankAmount, totalAmount, selectedStoreId, saleService, clearCart, isPaid, observations, loadPendingSales, portionsSet, availablePortions, savePortionsToDB]);

  const handleFabPress = useCallback(() => {
    if (cart.length === 0) {
      Alert.alert('Error', 'Agrega productos al carrito primero');
      return;
    }

    if (!readyToConfirm) {
      setReadyToConfirm(true);
      scrollToBottom();
      return;
    }

    // Second press — actually submit
    handleSubmitSale();
  }, [cart, readyToConfirm, scrollToBottom, handleSubmitSale]);

  const handleMarkAsPaid = useCallback(async (sale: Sale) => {
    try {
      await saleService.markAsPaid(sale.id);
      // Update local state — keep in list until both paid & dispatched
      const updated = pendingSales.map((s) => s.id === sale.id ? { ...s, isPaid: true } : s);
      setPendingSales(updated.filter((s) => !(s.isPaid && s.isDispatched)));
      setSnackbar({
        visible: true,
        success: true,
        message: `Venta de ${formatCOP(sale.totalAmount)} marcada como pagada`,
      });
    } catch {
      setSnackbar({
        visible: true,
        success: false,
        message: 'Error al marcar como pagada',
      });
    }
  }, [saleService, pendingSales, setPendingSales]);

  const handleMarkAsDispatched = useCallback(async (sale: Sale) => {
    try {
      await saleService.markAsDispatched(sale.id);
      const updated = pendingSales.map((s) => s.id === sale.id ? { ...s, isDispatched: true } : s);
      setPendingSales(updated.filter((s) => !(s.isPaid && s.isDispatched)));
      setSnackbar({
        visible: true,
        success: true,
        message: `Venta de ${formatCOP(sale.totalAmount)} marcada como despachada`,
      });
    } catch {
      setSnackbar({
        visible: true,
        success: false,
        message: 'Error al marcar como despachada',
      });
    }
  }, [saleService, pendingSales, setPendingSales]);

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

        {/* Quick nav */}
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
          </View>
        </ScrollView>

        {/* Pending Sales Banner */}
        {pendingSales.length > 0 && (
          <View style={styles.pendingSection}>
            <Text
              variant="titleSmall"
              style={{ fontWeight: '600', color: theme.colors.error, marginBottom: 8 }}
            >
              Pendientes de pago ({pendingSales.length})
            </Text>
            {pendingSales.map((sale) => {
              const itemsSummary = sale.items
                .map((i) => `${i.portions} porc. ${products.find((p) => p.id === i.productId)?.name ?? ''}`)
                .join(', ');

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
                  <View style={styles.pendingBottomRow}>
                    <Text variant="labelSmall" style={{ color: theme.colors.onErrorContainer, opacity: 0.6, fontSize: 10 }} numberOfLines={1}>
                      {sale.workerName ?? ''}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {sale.isPaid ? (
                        <Chip compact icon="check-circle" textStyle={{ fontSize: 11, color: '#66BB6A' }} style={{ backgroundColor: '#1C3D2A' }}>
                          Pagado
                        </Chip>
                      ) : (
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
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Scroll to confirm shortcut */}
        {cart.length > 0 && (
          <Button
            mode="outlined"
            onPress={handleTopConfirmPress}
            style={styles.topConfirmButton}
            icon="arrow-down-bold"
            compact
          >
            Ir a confirmar - {formatCOP(totalAmount)}
          </Button>
        )}

        {/* Porciones disponibles */}
        <Button
          mode={portionsSet ? 'contained' : 'outlined'}
          icon="pizza"
          onPress={() => {
            // Siempre empieza en 0 — lo ingresado se SUMA al disponible actual
            const input: Record<string, string> = {};
            for (const p of products.filter((pr) => pr.category === 'PIZZA')) {
              input[p.id] = '0';
            }
            setPortionsInput(input);
            setPortionsModalVisible(true);
          }}
          style={{ marginBottom: 12, borderRadius: 8 }}
          compact
        >
          {portionsSet
            ? `Porciones: ${Object.values(availablePortions).reduce((s, v) => s + v, 0)} disponibles`
            : 'Cargar porciones disponibles'}
        </Button>

        {/* Product Grid */}
        <ProductGrid
          products={products}
          onSelect={handleProductSelect}
          selectedId={selectedProductId ?? undefined}
          availablePortions={portionsSet ? availablePortions : undefined}
        />

        {/* Cart + Payment */}
        <Card style={styles.cartCard} mode="elevated">
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
            />

            {cart.length > 0 && (
              <>
                <Divider style={styles.divider} />

                <Text variant="titleSmall" style={{ fontWeight: '600', marginBottom: 8 }}>
                  Metodo de Pago
                </Text>
                <PaymentMethodPicker value={paymentMethod} onChange={setPaymentMethod} />

                {paymentMethod === PaymentMethod.MIXTO && (
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

                <Divider style={styles.divider} />

                {/* Paid toggle */}
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
              </>
            )}
          </Card.Content>
        </Card>

      </ScrollView>

      {/* Submit FAB */}
      <Portal>
        {cart.length > 0 && (
          <FAB
            icon={readyToConfirm ? 'check-bold' : 'arrow-down-bold'}
            label={readyToConfirm ? `Confirmar ${formatCOP(totalAmount)}` : `Registrar ${formatCOP(totalAmount)}`}
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
          <SizeSelector selected={selectedSize} onSelect={(size) => { setSelectedSize(size); setModalQuantity(1); }} />
          {selectedSize && (
            <View style={styles.sizeInfo}>
              <Text variant="bodyLarge" style={{ fontWeight: '600' }}>
                {formatCOP((pricesBySize[`${selectedProduct?.id}_${selectedSize}`] ?? 0) * modalQuantity)} - {PORTIONS_PER_SIZE[selectedSize] * modalQuantity} porciones
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
          )}
          <Divider style={{ marginVertical: 16 }} />
          <View style={styles.modalActions}>
            <Button onPress={() => setSizeModalVisible(false)}>Cancelar</Button>
            <Button
              mode="contained"
              onPress={handleSizeConfirm}
              disabled={!selectedSize}
            >
              Agregar al carrito
            </Button>
          </View>
        </Modal>

        {/* Beverage Quantity Modal */}
        <Modal
          visible={beverageModalVisible}
          onDismiss={() => setBeverageModalVisible(false)}
          contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}
        >
          <Text variant="titleLarge" style={{ fontWeight: 'bold', marginBottom: 16 }}>
            {selectedProduct?.name}
          </Text>
          <Text variant="bodyLarge" style={{ fontWeight: '600', textAlign: 'center' }}>
            {formatCOP((beveragePrices[selectedProduct?.id ?? ''] ?? 0) * beverageQuantity)}
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
            {products.filter((p) => p.category === 'PIZZA').map((pizza) => {
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

      {/* Baja Modal */}
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
              disabled={!bajaSupplyId || !bajaGrams || bajaSubmitting}
              buttonColor="#E63946"
            >
              Registrar Baja
            </Button>
          </View>
        </Modal>
      </Portal>

      {/* Snackbar Feedback */}
      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar((s) => ({ ...s, visible: false }))}
        duration={4000}
        style={{
          backgroundColor: snackbar.success ? '#4CAF50' : '#B71C1C',
          marginBottom: cart.length > 0 ? 70 : 0,
        }}
        action={{
          label: 'OK',
          textColor: '#FFFFFF',
          onPress: () => setSnackbar((s) => ({ ...s, visible: false })),
        }}
      >
        <Text
          style={{
            color: '#FFFFFF',
          }}
        >
          {snackbar.message}
        </Text>
      </Snackbar>
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
    marginTop: 12,
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
