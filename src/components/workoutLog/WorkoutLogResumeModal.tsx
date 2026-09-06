/**
 * Kort resume efter check-out når der er logget øvelser/sæt (+ valgfri PR-summary).
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows} from '@/theme/designTokens';
import SocialPrimaryButton from '@/components/social/SocialPrimaryButton';
import type {WorkoutLogSummary} from '@/types/workoutLog.types';
import type {DetectedPersonalRecord} from '@/types/personalRecord.types';
import {formatVolumeKg} from '@/utils/workoutLogFormat';
import {formatWorkoutDuration} from '@/utils/groupSessionFormat';
import {
  formatPrLiftLine,
  formatPrTypeLabel,
} from '@/utils/personalRecordCopy';
import {useTranslation, getRuntimeLanguage, getExerciseDisplayName} from '@/i18n';

export type WorkoutLogResumeModalProps = {
  visible: boolean;
  summary: WorkoutLogSummary | null;
  personalRecords?: DetectedPersonalRecord[];
  firstTimeExerciseNames?: string[];
  onDone: () => void;
  /** Opens Share Workout for this completed sessionId */
  onShareWorkout?: (sessionId: string) => void;
};

const WorkoutLogResumeModal: React.FC<WorkoutLogResumeModalProps> = ({
  visible,
  summary,
  personalRecords = [],
  firstTimeExerciseNames = [],
  onDone,
  onShareWorkout,
}) => {
  const {t, language} = useTranslation();
  const insets = useSafeAreaInsets();
  const lang = getRuntimeLanguage();
  if (!summary) {
    return null;
  }

  const prCount = personalRecords.length;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDone}>
      <View style={[styles.overlay, {paddingBottom: insets.bottom + spacing.lg}]}>
        <View style={styles.card}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>{t('workoutLog.resumeTitle')}</Text>
            <View style={styles.stats}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{summary.exerciseCount}</Text>
                <Text style={styles.statLabel}>{t('workoutLog.exercises')}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{summary.setCount}</Text>
                <Text style={styles.statLabel}>{t('workoutLog.sets')}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
                  {formatVolumeKg(summary.totalVolumeKg)}
                </Text>
                <Text style={styles.statLabel}>{t('workoutLog.volume')}</Text>
              </View>
            </View>
            <Text style={styles.duration}>
              {formatWorkoutDuration(summary.durationMinutes)}
            </Text>

            {prCount > 0 ? (
              <View style={styles.prBlock}>
                <View style={styles.prHeader}>
                  <Icon name="trophy" size={18} color={colors.primary} />
                  <Text style={styles.prHeaderText}>
                    {prCount === 1
                      ? t('personalRecords.oneNewPr')
                      : t('personalRecords.nNewPrs', {count: prCount})}
                  </Text>
                </View>
                {personalRecords.map((pr, i) => (
                  <View
                    key={`${pr.exerciseName}-${pr.recordType}-${i}`}
                    style={styles.prRow}>
                    <Text style={styles.prExercise}>
                      {getExerciseDisplayName({
                        exerciseId: pr.exerciseId ?? null,
                        fallbackName: pr.exerciseName,
                        language,
                      })}
                    </Text>
                    <Text style={styles.prLift}>
                      {formatPrLiftLine(pr.weightKg, pr.reps)}
                    </Text>
                    <Text style={styles.prType}>
                      {formatPrTypeLabel(pr.recordType, lang)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {firstTimeExerciseNames.length > 0 ? (
              <View style={styles.firstBlock}>
                {firstTimeExerciseNames.slice(0, 3).map(name => (
                  <Text key={name} style={styles.firstText}>
                    {t('personalRecords.firstExerciseLogged', {
                      name: getExerciseDisplayName({
                        exerciseId: null,
                        fallbackName: name,
                        language,
                      }),
                    })}
                  </Text>
                ))}
              </View>
            ) : null}
          </ScrollView>

          {onShareWorkout && summary.sessionId ? (
            <SocialPrimaryButton
              label={t('workoutHistory.shareWorkout')}
              onPress={() => {
                const id = summary.sessionId;
                onDone();
                onShareWorkout(id);
              }}
              variant="premium"
            />
          ) : null}
          <SocialPrimaryButton
            label={t('workoutLog.done')}
            onPress={onDone}
            variant={onShareWorkout ? 'flat' : 'premium'}
            style={onShareWorkout ? {marginTop: spacing.sm} : undefined}
          />
          <TouchableOpacity onPress={onDone} style={styles.skip}>
            <Text style={styles.skipText}>{t('common.close')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    padding: spacing.xl,
    maxHeight: '85%',
    ...shadows.lg,
  },
  title: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  statValue: {
    ...typography.h4,
    color: colors.primaryDark,
    fontWeight: '800',
  },
  statLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4,
    fontWeight: '600',
  },
  duration: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: spacing.lg,
  },
  prBlock: {
    backgroundColor: colors.primary + '0C',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary + '33',
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  prHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.sm,
  },
  prHeaderText: {
    ...typography.body,
    color: colors.primaryDark,
    fontWeight: '800',
  },
  prRow: {
    marginBottom: spacing.sm,
  },
  prExercise: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
  },
  prLift: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
    marginTop: 2,
  },
  prType: {
    ...typography.small,
    color: colors.primary,
    fontWeight: '700',
    marginTop: 2,
  },
  firstBlock: {
    marginBottom: spacing.md,
  },
  firstText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: 4,
  },
  skip: {alignItems: 'center', marginTop: spacing.md},
  skipText: {...typography.small, color: colors.textMuted},
});

export default WorkoutLogResumeModal;
