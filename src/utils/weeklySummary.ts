import type {ProfileCompletedSession} from '@/services/supabase/profileCheckInHistory';
import {sessionDurationMinutes} from '@/utils/trainingStatsFromCheckIns';
import {getIntlLocale, getRuntimeLanguage} from '@/i18n';

const DA_WEEKDAYS = [
  'søndag',
  'mandag',
  'tirsdag',
  'onsdag',
  'torsdag',
  'fredag',
  'lørdag',
] as const;

/** 7-dages vindue der slutter i går (passer til mandags-opsummering). */
export function getWeeklySummaryRange(now: Date = new Date()): {start: Date; end: Date} {
  const end = new Date(now);
  end.setDate(end.getDate() - 1);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  return {start, end};
}

export function filterSessionsInRange(
  sessions: ProfileCompletedSession[],
  start: Date,
  end: Date,
): ProfileCompletedSession[] {
  return sessions.filter(s => s.endedAt >= start && s.endedAt <= end);
}

export type PersonalWeeklySummary = {
  checkInCount: number;
  totalMinutes: number;
  currentStreak: number;
  bestDayLabel: string | null;
};

export function computePersonalWeeklySummary(
  sessions: ProfileCompletedSession[],
  range: {start: Date; end: Date},
  currentStreak: number,
): PersonalWeeklySummary {
  const inRange = filterSessionsInRange(sessions, range.start, range.end);
  const totalMinutes = inRange.reduce((sum, s) => sum + s.durationMinutes, 0);

  const countsByDay = new Map<string, {count: number; label: string}>();
  for (const s of inRange) {
    const d = s.endedAt;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const label = capitalizeDa(DA_WEEKDAYS[d.getDay()] ?? 'ukendt');
    const prev = countsByDay.get(key);
    countsByDay.set(key, {count: (prev?.count ?? 0) + 1, label});
  }

  let bestDayLabel: string | null = null;
  let bestCount = 0;
  for (const {count, label} of countsByDay.values()) {
    if (count > bestCount) {
      bestCount = count;
      bestDayLabel = label;
    }
  }

  return {
    checkInCount: inRange.length,
    totalMinutes,
    currentStreak,
    bestDayLabel,
  };
}

export type WeeklyFriendLeaderboardEntry = {
  userId: string;
  name: string;
  checkInCount: number;
  rank: number;
};

export function buildWeeklyFriendLeaderboard(
  entries: Array<{userId: string; name: string; checkInCount: number}>,
  limit = 5,
): WeeklyFriendLeaderboardEntry[] {
  return [...entries]
    .filter(e => e.checkInCount > 0)
    .sort(
      (a, b) =>
        b.checkInCount - a.checkInCount ||
        a.name.localeCompare(b.name, getIntlLocale(getRuntimeLanguage())),
    )
    .slice(0, limit)
    .map((e, i) => ({...e, rank: i + 1}));
}

export function formatWeeklyRankLabel(rank: number): string {
  if (rank === 1) {
    return '🥇';
  }
  if (rank === 2) {
    return '🥈';
  }
  if (rank === 3) {
    return '🥉';
  }
  return `${rank}.`;
}

function capitalizeDa(s: string): string {
  if (!s) {
    return s;
  }
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Demo-tal når demo-tilstand er aktiv. */
export function buildDemoWeeklyFriendLeaderboard(
  userId: string,
  userName: string,
  friends: Array<{id: string; name: string}>,
): WeeklyFriendLeaderboardEntry[] {
  const seeds = [5, 4, 4, 3, 3, 2, 2, 1];
  const pool = [
    {userId, name: userName, checkInCount: 6},
    ...friends.map((f, i) => ({
      userId: f.id,
      name: f.name,
      checkInCount: seeds[i % seeds.length] ?? 1,
    })),
  ];
  return buildWeeklyFriendLeaderboard(pool);
}

export function sumSessionMinutes(sessions: ProfileCompletedSession[]): number {
  return sessions.reduce(
    (sum, s) => sum + (s.durationMinutes || sessionDurationMinutes(s.startedAt, s.endedAt)),
    0,
  );
}
