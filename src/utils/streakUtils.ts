/**
 * Workout streak – consecutive training days (local timezone), milestones & UI helpers.
 */

export type StreakState = {
  currentStreak: number;
  longestStreak: number;
  /** YYYY-MM-DD for last streak-eligible check-in */
  lastCheckInDateKey: string | null;
};

const MILESTONE_DAYS = [3, 7, 14, 30, 100] as const;

/** Local calendar day YYYY-MM-DD */
export function getLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseLocalDateString(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Signed day difference (a → b) */
export function daysBetweenLocalDateKeys(a: string, b: string): number {
  const da = parseLocalDateString(a);
  const db = parseLocalDateString(b);
  da.setHours(0, 0, 0, 0);
  db.setHours(0, 0, 0, 0);
  return Math.round((db.getTime() - da.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * After a new check-in at `at` (local time). Idempotent same calendar day.
 */
export function updateStreak(prev: StreakState, at: Date = new Date()): StreakState {
  const todayKey = getLocalDateString(at);
  if (prev.lastCheckInDateKey === todayKey) {
    return prev;
  }

  let newStreak: number;
  if (!prev.lastCheckInDateKey) {
    newStreak = 1;
  } else {
    const diff = daysBetweenLocalDateKeys(prev.lastCheckInDateKey, todayKey);
    if (diff === 1) {
      newStreak = prev.currentStreak + 1;
    } else {
      newStreak = 1;
    }
  }

  const longestStreak = Math.max(newStreak, prev.longestStreak);

  return {
    currentStreak: newStreak,
    longestStreak,
    lastCheckInDateKey: todayKey,
  };
}

/** Shared streak badge mapping (single source across app UI) */
export function getStreakBadge(streak: number): string {
  if (streak >= 100) return '💎';
  if (streak >= 30) return '👑';
  if (streak >= 14) return '🌋';
  if (streak >= 7) return '⚡';
  if (streak >= 3) return '🔥';
  return '';
}

/** Backwards-compatible alias used by existing components */
export function getStreakIcon(streak: number): string {
  return getStreakBadge(streak);
}

export function formatStreakLabel(
  streak: number,
  locale: 'da' | 'en' = 'da',
): string {
  const safe = Math.max(0, Math.floor(streak));
  if (locale === 'en') {
    return safe === 1 ? 'Streak: 1 day' : `Streak: ${safe} days`;
  }
  return safe === 1 ? 'Streak: 1 dag' : `Streak: ${safe} dage`;
}

export type NextMilestone = {
  nextDay: number;
  emoji: string;
  daysRemaining: number;
};

export function getNextMilestone(streak: number): NextMilestone | null {
  const next = MILESTONE_DAYS.find(m => m > streak);
  if (next == null) return null;
  return {
    nextDay: next,
    emoji: getStreakIcon(next),
    daysRemaining: next - streak,
  };
}

/** 0 = none, 1 = mild (>=7), 2 = strong (>=30) */
export function getStreakEmphasisLevel(streak: number): 0 | 1 | 2 {
  if (streak >= 30) return 2;
  if (streak >= 7) return 1;
  return 0;
}

export type StreakReminderUser = {
  currentStreak: number;
  lastCheckInDateKey: string | null;
};

export function shouldSendStreakReminder(user: StreakReminderUser): boolean {
  if (user.currentStreak < 3) return false;
  const today = getLocalDateString(new Date());
  if (!user.lastCheckInDateKey) return true;
  return user.lastCheckInDateKey !== today;
}

/**
 * Derive streak metrics from check-in history (for init / profile sync).
 */
export function deriveStreakMetricsFromCheckIns(
  checkIns: {checkInTime: Date}[],
): StreakState {
  if (checkIns.length === 0) {
    return {currentStreak: 0, longestStreak: 0, lastCheckInDateKey: null};
  }

  const daySet = new Set<string>();
  checkIns.forEach(c => {
    daySet.add(getLocalDateString(new Date(c.checkInTime)));
  });

  let d = new Date();
  d.setHours(0, 0, 0, 0);
  let currentStreak = 0;
  while (daySet.has(getLocalDateString(d))) {
    currentStreak++;
    d.setDate(d.getDate() - 1);
  }

  const uniqueDays = [...daySet].sort((a, b) => a.localeCompare(b));
  let longestStreak = 0;
  let run = 0;
  let prevKey: string | null = null;
  for (const k of uniqueDays) {
    if (prevKey === null) {
      run = 1;
    } else {
      run = daysBetweenLocalDateKeys(prevKey, k) === 1 ? run + 1 : 1;
    }
    longestStreak = Math.max(longestStreak, run);
    prevKey = k;
  }

  const sortedDesc = [...uniqueDays].sort((a, b) => b.localeCompare(a));
  const lastCheckInDateKey = sortedDesc[0] ?? null;

  return {
    currentStreak,
    longestStreak,
    lastCheckInDateKey,
  };
}
