/**
 * ProfileStatGrid – Stats grid for profile
 */

import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '@/theme/colors';
import {spacing, typography} from '@/theme/designTokens';

type StatItem = {
  key: string;
  icon?: string;
  /** Fx 🏅 – matcher badge-stripen / hjem */
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
    {stats.map((stat, idx) => (
      <TouchableOpacity
        key={stat.key}
        style={[styles.item, (idx + 1) % 2 === 0 && styles.itemRight]}
        onPress={stat.onPress}
        activeOpacity={stat.onPress ? 0.7 : 1}
        disabled={!stat.onPress}>
        <View style={styles.iconWrapper}>
          {stat.emoji ? (
            <Text style={styles.emojiMark} allowFontScaling={false}>
              {stat.emoji}
            </Text>
          ) : (
            <Icon name={stat.icon as any} size={20} color={colors.primary} />
          )}
        </View>
        <Text style={styles.value}>{stat.value}</Text>
        <Text style={styles.label}>{stat.label}</Text>
      </TouchableOpacity>
    ))}
  </View>
);

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.xs,
  },
  item: {
    width: '50%',
    padding: spacing.xs,
  },
  itemRight: {},
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emojiMark: {
    fontSize: 20,
    lineHeight: 24,
  },
  value: {
    ...typography.h4,
    color: colors.text,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
