import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme as useSystemScheme } from 'react-native';

export type ThemePreference = 'system' | 'light' | 'dark';

type ThemeContextValue = {
  preference: ThemePreference;
  colorScheme: 'light' | 'dark';
  setPreference: (value: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  preference: 'system',
  colorScheme: 'light',
  setPreference: () => {},
});

const STORAGE_KEY = 'sorted_theme_preference';

export const ThemePreferenceProvider = ({ children }: { children: React.ReactNode }) => {
  const systemScheme = useSystemScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    const loadPreference = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setPreferenceState(stored);
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

  const colorScheme = useMemo<'light' | 'dark'>(() => {
    if (preference === 'light') return 'light';
    if (preference === 'dark') return 'dark';
    return systemScheme === 'dark' ? 'dark' : 'light';
  }, [preference, systemScheme]);

  const value = useMemo(
    () => ({
      preference,
      colorScheme,
      setPreference,
    }),
    [preference, colorScheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useThemePreference = () => useContext(ThemeContext);
