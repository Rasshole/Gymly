import type {ProfileCompletedSession} from '@/services/supabase/profileCheckInHistory';
import {
  buildWeeklyFriendLeaderboard,
  computePersonalWeeklySummary,
  filterSessionsInRange,
  formatWeeklyRankLabel,
  getWeeklySummaryRange,
} from '@/utils/weeklySummary';

function mkSession(id: string, endedAt: Date, minutes: number): ProfileCompletedSession {
  const startedAt = new Date(endedAt.getTime() - minutes * 60_000);
  return {
    id,
    gymName: 'Test Gym',
    startedAt,
    endedAt,
    durationMinutes: minutes,
    workoutType: 'ben',
    partnerDisplayName: null,
  };
}

describe('weeklySummary', () => {
  const now = new Date('2026-06-24T10:00:00'); // Tuesday

  it('uses a 7-day window ending yesterday', () => {
    const {start, end} = getWeeklySummaryRange(now);
    expect(end.getDate()).toBe(23);
    expect(start.getDate()).toBe(17);
    expect(end.getTime() - start.getTime()).toBeLessThan(7 * 24 * 3600_000 + 1000);
  });

  it('computes personal stats and best day', () => {
    const range = getWeeklySummaryRange(now);
    const sessions = [
      mkSession('a', new Date('2026-06-17T18:00:00'), 50),
      mkSession('b', new Date('2026-06-17T20:00:00'), 40),
      mkSession('c', new Date('2026-06-19T18:00:00'), 60),
      mkSession('d', new Date('2026-06-01T18:00:00'), 30),
    ];
    const summary = computePersonalWeeklySummary(sessions, range, 4);
    const inRange = filterSessionsInRange(sessions, range.start, range.end);

    expect(inRange).toHaveLength(3);
    expect(summary.checkInCount).toBe(3);
    expect(summary.totalMinutes).toBe(150);
    expect(summary.currentStreak).toBe(4);
    expect(summary.bestDayLabel).toBe('Onsdag');
  });

  it('ranks friends and formats medals', () => {
    const ranked = buildWeeklyFriendLeaderboard([
      {userId: '1', name: 'Anna', checkInCount: 3},
      {userId: '2', name: 'Bo', checkInCount: 5},
      {userId: '3', name: 'Cecilie', checkInCount: 1},
      {userId: '4', name: 'Dan', checkInCount: 5},
    ]);
    expect(ranked[0]?.name).toBe('Bo');
    expect(ranked[0]?.rank).toBe(1);
    expect(formatWeeklyRankLabel(1)).toBe('🥇');
    expect(formatWeeklyRankLabel(4)).toBe('4.');
  });
});
