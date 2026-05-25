/**
 * Section Header - for dashboard sections
 */

import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '@/theme/colors';
import {spacing, typography, iconSize} from '@/theme/designTokens';

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  onSeeAll?: () => void;
  seeAllLabel?: string;
  alignSeeAllToTitle?: boolean;
};

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  subtitle,
  onSeeAll,
  seeAllLabel = 'Se alle',
  alignSeeAllToTitle = false,
}) => (
  <View
    style={[styles.container, onSeeAll && !subtitle && styles.containerBaseline]}>
    <View style={styles.textWrapper}>
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
    {onSeeAll && (
      <TouchableOpacity
        onPress={onSeeAll}
        style={[styles.seeAll, alignSeeAllToTitle && styles.seeAllTopAligned]}
        activeOpacity={0.7}>
        <Text style={styles.seeAllText}>{seeAllLabel}</Text>
        <Icon name="chevron-forward" size={iconSize.sm} color={colors.primary} />
      </TouchableOpacity>
    )}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  containerBaseline: {
    alignItems: 'baseline',
  },
  textWrapper: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  title: {
    ...typography.h4,
    color: colors.text,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingBottom: 1,
  },
  seeAllTopAligned: {
    alignSelf: 'flex-end',
    marginBottom: 0,
  },
  seeAllText: {
    ...typography.small,
    fontWeight: '600',
    color: colors.primary,
  },
});
