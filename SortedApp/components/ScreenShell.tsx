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
      colors={[colors.background, colors.panel]}
      style={styles.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
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
