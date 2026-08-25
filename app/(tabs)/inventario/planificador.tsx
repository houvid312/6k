import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Platform, Alert, TouchableOpacity } from 'react-native';
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
  Chip,
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
import { formatCOP } from '../../../src/utils/currency';

// Helper para calcular el Lunes de la semana de una fecha YYYY-MM-DD
function getMondayOfWeek(dateStr: string): string {
  const parts = dateStr.split('-');
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  const day = d.getDay();
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

const WEEK_DAYS_OPTIONS = [
  { d: 1, label: 'Lun' },
  { d: 2, label: 'Mar' },
  { d: 3, label: 'Mié' },
  { d: 4, label: 'Jue' },
  { d: 5, label: 'Vie' },
  { d: 6, label: 'Sáb' },
  { d: 0, label: 'Dom' },
];

// Helper para calcular la semana predeterminada de planificacion
function getDefaultPlanningWeekMonday(todayStr: string): string {
  const parts = todayStr.split('-');
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  const day = d.getDay(); // 0 = Domingo, 6 = Sábado
  const thisMonday = getMondayOfWeek(todayStr);
  if (day === 0 || day === 6) {
    return shiftWeek(thisMonday, 1);
  }
  return thisMonday;
}

export default function PlanificadorSemanalScreen() {
  const theme = useTheme();
  const { productionPlanningService, storeRepo } = useDI();
  const { selectedStoreId } = useAppStore();
  const { showSuccess, showError } = useSnackbar();

  const [currentWeekMonday, setCurrentWeekMonday] = useState(() => getDefaultPlanningWeekMonday(todayColombia()));
  const [tab, setTab] = useState<'mps' | 'raw' | 'schedule'>('mps');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingRecipeId, setUpdatingRecipeId] = useState<string | null>(null);
  const [calcResult, setCalcResult] = useState<WeeklyPlanCalculationResult | null>(null);
  const [savedPlan, setSavedPlan] = useState<WeeklyProductionPlan | null>(null);
  const [completedItemsMap, setCompletedItemsMap] = useState<Record<string, boolean>>({});
  const [completedPurchasesMap, setCompletedPurchasesMap] = useState<Record<string, boolean>>({});
  const [purchasesDayFilter, setPurchasesDayFilter] = useState<number | null>(null); // null = Toda la semana
  const [isDirty, setIsDirty] = useState(false);

  const isFrozenPlan = useMemo(() => {
    return !!savedPlan && !isDirty;
  }, [savedPlan, isDirty]);

  const loadPlanData = useCallback(async () => {
    setLoading(true);
    setIsDirty(false);
    try {
      const stores = await storeRepo.getAll();
      const cpStore = stores.find((s) => s.isProductionCenter);
      const cpStoreId = cpStore ? cpStore.id : selectedStoreId;

      // 1. Buscar si ya existe un plan guardado con su snapshot congelado
      const existing = await productionPlanningService.getSavedPlan(cpStoreId, currentWeekMonday);
      setSavedPlan(existing);

      let snapshotLoaded = false;
      if (existing) {
        // Cargar mapa de tareas completadas
        const compMap: Record<string, boolean> = {};
        for (const item of existing.items) {
          compMap[`${item.recipeId}-${item.dayOfWeek}`] = item.isCompleted;
        }
        setCompletedItemsMap(compMap);

        // Parsear notas para snapshot y compras
        if (existing.notes && existing.notes.startsWith('{')) {
          try {
            const parsed = JSON.parse(existing.notes);
            if (parsed.snapshot && Array.isArray(parsed.snapshot.plannedRecipes)) {
              setCalcResult(parsed.snapshot);
              snapshotLoaded = true;
            }
            if (Array.isArray(parsed.completedPurchases)) {
              const pMap: Record<string, boolean> = {};
              parsed.completedPurchases.forEach((id: string) => { pMap[id] = true; });
              setCompletedPurchasesMap(pMap);
            }
          } catch (e) {
            console.error('Error parsing plan snapshot notes:', e);
          }
        }
      } else {
        setCompletedItemsMap({});
        setCompletedPurchasesMap({});
      }

      // Si no habia snapshot guardado, calculamos la proyeccion en vivo
      if (!snapshotLoaded) {
        const result = await productionPlanningService.calculateWeeklyPlan(currentWeekMonday);
        setCalcResult(result);
      }
    } catch (err: any) {
      console.error('Error cargando plan semanal:', err);
      showError(err?.message || 'Error al cargar plan semanal');
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

  // Recalcular proyección en vivo con stock actual
  const handleRecalculateLive = async () => {
    setLoading(true);
    try {
      const fresh = await productionPlanningService.calculateWeeklyPlan(currentWeekMonday);
      setCalcResult(fresh);
      setIsDirty(true);
      showSuccess('Proyección recalculada con stock e inventario actual.');
    } catch (err: any) {
      showError(err?.message || 'Error al recalcular');
    } finally {
      setLoading(false);
    }
  };

  // Ajustar lotes manualmente (+/-)
  const handleUpdateRecipeBatches = async (recipeId: string, delta: number) => {
    if (!calcResult || updatingRecipeId) return;
    setUpdatingRecipeId(recipeId);
    try {
      const updatedRecipes = calcResult.plannedRecipes.map((pr) => {
        if (pr.recipeId === recipeId) {
          const nextBatches = Math.max(0, Math.round((pr.calculatedBatches + delta) * 10) / 10);
          return {
            ...pr,
            calculatedBatches: nextBatches,
          };
        }
        return pr;
      });

      const recalculated = await productionPlanningService.recalculateFromCustomPlan(
        updatedRecipes,
        currentWeekMonday,
        calcResult.totalDemandedPortions,
      );
      setCalcResult(recalculated);
      setIsDirty(true);
    } catch (err: any) {
      showError(err?.message || 'Error al recalcular lotes');
    } finally {
      setUpdatingRecipeId(null);
    }
  };

  // Redondear lotes de una receta a múltiplo de 1 o 2
  const handleRoundRecipeBatches = async (recipeId: string, multiple: 1 | 2) => {
    if (!calcResult || updatingRecipeId) return;
    setUpdatingRecipeId(recipeId);
    try {
      const updatedRecipes = calcResult.plannedRecipes.map((pr) => {
        if (pr.recipeId === recipeId && pr.calculatedBatches > 0) {
          let nextBatches = pr.calculatedBatches;
          if (multiple === 1) {
            nextBatches = Math.ceil(pr.calculatedBatches);
          } else if (multiple === 2) {
            nextBatches = Math.ceil(pr.calculatedBatches / 2) * 2;
            if (nextBatches === 0 && pr.calculatedBatches > 0) nextBatches = 2;
          }
          return {
            ...pr,
            calculatedBatches: nextBatches,
          };
        }
        return pr;
      });

      const recalculated = await productionPlanningService.recalculateFromCustomPlan(
        updatedRecipes,
        currentWeekMonday,
        calcResult.totalDemandedPortions,
      );
      setCalcResult(recalculated);
      setIsDirty(true);
    } catch (err: any) {
      showError(err?.message || 'Error al redondear lotes');
    } finally {
      setUpdatingRecipeId(null);
    }
  };

  // Redondear todas las recetas activas a múltiplo de 1 o 2
  const handleRoundAllBatches = async (multiple: 1 | 2) => {
    if (!calcResult || loading) return;
    setLoading(true);
    try {
      const updatedRecipes = calcResult.plannedRecipes.map((pr) => {
        if (pr.calculatedBatches > 0) {
          let nextBatches = pr.calculatedBatches;
          if (multiple === 1) {
            nextBatches = Math.ceil(pr.calculatedBatches);
          } else if (multiple === 2) {
            nextBatches = Math.ceil(pr.calculatedBatches / 2) * 2;
            if (nextBatches === 0 && pr.calculatedBatches > 0) nextBatches = 2;
          }
          return {
            ...pr,
            calculatedBatches: nextBatches,
          };
        }
        return pr;
      });

      const recalculated = await productionPlanningService.recalculateFromCustomPlan(
        updatedRecipes,
        currentWeekMonday,
        calcResult.totalDemandedPortions,
      );
      setCalcResult(recalculated);
      setIsDirty(true);
      showSuccess(`Todos los lotes redondeados al múltiplo de ${multiple} superior.`);
    } catch (err: any) {
      showError(err?.message || 'Error al redondear');
    } finally {
      setLoading(false);
    }
  };

  // Alternar días de producción para una receta
  const handleToggleRecipeDay = async (recipeId: string, dayNum: number) => {
    if (!calcResult || updatingRecipeId) return;
    setUpdatingRecipeId(recipeId);
    try {
      const updatedRecipes = calcResult.plannedRecipes.map((pr) => {
        if (pr.recipeId === recipeId) {
          const days = pr.suggestedDays || [];
          const exists = days.includes(dayNum);
          let nextDays = exists ? days.filter((d) => d !== dayNum) : [...days, dayNum];
          if (nextDays.length === 0) nextDays = [dayNum]; // Mantener al menos 1 día
          return {
            ...pr,
            suggestedDays: nextDays.sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b)),
          };
        }
        return pr;
      });

      const recalculated = await productionPlanningService.recalculateFromCustomPlan(
        updatedRecipes,
        currentWeekMonday,
        calcResult.totalDemandedPortions,
      );
      setCalcResult(recalculated);
      setIsDirty(true);
    } catch (err: any) {
      showError(err?.message || 'Error al actualizar cronograma');
    } finally {
      setUpdatingRecipeId(null);
    }
  };

  // Guardar / Confirmar Plan Semanal congelado
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
        const days = pr.suggestedDays && pr.suggestedDays.length > 0 ? pr.suggestedDays : [1];
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

      // Guardar el snapshot completo congelado en notes
      const notesPayload = JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        snapshot: calcResult,
        completedPurchases: Object.keys(completedPurchasesMap).filter((k) => completedPurchasesMap[k]),
      });

      await productionPlanningService.savePlan({
        storeId: cpStore.id,
        weekStartDate: currentWeekMonday,
        status: 'APPROVED',
        totalPlannedMinutes: calcResult.totalEstimatedMinutes,
        notes: notesPayload,
        items: itemsToSave,
      });

      showSuccess('Plan semanal guardado y congelado con éxito');
      loadPlanData();
    } catch (err: any) {
      showError(err?.message || 'Error al guardar el plan');
    } finally {
      setSaving(false);
    }
  };

  // Marcar compra completada
  const handleTogglePurchase = async (supplyId: string) => {
    const nextState = !completedPurchasesMap[supplyId];
    const newPurchasesMap = {
      ...completedPurchasesMap,
      [supplyId]: nextState,
    };
    setCompletedPurchasesMap(newPurchasesMap);

    if (savedPlan) {
      try {
        const stores = await storeRepo.getAll();
        const cpStore = stores.find((s) => s.isProductionCenter);
        if (cpStore) {
          let existingSnapshot = calcResult;
          if (savedPlan.notes && savedPlan.notes.startsWith('{')) {
            try {
              const parsed = JSON.parse(savedPlan.notes);
              if (parsed.snapshot) existingSnapshot = parsed.snapshot;
            } catch {}
          }

          const notesPayload = JSON.stringify({
            version: 1,
            savedAt: new Date().toISOString(),
            snapshot: existingSnapshot,
            completedPurchases: Object.keys(newPurchasesMap).filter((k) => newPurchasesMap[k]),
          });

          await productionPlanningService.savePlan({
            storeId: cpStore.id,
            weekStartDate: currentWeekMonday,
            status: savedPlan.status,
            totalPlannedMinutes: savedPlan.totalPlannedMinutes,
            notes: notesPayload,
            items: savedPlan.items as any,
          });
        }
      } catch (err) {
        console.error('Error toggling purchase in DB:', err);
      }
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

  // Filtrado dinámico de compras según el día seleccionado
  const filteredRawPurchases = useMemo(() => {
    if (!calcResult) return [];
    if (purchasesDayFilter === null) return calcResult.rawPurchases;

    return calcResult.rawPurchases.filter((p) => {
      const g = p.dailyRequirements ? p.dailyRequirements[purchasesDayFilter] : 0;
      return g && g > 0;
    });
  }, [calcResult, purchasesDayFilter]);

  // Presupuesto total estimado de compras (Semana o Día filtrado)
  const totalBudget = useMemo(() => {
    if (!calcResult) return 0;
    if (purchasesDayFilter !== null) {
      return filteredRawPurchases.reduce((sum, p) => {
        const dayCost = p.dailyCostCop ? p.dailyCostCop[purchasesDayFilter] : 0;
        return sum + (dayCost || 0);
      }, 0);
    }
    return filteredRawPurchases.reduce((sum, p) => sum + (p.estimatedCostCop || 0), 0);
  }, [calcResult, filteredRawPurchases, purchasesDayFilter]);

  const completedBudget = useMemo(() => {
    if (!calcResult) return 0;
    if (purchasesDayFilter !== null) {
      return filteredRawPurchases
        .filter((p) => completedPurchasesMap[p.supplyId])
        .reduce((sum, p) => {
          const dayCost = p.dailyCostCop ? p.dailyCostCop[purchasesDayFilter] : 0;
          return sum + (dayCost || 0);
        }, 0);
    }
    return filteredRawPurchases
      .filter((p) => completedPurchasesMap[p.supplyId])
      .reduce((sum, p) => sum + (p.estimatedCostCop || 0), 0);
  }, [calcResult, filteredRawPurchases, completedPurchasesMap, purchasesDayFilter]);

  // Copiar lista de compras para WhatsApp (Semana o Día específico) con presupuesto
  const handleCopyPurchaseList = () => {
    if (!calcResult || filteredRawPurchases.length === 0) {
      showError('No hay compras calculadas');
      return;
    }

    const purchasesToBuy = filteredRawPurchases.filter((p) => p.toPurchaseGrams > 0);
    if (purchasesToBuy.length === 0) {
      showSuccess('¡No hay compras pendientes para esta selección!');
      return;
    }

    const lines: string[] = [];
    if (purchasesDayFilter !== null) {
      lines.push(`🛒 *PEDIDO DE MATERIA PRIMA (Producción ${DAY_LABELS[purchasesDayFilter]} - Semana ${formatDate(currentWeekMonday)})*`);
    } else {
      lines.push(`🛒 *PEDIDO DE MATERIA PRIMA (Semana ${formatDate(currentWeekMonday)})*`);
    }
    lines.push(`💰 *Presupuesto Estimado: ${formatCOP(totalBudget)}*`);
    lines.push(``);

    purchasesToBuy.forEach((p) => {
      const isDone = !!completedPurchasesMap[p.supplyId];
      const check = isDone ? '✅' : '⬜';
      
      let cantFormatted = '';
      let costFormatted = '';
      if (purchasesDayFilter !== null && p.dailyRequirements && p.dailyRequirements[purchasesDayFilter]) {
        const gramsForDay = p.dailyRequirements[purchasesDayFilter];
        const unitsForDay = Math.ceil(gramsForDay / (p.presentationGrams || 1000));
        const dayCost = p.dailyCostCop ? p.dailyCostCop[purchasesDayFilter] || 0 : unitsForDay * (p.unitCostCop || 0);
        cantFormatted = `${unitsForDay} unid. (~${gramsForDay >= 1000 ? (gramsForDay / 1000).toFixed(1) + ' kg' : gramsForDay + ' g'})`;
        costFormatted = dayCost > 0 ? ` · ${formatCOP(dayCost)}` : '';
      } else {
        const totalFormatted = p.toPurchaseGrams >= 1000
          ? `${(p.toPurchaseGrams / 1000).toFixed(1)} kg`
          : `${p.toPurchaseGrams} g`;
        cantFormatted = `${p.toPurchaseUnits} unid. (${totalFormatted})`;
        costFormatted = p.estimatedCostCop > 0 ? ` · ${formatCOP(p.estimatedCostCop)}` : '';
      }

      lines.push(`${check} *${p.supplyName}*: ${cantFormatted}${costFormatted}`);
    });

    lines.push(``);
    lines.push(`_Generado automáticamente desde 6K Pizza_`);
    const fullText = lines.join('\n');

    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(fullText);
      showSuccess('¡Lista de compras copiada al portapapeles!');
    } else {
      Alert.alert('Lista de Compras', fullText);
    }
  };

  // Metricas de avance
  const totalTasksCount = useMemo(() => {
    if (!calcResult) return 0;
    return calcResult.plannedRecipes.reduce((sum, r) => {
      if (r.calculatedBatches <= 0) return sum;
      return sum + (r.suggestedDays ? r.suggestedDays.length : 1);
    }, 0);
  }, [calcResult]);

  const completedTasksCount = useMemo(() => {
    return Object.values(completedItemsMap).filter(Boolean).length;
  }, [completedItemsMap]);

  const progressPercent = totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 0;

  const totalPurchasesCount = useMemo(() => {
    return filteredRawPurchases.filter((p) => p.toPurchaseGrams > 0).length;
  }, [filteredRawPurchases]);

  const completedPurchasesCount = useMemo(() => {
    return filteredRawPurchases.filter((p) => p.toPurchaseGrams > 0 && completedPurchasesMap[p.supplyId]).length;
  }, [filteredRawPurchases, completedPurchasesMap]);

  const purchasesPercent = totalPurchasesCount > 0 ? Math.round((completedPurchasesCount / totalPurchasesCount) * 100) : 0;

  const totalBatches = useMemo(() => {
    if (!calcResult) return 0;
    return calcResult.plannedRecipes.reduce((sum, r) => sum + r.calculatedBatches, 0);
  }, [calcResult]);

  return (
    <ScreenContainer scrollable={true}>
      {/* SELECTOR DE SEMANA */}
      <View style={styles.weekSelectorContainer}>
        <IconButton
          icon="chevron-left"
          iconColor="#F5F0EB"
          size={24}
          onPress={() => setCurrentWeekMonday((prev) => shiftWeek(prev, -1))}
        />
        <View style={{ alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text variant="titleMedium" style={{ color: '#F5F0EB', fontWeight: 'bold' }}>
              Semana del {formatDate(currentWeekMonday)}
            </Text>
            {currentWeekMonday === getMondayOfWeek(todayColombia()) ? (
              <Chip compact textStyle={{ fontSize: 10, color: '#4CAF50' }} style={{ backgroundColor: '#142016' }}>
                En Curso
              </Chip>
            ) : currentWeekMonday === shiftWeek(getMondayOfWeek(todayColombia()), 1) ? (
              <Chip compact textStyle={{ fontSize: 10, color: '#2196F3' }} style={{ backgroundColor: '#131E29' }}>
                Próxima Semana
              </Chip>
            ) : null}
          </View>
          <Text variant="bodySmall" style={{ color: '#999' }}>
            Plan Maestro de Producción (MPS) & Compras (MRP)
          </Text>
        </View>
        <IconButton
          icon="chevron-right"
          iconColor="#F5F0EB"
          size={24}
          onPress={() => setCurrentWeekMonday((prev) => shiftWeek(prev, 1))}
        />
      </View>

      {/* ESTADO DEL PLAN (CONGELADO VS BORRADOR / RECALCULAR) */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: isFrozenPlan ? '#122616' : '#261F12',
          borderWidth: 1,
          borderColor: isFrozenPlan ? '#4CAF50' : '#FF9800',
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 8,
          marginBottom: 12,
        }}
      >
        <View style={{ flex: 1, paddingRight: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text
              variant="labelMedium"
              style={{
                color: isFrozenPlan ? '#4CAF50' : '#FF9800',
                fontWeight: 'bold',
              }}
            >
              {isFrozenPlan
                ? '🟢 Plan Oficial Guardado (Estático / Congelado)'
                : isDirty
                ? '💾 Cambios sin guardar en el plan'
                : '🟡 Proyección en Vivo (Borrador)'}
            </Text>
          </View>
          <Text variant="bodySmall" style={{ color: '#AAA', fontSize: 11 }}>
            {isFrozenPlan
              ? 'Volúmenes y cronograma fijos. Tareas y compras son dinámicas en tiempo real.'
              : isDirty
              ? 'Has modificado lotes o días. Presiona "Guardar Plan" para congelar.'
              : 'Calculado según demanda proyectada y stock actual en planta.'}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          {isFrozenPlan && (
            <Button
              mode="outlined"
              compact
              icon="refresh"
              textColor="#4CAF50"
              style={{ borderColor: '#4CAF50', borderRadius: 8 }}
              onPress={handleRecalculateLive}
            >
              Recalcular en Vivo
            </Button>
          )}

          {(!isFrozenPlan || isDirty) && (
            <Button
              mode="contained"
              compact
              icon="content-save"
              buttonColor="#E63946"
              loading={saving}
              disabled={saving}
              style={{ borderRadius: 8 }}
              onPress={handleSavePlan}
            >
              Guardar Plan
            </Button>
          )}
        </View>
      </View>

      {/* BARRA DE PROGRESO DE TAREAS */}
      {totalTasksCount > 0 && (
        <View
          style={{
            backgroundColor: '#1E1E1E',
            borderRadius: 10,
            padding: 10,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: '#333',
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text variant="labelMedium" style={{ color: progressPercent === 100 ? '#4CAF50' : '#F5F0EB', fontWeight: 'bold' }}>
              {progressPercent === 100 ? '✅ ¡Semana 100% Cumplida!' : '📋 Avance de Tareas de Producción'}
            </Text>
            <Text variant="labelMedium" style={{ color: '#F5F0EB', fontWeight: 'bold' }}>
              {completedTasksCount} de {totalTasksCount} tareas ({progressPercent}%)
            </Text>
          </View>

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
        <LoadingIndicator message="Cargando plan maestro de producción..." />
      ) : !calcResult ? (
        <EmptyState
          icon="calendar-alert"
          title="Sin datos"
          subtitle="No fue posible cargar el plan para esta semana."
        />
      ) : (
        <>
          {/* ========================================================= */}
          {/* PESTAÑA 1: LOTES A PRODUCIR (MPS) */}
          {/* ========================================================= */}
          {tab === 'mps' && (
            <View>
              <View style={styles.tabHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text variant="titleMedium" style={{ color: '#F5F0EB', fontWeight: 'bold' }}>
                    Plan Maestro de Producción (Lotes)
                  </Text>
                  <Text variant="bodySmall" style={{ color: '#999' }}>
                    Ajusta los lotes y los días de producción antes de guardar
                  </Text>
                </View>
                {(!isFrozenPlan || isDirty) && (
                  <Button
                    mode="contained"
                    icon="content-save"
                    buttonColor="#E63946"
                    loading={saving}
                    disabled={saving}
                    onPress={handleSavePlan}
                    compact
                  >
                    Guardar
                  </Button>
                )}
              </View>

              {/* BOTONES DE REDONDEO GLOBAL */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                <Text variant="labelSmall" style={{ color: '#888', marginRight: 2 }}>
                  Redondeo Rápido:
                </Text>
                <TouchableOpacity
                  onPress={() => handleRoundAllBatches(1)}
                  disabled={updatingRecipeId !== null}
                  style={styles.roundAllBtn}
                >
                  <Text style={styles.roundAllBtnText}>⬆️ Todos a 1 (Enteros)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleRoundAllBatches(2)}
                  disabled={updatingRecipeId !== null}
                  style={styles.roundAllBtn}
                >
                  <Text style={styles.roundAllBtnText}>⬆️ Todos a 2 (Pares)</Text>
                </TouchableOpacity>
              </View>

              {calcResult.plannedRecipes.map((pr) => {
                const needsProduction = pr.calculatedBatches > 0;
                const isUpdatingThis = updatingRecipeId === pr.recipeId;
                const producedGrams = Math.round(pr.calculatedBatches * pr.outputGrams);
                const demandedGrams = pr.weeklyDemandedGrams || 0;

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
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text variant="titleSmall" style={{ color: '#F5F0EB', fontWeight: 'bold' }}>
                              {pr.recipeName}
                            </Text>
                            {isUpdatingThis && (
                              <ActivityIndicator size={14} color="#E63946" />
                            )}
                          </View>
                          <Text variant="bodySmall" style={{ color: '#999', marginTop: 2 }}>
                            Fabricará: <Text style={{ color: '#4CAF50', fontWeight: 'bold' }}>{producedGrams.toLocaleString()} g</Text> ({pr.calculatedBags} bolsas) · Demanda Puntos: <Text style={{ color: '#E63946', fontWeight: 'bold' }}>{demandedGrams.toLocaleString()} g</Text>
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
                          <Text variant="labelSmall" style={{ color: '#999' }}>Demanda Locales:</Text>
                          <Text variant="bodySmall" style={{ color: '#E63946', fontWeight: 'bold' }}>
                            {demandedGrams.toLocaleString()} g
                          </Text>
                        </View>
                        <View style={styles.metricItem}>
                          <Text variant="labelSmall" style={{ color: '#999' }}>Stock Actual CP:</Text>
                          <Text variant="bodySmall" style={{ color: '#F5F0EB', fontWeight: 'bold' }}>
                            {pr.currentStockGrams.toLocaleString()} g
                          </Text>
                        </View>
                        <View style={styles.metricItem}>
                          <Text variant="labelSmall" style={{ color: '#999' }}>Total a Fabricar:</Text>
                          <Text variant="bodySmall" style={{ color: needsProduction ? '#4CAF50' : '#888', fontWeight: 'bold' }}>
                            {producedGrams.toLocaleString()} g
                          </Text>
                        </View>
                      </View>

                      {/* SELECTOR DE DÍAS INTERACTIVO */}
                      <View style={{ marginTop: 10, backgroundColor: '#171717', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#2A2A2A' }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <Text variant="labelSmall" style={{ color: '#CCC', fontWeight: '600' }}>
                            📅 Días Programados de Producción:
                          </Text>
                          <Text variant="labelSmall" style={{ color: '#E63946', fontWeight: '600' }}>
                            {pr.suggestedDays?.length || 0} día(s)
                          </Text>
                        </View>

                        <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
                          {WEEK_DAYS_OPTIONS.map((dayObj) => {
                            const isSelected = pr.suggestedDays?.includes(dayObj.d);
                            return (
                              <TouchableOpacity
                                key={dayObj.d}
                                onPress={() => handleToggleRecipeDay(pr.recipeId, dayObj.d)}
                                disabled={isUpdatingThis}
                                style={{
                                  paddingHorizontal: 8,
                                  paddingVertical: 5,
                                  borderRadius: 6,
                                  backgroundColor: isSelected ? '#E63946' : '#222',
                                  borderWidth: 1,
                                  borderColor: isSelected ? '#E63946' : '#333',
                                  opacity: isUpdatingThis ? 0.6 : 1,
                                }}
                              >
                                <Text
                                  style={{
                                    color: isSelected ? '#FFF' : '#888',
                                    fontSize: 11,
                                    fontWeight: isSelected ? 'bold' : 'normal',
                                  }}
                                >
                                  {dayObj.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>

                      {/* CONTROLES DE AJUSTE MANUAL Y REDONDEO */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, flexWrap: 'wrap', gap: 6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Text variant="labelSmall" style={{ color: '#888' }}>Redondear:</Text>
                          <TouchableOpacity
                            onPress={() => handleRoundRecipeBatches(pr.recipeId, 1)}
                            disabled={isUpdatingThis}
                            style={[styles.roundMiniBtn, isUpdatingThis && { opacity: 0.5 }]}
                          >
                            <Text style={styles.roundMiniBtnText}>A 1</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleRoundRecipeBatches(pr.recipeId, 2)}
                            disabled={isUpdatingThis}
                            style={[styles.roundMiniBtn, isUpdatingThis && { opacity: 0.5 }]}
                          >
                            <Text style={styles.roundMiniBtnText}>A 2</Text>
                          </TouchableOpacity>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <TouchableOpacity
                            onPress={() => handleUpdateRecipeBatches(pr.recipeId, -1)}
                            disabled={isUpdatingThis}
                            style={[styles.stepperBtn, isUpdatingThis && { opacity: 0.5 }]}
                          >
                            <Text style={styles.stepperBtnText}>-1</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleUpdateRecipeBatches(pr.recipeId, -0.5)}
                            disabled={isUpdatingThis}
                            style={[styles.stepperBtn, isUpdatingThis && { opacity: 0.5 }]}
                          >
                            <Text style={styles.stepperBtnText}>-0.5</Text>
                          </TouchableOpacity>
                          <View style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#2A2A2A', borderRadius: 4, minWidth: 44, alignItems: 'center' }}>
                            <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 13 }}>{pr.calculatedBatches}</Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => handleUpdateRecipeBatches(pr.recipeId, 0.5)}
                            disabled={isUpdatingThis}
                            style={[styles.stepperBtn, isUpdatingThis && { opacity: 0.5 }]}
                          >
                            <Text style={styles.stepperBtnText}>+0.5</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleUpdateRecipeBatches(pr.recipeId, 1)}
                            disabled={isUpdatingThis}
                            style={[styles.stepperBtn, isUpdatingThis && { opacity: 0.5 }]}
                          >
                            <Text style={styles.stepperBtnText}>+1</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </Card.Content>
                  </Card>
                );
              })}
            </View>
          )}

          {/* ========================================================= */}
          {/* PESTAÑA 2: COMPRAS DE MATERIA PRIMA (RAW - TIME PHASED MRP) */}
          {/* ========================================================= */}
          {tab === 'raw' && (
            <View>
              <View style={styles.tabHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text variant="titleMedium" style={{ color: '#F5F0EB', fontWeight: 'bold' }}>
                    Requerimientos de Compra (Materia Prima)
                  </Text>
                  <Text variant="bodySmall" style={{ color: '#999' }}>
                    {purchasesDayFilter !== null
                      ? `Insumos requeridos para la producción del ${DAY_LABELS[purchasesDayFilter]}`
                      : 'Insumos crudos necesarios para fabricar toda la producción semanal'}
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
                  {purchasesDayFilter !== null ? `Copiar (${DAY_LABELS[purchasesDayFilter]})` : 'Copiar Pedido'}
                </Button>
              </View>

              {/* TARJETA DE PRESUPUESTO ESTIMADO DE COMPRAS (COP) */}
              <View
                style={{
                  backgroundColor: '#171D18',
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: '#264D2C',
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <View>
                  <Text variant="labelSmall" style={{ color: '#8BC34A', fontWeight: '600' }}>
                    💰 {purchasesDayFilter !== null
                      ? `Presupuesto Compras (${DAY_LABELS[purchasesDayFilter]}):`
                      : 'Presupuesto Total Compras (Semana):'}
                  </Text>
                  <Text variant="headlineSmall" style={{ color: '#4CAF50', fontWeight: 'bold', marginTop: 2 }}>
                    {formatCOP(totalBudget)}
                  </Text>
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="labelSmall" style={{ color: '#999' }}>Ejecutado / Comprado:</Text>
                  <Text variant="titleMedium" style={{ color: '#F5F0EB', fontWeight: 'bold', marginTop: 2 }}>
                    {formatCOP(completedBudget)}
                  </Text>
                  <Text variant="labelSmall" style={{ color: '#888', fontSize: 10 }}>
                    {totalBudget > 0 ? Math.round((completedBudget / totalBudget) * 100) : 0}% del valor total
                  </Text>
                </View>
              </View>

              {/* SELECTOR DE DÍAS PARA COMPRAS (TIME-PHASED MRP) */}
              <View style={{ marginBottom: 12 }}>
                <Text variant="labelSmall" style={{ color: '#999', marginBottom: 6 }}>
                  Filtrar compras por día de producción:
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  <TouchableOpacity
                    onPress={() => setPurchasesDayFilter(null)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 8,
                      backgroundColor: purchasesDayFilter === null ? '#E63946' : '#222',
                      borderWidth: 1,
                      borderColor: purchasesDayFilter === null ? '#E63946' : '#333',
                    }}
                  >
                    <Text
                      style={{
                        color: purchasesDayFilter === null ? '#FFF' : '#AAA',
                        fontSize: 11,
                        fontWeight: purchasesDayFilter === null ? 'bold' : 'normal',
                      }}
                    >
                      📦 Toda la Semana
                    </Text>
                  </TouchableOpacity>

                  {WEEK_DAYS_OPTIONS.map((dayObj) => {
                    const isSelected = purchasesDayFilter === dayObj.d;
                    const itemsOnDay = calcResult.rawPurchases.filter(
                      (p) => p.dailyRequirements && (p.dailyRequirements[dayObj.d] ?? 0) > 0
                    ).length;

                    return (
                      <TouchableOpacity
                        key={dayObj.d}
                        onPress={() => setPurchasesDayFilter(dayObj.d)}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 8,
                          backgroundColor: isSelected ? '#E63946' : '#222',
                          borderWidth: 1,
                          borderColor: isSelected ? '#E63946' : '#333',
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 5,
                        }}
                      >
                        <Text
                          style={{
                            color: isSelected ? '#FFF' : '#AAA',
                            fontSize: 11,
                            fontWeight: isSelected ? 'bold' : 'normal',
                          }}
                        >
                          {dayObj.label}
                        </Text>
                        {itemsOnDay > 0 && (
                          <View
                            style={{
                              backgroundColor: isSelected ? 'rgba(0,0,0,0.35)' : '#333',
                              borderRadius: 10,
                              paddingHorizontal: 5,
                              paddingVertical: 1,
                            }}
                          >
                            <Text
                              style={{
                                color: isSelected ? '#FFF' : '#4CAF50',
                                fontSize: 9,
                                fontWeight: 'bold',
                              }}
                            >
                              {itemsOnDay}
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Barra de progreso de compras */}
              <View
                style={{
                  backgroundColor: purchasesPercent === 100 ? '#122616' : '#261F12',
                  borderWidth: 1,
                  borderColor: purchasesPercent === 100 ? '#4CAF50' : '#FF9800',
                  borderRadius: 10,
                  padding: 10,
                  marginBottom: 12,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text variant="labelMedium" style={{ color: purchasesPercent === 100 ? '#4CAF50' : '#FF9800', fontWeight: 'bold' }}>
                    {purchasesPercent === 100
                      ? '✅ ¡Todas las compras completadas!'
                      : purchasesDayFilter !== null
                      ? `🛒 Compras para Producción del ${DAY_LABELS[purchasesDayFilter]}`
                      : '🛒 Avance de Compras Semanales'}
                  </Text>
                  <Text variant="labelMedium" style={{ color: '#F5F0EB', fontWeight: 'bold' }}>
                    {completedPurchasesCount} de {totalPurchasesCount} comprados ({purchasesPercent}%)
                  </Text>
                </View>

                <View style={{ height: 6, backgroundColor: '#333', borderRadius: 3, overflow: 'hidden' }}>
                  <View
                    style={{
                      height: '100%',
                      width: `${purchasesPercent}%`,
                      backgroundColor: purchasesPercent === 100 ? '#4CAF50' : '#FF9800',
                    }}
                  />
                </View>
              </View>

              {filteredRawPurchases.length === 0 ? (
                <EmptyState
                  icon="check-circle"
                  title="Sin Compras para este Día"
                  subtitle="No se requieren materias primas para la jornada seleccionada o el stock actual es suficiente."
                />
              ) : (
                filteredRawPurchases.map((raw) => {
                  const toBuy = raw.toPurchaseGrams > 0;
                  const isDone = !!completedPurchasesMap[raw.supplyId];

                  // Si hay filtro de día, mostrar la necesidad de ese día y su costo
                  const gramsOnFilterDay = purchasesDayFilter !== null && raw.dailyRequirements
                    ? raw.dailyRequirements[purchasesDayFilter] || 0
                    : null;
                  
                  const costOnFilterDay = purchasesDayFilter !== null && raw.dailyCostCop
                    ? raw.dailyCostCop[purchasesDayFilter] || 0
                    : raw.estimatedCostCop || 0;

                  return (
                    <Card
                      key={raw.supplyId}
                      style={[
                        styles.itemCard,
                        {
                          backgroundColor: isDone ? '#142016' : '#1E1E1E',
                          borderLeftWidth: 4,
                          borderLeftColor: isDone ? '#4CAF50' : toBuy ? '#FF9800' : '#4CAF50',
                          opacity: isDone ? 0.7 : 1,
                        },
                      ]}
                    >
                      <Card.Content>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 8 }}>
                            {toBuy && (
                              <Checkbox
                                status={isDone ? 'checked' : 'unchecked'}
                                onPress={() => handleTogglePurchase(raw.supplyId)}
                                color="#4CAF50"
                              />
                            )}
                            <Pressable
                              style={{ flex: 1, paddingLeft: 4 }}
                              onPress={() => toBuy && handleTogglePurchase(raw.supplyId)}
                            >
                              <Text
                                variant="titleSmall"
                                style={[
                                  { color: '#F5F0EB', fontWeight: 'bold' },
                                  isDone && { textDecorationLine: 'line-through', color: '#999' },
                                ]}
                              >
                                {raw.supplyName}
                              </Text>
                              <Text variant="bodySmall" style={{ color: '#999' }}>
                                Presentación: {raw.presentationGrams}g por bolsa/unidad · Costo: <Text style={{ color: '#4CAF50' }}>{formatCOP(raw.unitCostCop || 0)}</Text>
                              </Text>

                              {/* Badges de días en que se usa */}
                              {raw.requiredDays && raw.requiredDays.length > 0 && (
                                <View style={{ flexDirection: 'row', gap: 4, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                                  <Text variant="labelSmall" style={{ color: '#777', fontSize: 10 }}>Usado en:</Text>
                                  {raw.requiredDays.map((d) => (
                                    <View
                                      key={d}
                                      style={{
                                        backgroundColor: purchasesDayFilter === d ? '#E63946' : '#2A2A2A',
                                        paddingHorizontal: 6,
                                        paddingVertical: 1,
                                        borderRadius: 4,
                                      }}
                                    >
                                      <Text
                                        style={{
                                          color: purchasesDayFilter === d ? '#FFF' : '#AAA',
                                          fontSize: 9,
                                          fontWeight: purchasesDayFilter === d ? 'bold' : '600',
                                        }}
                                      >
                                        {DAY_LABELS[d] || 'Día'}
                                      </Text>
                                    </View>
                                  ))}
                                </View>
                              )}
                            </Pressable>
                          </View>

                          <View style={{ alignItems: 'flex-end' }}>
                            <Text
                              variant="titleMedium"
                              style={{
                                color: isDone ? '#4CAF50' : toBuy ? '#FF9800' : '#4CAF50',
                                fontWeight: 'bold',
                              }}
                            >
                              {isDone ? 'Comprado' : toBuy ? `${raw.toPurchaseUnits} unid.` : 'Suficiente'}
                            </Text>
                            {toBuy && (
                              <>
                                <Text variant="bodySmall" style={{ color: isDone ? '#999' : '#F5F0EB' }}>
                                  ({raw.toPurchaseGrams >= 1000 ? (raw.toPurchaseGrams / 1000).toFixed(1) + ' kg' : raw.toPurchaseGrams + ' g'})
                                </Text>
                                <Text variant="labelSmall" style={{ color: '#4CAF50', fontWeight: 'bold', marginTop: 2 }}>
                                  {formatCOP(costOnFilterDay)}
                                </Text>
                              </>
                            )}
                          </View>
                        </View>

                        <Divider style={{ backgroundColor: '#333', marginVertical: 8 }} />

                        <View style={styles.metricsGrid}>
                          <View style={styles.metricItem}>
                            <Text variant="labelSmall" style={{ color: '#999' }}>
                              {gramsOnFilterDay !== null ? `Uso el ${DAY_LABELS[purchasesDayFilter!]}:` : 'Requerido Semana:'}
                            </Text>
                            <Text variant="bodySmall" style={{ color: '#F5F0EB', fontWeight: 'bold' }}>
                              {gramsOnFilterDay !== null ? `${gramsOnFilterDay.toLocaleString()} g` : `${raw.requiredGrams.toLocaleString()} g`}
                            </Text>
                          </View>
                          <View style={styles.metricItem}>
                            <Text variant="labelSmall" style={{ color: '#999' }}>Stock Bodega RAW:</Text>
                            <Text variant="bodySmall" style={{ color: '#F5F0EB' }}>
                              {raw.currentRawStockGrams.toLocaleString()} g
                            </Text>
                          </View>
                          <View style={styles.metricItem}>
                            <Text variant="labelSmall" style={{ color: '#999' }}>A Comprar Total:</Text>
                            <Text
                              variant="bodySmall"
                              style={{
                                color: isDone ? '#4CAF50' : toBuy ? '#FF9800' : '#4CAF50',
                                fontWeight: 'bold',
                              }}
                            >
                              {raw.toPurchaseGrams.toLocaleString()} g
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
                    Distribución de recetas por día según los días asignados en Lotes
                  </Text>
                </View>
                {(!isFrozenPlan || isDirty) && (
                  <Button
                    mode="contained"
                    icon="content-save"
                    buttonColor="#E63946"
                    loading={saving}
                    disabled={saving}
                    onPress={handleSavePlan}
                    compact
                  >
                    Guardar
                  </Button>
                )}
              </View>

              {calcResult.daySummaries.map((day) => {
                // Obtener las recetas planeadas para este día
                const dayRecipes = calcResult.plannedRecipes.filter(
                  (r) => r.calculatedBatches > 0 && r.suggestedDays && r.suggestedDays.includes(day.dayOfWeek)
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
                          const daysCount = r.suggestedDays ? r.suggestedDays.length : 1;
                          const batchesForDay = daysCount > 1
                            ? (r.calculatedBatches / daysCount).toFixed(1)
                            : r.calculatedBatches;
                          const bagsForDay = Math.ceil(r.calculatedBags / daysCount);

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
                                  {batchesForDay} lote(s) · {bagsForDay} bolsa(s) · ~{Math.round(r.totalEstMinutes / daysCount)} min
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
  stepperBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#333',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#444',
  },
  stepperBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
  },
  roundMiniBtn: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: '#262626',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#3D3D3D',
  },
  roundMiniBtnText: {
    color: '#4CAF50',
    fontSize: 10,
    fontWeight: 'bold',
  },
  roundAllBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#1A2A1A',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  roundAllBtnText: {
    color: '#4CAF50',
    fontSize: 11,
    fontWeight: '600',
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
