import React from 'react';
import { Portal, Dialog, Button, Text } from 'react-native-paper';

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
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={confirmLoading ? undefined : onDismiss}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium">{message}</Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss} disabled={confirmLoading}>Cancelar</Button>
          <Button
            onPress={onConfirm}
            loading={confirmLoading}
            disabled={confirmLoading}
            textColor={destructive ? '#D32F2F' : undefined}
          >
            {confirmLabel}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
