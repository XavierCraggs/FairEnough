export type AppTheme = {
  background: string;
  surface: string;
  card: string;
  panel: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  accentSoft: string;
  accentMuted: string;
  onAccent: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  onDanger: string;
  warning: string;
  warningSoft: string;
  infoSoft: string;
  overlay: string;
  tabInactive: string;
};

export const appColors: Record<'light' | 'dark', AppTheme> = {
  light: {
    background: '#F8FAF9',
    surface: '#FFFFFF',
    card: '#FFFFFF',
    panel: '#E5EAF0',
    text: '#1F2937',
    muted: '#6B7280',
    border: '#E5E7EB',
    accent: '#4A6572',
    accentSoft: '#E5EAF0',
    accentMuted: '#93A4AE',
    onAccent: '#FFFFFF',
    success: '#16A34A',
    successSoft: '#DCFCE7',
    danger: '#DC2626',
    dangerSoft: '#FEE2E2',
    onDanger: '#FFFFFF',
    warning: '#F59E0B',
    warningSoft: '#FEF3C7',
    infoSoft: '#DBEAFE',
    overlay: 'rgba(0,0,0,0.35)',
    tabInactive: '#9CA3AF',
  },
  dark: {
    background: '#0F1213',
    surface: '#15191B',
    card: '#1C2124',
    panel: '#161B1F',
    text: '#F3F4F6',
    muted: '#9CA3AF',
    border: '#2B3135',
    accent: '#8FB0BC',
    accentSoft: '#1A2429',
    accentMuted: '#6B7C86',
    onAccent: '#0F1213',
    success: '#34D399',
    successSoft: '#143127',
    danger: '#F87171',
    dangerSoft: '#3A1E1E',
    onDanger: '#0F1213',
    warning: '#FBBF24',
    warningSoft: '#3A2C11',
    infoSoft: '#1E2B3A',
    overlay: 'rgba(0,0,0,0.6)',
    tabInactive: '#6B7280',
  },
};
