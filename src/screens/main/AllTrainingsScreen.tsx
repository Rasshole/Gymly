/**
 * Fuld træningshistorik (afsluttede check_ins) — åbnes fra Profil → Se alle.
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
import {useFocusEffect} from '@react-navigation/native';
import {useAppStore} from '@/store/appStore';
import {CompletedSessionRow} from '@/components/profile/CompletedSessionRow';
import {
  fetchCompletedCheckInSessionsForUser,
  type ProfileCompletedSession,
} from '@/services/supabase/profileCheckInHistory';
import {subscribeCheckInsPresence} from '@/realtime/checkInsPresenceSubscription';
import {isDemoContentMode} from '@/demo/demoContentGate';
import {getDemoRecentSessions} from '@/demo/demoTrainingStatsSeed';
import {
  filterSessionsByPeriod,
  sortSessionsNewestFirst,
} from '@/utils/filterSessionsByPeriod';
import type {WorkoutPeriod} from '@/utils/workoutPeriodFilter';
import colors from '@/theme/colors';
import {useTranslation} from '@/i18n';
import {spacing, typography, radius} from '@/theme/designTokens';

const AllTrainingsScreen = () => {
  const {t} = useTranslation();
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
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState<WorkoutPeriod>('all');

  const load = useCallback(async () => {
    if (!userId) {
      setSessions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      if (isDemoContentMode()) {
        setSessions(sortSessionsNewestFirst(getDemoRecentSessions()));
      } else {
        const rows = await fetchCompletedCheckInSessionsForUser(userId, 200);
        setSessions(sortSessionsNewestFirst(rows));
      }
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

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
      const hay = `${s.gymName} ${s.workoutType ?? ''} ${s.partnerDisplayName ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sessions, period, query]);

  return (
    <View style={styles.container}>
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
              <Text style={[styles.periodChipText, active && styles.periodChipTextActive]}>
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
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name="fitness-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>{t('allTrainings.emptyTitle')}</Text>
              <Text style={styles.emptySub}>
                {sessions.length === 0
                  ? t('profile.noWorkoutsHistorySub')
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
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
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
});

export default AllTrainingsScreen;
