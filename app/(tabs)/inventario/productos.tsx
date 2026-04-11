import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import {
  Text, Card, Button, IconButton, Divider, TextInput, Switch,
  SegmentedButtons, Portal, Modal, Dialog, Snackbar, Chip, useTheme,
} from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { SearchableSelect, SelectOption } from '../../../src/components/common/SearchableSelect';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useMasterDataStore } from '../../../src/stores/useMasterDataStore';
import { useSnackbar } from '../../../src/hooks';
import { Product, ProductCategory, ProductFormat, Recipe } from '../../../src/domain/entities';

interface EditableIngredient {
  supplyId: string;
  gramsPerPortion: string;
}

type Tab = 'PIZZA' | 'BEBIDA' | 'OTRO';

const CATEGORY_LABELS: Record<ProductCategory, string> = {
  PIZZA: 'Pizza',
  BEBIDA: 'Bebida',
  OTRO: 'Otro',
};

export default function ProductosScreen() {
  const theme = useTheme();
  const { productRepo, productFormatRepo, productStoreAssignmentRepo, recipeRepo } = useDI();
  const { stores } = useAppStore();
  const { refreshMasterData, supplies } = useMasterDataStore();
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();

  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [tab, setTab] = useState<Tab>('PIZZA');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // 'ok' | 'empty' | 'missing' — solo para productos con hasRecipe
  const [recipeStatus, setRecipeStatus] = useState<Record<string, 'ok' | 'empty' | 'missing'>>({});
  // Receta cargada por producto
  const [recipesByProduct, setRecipesByProduct] = useState<Record<string, Recipe | null>>({});
  // Edición inline de receta
  const [editingRecipeProductId, setEditingRecipeProductId] = useState<string | null>(null);
  const [editIngredients, setEditIngredients] = useState<EditableIngredient[]>([]);
  const [savingRecipe, setSavingRecipe] = useState(false);

  // Formats per product
  const [formatsByProduct, setFormatsByProduct] = useState<Record<string, ProductFormat[]>>({});
  // Store assignments per product: productId → Set of storeIds where active
  const [assignmentsByProduct, setAssignmentsByProduct] = useState<Record<string, Set<string>>>({});
  // Edición inline de formato: formatId → { name, portions, price }
  const [editingFormatId, setEditingFormatId] = useState<string | null>(null);
  const [editFormatName, setEditFormatName] = useState('');
  const [editFormatPortions, setEditFormatPortions] = useState('');
  const [editFormatPrice, setEditFormatPrice] = useState('');
  const [savingFormatEdit, setSavingFormatEdit] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ productId: string; formatId: string; name: string } | null>(null);

  // New product modal
  const [newProductVisible, setNewProductVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<ProductCategory>('PIZZA');
  const [newHasRecipe, setNewHasRecipe] = useState(false);
  const [saving, setSaving] = useState(false);

  // New format modal
  const [newFormatProductId, setNewFormatProductId] = useState<string | null>(null);
  const [newFormatName, setNewFormatName] = useState('');
  const [newFormatPortions, setNewFormatPortions] = useState('1');
  const [newFormatPrice, setNewFormatPrice] = useState('');
  const [savingFormat, setSavingFormat] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const [all, allRecipes] = await Promise.all([
        productRepo.getAll(),
        recipeRepo.getAll(),
      ]);
      setProducts(all);

      const status: Record<string, 'ok' | 'empty' | 'missing'> = {};
      const recipeByProduct = new Map(allRecipes.map((r) => [r.productId, r]));
      for (const p of all) {
        if (!p.hasRecipe) continue;
        const recipe = recipeByProduct.get(p.id);
        if (!recipe) status[p.id] = 'missing';
        else if (recipe.ingredients.length === 0) status[p.id] = 'empty';
        else status[p.id] = 'ok';
      }
      setRecipeStatus(status);
    } catch {
      showError('Error cargando productos');
    } finally {
      setLoading(false);
    }
  }, [productRepo, recipeRepo]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const loadExpanded = useCallback(async (productId: string) => {
    const product = products.find((p) => p.id === productId);
    try {
      const [formats, assignments, recipe] = await Promise.all([
        productFormatRepo.getByProductId(productId),
        productStoreAssignmentRepo.getAssignmentsByProduct(productId),
        product?.hasRecipe ? recipeRepo.getByProductId(productId) : Promise.resolve(null),
      ]);
      setFormatsByProduct((prev) => ({ ...prev, [productId]: formats }));
      const activeStores = new Set(assignments.filter((a) => a.isActive).map((a) => a.storeId));
      setAssignmentsByProduct((prev) => ({ ...prev, [productId]: activeStores }));
      setRecipesByProduct((prev) => ({ ...prev, [productId]: recipe }));
    } catch {
      showError('Error cargando detalles del producto');
    }
  }, [productFormatRepo, productStoreAssignmentRepo, recipeRepo, products]);

  const handleExpand = (productId: string) => {
    if (expandedId === productId) {
      setExpandedId(null);
    } else {
      setExpandedId(productId);
      loadExpanded(productId);
    }
  };

  const handleToggleActive = async (product: Product) => {
    try {
      await productRepo.update(product.id, { isActive: !product.isActive });
      setProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, isActive: !p.isActive } : p));
      await refreshMasterData();
    } catch {
      showError('Error actualizando producto');
    }
  };

  const handleToggleFormatActive = async (productId: string, format: ProductFormat) => {
    try {
      await productFormatRepo.update(format.id, { isActive: !format.isActive });
      setFormatsByProduct((prev) => ({
        ...prev,
        [productId]: (prev[productId] ?? []).map((f) =>
          f.id === format.id ? { ...f, isActive: !f.isActive } : f,
        ),
      }));
    } catch {
      showError('Error actualizando formato');
    }
  };

  const handleStartEditFormat = (fmt: ProductFormat) => {
    setEditingFormatId(fmt.id);
    setEditFormatName(fmt.name);
    setEditFormatPortions(String(fmt.portions));
    setEditFormatPrice(String(fmt.price));
  };

  const handleCancelEditFormat = () => {
    setEditingFormatId(null);
  };

  const handleSaveFormat = async (productId: string, formatId: string) => {
    const portions = parseInt(editFormatPortions, 10);
    const price = parseInt(editFormatPrice.replace(/\D/g, ''), 10);
    if (!editFormatName.trim()) { showError('El nombre no puede estar vacío'); return; }
    if (isNaN(portions) || portions <= 0) { showError('Porciones debe ser un número positivo'); return; }
    if (isNaN(price) || price < 0) { showError('Precio inválido'); return; }

    setSavingFormatEdit(true);
    try {
      await productFormatRepo.update(formatId, {
        name: editFormatName.trim(),
        portions,
        price,
      });
      setFormatsByProduct((prev) => ({
        ...prev,
        [productId]: (prev[productId] ?? []).map((f) =>
          f.id === formatId ? { ...f, name: editFormatName.trim(), portions, price } : f,
        ),
      }));
      handleCancelEditFormat();
      showSuccess('Formato actualizado');
    } catch {
      showError('Error actualizando formato');
    } finally {
      setSavingFormatEdit(false);
    }
  };

  const handleDeleteFormat = (productId: string, formatId: string, formatName: string) => {
    setDeleteConfirm({ productId, formatId, name: formatName });
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;
    const { productId, formatId } = deleteConfirm;
    setDeleteConfirm(null);
    try {
      await productFormatRepo.delete(formatId);
      setFormatsByProduct((prev) => ({
        ...prev,
        [productId]: (prev[productId] ?? []).filter((f) => f.id !== formatId),
      }));
      showSuccess('Formato eliminado');
    } catch {
      showError('No se puede eliminar: está asociado a ventas existentes');
    }
  };

  const handleToggleStoreAssignment = async (productId: string, storeId: string) => {
    const current = assignmentsByProduct[productId] ?? new Set<string>();
    const isActive = current.has(storeId);
    try {
      await productStoreAssignmentRepo.setActive(productId, storeId, !isActive);
      setAssignmentsByProduct((prev) => {
        const next = new Set(prev[productId] ?? []);
        if (isActive) next.delete(storeId); else next.add(storeId);
        return { ...prev, [productId]: next };
      });
    } catch {
      showError('Error actualizando disponibilidad');
    }
  };

  const handleCreateProduct = async () => {
    if (!newName.trim()) { showError('Ingresa un nombre'); return; }
    setSaving(true);
    try {
      const product = await productRepo.create({ name: newName.trim(), category: newCategory, hasRecipe: newHasRecipe });
      // Assign to all stores by default
      if (stores.length > 0) {
        await productStoreAssignmentRepo.bulkAssign(product.id, stores.map((s) => s.id));
      }
      // Auto-crear receta vacía si el producto la requiere
      if (newHasRecipe) {
        await recipeRepo.create(product.id);
        setRecipeStatus((prev) => ({ ...prev, [product.id]: 'empty' }));
      }
      setProducts((prev) => [...prev, product]);
      await refreshMasterData();
      setNewProductVisible(false);
      setNewName('');
      setNewCategory('PIZZA');
      setNewHasRecipe(false);
      showSuccess(`Producto "${product.name}" creado`);
    } catch {
      showError('Error creando producto');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateFormat = async () => {
    if (!newFormatProductId) return;
    if (!newFormatName.trim()) { showError('Ingresa un nombre para el formato'); return; }
    const portions = parseInt(newFormatPortions, 10);
    const price = parseInt(newFormatPrice.replace(/\D/g, ''), 10);
    if (isNaN(portions) || portions <= 0) { showError('Porciones debe ser un número positivo'); return; }
    if (isNaN(price) || price < 0) { showError('Precio inválido'); return; }

    setSavingFormat(true);
    try {
      const existing = formatsByProduct[newFormatProductId] ?? [];
      const fmt = await productFormatRepo.create(newFormatProductId, {
        name: newFormatName.trim(),
        portions,
        price,
        isActive: true,
        sortOrder: existing.length,
      });
      setFormatsByProduct((prev) => ({
        ...prev,
        [newFormatProductId]: [...(prev[newFormatProductId] ?? []), fmt],
      }));
      setNewFormatProductId(null);
      setNewFormatName('');
      setNewFormatPortions('1');
      setNewFormatPrice('');
      showSuccess('Formato creado');
    } catch {
      showError('Error creando formato');
    } finally {
      setSavingFormat(false);
    }
  };

  const supplyMap = new Map(supplies.map((s) => [s.id, s]));
  const supplyOptions: SelectOption[] = supplies.map((s) => ({ value: s.id, label: s.name }));

  const handleStartEditRecipe = (productId: string) => {
    const recipe = recipesByProduct[productId];
    setEditingRecipeProductId(productId);
    setEditIngredients(
      (recipe?.ingredients ?? []).map((i) => ({
        supplyId: i.supplyId,
        gramsPerPortion: String(i.gramsPerPortion),
      })),
    );
  };

  const handleCancelEditRecipe = () => {
    setEditingRecipeProductId(null);
    setEditIngredients([]);
  };

  const handleAddIngredient = (supplyId: string) => {
    if (editIngredients.some((i) => i.supplyId === supplyId)) {
      showError('Ese insumo ya está en la receta');
      return;
    }
    setEditIngredients((prev) => [...prev, { supplyId, gramsPerPortion: '0' }]);
  };

  const handleRemoveIngredient = (index: number) => {
    setEditIngredients((prev) => prev.filter((_, i) => i !== index));
  };

  const handleGramsChange = (index: number, value: string) => {
    setEditIngredients((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], gramsPerPortion: value };
      return updated;
    });
  };

  const handleSaveRecipe = async (productId: string) => {
    const recipe = recipesByProduct[productId];
    if (!recipe) { showError('No se encontró la receta'); return; }

    const parsed = editIngredients.map((i) => ({
      supplyId: i.supplyId,
      gramsPerPortion: parseFloat(i.gramsPerPortion),
    }));
    if (parsed.some((p) => isNaN(p.gramsPerPortion) || p.gramsPerPortion <= 0)) {
      showError('Todos los gramajes deben ser números positivos');
      return;
    }

    setSavingRecipe(true);
    try {
      await recipeRepo.updateIngredients(recipe.id, parsed);
      // Actualizar receta local
      const updatedRecipe: Recipe = { ...recipe, ingredients: parsed };
      setRecipesByProduct((prev) => ({ ...prev, [productId]: updatedRecipe }));
      // Actualizar badge
      setRecipeStatus((prev) => ({
        ...prev,
        [productId]: parsed.length === 0 ? 'empty' : 'ok',
      }));
      handleCancelEditRecipe();
      showSuccess('Receta guardada');
    } catch {
      showError('Error guardando receta');
    } finally {
      setSavingRecipe(false);
    }
  };

  const filteredProducts = products.filter((p) => p.category === tab);

  if (loading) return <LoadingIndicator message="Cargando productos..." />;

  return (
    <ScreenContainer scrollable padded>
      <View style={styles.headerRow}>
        <Text variant="titleMedium" style={{ color: theme.colors.onBackground, fontWeight: '600' }}>
          Catálogo de Productos
        </Text>
        <Button
          mode="contained"
          icon="plus"
          onPress={() => setNewProductVisible(true)}
          buttonColor="#E63946"
          compact
        >
          Nuevo
        </Button>
      </View>

      <SegmentedButtons
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
        buttons={[
          { value: 'PIZZA', label: 'Pizzas' },
          { value: 'BEBIDA', label: 'Bebidas' },
          { value: 'OTRO', label: 'Otros' },
        ]}
        style={{ marginBottom: 16 }}
      />

      {filteredProducts.length === 0 && (
        <Text variant="bodyMedium" style={{ color: '#666', textAlign: 'center', marginTop: 20 }}>
          Sin productos en esta categoría
        </Text>
      )}

      {filteredProducts.map((product) => {
        const isExpanded = expandedId === product.id;
        const formats = formatsByProduct[product.id] ?? [];
        const assignments = assignmentsByProduct[product.id] ?? new Set<string>();

        return (
          <Card
            key={product.id}
            style={[styles.card, { backgroundColor: '#1E1E1E', opacity: product.isActive ? 1 : 0.5 }]}
          >
            <Card.Content>
              {/* Header */}
              <View style={styles.productHeader}>
                <View style={{ flex: 1 }}>
                  <Text variant="titleSmall" style={{ color: '#F5F0EB', fontWeight: '600' }}>
                    {product.name}
                  </Text>
                  {!product.isActive && (
                    <Text variant="labelSmall" style={{ color: '#666', fontSize: 10 }}>
                      Inactivo en todos los locales
                    </Text>
                  )}
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                    <Chip compact style={{ backgroundColor: '#2A2A2A' }} textStyle={{ color: '#999', fontSize: 11 }}>
                      {CATEGORY_LABELS[product.category]}
                    </Chip>
                    {product.hasRecipe && recipeStatus[product.id] === 'ok' && (
                      <Chip compact icon="book-open-variant" style={{ backgroundColor: '#1A3A5C' }} textStyle={{ color: '#64B5F6', fontSize: 11 }}>
                        Receta
                      </Chip>
                    )}
                    {product.hasRecipe && (recipeStatus[product.id] === 'empty' || recipeStatus[product.id] === 'missing') && (
                      <Chip compact icon="alert" style={{ backgroundColor: '#3A2A00' }} textStyle={{ color: '#FFB300', fontSize: 11 }}>
                        Sin insumos
                      </Chip>
                    )}
                    {!product.isActive && (
                      <Chip compact style={{ backgroundColor: '#3A1A1A' }} textStyle={{ color: '#E63946', fontSize: 11 }}>
                        Inactivo
                      </Chip>
                    )}
                  </View>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Switch
                    value={product.isActive}
                    onValueChange={() => handleToggleActive(product)}
                    color="#E63946"
                  />
                  <Text variant="labelSmall" style={{ color: '#555', fontSize: 9 }}>
                    Global
                  </Text>
                </View>
                <IconButton
                  icon={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  iconColor="#999"
                  onPress={() => handleExpand(product.id)}
                  style={{ margin: 0 }}
                />
              </View>

              {isExpanded && (
                <>
                  <Divider style={{ backgroundColor: '#333', marginVertical: 12 }} />

                  {/* Formatos */}
                  <View style={styles.sectionHeader}>
                    <Text variant="bodyMedium" style={{ color: '#F5F0EB', fontWeight: '600' }}>
                      Formatos
                    </Text>
                    <Button
                      mode="text"
                      icon="plus"
                      compact
                      textColor="#E63946"
                      onPress={() => {
                        setNewFormatProductId(product.id);
                        setNewFormatName('');
                        setNewFormatPortions('1');
                        setNewFormatPrice('');
                      }}
                    >
                      Agregar
                    </Button>
                  </View>

                  {formats.length === 0 && (
                    <Text variant="bodySmall" style={{ color: '#666', marginBottom: 8 }}>
                      Sin formatos. Agrega al menos uno para vender este producto.
                    </Text>
                  )}

                  {formats.map((fmt) => {
                    const isEditingFmt = editingFormatId === fmt.id;
                    if (isEditingFmt) {
                      return (
                        <View key={fmt.id} style={[styles.formatRow, { flexDirection: 'column', alignItems: 'stretch', paddingVertical: 8 }]}>
                          <TextInput
                            label="Nombre"
                            value={editFormatName}
                            onChangeText={setEditFormatName}
                            mode="outlined"
                            dense
                            outlineColor="#333"
                            activeOutlineColor="#E63946"
                            textColor="#F5F0EB"
                            style={[styles.modalInput, { marginBottom: 6 }]}
                          />
                          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
                            <TextInput
                              label="Porciones"
                              value={editFormatPortions}
                              onChangeText={setEditFormatPortions}
                              keyboardType="numeric"
                              mode="outlined"
                              dense
                              outlineColor="#333"
                              activeOutlineColor="#E63946"
                              textColor="#F5F0EB"
                              style={[styles.modalInput, { flex: 1, marginBottom: 0 }]}
                            />
                            <TextInput
                              label="Precio (COP)"
                              value={editFormatPrice}
                              onChangeText={setEditFormatPrice}
                              keyboardType="numeric"
                              mode="outlined"
                              dense
                              outlineColor="#333"
                              activeOutlineColor="#E63946"
                              textColor="#F5F0EB"
                              style={[styles.modalInput, { flex: 1, marginBottom: 0 }]}
                            />
                          </View>
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <Button mode="outlined" compact onPress={handleCancelEditFormat} style={{ flex: 1 }}>
                              Cancelar
                            </Button>
                            <Button
                              mode="contained"
                              compact
                              buttonColor="#E63946"
                              loading={savingFormatEdit}
                              disabled={savingFormatEdit}
                              onPress={() => handleSaveFormat(product.id, fmt.id)}
                              style={{ flex: 1 }}
                            >
                              Guardar
                            </Button>
                          </View>
                        </View>
                      );
                    }
                    return (
                      <View key={fmt.id} style={styles.formatRow}>
                        <View style={{ flex: 1 }}>
                          <Text variant="bodySmall" style={{ color: '#F5F0EB' }}>
                            {fmt.name}
                          </Text>
                          <Text variant="labelSmall" style={{ color: '#999' }}>
                            {fmt.portions} porc. · ${fmt.price.toLocaleString('es-CO')}
                          </Text>
                        </View>
                        <Switch
                          value={fmt.isActive}
                          onValueChange={() => handleToggleFormatActive(product.id, fmt)}
                          color="#4CAF50"
                        />
                        <IconButton
                          icon="pencil-outline"
                          size={18}
                          iconColor="#D4A843"
                          onPress={() => handleStartEditFormat(fmt)}
                          style={{ margin: 0 }}
                        />
                        <View style={styles.formatActionDivider} />
                        <IconButton
                          icon="delete-outline"
                          size={18}
                          iconColor="#E63946"
                          onPress={() => handleDeleteFormat(product.id, fmt.id, fmt.name)}
                          style={{ margin: 0 }}
                        />
                      </View>
                    );
                  })}

                  <Divider style={{ backgroundColor: '#333', marginVertical: 12 }} />

                  {/* Disponibilidad por sede */}
                  <Text variant="bodyMedium" style={{ color: '#F5F0EB', fontWeight: '600', marginBottom: 8 }}>
                    Disponibilidad por sede
                  </Text>
                  {stores.map((store) => (
                    <View key={store.id} style={styles.storeRow}>
                      <Text variant="bodySmall" style={{ color: '#F5F0EB', flex: 1 }} numberOfLines={1}>
                        {store.name}
                      </Text>
                      <Switch
                        value={assignments.has(store.id)}
                        onValueChange={() => handleToggleStoreAssignment(product.id, store.id)}
                        color="#4CAF50"
                      />
                    </View>
                  ))}

                  {/* Receta (solo si hasRecipe) */}
                  {product.hasRecipe && (() => {
                    const recipe = recipesByProduct[product.id];
                    const isEditingRecipe = editingRecipeProductId === product.id;

                    return (
                      <>
                        <Divider style={{ backgroundColor: '#333', marginVertical: 12 }} />
                        <View style={styles.sectionHeader}>
                          <Text variant="bodyMedium" style={{ color: '#F5F0EB', fontWeight: '600' }}>
                            Receta (por porción)
                          </Text>
                          {!isEditingRecipe && (
                            <Button
                              mode="text"
                              icon="pencil"
                              compact
                              textColor="#D4A843"
                              onPress={() => handleStartEditRecipe(product.id)}
                            >
                              Editar
                            </Button>
                          )}
                        </View>

                        {!recipe && (
                          <Text variant="bodySmall" style={{ color: '#666', marginBottom: 8 }}>
                            Sin receta registrada.
                          </Text>
                        )}

                        {recipe && !isEditingRecipe && (
                          recipe.ingredients.length === 0
                            ? <Text variant="bodySmall" style={{ color: '#FFB300', marginBottom: 4 }}>Sin insumos — agrega ingredientes.</Text>
                            : recipe.ingredients.map((ing) => (
                                <Text key={ing.supplyId} variant="bodySmall" style={{ color: '#F5F0EB', marginVertical: 2 }}>
                                  · {supplyMap.get(ing.supplyId)?.name ?? ing.supplyId}: {ing.gramsPerPortion}g
                                </Text>
                              ))
                        )}

                        {isEditingRecipe && (
                          <>
                            {editIngredients.map((ing, idx) => (
                              <View key={ing.supplyId} style={styles.ingredientRow}>
                                <Text variant="bodySmall" style={{ flex: 1, color: '#F5F0EB' }} numberOfLines={1}>
                                  {supplyMap.get(ing.supplyId)?.name ?? ing.supplyId}
                                </Text>
                                <TextInput
                                  mode="outlined"
                                  dense
                                  keyboardType="decimal-pad"
                                  value={ing.gramsPerPortion}
                                  onChangeText={(v) => handleGramsChange(idx, v)}
                                  style={styles.gramsInput}
                                  outlineColor="#333"
                                  activeOutlineColor="#E63946"
                                  textColor="#F5F0EB"
                                  right={<TextInput.Affix text="g" textStyle={{ color: '#999' }} />}
                                />
                                <IconButton
                                  icon="close-circle"
                                  size={16}
                                  iconColor="#E63946"
                                  onPress={() => handleRemoveIngredient(idx)}
                                  style={{ margin: 0 }}
                                />
                              </View>
                            ))}

                            <SearchableSelect
                              options={supplyOptions.filter((o) => !editIngredients.some((i) => i.supplyId === o.value))}
                              placeholder="+ Agregar insumo..."
                              icon="plus"
                              onSelect={handleAddIngredient}
                            />

                            <View style={[styles.sectionHeader, { marginTop: 12 }]}>
                              <Button mode="outlined" compact onPress={handleCancelEditRecipe} style={{ flex: 1, marginRight: 8 }}>
                                Cancelar
                              </Button>
                              <Button
                                mode="contained"
                                compact
                                buttonColor="#E63946"
                                loading={savingRecipe}
                                disabled={savingRecipe}
                                onPress={() => handleSaveRecipe(product.id)}
                                style={{ flex: 1 }}
                              >
                                Guardar
                              </Button>
                            </View>
                          </>
                        )}
                      </>
                    );
                  })()}
                </>
              )}
            </Card.Content>
          </Card>
        );
      })}

      <View style={{ height: 100 }} />

      {/* Modal nuevo producto */}
      <Portal>
        <Modal
          visible={newProductVisible}
          onDismiss={() => setNewProductVisible(false)}
          contentContainerStyle={[styles.modal, { backgroundColor: '#1E1E1E' }]}
        >
          <Text variant="titleMedium" style={{ color: '#F5F0EB', fontWeight: '600', marginBottom: 16 }}>
            Nuevo Producto
          </Text>

          <TextInput
            label="Nombre"
            value={newName}
            onChangeText={setNewName}
            mode="outlined"
            outlineColor="#333"
            activeOutlineColor="#E63946"
            textColor="#F5F0EB"
            style={styles.modalInput}
          />

          <Text variant="bodySmall" style={{ color: '#999', marginBottom: 6, marginTop: 8 }}>
            Categoría
          </Text>
          <SegmentedButtons
            value={newCategory}
            onValueChange={(v) => {
              const cat = v as ProductCategory;
              setNewCategory(cat);
              setNewHasRecipe(cat === 'PIZZA');
            }}
            buttons={[
              { value: 'PIZZA', label: 'Pizza' },
              { value: 'BEBIDA', label: 'Bebida' },
              { value: 'OTRO', label: 'Otro' },
            ]}
            style={{ marginBottom: 12 }}
          />

          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <Text variant="bodyMedium" style={{ color: '#F5F0EB', flex: 1 }}>
              Tiene receta (descuenta inventario STORE)
            </Text>
            <Switch value={newHasRecipe} onValueChange={setNewHasRecipe} color="#E63946" />
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button mode="outlined" onPress={() => setNewProductVisible(false)} style={{ flex: 1 }}>
              Cancelar
            </Button>
            <Button
              mode="contained"
              buttonColor="#E63946"
              onPress={handleCreateProduct}
              loading={saving}
              disabled={saving}
              style={{ flex: 1 }}
            >
              Crear
            </Button>
          </View>
        </Modal>

        {/* Modal nuevo formato */}
        <Modal
          visible={!!newFormatProductId}
          onDismiss={() => setNewFormatProductId(null)}
          contentContainerStyle={[styles.modal, { backgroundColor: '#1E1E1E' }]}
        >
          <Text variant="titleMedium" style={{ color: '#F5F0EB', fontWeight: '600', marginBottom: 16 }}>
            Nuevo Formato
          </Text>

          <TextInput
            label="Nombre (ej: Familiar, Único, Porción)"
            value={newFormatName}
            onChangeText={setNewFormatName}
            mode="outlined"
            outlineColor="#333"
            activeOutlineColor="#E63946"
            textColor="#F5F0EB"
            style={styles.modalInput}
          />
          <TextInput
            label="Porciones"
            value={newFormatPortions}
            onChangeText={setNewFormatPortions}
            keyboardType="numeric"
            mode="outlined"
            outlineColor="#333"
            activeOutlineColor="#E63946"
            textColor="#F5F0EB"
            style={styles.modalInput}
          />
          <TextInput
            label="Precio (COP)"
            value={newFormatPrice}
            onChangeText={setNewFormatPrice}
            keyboardType="numeric"
            mode="outlined"
            outlineColor="#333"
            activeOutlineColor="#E63946"
            textColor="#F5F0EB"
            style={styles.modalInput}
          />

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Button mode="outlined" onPress={() => setNewFormatProductId(null)} style={{ flex: 1 }}>
              Cancelar
            </Button>
            <Button
              mode="contained"
              buttonColor="#E63946"
              onPress={handleCreateFormat}
              loading={savingFormat}
              disabled={savingFormat}
              style={{ flex: 1 }}
            >
              Crear
            </Button>
          </View>
        </Modal>

        <Dialog
          visible={!!deleteConfirm}
          onDismiss={() => setDeleteConfirm(null)}
          style={{ backgroundColor: '#1E1E1E', borderRadius: 12 }}
        >
          <Dialog.Title style={{ color: '#F5F0EB' }}>Eliminar formato</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={{ color: '#CCCCCC' }}>
              ¿Eliminar "{deleteConfirm?.name}"? Esta acción no se puede deshacer.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button textColor="#E63946" onPress={handleConfirmDelete}>Eliminar</Button>
          </Dialog.Actions>
        </Dialog>

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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  card: {
    marginBottom: 10,
    borderRadius: 12,
  },
  productHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  formatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2A2A2A',
  },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2A2A2A',
  },
  modal: {
    margin: 20,
    borderRadius: 12,
    padding: 20,
  },
  modalInput: {
    backgroundColor: '#111',
    marginBottom: 8,
  },
  formatActionDivider: {
    width: 1,
    height: 16,
    backgroundColor: '#333',
    marginHorizontal: 2,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  gramsInput: {
    width: 95,
    backgroundColor: '#111111',
  },
});
