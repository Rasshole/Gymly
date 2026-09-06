import type {ProfileCompletedSession} from '@/services/supabase/profileCheckInHistory';

/** Ugentligt mål i copy — ændrer ikke streak-beregningen. */
export const WEEKLY_STREAK_CHECKINS_TARGET = 3;

export type StreakStatusKind = 'none' | 'building' | 'active';

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

export function countWeeklyCheckIns(
  sessions: ProfileCompletedSession[],
  now: Date = new Date(),
): number {
  const start = getStartOfWeek(new Date(now));
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return sessions.filter(s => s.endedAt >= start && s.endedAt <= end).length;
}

export function getStreakStatusKind(
  currentStreak: number,
  weekCheckIns: number,
): StreakStatusKind {
  if (currentStreak > 0) {
    return 'active';
  }
  if (weekCheckIns > 0 && weekCheckIns < WEEKLY_STREAK_CHECKINS_TARGET) {
    return 'building';
  }
  return 'none';
}

type StreakCopyInput = {
  currentStreak: number;
  weekCheckIns: number;
  t: (key: string, params?: Record<string, string>) => string;
};

export function getStreakStatusMessage({
  currentStreak,
  weekCheckIns,
  t,
}: StreakCopyInput): string {
  const kind = getStreakStatusKind(currentStreak, weekCheckIns);
  if (kind === 'active') {
    return t('streak.statusActive', {count: String(currentStreak)});
  }
  if (kind === 'building') {
    const remaining = WEEKLY_STREAK_CHECKINS_TARGET - weekCheckIns;
    return remaining === 1
      ? t('streak.statusBuildingOne')
      : t('streak.statusBuildingMany', {count: String(remaining)});
  }
  return t('streak.statusStart');
}
