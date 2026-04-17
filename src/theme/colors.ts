/**
 * Offentlig farve-API. Ingen imports i denne fil — undgår at `colors` er `undefined`
 * under modul-load (Metro kan ellers evaluere afhængigheder i uheldig rækkefølge).
 */

export const PALETTE = {
  primary: '#8B5CF6',
  primaryLight: '#A78BFA',
  primaryDark: '#7C3AED',
  primaryVeryDark: '#6D28D9',

  secondary: '#10B981',
  secondaryLight: '#34D399',
  secondaryDark: '#059669',

  accent: '#EC4899',
  accentLight: '#F472B6',

  background: '#F3F4F6',
  backgroundLight: '#FFFFFF',
  backgroundCard: '#FFFFFF',
  backgroundCardLight: '#F9FAFB',

  surface: '#E5E7EB',
  surfaceLight: '#F3F4F6',
  surfaceHover: '#E5E7EB',

  text: '#111827',
  textSecondary: '#4B5563',
  textTertiary: '#6B7280',
  textMuted: '#9CA3AF',

  success: '#10B981',
  successLight: '#34D399',
  warning: '#F59E0B',
  warningLight: '#FBBF24',
  error: '#EF4444',
  errorLight: '#F87171',
  info: '#10B981',

  border: '#E5E7EB',
  borderLight: '#E5E7EB',

  transparent: 'transparent',
  white: '#FFFFFF',
  black: '#000000',
  blue: '#3B82F6',
  overlay: 'rgba(15, 23, 42, 0.4)',

  rankGold: '#FFD700',
  rankSilver: '#C0C0C0',
  rankBronze: '#CD7F32',
  notificationBadge: '#EF4444',

  gradientStart: '#8B5CF6',
  gradientMiddle: '#7C3AED',
  gradientEnd: '#10B981',
} as const;

export const colors = PALETTE;

export const gradients = {
  primary: ['#8B5CF6', '#7C3AED', '#10B981'],
  primaryReverse: ['#10B981', '#7C3AED', '#8B5CF6'],
  purple: ['#A78BFA', '#8B5CF6', '#7C3AED'],
  green: ['#34D399', '#10B981', '#059669'],
  accent: ['#EC4899', '#8B5CF6', '#7C3AED'],
};

export default colors;
