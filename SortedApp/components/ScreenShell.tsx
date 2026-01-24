import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';

type ScreenShellProps = {
  children: React.ReactNode;
  style?: ViewStyle;
};

export default function ScreenShell({ children, style }: ScreenShellProps) {
  const colors = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={[colors.background, colors.accentSoft, colors.accentMuted, colors.panel]}
      style={styles.gradient}
      start={{ x: 0.05, y: 0.15 }}
      end={{ x: 0.95, y: 0.85 }}
      locations={[0, 0.4, 0.75, 1]}
    >
      <View style={[styles.container, { paddingTop: insets.top + 12 }, style]}>
        {children}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
});
