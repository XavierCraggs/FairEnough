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

export type ThemeMode = 'light' | 'dark';

export type ThemeName = 'butler' | 'messengerBlue' | 'deepGreen';

export const themeLabels: Record<ThemeName, string> = {
  butler: 'Butler',
  messengerBlue: 'Messenger Blue',
  deepGreen: 'Deep Green',
};

export const themeOrder: ThemeName[] = [
  'butler',
  'messengerBlue',
  'deepGreen',
];

export const appThemes: Record<ThemeName, Record<ThemeMode, AppTheme>> = {
  butler: {
    light: {
      background: '#F4F6FA',
      surface: '#FFFFFF',
      card: '#FFFFFF',
      panel: '#E6EBF2',
      text: '#1C2533',
      muted: '#667085',
      border: '#D9E2EC',
      accent: '#2F5D8A',
      accentSoft: '#E3EDF7',
      accentMuted: '#7C99B6',
      onAccent: '#FFFFFF',
      success: '#1F8A5B',
      successSoft: '#D8F2E6',
      danger: '#C94A4A',
      dangerSoft: '#F4DADA',
      onDanger: '#FFFFFF',
      warning: '#C9822B',
      warningSoft: '#F4E1C6',
      infoSoft: '#DDE8F6',
      overlay: 'rgba(18,24,36,0.28)',
      tabInactive: '#8A96A6',
    },
    dark: {
      background: '#0E1218',
      surface: '#151B24',
      card: '#1A2230',
      panel: '#121824',
      text: '#E7ECF3',
      muted: '#98A4B3',
      border: '#2A3443',
      accent: '#6F96C6',
      accentSoft: '#1B2633',
      accentMuted: '#54779B',
      onAccent: '#0E1218',
      success: '#53B68A',
      successSoft: '#1B2E28',
      danger: '#E08383',
      dangerSoft: '#3A2326',
      onDanger: '#0E1218',
      warning: '#E0A65D',
      warningSoft: '#3A2A18',
      infoSoft: '#1E2A3A',
      overlay: 'rgba(0,0,0,0.6)',
      tabInactive: '#6F7B8A',
    },
  },
  messengerBlue: {
    light: {
      background: '#F5F7FB',
      surface: '#FFFFFF',
      card: '#FFFFFF',
      panel: '#E9EEF7',
      text: '#1C2330',
      muted: '#687387',
      border: '#DCE3EF',
      accent: '#1A73E8',
      accentSoft: '#E3EEFF',
      accentMuted: '#7FA9EA',
      onAccent: '#FFFFFF',
      success: '#1D8B5A',
      successSoft: '#D7F1E5',
      danger: '#C94A4A',
      dangerSoft: '#F3D9D9',
      onDanger: '#FFFFFF',
      warning: '#C9872E',
      warningSoft: '#F3E3C8',
      infoSoft: '#DFE9F7',
      overlay: 'rgba(16,22,34,0.28)',
      tabInactive: '#8B96A8',
    },
    dark: {
      background: '#0D1118',
      surface: '#141A24',
      card: '#192132',
      panel: '#121827',
      text: '#E7ECF5',
      muted: '#9AA5B5',
      border: '#293449',
      accent: '#5F99F7',
      accentSoft: '#1A2638',
      accentMuted: '#4B7CC6',
      onAccent: '#0D1118',
      success: '#53B68A',
      successSoft: '#1B2E28',
      danger: '#E08383',
      dangerSoft: '#3A2326',
      onDanger: '#0D1118',
      warning: '#E0A65D',
      warningSoft: '#3A2A18',
      infoSoft: '#1D2A3E',
      overlay: 'rgba(0,0,0,0.6)',
      tabInactive: '#6F7C90',
    },
  },
  deepGreen: {
    light: {
      background: '#F3F6F3',
      surface: '#FFFFFF',
      card: '#FFFFFF',
      panel: '#E7EDE8',
      text: '#1F2B24',
      muted: '#68776F',
      border: '#D8E1DB',
      accent: '#2F6B4A',
      accentSoft: '#E3F0E8',
      accentMuted: '#7FA08C',
      onAccent: '#FFFFFF',
      success: '#1F8A5B',
      successSoft: '#D8F2E6',
      danger: '#C94A4A',
      dangerSoft: '#F4DADA',
      onDanger: '#FFFFFF',
      warning: '#C9822B',
      warningSoft: '#F4E1C6',
      infoSoft: '#E0EAF3',
      overlay: 'rgba(16,20,18,0.28)',
      tabInactive: '#88958D',
    },
    dark: {
      background: '#0F1411',
      surface: '#161D18',
      card: '#1B251F',
      panel: '#121A15',
      text: '#E7EEE9',
      muted: '#96A39B',
      border: '#2B382F',
      accent: '#6AA07A',
      accentSoft: '#1B2721',
      accentMuted: '#557E64',
      onAccent: '#0F1411',
      success: '#53B68A',
      successSoft: '#1B2E28',
      danger: '#E08383',
      dangerSoft: '#3A2326',
      onDanger: '#0F1411',
      warning: '#E0A65D',
      warningSoft: '#3A2A18',
      infoSoft: '#1E2A33',
      overlay: 'rgba(0,0,0,0.6)',
      tabInactive: '#6F7B75',
    },
  },
};

export const defaultThemeName: ThemeName = 'butler';
