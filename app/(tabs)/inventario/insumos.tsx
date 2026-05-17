import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  Card,
  Text,
  TextInput,
  Button,
  IconButton,
  Portal,
  Modal,
  Snackbar,
  Switch,
  useTheme,
} from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { SearchableSelect } from '../../../src/components/common/SearchableSelect';
import { CurrencyInput } from '../../../src/components/common/CurrencyInput';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useMasterDataStore } from '../../../src/stores/useMasterDataStore';
import { useSnackbar } from '../../../src/hooks';
import { Supply, SupplyUnit } from '../../../src/domain/entities';
import { UserRole } from '../../../src/domain/enums';
import { formatCOP, formatCOPDecimal } from '../../../src/utils/currency';

const UNIT_OPTIONS: { value: SupplyUnit; label: string }[] = [
  { value: 'GRAMOS', label: 'Gramos' },
  { value: 'MILILITROS', label: 'Mililitros' },
  { value: 'UNIDAD', label: 'Unidad' },
];

interface FormState {
  name: string;
  unit: SupplyUnit;
  gramsPerBag: string;
  productionCostCop: string;
  commercialPriceCop: number;
  salePriceCop: number;
  isBillableToStore: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  unit: 'GRAMOS',
  gramsPerBag: '',
  productionCostCop: '',
  commercialPriceCop: 0,
  salePriceCop: 0,
  isBillableToStore: true,
};

