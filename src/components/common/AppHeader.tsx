import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Appbar, Menu, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { useAppStore } from '../../stores/useAppStore';
import { useDI } from '../../di/providers';
import { UserRole } from '../../domain/enums';

interface Props {
  title: string;
}

export function AppHeader({ title }: Props) {
  const theme = useTheme();
  const { userName, userRole, logout } = useAppStore();
  const { authService } = useDI();
  const [menuVisible, setMenuVisible] = useState(false);

  const handleLogout = async () => {
    setMenuVisible(false);
    await authService.logout();
    logout();
    router.replace('/login');
  };

  const roleLabel = userRole === UserRole.ADMIN ? 'Admin' : 'Colaborador';

  return (
    <Appbar.Header style={{ backgroundColor: theme.colors.primary }}>
      <Appbar.Content
        title={title}
        titleStyle={styles.title}
        color="#fff"
      />
      <Menu
        visible={menuVisible}
        onDismiss={() => setMenuVisible(false)}
        anchor={
          <Appbar.Action
            icon="account-circle"
            color="#fff"
            onPress={() => setMenuVisible(true)}
          />
        }
        anchorPosition="bottom"
      >
        <Menu.Item
          title={userName}
          leadingIcon="account"
          disabled
        />
        <Menu.Item
          title={roleLabel}
          leadingIcon="shield-account"
          disabled
        />
        <Menu.Item
          title="Cerrar Sesion"
          leadingIcon="logout"
          onPress={handleLogout}
        />
      </Menu>
    </Appbar.Header>
  );
}

const styles = StyleSheet.create({
  title: {
    fontWeight: '700',
    fontSize: 18,
  },
});
