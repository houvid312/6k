import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ActivityIndicator, View } from 'react-native';
import { theme } from '../src/theme';
import { DIProvider } from '../src/di/providers';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../src/lib/supabase';
import { useAppStore } from '../src/stores/useAppStore';
import { useMasterDataStore } from '../src/stores/useMasterDataStore';
import { UserRole } from '../src/domain/enums';

function AuthGate({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const { login, loadStores, isAuthenticated } = useAppStore();
  const { loadMasterData } = useMasterDataStore();

  useEffect(() => {
    (async () => {
      try {
        // Verificar si hay sesión persistida
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
          // Recuperar perfil del worker con sus asignaciones de local
          const { data: worker } = await supabase
            .from('workers')
            .select('id, name, user_role, worker_store_assignments(store_id)')
            .eq('auth_user_id', session.user.id)
            .single();

          if (worker) {
            const rawAssignments = (worker as any).worker_store_assignments || [];
            const storeIds = rawAssignments.map((a: any) => a.store_id);
            login(worker.id, worker.name, worker.user_role as UserRole, storeIds);
            await loadStores();
            await loadMasterData();
          }
        }
      } catch {
        // Sesión inválida, se queda sin autenticar
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111111' }}>
        <ActivityIndicator size="large" color="#E63946" />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <DIProvider>
          <AuthGate>
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false }} />
          </AuthGate>
        </DIProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
