/**
 * Gymly Theme Configuration
 */

import {scale} from '@/utils/scale';
import colors from './colors';

export const theme = {
  colors,
  
  // Spacing
  spacing: {
    xs: scale(4),
    sm: scale(8),
    md: scale(16),
    lg: scale(24),
    xl: scale(32),
    xxl: scale(48),
  },
  
  // Border Radius
  borderRadius: {
    sm: scale(8),
    md: scale(12),
    lg: scale(16),
    xl: scale(24),
    round: 9999,
  },
  
  // Typography
  typography: {
    h1: {
      fontSize: scale(32),
      fontWeight: '700' as const,
      lineHeight: scale(40),
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
  },
  
  // Shadows
  shadows: {
    sm: {
      shadowColor: '#000',
      shadowOffset: {width: 0, height: 2},
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: {width: 0, height: 4},
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 4,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: {width: 0, height: 8},
      shadowOpacity: 0.2,
      shadowRadius: 16,
      elevation: 8,
    },
    glow: {
      shadowColor: '#8B5CF6',
      shadowOffset: {width: 0, height: 0},
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 6,
    },
  },
};

export default theme;

