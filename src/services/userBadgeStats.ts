import {useDashboardStatsStore} from '@/store/dashboardStatsStore';
import {useSessionStore} from '@/store/sessionStore';
import {supabase} from '@/services/supabase/supabaseClient';
import type {UserBadgeStats} from '@/types/badge.types';

const TZ = 'Europe/Copenhagen';
const CHECKIN_DEDUP_MS = 30 * 60 * 1000;
const MIN_SESSION_MINUTES = 5;

function ymdCopenhagen(iso: string | null | undefined): string | null {
  if (!iso) {
    return null;
  }
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

function minutesSinceMidnightCopenhagen(iso: string): number {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
  const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
  return h * 60 + m;
}

function prevYmd(ymd: string): string {
  const [y, mo, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d));
  t.setUTCDate(t.getUTCDate() - 1);
  const yy = t.getUTCFullYear();
  const mm = String(t.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(t.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function computeCurrentStreakDays(dayKeys: Set<string>): number {
  if (dayKeys.size === 0) {
    return 0;
  }
  const today = ymdCopenhagen(new Date().toISOString());
  if (!today) {
    return 0;
  }
  const yesterday = prevYmd(today);
  let cursor: string | null = null;
  if (dayKeys.has(today)) {
    cursor = today;
  } else if (dayKeys.has(yesterday)) {
    cursor = yesterday;
  } else {
    return 0;
  }
  let streak = 0;
  while (cursor && dayKeys.has(cursor)) {
    streak += 1;
    cursor = prevYmd(cursor);
  }
  return streak;
}

function computeLongestStreakDays(dayKeys: Set<string>): number {
  if (dayKeys.size === 0) {
    return 0;
  }
  const sorted = [...dayKeys].sort();
  let best = 1;
  let cur = 1;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (a === b) {
      continue;
    }
    const na = prevYmd(b);
    if (na === a) {
      cur += 1;
      best = Math.max(best, cur);
    } else {
      cur = 1;
    }
  }
  return best;
}

type CheckInRow = {
  started_at: string | null;
  ended_at: string | null;
  created_at: string | null;
  is_active: boolean | null;
  gym_id: string | null;
  planned_workout_id: string | null;
};

function effectiveStartMs(r: CheckInRow): number | null {
  const s = r.started_at || r.created_at;
  if (!s) {
    return null;
  }
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
}

function creditCheckInsSorted(rows: CheckInRow[]): CheckInRow[] {
  const withStart = rows
    .map(r => ({r, t: effectiveStartMs(r)}))
    .filter((x): x is {r: CheckInRow; t: number} => x.t != null)
    .sort((a, b) => a.t - b.t);
  const credited: CheckInRow[] = [];
  let lastCreditedMs: number | null = null;
  for (const {r, t} of withStart) {
    if (lastCreditedMs == null || t - lastCreditedMs >= CHECKIN_DEDUP_MS) {
      credited.push(r);
      lastCreditedMs = t;
    }
  }
  return credited;
}

const emptyStats = (): UserBadgeStats => ({
  total_training_time_minutes: 0,
  total_sessions: 0,
  current_streak_days: 0,
  longest_streak_days: 0,
  longest_session_minutes: 0,
  total_check_ins: 0,
  friends_trained_with_count: 0,
  unique_gyms_count: 0,
  total_messages_sent: 0,
  unique_dm_recipients: 0,
  planned_workouts_created: 0,
  planned_workouts_completed_valid: 0,
  early_check_ins: 0,
  late_check_ins: 0,
});

async function countPlannedCompletedValid(
  checkRows: CheckInRow[],
): Promise<number> {
  const plannedIds = [
    ...new Set(
      checkRows.map(r => r.planned_workout_id).filter((id): id is string => Boolean(id)),
    ),
  ];
  if (plannedIds.length === 0) {
    return 0;
  }
  const byId = new Map<string, string>();
  const chunk = 80;
  for (let i = 0; i < plannedIds.length; i += chunk) {
    const slice = plannedIds.slice(i, i + chunk);
    const {data, error} = await supabase
      .from('planned_workouts')
      .select('id, scheduled_at, status')
      .in('id', slice)
      .eq('status', 'completed');
    if (error || !data) {
      continue;
    }
    for (const r of data as {id: string; scheduled_at: string}[]) {
      byId.set(r.id, r.scheduled_at);
    }
  }
  const qualifyingPlans = new Set<string>();
  for (const c of checkRows) {
    if (!c.planned_workout_id || !c.started_at) {
      continue;
    }
    const sched = byId.get(c.planned_workout_id);
    if (!sched) {
      continue;
    }
    if (new Date(c.started_at).getTime() >= new Date(sched).getTime()) {
      qualifyingPlans.add(c.planned_workout_id);
    }
  }
  return qualifyingPlans.size;
}

export async function buildUserBadgeStats(userId: string): Promise<UserBadgeStats> {
  const dash = useDashboardStatsStore.getState();
  const elapsedSeconds = useSessionStore.getState().getElapsedSeconds();
  const activeMinutesLive = Math.floor(elapsedSeconds / 60);

  let checkRows: CheckInRow[] = [];
  let friendsCount = 0;
  let msgCount = 0;
  let threadIds: string[] = [];
  let plannedCreated = 0;

  try {
    const [ciRes, frRes, dmCountRes, dmThreadsRes, pwCreatedRes] = await Promise.all([
      supabase
        .from('check_ins')
        .select(
          'started_at, ended_at, created_at, is_active, gym_id, planned_workout_id',
        )
        .eq('user_id', userId)
        .order('created_at', {ascending: true})
        .limit(4000),
      supabase
        .from('friendships')
        .select('user_a', {count: 'exact', head: true})
        .or(`user_a.eq.${userId},user_b.eq.${userId}`),
      supabase
        .from('dm_messages')
        .select('id', {count: 'exact', head: true})
        .eq('sender_id', userId),
      supabase.from('dm_messages').select('thread_id').eq('sender_id', userId).limit(8000),
      supabase
        .from('planned_workouts')
        .select('id', {count: 'exact', head: true})
        .eq('creator_user_id', userId),
    ]);

    if (!ciRes.error && ciRes.data) {
      checkRows = ciRes.data as CheckInRow[];
    }
    if (!frRes.error && typeof frRes.count === 'number') {
      friendsCount = frRes.count;
    }
    if (!dmCountRes.error && typeof dmCountRes.count === 'number') {
      msgCount = dmCountRes.count;
    }
    if (!dmThreadsRes.error && dmThreadsRes.data) {
      threadIds = (dmThreadsRes.data as {thread_id: string}[]).map(r => r.thread_id);
    }
    if (!pwCreatedRes.error && typeof pwCreatedRes.count === 'number') {
      plannedCreated = pwCreatedRes.count;
    }
  } catch {
    return {
      ...emptyStats(),
      current_streak_days: dash.streak,
      total_training_time_minutes: activeMinutesLive,
    };
  }

  const plannedCompletedValid = await countPlannedCompletedValid(checkRows);

  const credited = creditCheckInsSorted(checkRows);
  const total_check_ins = credited.length;

  const streakDays = new Set<string>();
  let early_check_ins = 0;
  let late_check_ins = 0;
  const gymIds = new Set<string>();
  for (const r of credited) {
    const startIso = r.started_at || r.created_at;
    if (startIso) {
      const dk = ymdCopenhagen(startIso);
      if (dk) {
        streakDays.add(dk);
      }
      const mins = minutesSinceMidnightCopenhagen(startIso);
      if (mins < 8 * 60) {
        early_check_ins += 1;
      }
      if (mins > 22 * 60) {
        late_check_ins += 1;
      }
    }
    if (r.gym_id) {
      gymIds.add(r.gym_id);
    }
  }

  let total_sessions = 0;
  let total_training_time_minutes = 0;
  let longest_session_minutes = 0;
  let activeMinutesFromDb = 0;

  for (const r of checkRows) {
    if (r.ended_at && r.started_at) {
      const st = new Date(r.started_at).getTime();
      const en = new Date(r.ended_at).getTime();
      const minutes = Math.max(0, Math.floor((en - st) / 60000));
      if (minutes > longest_session_minutes) {
        longest_session_minutes = minutes;
      }
      if (minutes >= MIN_SESSION_MINUTES) {
        total_sessions += 1;
        total_training_time_minutes += minutes;
      }
    } else if (r.is_active && r.started_at) {
      const mins = Math.max(
        0,
        Math.floor((Date.now() - new Date(r.started_at).getTime()) / 60000),
      );
      if (mins > activeMinutesFromDb) {
        activeMinutesFromDb = mins;
      }
    }
  }

  const activeExtra = Math.max(activeMinutesLive, activeMinutesFromDb);
  const uniqueThreads = new Set(threadIds);

  return {
    total_training_time_minutes: total_training_time_minutes + activeExtra,
    total_sessions,
    current_streak_days: Math.max(
      computeCurrentStreakDays(streakDays),
      dash.streak,
    ),
    longest_streak_days: computeLongestStreakDays(streakDays),
    longest_session_minutes,
    total_check_ins,
    friends_trained_with_count: friendsCount,
    unique_gyms_count: gymIds.size,
    total_messages_sent: msgCount,
    unique_dm_recipients: uniqueThreads.size,
    planned_workouts_created: plannedCreated,
    planned_workouts_completed_valid: plannedCompletedValid,
    early_check_ins,
    late_check_ins,
  };
}
