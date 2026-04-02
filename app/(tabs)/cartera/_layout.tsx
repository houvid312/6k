import { Stack } from 'expo-router';
import { useTheme } from 'react-native-paper';
import { HeaderUserMenu } from '../../../src/components/common/HeaderUserMenu';

export default function CarteraLayout() {
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
          title: 'Cartera',
          headerBackVisible: false,
          headerRight: () => <HeaderUserMenu />,
        }}
      />
      <Stack.Screen name="nuevo" options={{ title: 'Nuevo Credito' }} />
      <Stack.Screen name="[id]" options={{ title: 'Detalle Deudor' }} />
    </Stack>
  );
}