function parseDecimal(value: string): number {
  const normalized = value.replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function InsumosScreen() {
  const theme = useTheme();
  const { supplyRepo } = useDI();
  const userRole = useAppStore((s) => s.userRole);
  const { supplies: cachedSupplies, refreshMasterData } = useMasterDataStore();
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();
  const isAdmin = userRole === UserRole.ADMIN;

  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSupplies([...cachedSupplies].sort((a, b) => a.name.localeCompare(b.name)));
    setLoading(false);
  }, [cachedSupplies]);

  const handleNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  };

  const handleEdit = (supply: Supply) => {
    setEditingId(supply.id);
    setForm({
      name: supply.name,
      unit: supply.unit,
      gramsPerBag: String(supply.gramsPerBag),
      productionCostCop: String(supply.productionCostCop),
      commercialPriceCop: supply.commercialPriceCop,
      salePriceCop: supply.salePriceCop,
      isBillableToStore: supply.isBillableToStore,
    });
    setModalVisible(true);
  };

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) {
      showError('Ingresa un nombre');
      return;
    }
    const gpb = parseFloat(form.gramsPerBag);
    if (isNaN(gpb) || gpb <= 0) {
      showError('Ingresa gramos por bolsa validos');
      return;
    }
    const productionCost = parseDecimal(form.productionCostCop);
    if (isAdmin && productionCost < 0) {
      showError('Ingresa un costo de produccion valido');
      return;
    }
    if (isAdmin && form.commercialPriceCop < 0) {
      showError('Ingresa un precio comercial valido');
      return;
    }
    if (isAdmin && form.salePriceCop < 0) {
      showError('Ingresa un precio de venta valido');
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        const updates: Partial<Omit<Supply, 'id'>> = {
          name: form.name.trim(),
          unit: form.unit,
          gramsPerBag: gpb,
        };
        if (isAdmin) {
          updates.productionCostCop = productionCost;
          updates.commercialPriceCop = form.commercialPriceCop;
          updates.salePriceCop = form.salePriceCop;
          updates.isBillableToStore = form.isBillableToStore;
        }
        await supplyRepo.update(editingId, updates);
        showSuccess(`${form.name.trim()} actualizado`);
      } else {
        await supplyRepo.create({
          name: form.name.trim(),
          unit: form.unit,
          gramsPerBag: gpb,
          productionCostCop: isAdmin ? productionCost : 0,
          commercialPriceCop: isAdmin ? form.commercialPriceCop : 0,
          salePriceCop: isAdmin ? form.salePriceCop : 0,
          isBillableToStore: isAdmin ? form.isBillableToStore : true,
        });
        showSuccess(`${form.name.trim()} creado`);
      }
      setModalVisible(false);
      refreshMasterData();
    } catch {
      showError('Error al guardar insumo');
    } finally {
      setSaving(false);
    }
  }, [editingId, form, supplyRepo, refreshMasterData, showSuccess, showError]);

  const filteredSupplies = searchQuery.trim()
    ? supplies.filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase().trim()))
    : supplies;

  if (loading) {
    return <LoadingIndicator message="Cargando insumos..." />;
  }

  return (
    <ScreenContainer scrollable padded>
      <Text variant="titleMedium" style={[styles.title, { color: theme.colors.onBackground }]}>
        Gestion de Insumos
      </Text>
      <Text variant="bodySmall" style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
        {supplies.length} insumos registrados
      </Text>

      <Button
        mode="contained"
        icon="plus"
        onPress={handleNew}
        style={styles.addBtn}
        buttonColor="#E63946"
      >
        Nuevo Insumo
      </Button>

      <TextInput
        placeholder="Buscar insumo..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        mode="outlined"
        dense
        style={styles.searchInput}
        left={<TextInput.Icon icon="magnify" />}
        right={searchQuery ? <TextInput.Icon icon="close" onPress={() => setSearchQuery('')} /> : undefined}
      />

      {filteredSupplies.length === 0 ? (
        <EmptyState icon="package-variant" title="Sin insumos" subtitle="Agrega tu primer insumo" />
      ) : (
        filteredSupplies.map((supply) => (
          <Card
            key={supply.id}
            style={[styles.card, { backgroundColor: '#1E1E1E' }]}
            onPress={() => handleEdit(supply)}
          >
            <Card.Content style={styles.cardContent}>
              <View style={{ flex: 1 }}>
                <Text variant="titleSmall" style={{ color: '#F5F0EB', fontWeight: '600' }}>
                  {supply.name}
                </Text>
                <Text variant="bodySmall" style={{ color: '#999', marginTop: 2 }}>
                  {supply.gramsPerBag}g/bolsa | {supply.unit.toLowerCase()}
                </Text>
                <Text variant="bodySmall" style={{ color: '#999', marginTop: 2 }}>
                  Precio local: {formatCOP(supply.isBillableToStore ? supply.commercialPriceCop : 0)}
                </Text>
                <Text variant="bodySmall" style={{ color: '#999', marginTop: 2 }}>
                  Precio venta cliente: {formatCOP(supply.salePriceCop)}
                </Text>
                {isAdmin && (
                  <Text variant="bodySmall" style={{ color: '#777', marginTop: 2 }}>
                    Costo produccion: {formatCOPDecimal(supply.productionCostCop)}
                  </Text>
                )}
              </View>
              <IconButton
                icon="pencil"
                size={18}
                iconColor="#E63946"
                onPress={() => handleEdit(supply)}
              />
            </Card.Content>
          </Card>
        ))
      )}

      <View style={{ height: 100 }} />

      <Portal>
        <Modal
          visible={modalVisible}
          onDismiss={() => setModalVisible(false)}
          contentContainerStyle={[styles.modal, { backgroundColor: '#1E1E1E' }]}
        >
          <Text variant="titleMedium" style={{ color: '#F5F0EB', fontWeight: '600', marginBottom: 16 }}>
            {editingId ? 'Editar Insumo' : 'Nuevo Insumo'}
          </Text>

          <TextInput
            label="Nombre del insumo"
            value={form.name}
            onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
            mode="outlined"
            style={styles.input}
            outlineColor="#333"
            activeOutlineColor="#E63946"
            textColor="#F5F0EB"
          />

          <SearchableSelect
            options={UNIT_OPTIONS.map((u) => ({ value: u.value, label: u.label }))}
            selectedValue={form.unit}
            placeholder="Seleccionar unidad"
            onSelect={(v) => setForm((p) => ({ ...p, unit: v as SupplyUnit }))}
          />

          <TextInput
            label="Gramos por bolsa"
            value={form.gramsPerBag}
            onChangeText={(v) => setForm((p) => ({ ...p, gramsPerBag: v }))}
            keyboardType="decimal-pad"
            mode="outlined"
            style={styles.input}
            outlineColor="#333"
            activeOutlineColor="#E63946"
            textColor="#F5F0EB"
            right={<TextInput.Affix text="g" textStyle={{ color: '#999' }} />}
          />

          {isAdmin && (
            <>
              <TextInput
                label="Costo de produccion"
                value={form.productionCostCop}
                onChangeText={(v) => setForm((p) => ({ ...p, productionCostCop: v }))}
                keyboardType="decimal-pad"
                mode="outlined"
                style={styles.input}
                outlineColor="#333"
                activeOutlineColor="#E63946"
                textColor="#F5F0EB"
                left={<TextInput.Affix text="$" textStyle={{ color: '#999' }} />}
              />

              <CurrencyInput
                label="Precio al local"
                value={form.commercialPriceCop}
                onChangeValue={(v) => setForm((p) => ({ ...p, commercialPriceCop: v }))}
                style={styles.input}
              />

              <CurrencyInput
                label="Precio venta cliente"
                value={form.salePriceCop}
                onChangeValue={(v) => setForm((p) => ({ ...p, salePriceCop: v }))}
                style={styles.input}
              />

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium" style={{ color: '#F5F0EB', fontWeight: '600' }}>
                    Cobrable al local
                  </Text>
                  <Text variant="bodySmall" style={{ color: '#999' }}>
                    Si esta apagado, el traslado factura este insumo en $0.
                  </Text>
                </View>
                <Switch
                  value={form.isBillableToStore}
                  onValueChange={(v) => setForm((p) => ({ ...p, isBillableToStore: v }))}
                  color="#E63946"
                />
              </View>
            </>
          )}

          <View style={styles.modalActions}>
            <Button
              mode="outlined"
              onPress={() => setModalVisible(false)}
              style={{ flex: 1, marginRight: 8 }}
            >
              Cancelar
            </Button>
            <Button
              mode="contained"
              onPress={handleSave}
              loading={saving}
              disabled={saving}
              buttonColor="#E63946"
              style={{ flex: 1 }}
            >
              {editingId ? 'Actualizar' : 'Crear'}
            </Button>
          </View>
        </Modal>

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
  title: {
    marginBottom: 4,
  },
  subtitle: {
    marginBottom: 16,
  },
  searchInput: {
    marginBottom: 12,
  },
  addBtn: {
    marginBottom: 12,
    borderRadius: 8,
  },
  card: {
    marginBottom: 8,
    borderRadius: 12,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modal: {
    margin: 20,
    padding: 20,
    borderRadius: 12,
  },
  input: {
    marginBottom: 12,
    backgroundColor: '#111',
  },
  modalActions: {
    flexDirection: 'row',
    marginTop: 8,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
});
