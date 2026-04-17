/**
 * QuickActionCard – reusable card for home screen quick actions
 * Card-like layout with icon, label, and clear press feedback
 */

import React from 'react';
import {View, Text, StyleSheet, Pressable} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '@/theme/colors';
import {spacing, radius, shadows} from '@/theme/designTokens';
import {typography} from '@/theme/designTokens';

export type QuickActionCardProps = {
  icon: string;
  label: string;
  onPress: () => void;
};

export const QuickActionCard: React.FC<QuickActionCardProps> = ({
  icon,
  label,
  onPress,
}) => {
  return (
    <Pressable
      onPress={onPress}
      style={({pressed}) => [
        styles.card,
        pressed && styles.cardPressed,
      ]}>
      <View style={styles.iconWrapper}>
        <Icon name={icon} size={28} color={colors.primary} />
      </View>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 100,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary + '20',
    ...shadows.card,
  },
  cardPressed: {
    backgroundColor: colors.primary + '12',
    opacity: 0.95,
    transform: [{scale: 0.98}],
  },
  iconWrapper: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  label: {
    ...typography.bodyBold,
    fontSize: 14,
    color: colors.text,
  },
});
