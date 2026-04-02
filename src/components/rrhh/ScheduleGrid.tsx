import React from 'react';
import { ScrollView, View, StyleSheet } from 'react-native';
import { Text, useTheme, Surface } from 'react-native-paper';
import { Schedule, Worker } from '../../domain/entities';
import { DAYS_OF_WEEK } from '../../utils/constants';

interface Props {
  workers: Worker[];
  schedules: Schedule[];
}

export function ScheduleGrid({ workers, schedules }: Props) {
  const theme = useTheme();

  const getScheduleForWorkerDay = (workerId: string, dayIndex: number): Schedule | undefined => {
    return schedules.find((s) => s.workerId === workerId && s.dayOfWeek === dayIndex);
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
              const schedule = getScheduleForWorkerDay(worker.id, dayIndex);
              return (
                <View key={dayIndex} style={styles.dayCell}>
                  {schedule ? (
                    <Surface
                      style={[styles.scheduleBlock, { backgroundColor: theme.colors.primaryContainer }]}
                      elevation={0}
                    >
                      <Text variant="labelSmall" style={{ fontSize: 9, textAlign: 'center' }}>
                        {schedule.startTime}
                      </Text>
                      <Text variant="labelSmall" style={{ fontSize: 9, textAlign: 'center' }}>
                        {schedule.endTime}
                      </Text>
                    </Surface>
                  ) : (
                    <Text variant="labelSmall" style={{ color: theme.colors.outline, textAlign: 'center' }}>
                      --
                    </Text>
                  )}
                </View>
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
    alignItems: 'center',
  },
  nameCell: {
    width: 100,
    paddingRight: 8,
  },
  dayCell: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleBlock: {
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
});
