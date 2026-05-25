/**
 * Empty State component - consistent empty states across app
 */

import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '@/theme/colors';
import {spacing, typography, radius, shadows} from '@/theme/designTokens';
import {GymlyPressable} from './GymlyPressable';
import {SOCIAL_EMPTY_GAP, SOCIAL_PRIMARY_MIN_HEIGHT} from '@/components/social/socialUiTokens';

type EmptyStateProps = {
  icon?: string;
  title: string;
  message?: string;
  /** Shown under message (e.g. point to a header CTA). No button. */
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
};

const EmptyStateComponent: React.FC<EmptyStateProps> = ({
  icon = 'folder-open-outline',
  title,
  message,
  hint,
  actionLabel,
  onAction,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.iconRing}>
        <Icon name={icon as never} size={48} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {actionLabel && onAction ? (
        <GymlyPressable
          onPress={onAction}
          style={styles.buttonWrap}
          haptic="medium"
          accessibilityRole="button"
          accessibilityLabel={actionLabel}>
          <View style={styles.button}>
            <Text style={styles.buttonText}>{actionLabel}</Text>
          </View>
        </GymlyPressable>
      ) : null}
    </View>
  );
};

export const EmptyState = EmptyStateComponent;
export default EmptyStateComponent;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
  },
  iconRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.12)',
  },
  title: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  message: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: 'center',
    marginBottom: 0,
    maxWidth: 320,
    lineHeight: 22,
  },
  hint: {
    ...typography.caption,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 18,
    maxWidth: 300,
  },
  buttonWrap: {
    marginTop: SOCIAL_EMPTY_GAP,
    width: '100%',
    maxWidth: 320,
  },
  button: {
    backgroundColor: colors.primary,
    minHeight: SOCIAL_PRIMARY_MIN_HEIGHT,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.glow,
  },
  buttonText: {
    ...typography.bodyBold,
    fontSize: 16,
    color: colors.white,
  },
});
