import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, TextInput, Button, Portal, Snackbar, useTheme } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useMasterDataStore } from '../../../src/stores/useMasterDataStore';
import { useSnackbar } from '../../../src/hooks';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Lunes-Domingo

// key: "dayOfWeek-productId" -> portions string
type EstimateMap = Record<string, string>;

export default function DemandaScreen() {
  const theme = useTheme();
  const { demandEstimationService } = useDI();
  const { selectedStoreId } = useAppStore();
  const { products: cachedProducts } = useMasterDataStore();
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();

  const [products, setProducts] = useState(cachedProducts.filter((p) => p.hasRecipe && p.isActive));
  const [estimates, setEstimates] = useState<EstimateMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!selectedStoreId) return;
    setLoading(true);
    try {
      const allEstimates = await demandEstimationService.getAllEstimates(selectedStoreId);

      const pizzas = cachedProducts.filter((p) => p.hasRecipe && p.isActive);
      setProducts(pizzas);

      const map: EstimateMap = {};
      for (const e of allEstimates) {
        map[`${e.dayOfWeek}-${e.productId}`] = String(e.estimatedPortions);
      }
      setEstimates(map);
    } catch {
      showError('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, cachedProducts, demandEstimationService]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleChange = (dayOfWeek: number, productId: string, value: string) => {
    setEstimates((prev) => ({
      ...prev,
      [`${dayOfWeek}-${productId}`]: value,
    }));
  };

  const handleSave = useCallback(async () => {
    if (!selectedStoreId) return;

    const toSave = [];
    for (const day of DAY_ORDER) {
      for (const product of products) {
        const key = `${day}-${product.id}`;
        const portions = parseInt(estimates[key] ?? '0', 10);
        toSave.push({
          storeId: selectedStoreId,
          productId: product.id,
          dayOfWeek: day,
          estimatedPortions: isNaN(portions) ? 0 : portions,
        });
      }
    }

    setSaving(true);
    try {
      await demandEstimationService.saveEstimates(toSave);
      showSuccess('Demanda estimada guardada');
    } catch {
      showError('Error al guardar');
    } finally {
      setSaving(false);
    }
  }, [selectedStoreId, products, estimates, demandEstimationService, showSuccess, showError]);

  const getDayTotal = (day: number) => {
    return products.reduce((sum, p) => {
      const key = `${day}-${p.id}`;
      const val = parseInt(estimates[key] ?? '0', 10);
      return sum + (isNaN(val) ? 0 : Math.max(0, val));
    }, 0);
  };

  const weeklyTotal = useMemo(() => {
    return DAY_ORDER.reduce((total, day) => total + getDayTotal(day), 0);
  }, [estimates, products]);

  if (loading) {
    return <LoadingIndicator message="Cargando estimaciones..." />;
  }

  return (
    <ScreenContainer scrollable padded>
      <Text variant="titleMedium" style={[styles.title, { color: theme.colors.onBackground }]}>
        Demanda Estimada
      </Text>
      <Text variant="bodySmall" style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
        Porciones estimadas por pizza por dia de la semana
      </Text>

      <StoreSelector />

      {/* Resumen Semanal */}
      <Card style={[styles.card, { backgroundColor: '#1A2E1A', borderColor: '#4CAF50', borderWidth: 1, marginTop: 8 }]}>
        <Card.Content style={styles.weeklySummaryContent}>
          <View>
            <Text variant="titleSmall" style={{ color: '#4CAF50', fontWeight: 'bold' }}>
              PROYECCIÓN SEMANAL TOTAL
            </Text>
            <Text variant="bodySmall" style={{ color: '#C8E6C9' }}>
              Suma de todas las porciones estimadas en la semana
            </Text>
          </View>
          <View style={styles.weeklyBadge}>
            <Text variant="headlineSmall" style={{ color: '#FFF', fontWeight: 'bold' }}>
              {weeklyTotal}
            </Text>
            <Text variant="bodySmall" style={{ color: '#C8E6C9', fontSize: 11 }}>
              porciones
            </Text>
          </View>
        </Card.Content>
      </Card>

      {DAY_ORDER.map((day) => {
        const dayTotal = getDayTotal(day);
        return (
          <Card key={day} style={[styles.card, { backgroundColor: '#1E1E1E' }]}>
            <Card.Content>
              <View style={styles.dayHeader}>
                <Text variant="titleSmall" style={{ color: '#F5F0EB', fontWeight: 'bold' }}>
                  {DAY_NAMES[day]}
                </Text>
                <View style={[styles.dayBadge, { backgroundColor: dayTotal > 0 ? '#E63946' : '#333' }]}>
                  <Text variant="bodySmall" style={{ color: '#FFF', fontWeight: '600' }}>
                    {dayTotal} porciones
                  </Text>
                </View>
              </View>
              {products.map((product) => {
                const key = `${day}-${product.id}`;
                return (
                  <View key={product.id} style={styles.estimateRow}>
                    <Text
                      variant="bodyMedium"
                      style={{ color: '#F5F0EB', flex: 1 }}
                      numberOfLines={1}
                    >
                      {product.name}
                    </Text>
                    <TextInput
                      mode="outlined"
                      dense
                      keyboardType="numeric"
                      value={estimates[key] ?? '0'}
                      onChangeText={(v) => handleChange(day, product.id, v)}
                      style={styles.portionInput}
                      outlineColor="#333"
                      activeOutlineColor="#E63946"
                      textColor="#F5F0EB"
                    />
                  </View>
                );
              })}
            </Card.Content>
          </Card>
        );
      })}

      <Button
        mode="contained"
        onPress={handleSave}
        loading={saving}
        disabled={saving}
        icon="content-save"
        style={styles.saveBtn}
        buttonColor="#E63946"
      >
        Guardar Todo ({weeklyTotal} porciones)
      </Button>

      <View style={{ height: 100 }} />

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
    marginTop: 16,
    marginBottom: 4,
  },
  subtitle: {
    marginBottom: 16,
  },
  card: {
    marginBottom: 12,
    borderRadius: 12,
  },
  weeklySummaryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  weeklyBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2E7D32',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 10,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  dayBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  estimateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  portionInput: {
    width: 80,
    backgroundColor: '#111',
  },
  saveBtn: {
    marginTop: 16,
    borderRadius: 8,
    paddingVertical: 4,
  },
});
