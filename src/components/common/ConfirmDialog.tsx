import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Portal, Text, Button } from 'react-native-paper';

interface Props {
  visible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onDismiss: () => void;
  confirmLabel?: string;
  destructive?: boolean;
  confirmLoading?: boolean;
}

export function ConfirmDialog({
  visible,
  title,
  message,
  onConfirm,
  onDismiss,
  confirmLabel = 'Confirmar',
  destructive = false,
  confirmLoading = false,
}: Props) {
  if (!visible) return null;

  return (
    <Portal>
      <View style={styles.overlay}>
        <Pressable
          style={styles.backdrop}
          onPress={confirmLoading ? undefined : onDismiss}
        />
        <View style={styles.dialog}>
          <Text variant="titleMedium" style={styles.title}>
            {title}
          </Text>
          <Text variant="bodyMedium" style={styles.message}>
            {message}
          </Text>
          <View style={styles.actions}>
            <Button
              mode="outlined"
              onPress={onDismiss}
              disabled={confirmLoading}
              style={styles.actionBtn}
              textColor="#999"
            >
              Cancelar
            </Button>
            <Button
              mode="contained"
              onPress={onConfirm}
              loading={confirmLoading}
              disabled={confirmLoading}
              buttonColor={destructive ? '#D32F2F' : '#E63946'}
              textColor="#FFFFFF"
              style={styles.actionBtn}
            >
              {confirmLabel}
            </Button>
          </View>
        </View>
      </View>
    </Portal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  dialog: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 24,
    width: '85%',
    maxWidth: 400,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  title: {
    color: '#F5F0EB',
    fontWeight: '700',
    marginBottom: 12,
  },
  message: {
    color: '#CCCCCC',
    marginBottom: 24,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  actionBtn: {
    borderRadius: 8,
  },
});
