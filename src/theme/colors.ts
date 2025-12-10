/**
 * Gymly Color Theme
 * Purple/Green gradient theme inspired by modern fitness apps
 */

export const colors = {
  // Primary Colors - Purple
  primary: '#8B5CF6',           // Vibrant purple
  primaryLight: '#A78BFA',      // Light purple
  primaryDark: '#7C3AED',       // Dark purple
  primaryVeryDark: '#6D28D9',   // Very dark purple
  
  // Secondary Colors - Green (changed from blue)
  secondary: '#10B981',         // Green (success color)
  secondaryLight: '#34D399',    // Light green
  secondaryDark: '#059669',     // Deep green
  
  // Accent Colors
  accent: '#EC4899',            // Pink accent
  accentLight: '#F472B6',       // Light pink
  
  // Background Colors (15% darker than previous)
  background: '#312451',        // Purple background
  backgroundLight: '#3B295F',   // Dark purple
  backgroundCard: '#38316A',    // Card background (purple with blue hint for contrast)
  backgroundCardLight: '#443A7F', // Lighter card background (purple with blue hint)
  
  // Surface Colors
  surface: '#342656',           // Purple surface
  surfaceLight: '#3F2E5C',      // Light purple surface
  surfaceHover: '#4A3668',      // Hover state
  
  // Text Colors
  text: '#FFFFFF',              // White text
  textSecondary: '#C4B5FD',     // Light purple text
  textTertiary: '#A78BFA',      // Medium purple text
  textMuted: '#9CA3AF',         // Muted gray-purple text
  
  // Status Colors
  success: '#10B981',           // Green
  successLight: '#34D399',      // Light green
  warning: '#F59E0B',           // Orange
  warningLight: '#FBBF24',      // Light orange
  error: '#EF4444',             // Red
  errorLight: '#F87171',        // Light red
  info: '#10B981',              // Green (changed from blue)
  
  // Border Colors
  border: '#4A3668',            // Purple border
  borderLight: '#5B4577',       // Light purple border
  
  // Special Colors
  transparent: 'transparent',
  white: '#FFFFFF',
  black: '#000000',
  blue: '#3B82F6',              // Blue for icons (Session delt, Tilføj)
  overlay: 'rgba(49, 36, 81, 0.8)',  // Purple overlay
  
  // Gradient Colors
  gradientStart: '#8B5CF6',     // Purple
  gradientMiddle: '#7C3AED',    // Dark purple
  gradientEnd: '#10B981',       // Green (changed from blue)
};

// Gradient presets
export const gradients = {
  primary: ['#8B5CF6', '#7C3AED', '#10B981'], // Purple to green
  primaryReverse: ['#10B981', '#7C3AED', '#8B5CF6'], // Green to purple
  purple: ['#A78BFA', '#8B5CF6', '#7C3AED'],
  green: ['#34D399', '#10B981', '#059669'], // Changed from blue to green
  accent: ['#EC4899', '#8B5CF6', '#7C3AED'],
};

export default colors;

