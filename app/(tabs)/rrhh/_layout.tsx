import { Stack } from 'expo-router';
import { useTheme } from 'react-native-paper';
import { HeaderUserMenu } from '../../../src/components/common/HeaderUserMenu';

export default function RRHHLayout() {
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
          title: 'Recursos Humanos',
          headerBackVisible: false,
          headerRight: () => <HeaderUserMenu />,
        }}
      />
      <Stack.Screen name="horarios" options={{ title: 'Horarios' }} />
      <Stack.Screen name="asistencia" options={{ title: 'Asistencia' }} />
      <Stack.Screen name="nomina" options={{ title: 'Nomina' }} />
      <Stack.Screen name="reporte" options={{ title: 'Reporte Diario' }} />
    </Stack>
  );
}
