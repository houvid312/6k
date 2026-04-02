import React, { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Menu, Text, Divider } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAppStore } from '../../stores/useAppStore';
import { useDI } from '../../di/providers';
import { UserRole } from '../../domain/enums';

export function HeaderUserMenu() {
  const { userName, userRole, logout } = useAppStore();
  const { authService } = useDI();
  const [visible, setVisible] = useState(false);

  const handleLogout = async () => {
    setVisible(false);
    await authService.logout();
    logout();
    router.replace('/login');
  };

  const roleLabel = userRole === UserRole.ADMIN ? 'Admin' : 'Colaborador';

  return (
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
        title="Cerrar Sesion"
        leadingIcon="logout"
        onPress={handleLogout}
      />
    </Menu>
  );
}

const styles = StyleSheet.create({
  anchor: {
    marginRight: 12,
    padding: 4,
  },
  nameItem: {
    fontWeight: '600',
  },
  roleItem: {
    fontSize: 13,
    color: '#8B8178',
  },
});
