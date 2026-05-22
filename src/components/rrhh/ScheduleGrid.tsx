import React from 'react';
import { ScrollView, View, StyleSheet, Pressable } from 'react-native';
import { Text, useTheme, Surface } from 'react-native-paper';
import { Schedule, Worker } from '../../domain/entities';
import { DAYS_OF_WEEK } from '../../utils/constants';

interface Props {
  workers: Worker[];
  schedules: Schedule[];
  onCellPress?: (worker: Worker, dayOfWeek: number) => void;
}

export function ScheduleGrid({ workers, schedules, onCellPress }: Props) {
  const theme = useTheme();

  const getSchedulesForWorkerDay = (workerId: string, dayIndex: number): Schedule[] => {
    return schedules
      .filter((s) => s.workerId === workerId && s.dayOfWeek === dayIndex)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        {/* Header row */}
        <View style={styles.headerRow}>
          <View style={styles.nameCell}>
            <Text variant="labelMedium" style={{ fontWeight: 'bold' }}>
              Trabajador
            </Text>
          </View>
          {DAYS_OF_WEEK.map((day, i) => (
            <View key={i} style={styles.dayCell}>
              <Text variant="labelSmall" style={{ fontWeight: '600', textAlign: 'center' }}>
                {day.slice(0, 3)}
              </Text>
            </View>
          ))}
        </View>

        {/* Worker rows */}
        {workers.map((worker) => (
          <View key={worker.id} style={styles.row}>
            <View style={styles.nameCell}>
              <Text variant="bodySmall" numberOfLines={1}>
                {worker.name}
              </Text>
            </View>
            {DAYS_OF_WEEK.map((_, dayIndex) => {
              const daySchedules = getSchedulesForWorkerDay(worker.id, dayIndex);
              const cell = daySchedules.length > 0 ? (
                <View style={styles.blocks}>
                  {daySchedules.map((schedule) => (
                    <Surface
                      key={schedule.id}
                      style={[styles.scheduleBlock, { backgroundColor: theme.colors.primaryContainer }]}
                      elevation={0}
                    >
                      <Text variant="labelSmall" style={styles.timeText}>
                        {schedule.startTime}
                      </Text>
                      <Text variant="labelSmall" style={styles.timeText}>
                        {schedule.endTime}
                      </Text>
                    </Surface>
                  ))}
                </View>
              ) : (
                <Text variant="labelSmall" style={{ color: theme.colors.outline, textAlign: 'center' }}>
                  --
                </Text>
              );
              return (
                <Pressable key={dayIndex} style={styles.dayCell} onPress={() => onCellPress?.(worker, dayIndex)}>
                  {cell}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: '#E0E0E0',
    paddingBottom: 8,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    paddingVertical: 4,
    alignItems: 'stretch',
  },
  nameCell: {
    width: 100,
    paddingRight: 8,
  },
  dayCell: {
    width: 78,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  blocks: {
    gap: 3,
    width: '100%',
  },
  scheduleBlock: {
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  timeText: {
    fontSize: 9,
    textAlign: 'center',
  },
});
