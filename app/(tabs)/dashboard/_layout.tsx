import { Stack } from 'expo-router';
import { useTheme } from 'react-native-paper';
import { HeaderUserMenu } from '../../../src/components/common/HeaderUserMenu';

export default function DashboardLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#1A1A1A" },
        headerTintColor: '#F5F0EB',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Dashboard',
          headerRight: () => <HeaderUserMenu />,
        }}
      />
    </Stack>
  );
}
