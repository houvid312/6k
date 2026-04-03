import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { TextInput, Button, Text, Portal, Snackbar, useTheme } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { CurrencyInput } from '../../../src/components/common/CurrencyInput';
import { SearchableSelect } from '../../../src/components/common/SearchableSelect';
import { PaymentMethodPicker } from '../../../src/components/ventas/PaymentMethodPicker';
import { useDI } from '../../../src/di/providers';
import { useSnackbar } from '../../../src/hooks';
import { Supply } from '../../../src/domain/entities';
import { PaymentMethod } from '../../../src/domain/enums';
import { formatCOP } from '../../../src/utils/currency';
import { useAppStore } from '../../../src/stores/useAppStore';

export default function ComprasScreen() {
  const theme = useTheme();
  const { supplyRepo, purchaseRepo } = useDI();
  const { stores } = useAppStore();
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();
  const productionCenterId = stores.find((s) => s.isProductionCenter)?.id ?? '';

  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [selectedSupplyId, setSelectedSupplyId] = useState<string>('');
  const [quantityGrams, setQuantityGrams] = useState('');
  const [priceCOP, setPriceCOP] = useState(0);
  const [supplier, setSupplier] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.EFECTIVO);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const all = await supplyRepo.getAll();
      setSupplies(all);
    })();
  }, [supplyRepo]);

  const supplyOptions = useMemo(
    () => supplies.map((s) => ({ value: s.id, label: s.name, subtitle: `${s.gramsPerBag}g/bolsa` })),
    [supplies],
  );

  const selectedSupply = supplies.find((s) => s.id === selectedSupplyId);

  const handleSubmit = useCallback(async () => {
    if (!selectedSupply) {
      showError('Selecciona un insumo');
      return;
    }
    const grams = parseFloat(quantityGrams);
    if (isNaN(grams) || grams <= 0) {
      showError('Ingresa una cantidad valida');
      return;
    }
    if (priceCOP <= 0) {
      showError('Ingresa un precio valido');
      return;
    }

    setSubmitting(true);
    try {
      await purchaseRepo.create({
        timestamp: new Date().toISOString(),
        storeId: productionCenterId,
        supplyId: selectedSupply.id,
        quantityGrams: grams,
        priceCOP,
        supplier: supplier || 'Proveedor',
        paymentMethod,
      });

      showSuccess(`${selectedSupply.name}: ${grams}g por ${formatCOP(priceCOP)} registrado`);
      setSelectedSupplyId('');
      setQuantityGrams('');
      setPriceCOP(0);
      setSupplier('');
    } catch {
      showError('No se pudo registrar la compra');
    } finally {
      setSubmitting(false);
    }
  }, [selectedSupply, quantityGrams, priceCOP, supplier, paymentMethod, purchaseRepo, showSuccess, showError]);

  return (
    <ScreenContainer>
      <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600' }]}>
        Nueva Compra de Insumo
      </Text>

      <SearchableSelect
        options={supplyOptions}
        selectedValue={selectedSupplyId}
        placeholder="Seleccionar insumo"
        icon="package-variant"
        onSelect={setSelectedSupplyId}
      />

      <TextInput
        label="Cantidad (gramos)"
        value={quantityGrams}
        onChangeText={setQuantityGrams}
        keyboardType="decimal-pad"
        mode="outlined"
        style={styles.input}
        right={<TextInput.Affix text="g" />}
      />

      <CurrencyInput
        value={priceCOP}
        onChangeValue={setPriceCOP}
        label="Precio Total"
        style={styles.input}
      />

      <TextInput
        label="Proveedor"
        value={supplier}
        onChangeText={setSupplier}
        mode="outlined"
        style={styles.input}
      />

      <Text variant="bodyMedium" style={{ fontWeight: '600', marginTop: 8, marginBottom: 8 }}>
        Metodo de Pago
      </Text>
      <PaymentMethodPicker value={paymentMethod} onChange={setPaymentMethod} />

      <Button
        mode="contained"
        onPress={handleSubmit}
        loading={submitting}
        disabled={submitting}
        style={styles.submitBtn}
        icon="check"
      >
        Registrar Compra
      </Button>

      <Portal>
        <Snackbar
          visible={snackbar.visible}
          onDismiss={hideSnackbar}
          duration={3000}
          style={{ backgroundColor: snackbar.error ? '#B00020' : '#2E7D32', marginBottom: 80 }}
        >
          {snackbar.message}
        </Snackbar>
      </Portal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    marginBottom: 16,
  },
  input: {
    marginBottom: 12,
  },
  submitBtn: {
    marginTop: 24,
    borderRadius: 8,
    paddingVertical: 4,
  },
});
