import React from 'react';
import {Animated, StyleSheet, Text, View} from 'react-native';
import GymlyLogo from '@/components/GymlyLogo';
import {spacing, typography} from '@/theme/designTokens';
import {useStaggeredFadeIn} from './useStaggeredFadeIn';

type AboutBrandHeaderProps = {
  isDark: boolean;
};

export const AboutBrandHeader: React.FC<AboutBrandHeaderProps> = ({isDark}) => {
  const {opacity, translateY} = useStaggeredFadeIn(0, 80);
  const accent = '#7C3AED';

  return (
    <Animated.View style={[styles.wrap, {opacity, transform: [{translateY}]}]}>
      <View style={[styles.logoRow, isDark && styles.logoRowDark]}>
        <GymlyLogo size={56} />
        <Text style={[styles.wordmark, {color: accent}]}>Gymly</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 999,
    backgroundColor: 'rgba(124, 58, 237, 0.06)',
  },
  logoRowDark: {
    backgroundColor: 'rgba(124, 58, 237, 0.14)',
  },
  wordmark: {
    ...typography.h2,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
});
