import { useColorScheme as useSystemScheme } from 'react-native';
import { useThemePreference } from '@/contexts/ThemeContext';

export const useColorScheme = () => {
  const systemScheme = useSystemScheme();
  const { preference } = useThemePreference();

  if (preference === 'light') return 'light';
  if (preference === 'dark') return 'dark';
  return systemScheme ?? 'light';
};
