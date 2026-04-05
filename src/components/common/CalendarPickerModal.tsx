import React, { useState, useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text, Portal, Modal, IconButton } from 'react-native-paper';

interface Props {
  visible: boolean;
  selectedDate: string; // YYYY-MM-DD
  onSelect: (date: string) => void;
  onDismiss: () => void;
  maxDate?: string; // YYYY-MM-DD
}

const DAY_NAMES = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'];
const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function CalendarPickerModal({ visible, selectedDate, onSelect, onDismiss, maxDate }: Props) {
  const [year, month] = selectedDate.split('-').map(Number);
  const [viewYear, setViewYear] = useState(year || new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState((month || new Date().getMonth() + 1) - 1); // 0-indexed

  const days = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0);
    const daysInMonth = lastDay.getDate();

    // Monday = 0, Sunday = 6
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;

    const cells: (number | null)[] = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    // Pad to fill last row
    while (cells.length % 7 !== 0) cells.push(null);

    return cells;
  }, [viewYear, viewMonth]);

  const goToPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const handleSelect = (day: number) => {
    const dateStr = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
    if (maxDate && dateStr > maxDate) return;
    onSelect(dateStr);
  };

  const isSelected = (day: number): boolean => {
    return selectedDate === `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
  };

  const isDisabled = (day: number): boolean => {
    if (!maxDate) return false;
    return `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}` > maxDate;
  };

  const todayStr = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  })();

  const isToday = (day: number): boolean => {
    return todayStr === `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
  };

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.modal}>
        {/* Month/Year Header */}
        <View style={styles.header}>
          <IconButton icon="chevron-left" iconColor="#F5F0EB" size={24} onPress={goToPrevMonth} />
          <Text variant="titleMedium" style={styles.monthTitle}>
            {MONTH_NAMES[viewMonth]} {viewYear}
          </Text>
          <IconButton icon="chevron-right" iconColor="#F5F0EB" size={24} onPress={goToNextMonth} />
        </View>

        {/* Day name headers */}
        <View style={styles.weekRow}>
          {DAY_NAMES.map((name) => (
            <View key={name} style={styles.dayCell}>
              <Text style={styles.dayName}>{name}</Text>
            </View>
          ))}
        </View>

        {/* Calendar grid */}
        {Array.from({ length: Math.ceil(days.length / 7) }).map((_, weekIdx) => (
          <View key={weekIdx} style={styles.weekRow}>
            {days.slice(weekIdx * 7, weekIdx * 7 + 7).map((day, dayIdx) => (
              <View key={dayIdx} style={styles.dayCell}>
                {day !== null ? (
                  <Pressable
                    onPress={() => handleSelect(day)}
                    disabled={isDisabled(day)}
                    style={[
                      styles.dayBtn,
                      isSelected(day) && styles.dayBtnSelected,
                      isToday(day) && !isSelected(day) && styles.dayBtnToday,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        isSelected(day) && styles.dayTextSelected,
                        isDisabled(day) && styles.dayTextDisabled,
                        isToday(day) && !isSelected(day) && styles.dayTextToday,
                      ]}
                    >
                      {day}
                    </Text>
                  </Pressable>
                ) : (
                  <View style={styles.dayBtn} />
                )}
              </View>
            ))}
          </View>
        ))}
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: {
    margin: 20,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#1E1E1E',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  monthTitle: {
    color: '#F5F0EB',
    fontWeight: '600',
  },
  weekRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 2,
  },
  dayName: {
    fontSize: 11,
    color: '#777',
    fontWeight: '600',
    paddingBottom: 6,
  },
  dayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBtnSelected: {
    backgroundColor: '#E63946',
  },
  dayBtnToday: {
    borderWidth: 1,
    borderColor: '#E63946',
  },
  dayText: {
    fontSize: 14,
    color: '#F5F0EB',
  },
  dayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dayTextDisabled: {
    color: '#444',
  },
  dayTextToday: {
    color: '#E63946',
    fontWeight: '600',
  },
});
