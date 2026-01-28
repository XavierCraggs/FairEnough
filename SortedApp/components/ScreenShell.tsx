import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { StatusBar } from 'expo-status-bar';
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
  const isLightBackground = (() => {
    const hex = colors.background.replace('#', '');
    if (hex.length !== 6) return true;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance > 0.6;
  })();

  return (
    <LinearGradient
      colors={[colors.background, colors.accentSoft, colors.accentMuted, colors.panel]}
      style={styles.gradient}
      start={{ x: 0.05, y: 0.15 }}
      end={{ x: 0.95, y: 0.85 }}
      locations={[0, 0.4, 0.75, 1]}
    >
      <StatusBar style={isLightBackground ? 'dark' : 'light'} />
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
