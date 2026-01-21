/**
 * Card Component
 * Reusable card container with consistent styling
 */

import React from 'react';
import {View, StyleSheet, ViewStyle} from 'react-native';
import {colors} from '@/theme/colors';
import {spacing} from '@/theme/spacing';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padding?: keyof typeof spacing;
  elevated?: boolean;
  outlined?: boolean;
}

const Card = ({
  children,
  style,
  padding = 'md',
  elevated = true,
  outlined = false,
}: CardProps) => {
  const cardStyle = [
    styles.card,
    elevated && styles.cardElevated,
    outlined && styles.cardOutlined,
    {padding: spacing[padding]},
    style,
  ];

  return <View style={cardStyle}>{children}</View>;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
  },
  cardElevated: {
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  cardOutlined: {
    borderWidth: 1,
    borderColor: colors.border,
  },
});

export default Card;




