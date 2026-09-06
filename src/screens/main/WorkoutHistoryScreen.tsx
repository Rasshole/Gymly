/**
 * Full workout history — completed check_ins with log summaries.
 * Opened from Profile → Se alle.
 */

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import type {StackNavigationProp} from '@react-navigation/stack';
import {useAppStore} from '@/store/appStore';
import {CompletedSessionRow} from '@/components/profile/CompletedSessionRow';
import {
  fetchWorkoutHistoryList,
} from '@/services/supabase/workoutHistoryService';
import type {ProfileCompletedSession} from '@/services/supabase/profileCheckInHistory';
import type {WorkoutSessionLogSummary} from '@/types/workoutLog.types';
import {subscribeCheckInsPresence} from '@/realtime/checkInsPresenceSubscription';
import {isDemoContentMode} from '@/demo/demoContentGate';
import {getDemoRecentSessions} from '@/demo/demoTrainingStatsSeed';
import {
  filterSessionsByPeriod,
  sortSessionsNewestFirst,
} from '@/utils/filterSessionsByPeriod';
import type {WorkoutPeriod} from '@/utils/workoutPeriodFilter';
import {formatVolumeKg} from '@/utils/workoutLogFormat';
import colors from '@/theme/colors';
import {useTranslation} from '@/i18n';
import {spacing, typography, radius} from '@/theme/designTokens';

type Nav = StackNavigationProp<{
  WorkoutHistoryDetail: {sessionId: string};
}>;

const WorkoutHistoryScreen = () => {
  const {t} = useTranslation();
  const navigation = useNavigation<Nav>();
  const periodOptions = useMemo(
    () => [
      {key: 'all' as const, label: t('profile.periodAll')},
      {key: 'week' as const, label: t('profile.periodWeek')},
      {key: 'month' as const, label: t('allTrainings.periodMonth')},
      {key: 'year' as const, label: t('allTrainings.periodYear')},
    ],
    [t],
  );
  const userId = useAppStore(s => s.user?.id);
  const [sessions, setSessions] = useState<ProfileCompletedSession[]>([]);
  const [summaries, setSummaries] = useState<
    Record<string, WorkoutSessionLogSummary>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState<WorkoutPeriod>('all');

  const load = useCallback(async () => {
    if (!userId) {
      setSessions([]);
      setSummaries({});
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (isDemoContentMode()) {
        setSessions(sortSessionsNewestFirst(getDemoRecentSessions()));
        setSummaries({});
      } else {
        const {sessions: rows, summaries: sums} =
          await fetchWorkoutHistoryList(userId, 200);
        setSessions(sortSessionsNewestFirst(rows));
        setSummaries(sums);
      }
    } catch (e: any) {
      setSessions([]);
      setSummaries({});
      setError(e?.message ?? t('workoutHistory.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [userId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (!userId || isDemoContentMode()) {
      return;
    }
    return subscribeCheckInsPresence(() => {
      void load();
    });
  }, [userId, load]);

  const filtered = useMemo(() => {
    let list = filterSessionsByPeriod(sessions, period);
    const q = query.trim().toLowerCase();
    if (!q) {
      return list;
    }
    return list.filter(s => {
      const hay =
        `${s.gymName} ${s.workoutType ?? ''} ${s.partnerDisplayName ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sessions, period, query]);

  const openDetail = (sessionId: string) => {
    navigation.navigate('WorkoutHistoryDetail', {sessionId});
  };

  const summaryLine = (sessionId: string): string | undefined => {
    const s = summaries[sessionId];
    if (!s || (s.exerciseCount === 0 && s.setCount === 0)) {
      return undefined;
    }
    return t('workoutHistory.summaryLine', {
      exercises: s.exerciseCount,
      sets: s.setCount,
      volume: formatVolumeKg(s.totalVolumeKg),
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.screenSub}>{t('workoutHistory.listSubtitle')}</Text>

      <View style={styles.searchWrap}>
        <Icon name="search-outline" size={20} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={t('allTrainings.searchPlaceholder')}
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>

      <View style={styles.periodRow}>
        {periodOptions.map(({key, label}) => {
          const active = period === key;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.periodChip, active && styles.periodChipActive]}
              onPress={() => setPeriod(key)}
              activeOpacity={0.85}>
              <Text
                style={[
                  styles.periodChipText,
                  active && styles.periodChipTextActive,
                ]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading && sessions.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : error && sessions.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>{t('workoutHistory.loadFailed')}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void load()}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          contentContainerStyle={
            filtered.length === 0 ? styles.listEmptyContent : styles.listContent
          }
          renderItem={({item, index}) => (
            <CompletedSessionRow
              session={item}
              isLast={index === filtered.length - 1}
              summaryLine={summaryLine(item.id)}
              onPress={() => openDetail(item.id)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name="fitness-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>
                {t('workoutHistory.emptyTitle')}
              </Text>
              <Text style={styles.emptySub}>
                {sessions.length === 0
                  ? t('workoutHistory.emptyBody')
                  : t('allTrainings.emptyFiltered')}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screenSub: {
    ...typography.caption,
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    fontWeight: '600',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    paddingVertical: 4,
  },
  periodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  periodChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  periodChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  periodChipText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  periodChipTextActive: {
    color: colors.white,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  listEmptyContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    ...typography.bodyBold,
    color: colors.text,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  emptySub: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  errorTitle: {
    ...typography.bodyBold,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  retryBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
  },
  retryText: {
    ...typography.bodyBold,
    color: colors.white,
  },
});

export default WorkoutHistoryScreen;
