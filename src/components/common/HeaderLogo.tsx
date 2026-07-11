// Casing fix reload trigger
import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { Text } from 'react-native-paper';
import { useAppStore } from '../../stores/useAppStore';

export function HeaderLogo() {
  const userName = useAppStore((s) => s.userName);

  return (
    <View style={styles.container}>
      <Image
        source={require('../../../assets/logo.png')}
        style={styles.logoImage}
      />
      <View style={styles.textContainer}>
        <Text style={styles.brand} numberOfLines={1}>Pizza</Text>
        <Text style={styles.userName} numberOfLines={1}>{userName}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  textContainer: {
    flexShrink: 1,
  },
  logoImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  brand: {
    fontSize: 14,
    fontFamily: 'Arvo',
    fontWeight: '700',
    color: '#F5F0EB',
  },
  userName: {
    fontSize: 11,
    color: '#D4A843',
    fontWeight: '500',
  },
});
