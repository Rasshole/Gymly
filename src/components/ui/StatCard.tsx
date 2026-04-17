/**
 * Stat Card - for dashboard stats (streak, check-ins, time, etc.)
 */

import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {Card} from './Card';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';

type StatCardProps = {
  /** Ionicons navn – bruges hvis `emoji` ikke er sat */
  icon?: string;
  /** Fx 🏅 – samme som badge-stripen på profil */
  emoji?: string;
  label: string;
  value: string | number;
  accent?: boolean;
  /** Kompakt layout til forsiden (mindre padding/typografi) */
  compact?: boolean;
  onPress?: () => void;
};

export const StatCard: React.FC<StatCardProps> = ({
  icon,
  emoji,
  label,
  value,
  accent = false,
  compact = false,
  onPress,
}) => (
  <Card padding={compact ? 'md' : 'lg'} onPress={onPress}>
    <View style={[styles.content, compact && styles.contentCompact]}>
      <View
        style={[
          styles.iconWrapper,
          compact && styles.iconWrapperCompact,
          accent && styles.iconWrapperAccent,
        ]}>
        {emoji ? (
          <Text
            style={[styles.emojiMark, compact && styles.emojiMarkCompact]}
            allowFontScaling={false}>
            {emoji}
          </Text>
        ) : (
          <Icon
            name={icon as any}
            size={compact ? 20 : 24}
            color={accent ? colors.white : colors.primary}
          />
        )}
      </View>
      <View style={styles.textWrapper}>
        <Text style={[styles.value, compact && styles.valueCompact, accent && styles.valueAccent]}>
          {value}
        </Text>
        <Text style={[styles.label, compact && styles.labelCompact]}>{label}</Text>
      </View>
    </View>
  </Card>
);

const styles = StyleSheet.create({
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  contentCompact: {
    gap: spacing.sm,
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapperCompact: {
    width: 36,
    height: 36,
    borderRadius: radius.sm + 2,
  },
  emojiMark: {
    fontSize: 24,
    lineHeight: 28,
  },
  emojiMarkCompact: {
    fontSize: 20,
    lineHeight: 24,
  },
  iconWrapperAccent: {
    backgroundColor: colors.primary,
  },
  textWrapper: {
    flex: 1,
  },
  value: {
    ...typography.h3,
    color: colors.text,
  },
  valueCompact: {
    ...typography.h4,
    fontSize: 17,
    lineHeight: 22,
  },
  valueAccent: {
    color: colors.primary,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  labelCompact: {
    fontSize: 11,
    lineHeight: 14,
    marginTop: 1,
  },
});
