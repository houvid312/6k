import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Platform, Alert } from 'react-native';
import {
  Card,
  Text,
  Button,
  Divider,
  SegmentedButtons,
  IconButton,
  Checkbox,
  useTheme,
  ActivityIndicator,
} from 'react-native-paper';
import { useFocusEffect } from 'expo-router';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useSnackbar } from '../../../src/hooks';
import {
  WeeklyPlanCalculationResult,
  PlannedRecipeRequirement,
  RawPurchaseRequirement,
  WeeklyProductionPlan,
} from '../../../src/domain/entities';
import { todayColombia, formatDate } from '../../../src/utils/dates';

// Helper para calcular el Lunes de la semana de una fecha YYYY-MM-DD
function getMondayOfWeek(dateStr: string): string {
  const parts = dateStr.split('-');
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  const day = d.getDay();
  // day 0 is Sunday, 1 is Monday...
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const dayNum = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${dayNum}`;
}

// Helper para sumar o restar semanas
function shiftWeek(mondayStr: string, weeks: number): string {
  const parts = mondayStr.split('-');
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  d.setDate(d.getDate() + weeks * 7);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dayNum = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dayNum}`;
}

const DAY_LABELS: Record<number, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  0: 'Domingo',
};

export default function PlanificadorSemanalScreen() {
  const theme = useTheme();
  const { productionPlanningService, storeRepo } = useDI();
  const { selectedStoreId } = useAppStore();
  const { showSuccess, showError } = useSnackbar();

  const [currentWeekMonday, setCurrentWeekMonday] = useState(() => getMondayOfWeek(todayColombia()));
  const [tab, setTab] = useState<'mps' | 'raw' | 'schedule'>('mps');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calcResult, setCalcResult] = useState<WeeklyPlanCalculationResult | null>(null);
  const [savedPlan, setSavedPlan] = useState<WeeklyProductionPlan | null>(null);
  const [completedItemsMap, setCompletedItemsMap] = useState<Record<string, boolean>>({});

  const loadPlanData = useCallback(async () => {
    setLoading(true);
    try {
      const stores = await storeRepo.getAll();
      const cpStore = stores.find((s) => s.isProductionCenter);
      const cpStoreId = cpStore ? cpStore.id : selectedStoreId;

      // 1. Calcular el plan semanal con los algoritmos de demanda agregada
      const result = await productionPlanningService.calculateWeeklyPlan(currentWeekMonday);
      setCalcResult(result);

      // 2. Buscar si ya existe un plan guardado para persistencia de tareas
      const existing = await productionPlanningService.getSavedPlan(cpStoreId, currentWeekMonday);
      setSavedPlan(existing);

      if (existing) {
        const compMap: Record<string, boolean> = {};
        for (const item of existing.items) {
          compMap[`${item.recipeId}-${item.dayOfWeek}`] = item.isCompleted;
        }
        setCompletedItemsMap(compMap);
      } else {
        setCompletedItemsMap({});
      }
    } catch (err: any) {
      console.error('Error calculando plan semanal:', err);
      showError(err?.message || 'Error al calcular plan semanal');
      setCalcResult(null);
    } finally {
      setLoading(false);
    }
  }, [currentWeekMonday, productionPlanningService, storeRepo, selectedStoreId, showError]);

  useFocusEffect(
    useCallback(() => {
      loadPlanData();
    }, [loadPlanData])
  );

  // Guardar / Confirmar Plan Semanal
  const handleSavePlan = async () => {
    if (!calcResult) return;
    setSaving(true);
    try {
      const stores = await storeRepo.getAll();
      const cpStore = stores.find((s) => s.isProductionCenter);
      if (!cpStore) throw new Error('No hay Centro de Producción');

      // Crear items para el plan
      const itemsToSave: any[] = [];
      for (const pr of calcResult.plannedRecipes) {
        if (pr.calculatedBatches <= 0) continue;
        const days = pr.suggestedDays.length > 0 ? pr.suggestedDays : [1];
        const batchesPerDay = pr.calculatedBatches / days.length;
        const bagsPerDay = Math.ceil(pr.calculatedBags / days.length);
        const minsPerDay = Math.round(pr.totalEstMinutes / days.length);

        for (const day of days) {
          const key = `${pr.recipeId}-${day}`;
          itemsToSave.push({
            recipeId: pr.recipeId,
            dayOfWeek: day,
            plannedBatches: batchesPerDay,
            plannedBags: bagsPerDay,
            estMinutes: minsPerDay,
            isCompleted: !!completedItemsMap[key],
          });
        }
      }

      await productionPlanningService.savePlan({
        storeId: cpStore.id,
        weekStartDate: currentWeekMonday,
        status: 'APPROVED',
        totalPlannedMinutes: calcResult.totalEstimatedMinutes,
        notes: `Plan generado para semana del ${currentWeekMonday}`,
        items: itemsToSave,
      });

      showSuccess('Plan semanal guardado con éxito');
      loadPlanData();
    } catch (err: any) {
      showError(err?.message || 'Error al guardar el plan');
    } finally {
      setSaving(false);
    }
  };

  // Marcar tarea completada en el cronograma
  const handleToggleTask = async (recipeId: string, dayOfWeek: number) => {
    const key = `${recipeId}-${dayOfWeek}`;
    const nextState = !completedItemsMap[key];

    setCompletedItemsMap((prev) => ({
      ...prev,
      [key]: nextState,
    }));

    if (savedPlan) {
      const item = savedPlan.items.find(
        (i) => i.recipeId === recipeId && i.dayOfWeek === dayOfWeek
      );
      if (item) {
        try {
          await productionPlanningService.toggleItemCompletion(item.id, nextState);
        } catch {
          showError('Error al actualizar estado');
        }
      }
    }
  };

  // Copiar lista de compras para WhatsApp / Proveedores
  const handleCopyPurchaseList = async () => {
    if (!calcResult || calcResult.rawPurchases.length === 0) {
      showError('No hay compras para copiar');
      return;
    }

    const itemsText = calcResult.rawPurchases
      .filter((p) => p.toPurchaseGrams > 0)
      .map((p) => {
        const cantStr = p.toPurchaseUnits > 0
          ? `${p.toPurchaseUnits} unidad(es) (${p.toPurchaseGrams >= 1000 ? (p.toPurchaseGrams / 1000).toFixed(1) + ' kg' : p.toPurchaseGrams + ' g'})`
          : `${p.toPurchaseGrams} g`;
        return `• *${p.supplyName}*: ${cantStr}`;
      })
      .join('\n');

    const message = `🍕 *PEDIDO DE COMPRAS - 6K PIZZA*\n📅 *Semana del:* ${formatDate(currentWeekMonday)}\n\n${itemsText}\n\n_Generado automáticamente desde 6K App._`;

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(message);
      } else if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = message;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      showSuccess('¡Lista de compras copiada al portapapeles!');
    } catch {
      showError('No se pudo copiar automáticamente');
    }
  };

  // KPIs & Progreso
  const totalBatches = useMemo(() => {
    if (!calcResult) return 0;
    return calcResult.plannedRecipes.reduce((sum, r) => sum + r.calculatedBatches, 0);
  }, [calcResult]);

  const totalRawPurchasesCount = useMemo(() => {
    if (!calcResult) return 0;
    return calcResult.rawPurchases.filter((p) => p.toPurchaseGrams > 0).length;
  }, [calcResult]);

  const { totalScheduledTasks, completedTasksCount, progressPercent } = useMemo(() => {
    if (!calcResult) return { totalScheduledTasks: 0, completedTasksCount: 0, progressPercent: 0 };
    let total = 0;
    let completed = 0;
    for (const pr of calcResult.plannedRecipes) {
      if (pr.calculatedBatches <= 0) continue;
      const days = pr.suggestedDays.length > 0 ? pr.suggestedDays : [1];
      for (const d of days) {
        total += 1;
        if (completedItemsMap[`${pr.recipeId}-${d}`]) {
          completed += 1;
        }
      }
    }
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { totalScheduledTasks: total, completedTasksCount: completed, progressPercent: percent };
  }, [calcResult, completedItemsMap]);

  return (
    <ScreenContainer scrollable padded>
      {/* HEADER: Selector de Semana */}
      <View style={styles.weekSelectorContainer}>
        <IconButton
          icon="chevron-left"
          size={24}
          iconColor="#F5F0EB"
          onPress={() => setCurrentWeekMonday(shiftWeek(currentWeekMonday, -1))}
        />
        <View style={{ alignItems: 'center' }}>
          <Text variant="labelSmall" style={{ color: '#999' }}>Semana de Producción</Text>
          <Text variant="titleMedium" style={{ color: '#F5F0EB', fontWeight: 'bold' }}>
            Semana del {formatDate(currentWeekMonday)}
          </Text>
        </View>
        <IconButton
          icon="chevron-right"
          size={24}
          iconColor="#F5F0EB"
          onPress={() => setCurrentWeekMonday(shiftWeek(currentWeekMonday, 1))}
        />
      </View>

      {/* BANNER DE ESTADO Y PROGRESO */}
      {calcResult && (
        <View
          style={{
            backgroundColor: savedPlan ? '#122616' : '#261F12',
            borderWidth: 1,
            borderColor: savedPlan ? '#4CAF50' : '#FF9800',
            borderRadius: 10,
            padding: 10,
            marginBottom: 10,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text variant="labelMedium" style={{ color: savedPlan ? '#4CAF50' : '#FF9800', fontWeight: 'bold' }}>
                {savedPlan ? '🟢 Plan Oficial Guardado' : '🟡 Proyección en Vivo (Sin Guardar)'}
              </Text>
              {savedPlan?.updatedAt && (
                <Text variant="labelSmall" style={{ color: '#999' }}>
                  · Act: {formatDate(savedPlan.updatedAt.split('T')[0])}
                </Text>
              )}
            </View>
            <Text variant="labelMedium" style={{ color: '#F5F0EB', fontWeight: 'bold' }}>
              {completedTasksCount} de {totalScheduledTasks} tareas ({progressPercent}%)
            </Text>
          </View>

          {/* Barra de progreso visual */}
          <View style={{ height: 6, backgroundColor: '#333', borderRadius: 3, overflow: 'hidden' }}>
            <View
              style={{
                height: '100%',
                width: `${progressPercent}%`,
                backgroundColor: progressPercent === 100 ? '#4CAF50' : savedPlan ? '#2196F3' : '#FF9800',
              }}
            />
          </View>
        </View>
      )}

      {/* KPIS DE RESUMEN SEMANAL */}
      {calcResult && (
        <View style={styles.kpiRow}>
          <Card style={[styles.kpiCard, { backgroundColor: '#1E1E1E' }]}>
            <Card.Content style={styles.kpiContent}>
              <Text variant="labelSmall" style={{ color: '#999' }}>Demanda Total</Text>
              <Text variant="titleMedium" style={{ color: '#E63946', fontWeight: 'bold' }}>
                {calcResult.totalDemandedPortions} porc.
              </Text>
            </Card.Content>
          </Card>

          <Card style={[styles.kpiCard, { backgroundColor: '#1E1E1E' }]}>
            <Card.Content style={styles.kpiContent}>
              <Text variant="labelSmall" style={{ color: '#999' }}>Lotes a Fabricar</Text>
              <Text variant="titleMedium" style={{ color: '#F5F0EB', fontWeight: 'bold' }}>
                {totalBatches} lotes
              </Text>
            </Card.Content>
          </Card>

          <Card style={[styles.kpiCard, { backgroundColor: '#1E1E1E' }]}>
            <Card.Content style={styles.kpiContent}>
              <Text variant="labelSmall" style={{ color: '#999' }}>Tiempo Estimado</Text>
              <Text variant="titleMedium" style={{ color: '#4CAF50', fontWeight: 'bold' }}>
                {calcResult.totalEstimatedHours} horas
              </Text>
            </Card.Content>
          </Card>
        </View>
      )}

      {/* SEGMENTED BUTTONS PARA LAS 3 PESTAÑAS */}
      <SegmentedButtons
        value={tab}
        onValueChange={(v) => setTab(v as any)}
        buttons={[
          { value: 'mps', label: '1. Lotes (MPS)', icon: 'pot-steam' },
          { value: 'raw', label: '2. Compras', icon: 'cart-outline' },
          { value: 'schedule', label: '3. Cronograma', icon: 'calendar-clock' },
        ]}
        style={{ marginVertical: 14 }}
      />

      {loading ? (
        <LoadingIndicator message="Calculando plan maestro de producción..." />
      ) : !calcResult ? (
        <EmptyState
          icon="calendar-alert"
          title="Sin datos"
          subtitle="No fue posible calcular el plan para esta semana."
        />
      ) : (
        <>
          {/* ========================================================= */}
          {/* PESTAÑA 1: LOTES A PRODUCIR (MPS) */}
          {/* ========================================================= */}
          {tab === 'mps' && (
            <View>
              <View style={styles.tabHeaderRow}>
                <View>
                  <Text variant="titleMedium" style={{ color: '#F5F0EB', fontWeight: 'bold' }}>
                    Plan Maestro de Producción (Lotes)
                  </Text>
                  <Text variant="bodySmall" style={{ color: '#999' }}>
                    Calculado según demanda agregada semanal de locales vs stock en planta
                  </Text>
                </View>
                <Button
                  mode="contained"
                  icon="content-save"
                  buttonColor="#E63946"
                  loading={saving}
                  disabled={saving}
                  onPress={handleSavePlan}
                  compact
                >
                  Guardar Plan
                </Button>
              </View>

              {calcResult.plannedRecipes.map((pr) => {
                const needsProduction = pr.calculatedBatches > 0;
                return (
                  <Card
                    key={pr.recipeId}
                    style={[
                      styles.itemCard,
                      {
                        backgroundColor: '#1E1E1E',
                        borderLeftWidth: 4,
                        borderLeftColor: needsProduction ? '#E63946' : '#4CAF50',
                      },
                    ]}
                  >
                    <Card.Content>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text variant="titleSmall" style={{ color: '#F5F0EB', fontWeight: 'bold' }}>
                            {pr.recipeName}
                          </Text>
                          <Text variant="bodySmall" style={{ color: '#999' }}>
                            Insumo: {pr.supplyName} · Lote: {pr.outputGrams}g ({pr.outputBags} bolsa/s)
                          </Text>
                          <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                            <View style={{ backgroundColor: '#2A2A2A', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                              <Text variant="labelSmall" style={{ color: '#4CAF50', fontSize: 10 }}>
                                ⏱️ {pr.prepTimeMinutes} min/lote
                              </Text>
                            </View>
                            <View style={{ backgroundColor: '#2A2A2A', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                              <Text variant="labelSmall" style={{ color: '#2196F3', fontSize: 10 }}>
                                ❄️ {pr.shelfLifeDays} días vida
                              </Text>
                            </View>
                          </View>
                        </View>

                        <View style={{ alignItems: 'flex-end' }}>
                          <Text
                            variant="titleMedium"
                            style={{
                              color: needsProduction ? '#E63946' : '#4CAF50',
                              fontWeight: 'bold',
                            }}
                          >
                            {pr.calculatedBatches} lotes
                          </Text>
                          <Text variant="bodySmall" style={{ color: '#F5F0EB' }}>
                            {pr.calculatedBags} bolsas
                          </Text>
                          <Text variant="labelSmall" style={{ color: '#999' }}>
                            ~{pr.totalEstMinutes} min
                          </Text>
                        </View>
                      </View>

                      <Divider style={{ backgroundColor: '#333', marginVertical: 8 }} />

                      <View style={styles.metricsGrid}>
                        <View style={styles.metricItem}>
                          <Text variant="labelSmall" style={{ color: '#999' }}>Demanda + Mín:</Text>
                          <Text variant="bodySmall" style={{ color: '#F5F0EB', fontWeight: 'bold' }}>
                            {pr.totalNeededGrams} g
                          </Text>
                        </View>
                        <View style={styles.metricItem}>
                          <Text variant="labelSmall" style={{ color: '#999' }}>Stock Actual CP:</Text>
                          <Text variant="bodySmall" style={{ color: '#F5F0EB', fontWeight: 'bold' }}>
                            {pr.currentStockGrams} g
                          </Text>
                        </View>
                        <View style={styles.metricItem}>
                          <Text variant="labelSmall" style={{ color: '#999' }}>Faltante Neto:</Text>
                          <Text variant="bodySmall" style={{ color: needsProduction ? '#E63946' : '#4CAF50', fontWeight: 'bold' }}>
                            {pr.targetNetGrams} g
                          </Text>
                        </View>
                      </View>
                    </Card.Content>
                  </Card>
                );
              })}
            </View>
          )}

          {/* ========================================================= */}
          {/* PESTAÑA 2: COMPRAS DE MATERIA PRIMA (RAW) */}
          {/* ========================================================= */}
          {tab === 'raw' && (
            <View>
              <View style={styles.tabHeaderRow}>
                <View>
                  <Text variant="titleMedium" style={{ color: '#F5F0EB', fontWeight: 'bold' }}>
                    Requerimientos de Compra (Materia Prima)
                  </Text>
                  <Text variant="bodySmall" style={{ color: '#999' }}>
                    Insumos crudos necesarios para fabricar los lotes planeados
                  </Text>
                </View>
                <Button
                  mode="contained"
                  icon="whatsapp"
                  buttonColor="#25D366"
                  textColor="#000"
                  onPress={handleCopyPurchaseList}
                  compact
                >
                  Copiar Pedido
                </Button>
              </View>

              {calcResult.rawPurchases.length === 0 ? (
                <EmptyState
                  icon="check-circle"
                  title="Stock Suficiente"
                  subtitle="Hay suficiente materia prima en bodega para toda la producción semanal."
                />
              ) : (
                calcResult.rawPurchases.map((raw) => {
                  const toBuy = raw.toPurchaseGrams > 0;
                  return (
                    <Card
                      key={raw.supplyId}
                      style={[
                        styles.itemCard,
                        {
                          backgroundColor: '#1E1E1E',
                          borderLeftWidth: 4,
                          borderLeftColor: toBuy ? '#FF9800' : '#4CAF50',
                        },
                      ]}
                    >
                      <Card.Content>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={{ flex: 1, paddingRight: 8 }}>
                            <Text variant="titleSmall" style={{ color: '#F5F0EB', fontWeight: 'bold' }}>
                              {raw.supplyName}
                            </Text>
                            <Text variant="bodySmall" style={{ color: '#999' }}>
                              Presentación: {raw.presentationGrams}g por bolsa/unidad
                            </Text>
                          </View>

                          <View style={{ alignItems: 'flex-end' }}>
                            <Text
                              variant="titleMedium"
                              style={{
                                color: toBuy ? '#FF9800' : '#4CAF50',
                                fontWeight: 'bold',
                              }}
                            >
                              {toBuy ? `${raw.toPurchaseUnits} unid.` : 'Suficiente'}
                            </Text>
                            {toBuy && (
                              <Text variant="bodySmall" style={{ color: '#F5F0EB' }}>
                                ({raw.toPurchaseGrams >= 1000 ? (raw.toPurchaseGrams / 1000).toFixed(1) + ' kg' : raw.toPurchaseGrams + ' g'})
                              </Text>
                            )}
                          </View>
                        </View>

                        <Divider style={{ backgroundColor: '#333', marginVertical: 8 }} />

                        <View style={styles.metricsGrid}>
                          <View style={styles.metricItem}>
                            <Text variant="labelSmall" style={{ color: '#999' }}>Requerido Lotes:</Text>
                            <Text variant="bodySmall" style={{ color: '#F5F0EB' }}>
                              {raw.requiredGrams} g
                            </Text>
                          </View>
                          <View style={styles.metricItem}>
                            <Text variant="labelSmall" style={{ color: '#999' }}>Stock Bodega RAW:</Text>
                            <Text variant="bodySmall" style={{ color: '#F5F0EB' }}>
                              {raw.currentRawStockGrams} g
                            </Text>
                          </View>
                          <View style={styles.metricItem}>
                            <Text variant="labelSmall" style={{ color: '#999' }}>A Comprar:</Text>
                            <Text variant="bodySmall" style={{ color: toBuy ? '#FF9800' : '#4CAF50', fontWeight: 'bold' }}>
                              {raw.toPurchaseGrams} g
                            </Text>
                          </View>
                        </View>
                      </Card.Content>
                    </Card>
                  );
                })
              )}
            </View>
          )}

          {/* ========================================================= */}
          {/* PESTAÑA 3: CRONOGRAMA SEMANAL (DÍAS Y TURNOS) */}
          {/* ========================================================= */}
          {tab === 'schedule' && (
            <View>
              <View style={styles.tabHeaderRow}>
                <View>
                  <Text variant="titleMedium" style={{ color: '#F5F0EB', fontWeight: 'bold' }}>
                    Cronograma de Trabajo Semanal
                  </Text>
                  <Text variant="bodySmall" style={{ color: '#999' }}>
                    Distribución de recetas según vida útil y demanda de locales
                  </Text>
                </View>
                <Button
                  mode="outlined"
                  icon="content-save"
                  textColor="#E63946"
                  loading={saving}
                  disabled={saving}
                  onPress={handleSavePlan}
                  compact
                >
                  Guardar
                </Button>
              </View>

              {calcResult.daySummaries.map((day) => {
                // Obtener las recetas planeadas para este día
                const dayRecipes = calcResult.plannedRecipes.filter(
                  (r) => r.calculatedBatches > 0 && r.suggestedDays.includes(day.dayOfWeek)
                );

                return (
                  <Card key={day.dayOfWeek} style={[styles.dayCard, { backgroundColor: '#1E1E1E' }]}>
                    <Card.Content>
                      <View style={styles.dayHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={styles.dayBadge}>
                            <Text variant="labelMedium" style={{ color: '#F5F0EB', fontWeight: 'bold' }}>
                              {day.dayName}
                            </Text>
                          </View>
                          <Text variant="bodySmall" style={{ color: '#999' }}>
                            {dayRecipes.length} tarea(s)
                          </Text>
                        </View>
                        <Text variant="titleSmall" style={{ color: '#4CAF50', fontWeight: 'bold' }}>
                          ⏱️ {day.totalHours} hrs (~{day.totalMinutes} min)
                        </Text>
                      </View>

                      <Divider style={{ backgroundColor: '#333', marginVertical: 8 }} />

                      {dayRecipes.length === 0 ? (
                        <Text variant="bodySmall" style={{ color: '#666', fontStyle: 'italic', paddingVertical: 4 }}>
                          Sin producción programada para este día.
                        </Text>
                      ) : (
                        dayRecipes.map((r) => {
                          const key = `${r.recipeId}-${day.dayOfWeek}`;
                          const isDone = !!completedItemsMap[key];
                          const batchesForDay = r.suggestedDays.length > 1
                            ? (r.calculatedBatches / r.suggestedDays.length).toFixed(1)
                            : r.calculatedBatches;
                          const bagsForDay = Math.ceil(r.calculatedBags / r.suggestedDays.length);

                          return (
                            <Pressable
                              key={key}
                              onPress={() => handleToggleTask(r.recipeId, day.dayOfWeek)}
                              style={[
                                styles.taskRow,
                                isDone && { opacity: 0.5, backgroundColor: '#182818' },
                              ]}
                            >
                              <Checkbox
                                status={isDone ? 'checked' : 'unchecked'}
                                onPress={() => handleToggleTask(r.recipeId, day.dayOfWeek)}
                                color="#4CAF50"
                              />
                              <View style={{ flex: 1, paddingLeft: 4 }}>
                                <Text
                                  variant="bodyMedium"
                                  style={[
                                    { color: '#F5F0EB', fontWeight: '600' },
                                    isDone && { textDecorationLine: 'line-through', color: '#999' },
                                  ]}
                                >
                                  {r.recipeName}
                                </Text>
                                <Text variant="bodySmall" style={{ color: '#999' }}>
                                  {batchesForDay} lote(s) · {bagsForDay} bolsa(s) · ~{Math.round(r.totalEstMinutes / r.suggestedDays.length)} min
                                </Text>
                              </View>
                            </Pressable>
                          );
                        })
                      )}
                    </Card.Content>
                  </Card>
                );
              })}
            </View>
          )}
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  weekSelectorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  kpiCard: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  kpiContent: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  tabHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemCard: {
    marginBottom: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#141414',
    padding: 8,
    borderRadius: 6,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  dayCard: {
    marginBottom: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayBadge: {
    backgroundColor: '#E63946',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 6,
    marginVertical: 2,
  },
});
