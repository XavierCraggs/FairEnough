import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme as useSystemScheme } from 'react-native';
import { ThemeMode, ThemeName, defaultThemeName, themeOrder } from '@/constants/AppColors';

export type ThemePreference = 'system' | ThemeMode;

type ThemeContextValue = {
  preference: ThemePreference;
  themeName: ThemeName;
  colorScheme: 'light' | 'dark';
  setPreference: (value: ThemePreference) => void;
  setThemeName: (value: ThemeName) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  preference: 'system',
  themeName: defaultThemeName,
  colorScheme: 'light',
  setPreference: () => {},
  setThemeName: () => {},
});

const STORAGE_KEY = 'sorted_theme_preference';
const THEME_KEY = 'sorted_theme_name';

export const ThemePreferenceProvider = ({ children }: { children: React.ReactNode }) => {
  const systemScheme = useSystemScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [themeName, setThemeNameState] = useState<ThemeName>(defaultThemeName);

  useEffect(() => {
    const loadPreference = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setPreferenceState(stored);
        }
        const storedTheme = await AsyncStorage.getItem(THEME_KEY);
        if (storedTheme && themeOrder.includes(storedTheme as ThemeName)) {
          setThemeNameState(storedTheme as ThemeName);
        }
      } catch {
        // Ignore storage failures and use system default.
      }
    };
    loadPreference();
  }, []);

  const setPreference = (value: ThemePreference) => {
    setPreferenceState(value);
    AsyncStorage.setItem(STORAGE_KEY, value).catch(() => undefined);
  };

  const setThemeName = (value: ThemeName) => {
    setThemeNameState(value);
    AsyncStorage.setItem(THEME_KEY, value).catch(() => undefined);
  };

  const colorScheme = useMemo<'light' | 'dark'>(() => {
    if (preference === 'light') return 'light';
    if (preference === 'dark') return 'dark';
    return systemScheme === 'dark' ? 'dark' : 'light';
  }, [preference, systemScheme]);

  const value = useMemo(
    () => ({
      preference,
      themeName,
      colorScheme,
      setPreference,
      setThemeName,
    }),
    [preference, themeName, colorScheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useThemePreference = () => useContext(ThemeContext);
