import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text, TextInput, Button, Portal, Modal } from 'react-native-paper';
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
  if (minimum <= 0) return '';
  const ratio = current / minimum;
  if (ratio >= 1.5) return 'Alto';
  if (ratio >= 1) return 'Medio';
  if (ratio >= 0.5) return 'Bajo';
  return 'Critico';
}

export function InventoryLevelCard({ item, minimumGrams = 0, onSetMinimum }: Props) {
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
      <Pressable
        style={[styles.row, minimumGrams > 0 && { borderLeftWidth: 3, borderLeftColor: stockColor }]}
        onPress={onSetMinimum ? handleOpenModal : undefined}
      >
        {/* Left: name + stock bar */}
        <View style={styles.info}>
          <Text variant="bodyMedium" style={styles.name} numberOfLines={1}>
            {item.supplyName}
          </Text>
          {minimumGrams > 0 ? (
            <View style={styles.barRow}>
              <View style={styles.barBg}>
                <View style={[styles.barFill, { width: `${barWidth}%`, backgroundColor: stockColor }]} />
              </View>
              <Text style={[styles.stockLabel, { color: stockColor }]}>
                {getStockLabel(item.quantityGrams, minimumGrams)}
              </Text>
            </View>
          ) : onSetMinimum ? (
            <Text style={styles.noMin}>Toca para min.</Text>
          ) : null}
        </View>

        {/* Right: quantities */}
        <View style={styles.quantities}>
          <Text variant="titleMedium" style={styles.totalGrams}>
            {item.bags > 0 ? `${item.bags}` : '0'}
          </Text>
          <Text style={styles.unitLabel}>bolsa{item.bags !== 1 ? 's' : ''}</Text>
        </View>

        <View style={styles.quantities}>
          <Text variant="titleMedium" style={styles.totalGrams}>
            {Math.round(item.quantityGrams)}
          </Text>
          <Text style={styles.unitLabel}>g total</Text>
        </View>
      </Pressable>

      <Portal>
        <Modal
          visible={modalVisible}
          onDismiss={() => setModalVisible(false)}
          contentContainerStyle={styles.modal}
        >
          <Text variant="titleMedium" style={{ color: '#F5F0EB', fontWeight: '600', marginBottom: 4 }}>
            Stock minimo: {item.supplyName}
          </Text>
          <Text variant="bodySmall" style={{ color: '#999', marginBottom: 16 }}>
            Actual: {Math.round(item.quantityGrams)}g ({item.bags} bolsas de {item.gramsPerBag}g)
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    marginBottom: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  info: {
    flex: 1,
    marginRight: 8,
  },
  name: {
    color: '#F5F0EB',
    fontWeight: '600',
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  barBg: {
    flex: 1,
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: 4,
    borderRadius: 2,
  },
  stockLabel: {
    fontSize: 9,
    fontWeight: '700',
    width: 40,
  },
  noMin: {
    fontSize: 10,
    color: '#555',
    marginTop: 2,
  },
  quantities: {
    alignItems: 'center',
    minWidth: 50,
    marginLeft: 4,
  },
  totalGrams: {
    color: '#F5F0EB',
    fontWeight: '700',
    fontSize: 16,
  },
  unitLabel: {
    fontSize: 9,
    color: '#777',
  },
  modal: {
    margin: 20,
    padding: 20,
    borderRadius: 12,
    backgroundColor: '#1E1E1E',
  },
  modalActions: {
    flexDirection: 'row',
    marginTop: 16,
  },
});
