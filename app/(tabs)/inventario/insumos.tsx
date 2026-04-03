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
  useTheme,
} from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { SearchableSelect } from '../../../src/components/common/SearchableSelect';
import { useDI } from '../../../src/di/providers';
import { useSnackbar } from '../../../src/hooks';
import { Supply, SupplyUnit } from '../../../src/domain/entities';

const UNIT_OPTIONS: { value: SupplyUnit; label: string }[] = [
  { value: 'GRAMOS', label: 'Gramos' },
  { value: 'MILILITROS', label: 'Mililitros' },
  { value: 'UNIDAD', label: 'Unidad' },
];

interface FormState {
  name: string;
  unit: SupplyUnit;
  gramsPerBag: string;
}

const EMPTY_FORM: FormState = { name: '', unit: 'GRAMOS', gramsPerBag: '' };

export default function InsumosScreen() {
  const theme = useTheme();
  const { supplyRepo } = useDI();
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();

  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const loadSupplies = useCallback(async () => {
    setLoading(true);
    try {
      const all = await supplyRepo.getAll();
      setSupplies(all.sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      showError('Error al cargar insumos');
    } finally {
      setLoading(false);
    }
  }, [supplyRepo]);

  useEffect(() => {
    loadSupplies();
  }, [loadSupplies]);

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

    setSaving(true);
    try {
      if (editingId) {
        await supplyRepo.update(editingId, {
          name: form.name.trim(),
          unit: form.unit,
          gramsPerBag: gpb,
        });
        showSuccess(`${form.name.trim()} actualizado`);
      } else {
        await supplyRepo.create({
          name: form.name.trim(),
          unit: form.unit,
          gramsPerBag: gpb,
        });
        showSuccess(`${form.name.trim()} creado`);
      }
      setModalVisible(false);
      loadSupplies();
    } catch {
      showError('Error al guardar insumo');
    } finally {
      setSaving(false);
    }
  }, [editingId, form, supplyRepo, loadSupplies, showSuccess, showError]);

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
});
