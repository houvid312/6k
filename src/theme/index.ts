import { MD3DarkTheme, configureFonts } from 'react-native-paper';
import { colors } from './colors';
import { spacing, borderRadius } from './spacing';

const baseFont = {
  fontFamily: 'Lato',
};

const titleFont = {
  fontFamily: 'Arvo',
  fontWeight: '700' as const,
};

const customFonts = {
  displayLarge: { ...baseFont, fontSize: 57, lineHeight: 64, letterSpacing: -0.25 },
  displayMedium: { ...baseFont, fontSize: 45, lineHeight: 52, letterSpacing: 0 },
  displaySmall: { ...baseFont, fontSize: 36, lineHeight: 44, letterSpacing: 0 },
  
  headlineLarge: { ...titleFont, fontSize: 32, lineHeight: 40, letterSpacing: 0 },
  headlineMedium: { ...titleFont, fontSize: 28, lineHeight: 36, letterSpacing: 0 },
  headlineSmall: { ...titleFont, fontSize: 24, lineHeight: 32, letterSpacing: 0 },
  
  titleLarge: { ...titleFont, fontSize: 22, lineHeight: 28, letterSpacing: 0 },
  titleMedium: { ...titleFont, fontSize: 16, lineHeight: 24, letterSpacing: 0.15 },
  titleSmall: { ...titleFont, fontSize: 14, lineHeight: 20, letterSpacing: 0.1 },
  
  labelLarge: { ...baseFont, fontSize: 14, lineHeight: 20, letterSpacing: 0.1 },
  labelMedium: { ...baseFont, fontSize: 12, lineHeight: 16, letterSpacing: 0.5 },
  labelSmall: { ...baseFont, fontSize: 11, lineHeight: 16, letterSpacing: 0.5 },
  
  bodyLarge: { ...baseFont, fontSize: 16, lineHeight: 24, letterSpacing: 0.15 },
  bodyMedium: { ...baseFont, fontSize: 14, lineHeight: 20, letterSpacing: 0.25 },
  bodySmall: { ...baseFont, fontSize: 12, lineHeight: 16, letterSpacing: 0.4 },
};

export const theme = {
  ...MD3DarkTheme,
  roundness: borderRadius.md,
  fonts: configureFonts({ config: customFonts }),
  colors: {
    ...MD3DarkTheme.colors,
    primary: colors.primary,
    primaryContainer: colors.primaryContainer,
    secondary: colors.secondary,
    secondaryContainer: colors.secondaryContainer,
    background: colors.background,
    surface: colors.surface,
    surfaceVariant: colors.surfaceVariant,
    error: colors.error,
    errorContainer: colors.errorContainer,
    onPrimary: colors.onPrimary,
    onSecondary: colors.onSecondary,
    onBackground: colors.text,
    onSurface: colors.text,
    onSurfaceVariant: colors.textSecondary,
    outline: colors.border,
    outlineVariant: colors.borderLight,
    inverseSurface: colors.text,
    inverseOnSurface: colors.background,
    surfaceDisabled: colors.disabled,
    elevation: {
      level0: 'transparent',
      level1: colors.surface,
      level2: colors.surfaceVariant,
      level3: colors.elevated,
      level4: colors.elevated,
      level5: colors.elevated,
    },
  },
};

export { colors, spacing, borderRadius };
