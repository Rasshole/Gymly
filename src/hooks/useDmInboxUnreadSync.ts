/**
 * Sync DM inbox (incl. unread) into chatStore so header/tab badges match Messages.
 * Throttled per user; cleared on logout via clearFocusRefreshThrottle.
 */

import {useCallback, useEffect, useRef} from 'react';
import {AppState, type AppStateStatus} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {useAppStore} from '@/store/appStore';
import {isDemoContentMode} from '@/demo/demoContentGate';
import {syncDmInboxToStore} from '@/services/supabase/dmInboxSync';
import {
  isFocusRefreshStale,
  markFocusRefreshed,
} from '@/utils/focusRefreshThrottle';

const INBOX_TTL_MS = 15_000;

/** One in-flight sync per user. Several header screens mount this hook. */
const inflightByKey = new Map<string, Promise<void>>();

export function dmInboxFocusKey(userId: string): string {
  return `dm:inbox:${userId}`;
}

function syncInboxIfStale(
  userId: string,
  displayName: string | undefined,
  ttlMs: number,
): void {
  if (isDemoContentMode()) {
    return;
  }
  const key = dmInboxFocusKey(userId);
  if (!isFocusRefreshStale(key, ttlMs) || inflightByKey.has(key)) {
    return;
  }
  const name = displayName?.trim() || 'Dig';
  const job = syncDmInboxToStore(userId, name)
    .then(() => {
      markFocusRefreshed(key);
    })
    .catch(() => {
      /* offline / RLS — keep cache; TTL stays stale so the next focus can retry */
    })
    .finally(() => {
      inflightByKey.delete(key);
    });
  inflightByKey.set(key, job);
}

/**
 * Keep DM unread badges fresh on screens that show MessagesHeaderButton
 * (Home, Friends, Check-in, Profile, Shop) without requiring a visit to Messages.
 * Also refreshes when the app returns to foreground (login/reopen).
 * Does not mark messages as read — only ChatScreen does that.
 */
export function useDmInboxUnreadSync(options?: {ttlMs?: number}): void {
  const userId = useAppStore(s => s.user?.id);
  const displayName = useAppStore(s => s.user?.displayName);
  const ttlMs = options?.ttlMs ?? INBOX_TTL_MS;
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useFocusEffect(
    useCallback(() => {
      if (!userId) {
        return;
      }
      syncInboxIfStale(userId, displayName, ttlMs);
    }, [userId, displayName, ttlMs]),
  );

  useEffect(() => {
    if (!userId) {
      return;
    }
    const onChange = (next: AppStateStatus) => {
      const wasBg =
        appStateRef.current === 'background' ||
        appStateRef.current === 'inactive';
      appStateRef.current = next;
      if (wasBg && next === 'active') {
        syncInboxIfStale(userId, displayName, ttlMs);
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [userId, displayName, ttlMs]);
}
