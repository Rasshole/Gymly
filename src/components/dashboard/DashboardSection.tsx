/**
 * Dashboard Section - wrapper for dashboard content blocks
 */

import React from 'react';
import {View, StyleSheet} from 'react-native';
import {SectionHeader} from '@/components/ui/SectionHeader';
import {spacing} from '@/theme/designTokens';

type DashboardSectionProps = {
  title: string;
  subtitle?: string;
  onSeeAll?: () => void;
  seeAllLabel?: string;
  children: React.ReactNode;
};

export const DashboardSection: React.FC<DashboardSectionProps> = ({
  title,
  subtitle,
  onSeeAll,
  seeAllLabel,
  children,
}) => (
  <View style={styles.container}>
    <SectionHeader
      title={title}
      subtitle={subtitle}
      onSeeAll={onSeeAll}
      seeAllLabel={seeAllLabel}
    />
    {children}
  </View>
);

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.xl,
  },
});
