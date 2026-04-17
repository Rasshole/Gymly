/**
 * Dashboard Stats Store – streak (consecutive days), weekly stats
 * Streak logic lives in @/utils/streakUtils (updateStreak).
 */

import {create} from 'zustand';
import type {StreakState} from '@/utils/streakUtils';
import * as streak from '@/utils/streakUtils';

interface DashboardStatsState {
  /** Current consecutive training days */
  streak: number;
  longestStreak: number;
  lastCheckInDateKey: string | null;
  weeklyCheckins: number;
  weeklyMinutes: number;
  lastCheckInAt: Date | null;
  setStats: (stats: {
    streak: number;
    longestStreak: number;
    lastCheckInDateKey: string | null;
    weeklyCheckins: number;
    weeklyMinutes: number;
    lastCheckInAt?: Date | null;
  }) => void;
  onCheckIn: (options?: {minutes?: number}) => void;
}

function toStreakState(s: DashboardStatsState): StreakState {
  return {
    currentStreak: s.streak,
    longestStreak: s.longestStreak,
    lastCheckInDateKey: s.lastCheckInDateKey,
  };
}

function fromStreakState(base: DashboardStatsState, next: StreakState): Partial<DashboardStatsState> {
  return {
    streak: next.currentStreak,
    longestStreak: next.longestStreak,
    lastCheckInDateKey: next.lastCheckInDateKey,
  };
}

export const useDashboardStatsStore = create<DashboardStatsState>(set => ({
  streak: 0,
  longestStreak: 0,
  lastCheckInDateKey: null,
  weeklyCheckins: 0,
  weeklyMinutes: 0,
  lastCheckInAt: null,

  setStats: stats =>
    set({
      streak: stats.streak,
      longestStreak: stats.longestStreak,
      lastCheckInDateKey: stats.lastCheckInDateKey ?? null,
      weeklyCheckins: stats.weeklyCheckins,
      weeklyMinutes: stats.weeklyMinutes,
      ...(stats.lastCheckInAt !== undefined && {lastCheckInAt: stats.lastCheckInAt ?? null}),
    }),

  onCheckIn: options =>
    set(state => {
      const streakNext = streak.updateStreak(toStreakState(state), new Date());
      return {
        ...fromStreakState(state, streakNext),
        weeklyCheckins: state.weeklyCheckins + 1,
        weeklyMinutes: state.weeklyMinutes + (options?.minutes ?? 0),
        lastCheckInAt: new Date(),
      };
    }),
}));
