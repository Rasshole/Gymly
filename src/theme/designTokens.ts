/**
 * Gymly Design Tokens
 * Premium fitness app - purple brand, clean, social, motivating
 */

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

export const radius = {
  sm: scale(8),
  md: scale(12),
  lg: scale(16),
  xl: scale(24),
  xxl: scale(32),
  full: 9999,
} as const;

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  glow: {
    shadowColor: '#8B5CF6',
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  card: {
    shadowColor: '#8B5CF6',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
} as const;

export const typography = {
  h1: {
    fontSize: scale(28),
    fontWeight: '700' as const,
    lineHeight: scale(36),
  },
  h2: {
    fontSize: scale(24),
    fontWeight: '700' as const,
    lineHeight: scale(32),
  },
  h3: {
    fontSize: scale(20),
    fontWeight: '600' as const,
    lineHeight: scale(28),
  },
  h4: {
    fontSize: scale(18),
    fontWeight: '600' as const,
    lineHeight: scale(24),
  },
  body: {
    fontSize: scale(16),
    fontWeight: '400' as const,
    lineHeight: scale(24),
  },
  bodyBold: {
    fontSize: scale(16),
    fontWeight: '600' as const,
    lineHeight: scale(24),
  },
  small: {
    fontSize: scale(14),
    fontWeight: '400' as const,
    lineHeight: scale(20),
  },
  caption: {
    fontSize: scale(12),
    fontWeight: '400' as const,
    lineHeight: scale(16),
  },
  badge: {
    fontSize: scale(10),
    fontWeight: '700' as const,
    lineHeight: scale(12),
  },
} as const;
