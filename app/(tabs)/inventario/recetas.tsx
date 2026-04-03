import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Card, Text, TextInput, Button, Divider, Snackbar, Portal, useTheme } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { useDI } from '../../../src/di/providers';
import { useSnackbar } from '../../../src/hooks';
import { Product } from '../../../src/domain/entities/Product';
import { Recipe } from '../../../src/domain/entities/Recipe';
import { Supply } from '../../../src/domain/entities/Supply';

interface EditableIngredient {
  supplyId: string;
  gramsPerPortion: string; // string for TextInput
}

interface RecipeCardState {
  recipe: Recipe;
  product: Product;
  ingredients: EditableIngredient[];
  originalIngredients: EditableIngredient[];
  saving: boolean;
}

export default function RecetasScreen() {
  const theme = useTheme();
  const { recipeRepo, productRepo, supplyRepo } = useDI();

  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<RecipeCardState[]>([]);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [allProducts, allRecipes, allSupplies] = await Promise.all([
        productRepo.getAll(),
        recipeRepo.getAll(),
        supplyRepo.getAll(),
      ]);

      setSupplies(allSupplies);

      const pizzaProducts = allProducts.filter((p) => p.category === 'PIZZA' && p.isActive);
      const recipeByProductId = new Map(allRecipes.map((r) => [r.productId, r]));

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
            originalIngredients: ings.map((i) => ({ ...i })),
            saving: false,
          };
        });

      setCards(cardStates);
    } catch {
      showError('Error al cargar recetas');
    } finally {
      setLoading(false);
    }
  }, [recipeRepo, productRepo, supplyRepo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const supplyMap = new Map(supplies.map((s) => [s.id, s]));

  const handleGramsChange = (cardIndex: number, ingredientIndex: number, value: string) => {
    setCards((prev) => {
      const updated = [...prev];
      const card = { ...updated[cardIndex] };
      const ingredients = [...card.ingredients];
      ingredients[ingredientIndex] = { ...ingredients[ingredientIndex], gramsPerPortion: value };
      card.ingredients = ingredients;
      updated[cardIndex] = card;
      return updated;
    });
  };

  const hasChanges = (card: RecipeCardState): boolean => {
    return card.ingredients.some(
      (ing, i) => ing.gramsPerPortion !== card.originalIngredients[i]?.gramsPerPortion,
    );
  };

  const handleSave = async (cardIndex: number) => {
    const card = cards[cardIndex];

    // Validate all values are valid numbers > 0
    const parsed = card.ingredients.map((ing) => ({
      supplyId: ing.supplyId,
      gramsPerPortion: parseFloat(ing.gramsPerPortion),
    }));

    const invalid = parsed.some((p) => isNaN(p.gramsPerPortion) || p.gramsPerPortion <= 0);
    if (invalid) {
      showError('Todos los gramajes deben ser numeros positivos');
      return;
    }

    setCards((prev) => {
      const updated = [...prev];
      updated[cardIndex] = { ...updated[cardIndex], saving: true };
      return updated;
    });

    try {
      await recipeRepo.updateIngredients(card.recipe.id, parsed);
      setCards((prev) => {
        const updated = [...prev];
        const current = updated[cardIndex];
        updated[cardIndex] = { ...current, originalIngredients: current.ingredients.map((i) => ({ ...i })) };
        return updated;
      });
      showSuccess(`Receta de ${card.product.name} guardada`);
    } catch {
      showError('Error al guardar receta');
    } finally {
      setCards((prev) => {
        const updated = [...prev];
        updated[cardIndex] = { ...updated[cardIndex], saving: false };
        return updated;
      });
    }
  };

  if (loading) {
    return <LoadingIndicator message="Cargando recetas..." />;
  }

  return (
    <ScreenContainer scrollable padded>
      <Text variant="titleMedium" style={[styles.title, { color: theme.colors.onBackground }]}>
        Editor de Recetas
      </Text>
      <Text variant="bodySmall" style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
        Modifica los gramajes por porcion de cada pizza
      </Text>

      {cards.map((card, cardIndex) => (
        <Card key={card.recipe.id} style={[styles.card, { backgroundColor: '#1E1E1E' }]}>
          <Card.Title
            title={card.product.name}
            titleStyle={{ color: '#F5F0EB', fontWeight: '600' }}
          />
          <Card.Content>
            {card.ingredients.map((ing, ingIndex) => {
              const supply = supplyMap.get(ing.supplyId);
              return (
                <View key={ing.supplyId}>
                  <View style={styles.ingredientRow}>
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
                      onChangeText={(v) => handleGramsChange(cardIndex, ingIndex, v)}
                      style={styles.gramsInput}
                      outlineColor="#333"
                      activeOutlineColor="#E63946"
                      textColor="#F5F0EB"
                      right={<TextInput.Affix text="g" textStyle={{ color: '#999' }} />}
                    />
                  </View>
                  {ingIndex < card.ingredients.length - 1 && (
                    <Divider style={styles.divider} />
                  )}
                </View>
              );
            })}
          </Card.Content>
          <Card.Actions style={styles.cardActions}>
            <Button
              mode="contained"
              onPress={() => handleSave(cardIndex)}
              loading={card.saving}
              disabled={card.saving || !hasChanges(card)}
              buttonColor="#E63946"
              textColor="#FFFFFF"
            >
              Guardar
            </Button>
          </Card.Actions>
        </Card>
      ))}

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
    marginBottom: 16,
    borderRadius: 12,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  supplyName: {
    flex: 1,
    marginRight: 12,
  },
  gramsInput: {
    width: 110,
    backgroundColor: '#111111',
  },
  divider: {
    backgroundColor: '#333',
  },
  cardActions: {
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  bottomPadding: {
    height: 100,
  },
});
