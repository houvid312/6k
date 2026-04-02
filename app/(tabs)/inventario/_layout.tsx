import { Stack } from 'expo-router';
import { useTheme } from 'react-native-paper';
import { HeaderUserMenu } from '../../../src/components/common/HeaderUserMenu';

export default function InventarioLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#1A1A1A" },
        headerTintColor: '#F5F0EB',
        headerTitleStyle: { fontWeight: '600' },
        headerBackVisible: true,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Inventario',
          headerBackVisible: false,
          headerRight: () => <HeaderUserMenu />,
        }}
      />
      <Stack.Screen name="compras" options={{ title: 'Registrar Compra' }} />
      <Stack.Screen name="traslados" options={{ title: 'Traslados' }} />
      <Stack.Screen name="cierre-fisico" options={{ title: 'Cierre Fisico' }} />
      <Stack.Screen name="validaciones" options={{ title: 'Validaciones' }} />
      <Stack.Screen name="recetas" options={{ title: 'Recetas' }} />
    </Stack>
  );
}
