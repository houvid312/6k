import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
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
  Chip,
  useTheme,
} from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { SearchableSelect } from '../../../src/components/common/SearchableSelect';
import { CurrencyInput } from '../../../src/components/common/CurrencyInput';
import { ConfirmDialog } from '../../../src/components/common/ConfirmDialog';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useMasterDataStore } from '../../../src/stores/useMasterDataStore';
import { useSnackbar } from '../../../src/hooks';
import { Supply, SupplyUnit, SupplyCategory } from '../../../src/domain/entities';
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
  category: SupplyCategory;
  isActive: boolean;
  allowLocalPurchase: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  unit: 'GRAMOS',
  gramsPerBag: '',
  productionCostCop: '',
  commercialPriceCop: 0,
  salePriceCop: 0,
  isBillableToStore: true,
  category: 'PROCESSED',
  isActive: true,
  allowLocalPurchase: false,
};

function parseDecimal(value: string): number {
  const normalized = value.replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function InsumosScreen() {
  const theme = useTheme();
  const { supplyRepo, recipeRepo, productionRecipeRepo } = useDI();
  const userRole = useAppStore((s) => s.userRole);
  const { supplies: cachedSupplies, products: cachedProducts, refreshMasterData } = useMasterDataStore();
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();
  const isGerente = userRole === UserRole.GERENTE;

  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'RAW' | 'PROCESSED' | 'OPERATIVE'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'ARCHIVED' | 'ALL'>('ACTIVE');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Estados para eliminación / archivado
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [deletingSupply, setDeletingSupply] = useState<Supply | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [archiveDialogVisible, setArchiveDialogVisible] = useState(false);
  const [archivingSupply, setArchivingSupply] = useState<Supply | null>(null);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    setSupplies([...cachedSupplies].sort((a, b) => a.name.localeCompare(b.name)));
    setLoading(false);
  }, [cachedSupplies]);

  const isGlobalRole = userRole === UserRole.GERENTE || userRole === UserRole.RODY;

  const filteredSupplies = useMemo(() => {
    return supplies.filter((s) => {
      const cat = s.category || 'PROCESSED';
      if (!isGlobalRole && cat === 'RAW') return false;
      const matchesQuery = !searchQuery.trim() || s.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
      const matchesCategory = categoryFilter === 'ALL' || cat === categoryFilter;
      const isActive = s.isActive ?? true;
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && isActive) ||
        (statusFilter === 'ARCHIVED' && !isActive);
      return matchesQuery && matchesCategory && matchesStatus;
    });
  }, [supplies, searchQuery, categoryFilter, statusFilter, isGlobalRole]);

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
      category: supply.category || 'PROCESSED',
      isActive: supply.isActive ?? true,
      allowLocalPurchase: supply.allowLocalPurchase ?? false,
    });
    setModalVisible(true);
  };

  const handleDeleteClick = (supply: Supply) => {
    setDeletingSupply(supply);
    setDeleteDialogVisible(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingSupply) return;
    setDeleting(true);
    try {
      // 1. Consultar si está en uso en recetas de ventas o de producción
      const [salesRecipes, prodRecipes] = await Promise.all([
        recipeRepo.getAll(),
        productionRecipeRepo.getAll(),
      ]);

      const usedInSales: string[] = [];
      for (const r of salesRecipes) {
        if (r.ingredients.some((ing) => ing.supplyId === deletingSupply.id)) {
          const prod = cachedProducts.find((p) => p.id === r.productId);
          usedInSales.push(prod?.name || 'Producto');
        }
      }

      const usedInProd: string[] = [];
      for (const pr of prodRecipes) {
        if (pr.supplyId === deletingSupply.id || pr.inputs.some((i) => i.supplyId === deletingSupply.id)) {
          usedInProd.push(pr.name);
        }
      }

      if (usedInSales.length > 0 || usedInProd.length > 0) {
        const recipeList: string[] = [];
        if (usedInSales.length > 0) {
          recipeList.push(`• Receta(s) de Venta: ${usedInSales.join(', ')}`);
        }
        if (usedInProd.length > 0) {
          recipeList.push(`• Receta(s) de Producción: ${usedInProd.join(', ')}`);
        }
        const warningMsg = `No se puede eliminar "${deletingSupply.name}" porque está usado en:\n${recipeList.join('\n')}\n\nPara eliminarlo, reemplázalo o quítalo primero de esas recetas.`;
        showError(warningMsg);
        setDeleting(false);
        return;
      }

      // 2. Si no está en recetas, proceder a intentar la eliminación física
      await supplyRepo.delete(deletingSupply.id);
      showSuccess(`Insumo "${deletingSupply.name}" eliminado correctamente`);
      setDeleteDialogVisible(false);
      setDeletingSupply(null);
      refreshMasterData();
    } catch (err: any) {
      console.error('Error deleting supply:', err);
      const errMsg = err?.message || '';
      if (errMsg.includes('foreign key') || errMsg.includes('violates') || err?.code === '23503') {
        const supplyToArchive = deletingSupply;
        setDeleteDialogVisible(false);
        setDeletingSupply(null);
        setArchivingSupply(supplyToArchive);
        setArchiveDialogVisible(true);
      } else {
        showError(`Error al eliminar insumo: ${errMsg || 'inténtalo de nuevo'}`);
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleConfirmArchive = async () => {
    if (!archivingSupply) return;
    setArchiving(true);
    try {
      await supplyRepo.update(archivingSupply.id, { isActive: false });
      showSuccess(`Insumo "${archivingSupply.name}" archivado correctamente`);
      setArchiveDialogVisible(false);
      setArchivingSupply(null);
      refreshMasterData();
    } catch {
      showError('Error al archivar insumo');
    } finally {
      setArchiving(false);
    }
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
    if (isGerente && productionCost < 0) {
      showError('Ingresa un costo de produccion valido');
      return;
    }
    if (isGerente && form.commercialPriceCop < 0) {
      showError('Ingresa un precio comercial valido');
      return;
    }
    if (isGerente && form.salePriceCop < 0) {
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
          category: form.category,
          isActive: form.isActive,
          allowLocalPurchase: form.allowLocalPurchase,
        };
        if (isGerente) {
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
          productionCostCop: isGerente ? productionCost : 0,
          commercialPriceCop: isGerente ? form.commercialPriceCop : 0,
          salePriceCop: isGerente ? form.salePriceCop : 0,
          isBillableToStore: isGerente ? form.isBillableToStore : true,
          category: form.category,
          isActive: form.isActive,
          allowLocalPurchase: form.allowLocalPurchase,
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

      {isGerente && (
        <Button
          mode="contained"
          icon="plus"
          onPress={handleNew}
          style={styles.addBtn}
          buttonColor="#E63946"
        >
          Nuevo Insumo
        </Button>
      )}

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

      {/* Category and Status Filter Chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[
            { key: 'ACTIVE', label: '🟢 Activos' },
            { key: 'ARCHIVED', label: '🔴 Archivados' },
            { key: 'ALL', label: '⚪ Todos los estados' },
          ].map((st) => (
            <Chip
              key={st.key}
              selected={statusFilter === st.key}
              onPress={() => setStatusFilter(st.key as any)}
              style={{ backgroundColor: statusFilter === st.key ? '#333' : '#1E1E1E', borderColor: statusFilter === st.key ? '#E63946' : '#444', borderWidth: 1 }}
              textStyle={{ color: statusFilter === st.key ? '#E63946' : '#999', fontSize: 10, fontWeight: '600' }}
              compact
              showSelectedOverlay={false}
            >
              {st.label}
            </Chip>
          ))}
        </View>
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[
            { key: 'ALL', label: 'Todas las categorias' },
            ...(isGlobalRole ? [{ key: 'RAW', label: '🌾 Materias Primas' }] : []),
            { key: 'PROCESSED', label: '⚙️ Procesados' },
            { key: 'OPERATIVE', label: '📦 Empaques / Consumibles' },
          ].map((cat) => (
            <Chip
              key={cat.key}
              selected={categoryFilter === cat.key}
              onPress={() => setCategoryFilter(cat.key as any)}
              style={{ backgroundColor: categoryFilter === cat.key ? '#E63946' : '#2A2A2A' }}
              textStyle={{ color: '#FFF', fontSize: 10 }}
              compact
              showSelectedOverlay={false}
            >
              {cat.label}
            </Chip>
          ))}
        </View>
      </ScrollView>

      {filteredSupplies.length === 0 ? (
        <EmptyState icon="package-variant" title="Sin insumos" subtitle="No hay insumos en esta categoria" />
      ) : (
        filteredSupplies.map((supply) => {
          const cat = supply.category || 'PROCESSED';
          let catLabel = 'Procesado';
          let catColor = '#1976D2';
          if (cat === 'RAW') {
            catLabel = 'Materia Prima';
            catColor = '#F57C00';
          } else if (cat === 'OPERATIVE') {
            catLabel = 'Empaque / Consumible';
            catColor = '#388E3C';
          }

          const isSupplyActive = supply.isActive ?? true;

          return (
          <Card
            key={supply.id}
            style={[styles.card, { backgroundColor: '#1E1E1E', opacity: isSupplyActive ? 1 : 0.6 }]}
            onPress={isGerente ? () => handleEdit(supply) : undefined}
          >
            <Card.Content style={styles.cardContent}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text variant="titleSmall" style={{ color: '#F5F0EB', fontWeight: '600' }}>
                    {supply.name}
                  </Text>
                  <View style={{ backgroundColor: catColor, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 }}>
                    <Text style={{ fontSize: 9, color: '#FFF', fontWeight: '600' }}>
                      {catLabel}
                    </Text>
                  </View>
                  {!isSupplyActive && (
                    <View style={{ backgroundColor: '#D32F2F', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 }}>
                      <Text style={{ fontSize: 9, color: '#FFF', fontWeight: '600' }}>
                        Archivado
                      </Text>
                    </View>
                  )}
                </View>
                <Text variant="bodySmall" style={{ color: '#999', marginTop: 2 }}>
                  {supply.gramsPerBag}g/bolsa | {supply.unit.toLowerCase()}
                </Text>
                <Text variant="bodySmall" style={{ color: '#999', marginTop: 2 }}>
                  Precio local: {formatCOP(supply.isBillableToStore ? supply.commercialPriceCop : 0)}
                </Text>
                <Text variant="bodySmall" style={{ color: '#999', marginTop: 2 }}>
                  Precio venta cliente: {formatCOP(supply.salePriceCop)}
                </Text>
                {isGerente && (
                  <Text variant="bodySmall" style={{ color: '#777', marginTop: 2 }}>
                    Costo produccion: {formatCOPDecimal(supply.productionCostCop)}
                  </Text>
                )}
              </View>
              {isGerente && (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <IconButton
                    icon="pencil"
                    size={18}
                    iconColor="#E63946"
                    onPress={() => handleEdit(supply)}
                  />
                  <IconButton
                    icon="delete-outline"
                    size={18}
                    iconColor="#D32F2F"
                    onPress={() => handleDeleteClick(supply)}
                  />
                </View>
              )}
            </Card.Content>
          </Card>
          );
        })
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

          <Text variant="bodySmall" style={{ color: '#999', marginTop: 4, marginBottom: 4 }}>
            Categoria del insumo:
          </Text>
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
            {[
              { key: 'RAW', label: 'Mat. Prima' },
              { key: 'PROCESSED', label: 'Procesado' },
              { key: 'OPERATIVE', label: 'Empaque/Consumible' },
            ].map((cat) => (
              <Chip
                key={cat.key}
                selected={form.category === cat.key}
                onPress={() => setForm((p) => ({ ...p, category: cat.key as any }))}
                style={{ backgroundColor: form.category === cat.key ? '#E63946' : '#2A2A2A' }}
                textStyle={{ color: '#FFF', fontSize: 10 }}
                compact
                showSelectedOverlay={false}
              >
                {cat.label}
              </Chip>
            ))}
          </View>

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

          {isGerente && (
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

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium" style={{ color: '#F5F0EB', fontWeight: '600' }}>
                    Insumo Activo
                  </Text>
                  <Text variant="bodySmall" style={{ color: '#999' }}>
                    Si esta desactivado (archivado), se oculta de las compras, recetas y cierres diarios.
                  </Text>
                </View>
                <Switch
                  value={form.isActive}
                  onValueChange={(v) => setForm((p) => ({ ...p, isActive: v }))}
                  color="#4CAF50"
                />
              </View>

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium" style={{ color: '#F5F0EB', fontWeight: '600' }}>
                    Permitir compra directa en local
                  </Text>
                  <Text variant="bodySmall" style={{ color: '#999' }}>
                    Autoriza a las sedes a comprar este insumo en caja e ingresar el inventario al instante.
                  </Text>
                </View>
                <Switch
                  value={form.allowLocalPurchase}
                  onValueChange={(v) => setForm((p) => ({ ...p, allowLocalPurchase: v }))}
                  color="#FF9800"
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

        <ConfirmDialog
          visible={deleteDialogVisible}
          title="Eliminar Insumo"
          message={`¿Estás seguro de que deseas eliminar el insumo "${deletingSupply?.name || ''}"? Esta acción no se puede deshacer.`}
          onConfirm={handleConfirmDelete}
          onDismiss={() => {
            if (!deleting) {
              setDeleteDialogVisible(false);
              setDeletingSupply(null);
            }
          }}
          confirmLabel="Eliminar"
          destructive
          confirmLoading={deleting}
        />

        <ConfirmDialog
          visible={archiveDialogVisible}
          title="Archivar Insumo"
          message={`No es posible eliminar físicamente "${archivingSupply?.name || ''}" porque posee registros de compras, cierres o movimientos en el sistema.\n\n¿Deseas ARCHIVARLO/DESACTIVARLO? Se ocultará de la operación cotidiana pero conservará tu contabilidad e historial intactos.`}
          onConfirm={handleConfirmArchive}
          onDismiss={() => {
            if (!archiving) {
              setArchiveDialogVisible(false);
              setArchivingSupply(null);
            }
          }}
          confirmLabel="Archivar Insumo"
          destructive={false}
          confirmLoading={archiving}
        />
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
