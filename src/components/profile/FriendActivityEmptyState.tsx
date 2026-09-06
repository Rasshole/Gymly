import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import colors from '@/theme/colors';
import {radius, spacing, typography} from '@/theme/designTokens';
import {useTranslation} from '@/i18n';

type FriendActivityEmptyStateProps = {
  friendName: string;
  onInvite?: () => void;
  showInvite?: boolean;
};

export const FriendActivityEmptyState = ({
  friendName,
  onInvite,
  showInvite = false,
}: FriendActivityEmptyStateProps) => {
  const {t} = useTranslation();

  return (
    <View style={styles.wrap}>
      <Text style={styles.emoji}>🏋️</Text>
      <Text style={styles.title}>
        {t('friendProfile.activityEmptyTitle', {name: friendName})}
      </Text>
      {showInvite && onInvite ? (
        <TouchableOpacity style={styles.cta} onPress={onInvite} activeOpacity={0.85}>
          <Text style={styles.ctaText}>{t('friendProfile.inviteToWorkout')}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  emoji: {
    fontSize: 32,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  cta: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.lg,
    backgroundColor: colors.primary + '14',
    borderWidth: 1,
    borderColor: colors.primary + '35',
  },
  ctaText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primaryDark,
  },
});
