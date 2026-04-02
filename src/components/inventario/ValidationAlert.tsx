import React from 'react';
import { StyleSheet } from 'react-native';
import { Banner } from 'react-native-paper';
import { AlertType } from '../../domain/entities';

const ALERT_CONFIG: Record<AlertType, { icon: string; color: string }> = {
  LOSS: { icon: 'alert-circle', color: '#D32F2F' },
  SURPLUS: { icon: 'information', color: '#F57C00' },
  OK: { icon: 'check-circle', color: '#388E3C' },
};

interface Props {
  type: AlertType;
  message: string;
  visible?: boolean;
}

export function ValidationAlert({ type, message, visible = true }: Props) {
  const config = ALERT_CONFIG[type];

  return (
    <Banner
      visible={visible}
      icon={config.icon}
      style={[styles.banner, { borderLeftColor: config.color, borderLeftWidth: 4 }]}
    >
      {message}
    </Banner>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginBottom: 8,
    borderRadius: 8,
  },
});
