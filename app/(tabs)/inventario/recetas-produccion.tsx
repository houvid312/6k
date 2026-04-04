import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, TextInput, Button, Divider, IconButton, Portal, Snackbar, useTheme } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { SearchableSelect } from '../../../src/components/common/SearchableSelect';
import { useDI } from '../../../src/di/providers';
import { useMasterDataStore } from '../../../src/stores/useMasterDataStore';
import { useSnackbar } from '../../../src/hooks';
import { ProductionRecipe } from '../../../src/domain/entities';

interface EditableInput {
  supplyId: string;
  gramsRequired: string;
}

interface NewRecipeForm {
  name: string;
  supplyId: string;
  outputGrams: string;
  outputBags: string;
  inputs: EditableInput[];
}

interface EditState {
  name: string;
  outputGrams: string;
  outputBags: string;
  inputs: EditableInput[];
}

const EMPTY_FORM: NewRecipeForm = {
  name: '',
  supplyId: '',
  outputGrams: '',
  outputBags: '1',
  inputs: [],
};

export default function RecetasProduccionScreen() {
  const theme = useTheme();
  const { productionRecipeRepo } = useDI();
  const { supplies } = useMasterDataStore();
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();

  const [recipes, setRecipes] = useState<ProductionRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewRecipeForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const supplySelectOptions = supplies.map((s) => ({ value: s.id, label: s.name, subtitle: `${s.gramsPerBag}g/bolsa` }));

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const allRecipes = await productionRecipeRepo.getAll();
      setRecipes(allRecipes);
    } catch {
      showError('Error al cargar recetas');
    } finally {
      setLoading(false);
    }
  }, [productionRecipeRepo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const supplyMap = new Map(supplies.map((s) => [s.id, s]));

  // --- Create handlers ---
  const handleAddInput = () => {
    setForm((prev) => ({
      ...prev,
      inputs: [...prev.inputs, { supplyId: '', gramsRequired: '' }],
    }));
  };

  const handleRemoveInput = (index: number) => {
    setForm((prev) => ({
      ...prev,
      inputs: prev.inputs.filter((_, i) => i !== index),
    }));
  };

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) { showError('Ingresa un nombre'); return; }
    if (!form.supplyId) { showError('Selecciona el insumo producido'); return; }
    const outputGrams = parseFloat(form.outputGrams);
    const outputBags = parseInt(form.outputBags, 10);
    if (isNaN(outputGrams) || outputGrams <= 0) { showError('Gramos invalidos'); return; }
    if (isNaN(outputBags) || outputBags <= 0) { showError('Bolsas invalidas'); return; }
    const parsedInputs = form.inputs.map((i) => ({
      supplyId: i.supplyId,
      gramsRequired: parseFloat(i.gramsRequired),
    }));
    if (parsedInputs.some((i) => !i.supplyId || isNaN(i.gramsRequired) || i.gramsRequired <= 0)) {
      showError('Insumos de entrada invalidos'); return;
    }

    setSaving(true);
    try {
      await productionRecipeRepo.create({
        supplyId: form.supplyId,
        name: form.name.trim(),
        outputGrams,
        outputBags,
        isActive: true,
        inputs: parsedInputs,
      });
      showSuccess('Receta creada');
      setForm(EMPTY_FORM);
      setShowForm(false);
      loadData();
    } catch {
      showError('Error al guardar receta');
    } finally {
      setSaving(false);
    }
  }, [form, productionRecipeRepo, loadData, showSuccess, showError]);

  // --- Edit handlers ---
  const startEditing = (recipe: ProductionRecipe) => {
    setEditingId(recipe.id);
    setEditState({
      name: recipe.name,
      outputGrams: String(recipe.outputGrams),
      outputBags: String(recipe.outputBags),
      inputs: recipe.inputs.map((i) => ({
        supplyId: i.supplyId,
        gramsRequired: String(i.gramsRequired),
      })),
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditState(null);
  };

  const handleEditAddInput = () => {
    setEditState((prev) => prev ? {
      ...prev,
      inputs: [...prev.inputs, { supplyId: '', gramsRequired: '' }],
    } : prev);
  };

  const handleEditRemoveInput = (index: number) => {
    setEditState((prev) => prev ? {
      ...prev,
      inputs: prev.inputs.filter((_, i) => i !== index),
    } : prev);
  };

  const handleEditSave = useCallback(async () => {
    if (!editingId || !editState) return;
    if (!editState.name.trim()) { showError('Ingresa un nombre'); return; }
    const outputGrams = parseFloat(editState.outputGrams);
    const outputBags = parseInt(editState.outputBags, 10);
    if (isNaN(outputGrams) || outputGrams <= 0) { showError('Gramos invalidos'); return; }
    if (isNaN(outputBags) || outputBags <= 0) { showError('Bolsas invalidas'); return; }
    const parsedInputs = editState.inputs.map((i) => ({
      supplyId: i.supplyId,
      gramsRequired: parseFloat(i.gramsRequired),
    }));
    if (parsedInputs.some((i) => !i.supplyId || isNaN(i.gramsRequired) || i.gramsRequired <= 0)) {
      showError('Insumos de entrada invalidos'); return;
    }

    setEditSaving(true);
    try {
      await productionRecipeRepo.update(editingId, {
        name: editState.name.trim(),
        outputGrams,
        outputBags,
      });
      await productionRecipeRepo.updateInputs(editingId, parsedInputs);
      showSuccess('Receta actualizada');
      cancelEditing();
      loadData();
    } catch {
      showError('Error al guardar cambios');
    } finally {
      setEditSaving(false);
    }
  }, [editingId, editState, productionRecipeRepo, loadData, showSuccess, showError]);

  const handleToggleActive = useCallback(async (recipe: ProductionRecipe) => {
    try {
      await productionRecipeRepo.update(recipe.id, { isActive: !recipe.isActive });
      loadData();
    } catch {
      showError('Error al actualizar receta');
    }
  }, [productionRecipeRepo, loadData, showError]);

  if (loading) {
    return <LoadingIndicator message="Cargando recetas de produccion..." />;
  }

  const renderEditCard = (recipe: ProductionRecipe) => (
    <Card key={recipe.id} style={[styles.card, { backgroundColor: '#1E1E1E', borderColor: '#E63946', borderWidth: 1 }]}>
      <Card.Content>
        <Text variant="titleSmall" style={{ color: '#E63946', fontWeight: '600', marginBottom: 12 }}>
          Editando: {recipe.name}
        </Text>

        <TextInput
          label="Nombre"
          value={editState!.name}
          onChangeText={(v) => setEditState((p) => p ? { ...p, name: v } : p)}
          mode="outlined"
          dense
          style={styles.input}
          outlineColor="#333"
          activeOutlineColor="#E63946"
          textColor="#F5F0EB"
        />

        <View style={styles.row}>
          <TextInput
            label="Gramos producidos"
            value={editState!.outputGrams}
            onChangeText={(v) => setEditState((p) => p ? { ...p, outputGrams: v } : p)}
            keyboardType="decimal-pad"
            mode="outlined"
            dense
            style={[styles.input, { flex: 1, marginRight: 8 }]}
            outlineColor="#333"
            activeOutlineColor="#E63946"
            textColor="#F5F0EB"
            right={<TextInput.Affix text="g" textStyle={{ color: '#999' }} />}
          />
          <TextInput
            label="Bolsas"
            value={editState!.outputBags}
            onChangeText={(v) => setEditState((p) => p ? { ...p, outputBags: v } : p)}
            keyboardType="numeric"
            mode="outlined"
            dense
            style={[styles.input, { width: 100 }]}
            outlineColor="#333"
            activeOutlineColor="#E63946"
            textColor="#F5F0EB"
          />
        </View>

        <Divider style={{ backgroundColor: '#333', marginVertical: 12 }} />
        <Text variant="bodyMedium" style={{ color: '#F5F0EB', fontWeight: '600', marginBottom: 8 }}>
          Insumos consumidos por lote:
        </Text>

        {editState!.inputs.map((input, idx) => (
          <View key={idx} style={styles.inputRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <SearchableSelect
                options={supplySelectOptions}
                selectedValue={input.supplyId}
                placeholder="Seleccionar insumo"
                onSelect={(v) => {
                  setEditState((prev) => {
                    if (!prev) return prev;
                    const inputs = [...prev.inputs];
                    inputs[idx] = { ...inputs[idx], supplyId: v };
                    return { ...prev, inputs };
                  });
                }}
              />
            </View>
            <TextInput
              mode="outlined"
              dense
              keyboardType="decimal-pad"
              value={input.gramsRequired}
              onChangeText={(v) => {
                setEditState((prev) => {
                  if (!prev) return prev;
                  const inputs = [...prev.inputs];
                  inputs[idx] = { ...inputs[idx], gramsRequired: v };
                  return { ...prev, inputs };
                });
              }}
              style={{ width: 110, backgroundColor: '#111' }}
              outlineColor="#333"
              activeOutlineColor="#E63946"
              textColor="#F5F0EB"
              right={<TextInput.Affix text="g" textStyle={{ color: '#999' }} />}
            />
            <IconButton
              icon="close"
              size={18}
              iconColor="#E63946"
              onPress={() => handleEditRemoveInput(idx)}
            />
          </View>
        ))}

        <Button mode="text" icon="plus" onPress={handleEditAddInput} textColor="#E63946" compact>
          Agregar insumo
        </Button>

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
            onPress={handleEditSave}
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

  const renderViewCard = (recipe: ProductionRecipe) => (
    <Card
      key={recipe.id}
      style={[styles.card, { backgroundColor: '#1E1E1E', opacity: recipe.isActive ? 1 : 0.5 }]}
    >
      <Card.Content>
        <View style={styles.recipeHeader}>
          <View style={{ flex: 1 }}>
            <Text variant="titleSmall" style={{ color: '#F5F0EB', fontWeight: '600' }}>
              {recipe.name}
            </Text>
            <Text variant="bodySmall" style={{ color: '#999', marginTop: 2 }}>
              Produce: {supplyMap.get(recipe.supplyId)?.name ?? 'Desconocido'}
            </Text>
            <Text variant="bodySmall" style={{ color: '#999' }}>
              {recipe.outputBags} bolsa(s) x {Math.round(recipe.outputGrams / recipe.outputBags)}g = {recipe.outputGrams}g por lote
            </Text>
          </View>
          <IconButton
            icon="pencil"
            size={20}
            iconColor="#D4A843"
            onPress={() => startEditing(recipe)}
          />
          <IconButton
            icon={recipe.isActive ? 'eye' : 'eye-off'}
            size={20}
            iconColor={recipe.isActive ? '#4CAF50' : '#999'}
            onPress={() => handleToggleActive(recipe)}
          />
        </View>

        {recipe.inputs.length > 0 && (
          <>
            <Divider style={{ backgroundColor: '#333', marginVertical: 8 }} />
            <Text variant="bodySmall" style={{ color: '#999', marginBottom: 4 }}>
              Consume por lote:
            </Text>
            {recipe.inputs.map((input) => (
              <Text key={input.supplyId} variant="bodySmall" style={{ color: '#F5F0EB' }}>
                - {supplyMap.get(input.supplyId)?.name ?? input.supplyId}: {input.gramsRequired}g
              </Text>
            ))}
          </>
        )}
      </Card.Content>
    </Card>
  );

  return (
    <ScreenContainer scrollable padded>
      <Text variant="titleMedium" style={[styles.title, { color: theme.colors.onBackground }]}>
        Recetas de Produccion
      </Text>
      <Text variant="bodySmall" style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
        Plantillas de conversion materia prima a procesado
      </Text>

      {!showForm && !editingId && (
        <Button
          mode="contained"
          icon="plus"
          onPress={() => setShowForm(true)}
          style={styles.addBtn}
          buttonColor="#E63946"
        >
          Nueva Receta
        </Button>
      )}

      {showForm && (
        <Card style={[styles.card, { backgroundColor: '#1E1E1E' }]}>
          <Card.Content>
            <Text variant="titleSmall" style={{ color: '#F5F0EB', fontWeight: '600', marginBottom: 12 }}>
              Nueva Receta de Produccion
            </Text>

            <TextInput
              label="Nombre de la receta"
              value={form.name}
              onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
              mode="outlined"
              dense
              style={styles.input}
              outlineColor="#333"
              activeOutlineColor="#E63946"
              textColor="#F5F0EB"
            />

            <SearchableSelect
              options={supplySelectOptions}
              selectedValue={form.supplyId}
              placeholder="Insumo producido"
              icon="package-variant"
              onSelect={(v) => setForm((p) => ({ ...p, supplyId: v }))}
            />

            <View style={styles.row}>
              <TextInput
                label="Gramos producidos"
                value={form.outputGrams}
                onChangeText={(v) => setForm((p) => ({ ...p, outputGrams: v }))}
                keyboardType="decimal-pad"
                mode="outlined"
                dense
                style={[styles.input, { flex: 1, marginRight: 8 }]}
                outlineColor="#333"
                activeOutlineColor="#E63946"
                textColor="#F5F0EB"
                right={<TextInput.Affix text="g" textStyle={{ color: '#999' }} />}
              />
              <TextInput
                label="Bolsas"
                value={form.outputBags}
                onChangeText={(v) => setForm((p) => ({ ...p, outputBags: v }))}
                keyboardType="numeric"
                mode="outlined"
                dense
                style={[styles.input, { width: 100 }]}
                outlineColor="#333"
                activeOutlineColor="#E63946"
                textColor="#F5F0EB"
              />
            </View>

            <Divider style={{ backgroundColor: '#333', marginVertical: 12 }} />
            <Text variant="bodyMedium" style={{ color: '#F5F0EB', fontWeight: '600', marginBottom: 8 }}>
              Insumos crudos consumidos por lote:
            </Text>

            {form.inputs.map((input, idx) => (
              <View key={idx} style={styles.inputRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <SearchableSelect
                    options={supplySelectOptions}
                    selectedValue={input.supplyId}
                    placeholder="Seleccionar insumo"
                    onSelect={(v) => {
                      setForm((prev) => {
                        const inputs = [...prev.inputs];
                        inputs[idx] = { ...inputs[idx], supplyId: v };
                        return { ...prev, inputs };
                      });
                    }}
                  />
                </View>
                <TextInput
                  mode="outlined"
                  dense
                  keyboardType="decimal-pad"
                  value={input.gramsRequired}
                  onChangeText={(v) => {
                    setForm((prev) => {
                      const inputs = [...prev.inputs];
                      inputs[idx] = { ...inputs[idx], gramsRequired: v };
                      return { ...prev, inputs };
                    });
                  }}
                  style={{ width: 110, backgroundColor: '#111' }}
                  outlineColor="#333"
                  activeOutlineColor="#E63946"
                  textColor="#F5F0EB"
                  right={<TextInput.Affix text="g" textStyle={{ color: '#999' }} />}
                />
                <IconButton
                  icon="close"
                  size={18}
                  iconColor="#E63946"
                  onPress={() => handleRemoveInput(idx)}
                />
              </View>
            ))}

            <Button mode="text" icon="plus" onPress={handleAddInput} textColor="#E63946" compact>
              Agregar insumo
            </Button>

            <View style={[styles.row, { marginTop: 16 }]}>
              <Button
                mode="outlined"
                onPress={() => { setForm(EMPTY_FORM); setShowForm(false); }}
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
                Guardar
              </Button>
            </View>
          </Card.Content>
        </Card>
      )}

      {recipes.length === 0 && !showForm ? (
        <EmptyState
          icon="book-open-variant"
          title="Sin recetas"
          subtitle="Crea tu primera receta de produccion"
        />
      ) : (
        recipes.map((recipe) =>
          editingId === recipe.id && editState
            ? renderEditCard(recipe)
            : renderViewCard(recipe),
        )
      )}

      <View style={{ height: 100 }} />

      <Portal>
        <Snackbar
          visible={snackbar.visible}
          onDismiss={hideSnackbar}
          duration={3000}
          style={{ backgroundColor: snackbar.error ? '#B71C1C' : '#4CAF50', marginBottom: 80 }}
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
  addBtn: {
    marginBottom: 16,
    borderRadius: 8,
  },
  card: {
    marginBottom: 12,
    borderRadius: 12,
  },
  input: {
    marginBottom: 8,
    backgroundColor: '#111',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  recipeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
