import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useAppStore } from '../../stores/useAppStore';

export function HeaderLogo() {
  const userName = useAppStore((s) => s.userName);

  return (
    <View style={styles.container}>
      <View style={styles.logoRing}>
        <Text style={styles.logo}>6K</Text>
      </View>
      <View>
        <Text style={styles.brand}>6K Pizza</Text>
        <Text style={styles.userName}>{userName}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoRing: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(230, 57, 70, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#D4A843',
  },
  logo: {
    fontSize: 13,
    fontWeight: '900',
    color: '#F5F0EB',
    letterSpacing: 1,
  },
  brand: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F5F0EB',
  },
  userName: {
    fontSize: 11,
    color: '#D4A843',
    fontWeight: '500',
  },
});
