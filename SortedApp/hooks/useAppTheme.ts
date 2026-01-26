import { useColorScheme } from '@/components/useColorScheme';
import { appThemes, AppTheme, defaultThemeName } from '@/constants/AppColors';
import { useThemePreference } from '@/contexts/ThemeContext';

export const useAppTheme = (): AppTheme => {
  const scheme = useColorScheme();
  const { themeName } = useThemePreference();
  const activeTheme = appThemes[themeName] ?? appThemes[defaultThemeName];
  return activeTheme[scheme === 'dark' ? 'dark' : 'light'];
};
