import React from 'react';
import {Animated, StyleSheet, Text, View, type ViewStyle} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {spacing, radius, shadows, typography} from '@/theme/designTokens';
import {useStaggeredFadeIn} from './useStaggeredFadeIn';

export type AboutFeatureCardProps = {
  index: number;
  icon: string;
  iconColor: string;
  iconBg: string;
  title: string;
  body: string;
  isDark: boolean;
  style?: ViewStyle;
};

export const AboutFeatureCard: React.FC<AboutFeatureCardProps> = ({
  index,
  icon,
  iconColor,
  iconBg,
  title,
  body,
  isDark,
  style,
}) => {
  const {opacity, translateY} = useStaggeredFadeIn(index + 2, 70);

  return (
    <Animated.View
      style={[
        styles.card,
        isDark ? styles.cardDark : styles.cardLight,
        shadows.md,
        {opacity, transform: [{translateY}]},
        style,
      ]}>
      <View style={[styles.iconWrap, {backgroundColor: iconBg}]}>
        <Icon name={icon} size={22} color={iconColor} />
      </View>
      <View style={styles.textCol}>
        <Text style={[styles.title, isDark && styles.titleDark]}>{title}</Text>
        <Text style={[styles.body, isDark && styles.bodyDark]}>{body}</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(124, 58, 237, 0.08)',
  },
  cardDark: {
    backgroundColor: '#1F2937',
    borderColor: 'rgba(167, 139, 250, 0.15)',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    ...typography.bodyBold,
    color: '#111827',
  },
  titleDark: {
    color: '#F9FAFB',
  },
  body: {
    ...typography.small,
    color: '#4B5563',
  },
  bodyDark: {
    color: '#9CA3AF',
  },
});
