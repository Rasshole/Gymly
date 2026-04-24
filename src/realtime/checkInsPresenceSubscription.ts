/**
 * Fælles Supabase Realtime: tjek ind + live træningssessioner (workout_live_sessions)
 * opdaterer kort, “Aktive nu”, m.m.
 */

import {supabase} from '@/services/supabase/supabaseClient';

const listeners = new Set<() => void>();
let channel: ReturnType<typeof supabase.channel> | null = null;

function notify() {
  for (const fn of listeners) {
    try {
      fn();
    } catch (e) {
      console.warn('[checkInsPresenceSubscription]', e);
    }
  }
}

function ensureChannel() {
  if (channel) {
    return;
  }
  channel = supabase
    .channel('check_ins_presence_shared')
    .on(
      'postgres_changes',
      {event: 'INSERT', schema: 'public', table: 'check_ins'},
      () => {
        notify();
      },
    )
    .on(
      'postgres_changes',
      {event: '*', schema: 'public', table: 'workout_live_sessions'},
      () => {
        notify();
      },
    )
    .subscribe();
}

export function subscribeCheckInsPresence(callback: () => void): () => void {
  listeners.add(callback);
  ensureChannel();
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0 && channel) {
      void supabase.removeChannel(channel);
      channel = null;
    }
  };
}
