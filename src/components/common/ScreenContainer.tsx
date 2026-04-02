import React from 'react';
import { ScrollView, View, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from 'react-native-paper';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  scrollable?: boolean;
  padded?: boolean;
}

export function ScreenContainer({ children, style, scrollable = true, padded = true }: Props) {
  const theme = useTheme();
  const containerStyle = [styles.container, { backgroundColor: theme.colors.background }, style];

  if (scrollable) {
    return (
      <ScrollView
        style={containerStyle}
        contentContainerStyle={padded ? styles.content : undefined}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    );
  }
  return (
    <View style={[containerStyle, padded && styles.content]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
});
