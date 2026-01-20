import { useColorScheme } from '@/components/useColorScheme';
import { appColors, AppTheme } from '@/constants/AppColors';

export const useAppTheme = (): AppTheme => {
  const scheme = useColorScheme();
  return appColors[scheme === 'dark' ? 'dark' : 'light'];
};
