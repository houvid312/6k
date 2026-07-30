import { Stack } from 'expo-router';
import { useTheme } from 'react-native-paper';
import { HeaderUserMenu } from '../../../src/components/common/HeaderUserMenu';
import { HeaderLogo } from '../../../src/components/common/HeaderLogo';

export default function VentasLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#1A1A1A" },
        headerTintColor: '#F5F0EB',
        headerTitleStyle: { fontWeight: '600' },
        headerBackVisible: true,
        headerRight: () => <HeaderUserMenu />,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerTitle: () => <HeaderLogo />,
          headerBackVisible: false,
        }}
      />
      <Stack.Screen
        name="historial"
        options={{
          headerTitle: () => <HeaderLogo />,
          headerBackVisible: true,
          headerBackTitle: 'Volver',
        }}
      />
      <Stack.Screen
        name="cierre-caja"
        options={{
          headerTitle: () => <HeaderLogo />,
          headerBackVisible: true,
          headerBackTitle: 'Volver',
        }}
      />
      <Stack.Screen
        name="consumo-ventas"
        options={{
          title: 'Consumo por Ventas',
          headerBackVisible: true,
          headerBackTitle: 'Volver',
        }}
      />
      <Stack.Screen
        name="apertura-caja"
        options={{
          headerTitle: () => <HeaderLogo />,
          headerBackVisible: true,
          headerBackTitle: 'Volver',
        }}
      />
    </Stack>
  );
}
