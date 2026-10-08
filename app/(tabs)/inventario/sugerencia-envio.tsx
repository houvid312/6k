import React, { useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, TextInput, Button, Card, Divider, Portal, Snackbar, Chip, useTheme, IconButton } from 'react-native-paper';
import { router } from 'expo-router';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { SearchableSelect } from '../../../src/components/common/SearchableSelect';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useMasterDataStore } from '../../../src/stores/useMasterDataStore';
import { useSnackbar } from '../../../src/hooks';
import { UserRole } from '../../../src/domain/enums';
import { SupplyRequirement } from '../../../src/services/DemandEstimationService';
import { nowColombia } from '../../../src/utils/dates';
import { formatCOP } from '../../../src/utils/currency';

const DAY_OPTIONS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mie' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sab' },
  { value: 0, label: 'Dom' },
];

const DAY_FULL_NAMES: Record<number, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  0: 'Domingo',
};

function getTomorrowDayNum(): number {
  const tomorrow = nowColombia();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.getDay();
}

function parseBagCount(value?: string): number {
  const parsed = Number.parseInt(value ?? '0', 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

type UIRequirement = SupplyRequirement & { isManual?: boolean };

export default function SugerenciaEnvioScreen() {
  const theme = useTheme();
  const { demandEstimationService, transferService } = useDI();
  const { selectedStoreId, stores, userRole } = useAppStore();
  const { supplies, refreshMasterData } = useMasterDataStore();
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();

  const [selectedDays, setSelectedDays] = useState<number[]>([getTomorrowDayNum()]);
  const [requirements, setRequirements] = useState<UIRequirement[]>([]);
  const [editableBags, setEditableBags] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [calculated, setCalculated] = useState(false);
  const isCreatingRef = React.useRef(false);

  React.useEffect(() => {
    if (userRole === UserRole.RODY) {
      router.replace('/(tabs)/inventario/traslados');
      return;
    }
    refreshMasterData();
  }, [userRole, refreshMasterData]);

  const supplyMap = new Map(supplies.map((s) => [s.id, s]));

  const availableOptions = useMemo(() => {
    return supplies
      .filter((s) => s.isActive !== false)
      .filter((s) => s.gramsPerBag && s.gramsPerBag > 0)
      .filter((s) => !(s.category === 'RAW' && !s.isBillableToStore && !s.allowLocalPurchase))
      .filter((s) => !requirements.some((r) => r.supplyId === s.id))
      .map((s) => ({ value: s.id, label: s.name, subtitle: `${s.gramsPerBag}g por bolsa` }));
  }, [supplies, requirements]);

  const handleAddManualSupply = useCallback((supplyId: string) => {
    const supply = supplyMap.get(supplyId);
    if (!supply) return;
    const newReq: UIRequirement = {
      supplyId,
      supplyName: supply.name,
      requiredGrams: 0,
      currentGrams: 0,
      neededGrams: 0,
      bagsToSend: 0,
      gramsPerBag: supply.gramsPerBag || 1,
      isManual: true,
    };
    setRequirements((prev) => [...prev, newReq]);
    setEditableBags((prev) => ({ ...prev, [supplyId]: '' }));
  }, [supplyMap]);

  const handleRemoveManualSupply = useCallback((supplyId: string) => {
    setRequirements((prev) => prev.filter((r) => r.supplyId !== supplyId));
    setEditableBags((prev) => {
      const next = { ...prev };
      delete next[supplyId];
      return next;
    });
  }, []);


  const estimatedTotal = requirements.reduce((sum, req) => {
    const supply = supplyMap.get(req.supplyId);
    const bags = parseBagCount(editableBags[req.supplyId]);
    const isBillable = supply?.isBillableToStore !== false;
    const unitPrice = isBillable ? (Number(supply?.commercialPriceCop) || Number(supply?.productionCostCop) || 0) : 0;
    return sum + bags * unitPrice;
  }, 0);

  const toggleDay = (dayVal: number) => {
    if (selectedDays.includes(dayVal)) {
      if (selectedDays.length > 1) {
        setSelectedDays(selectedDays.filter((d) => d !== dayVal));
      }
    } else {
      setSelectedDays([...selectedDays, dayVal]);
    }
  };

  const applyPreset = (preset: '1' | '2' | 'weekend') => {
    const tom = getTomorrowDayNum();
    if (preset === '1') {
      setSelectedDays([tom]);
    } else if (preset === '2') {
      setSelectedDays([tom, (tom + 1) % 7]);
    } else if (preset === 'weekend') {
      setSelectedDays([5, 6, 0]); // Vie, Sáb, Dom
    }
  };

  const coverageText = selectedDays
    .map((d) => DAY_FULL_NAMES[d])
    .join(', ');

  const handleCalculate = useCallback(async () => {
    if (!selectedStoreId) {
      showError('Selecciona un local');
      return;
    }

    if (selectedDays.length === 0) {
      showError('Selecciona al menos un día');
      return;
    }

    setLoading(true);
    try {
      const result = await demandEstimationService.generateSuggestedTransfer(
        selectedStoreId,
        selectedDays,
      );
      setRequirements((prevReqs) => {
        const manualItems = prevReqs.filter((r) => r.isManual);
        const resultSet = new Set(result.map((r) => r.supplyId));
        const keptManuals = manualItems.filter((m) => !resultSet.has(m.supplyId));
        
        setEditableBags((prevBags) => {
          const bags: Record<string, string> = { ...prevBags };
          for (const req of result) {
            bags[req.supplyId] = String(req.bagsToSend);
          }
          for (const m of keptManuals) {
            if (!(m.supplyId in bags)) bags[m.supplyId] = '';
          }
          return bags;
        });

        return [...result, ...keptManuals];
      });
      setCalculated(true);
      if (result.length === 0) {
        showSuccess('El local tiene inventario suficiente para la demanda estimada');
      }
    } catch {
      showError('Error al calcular sugerencia');
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, selectedDays, demandEstimationService, showSuccess, showError]);

  const handleCreateTransfer = useCallback(async () => {
    if (isCreatingRef.current || creating) return;

    if (!selectedStoreId) {
      showError('Selecciona un local');
      return;
    }

    const productionCenter = stores.find((s) => s.isProductionCenter);
    if (!productionCenter) {
      showError('No hay centro de produccion configurado');
      return;
    }

    const items = requirements.map((req) => ({
      supplyId: req.supplyId,
      currentInventoryGrams: req.currentGrams,
      bagsToSend: parseBagCount(editableBags[req.supplyId]),
      gramsPerBag: req.gramsPerBag,
    }));

    if (!items.some((item) => item.bagsToSend > 0)) {
      showError('Ingresa al menos una bolsa para crear el traslado');
      return;
    }

    isCreatingRef.current = true;
    setCreating(true);
    try {
      await transferService.createTransferOrderFromBags(productionCenter.id, selectedStoreId, items);
      showSuccess('Orden de traslado creada');
      setTimeout(() => router.push('/(tabs)/inventario/traslados'), 1500);
      // Mantener isCreatingRef.current = true y creating = true durante la ventana de redirección
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al crear orden de traslado';
      showError(msg);
      isCreatingRef.current = false;
      setCreating(false);
    }
  }, [stores, selectedStoreId, requirements, editableBags, transferService, showSuccess, showError, creating]);

  return (
    <ScreenContainer scrollable padded>
      <Text variant="titleMedium" style={[styles.title, { color: theme.colors.onBackground }]}>
        Sugerencia de Envio
      </Text>
      <Text variant="bodySmall" style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
        Calculo automatico acumulado para 1, 2 o mas dias de operacion.
      </Text>

      <StoreSelector />

      <Text variant="bodyMedium" style={{ fontWeight: '600', marginTop: 16, marginBottom: 8, color: theme.colors.onBackground }}>
        Periodo de Cobertura Deseado:
      </Text>

      {/* Access Presets */}
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
        <Chip compact onPress={() => applyPreset('1')} style={{ backgroundColor: '#252525' }} textStyle={{ color: '#FFF', fontSize: 11 }}>
          ⚡ 1 Día (Mañana)
        </Chip>
        <Chip compact onPress={() => applyPreset('2')} style={{ backgroundColor: '#252525' }} textStyle={{ color: '#FFF', fontSize: 11 }}>
          📅 2 Días
        </Chip>
        <Chip compact onPress={() => applyPreset('weekend')} style={{ backgroundColor: '#252525' }} textStyle={{ color: '#FFF', fontSize: 11 }}>
          🍕 3 Días (Fin de Semana)
        </Chip>
      </View>

      {/* Multi-Day Selection Chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayScroll}>
        <View style={styles.dayRow}>
          {DAY_OPTIONS.map((day) => {
            const isSelected = selectedDays.includes(day.value);
            return (
              <Chip
                key={day.value}
                selected={isSelected}
                onPress={() => toggleDay(day.value)}
                mode="flat"
                style={[
                  styles.dayChip,
                  isSelected && { backgroundColor: '#E63946' },
                ]}
                textStyle={{
                  color: isSelected ? '#FFFFFF' : '#F5F0EB',
                  fontWeight: isSelected ? '700' : '400',
                }}
                showSelectedOverlay={false}
              >
                {day.label}
              </Chip>
            );
          })}
        </View>
      </ScrollView>

      <View style={{ backgroundColor: '#1E1E1E', padding: 8, borderRadius: 8, marginTop: 8, marginBottom: 12 }}>
        <Text style={{ fontSize: 11, color: '#FFC107' }}>
          📌 Cobertura seleccionada ({selectedDays.length} {selectedDays.length === 1 ? 'día' : 'días'}):{' '}
          <Text style={{ fontWeight: '700', color: '#FFF' }}>{coverageText}</Text>
        </Text>
      </View>

      <Button
        mode="contained"
        onPress={handleCalculate}
        loading={loading}
        disabled={loading}
        icon="calculator"
        style={styles.calcBtn}
        buttonColor="#E63946"
      >
        Calcular Sugerencia ({selectedDays.length} {selectedDays.length === 1 ? 'Día' : 'Días'})
      </Button>

      {calculated && (
        <>
          {requirements.length === 0 ? (
            <EmptyState
              icon="check-circle"
              title="Inventario suficiente"
              subtitle="No se necesita enviar insumos para la demanda estimada"
            />
          ) : (
            <>
              <Text variant="bodySmall" style={{ color: '#999', marginBottom: 8 }}>
                Ajusta las bolsas si necesitas enviar mas o menos de lo sugerido
              </Text>
              <View style={{ paddingBottom: 12 }}><Card style={[styles.totalCard, { backgroundColor: '#1E1E1E', margin: 0, marginBottom: 0 }]}>
                <Card.Content style={styles.totalContent}>
                  <Text variant="bodySmall" style={{ color: '#999' }}>
                    Total estimado para el local
                  </Text>
                  <Text variant="headlineSmall" style={{ color: '#E63946', fontWeight: '800' }}>
                    {formatCOP(estimatedTotal)}
                  </Text>
                </Card.Content></Card></View>

              {requirements.map((req) => (
                <React.Fragment key={req.supplyId}><View style={{ paddingBottom: 12 }}><Card style={[styles.reqCard, { backgroundColor: '#1E1E1E', margin: 0, marginBottom: 0 }]}>
                  <Card.Content>
                    {(() => {
                      const supply = supplyMap.get(req.supplyId);
                      const bags = parseBagCount(editableBags[req.supplyId]);
                      const isBillable = supply?.isBillableToStore !== false;
                      const unitPrice = isBillable ? (Number(supply?.commercialPriceCop) || Number(supply?.productionCostCop) || 0) : 0;
                      const lineTotal = bags * unitPrice;
                      return (
                        <>
                          <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 0 }}>
                            <Text variant="titleSmall" style={{ color: '#F5F0EB', fontWeight: '600' }}>
                              {req.supplyName}
                            </Text>
                            {req.isManual && (
                              <Chip compact style={{ backgroundColor: 'rgba(255, 193, 7, 0.1)', marginLeft: 8 }} textStyle={{fontSize: 10, color: '#FFC107'}}>
                                Manual
                              </Chip>
                            )}
                            {req.isManual && (
                              <IconButton
                                icon="close"
                                size={20}
                                iconColor="#999"
                                onPress={() => handleRemoveManualSupply(req.supplyId)}
                                style={{ marginLeft: 'auto', margin: 0 }}
                              />
                            )}
                          </View>
                          <Text variant="bodySmall" style={{ color: '#999', marginTop: 2 }}>
                            {req.gramsPerBag}g por bolsa
                          </Text>

                          <Divider style={{ backgroundColor: '#333', marginVertical: 8 }} />

                          <View style={styles.reqDetails}>
                            <View style={{ flex: 1 }}>
                              {req.isManual ? (
                                <Text variant="bodySmall" style={{ color: '#FFC107', fontStyle: 'italic' }}>
                                  Agregado manualmente
                                </Text>
                              ) : (
                                <>
                                  <Text variant="bodySmall" style={{ color: '#999' }}>
                                    En tienda: {Math.round(req.currentGrams)}g
                                  </Text>
                                  <Text variant="bodySmall" style={{ color: '#999', marginTop: 2 }}>
                                    Necesita: {Math.round(req.requiredGrams)}g
                                  </Text>
                                </>
                              )}
                            </View>
                            <View style={styles.bagsInputContainer}>
                              <Text variant="bodySmall" style={{ color: '#999', marginBottom: 4 }}>
                                Bolsas
                              </Text>
                              <TextInput
                                mode="outlined"
                                dense
                                keyboardType="numeric"
                                value={editableBags[req.supplyId] ?? ''}
                                onChangeText={(v) =>
                                  setEditableBags((prev) => ({ ...prev, [req.supplyId]: v }))
                                }
                                style={styles.bagsInput}
                                outlineColor="#333"
                                activeOutlineColor="#E63946"
                                textColor="#F5F0EB"
                              />
                            </View>
                          </View>
                          <Divider style={{ backgroundColor: '#333', marginVertical: 8 }} />
                          <View style={styles.priceRow}>
                            <Text variant="bodySmall" style={{ color: '#999' }}>
                              {formatCOP(unitPrice)} c/u
                            </Text>
                            <Text variant="bodyMedium" style={{ color: '#E63946', fontWeight: '700' }}>
                              {formatCOP(lineTotal)}
                            </Text>
                          </View>
                        </>
                      );
                    })()}
                  </Card.Content>
                </Card></View></React.Fragment>))}
            </>
          )}

          <View style={{ marginTop: 16, marginBottom: 16 }}>
            <SearchableSelect
              options={availableOptions}
              placeholder="+ Agregar insumo manualmente..."
              onSelect={handleAddManualSupply}
            />
          </View>

          {requirements.length > 0 && (
            <Button
              mode="contained"
              onPress={handleCreateTransfer}
              loading={creating}
              disabled={creating}
              icon="truck"
              style={styles.createBtn}
            >
              Crear Orden de Traslado
            </Button>
          )}
        </>
      )}

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
    marginBottom: 4,
  },
  subtitle: {
    marginBottom: 16,
  },
  dayScroll: {
    marginBottom: 16,
    flexGrow: 0,
  },
  dayRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dayChip: {
    backgroundColor: '#333',
  },
  calcBtn: {
    marginBottom: 16,
    borderRadius: 8,
    paddingVertical: 4,
  },
  reqCard: {
    marginBottom: 8,
    borderRadius: 12,
  },
  totalCard: {
    marginBottom: 8,
    borderRadius: 12,
  },
  totalContent: {
    alignItems: 'center',
  },
  reqDetails: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bagsInputContainer: {
    alignItems: 'center',
  },
  bagsInput: {
    width: 80,
    backgroundColor: '#111',
    textAlign: 'center',
  },
  createBtn: {
    marginTop: 8,
    borderRadius: 8,
    paddingVertical: 4,
  },
});
