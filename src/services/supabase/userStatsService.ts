import {supabase} from '@/services/supabase/supabaseClient';
import {daysBetweenLocalDateKeys, getLocalDateString} from '@/utils/streakUtils';

export type UserStats = {
  currentStreak: number;
  longestStreak: number;
  lastStreakDate: string | null;
  streakFreezeAvailable: number;
  streakFreezeUsedThisMonth: boolean;
  streakFreezeMonth: string | null;
  totalCheckIns: number;
  totalTrainingMinutes: number;
};

export type CompletedSessionForStats = {
  startedAt: Date;
  endedAt: Date;
  hasValidCheckIn: boolean;
};

const DEFAULT_STATS: UserStats = {
  currentStreak: 0,
  longestStreak: 0,
  lastStreakDate: null,
  streakFreezeAvailable: 1,
  streakFreezeUsedThisMonth: false,
  streakFreezeMonth: null,
  totalCheckIns: 0,
  totalTrainingMinutes: 0,
};

function currentMonthKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function normalizeStatsRow(row: Record<string, unknown> | null | undefined): UserStats {
  if (!row) return {...DEFAULT_STATS};
  return {
    currentStreak: Number(row.current_streak ?? 0) || 0,
    longestStreak: Number(row.longest_streak ?? 0) || 0,
    lastStreakDate:
      typeof row.last_streak_date === 'string' && row.last_streak_date.length > 0
        ? row.last_streak_date
        : null,
    streakFreezeAvailable: Number(row.streak_freeze_available ?? 1) || 0,
    streakFreezeUsedThisMonth: Boolean(row.streak_freeze_used_this_month ?? false),
    streakFreezeMonth:
      typeof row.streak_freeze_month === 'string' && row.streak_freeze_month.length > 0
        ? row.streak_freeze_month
        : null,
    totalCheckIns: Number(row.total_check_ins ?? 0) || 0,
    totalTrainingMinutes: Number(row.total_training_minutes ?? 0) || 0,
  };
}

export async function getUserStats(userId: string): Promise<UserStats> {
  const {data, error} = await supabase
    .from('profiles')
    .select(
      'current_streak, longest_streak, last_streak_date, streak_freeze_available, streak_freeze_used_this_month, streak_freeze_month, total_check_ins, total_training_minutes',
    )
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return normalizeStatsRow((data ?? undefined) as Record<string, unknown> | undefined);
}

export async function getUserStatsMap(userIds: string[]): Promise<Record<string, UserStats>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return {};
  const {data, error} = await supabase
    .from('profiles')
    .select(
      'id, current_streak, longest_streak, last_streak_date, streak_freeze_available, streak_freeze_used_this_month, streak_freeze_month, total_check_ins, total_training_minutes',
    )
    .in('id', ids);
  if (error) throw error;

  const out: Record<string, UserStats> = {};
  for (const id of ids) {
    out[id] = {...DEFAULT_STATS};
  }
  (data ?? []).forEach((row: any) => {
    out[String(row.id)] = normalizeStatsRow(row);
  });
  return out;
}

export async function updateUserStreak(userId: string, activityDate: Date): Promise<UserStats> {
  const now = new Date();
  const todayKey = getLocalDateString(activityDate);
  const monthKey = currentMonthKey(now);
  const current = await getUserStats(userId);

  let next = {...current};

  if (next.streakFreezeMonth !== monthKey) {
    next.streakFreezeMonth = monthKey;
    next.streakFreezeAvailable = 1;
    next.streakFreezeUsedThisMonth = false;
  }

  if (next.lastStreakDate === todayKey) {
    return next;
  }

  if (!next.lastStreakDate) {
    next.currentStreak = 1;
  } else {
    const diff = daysBetweenLocalDateKeys(next.lastStreakDate, todayKey);
    if (diff <= 0) {
      return next;
    }
    if (diff === 1) {
      next.currentStreak += 1;
    } else if (diff === 2 && next.streakFreezeAvailable > 0) {
      next.currentStreak += 1;
      next.streakFreezeAvailable = Math.max(0, next.streakFreezeAvailable - 1);
      next.streakFreezeUsedThisMonth = true;
    } else {
      next.currentStreak = 1;
    }
  }

  next.lastStreakDate = todayKey;
  next.longestStreak = Math.max(next.longestStreak, next.currentStreak);

  const {error} = await supabase
    .from('profiles')
    .update({
      current_streak: next.currentStreak,
      longest_streak: next.longestStreak,
      last_streak_date: next.lastStreakDate,
      streak_freeze_available: next.streakFreezeAvailable,
      streak_freeze_used_this_month: next.streakFreezeUsedThisMonth,
      streak_freeze_month: next.streakFreezeMonth,
    })
    .eq('id', userId);
  if (error) throw error;

  return next;
}

export async function updateUserStatsAfterSession(
  userId: string,
  session: CompletedSessionForStats,
): Promise<UserStats> {
  const sessionMinutesRaw = Math.max(
    0,
    Math.round((session.endedAt.getTime() - session.startedAt.getTime()) / 60000),
  );
  const boundedMinutes = Math.min(240, sessionMinutesRaw); // anti-cheat: cap at 4h
  const isValidDurationWorkout = boundedMinutes >= 20;
  const countsForStreak = session.hasValidCheckIn || isValidDurationWorkout;

  const current = await getUserStats(userId);
  let next = {...current};

  if (session.hasValidCheckIn) {
    next.totalCheckIns += 1;
  }
  next.totalTrainingMinutes += boundedMinutes;

  if (countsForStreak) {
    next = await updateUserStreak(userId, session.endedAt);
  }

  const {error} = await supabase
    .from('profiles')
    .update({
      total_check_ins: next.totalCheckIns,
      total_training_minutes: next.totalTrainingMinutes,
    })
    .eq('id', userId);
  if (error) throw error;

  return next;
}

export function subscribeUserStats(
  userId: string,
  onChange: () => void,
): () => void {
  const channel = supabase
    .channel(`profile-stats-${userId}`)
    .on(
      'postgres_changes',
      {event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}`},
      () => onChange(),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

