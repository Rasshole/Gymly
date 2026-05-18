/**
 * Trænings-tal til Hjem/Profil i demo-tilstand.
 */

import type {ProfileCompletedSession} from '@/services/supabase/profileCheckInHistory';

const h = 3600_000;
const m = 60_000;

export function getDemoRecentSessions(): ProfileCompletedSession[] {
  const now = Date.now();
  const mk = (
    id: string,
    gymName: string,
    startOffH: number,
    durMin: number,
    workoutType: string,
    partner: string | null,
  ): ProfileCompletedSession => {
    const startedAt = new Date(now - startOffH * h);
    const endedAt = new Date(startedAt.getTime() + durMin * m);
    return {
      id,
      gymName,
      startedAt,
      endedAt,
      durationMinutes: durMin,
      workoutType,
      partnerDisplayName: partner,
    };
  };
  return [
    mk('ds1', 'SATS Nordhavn', 18, 58, 'bryst', 'Emil Hansen'),
    mk('ds2', 'PureGym Valby', 42, 72, 'ben', 'Sofie Larsen'),
    mk('ds3', 'LOOP Fitness Østerbro', 66, 44, 'cardio', null),
    mk('ds4', 'SATS Fisketorvet', 90, 61, 'ryg', 'Tobias Jensen'),
    mk('ds5', 'FitnessX Nørrebro', 115, 38, 'skulder', null),
    mk('ds6', 'SATS Frederiksberg', 140, 55, 'bryst', 'Clara Madsen'),
    mk('ds7', 'PureGym Vanløse', 190, 48, 'ben', null),
  ];
}

export function getDemoTrainingStatsNumbers(friendsCount: number) {
  return {
    totalCheckIns: 26,
    totalTrainingMinutes: 1080,
    currentStreakDays: 7,
    longestStreakDays: 12,
    unlockedBadgesCount: 11,
    friendsCount,
    groupsCount: 2,
    activeSessionMinutes: 0,
  };
}
