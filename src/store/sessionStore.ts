/**
 * Session Store
 * Styring af aktiv træning i UI. Sandhed: Supabase public.check_ins (når !firebase).
 * startTime skal sættes fra started_at, ikke Date.now (_timer fortsætter efter genstart).
 */

import {create} from 'zustand';
import type {SupabaseCheckInRow} from '@/types/checkIn.types';

export interface ActiveSession {
  /** Sættes kun når tjek-ind er i Supabase (database-checkout); null for Firestore-only */
  checkInId: string | null;
  gymId: string;
  gymName: string;
  city?: string | null;
  startTime: Date;
  workoutType: string;
}

export function activeSessionFromSupabaseRow(
  row: SupabaseCheckInRow,
): ActiveSession {
  if (!row.started_at) {
    throw new Error('Aktivt tjek-ind mangler started_at');
  }
  return {
    checkInId: row.id,
    gymId: String(row.gym_id),
    gymName: row.gym_name,
    city: row.city,
    startTime: new Date(row.started_at),
    workoutType: row.workout_type ?? '',
  };
}

interface SessionState {
  activeSession: ActiveSession | null;
  startSession: (session: ActiveSession) => void;
  endSession: () => void;
  getElapsedSeconds: () => number;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  activeSession: null,

  startSession: (session) => {
    set({activeSession: session});
  },

  endSession: () => {
    set({activeSession: null});
  },

  getElapsedSeconds: () => {
    const {activeSession} = get();
    if (!activeSession) return 0;
    return Math.floor((Date.now() - activeSession.startTime.getTime()) / 1000);
  },
}));
