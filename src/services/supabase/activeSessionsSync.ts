/**
 * Single definition of “aktiv session” for counts + lister + realtime refresh.
 * DB: is_active, ended_at (ingen checked_out_at-kolonne — ended_at er checkout).
 */

/** Kun til visning på kort/lister — afslutter aldrig session i DB. */
export const ACTIVE_SESSION_MAX_DURATION_MS = 6 * 60 * 60 * 1000;
export const ACTIVE_SESSION_STALE_HEARTBEAT_MS = 30 * 60 * 1000;

/** Vis recovery-dialog — auto-afslut aldrig uden brugerhandling. */
export const ACTIVE_SESSION_RECOVERY_PROMPT_MS = 12 * 60 * 60 * 1000;

export type ActiveCheckInSyncRow = {
  id?: string;
  user_id: string;
  gym_id?: string;
  gym_name: string;
  workout_type: string | null;
  started_at: string;
  last_seen_at?: string | null;
  user_display_name?: string | null;
  is_active?: boolean;
  ended_at?: string | null;
};

export function isHeartbeatStale(row: ActiveCheckInSyncRow, nowMs: number): boolean {
  const startedMs = new Date(row.started_at).getTime();
  if (!Number.isFinite(startedMs)) {
    return true;
  }
  if (nowMs - startedMs > ACTIVE_SESSION_MAX_DURATION_MS) {
    return true;
  }
  const hb = new Date(row.last_seen_at ?? row.started_at).getTime();
  if (!Number.isFinite(hb)) {
    return true;
  }
  return nowMs - hb > ACTIVE_SESSION_STALE_HEARTBEAT_MS;
}

/** Bruger er aktiv kun hvis DB siger aktiv + ikke afsluttet + ikke forældet. */
export function isEffectiveActiveCheckIn(
  row: ActiveCheckInSyncRow,
  nowMs: number = Date.now(),
): boolean {
  if (row.is_active !== true) {
    return false;
  }
  if (row.ended_at != null && String(row.ended_at).length > 0) {
    return false;
  }
  return !isHeartbeatStale(row, nowMs);
}

export function dedupeCheckInRowsByUserId<T extends ActiveCheckInSyncRow>(rows: T[]): T[] {
  const byUser = new Map<string, T>();
  for (const r of rows) {
    const uid = r.user_id ? String(r.user_id) : '';
    if (!uid) {
      continue;
    }
    const prev = byUser.get(uid);
    if (!prev) {
      byUser.set(uid, r);
      continue;
    }
    const prevT = new Date(prev.started_at).getTime();
    const nextT = new Date(r.started_at).getTime();
    byUser.set(uid, nextT >= prevT ? r : prev);
  }
  return [...byUser.values()];
}

/**
 * Tidligere DB-cleanup af aktive check-ins — deaktiveret.
 * Aktive sessioner må kun afsluttes manuelt eller via bekræftet geofence auto-checkout.
 */
export async function runStaleActiveSessionCleanup(): Promise<number> {
  return 0;
}
