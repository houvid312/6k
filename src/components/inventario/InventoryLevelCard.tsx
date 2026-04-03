import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, TextInput, Button, Portal, Modal, useTheme } from 'react-native-paper';
import { InventorySummaryItem } from '../../services/InventoryService';

interface Props {
  item: InventorySummaryItem;
  minimumGrams?: number;
  onSetMinimum?: (supplyId: string, grams: number) => void;
}

function getStockColor(current: number, minimum: number): string {
  if (minimum <= 0) return '#555';
  const ratio = current / minimum;
  if (ratio >= 1.5) return '#388E3C';
  if (ratio >= 1) return '#F57C00';
  return '#D32F2F';
}

function getStockLabel(current: number, minimum: number): string {
  if (minimum <= 0) return 'Sin minimo configurado';
  const ratio = current / minimum;
  if (ratio >= 1.5) return 'Stock alto';
  if (ratio >= 1) return 'Stock medio';
  if (ratio >= 0.5) return 'Stock bajo';
  return 'Stock critico';
}

export function InventoryLevelCard({ item, minimumGrams = 0, onSetMinimum }: Props) {
  const theme = useTheme();
  const stockColor = getStockColor(item.quantityGrams, minimumGrams);
  const barWidth = minimumGrams > 0
    ? Math.min(100, (item.quantityGrams / (minimumGrams * 2)) * 100)
    : 0;

  const [modalVisible, setModalVisible] = useState(false);
  const [editValue, setEditValue] = useState('');

  const handleOpenModal = () => {
    if (!onSetMinimum) return;
    setEditValue(minimumGrams > 0 ? String(minimumGrams) : '');
    setModalVisible(true);
  };

  const handleSave = () => {
    const grams = parseFloat(editValue);
    if (!isNaN(grams) && grams >= 0 && onSetMinimum) {
      onSetMinimum(item.supplyId, grams);
    }
    setModalVisible(false);
  };

  return (
    <>
      <Card style={styles.card} mode="elevated" onPress={handleOpenModal}>
        <Card.Content>
          <View style={styles.header}>
            <Text variant="titleSmall" style={{ fontWeight: '600' }}>
              {item.supplyName}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {item.gramsPerBag}g/bolsa
            </Text>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text variant="headlineSmall" style={{ fontWeight: 'bold' }}>
                {item.bags}
              </Text>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Bolsas
              </Text>
            </View>
            <View style={styles.stat}>
              <Text variant="headlineSmall" style={{ fontWeight: 'bold' }}>
                {Math.round(item.looseGrams)}
              </Text>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Gramos sueltos
              </Text>
            </View>
            <View style={styles.stat}>
              <Text variant="titleMedium" style={{ fontWeight: '600' }}>
                {Math.round(item.quantityGrams)}g
              </Text>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Total
              </Text>
            </View>
          </View>

          {minimumGrams > 0 ? (
            <>
              <View style={styles.barBackground}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${barWidth}%`, backgroundColor: stockColor },
                  ]}
                />
              </View>
              <View style={styles.minRow}>
                <Text variant="labelSmall" style={{ color: stockColor, fontWeight: '600' }}>
                  {getStockLabel(item.quantityGrams, minimumGrams)}
                </Text>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Min: {Math.round(minimumGrams)}g ({Math.ceil(minimumGrams / item.gramsPerBag)} bolsas)
                </Text>
              </View>
            </>
          ) : onSetMinimum ? (
            <Text variant="labelSmall" style={{ color: '#666', textAlign: 'center', marginTop: 4 }}>
              Toca para configurar stock minimo
            </Text>
          ) : null}
        </Card.Content>
      </Card>

      <Portal>
        <Modal
          visible={modalVisible}
          onDismiss={() => setModalVisible(false)}
          contentContainerStyle={[styles.modal, { backgroundColor: '#1E1E1E' }]}
        >
          <Text variant="titleMedium" style={{ color: '#F5F0EB', fontWeight: '600', marginBottom: 4 }}>
            Stock minimo: {item.supplyName}
          </Text>
          <Text variant="bodySmall" style={{ color: '#999', marginBottom: 16 }}>
            Actual: {Math.round(item.quantityGrams)}g ({item.bags} bolsas)
          </Text>

          <TextInput
            label="Gramos minimos"
            value={editValue}
            onChangeText={setEditValue}
            keyboardType="decimal-pad"
            mode="outlined"
            style={{ marginBottom: 8, backgroundColor: '#111' }}
            outlineColor="#333"
            activeOutlineColor="#E63946"
            textColor="#F5F0EB"
            right={<TextInput.Affix text="g" textStyle={{ color: '#999' }} />}
          />

          {editValue && !isNaN(parseFloat(editValue)) && parseFloat(editValue) > 0 && (
            <Text variant="bodySmall" style={{ color: '#999', marginBottom: 8 }}>
              = {Math.ceil(parseFloat(editValue) / item.gramsPerBag)} bolsas minimas
            </Text>
          )}

          <View style={styles.modalActions}>
            <Button mode="outlined" onPress={() => setModalVisible(false)} style={{ flex: 1, marginRight: 8 }}>
              Cancelar
            </Button>
            <Button mode="contained" onPress={handleSave} buttonColor="#E63946" style={{ flex: 1 }}>
              Guardar
            </Button>
          </View>
        </Modal>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 8,
    borderRadius: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  stat: {
    alignItems: 'center',
  },
  barBackground: {
    height: 6,
    backgroundColor: '#333',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
  minRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  modal: {
    margin: 20,
    padding: 20,
    borderRadius: 12,
  },
  modalActions: {
    flexDirection: 'row',
    marginTop: 16,
  },
});
