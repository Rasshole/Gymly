export const colors = {
  // Primary Colors - Purple
  primary: '#8B5CF6',           // Vibrant purple
  primaryLight: '#A78BFA',      // Light purple
  primaryDark: '#7C3AED',       // Dark purple
  primaryVeryDark: '#6D28D9',   // Very dark purple
  
  // Secondary Colors - Green (for online, tid, tjek ind osv.)
  secondary: '#10B981',         // Green (success color)
  secondaryLight: '#34D399',    // Light green
  secondaryDark: '#059669',     // Deep green
  
  // Accent Colors
  accent: '#EC4899',            // Pink accent
  accentLight: '#F472B6',       // Light pink
  
  // Background Colors - light UI with white base
  background: '#F3F4F6',        // App background (light gray)
  backgroundLight: '#FFFFFF',   // Pure white background
  backgroundCard: '#FFFFFF',    // Card background (white)
  backgroundCardLight: '#F9FAFB', // Slightly tinted card background
  
  // Surface Colors
  surface: '#E5E7EB',           // Light surface (inputs, chips)
  surfaceLight: '#F3F4F6',      // Very light surface
  surfaceHover: '#E5E7EB',      // Hover / pressed state
  
  // Text Colors
  text: '#111827',              // Primary text (near-black)
  textSecondary: '#4B5563',     // Secondary gray text
  textTertiary: '#6B7280',      // Tertiary gray
  textMuted: '#9CA3AF',         // Muted gray
  
  // Status Colors
  success: '#10B981',           // Green
  successLight: '#34D399',      // Light green
  warning: '#F59E0B',           // Orange
  warningLight: '#FBBF24',      // Light orange
  error: '#EF4444',             // Red
  errorLight: '#F87171',        // Light red
  info: '#10B981',              // Green (changed from blue)
  
  // Border Colors
  border: '#E5E7EB',            // Light gray border
  borderLight: '#E5E7EB',       // Same light border
  
  // Special Colors
  transparent: 'transparent',
  white: '#FFFFFF',
  black: '#000000',
  blue: '#3B82F6',              // Blue for icons (Session delt, Tilføj)
  overlay: 'rgba(15, 23, 42, 0.4)',  // Subtle dark overlay
  
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

