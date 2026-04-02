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
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerTitle: () => <HeaderLogo />,
          headerBackVisible: false,
          headerRight: () => <HeaderUserMenu />,
        }}
      />
      <Stack.Screen
        name="historial"
        options={{
          headerTitle: () => <HeaderLogo />,
          headerBackVisible: true,
          headerBackTitle: 'Volver',
          headerRight: () => <HeaderUserMenu />,
        }}
      />
      <Stack.Screen
        name="cierre-caja"
        options={{
          headerTitle: () => <HeaderLogo />,
          headerBackVisible: true,
          headerBackTitle: 'Volver',
          headerRight: () => <HeaderUserMenu />,
        }}
      />
    </Stack>
  );
}
