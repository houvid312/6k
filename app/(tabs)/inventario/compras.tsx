import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { TextInput, Button, Text, Menu, Portal, Snackbar, useTheme } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { CurrencyInput } from '../../../src/components/common/CurrencyInput';
import { PaymentMethodPicker } from '../../../src/components/ventas/PaymentMethodPicker';
import { useDI } from '../../../src/di/providers';
import { useSnackbar } from '../../../src/hooks';
import { Supply } from '../../../src/domain/entities';
import { PaymentMethod } from '../../../src/domain/enums';
import { formatCOP } from '../../../src/utils/currency';

export default function ComprasScreen() {
  const theme = useTheme();
  const { supplyRepo, purchaseRepo } = useDI();
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();

  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [selectedSupply, setSelectedSupply] = useState<Supply | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
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

  const handleSubmit = useCallback(async () => {
    if (!selectedSupply) {
      showError('Selecciona un insumo');
      return;
    }
    const grams = parseInt(quantityGrams, 10);
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
        supplyId: selectedSupply.id,
        quantityGrams: grams,
        priceCOP,
        supplier: supplier || 'Proveedor',
        paymentMethod,
      });

      showSuccess(`${selectedSupply.name}: ${grams}g por ${formatCOP(priceCOP)} registrado`);
      setSelectedSupply(null);
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

      {/* Supply selector */}
      <Menu
        visible={menuVisible}
        onDismiss={() => setMenuVisible(false)}
        anchor={
          <Button
            mode="outlined"
            onPress={() => setMenuVisible(true)}
            icon="package-variant"
            style={styles.supplyBtn}
            contentStyle={{ justifyContent: 'flex-start' }}
          >
            {selectedSupply?.name ?? 'Seleccionar insumo'}
          </Button>
        }
        style={styles.menu}
      >
        {supplies.map((s) => (
          <Menu.Item
            key={s.id}
            onPress={() => {
              setSelectedSupply(s);
              setMenuVisible(false);
            }}
            title={`${s.name} (${s.gramsPerBag}g/bolsa)`}
          />
        ))}
      </Menu>

      <TextInput
        label="Cantidad (gramos)"
        value={quantityGrams}
        onChangeText={setQuantityGrams}
        keyboardType="numeric"
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
  supplyBtn: {
    marginBottom: 12,
  },
  menu: {
    width: 300,
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
