import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';
import { AppTheme } from '@/constants/AppColors';
import { selectionChanged } from '@/utils/haptics';

const getIcon =
  (options: BottomTabBarProps['descriptors'][string]['options'], focused: boolean, color: string) =>
  options.tabBarIcon?.({ focused, color, size: 22 });

export default function ButlerTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const colors = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrapper,
        { paddingBottom: Math.max(insets.bottom - 8, 6) },
      ]}
    >
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const isCenter = route.name === 'index';
          const iconColor = focused ? colors.accent : colors.tabInactive;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!focused && !event.defaultPrevented) {
              selectionChanged();
              navigation.navigate(route.name);
            }
          };

          if (isCenter) {
            return (
              <View key={route.key} style={styles.centerSlot}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={focused ? { selected: true } : {}}
                  onPress={onPress}
                  style={styles.centerButton}
                >
                  {getIcon(options, focused, colors.onAccent)}
                </Pressable>
              </View>
            );
          }

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              onPress={onPress}
              style={[styles.tabButton, focused && styles.tabButtonActive]}
            >
              {getIcon(options, focused, iconColor)}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const hexToRgba = (hex: string, alpha: number) => {
  const sanitized = hex.replace('#', '');
  if (sanitized.length !== 6) {
    return hex;
  }
  const r = parseInt(sanitized.slice(0, 2), 16);
  const g = parseInt(sanitized.slice(2, 4), 16);
  const b = parseInt(sanitized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const createStyles = (colors: AppTheme) =>
  StyleSheet.create({
    wrapper: {
      backgroundColor: 'transparent',
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: -4,
    },
    bar: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
      marginHorizontal: 18,
      marginBottom: 0,
      paddingVertical: 11,
      borderRadius: 24,
      backgroundColor: hexToRgba(colors.card, 0.98),
      borderWidth: 0,
      borderColor: 'transparent',
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    tabButton: {
      height: 40,
      minWidth: 48,
      paddingHorizontal: 14,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabButtonActive: {
      backgroundColor: hexToRgba(colors.accent, 0.18),
      borderWidth: 1,
      borderColor: hexToRgba(colors.accent, 0.35),
    },
    centerSlot: {
      width: 64,
      alignItems: 'center',
    },
    centerButton: {
      height: 56,
      width: 56,
      borderRadius: 28,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: -20,
      shadowColor: '#000',
      shadowOpacity: 0.1,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
  });
