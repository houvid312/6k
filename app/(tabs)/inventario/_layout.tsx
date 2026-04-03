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
      <Stack.Screen name="produccion" options={{ title: 'Produccion' }} />
      <Stack.Screen name="recetas-produccion" options={{ title: 'Recetas de Produccion' }} />
      <Stack.Screen name="sugerencia-envio" options={{ title: 'Sugerencia de Envio' }} />
      <Stack.Screen name="demanda" options={{ title: 'Demanda Estimada' }} />
      <Stack.Screen name="insumos" options={{ title: 'Insumos' }} />
    </Stack>
  );
}
