import { MD3DarkTheme, configureFonts } from 'react-native-paper';
import { colors } from './colors';
import { spacing, borderRadius } from './spacing';

const baseFont = {
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const boldFont = {
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontWeight: '700' as const,
};

const semiBoldFont = {
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontWeight: '600' as const,
};

const mediumFont = {
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontWeight: '500' as const,
};

export const brandFont = {
  fontFamily: 'Arvo, serif',
  fontWeight: '700' as const,
};

const customFonts = {
  displayLarge: { ...boldFont, fontSize: 56, lineHeight: 64, letterSpacing: -0.5 },
  displayMedium: { ...boldFont, fontSize: 44, lineHeight: 52, letterSpacing: -0.25 },
  displaySmall: { ...boldFont, fontSize: 36, lineHeight: 44, letterSpacing: 0 },
  
  headlineLarge: { ...boldFont, fontSize: 32, lineHeight: 40, letterSpacing: -0.2 },
  headlineMedium: { ...semiBoldFont, fontSize: 26, lineHeight: 34, letterSpacing: -0.1 },
  headlineSmall: { ...semiBoldFont, fontSize: 22, lineHeight: 30, letterSpacing: 0 },
  
  titleLarge: { ...semiBoldFont, fontSize: 20, lineHeight: 26, letterSpacing: 0 },
  titleMedium: { ...semiBoldFont, fontSize: 16, lineHeight: 22, letterSpacing: 0.1 },
  titleSmall: { ...semiBoldFont, fontSize: 14, lineHeight: 20, letterSpacing: 0.1 },
  
  labelLarge: { ...semiBoldFont, fontSize: 14, lineHeight: 20, letterSpacing: 0.1 },
  labelMedium: { ...mediumFont, fontSize: 12, lineHeight: 16, letterSpacing: 0.2 },
  labelSmall: { ...mediumFont, fontSize: 11, lineHeight: 16, letterSpacing: 0.3 },
  
  bodyLarge: { ...baseFont, fontSize: 16, lineHeight: 24, letterSpacing: 0 },
  bodyMedium: { ...baseFont, fontSize: 14, lineHeight: 20, letterSpacing: 0 },
  bodySmall: { ...baseFont, fontSize: 12, lineHeight: 16, letterSpacing: 0 },
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
