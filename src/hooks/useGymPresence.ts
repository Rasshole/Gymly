/**
 * Aktive gyms "lige nu".
 * Produktion bruger Supabase; realtime presence er ikke tilkoblet endnu — tom liste, ingen Firebase.
 */

import type {GymPresence} from '@/types/gymPresence.types';

const EMPTY_GYMS: GymPresence[] = [];

export function useGymPresence() {
  return {
    gyms: EMPTY_GYMS,
    loading: false,
    error: null as Error | null,
  };
}
