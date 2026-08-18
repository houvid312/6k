import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Card, Text, TextInput, Button, Divider, IconButton, Snackbar, Portal, useTheme } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { SearchableSelect, SelectOption } from '../../../src/components/common/SearchableSelect';
import { useDI } from '../../../src/di/providers';
import { useMasterDataStore } from '../../../src/stores/useMasterDataStore';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useSnackbar } from '../../../src/hooks';
import { Product } from '../../../src/domain/entities/Product';
import { Recipe } from '../../../src/domain/entities/Recipe';
import { ProductFormat } from '../../../src/domain/entities/ProductFormat';
import { InventoryLevel, UserRole } from '../../../src/domain/enums';

interface EditableIngredient {
  supplyId: string;
  gramsPerPortion: string;
}

interface RecipeCardState {
  recipe: Recipe;
  product: Product;
  ingredients: EditableIngredient[];
  formats: ProductFormat[];
}

export default function RecetasScreen() {
  const theme = useTheme();
  const { recipeRepo, inventoryService, productFormatRepo } = useDI();
  const { products: cachedProducts, supplies, refreshMasterData } = useMasterDataStore();
  const { selectedStoreId, userRole } = useAppStore();
  const isCanEditRecipe = userRole === UserRole.GERENTE || userRole === UserRole.RODY;

  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<RecipeCardState[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editIngredients, setEditIngredients] = useState<EditableIngredient[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [storeSupplyIds, setStoreSupplyIds] = useState<Set<string>>(new Set());
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();

  useEffect(() => {
    if (!isCanEditRecipe) {
      router.replace('/(tabs)/inventario');
      return;
    }
    refreshMasterData();
  }, [isCanEditRecipe, refreshMasterData]);

  // Cargar insumos disponibles en nivel STORE para el picker
  useEffect(() => {
    if (!selectedStoreId) return;
    (async () => {
      try {
        const summary = await inventoryService.getInventorySummary(selectedStoreId, InventoryLevel.STORE);
        setStoreSupplyIds(new Set(summary.map((s) => s.supplyId)));
      } catch {
        // fallback: show all supplies
        setStoreSupplyIds(new Set(supplies.map((s) => s.id)));
      }
    })();
  }, [selectedStoreId, inventoryService, supplies]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const pizzaProducts = cachedProducts.filter((p) => p.hasRecipe && p.isActive);
      const [allRecipes, allFormats] = await Promise.all([
        recipeRepo.getAll(),
        productFormatRepo.getByProductIds(pizzaProducts.map((p) => p.id)),
      ]);

      const recipeByProductId = new Map(allRecipes.map((r) => [r.productId, r]));
      const formatsByProductId = new Map<string, ProductFormat[]>();
      for (const f of allFormats) {
        const list = formatsByProductId.get(f.productId) ?? [];
        list.push(f);
        formatsByProductId.set(f.productId, list);
      }

      const cardStates: RecipeCardState[] = pizzaProducts
        .filter((p) => recipeByProductId.has(p.id))
        .map((product) => {
          const recipe = recipeByProductId.get(product.id)!;
          const ings = recipe.ingredients.map((ing) => ({
            supplyId: ing.supplyId,
            gramsPerPortion: String(ing.gramsPerPortion),
          }));
          return {
            recipe,
            product,
            ingredients: ings,
            formats: formatsByProductId.get(product.id) ?? [],
          };
        });

      setCards(cardStates);
    } catch {
      showError('Error al cargar recetas');
    } finally {
      setLoading(false);
    }
  }, [recipeRepo, productFormatRepo, cachedProducts]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const supplyMap = new Map(supplies.map((s) => [s.id, s]));

  // Opciones del picker: insumos activos STORE o todos los activos si la sede aún no los tiene registrados
  const activeSupplies = supplies.filter((s) => s.isActive !== false);
  const availableSupplies = storeSupplyIds.size > 0 
    ? activeSupplies.filter((s) => storeSupplyIds.has(s.id))
    : activeSupplies;

  const supplyOptions: SelectOption[] = (availableSupplies.length > 0 ? availableSupplies : activeSupplies)
    .map((s) => ({ value: s.id, label: s.name }));

  const startEditing = (card: RecipeCardState) => {
    setEditingId(card.recipe.id);
    setEditIngredients(card.ingredients.map((i) => ({ ...i })));
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditIngredients([]);
  };

  const handleGramsChange = (ingredientIndex: number, value: string) => {
    setEditIngredients((prev) => {
      const updated = [...prev];
      updated[ingredientIndex] = { ...updated[ingredientIndex], gramsPerPortion: value };
      return updated;
    });
  };

  const handleAddIngredient = (supplyId: string) => {
    // Prevent duplicates
    if (editIngredients.some((i) => i.supplyId === supplyId)) {
      showError('Ese insumo ya está en la receta');
      return;
    }
    setEditIngredients((prev) => [...prev, { supplyId, gramsPerPortion: '0' }]);
  };

  const handleRemoveIngredient = (index: number) => {
    setEditIngredients((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async (card: RecipeCardState) => {
    const parsed = editIngredients.map((ing) => ({
      supplyId: ing.supplyId,
      gramsPerPortion: parseFloat(ing.gramsPerPortion),
    }));

    const invalid = parsed.some((p) => isNaN(p.gramsPerPortion) || p.gramsPerPortion <= 0);
    if (invalid) {
      showError('Todos los gramajes deben ser números positivos');
      return;
    }

    setEditSaving(true);
    try {
      await recipeRepo.updateIngredients(card.recipe.id, parsed);
      showSuccess(`Receta de ${card.product.name} guardada`);
      cancelEditing();
      loadData();
    } catch {
      showError('Error al guardar receta');
    } finally {
      setEditSaving(false);
    }
  };

  if (loading) {
    return <LoadingIndicator message="Cargando recetas..." />;
  }

  const renderViewCard = (card: RecipeCardState) => (
    <Card key={card.recipe.id} style={[styles.card, { backgroundColor: '#1E1E1E' }]}>
      <Card.Content>
        <View style={styles.recipeHeader}>
          <View style={{ flex: 1 }}>
            <Text variant="titleSmall" style={{ color: '#F5F0EB', fontWeight: '600' }}>
              {card.product.name}
            </Text>
            <Text variant="bodySmall" style={{ color: '#999', marginTop: 2 }}>
              {card.ingredients.length} insumos por porción
            </Text>
          </View>
          {isCanEditRecipe && (
            <IconButton
              icon="pencil"
              size={20}
              iconColor="#D4A843"
              onPress={() => startEditing(card)}
            />
          )}
        </View>

        <Divider style={{ backgroundColor: '#333', marginVertical: 8 }} />

        {card.formats.length > 0 && (
          <View style={{ marginBottom: 10, padding: 10, backgroundColor: '#252525', borderRadius: 8 }}>
            <Text variant="labelMedium" style={{ color: '#D4A843', fontWeight: 'bold', marginBottom: 4 }}>
              🍞 Masas por Formato:
            </Text>
            {card.formats.map((fmt) => {
              const masaName = fmt.masaSupplyId ? (supplyMap.get(fmt.masaSupplyId)?.name ?? 'Masa') : 'Sin masa';
              return (
                <Text key={fmt.id} variant="bodySmall" style={{ color: '#CCCCCC', marginVertical: 2 }}>
                  • <Text style={{ fontWeight: '600', color: '#F5F0EB' }}>{fmt.name}</Text> ({fmt.portions} porc.): {fmt.masaGrams ?? 0}g ({masaName})
                </Text>
              );
            })}
          </View>
        )}

        <Text variant="bodySmall" style={{ color: '#999', marginBottom: 4, fontWeight: '600' }}>
          Ingredientes por porción (Salsas, Quesos, Carnes):
        </Text>
        {card.ingredients.map((ing) => {
          const supply = supplyMap.get(ing.supplyId);
          return (
            <Text key={ing.supplyId} variant="bodySmall" style={{ color: '#F5F0EB', marginVertical: 2 }}>
              - {supply?.name ?? ing.supplyId}: {ing.gramsPerPortion}g
            </Text>
          );
        })}
      </Card.Content>
    </Card>
  );

  const renderEditCard = (card: RecipeCardState) => (
    <Card key={card.recipe.id} style={[styles.card, { backgroundColor: '#1E1E1E', borderColor: '#E63946', borderWidth: 1 }]}>
      <Card.Content>
        <Text variant="titleSmall" style={{ color: '#E63946', fontWeight: '600', marginBottom: 12 }}>
          Editando: {card.product.name}
        </Text>

        <Divider style={{ backgroundColor: '#333', marginVertical: 8 }} />
        <Text variant="bodyMedium" style={{ color: '#F5F0EB', fontWeight: '600', marginBottom: 8 }}>
          Gramajes por porción:
        </Text>

        {editIngredients.map((ing, ingIndex) => {
          const supply = supplyMap.get(ing.supplyId);
          return (
            <View key={ing.supplyId} style={styles.ingredientRow}>
              <Text
                variant="bodyMedium"
                style={[styles.supplyName, { color: '#F5F0EB' }]}
                numberOfLines={1}
              >
                {supply?.name ?? ing.supplyId}
              </Text>
              <TextInput
                mode="outlined"
                dense
                keyboardType="decimal-pad"
                value={ing.gramsPerPortion}
                onChangeText={(v) => handleGramsChange(ingIndex, v)}
                style={styles.gramsInput}
                outlineColor="#333"
                activeOutlineColor="#E63946"
                textColor="#F5F0EB"
                right={<TextInput.Affix text="g" textStyle={{ color: '#999' }} />}
              />
              <IconButton
                icon="close-circle"
                size={18}
                iconColor="#E63946"
                onPress={() => handleRemoveIngredient(ingIndex)}
                style={{ margin: 0 }}
              />
            </View>
          );
        })}

        <Divider style={{ backgroundColor: '#333', marginVertical: 12 }} />
        <Text variant="bodySmall" style={{ color: '#999', marginBottom: 6 }}>
          Agregar insumo (nivel STORE):
        </Text>
        <SearchableSelect
          options={supplyOptions.filter((o) => !editIngredients.some((i) => i.supplyId === o.value))}
          placeholder="+ Agregar insumo..."
          icon="plus"
          onSelect={handleAddIngredient}
        />

        <View style={[styles.row, { marginTop: 16 }]}>
          <Button
            mode="outlined"
            onPress={cancelEditing}
            style={{ flex: 1, marginRight: 8 }}
          >
            Cancelar
          </Button>
          <Button
            mode="contained"
            onPress={() => handleSave(card)}
            loading={editSaving}
            disabled={editSaving}
            buttonColor="#E63946"
            style={{ flex: 1 }}
          >
            Guardar
          </Button>
        </View>
      </Card.Content>
    </Card>
  );

  return (
    <ScreenContainer scrollable padded>
      <Text variant="titleMedium" style={[styles.title, { color: theme.colors.onBackground }]}>
        Recetas de Productos
      </Text>
      <Text variant="bodySmall" style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
        Gramajes por porción · Agrega o quita insumos
      </Text>

      {cards.map((card) =>
        editingId === card.recipe.id
          ? renderEditCard(card)
          : renderViewCard(card),
      )}

      <View style={styles.bottomPadding} />

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
  title: {
    marginBottom: 4,
  },
  subtitle: {
    marginBottom: 16,
  },
  card: {
    marginBottom: 12,
    borderRadius: 12,
  },
  recipeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  supplyName: {
    flex: 1,
    marginRight: 8,
  },
  gramsInput: {
    width: 100,
    backgroundColor: '#111111',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bottomPadding: {
    height: 100,
  },
});
