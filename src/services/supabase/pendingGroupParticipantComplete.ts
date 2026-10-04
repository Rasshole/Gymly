import AsyncStorage from '@react-native-async-storage/async-storage';
import {completeGymlyGroupParticipant} from '@/services/supabase/gymlyGroupSessionService';

const STORAGE_KEY = 'gymly.pendingGroupParticipantCompletes';

let flushChain: Promise<void> = Promise.resolve();

async function readIds(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
}

async function writeIds(ids: string[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set(ids)]));
}

/**
 * Persist check-in ids whose group participant still needs gymly_complete_group_participant.
 * The RPC is not awaited here, so a new check-in is not blocked. Retries are idempotent:
 * the SQL function no-ops once left_at is set.
 */
export async function enqueueGroupParticipantCompletes(
  checkInIds: string[],
): Promise<void> {
  const incoming = checkInIds.filter(id => typeof id === 'string' && id.length > 0);
  if (incoming.length === 0) {
    return;
  }
  const merged = [...new Set([...(await readIds()), ...incoming])];
  await writeIds(merged);
  if (__DEV__) {
    console.log('[groupSession] queued participant complete', merged.length);
  }
  void flushPendingGroupParticipantCompletes();
}

async function flushOnce(): Promise<void> {
  const ids = await readIds();
  if (ids.length === 0) {
    return;
  }
  const failed: string[] = [];
  for (const id of ids) {
    try {
      await completeGymlyGroupParticipant(id);
    } catch (err) {
      failed.push(id);
      if (__DEV__) {
        console.warn('[groupSession] complete will retry', err);
      }
    }
  }
  const latest = await readIds();
  const addedDuringFlush = latest.filter(id => !ids.includes(id));
  await writeIds([...failed, ...addedDuringFlush]);
}

/** Retry persisted group completions. Safe to call on launch and when the app becomes active. */
export function flushPendingGroupParticipantCompletes(): Promise<void> {
  flushChain = flushChain.then(flushOnce, flushOnce);
  return flushChain;
}
