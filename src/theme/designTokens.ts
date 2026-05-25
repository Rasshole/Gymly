/**
 * Gymly Design Tokens — global UI polish (iOS 18–inspired, purple brand)
 */

import {Platform} from 'react-native';
import {scale} from '@/utils/scale';

export const spacing = {
  xs: scale(4),
  sm: scale(8),
  md: scale(12),
  lg: scale(16),
  xl: scale(24),
  xxl: scale(32),
  xxxl: scale(48),
} as const;

/** Consistent corner radii — slightly softer, more premium */
export const radius = {
  xs: scale(6),
  sm: scale(10),
  md: scale(14),
  lg: scale(18),
  xl: scale(22),
  xxl: scale(28),
  sheet: scale(24),
  full: 9999,
} as const;

/**
 * SF Pro on iOS (system), sensible fallbacks on Android.
 * Headlines: Display weight; UI: Text/Rounded feel via system default.
 */
export const fonts = {
  display: Platform.select({
    ios: 'System',
    android: 'sans-serif-medium',
    default: 'System',
  }),
  text: Platform.select({
    ios: 'System',
    android: 'sans-serif',
    default: 'System',
  }),
  rounded: Platform.select({
    ios: 'System',
    android: 'sans-serif',
    default: 'System',
  }),
} as const;

export const letterSpacing = {
  tight: -0.4,
  headline: -0.3,
  normal: 0,
  caps: 0.6,
} as const;

export const iconSize = {
  xs: scale(16),
  sm: scale(20),
  md: scale(22),
  lg: scale(24),
  xl: scale(28),
  hero: scale(52),
} as const;

export const layout = {
  screenPaddingH: spacing.lg,
  cardPadding: spacing.lg,
  rowMinHeight: scale(52),
  buttonMinHeight: scale(52),
  headerSideSlot: scale(88),
} as const;

/** Softer, layered shadows — less harsh black */
export const shadows = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: '#0F172A',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: '#0F172A',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  lg: {
    shadowColor: '#0F172A',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 6,
  },
  glow: {
    shadowColor: '#8B5CF6',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 5,
  },
  card: {
    shadowColor: '#8B5CF6',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  sheet: {
    shadowColor: '#0F172A',
    shadowOffset: {width: 0, height: -4},
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 16,
  },
} as const;

export const animation = {
  pressScale: 0.97,
  spring: {
    friction: 7,
    tension: 220,
  },
  springSnappy: {
    friction: 8,
    tension: 280,
  },
  springSoft: {
    friction: 9,
    tension: 160,
  },
  duration: {
    fast: 150,
    normal: 220,
    slow: 320,
  },
} as const;

const displayHeadline = {
  fontFamily: fonts.display,
  fontWeight: '700' as const,
  letterSpacing: letterSpacing.headline,
};

const textBody = {
  fontFamily: fonts.text,
  fontWeight: '400' as const,
  letterSpacing: letterSpacing.normal,
};

export const typography = {
  h1: {
    ...displayHeadline,
    fontSize: scale(30),
    lineHeight: scale(38),
  },
  h2: {
    ...displayHeadline,
    fontSize: scale(26),
    lineHeight: scale(34),
  },
  h3: {
    ...displayHeadline,
    fontSize: scale(22),
    fontWeight: '600' as const,
    lineHeight: scale(30),
  },
  h4: {
    ...displayHeadline,
    fontSize: scale(18),
    fontWeight: '600' as const,
    lineHeight: scale(26),
  },
  body: {
    ...textBody,
    fontSize: scale(16),
    lineHeight: scale(24),
  },
  bodyBold: {
    fontFamily: fonts.text,
    fontSize: scale(16),
    fontWeight: '600' as const,
    lineHeight: scale(24),
  },
  small: {
    ...textBody,
    fontSize: scale(14),
    lineHeight: scale(20),
  },
  caption: {
    ...textBody,
    fontSize: scale(12),
    lineHeight: scale(16),
    color: undefined,
  },
  badge: {
    fontFamily: fonts.rounded,
    fontSize: scale(10),
    fontWeight: '700' as const,
    lineHeight: scale(12),
    letterSpacing: 0.2,
  },
  sectionCaps: {
    fontFamily: fonts.text,
    fontSize: scale(11),
    fontWeight: '600' as const,
    letterSpacing: letterSpacing.caps,
    textTransform: 'uppercase' as const,
  },
} as const;

/** Bottom sheet / modal chrome */
export const sheet = {
  handleWidth: scale(36),
  handleHeight: scale(5),
  handleRadius: radius.full,
  overlay: 'rgba(15, 23, 42, 0.42)',
  topRadius: radius.sheet,
} as const;
