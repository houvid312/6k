import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Menu, Text, Divider, Chip } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAppStore } from '../../stores/useAppStore';
import { useMasterDataStore } from '../../stores/useMasterDataStore';
import { useDI } from '../../di/providers';
import { UserRole } from '../../domain/enums';

export function HeaderUserMenu() {
  const { userName, userRole, logout, selectedStoreId, stores } = useAppStore();
  const { refreshMasterData, loading: refreshing } = useMasterDataStore();
  const { authService } = useDI();
  const [visible, setVisible] = useState(false);

  const handleLogout = async () => {
    setVisible(false);
    await authService.logout();
    logout();
    router.replace('/login');
  };

  const storeName = stores.find(s => s.id === selectedStoreId)?.name ?? 'Sin Local';
  const roleLabel = (() => {
    switch (userRole) {
      case UserRole.GERENTE: return 'Gerente';
      case UserRole.ADMIN_LOCAL: return 'Admin Local';
      case UserRole.PREPARADOR: return 'Preparador';
      case UserRole.RODY: return 'Rody';
      case UserRole.VENDEDOR: return 'Vendedor';
      default: return 'Colaborador';
    }
  })();

  return (
    <View style={styles.container}>
      <Chip
        compact
        mode="outlined"
        style={styles.storeChip}
        textStyle={styles.storeChipText}
        icon={({ size }) => (
          <MaterialCommunityIcons name="store" size={size} color="#D4A843" />
        )}
      >
        {storeName}
      </Chip>
      <Menu
        visible={visible}
        onDismiss={() => setVisible(false)}
        anchor={
          <Pressable onPress={() => setVisible(true)} style={styles.anchor}>
            <MaterialCommunityIcons name="account-circle" size={26} color="#F5F0EB" />
          </Pressable>
        }
        anchorPosition="bottom"
      >
        <Menu.Item
          title={userName}
          leadingIcon="account"
          disabled
          titleStyle={styles.nameItem}
        />
        <Menu.Item
          title={roleLabel}
          leadingIcon="shield-account"
          disabled
          titleStyle={styles.roleItem}
        />
        <Divider />
        <Menu.Item
          title={refreshing ? 'Recargando...' : 'Recargar datos'}
          leadingIcon="refresh"
          onPress={() => {
            setVisible(false);
            refreshMasterData();
          }}
          disabled={refreshing}
        />
        <Menu.Item
          title="Cerrar Sesion"
          leadingIcon="logout"
          onPress={handleLogout}
        />
      </Menu>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  anchor: {
    marginRight: 12,
    padding: 4,
  },
  storeChip: {
    backgroundColor: '#2A2A2A',
    borderColor: '#D4A843',
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
  },
  storeChipText: {
    color: '#D4A843',
    fontSize: 11,
    fontWeight: 'bold',
    marginVertical: 0,
    paddingHorizontal: 2,
  },
  nameItem: {
    fontWeight: '600',
  },
  roleItem: {
    fontSize: 13,
    color: '#8B8178',
  },
});
