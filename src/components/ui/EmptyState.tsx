/**
 * Empty State component - consistent empty states across app
 */

import React, {useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '@/theme/colors';
import {spacing, typography} from '@/theme/designTokens';
import {SOCIAL_EMPTY_GAP, SOCIAL_PRIMARY_MIN_HEIGHT, SOCIAL_PRIMARY_RADIUS} from '@/components/social/socialUiTokens';

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
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      friction: 6,
      tension: 400,
    }).start();
  };

  const pressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 5,
      tension: 320,
    }).start();
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconWrapper}>
        <Icon name={icon as never} size={52} color={colors.textMuted} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {actionLabel && onAction ? (
        <Animated.View style={[styles.buttonWrap, {transform: [{scale}]}]}>
          <Pressable
            onPress={onAction}
            onPressIn={pressIn}
            onPressOut={pressOut}
            style={({pressed}) => [styles.button, pressed && styles.buttonPressed]}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}>
            <Text style={styles.buttonText}>{actionLabel}</Text>
          </Pressable>
        </Animated.View>
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
  iconWrapper: {
    marginBottom: 28,
  },
  title: {
    ...typography.h4,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 14,
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
    borderRadius: SOCIAL_PRIMARY_RADIUS,
    paddingHorizontal: spacing.xl,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 3,
  },
  buttonPressed: {
    opacity: 0.92,
  },
  buttonText: {
    ...typography.bodyBold,
    fontSize: 16,
    color: colors.white,
  },
});
