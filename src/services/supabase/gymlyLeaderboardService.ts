import {supabase} from '@/services/supabase/supabaseClient';
/**
 * Supabase RPC for Gymly-wide ranglister — Reserved for future competitive/social systems.
 * Not mounted from primary chrome while launch focus is live/social (see launchSurfaceConfig).
 */
import type {LeaderboardEntry} from '@/types/leaderboard.types';

export type GymlyLeaderboardMetric = 'checkins' | 'minutes' | 'streak';
export type GymlyLeaderboardPeriod = 'week' | 'month' | 'all';
export type GymlyLeaderboardScope = 'global' | 'friends' | 'center';

export type GymlyLeaderboardRpcRow = {
  rank: number;
  user_id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  check_ins_count: number;
  minutes_sum: number;
  streak_value: number;
  active_today: boolean;
  hot_streak_hint: boolean;
};

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function bool(v: unknown): boolean {
  return v === true || v === 'true';
}

/** PostgREST returnerer typisk snake_case fra RPC. */
function parseRpcRow(raw: unknown, idx: number): GymlyLeaderboardRpcRow | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const r = raw as Record<string, unknown>;
  const userId = String(r.user_id ?? r.userId ?? '').trim();
  if (!userId) {
    if (__DEV__) {
      console.warn('[gymlyLeaderboard] row mangler user_id', Object.keys(r), r);
    }
    return null;
  }
  return {
    rank: num(r.rank, idx + 1),
    user_id: userId,
    display_name: String(r.display_name ?? r.displayName ?? 'Bruger'),
    username: (r.username as string | null) ?? null,
    avatar_url: (r.avatar_url as string | null) ?? (r.avatarUrl as string | null) ?? null,
    check_ins_count: num(r.check_ins_count ?? r.checkInsCount, 0),
    minutes_sum: num(r.minutes_sum ?? r.minutesSum, 0),
    streak_value: num(r.streak_value ?? r.streakValue, 0),
    active_today: bool(r.active_today ?? r.activeToday),
    hot_streak_hint: bool(r.hot_streak_hint ?? r.hotStreakHint),
  };
}

function formatValueLabel(metric: GymlyLeaderboardMetric, value: number): string {
  if (metric === 'checkins') {
    return value === 1 ? '1 check-in' : `${value} check-ins`;
  }
  if (metric === 'minutes') {
    return `${value} min`;
  }
  return value === 1 ? '1 dags streak' : `${value} dages streak`;
}

function valueForMetric(metric: GymlyLeaderboardMetric, row: GymlyLeaderboardRpcRow): number {
  if (metric === 'checkins') {
    return row.check_ins_count;
  }
  if (metric === 'minutes') {
    return row.minutes_sum;
  }
  return row.streak_value;
}

function buildAliveSubtitle(
  metric: GymlyLeaderboardMetric,
  rank: number,
  row: GymlyLeaderboardRpcRow,
): string | undefined {
  const parts: string[] = [];
  if (rank === 1) {
    parts.push('👑 #1');
  }
  if (row.active_today) {
    parts.push('⚡ Aktiv i dag');
  }
  if (metric === 'streak' && row.hot_streak_hint) {
    parts.push('🔥 Hot streak');
  }
  if (parts.length === 0) {
    return undefined;
  }
  return parts.slice(0, 2).join(' · ');
}

/**
 * Henter rangliste fra Supabase RPC (SECURITY DEFINER — aggregeret, RLS-neutral).
 */
export async function fetchGymlyLeaderboard(params: {
  metric: GymlyLeaderboardMetric;
  period: GymlyLeaderboardPeriod;
  scope: GymlyLeaderboardScope;
  centerGymId: string | null;
  viewerId: string;
}): Promise<LeaderboardEntry[]> {
  const {data: sessionData} = await supabase.auth.getSession();
  const supabaseUid = sessionData.session?.user?.id;
  if (__DEV__) {
    if (!supabaseUid) {
      console.warn(
        '[gymlyLeaderboard] Ingen Supabase-session endnu — RPC returnerer typisk tom liste indtil session er klar.',
      );
    } else if (supabaseUid !== params.viewerId) {
      console.warn('[gymlyLeaderboard] Session uid ≠ viewerId', {
        supabaseUid,
        viewerId: params.viewerId,
      });
    }
  }

  const {data, error} = await supabase.rpc('gymly_leaderboard', {
    p_metric: params.metric,
    p_period: params.period,
    p_scope: params.scope,
    p_center_gym_id: params.centerGymId?.trim() || null,
    p_viewer: params.viewerId,
  });

  if (error) {
    if (__DEV__) {
      console.warn('[gymlyLeaderboard] RPC error', error.message, error);
    }
    throw error;
  }

  const rawRows = Array.isArray(data) ? data : [];
  if (__DEV__) {
    console.warn('[gymlyLeaderboard] raw count', rawRows.length);
  }

  const rows: GymlyLeaderboardRpcRow[] = [];
  rawRows.forEach((raw, idx) => {
    const parsed = parseRpcRow(raw, idx);
    if (parsed) {
      rows.push(parsed);
    }
  });

  return rows.map((row, idx) => {
    const rank = Number(row.rank ?? idx + 1);
    const safeRank = Number.isFinite(rank) && rank > 0 ? rank : idx + 1;
    const value = valueForMetric(params.metric, row);
    const isCurrentUser = row.user_id === params.viewerId;
    const isFriend = params.scope === 'friends' && row.user_id !== params.viewerId;
    return {
      rank: safeRank,
      userId: row.user_id,
      displayName: row.display_name?.trim() || 'Bruger',
      username: row.username?.trim() || undefined,
      profileImageUrl: row.avatar_url ?? undefined,
      value,
      valueLabel: formatValueLabel(params.metric, value),
      isCurrentUser,
      isFriend,
      aliveSubtitle: buildAliveSubtitle(params.metric, safeRank, row),
      leaderboardCheckIns: row.check_ins_count,
      leaderboardMinutes: row.minutes_sum,
      leaderboardStreak: row.streak_value,
    } as LeaderboardEntry;
  });
}
