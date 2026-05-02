/**
 * Dev-only logging for Supabase Realtime (audit + debugging).
 */

const PREFIX = '[Realtime]';

export function logRealtimeSubscribed(channel: string, detail?: string): void {
  if (!__DEV__) {
    return;
  }
  console.log(PREFIX, 'subscribed to channel', channel, detail ?? '');
}

export function logRealtimeEvent(
  channel: string,
  table: string,
  event: string,
  extra?: string,
): void {
  if (!__DEV__) {
    return;
  }
  console.log(PREFIX, 'received event', {channel, table, event, extra});
}

export function logRealtimeStore(table: string, action: string): void {
  if (!__DEV__) {
    return;
  }
  console.log(PREFIX, 'updated store/state', {table, action});
}

export function logRealtimeCleanup(channel: string): void {
  if (!__DEV__) {
    return;
  }
  console.log(PREFIX, 'cleaned up subscription', channel);
}

export function logRealtimeStatus(channel: string, status: string, err?: string): void {
  if (!__DEV__) {
    return;
  }
  console.log(PREFIX, 'channel status', {channel, status, err: err ?? null});
}
