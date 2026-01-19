export const colors = {
  // Primary Colors - Purple (Main brand color, use for primary actions, headers)
  primary: '#8B5CF6',           // Vibrant purple - main buttons, primary actions
  primaryLight: '#A78BFA',      // Light purple - hover states, subtle accents
  primaryDark: '#7C3AED',       // Dark purple - pressed states, emphasis
  primaryVeryDark: '#6D28D9',   // Very dark purple - strong emphasis
  
  // Secondary Colors - Green (Success, online, positive actions)
  secondary: '#10B981',         // Green - success states, online indicators, positive CTAs
  secondaryLight: '#34D399',    // Light green - subtle success, badges
  secondaryDark: '#059669',     // Deep green - strong success indicators
  
  // Accent Colors - Pink (Highlights, special features)
  accent: '#EC4899',            // Pink accent - highlights, special features
  accentLight: '#F472B6',       // Light pink - subtle accents
  
  // Background Colors - Clean and airy
  background: '#FAFBFC',        // App background (softer, warmer gray)
  backgroundLight: '#FFFFFF',   // Pure white background
  backgroundCard: '#FFFFFF',    // Card background (white)
  backgroundCardLight: '#F8F9FA', // Slightly tinted card background (warmer)
  
  // Surface Colors - Interactive elements
  surface: '#F1F3F5',           // Light surface (inputs, chips) - softer than before
  surfaceLight: '#F8F9FA',      // Very light surface - hover states
  surfaceHover: '#E9ECEF',      // Hover / pressed state
  
  // Text Colors - Clear hierarchy
  text: '#1A1D29',              // Primary text (slightly softer black for better readability)
  textSecondary: '#5F6673',     // Secondary gray text - improved contrast
  textTertiary: '#8B929E',      // Tertiary gray - less emphasis
  textMuted: '#ADB5BD',         // Muted gray - placeholders, disabled
  
  // Status Colors - Clear and distinct
  success: '#10B981',           // Green - matches secondary
  successLight: '#34D399',      // Light green
  warning: '#F59E0B',           // Orange - warnings
  warningLight: '#FBBF24',      // Light orange
  error: '#EF4444',             // Red - errors, destructive actions
  errorLight: '#F87171',        // Light red
  info: '#3B82F6',              // Blue - informational messages (better distinction from success)
  
  // Border Colors - Subtle and clean
  border: '#E1E4E8',            // Light gray border - softer
  borderLight: '#EDF0F2',       // Very light border - subtle dividers
  
  // Special Colors
  transparent: 'transparent',
  white: '#FFFFFF',
  black: '#000000',
  blue: '#3B82F6',              // Blue for informational icons and links
  overlay: 'rgba(26, 29, 41, 0.5)',  // Darker overlay for better contrast
  
  // Gradient Colors - Harmonious transitions
  gradientStart: '#8B5CF6',     // Purple
  gradientMiddle: '#7C3AED',    // Dark purple
  gradientEnd: '#10B981',       // Green - smooth transition
};

// Gradient presets - Harmonious color transitions
export const gradients = {
  primary: ['#8B5CF6', '#7C3AED', '#10B981'], // Purple to green - smooth transition
  primaryReverse: ['#10B981', '#7C3AED', '#8B5CF6'], // Green to purple
  purple: ['#A78BFA', '#8B5CF6', '#7C3AED'], // Purple gradient
  green: ['#34D399', '#10B981', '#059669'], // Green gradient
  accent: ['#EC4899', '#8B5CF6', '#7C3AED'], // Accent gradient
  soft: ['#F8F9FA', '#F1F3F5', '#E9ECEF'], // Subtle gray gradient for backgrounds
};

export default colors;

