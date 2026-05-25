/**
 * ProfileStatGrid – premium stats grid for profile Data tab
 */

import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows, iconSize} from '@/theme/designTokens';
import {GymlyPressable} from '@/components/ui/GymlyPressable';

type StatItem = {
  key: string;
  icon?: string;
  emoji?: string;
  label: string;
  value: string | number;
  onPress?: () => void;
};

type ProfileStatGridProps = {
  stats: StatItem[];
};

export const ProfileStatGrid: React.FC<ProfileStatGridProps> = ({stats}) => (
  <View style={styles.grid}>
    {stats.map(stat => {
      const inner = (
        <>
          <View style={styles.iconWrapper}>
            {stat.emoji ? (
              <Text style={styles.emojiMark} allowFontScaling={false}>
                {stat.emoji}
              </Text>
            ) : (
              <Icon name={stat.icon as never} size={iconSize.sm} color={colors.primary} />
            )}
          </View>
          <Text style={styles.value} numberOfLines={1}>
            {stat.value}
          </Text>
          <Text style={styles.label} numberOfLines={2}>
            {stat.label}
          </Text>
        </>
      );

      if (stat.onPress) {
        return (
          <GymlyPressable
            key={stat.key}
            onPress={stat.onPress}
            haptic="light"
            style={styles.item}>
            {inner}
          </GymlyPressable>
        );
      }

      return (
        <View key={stat.key} style={styles.item}>
          {inner}
        </View>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  item: {
    width: '48%',
    flexGrow: 1,
    flexBasis: '46%',
    backgroundColor: colors.backgroundCardLight,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadows.sm,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emojiMark: {
    fontSize: 22,
    lineHeight: 26,
  },
  value: {
    ...typography.h3,
    fontSize: 22,
    color: colors.text,
    letterSpacing: -0.3,
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4,
    lineHeight: 16,
  },
});
