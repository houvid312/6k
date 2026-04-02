import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, Alert, ScrollView } from 'react-native';
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
import { PizzaSize, PaymentMethod, PORTIONS_PER_SIZE } from '../../../src/domain/enums';
import { supabase } from '../../../src/lib/supabase';
import { formatCOP } from '../../../src/utils/currency';
import { formatDate } from '../../../src/utils/dates';

export default function VentasScreen() {
  const theme = useTheme();
  const { productRepo, saleService } = useDI();
  const { selectedStoreId } = useAppStore();
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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.EFECTIVO);
  const [cashAmount, setCashAmount] = useState(0);
  const [bankAmount, setBankAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
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

  useEffect(() => {
    (async () => {
      const all = await productRepo.getAll();
      setProducts(all.filter((p) => p.isActive));

      const { data: prices } = await supabase
        .from('product_prices')
        .select('product_id, size, price')
        .eq('is_active', true);

      if (prices) {
        const sizeMap: Record<string, number> = {};
        const bevMap: Record<string, number> = {};
        for (const p of prices) {
          const product = all.find((pr) => pr.id === p.product_id);
          if (product?.category === 'BEBIDA') {
            bevMap[p.product_id] = p.price;
          } else if (p.size) {
            sizeMap[p.size] = p.price;
          }
        }
        setPricesBySize(sizeMap);
        setBeveragePrices(bevMap);
      }
    })();
  }, [productRepo]);

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

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  const handleProductSelect = useCallback((productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    if (product.category === 'BEBIDA') {
      const price = beveragePrices[product.id] ?? 0;
      addToCart({
        productId: product.id,
        productName: product.name,
        size: PizzaSize.INDIVIDUAL,
        quantity: 1,
        unitPrice: price,
      });
    } else {
      setSelectedProductId(productId);
      setSelectedSize(null);
      setModalQuantity(1);
      setSizeModalVisible(true);
    }
  }, [products, addToCart, beveragePrices]);

  const handleSizeConfirm = useCallback(() => {
    if (!selectedProduct || !selectedSize) return;

    const price = pricesBySize[selectedSize] ?? 0;
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

  const totalAmount = cart.reduce((sum, i) => sum + i.subtotal, 0);

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
    if (cart.length === 0) {
      Alert.alert('Error', 'Agrega productos al carrito primero');
      return;
    }

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

      setSnackbar({
        visible: true,
        success: true,
        message: `Venta registrada: ${totalPortions} porc. por ${formatCOP(sale.totalAmount)}${paidLabel}`,
      });

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
  }, [cart, paymentMethod, cashAmount, bankAmount, totalAmount, selectedStoreId, saleService, clearCart, isPaid, observations, loadPendingSales]);

  const handleMarkAsPaid = useCallback(async (sale: Sale) => {
    try {
      await saleService.markAsPaid(sale.id);
      // Remove from local state immediately for instant UI feedback
      setPendingSales(pendingSales.filter((s) => s.id !== sale.id));
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

  const formatTime = (timestamp: string) => {
    const d = new Date(timestamp);
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <StoreSelector />
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {formatDate(new Date())}
          </Text>
        </View>

        {/* Quick nav */}
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
        </View>

        {/* Pending Sales Banner */}
        {pendingSales.length > 0 && (
          <Card style={[styles.pendingCard, { backgroundColor: theme.colors.errorContainer }]} mode="elevated">
            <Card.Content>
              <Text
                variant="titleMedium"
                style={{ fontWeight: '600', color: theme.colors.onErrorContainer, marginBottom: 8 }}
              >
                Pendientes de pago ({pendingSales.length})
              </Text>
              {pendingSales.map((sale) => (
                <View key={sale.id} style={styles.pendingRow}>
                  <View style={styles.pendingInfo}>
                    <Text variant="bodyMedium" style={{ fontWeight: '600', color: theme.colors.onErrorContainer }}>
                      {formatCOP(sale.totalAmount)} - {sale.totalPortions} porc.
                    </Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onErrorContainer }}>
                      {formatTime(sale.timestamp)}
                      {sale.customerNote ? ` - ${sale.customerNote}` : ''}
                    </Text>
                  </View>
                  <Button
                    mode="contained"
                    compact
                    onPress={() => handleMarkAsPaid(sale)}
                    buttonColor={theme.colors.primary}
                    textColor={theme.colors.onPrimary}
                  >
                    Pagado
                  </Button>
                </View>
              ))}
            </Card.Content>
          </Card>
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

        {/* Product Grid */}
        <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600' }]}>
          Productos
        </Text>
        <ProductGrid
          products={products}
          onSelect={handleProductSelect}
          selectedId={selectedProductId ?? undefined}
        />

        {/* Cart */}
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
          </Card.Content>
        </Card>

        {/* Payment */}
        {cart.length > 0 && (
          <Card style={styles.paymentCard} mode="elevated">
            <Card.Content>
              <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600' }]}>
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
                style={styles.observationsInput}
              />
            </Card.Content>
          </Card>
        )}

        {/* Spacer for FAB */}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Submit FAB */}
      {cart.length > 0 && (
        <FAB
          icon="check"
          label={`Registrar ${formatCOP(totalAmount)}`}
          onPress={handleSubmitSale}
          loading={submitting}
          style={[styles.fab, { backgroundColor: theme.colors.primary }]}
          color="#FFFFFF"
        />
      )}

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
                {formatCOP((pricesBySize[selectedSize] ?? 0) * modalQuantity)} - {PORTIONS_PER_SIZE[selectedSize] * modalQuantity} porciones
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
      </Portal>

      {/* Snackbar Feedback */}
      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar((s) => ({ ...s, visible: false }))}
        duration={4000}
        style={{
          backgroundColor: snackbar.success
            ? theme.colors.primaryContainer
            : theme.colors.errorContainer,
          marginBottom: cart.length > 0 ? 70 : 0,
        }}
        action={{
          label: 'OK',
          onPress: () => setSnackbar((s) => ({ ...s, visible: false })),
        }}
      >
        <Text
          style={{
            color: snackbar.success
              ? theme.colors.onPrimaryContainer
              : theme.colors.onErrorContainer,
          }}
        >
          {snackbar.message}
        </Text>
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  navRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  pendingCard: {
    borderRadius: 12,
    marginBottom: 16,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  pendingInfo: {
    flex: 1,
  },
  topConfirmButton: {
    marginBottom: 16,
    borderRadius: 8,
  },
  cartCard: {
    borderRadius: 12,
    marginTop: 16,
  },
  cartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentCard: {
    borderRadius: 12,
    marginTop: 12,
  },
  mixtoInputs: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  halfInput: {
    flex: 1,
  },
  divider: {
    marginVertical: 12,
  },
  paidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  observationsInput: {
    marginTop: 8,
  },
  fab: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    borderRadius: 28,
  },
  modal: {
    margin: 20,
    padding: 24,
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
});
