import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { TextInput, Button, Text, Portal, Snackbar, Chip, Divider, useTheme } from 'react-native-paper';
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
import { useMasterDataStore } from '../../../src/stores/useMasterDataStore';
import { supabase } from '../../../src/lib/supabase';

export default function ComprasScreen() {
  const theme = useTheme();
  const { purchaseRepo, supplyRepo } = useDI();
  const { stores, selectedStoreId } = useAppStore();
  const { supplies } = useMasterDataStore();
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();
  const productionCenter = stores.find((s) => s.isProductionCenter);
  const productionCenterId = productionCenter?.id ?? '';
  const isProductionCenter = selectedStoreId === productionCenterId;

  const [selectedSupplyId, setSelectedSupplyId] = useState<string>('');
  const [quantityGrams, setQuantityGrams] = useState('');
  const [priceCOP, setPriceCOP] = useState(0);
  const [supplier, setSupplier] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.EFECTIVO);
  const [submitting, setSubmitting] = useState(false);

  // I4: Frequent supplies
  const [recentSupplyIds, setRecentSupplyIds] = useState<string[]>([]);
  // I4: Inline new supply
  const [showNewSupply, setShowNewSupply] = useState(false);
  const [newSupplyName, setNewSupplyName] = useState('');
  const [newSupplyUnit, setNewSupplyUnit] = useState('g');
  const [newSupplyGramsPerBag, setNewSupplyGramsPerBag] = useState('');
  const [creatingSupply, setCreatingSupply] = useState(false);

  // Load recent purchases to determine frequent supplies
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('purchases')
          .select('supply_id')
          .eq('store_id', productionCenterId)
          .order('created_at', { ascending: false })
          .limit(30);
        if (data) {
          const seen = new Set<string>();
          const ids: string[] = [];
          for (const row of data) {
            if (!seen.has(row.supply_id)) {
              seen.add(row.supply_id);
              ids.push(row.supply_id);
              if (ids.length >= 8) break;
            }
          }
          setRecentSupplyIds(ids);
        }
      } catch { /* ignore */ }
    })();
  }, [productionCenterId]);

  const { refreshMasterData } = useMasterDataStore();

  const handleCreateSupply = useCallback(async () => {
    if (!newSupplyName.trim()) return;
    setCreatingSupply(true);
    try {
      const supply = await supplyRepo.create({
        name: newSupplyName.trim(),
        unit: newSupplyUnit as any,
        gramsPerBag: parseInt(newSupplyGramsPerBag, 10) || 0,
      });
      await refreshMasterData();
      setSelectedSupplyId(supply.id);
      setShowNewSupply(false);
      setNewSupplyName('');
      setNewSupplyGramsPerBag('');
      showSuccess(`Insumo "${supply.name}" creado`);
    } catch {
      showError('Error al crear insumo');
    } finally {
      setCreatingSupply(false);
    }
  }, [newSupplyName, newSupplyUnit, newSupplyGramsPerBag, supplyRepo, refreshMasterData, showSuccess, showError]);

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

  if (!isProductionCenter) {
    return (
      <ScreenContainer>
        <View style={styles.blockedContainer}>
          <Text variant="headlineMedium" style={{ textAlign: 'center', marginBottom: 12 }}>
            Compras no disponible
          </Text>
          <Text variant="bodyLarge" style={{ textAlign: 'center', color: '#999', marginBottom: 8 }}>
            El ingreso de materia prima solo se realiza desde el Centro de Produccion.
          </Text>
          <Text variant="bodyMedium" style={{ textAlign: 'center', color: '#777' }}>
            Cambia al Centro de Produccion en el selector de local para registrar compras.
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600' }]}>
        Nueva Compra de Insumo
      </Text>

      {/* I4: Frequent supplies */}
      {recentSupplyIds.length > 0 && (
        <View style={{ marginBottom: 12 }}>
          <Text variant="labelLarge" style={{ marginBottom: 6, color: theme.colors.onSurfaceVariant }}>
            Frecuentes
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {recentSupplyIds.map((id) => {
              const s = supplies.find((sup) => sup.id === id);
              if (!s) return null;
              return (
                <Chip
                  key={id}
                  selected={selectedSupplyId === id}
                  onPress={() => setSelectedSupplyId(id)}
                  mode="outlined"
                  compact
                >
                  {s.name}
                </Chip>
              );
            })}
          </View>
        </View>
      )}

      <SearchableSelect
        options={supplyOptions}
        selectedValue={selectedSupplyId}
        placeholder="Seleccionar insumo"
        icon="package-variant"
        onSelect={setSelectedSupplyId}
      />

      {/* I4: Inline new supply creation */}
      {!showNewSupply ? (
        <Button
          mode="text"
          icon="plus"
          compact
          onPress={() => setShowNewSupply(true)}
          style={{ alignSelf: 'flex-start', marginBottom: 8 }}
        >
          Nuevo Insumo
        </Button>
      ) : (
        <View style={{ backgroundColor: '#1E1E1E', padding: 12, borderRadius: 12, marginBottom: 12 }}>
          <Text variant="labelLarge" style={{ marginBottom: 8 }}>Crear Insumo</Text>
          <TextInput
            label="Nombre"
            value={newSupplyName}
            onChangeText={setNewSupplyName}
            mode="outlined"
            dense
            style={{ marginBottom: 8 }}
          />
          <TextInput
            label="Gramos por bolsa"
            value={newSupplyGramsPerBag}
            onChangeText={setNewSupplyGramsPerBag}
            keyboardType="numeric"
            mode="outlined"
            dense
            style={{ marginBottom: 8 }}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button mode="text" onPress={() => setShowNewSupply(false)}>Cancelar</Button>
            <Button
              mode="contained"
              onPress={handleCreateSupply}
              loading={creatingSupply}
              disabled={!newSupplyName.trim() || creatingSupply}
              compact
            >
              Crear
            </Button>
          </View>
        </View>
      )}

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
  blockedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
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
