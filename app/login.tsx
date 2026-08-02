import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, useWindowDimensions, Image } from 'react-native';
import {
  Text,
  Button,
  TextInput,
  Surface,
  useTheme,
  HelperText,
} from 'react-native-paper';
import { router } from 'expo-router';
import { useAppStore } from '../src/stores/useAppStore';
import { useMasterDataStore } from '../src/stores/useMasterDataStore';
import { useDI } from '../src/di/providers';

export default function LoginScreen() {
  const theme = useTheme();
  const { login, loadStores } = useAppStore();
  const { loadMasterData } = useMasterDataStore();
  const { authService } = useDI();

  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);

  const handleLogin = async () => {
    if (!name.trim() || !pin.trim()) return;
    setError('');
    setLoading(true);
    try {
      const result = await authService.login(name.trim(), pin.trim());
      if (result.success && result.user) {
        login(result.user.id, result.user.name, result.user.role, result.user.storeIds);
        await loadStores();
        await loadMasterData();
        router.replace('/(tabs)/ventas');
      } else {
        setError(result.error ?? 'Error al iniciar sesion');
      }
    } catch {
      setError('Error inesperado. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const { height } = useWindowDimensions();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'web' ? undefined : Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.inner, { height }]}>
        {/* Decorative circles */}
        <View style={styles.decorCircle1} />
        <View style={styles.decorCircle2} />

        <View style={styles.header}>
          <Image
            source={require('../assets/logo.png')}
            style={styles.logoImage}
          />
          <Text style={styles.brand}>P I Z Z A</Text>
          <View style={styles.taglineRow}>
            <View style={styles.taglineLine} />
            <Text style={styles.subtitle}>GESTION INTEGRAL</Text>
            <View style={styles.taglineLine} />
          </View>
        </View>

        <Surface style={styles.card} elevation={0}>
          <Text variant="titleLarge" style={styles.title}>Bienvenido</Text>
          <Text style={styles.titleSub}>Ingresa tus credenciales</Text>

          <TextInput
            label="Usuario"
            value={name}
            onChangeText={(v) => { setName(v.replace(/\s/g, '').toLowerCase()); setError(''); }}
            mode="outlined"
            style={styles.input}
            left={<TextInput.Icon icon="account-outline" />}
            autoCapitalize="none"
            autoCorrect={false}
            outlineColor="#3A3A3A"
            activeOutlineColor="#E63946"
            textColor="#F5F0EB"
            theme={{ colors: { onSurfaceVariant: '#8B8178' } }}
          />

          <TextInput
            label="PIN"
            value={pin}
            onChangeText={(v) => { setPin(v.replace(/[^0-9]/g, '').slice(0, 6)); setError(''); }}
            mode="outlined"
            style={styles.input}
            left={<TextInput.Icon icon="lock-outline" />}
            right={
              <TextInput.Icon
                icon={showPin ? 'eye-off-outline' : 'eye-outline'}
                onPress={() => setShowPin(!showPin)}
              />
            }
            secureTextEntry={!showPin}
            keyboardType="numeric"
            maxLength={6}
            outlineColor="#3A3A3A"
            activeOutlineColor="#E63946"
            textColor="#F5F0EB"
            theme={{ colors: { onSurfaceVariant: '#8B8178' } }}
          />

          {error ? (
            <HelperText type="error" visible style={{ color: '#FF6B6B' }}>
              {error}
            </HelperText>
          ) : null}

          <Button
            mode="contained"
            onPress={handleLogin}
            style={styles.button}
            contentStyle={styles.buttonContent}
            labelStyle={styles.buttonLabel}
            disabled={!name.trim() || pin.length < 6 || loading}
            loading={loading}
            buttonColor="#E63946"
            textColor="#FFFFFF"
          >
            Ingresar
          </Button>
        </Surface>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111111',
    overflow: 'hidden',
  },
  inner: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    overflow: 'hidden',
  },
  decorCircle1: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(230, 57, 70, 0.08)',
  },
  decorCircle2: {
    position: 'absolute',
    bottom: -30,
    left: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(212, 168, 67, 0.06)',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 12,
  },
  brand: {
    fontSize: 20,
    fontFamily: 'Arvo',
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 14,
    paddingLeft: 14,
    textAlign: 'center',
  },
  taglineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 10,
  },
  taglineLine: {
    height: 1,
    width: 36,
    backgroundColor: 'rgba(212, 168, 67, 0.3)',
  },
  subtitle: {
    fontSize: 10,
    color: '#8B8178',
    letterSpacing: 4,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 20,
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#2E2E2E',
  },
  title: {
    textAlign: 'center',
    fontWeight: '700',
    color: '#F5F0EB',
  },
  titleSub: {
    textAlign: 'center',
    fontSize: 13,
    color: '#8B8178',
    marginBottom: 16,
    marginTop: 4,
  },
  input: {
    marginBottom: 12,
    backgroundColor: '#242424',
  },
  button: {
    marginTop: 6,
    borderRadius: 12,
  },
  buttonContent: {
    paddingVertical: 6,
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
