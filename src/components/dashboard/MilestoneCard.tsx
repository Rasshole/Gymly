/**
 * Milestone Card - motiverende milestones (streak, leaderboard, etc.)
 */

import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {Card} from '@/components/ui/Card';
import colors from '@/theme/colors';
import {typography, spacing} from '@/theme/designTokens';
import type {Milestone} from '@/types/profile.types';

type MilestoneCardProps = {
  milestone: Milestone;
  onCtaPress?: () => void;
};

export const MilestoneCard: React.FC<MilestoneCardProps> = ({
  milestone,
  onCtaPress,
}) => (
  <Card padding="lg" style={styles.card}>
    <View style={styles.content}>
      <View style={styles.iconWrapper}>
        <Icon name={milestone.icon as any} size={24} color={colors.primary} />
      </View>
      <View style={styles.textWrapper}>
        <Text style={styles.message}>{milestone.message}</Text>
        {milestone.cta && onCtaPress && (
          <TouchableOpacity
            onPress={onCtaPress}
            style={styles.cta}
            activeOpacity={0.8}>
            <Text style={styles.ctaText}>{milestone.cta}</Text>
            <Icon name="arrow-forward" size={14} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  </Card>
);

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.sm,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  textWrapper: {
    flex: 1,
  },
  message: {
    ...typography.body,
    color: colors.text,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  ctaText: {
    ...typography.small,
    fontWeight: '600',
    color: colors.primary,
  },
});
