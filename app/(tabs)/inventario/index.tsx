import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { FlatList, View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Chip, Text, TextInput, useTheme, SegmentedButtons, Card, Button, Divider, Snackbar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { InventoryLevelCard } from '../../../src/components/inventario/InventoryLevelCard';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useMasterDataStore } from '../../../src/stores/useMasterDataStore';
import { useSnackbar } from '../../../src/hooks';
import { InventoryLevel, UserRole } from '../../../src/domain/enums';
import { InventorySummaryItem } from '../../../src/services/InventoryService';
import { supabase } from '../../../src/lib/supabase';

interface NavItem {
  icon: string;
  label: string;
  route: string;
}



const PRODUCTION_LEVEL_OPTIONS = [
  { value: InventoryLevel.RAW, label: 'Mat. Prima', icon: 'cube-outline' },
  { value: InventoryLevel.PROCESSED, label: 'Procesado', icon: 'cog-outline' },
];

const STORE_LEVEL_OPTIONS = [
  { value: InventoryLevel.STORE, label: 'Local', icon: 'store' },
];

export default function InventarioScreen() {
  const theme = useTheme();
  const { inventoryService, stockMinimumRepo } = useDI();
  const { selectedStoreId, stores, userRole } = useAppStore();
  const { supplies } = useMasterDataStore();
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();

  const isAdmin = userRole === UserRole.GERENTE || userRole === UserRole.ADMIN_LOCAL;
  const canManageRecipesAndSupplies = userRole === UserRole.GERENTE || userRole === UserRole.PREPARADOR;
  const isProductionCenter = stores.find((s) => s.id === selectedStoreId)?.isProductionCenter ?? false;

  const [level, setLevel] = useState<InventoryLevel>(
    isProductionCenter ? InventoryLevel.RAW : InventoryLevel.STORE
  );
  
  // Control de Pestañas: workflow (tablero de trabajo) o search (consulta de stock)
  const [activeTab, setActiveTab] = useState<'workflow' | 'search'>('workflow');

  // Datos para pestaña "Consulta"
  const [items, setItems] = useState<InventorySummaryItem[]>([]);
  const [minimums, setMinimums] = useState<Record<string, number>>({});

  // Datos para pestaña "Tablero de Trabajo (Workflow)"
  const [rawItems, setRawItems] = useState<InventorySummaryItem[]>([]);
  const [processedItems, setProcessedItems] = useState<InventorySummaryItem[]>([]);
  const [storeItems, setStoreItems] = useState<InventorySummaryItem[]>([]);
  const [workflowMinimums, setWorkflowMinimums] = useState<Record<string, number>>({});

  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const loadGenRef = useRef(0);

  const { loadStores } = useAppStore();

  const levelOptions = isAdmin && isProductionCenter
    ? PRODUCTION_LEVEL_OPTIONS
    : STORE_LEVEL_OPTIONS;

  const loadInventory = useCallback(async () => {
    let storeId = selectedStoreId;

    if (!storeId) {
      setLoading(true);
      await loadStores();
      storeId = useAppStore.getState().selectedStoreId;

      if (!storeId) {
        setItems([]);
        setMinimums({});
        setRawItems([]);
        setProcessedItems([]);
        setStoreItems([]);
        setLoading(false);
        return;
      }
    }

    const gen = ++loadGenRef.current;
    setLoading(true);
    try {
      // 1. Cargar datos de la pestaña de consulta para el nivel activo
      const [summary, mins] = await Promise.all([
        inventoryService.getInventorySummary(storeId, level),
        stockMinimumRepo.getByStoreAndLevel(storeId, level)
      ]);

      if (gen !== loadGenRef.current) return;

      setItems(summary);
      const minMap: Record<string, number> = {};
      for (const m of mins) {
        minMap[m.supplyId] = m.minimumGrams;
      }
      setMinimums(minMap);

      // 2. Cargar datos específicos del Tablero de Trabajo (Workflow)
      const storeDetails = stores.find((s) => s.id === storeId);
      const isProd = storeDetails?.isProductionCenter ?? false;

      if (isProd) {
        const [rawSum, procSum, rawMins, procMins] = await Promise.all([
          inventoryService.getInventorySummary(storeId, InventoryLevel.RAW),
          inventoryService.getInventorySummary(storeId, InventoryLevel.PROCESSED),
          stockMinimumRepo.getByStoreAndLevel(storeId, InventoryLevel.RAW),
          stockMinimumRepo.getByStoreAndLevel(storeId, InventoryLevel.PROCESSED)
        ]);

        if (gen !== loadGenRef.current) return;

        setRawItems(rawSum);
        setProcessedItems(procSum);

        const workflowMins: Record<string, number> = {};
        for (const m of [...rawMins, ...procMins]) {
          workflowMins[m.supplyId] = m.minimumGrams;
        }
        setWorkflowMinimums(workflowMins);
      } else {
        const [storeSum, storeMins] = await Promise.all([
          inventoryService.getInventorySummary(storeId, InventoryLevel.STORE),
          stockMinimumRepo.getByStoreAndLevel(storeId, InventoryLevel.STORE)
        ]);

        if (gen !== loadGenRef.current) return;

        setStoreItems(storeSum);

        const workflowMins: Record<string, number> = {};
        for (const m of storeMins) {
          workflowMins[m.supplyId] = m.minimumGrams;
        }
        setWorkflowMinimums(workflowMins);
      }

    } catch {
      if (gen !== loadGenRef.current) return;
      setItems([]);
      setMinimums({});
      setRawItems([]);
      setProcessedItems([]);
      setStoreItems([]);
    } finally {
      if (gen === loadGenRef.current) setLoading(false);
    }
  }, [selectedStoreId, level, inventoryService, stockMinimumRepo, loadStores, stores]);

  useEffect(() => {
    setLevel(isProductionCenter ? InventoryLevel.RAW : InventoryLevel.STORE);
  }, [isProductionCenter]);

  useFocusEffect(
    useCallback(() => {
      loadInventory();
    }, [loadInventory])
  );

  // Suscripción Realtime a cambios en la tabla inventory (producción, traslados, ventas, compras, etc.)
  useEffect(() => {
    const channel = supabase
      .channel('public_inventory_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory' },
        () => {
          loadInventory();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadInventory]);

  const supplyMap = useMemo(() => {
    return new Map(supplies.map((s) => [s.id, s]));
  }, [supplies]);

  const filteredItems = useMemo(() => {
    let sorted = [...items].sort((a, b) => a.supplyName.localeCompare(b.supplyName));

    if (isProductionCenter) {
      if (level === InventoryLevel.RAW) {
        sorted = sorted.filter((item) => (supplyMap.get(item.supplyId)?.category || 'PROCESSED') === 'RAW');
      } else if (level === InventoryLevel.PROCESSED) {
        sorted = sorted.filter((item) => (supplyMap.get(item.supplyId)?.category || 'PROCESSED') !== 'RAW');
      }
    } else {
      // En tiendas locales:
      // Insumos PROCESSED u OPERATIVE siempre son visibles.
      // Insumos RAW SOLO si Gerencia los autorizó (isBillableToStore o allowLocalPurchase).
      // Si un insumo RAW es exclusivo de planta (isBillableToStore=false y allowLocalPurchase=false), queda completamente bloqueado.
      sorted = sorted.filter((item) => {
        const supply = supplyMap.get(item.supplyId);
        const cat = supply?.category || 'PROCESSED';
        if (cat !== 'RAW') return true;

        const isAllowedForStore = supply?.isBillableToStore || supply?.allowLocalPurchase;
        if (!isAllowedForStore) return false;

        const hasStock = item.quantityGrams !== 0;
        const hasMin = (minimums[item.supplyId] ?? 0) > 0;
        if (hasStock || hasMin) return true;
        if (searchQuery.trim()) {
          return item.supplyName.toLowerCase().includes(searchQuery.toLowerCase().trim());
        }
        return false;
      });
    }

    if (!searchQuery.trim()) return sorted;
    const q = searchQuery.toLowerCase().trim();
    return sorted.filter((item) => item.supplyName.toLowerCase().includes(q));
  }, [items, searchQuery, isProductionCenter, level, supplyMap, minimums]);

  const handleSetMinimum = useCallback(async (supplyId: string, grams: number) => {
    if (!selectedStoreId) return;
    try {
      await stockMinimumRepo.upsert(selectedStoreId, supplyId, level, grams);
      setMinimums((prev) => ({ ...prev, [supplyId]: grams }));
      setWorkflowMinimums((prev) => ({ ...prev, [supplyId]: grams }));
      showSuccess('Stock mínimo guardado');
    } catch (error: any) {
      console.error('Error al guardar stock mínimo:', error);
      showError(error?.message || 'Error al guardar stock mínimo');
    }
  }, [selectedStoreId, level, stockMinimumRepo, showSuccess, showError]);

  // Filtrado de insumos bajo stock mínimo para el tablero de trabajo
  const criticalRaw = useMemo(() => {
    return rawItems.filter(item => {
      const min = workflowMinimums[item.supplyId] ?? 0;
      return min > 0 && item.quantityGrams < min;
    });
  }, [rawItems, workflowMinimums]);

  const criticalProcessed = useMemo(() => {
    return processedItems.filter(item => {
      const min = workflowMinimums[item.supplyId] ?? 0;
      return min > 0 && item.quantityGrams < min;
    });
  }, [processedItems, workflowMinimums]);

  const criticalStore = useMemo(() => {
    return storeItems.filter(item => {
      const min = workflowMinimums[item.supplyId] ?? 0;
      return min > 0 && item.quantityGrams < min;
    });
  }, [storeItems, workflowMinimums]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.topSection}>
        <StoreSelector />
        
        <SegmentedButtons
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as 'workflow' | 'search')}
          buttons={[
            {
              value: 'workflow',
              label: 'Tablero de Trabajo',
              icon: 'flash-outline',
            },
            {
              value: 'search',
              label: 'Consulta de Stock',
              icon: 'magnify',
            },
          ]}
          style={styles.segmentedButtons}
        />

        {activeTab === 'workflow' && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginTop: 8, marginBottom: 4 }}
            contentContainerStyle={{ paddingHorizontal: 4, gap: 6 }}
          >
            {canManageRecipesAndSupplies && (
              <Button
                mode="outlined"
                compact
                icon="silverware-fork-knife"
                style={{ marginRight: 8, height: 32 }}
                labelStyle={{ fontSize: 11, marginVertical: 4 }}
                onPress={() => router.push('/(tabs)/inventario/recetas')}
              >
                Recetas Ventas
              </Button>
            )}
            <Button
              mode="outlined"
              compact
              icon="pizza"
              style={{ marginRight: 8, height: 32 }}
              labelStyle={{ fontSize: 11, marginVertical: 4 }}
              onPress={() => router.push('/(tabs)/inventario/productos')}
            >
              Productos
            </Button>
            {canManageRecipesAndSupplies && (
              <Button
                mode="outlined"
                compact
                icon="package-variant-closed"
                style={{ marginRight: 8, height: 32 }}
                labelStyle={{ fontSize: 11, marginVertical: 4 }}
                onPress={() => router.push('/(tabs)/inventario/insumos')}
              >
                Insumos
              </Button>
            )}
            <Button
              mode="outlined"
              compact
              icon="chart-areaspline"
              style={{ marginRight: 8, height: 32 }}
              labelStyle={{ fontSize: 11, marginVertical: 4 }}
              onPress={() => router.push('/(tabs)/inventario/demanda')}
            >
              Demanda
            </Button>
            <Button
              mode="outlined"
              compact
              icon="minus-circle-outline"
              style={{ marginRight: 8, height: 32 }}
              labelStyle={{ fontSize: 11, marginVertical: 4 }}
              onPress={() => router.push('/(tabs)/inventario/bajas')}
            >
              Bajas/Mermas
            </Button>
            {isAdmin && (
              <Button
                mode="outlined"
                compact
                icon="pencil-box-multiple-outline"
                style={{ marginRight: 8, height: 32, borderColor: '#FF9800' }}
                labelStyle={{ fontSize: 11, marginVertical: 4, color: '#FF9800' }}
                onPress={() => router.push('/(tabs)/inventario/ajustes' as any)}
              >
                Ajustes / Auditoría
              </Button>
            )}
            {userRole === UserRole.GERENTE && (
              <Button
                mode="outlined"
                compact
                icon="store-cog"
                style={{ marginRight: 8, height: 32, borderColor: '#E63946' }}
                labelStyle={{ fontSize: 11, marginVertical: 4, color: '#E63946' }}
                onPress={() => router.push('/(tabs)/inventario/sedes' as any)}
              >
                Gestión Sedes
              </Button>
            )}
          </ScrollView>
        )}
      </View>

      {activeTab === 'workflow' ? (
        <ScrollView showsVerticalScrollIndicator={false} style={styles.workflowScroll}>
          {/* FASE 1: Compras y Entrada (Solo GERENTE) */}
          {userRole === UserRole.GERENTE && (
            <Card style={styles.workflowCard} mode="elevated">
              <Card.Content>
                <View style={styles.cardHeader}>
                  <MaterialCommunityIcons name="cart-outline" size={22} color="#D4A843" />
                  <Text variant="titleMedium" style={styles.cardTitle}>Fase 1: Entrada y Compras (Materia Prima)</Text>
                </View>
                <Text variant="bodySmall" style={styles.cardSubtitle}>
                  Revisión de stock y registro de insumos primarios recibidos de proveedores.
                </Text>
                
                {criticalRaw.length > 0 ? (
                  <View style={styles.criticalContainer}>
                    <Text variant="labelSmall" style={styles.criticalHeader}>⚠️ Materias Primas Críticas (Bajo Mínimo):</Text>
                    {criticalRaw.map(item => (
                      <View key={item.supplyId} style={styles.criticalItemRow}>
                        <Text variant="bodySmall" style={styles.criticalItemName}>• {item.supplyName}</Text>
                        <Text variant="bodySmall" style={styles.criticalItemQty}>
                          {Math.round(item.quantityGrams)}g / {workflowMinimums[item.supplyId]}g
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text variant="bodySmall" style={styles.criticalNone}>
                    ✅ Materias primas con stock suficiente.
                  </Text>
                )}

                <View style={styles.cardActions}>
                  <Button
                    mode="contained"
                    onPress={() => router.push('/(tabs)/inventario/compras')}
                    style={styles.actionBtnPrimary}
                    buttonColor="#E63946"
                    icon="cart-plus"
                  >
                    Registrar Compra
                  </Button>
                  <Button
                    mode="outlined"
                    onPress={() => router.push('/(tabs)/inventario/historial-compras')}
                    style={styles.actionBtnSecondary}
                    textColor="#CCCCCC"
                    icon="history"
                  >
                    Historial
                  </Button>
                </View>
              </Card.Content>
            </Card>
          )}

          {/* FASE 2: Proceso (Producción) - Solo Centro de Producción */}
          {isProductionCenter && (
            <Card style={styles.workflowCard} mode="elevated">
              <Card.Content>
                <View style={styles.cardHeader}>
                  <MaterialCommunityIcons name="factory" size={22} color="#D4A843" />
                  <Text variant="titleMedium" style={styles.cardTitle}>Fase 2: Centro de Preparación (Producción)</Text>
                </View>
                <Text variant="bodySmall" style={styles.cardSubtitle}>
                  Procesar materias primas para convertirlas en insumos de locales.
                </Text>

                {criticalProcessed.length > 0 ? (
                  <View style={styles.criticalContainer}>
                    <Text variant="labelSmall" style={styles.criticalHeader}>⚠️ Insumos Procesados Críticos (Bajo Mínimo):</Text>
                    {criticalProcessed.map(item => (
                      <View key={item.supplyId} style={styles.criticalItemRow}>
                        <Text variant="bodySmall" style={styles.criticalItemName}>• {item.supplyName}</Text>
                        <Text variant="bodySmall" style={styles.criticalItemQty}>
                          {Math.round(item.quantityGrams)}g / {workflowMinimums[item.supplyId]}g
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text variant="bodySmall" style={styles.criticalNone}>
                    ✅ Insumos procesados con stock suficiente.
                  </Text>
                )}

                <View style={styles.cardActions}>
                  <Button
                    mode="contained"
                    onPress={() => router.push('/(tabs)/inventario/produccion')}
                    style={styles.actionBtnPrimary}
                    buttonColor="#E63946"
                    icon="factory"
                  >
                    Registrar Producción
                  </Button>
                  {canManageRecipesAndSupplies && (
                    <Button
                      mode="outlined"
                      onPress={() => router.push('/(tabs)/inventario/recetas-produccion')}
                      style={styles.actionBtnSecondary}
                      textColor="#CCCCCC"
                      icon="book-cog"
                    >
                      Recetas Prod.
                    </Button>
                  )}
                </View>
              </Card.Content>
            </Card>
          )}

          {/* FASE 3: Salida (Despachos y Distribución) */}
          <Card style={styles.workflowCard} mode="elevated">
            <Card.Content>
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons name="truck-delivery-outline" size={22} color="#D4A843" />
                <Text variant="titleMedium" style={styles.cardTitle}>Fase 3: Distribución (Envíos a Locales)</Text>
              </View>
              <Text variant="bodySmall" style={styles.cardSubtitle}>
                Calcular envíos óptimos y trasladar insumos a las sucursales correspondientes.
              </Text>

              {!isProductionCenter && criticalStore.length > 0 && (
                <View style={styles.criticalContainer}>
                  <Text variant="labelSmall" style={styles.criticalHeader}>⚠️ Insumos Críticos del Local (Bajo Mínimo):</Text>
                  {criticalStore.map(item => (
                    <View key={item.supplyId} style={styles.criticalItemRow}>
                      <Text variant="bodySmall" style={styles.criticalItemName}>• {item.supplyName}</Text>
                      <Text variant="bodySmall" style={styles.criticalItemQty}>
                        {Math.round(item.quantityGrams)}g / {workflowMinimums[item.supplyId]}g
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.cardActions}>
                {userRole === UserRole.GERENTE && (
                  <Button
                    mode="contained"
                    onPress={() => router.push('/(tabs)/inventario/sugerencia-envio')}
                    style={styles.actionBtnPrimary}
                    buttonColor="#E63946"
                    icon="calculator"
                  >
                    Sugerir Envíos
                  </Button>
                )}
                <Button
                  mode="contained"
                  onPress={() => router.push('/(tabs)/inventario/traslados')}
                  style={styles.actionBtnPrimary}
                  buttonColor="#2196F3"
                  icon="truck"
                >
                  Traslados
                </Button>
              </View>
            </Card.Content>
          </Card>

          {/* FASE 4: Recepción y Auditoría (Cierre) */}
          <Card style={styles.workflowCard} mode="elevated">
            <Card.Content>
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons name="clipboard-check-outline" size={22} color="#D4A843" />
                <Text variant="titleMedium" style={styles.cardTitle}>Fase 4: Recepción y Auditoría (Cierre)</Text>
              </View>
              <Text variant="bodySmall" style={styles.cardSubtitle}>
                Realizar conteo físico de inventario para cuadres al final de la jornada.
              </Text>

              <View style={styles.cardActions}>
                <Button
                  mode="contained"
                  onPress={() => router.push('/(tabs)/inventario/cierre-fisico')}
                  style={styles.actionBtnPrimary}
                  buttonColor="#E63946"
                  icon="clipboard-check"
                >
                  Cierre Físico
                </Button>
                <Button
                  mode="outlined"
                  onPress={() => router.push('/(tabs)/inventario/validaciones')}
                  style={styles.actionBtnSecondary}
                  textColor="#CCCCCC"
                  icon="alert"
                >
                  Validaciones
                </Button>
              </View>
            </Card.Content>
          </Card>
          
          <View style={{ height: 100 }} />
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          {/* Nivel de stock selector */}
          {levelOptions.length > 1 && (
            <View style={styles.chipRowContainer}>
              {levelOptions.map((opt) => (
                <Chip
                  key={opt.value}
                  selected={level === opt.value}
                  onPress={() => setLevel(opt.value)}
                  mode="flat"
                  compact
                  icon={opt.icon}
                  style={[
                    styles.chip,
                    level === opt.value && styles.chipActive,
                  ]}
                  textStyle={[
                    styles.chipText,
                    level === opt.value && styles.chipTextActive,
                  ]}
                  showSelectedOverlay={false}
                >
                  {opt.label}
                </Chip>
              ))}
            </View>
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

          {loading ? (
            <LoadingIndicator message="Cargando inventario..." />
          ) : filteredItems.length === 0 ? (
            <EmptyState
              icon={searchQuery ? 'magnify' : 'package-variant'}
              title={searchQuery ? 'Sin resultados' : 'Sin inventario'}
              subtitle={searchQuery ? `No se encontró "${searchQuery}"` : 'No hay items en este nivel'}
            />
          ) : (
            <FlatList
              data={filteredItems}
              renderItem={({ item }) => (
                <InventoryLevelCard
                  item={item}
                  minimumGrams={minimums[item.supplyId] ?? 0}
                  onSetMinimum={isAdmin ? handleSetMinimum : undefined}
                />
              )}
              keyExtractor={(item) => item.supplyId}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      )}
      <Snackbar
        visible={snackbar.visible}
        onDismiss={hideSnackbar}
        duration={3000}
        style={{ backgroundColor: snackbar.error ? '#D32F2F' : '#388E3C' }}
      >
        {snackbar.message}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 0,
  },
  segmentedButtons: {
    marginTop: 10,
    marginBottom: 8,
  },
  workflowScroll: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  workflowCard: {
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#2E2E2E',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  cardTitle: {
    color: '#F5F0EB',
    fontWeight: '700',
    fontSize: 14,
    flexShrink: 1,
  },
  cardSubtitle: {
    color: '#8B8178',
    marginBottom: 12,
    fontSize: 12,
  },
  criticalContainer: {
    backgroundColor: 'rgba(230, 57, 70, 0.05)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(230, 57, 70, 0.15)',
  },
  criticalHeader: {
    color: '#FF6B6B',
    fontWeight: '700',
    marginBottom: 6,
    fontSize: 11,
  },
  criticalItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  criticalItemName: {
    color: '#F5F0EB',
    fontSize: 12,
  },
  criticalItemQty: {
    color: '#FF8A8A',
    fontWeight: '600',
    fontSize: 12,
  },
  criticalNone: {
    color: '#81C784',
    fontWeight: '600',
    fontSize: 12,
    marginBottom: 14,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  actionBtnPrimary: {
    flex: 1,
    borderRadius: 8,
  },
  actionBtnSecondary: {
    flex: 1,
    borderRadius: 8,
    borderColor: '#3A3A3A',
  },
  chipRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    flexShrink: 0,
    minHeight: 40,
  },
  chip: {
    backgroundColor: '#2A2A2A',
    borderRadius: 20,
    height: 36,
  },
  chipActive: {
    backgroundColor: '#E63946',
  },
  chipText: {
    color: '#CCCCCC',
    fontSize: 12,
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  searchInput: {
    marginBottom: 8,
    marginHorizontal: 16,
    flexShrink: 0,
  },
  list: {
    padding: 16,
    paddingTop: 4,
    paddingBottom: 100,
  },
});
