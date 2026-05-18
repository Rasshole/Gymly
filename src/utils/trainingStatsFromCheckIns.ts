/**
 * Udled streak og træningsdage udelukkende fra færdige check_ins (ended_at, lokalt dato).
 */

import {daysBetweenLocalDateKeys, getLocalDateString} from '@/utils/streakUtils';

export type CheckInLikeForStats = {
  started_at: string | null;
  ended_at: string | null;
  is_active: boolean | null;
};

/** Færdig session: `ended_at` er sandheden (status = completed). */
export function isCompletedCheckInRow(r: CheckInLikeForStats): boolean {
  return Boolean(r.started_at && r.ended_at);
}

export function sessionDurationMinutes(
  startedAt: Date,
  endedAt: Date,
): number {
  return Math.max(
    1,
    Math.round((endedAt.getTime() - startedAt.getTime()) / 60000),
  );
}

/** Samme loft som `updateUserStatsAfterSession` (anti-cheat). */
export function boundedSessionMinutes(startedAt: Date, endedAt: Date): number {
  const raw = Math.max(
    0,
    Math.round((endedAt.getTime() - startedAt.getTime()) / 60000),
  );
  return Math.min(240, raw);
}

/** Lokale kalenderdage (YYYY-MM-DD) hvor brugeren har mindst én færdig session (efter ended_at). */
export function collectTrainingDayKeys(rows: CheckInLikeForStats[]): Set<string> {
  const keys = new Set<string>();
  for (const r of rows) {
    if (!isCompletedCheckInRow(r)) {
      continue;
    }
    keys.add(getLocalDateString(new Date(r.ended_at as string)));
  }
  return keys;
}

function parseLocalKeyToMidnight(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/**
 * Aktuel streak: sammenhængende træningsdage der slutter i dag, ellers i går hvis der ikke er trænet i dag endnu.
 * 0 hvis der hverken er session i dag eller i går.
 */
export function computeCurrentStreakFromTrainingDays(
  dayKeys: Set<string>,
  now = new Date(),
): number {
  if (dayKeys.size === 0) {
    return 0;
  }
  const todayKey = getLocalDateString(now);
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterdayKey = getLocalDateString(y);

  let anchorKey: string;
  if (dayKeys.has(todayKey)) {
    anchorKey = todayKey;
  } else if (dayKeys.has(yesterdayKey)) {
    anchorKey = yesterdayKey;
  } else {
    return 0;
  }

  let streak = 0;
  let cur = parseLocalKeyToMidnight(anchorKey);
  while (true) {
    const k = getLocalDateString(cur);
    if (!dayKeys.has(k)) {
      break;
    }
    streak++;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}

/** Længste sammenhængende streak i historikken (antal dage). */
export function computeLongestStreakFromTrainingDays(dayKeys: Set<string>): number {
  if (dayKeys.size === 0) {
    return 0;
  }
  const sorted = [...dayKeys].sort((a, b) => a.localeCompare(b));
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (daysBetweenLocalDateKeys(prev, cur) === 1) {
      run++;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }
  return best;
}

/** Bagudkompatibelt navn til hooks/data — streak fra afsluttede rækker. */
export function calculateCurrentStreak(
  rows: CheckInLikeForStats[],
  now = new Date(),
): number {
  return computeCurrentStreakFromTrainingDays(collectTrainingDayKeys(rows), now);
}
