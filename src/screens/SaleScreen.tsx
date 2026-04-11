import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import {
  Button,
  Card,
  Chip,
  Divider,
  IconButton,
  Snackbar,
  Switch,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { ScreenContainer } from '../components/common/ScreenContainer';
import {
  ProductGrid,
  SizeSelector,
  CartSummary,
  PaymentMethodPicker,
  AdditionSelector,
} from '../components/ventas';
import { useSaleStore } from '../stores/useSaleStore';
import { useAppStore } from '../stores';
import { useDI } from '../hooks';
import { PaymentMethod } from '../domain/enums';
import { Product, ProductFormat, AdditionCatalogItem, Sale } from '../domain/entities';
import { CartItemAddition } from '../stores/useSaleStore';
import { formatCOP } from '../utils/currency';

export function SaleScreen() {
  const theme = useTheme();
  const { saleService, productRepo, productFormatRepo, additionCatalogRepo } = useDI();
  const selectedStoreId = useAppStore((s) => s.selectedStoreId);
  const scrollRef = useRef<ScrollView>(null);

  const cart = useSaleStore((s) => s.cart);
  const pendingSales = useSaleStore((s) => s.pendingSales);
  const submitting = useSaleStore((s) => s.submitting);
  const lastSaleResult = useSaleStore((s) => s.lastSaleResult);
  const addToCart = useSaleStore((s) => s.addToCart);
  const removeFromCart = useSaleStore((s) => s.removeFromCart);
  const updateQuantity = useSaleStore((s) => s.updateQuantity);
  const updateCustomerNote = useSaleStore((s) => s.updateCustomerNote);
  const clearCart = useSaleStore((s) => s.clearCart);
  const setSubmitting = useSaleStore((s) => s.setSubmitting);
  const setLastSaleResult = useSaleStore((s) => s.setLastSaleResult);
  const setPendingSales = useSaleStore((s) => s.setPendingSales);
  const cartPackagingSupplyId = useSaleStore((s) => s.cartPackagingSupplyId);
  const setCartPackaging = useSaleStore((s) => s.setCartPackaging);

  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | undefined>();
  const [formats, setFormats] = useState<ProductFormat[]>([]);
  const [selectedFormatId, setSelectedFormatId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.EFECTIVO);
  const [observations, setObservations] = useState('');
  const [isPaid, setIsPaid] = useState(false);
  const [availableAdditions, setAvailableAdditions] = useState<AdditionCatalogItem[]>([]);
  const [selectedAdditions, setSelectedAdditions] = useState<CartItemAddition[]>([]);

  useEffect(() => {
    productRepo.getAll().then(setProducts).catch(() => {});
  }, [productRepo]);

  useEffect(() => {
    setSelectedFormatId(null);
    setFormats([]);
    setAvailableAdditions([]);
    setSelectedAdditions([]);
    if (!selectedProductId) return;
    productFormatRepo
      .getByProductId(selectedProductId)
      .then((f) => setFormats(f.filter((fmt) => fmt.isActive)))
      .catch(() => {});
  }, [selectedProductId, productFormatRepo]);

  useEffect(() => {
    setAvailableAdditions([]);
    setSelectedAdditions([]);
    if (!selectedFormatId) return;
    additionCatalogRepo
      .getByFormatId(selectedFormatId)
      .then((adds) => {
        console.log('Adiciones cargadas:', adds.length, 'para formato:', selectedFormatId);
        setAvailableAdditions(adds);
      })
      .catch((err) => {
        console.error('Error cargando adiciones:', err);
      });
  }, [selectedFormatId, additionCatalogRepo]);

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

  const handleToggleAddition = useCallback((addition: AdditionCatalogItem) => {
    setSelectedAdditions((prev) => {
      const exists = prev.find((a) => a.additionCatalogId === addition.id);
      if (exists) {
        return prev.filter((a) => a.additionCatalogId !== addition.id);
      }
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

  const handleAddToCart = useCallback(() => {
    if (!selectedProductId || !selectedFormatId) return;

    const product = products.find((p) => p.id === selectedProductId);
    if (!product) return;

    const format = formats.find((f) => f.id === selectedFormatId);
    if (!format) return;

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) return;

    addToCart({
      productId: selectedProductId,
      productName: product.name,
      formatId: format.id,
      formatName: format.name,
      portionsPerUnit: format.portions,
      quantity: qty,
      unitPrice: format.price,
      additions: selectedAdditions.length > 0 ? selectedAdditions : undefined,
    });

    setQuantity('1');
    setSelectedAdditions([]);
  }, [selectedProductId, selectedFormatId, formats, quantity, products, addToCart, selectedAdditions]);

  const totalAmount = cart.reduce((sum, i) => sum + i.subtotal, 0);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 300);
  }, []);

  const handleConfirmSale = useCallback(async () => {
    if (cart.length === 0) {
      Alert.alert('Carrito vacio', 'Agrega productos al carrito antes de confirmar la venta.');
      return;
    }

    if (!selectedStoreId) {
      Alert.alert('Sin tienda', 'Selecciona un punto de venta antes de continuar.');
      return;
    }

    setSubmitting(true);
    setLastSaleResult(null);

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

      const cashAmount = paymentMethod === PaymentMethod.TRANSFERENCIA ? 0 : totalAmount;
      const bankAmount = paymentMethod === PaymentMethod.EFECTIVO ? 0 : totalAmount;

      const sale = await saleService.createSale(
        selectedStoreId,
        items,
        paymentMethod,
        cashAmount,
        bankAmount,
        observations || undefined,
        isPaid,
        customerNotes || undefined,
        cartPackagingSupplyId,
      );

      const totalPortions = cart.reduce((sum, i) => sum + i.portions, 0);
      const paidLabel = isPaid ? '' : ' (PENDIENTE DE PAGO)';

      setLastSaleResult({
        success: true,
        message: `Venta registrada: ${totalPortions} porc. por ${formatCOP(sale.totalAmount)}${paidLabel}`,
      });

      clearCart();
      setObservations('');
      setPaymentMethod(PaymentMethod.EFECTIVO);
      setIsPaid(false);

      if (!isPaid) {
        loadPendingSales();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido al registrar la venta';
      setLastSaleResult({
        success: false,
        message,
      });
    } finally {
      setSubmitting(false);
    }
  }, [cart, selectedStoreId, paymentMethod, totalAmount, observations, isPaid, saleService, clearCart, setSubmitting, setLastSaleResult, loadPendingSales]);

  const handleMarkAsPaid = useCallback(async (sale: Sale) => {
    try {
      await saleService.markAsPaid(sale.id);
      setPendingSales(pendingSales.filter((s) => s.id !== sale.id));
      setLastSaleResult({
        success: true,
        message: `Venta de ${formatCOP(sale.totalAmount)} marcada como pagada`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al marcar como pagada';
      setLastSaleResult({ success: false, message });
    }
  }, [saleService, pendingSales, setPendingSales, setLastSaleResult]);

  const handleTopConfirmPress = useCallback(() => {
    if (cart.length === 0) {
      Alert.alert('Carrito vacio', 'Agrega productos al carrito antes de confirmar la venta.');
      return;
    }
    scrollToBottom();
  }, [cart, scrollToBottom]);

  const dismissSnackbar = useCallback(() => {
    setLastSaleResult(null);
  }, [setLastSaleResult]);

  const formatTime = (timestamp: string) => {
    const d = new Date(timestamp);
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <ScreenContainer scrollable={false} padded={false}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Pending Sales Banner */}
        {pendingSales.length > 0 && (
          <Card style={[styles.section, { backgroundColor: theme.colors.errorContainer }]} mode="elevated">
            <Card.Title
              title={`Pendientes de pago (${pendingSales.length})`}
              titleVariant="titleMedium"
              titleStyle={{ color: theme.colors.onErrorContainer }}
            />
            <Card.Content>
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

        {/* Quick Confirm (scrolls to bottom) */}
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

        {/* Product Selection */}
        <Card style={styles.section} mode="elevated">
          <Card.Title title="Productos" titleVariant="titleMedium" />
          <Card.Content>
            <ProductGrid
              products={products}
              onSelect={setSelectedProductId}
              selectedId={selectedProductId}
            />
          </Card.Content>
        </Card>

        {/* Size & Quantity */}
        {selectedProduct && selectedProduct.category === 'PIZZA' && (
          <Card style={styles.section} mode="elevated">
            <Card.Title
              title={`Tamano - ${selectedProduct.name}`}
              titleVariant="titleMedium"
            />
            <Card.Content>
              <SizeSelector formats={formats} selected={selectedFormatId} onSelect={setSelectedFormatId} />

              {selectedFormatId && availableAdditions.length > 0 && (
                <AdditionSelector
                  additions={availableAdditions}
                  selected={selectedAdditions}
                  onToggle={handleToggleAddition}
                  onUpdateQuantity={handleUpdateAdditionQuantity}
                />
              )}

              <View style={styles.quantityRow}>
                <Text variant="bodyMedium">Cantidad:</Text>
                <TextInput
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="numeric"
                  mode="outlined"
                  style={styles.quantityInput}
                  dense
                />
                <Button
                  mode="contained"
                  onPress={handleAddToCart}
                  disabled={!selectedFormatId}
                  compact
                >
                  {selectedAdditions.length > 0
                    ? `Agregar (${formatCOP(
                        (formats.find((f) => f.id === selectedFormatId)?.price ?? 0) * (parseInt(quantity, 10) || 1) +
                        selectedAdditions.reduce((s, a) => s + a.price * a.quantity, 0)
                      )})`
                    : 'Agregar'}
                </Button>
              </View>
            </Card.Content>
          </Card>
        )}

        {/* Cart */}
        <Card style={styles.section} mode="elevated">
          <Card.Title title="Carrito" titleVariant="titleMedium" />
          <Card.Content>
            <CartSummary
              items={cart}
              onRemove={removeFromCart}
              onUpdateQuantity={updateQuantity}
              onUpdateNote={updateCustomerNote}
              packagingSupplyId={cartPackagingSupplyId}
              onPackagingChange={setCartPackaging}
            />
          </Card.Content>
        </Card>

        {/* Payment & Confirm */}
        {cart.length > 0 && (
          <Card style={styles.section} mode="elevated">
            <Card.Title title="Pago" titleVariant="titleMedium" />
            <Card.Content>
              <PaymentMethodPicker value={paymentMethod} onChange={setPaymentMethod} />
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

        {/* Confirm Button */}
        {cart.length > 0 && (
          <Button
            mode="contained"
            onPress={handleConfirmSale}
            loading={submitting}
            disabled={submitting || cart.length === 0}
            style={styles.confirmButton}
            contentStyle={styles.confirmButtonContent}
            labelStyle={styles.confirmButtonLabel}
            icon="check-circle"
          >
            {submitting ? 'Registrando...' : `Confirmar Venta - ${formatCOP(totalAmount)}`}
          </Button>
        )}
      </ScrollView>

      {/* Snackbar Feedback */}
      <Snackbar
        visible={lastSaleResult !== null}
        onDismiss={dismissSnackbar}
        duration={4000}
        style={{
          backgroundColor: lastSaleResult?.success
            ? theme.colors.primaryContainer
            : theme.colors.errorContainer,
        }}
        action={{
          label: 'OK',
          onPress: dismissSnackbar,
        }}
      >
        <Text
          style={{
            color: lastSaleResult?.success
              ? theme.colors.onPrimaryContainer
              : theme.colors.onErrorContainer,
          }}
        >
          {lastSaleResult?.message ?? ''}
        </Text>
      </Snackbar>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 16,
    borderRadius: 12,
  },
  topConfirmButton: {
    marginBottom: 16,
    borderRadius: 8,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  pendingInfo: {
    flex: 1,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
  },
  quantityInput: {
    width: 60,
    textAlign: 'center',
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
  confirmButton: {
    marginVertical: 16,
    borderRadius: 12,
  },
  confirmButtonContent: {
    paddingVertical: 8,
  },
  confirmButtonLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
});
