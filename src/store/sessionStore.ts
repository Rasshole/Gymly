/**
 * Session Store
 * Manages active workout session state across app (persists when switching tabs)
 */

import {create} from 'zustand';

export interface ActiveSession {
  gymId: number;
  gymName: string;
  startTime: Date;
  workoutType: string;
}

interface SessionState {
  activeSession: ActiveSession | null;
  startSession: (session: Omit<ActiveSession, 'startTime'>) => void;
  endSession: () => void;
  getElapsedSeconds: () => number;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  activeSession: null,

  startSession: (session) => {
    set({
      activeSession: {
        ...session,
        startTime: new Date(),
      },
    });
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
