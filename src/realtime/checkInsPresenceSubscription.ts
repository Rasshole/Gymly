/**
 * Fælles Supabase Realtime: tjek ind (INSERT/UPDATE/DELETE), aggregeret tælling pr. center
 * (gym_active_checkin_rollup — alle brugere ser ændringer), + live session heartbeat.
 * Bruges af kort, “Aktive nu”, m.m. — uden manuel refresh.
 */

import {supabase} from '@/services/supabase/supabaseClient';
import {logRealtimeEvent, logRealtimeSubscribed, logRealtimeCleanup} from '@/realtime/realtimeDebug';

const listeners = new Set<() => void>();
let channel: ReturnType<typeof supabase.channel> | null = null;
const PRESENCE_CHANNEL = 'map_presence_realtime';

function notify() {
  for (const fn of listeners) {
    try {
      fn();
    } catch (e) {
      console.warn('[checkInsPresenceSubscription]', e);
    }
  }
}

/** Efter auto-checkout el.l. — tving alle abonnenter til refetch uden at vente på næste realtime-event. */
export function notifyCheckInsPresenceSubscribers(): void {
  if (__DEV__) {
    console.log('[ActiveSessions] notifyCheckInsPresenceSubscribers (imperativ refresh)');
  }
  notify();
}

function logPresenceEvent(
  table: string,
  payload: {eventType?: string; new?: unknown; old?: unknown},
) {
  const id =
    (payload.new as {id?: string} | undefined)?.id ??
    (payload.old as {id?: string} | undefined)?.id;
  const ev = (payload as {eventType?: string}).eventType ?? '?';
  logRealtimeEvent(PRESENCE_CHANNEL, table, ev, id != null ? `id=${id}` : undefined);
}

function ensureChannel() {
  if (channel) {
    return;
  }
  channel = supabase
    .channel(PRESENCE_CHANNEL)
    .on(
      'postgres_changes',
      {event: '*', schema: 'public', table: 'check_ins'},
      payload => {
        logPresenceEvent('check_ins', payload);
        notify();
      },
    )
    .on(
      'postgres_changes',
      {event: '*', schema: 'public', table: 'gym_active_checkin_rollup'},
      payload => {
        logPresenceEvent('gym_active_checkin_rollup', payload);
        notify();
      },
    )
    .on(
      'postgres_changes',
      {event: '*', schema: 'public', table: 'workout_live_sessions'},
      () => {
        logRealtimeEvent(PRESENCE_CHANNEL, 'workout_live_sessions', '*', undefined);
        notify();
      },
    )
    .subscribe(status => {
      if (status === 'SUBSCRIBED') {
        logRealtimeSubscribed(PRESENCE_CHANNEL, 'check_ins+rollup+live_sessions');
      }
    });
}

export function subscribeCheckInsPresence(callback: () => void): () => void {
  listeners.add(callback);
  ensureChannel();
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0 && channel) {
      logRealtimeCleanup(PRESENCE_CHANNEL);
      supabase.removeChannel(channel);
      channel = null;
    }
  };
}
