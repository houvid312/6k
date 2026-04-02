import { MD3DarkTheme } from 'react-native-paper';
import { colors } from './colors';
import { spacing, borderRadius } from './spacing';

export const theme = {
  ...MD3DarkTheme,
  roundness: borderRadius.md,
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
