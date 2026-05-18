/**
 * Fælles UI til planlagt session / invitation (Inviter til træning + Planlæg fra beskeder).
 * Samme kort, lilla accent og grid som InviteToWorkoutScreen.
 */

import React from 'react';
import {View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Animated, {FadeInDown} from 'react-native-reanimated';
import type {MuscleGroup} from '@/types/workout.types';
import type {DanishGym} from '@/data/danishGyms';
import colors from '@/theme/colors';
import {spacing, radius, shadows, typography} from '@/theme/designTokens';
import {PurpleGradientButton} from '@/components/ui/PurpleGradientButton';
import TrainingTypeMuscleGrid from '@/components/planned/TrainingTypeMuscleGrid';
import TrainingCenterPicker from '@/components/planned/TrainingCenterPicker';

export const INVITE_FORM_SCREEN_TINT = '#F7F5FC';
export const INVITE_FORM_CARD_LINE = 'rgba(139, 92, 246, 0.1)';
export const INVITE_FORM_PURPLE_MIST = 'rgba(139, 92, 246, 0.09)';

export function defaultScheduleParts(): {date: Date; time: Date} {
  const next = new Date();
  next.setSeconds(0, 0);
  next.setMinutes(0);
  next.setHours(next.getHours() + 1);
  const dateOnly = new Date(next);
  dateOnly.setHours(0, 0, 0, 0);
  const timeOnly = new Date();
  timeOnly.setHours(next.getHours(), next.getMinutes(), 0, 0);
  return {date: dateOnly, time: timeOnly};
}

export function formatInviteDateLine(selectedDate: Date): string {
  return selectedDate.toLocaleDateString('da-DK', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function formatInviteTimeLine(selectedTime: Date): string {
  return selectedTime.toLocaleTimeString('da-DK', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatInvitePreviewLine(scheduledPreview: Date): string {
  const dateStr = scheduledPreview.toLocaleDateString('da-DK', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const timeStr = scheduledPreview.toLocaleTimeString('da-DK', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${dateStr} · kl. ${timeStr}`;
}

export type PlannedWorkoutInviteFormVariant = 'hero' | 'compact';

export type PlannedWorkoutInviteFormProps = {
  variant: PlannedWorkoutInviteFormVariant;
  /** compact: overskrift øverst (fx "Planlæg træning") */
  title?: string;
  subtitle?: string;
  /** hero: vist som "Træn med …" */
  peerDisplayName: string;
  selectedDate: Date;
  selectedTime: Date;
  onPressSelectDate: () => void;
  onPressSelectTime: () => void;
  scheduledPreview: Date;
  planSelectedGym: DanishGym | null;
  onGymChange: (gym: DanishGym) => void;
  planMuscle: MuscleGroup;
  onMuscleChange: (m: MuscleGroup) => void;
  onSubmit: () => void;
  submitLabel: string;
  saving?: boolean;
  submitDisabled?: boolean;
  scrollBottomPadding?: number;
};

const PlannedWorkoutInviteForm: React.FC<PlannedWorkoutInviteFormProps> = ({
  variant,
  title,
  subtitle,
  peerDisplayName,
  selectedDate,
  selectedTime,
  onPressSelectDate,
  onPressSelectTime,
  scheduledPreview,
  planSelectedGym,
  onGymChange,
  planMuscle,
  onMuscleChange,
  onSubmit,
  submitLabel,
  saving = false,
  submitDisabled = false,
  scrollBottomPadding = spacing.xxxl,
}) => {
  const displayName = (peerDisplayName || 'din ven').trim() || 'din ven';

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.scrollContent, {paddingBottom: scrollBottomPadding}]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled">
      {variant === 'hero' ? (
        <Animated.View entering={FadeInDown.duration(240)}>
          <View style={styles.hero}>
            <View style={styles.avatarRing}>
              <View style={styles.avatarInner}>
                <Text style={styles.avatarLetter}>{displayName.charAt(0).toUpperCase()}</Text>
              </View>
            </View>
            <Text style={styles.heroTitle}>Træn med {displayName}</Text>
            <Text style={styles.heroSubtitle}>Planlæg en session sammen</Text>
          </View>
        </Animated.View>
      ) : (
        <Animated.View entering={FadeInDown.duration(200)}>
          <View style={styles.compactHeader}>
            {title ? <Text style={styles.compactTitle}>{title}</Text> : null}
            {subtitle ? <Text style={styles.compactSubtitle}>{subtitle}</Text> : null}
          </View>
        </Animated.View>
      )}

      <Animated.View entering={FadeInDown.duration(260).delay(variant === 'hero' ? 50 : 20)}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Tidspunkt</Text>
          <Pressable
            onPress={onPressSelectDate}
            style={({pressed}) => [styles.timeRow, pressed && styles.rowPressed]}
            android_ripple={{color: INVITE_FORM_PURPLE_MIST}}>
            <View style={styles.timeIconWrap}>
              <Icon name="calendar-outline" size={18} color={colors.primary} />
            </View>
            <Text style={styles.timeRowText}>{formatInviteDateLine(selectedDate)}</Text>
            <Icon name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
          <View style={styles.hairline} />
          <Pressable
            onPress={onPressSelectTime}
            style={({pressed}) => [styles.timeRow, pressed && styles.rowPressed]}
            android_ripple={{color: INVITE_FORM_PURPLE_MIST}}>
            <View style={styles.timeIconWrap}>
              <Icon name="time-outline" size={18} color={colors.primary} />
            </View>
            <Text style={styles.timeRowText}>{formatInviteTimeLine(selectedTime)}</Text>
            <Icon name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
          <View style={styles.previewPill}>
            <Text style={styles.previewPillText}>{formatInvitePreviewLine(scheduledPreview)}</Text>
          </View>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(260).delay(variant === 'hero' ? 90 : 50)}>
        <TrainingCenterPicker
          variant="inviteCard"
          value={planSelectedGym}
          onChange={onGymChange}
        />
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(260).delay(variant === 'hero' ? 130 : 80)}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Træningstype</Text>
          <Text style={styles.cardHint}>Én type — som i Planlagte sessions</Text>
          <TrainingTypeMuscleGrid value={planMuscle} onChange={onMuscleChange} />
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(280).delay(variant === 'hero' ? 160 : 110)}>
        <PurpleGradientButton
          onPress={onSubmit}
          disabled={submitDisabled}
          style={styles.sendCta}>
          {saving ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.sendCtaText}>{submitLabel}</Text>
          )}
        </PurpleGradientButton>
      </Animated.View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: {width: '100%'},
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  hero: {
    alignItems: 'center',
    paddingBottom: spacing.xl,
  },
  compactHeader: {
    paddingBottom: spacing.lg,
    alignItems: 'center',
  },
  compactTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  compactSubtitle: {
    marginTop: spacing.xs,
    ...typography.caption,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  avatarRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    padding: 3,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.primaryLight,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  avatarInner: {
    flex: 1,
    borderRadius: 34,
    backgroundColor: INVITE_FORM_PURPLE_MIST,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    marginTop: spacing.xs,
    ...typography.caption,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: INVITE_FORM_CARD_LINE,
    ...shadows.sm,
  },
  cardLabel: {
    ...typography.small,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.md,
  },
  cardHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  rowPressed: {
    opacity: 0.88,
  },
  timeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: INVITE_FORM_PURPLE_MIST,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  timeRowText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: -0.2,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(17, 24, 39, 0.07)',
    marginLeft: 36 + spacing.md,
  },
  previewPill: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: INVITE_FORM_PURPLE_MIST,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(139, 92, 246, 0.14)',
  },
  previewPillText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primaryDark,
    textAlign: 'center',
  },
  sendCta: {
    marginTop: spacing.sm,
    minHeight: 54,
  },
  sendCtaText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.white,
    letterSpacing: -0.2,
  },
});

export default PlannedWorkoutInviteForm;
