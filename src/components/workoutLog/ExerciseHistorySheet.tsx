/**
 * Modal: recent history for one exercise across past sessions.
 */

import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows} from '@/theme/designTokens';
import {getExerciseHistory} from '@/services/supabase/workoutLogService';
import type {ExerciseHistorySession} from '@/types/workoutLog.types';
import {formatLastSetLine} from '@/utils/workoutLogHistory';
import {useTranslation, useAppFormat, getExerciseDisplayName} from '@/i18n';

export type ExerciseHistorySheetProps = {
  visible: boolean;
  userId: string;
  exerciseName: string;
  exerciseId?: string | null;
  excludeSessionId?: string | null;
  onClose: () => void;
};

const ExerciseHistorySheet: React.FC<ExerciseHistorySheetProps> = ({
  visible,
  userId,
  exerciseName,
  exerciseId,
  excludeSessionId,
  onClose,
}) => {
  const {t, language} = useTranslation();
  const {intlLocale} = useAppFormat();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<ExerciseHistorySession[]>([]);
  const displayName = getExerciseDisplayName({
    exerciseId: exerciseId ?? null,
    fallbackName: exerciseName,
    language,
  });

  useEffect(() => {
    if (!visible || !userId || !exerciseName) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    void getExerciseHistory(userId, exerciseName, {
      excludeSessionId,
      exerciseId,
      limit: 12,
    })
      .then(rows => {
        if (!cancelled) {
          setSessions(rows);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [visible, userId, exerciseName, exerciseId, excludeSessionId]);

  const formatDay = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(intlLocale, {
      month: 'short',
      day: 'numeric',
      year:
        d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.sm},
          ]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title} numberOfLines={2}>
                {displayName}
              </Text>
              <Text style={styles.subtitle}>{t('workoutLog.historyTitle')}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Icon name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator
              color={colors.primary}
              style={{marginVertical: spacing.xl}}
            />
          ) : sessions.length === 0 ? (
            <Text style={styles.empty}>{t('workoutLog.historyEmpty')}</Text>
          ) : (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}>
              {sessions.map(session => (
                <View key={session.sessionId} style={styles.sessionCard}>
                  <Text style={styles.sessionDate}>
                    {formatDay(session.performedAt)}
                  </Text>
                  {session.sets.map(set => (
                    <Text
                      key={`${session.sessionId}-${set.setNumber}`}
                      style={styles.setLine}>
                      {formatLastSetLine(set, session.trackingType)}
                    </Text>
                  ))}
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
  },
  sheet: {
    backgroundColor: colors.backgroundCard,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    maxHeight: '78%',
    paddingHorizontal: spacing.lg,
    ...shadows.md,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  headerText: {flex: 1, paddingRight: spacing.sm},
  title: {
    ...typography.h4,
    color: colors.text,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
    fontWeight: '600',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  empty: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginVertical: spacing.xl,
  },
  scroll: {flexGrow: 0},
  scrollContent: {paddingBottom: spacing.lg},
  sessionCard: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  sessionDate: {
    ...typography.bodyBold,
    color: colors.primaryDark,
    marginBottom: spacing.xs,
  },
  setLine: {
    ...typography.body,
    color: colors.text,
    fontWeight: '500',
    paddingVertical: 3,
  },
});

export default ExerciseHistorySheet;
