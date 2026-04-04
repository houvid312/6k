import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppStore } from '../../src/stores/useAppStore';
import { UserRole } from '../../src/domain/enums';

export default function TabLayout() {
  const userRole = useAppStore((s) => s.userRole);
  const isAdmin = userRole === UserRole.ADMIN;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#E63946',
        tabBarInactiveTintColor: '#5C5650',
        headerStyle: { backgroundColor: '#1A1A1A' },
        headerTintColor: '#F5F0EB',
        tabBarStyle: {
          height: 56,
          paddingBottom: 6,
          paddingTop: 4,
          backgroundColor: '#1A1A1A',
          borderTopColor: '#2E2E2E',
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontSize: 9, fontWeight: '600', letterSpacing: 0.2 },
        tabBarIconStyle: { marginBottom: -2 },
      }}
    >
      <Tabs.Screen
        name="ventas"
        options={{
          title: 'Ventas',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="cash-register" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="inventario"
        options={{
          title: 'Inventario',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="warehouse" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="contabilidad"
        options={{
          title: 'Contable',
          headerShown: false,
          href: isAdmin ? '/(tabs)/contabilidad' : null,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="bank" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="cartera"
        options={{
          title: 'Cartera',
          headerShown: false,
          href: isAdmin ? '/(tabs)/cartera' : null,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-cash" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="rrhh"
        options={{
          title: 'RRHH',
          headerShown: false,
          href: isAdmin ? '/(tabs)/rrhh' : null,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-group" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          headerShown: false,
          href: isAdmin ? '/(tabs)/dashboard' : null,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="chart-bar" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
