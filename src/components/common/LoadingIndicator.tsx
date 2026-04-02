import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';

interface Props {
  message?: string;
}

export function LoadingIndicator({ message }: Props) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
      {message && (
        <Text variant="bodyMedium" style={[styles.message, { color: theme.colors.onSurfaceVariant }]}>
          {message}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    minHeight: 200,
  },
  message: {
    marginTop: 16,
    textAlign: 'center',
  },
});
