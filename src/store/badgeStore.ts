/**
 * Badges: AsyncStorage + Supabase `user_badges` (kors-enhed, persist).
 * Unlock-animation / notifs kun når nyt unlock (ikke allerede låst).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {create} from 'zustand';
import {BADGE_BY_ID, BADGE_DEFINITIONS} from '@/config/badgeDefinitions';
import {
  evaluateNewUnlocks,
  computeBadgeProgress,
  getBadgeStatValue,
} from '@/services/badgeEngine';
import {
  insertBadgeUnlockedNotification,
  insertStreakMilestoneNotification,
  tryInsertBadgeProgressNotification,
} from '@/services/notifications/inAppNotificationService';
import {fetchUserBadges, upsertUserBadges} from '@/services/supabase/userBadgesService';
import {buildUserBadgeStats} from '@/services/userBadgeStats';
import {useActivityStore} from '@/store/activityStore';
import {useInAppNotificationStore} from '@/store/inAppNotificationStore';
import type {BadgeDefinition} from '@/types/badge.types';
import type {UnlockedBadgeRecord} from '@/types/badge.types';
import type {UserBadgeStats} from '@/types/badge.types';

const STORAGE_KEY = 'gymly_badge_unlocks_v1';

/** userId -> badgeId -> unlockedAt ISO */
type StoredUnlocks = Record<string, Record<string, string>>;

function parseStoredUnlocks(raw: string | null): StoredUnlocks | null {
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') {
    return null;
  }
  try {
    return JSON.parse(trimmed) as StoredUnlocks;
  } catch {
    return null;
  }
}

function mergeUnlockedFromServer(
  local: Record<string, string>,
  server: {badge_id: string; unlocked_at: string | null}[],
): Record<string, string> {
  const out = {...local};
  for (const r of server) {
    if (!r.unlocked_at) {
      continue;
    }
    const ex = out[r.badge_id];
    if (!ex) {
      out[r.badge_id] = r.unlocked_at;
    } else if (new Date(r.unlocked_at) < new Date(ex)) {
      out[r.badge_id] = r.unlocked_at;
    }
  }
  return out;
}

function pickEarlierIso(a: string, b: string): string {
  return new Date(a) <= new Date(b) ? a : b;
}

function unlockMapsEqual(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) {
    return false;
  }
  for (const k of keysA) {
    if (a[k] !== b[k]) {
      return false;
    }
  }
  return true;
}

interface BadgeStoreState {
  unlockedByUser: StoredUnlocks;
  statsByUser: Record<string, UserBadgeStats>;
  hydrated: boolean;
  /** Kø til unlock-modal (én ad gangen) */
  unlockModalQueue: BadgeDefinition[];
  hydrate: () => Promise<void>;
  persist: () => Promise<void>;
  isUnlocked: (userId: string, badgeId: string) => boolean;
  getUnlockedRecords: (userId: string) => UnlockedBadgeRecord[];
  getRecentUnlockedDefinitions: (userId: string, limit: number) => BadgeDefinition[];
  syncBadgesForUser: (userId: string | undefined, displayName: string) => void;
  /**
   * Realtime: merge én række (anden enhed) — opdaterer unlock uden at antage nyt notif.
   */
  applyRemoteUserBadgeRow: (
    userId: string,
    row: {badge_id: string; progress: number; unlocked_at: string | null},
  ) => void;
  dismissUnlockModal: () => void;
  currentUnlockModal: () => BadgeDefinition | null;
}

function sortRecordsByDateDesc(records: UnlockedBadgeRecord[]): UnlockedBadgeRecord[] {
  return [...records].sort(
    (a, b) => new Date(b.unlockedAt).getTime() - new Date(a.unlockedAt).getTime(),
  );
}

export const useBadgeStore = create<BadgeStoreState>((set, get) => ({
  unlockedByUser: {},
  statsByUser: {},
  hydrated: false,
  unlockModalQueue: [],

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = parseStoredUnlocks(raw);
      if (parsed) {
        set({unlockedByUser: parsed, hydrated: true});
      } else {
        set({hydrated: true});
      }
    } catch {
      set({hydrated: true});
    }
  },

  persist: async () => {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(get().unlockedByUser),
      );
    } catch {
      /* ignore */
    }
  },

  isUnlocked: (userId, badgeId) => {
    return Boolean(get().unlockedByUser[userId]?.[badgeId]);
  },

  getUnlockedRecords: userId => {
    const map = get().unlockedByUser[userId];
    if (!map) {
      return [];
    }
    return Object.entries(map).map(([badgeId, unlockedAt]) => ({
      badgeId,
      unlockedAt,
    }));
  },

  getRecentUnlockedDefinitions: (userId, limit) => {
    const records = sortRecordsByDateDesc(get().getUnlockedRecords(userId));
    const out: BadgeDefinition[] = [];
    for (const r of records) {
      const def = BADGE_BY_ID[r.badgeId];
      if (def) {
        out.push(def);
      }
      if (out.length >= limit) {
        break;
      }
    }
    return out;
  },

  applyRemoteUserBadgeRow: (userId, row) => {
    if (!row.unlocked_at) {
      return;
    }
    set(state => {
      const cur = state.unlockedByUser[userId] ?? {};
      const ex = cur[row.badge_id];
      const next = ex
        ? pickEarlierIso(ex, row.unlocked_at as string)
        : (row.unlocked_at as string);
      if (ex && next === ex) {
        return state;
      }
      return {
        unlockedByUser: {
          ...state.unlockedByUser,
          [userId]: {...cur, [row.badge_id]: next},
        },
      };
    });
    get().persist().catch(() => {});
  },

  syncBadgesForUser: (userId, displayName) => {
    if (!userId) {
      return;
    }
    (async () => {
      const uid = userId;
      const stats = await buildUserBadgeStats(uid);
      set(state => ({
        statsByUser: {
          ...state.statsByUser,
          [uid]: stats,
        },
      }));
      let server: Awaited<ReturnType<typeof fetchUserBadges>> = [];
      try {
        server = await fetchUserBadges(uid);
      } catch {
        server = [];
      }

      const prevLocal = get().unlockedByUser[uid] ?? {};
      const afterServer = mergeUnlockedFromServer(prevLocal, server);
      const unlockedSet = new Set(Object.keys(afterServer));
      const newly = evaluateNewUnlocks(stats, unlockedSet);
      if (newly.length > 0) {
        const nextUserMap = {...afterServer};
        newly.forEach((def, i) => {
          const existing = nextUserMap[def.id];
          const t = new Date(Date.now() + i).toISOString();
          nextUserMap[def.id] = existing
            ? pickEarlierIso(existing, t)
            : t;
        });
        set(state => ({
          unlockedByUser: {
            ...state.unlockedByUser,
            [uid]: nextUserMap,
          },
          unlockModalQueue: [...state.unlockModalQueue, ...newly],
        }));
        get().persist().catch(() => {});

        const addBadge = useActivityStore.getState().addBadgeUnlockedActivity;
        for (const def of newly) {
          addBadge({
            userId: uid,
            displayName,
            badgeEmoji: def.emoji,
            badgeName: def.name,
          });
        }
        for (const def of newly) {
          if (def.category === 'streak') {
            insertStreakMilestoneNotification(
              uid,
              def.requirement_value,
              def,
            ).catch(() => {});
          } else {
            insertBadgeUnlockedNotification(uid, def).catch(() => {});
          }
        }
        useInAppNotificationStore.getState().refresh(uid).catch(() => {});
      } else if (!unlockMapsEqual(afterServer, prevLocal)) {
        set(state => ({
          unlockedByUser: {
            ...state.unlockedByUser,
            [uid]: afterServer,
          },
        }));
        get().persist().catch(() => {});
      }

      const finalMap = get().unlockedByUser[uid] ?? {};
      const postStats = await buildUserBadgeStats(uid);
      set(state => ({
        statsByUser: {
          ...state.statsByUser,
          [uid]: postStats,
        },
      }));
      for (const def of BADGE_DEFINITIONS) {
        const unlocked = Boolean(finalMap[def.id]);
        const prog = computeBadgeProgress(def, postStats, unlocked);
        if (
          prog.status === 'almost_unlocked' &&
          prog.percent >= 80 &&
          !unlocked
        ) {
          tryInsertBadgeProgressNotification(
            uid,
            def,
            prog.percent,
          ).catch(() => {});
        }
      }

      const upserts = BADGE_DEFINITIONS.map(def => {
        const st = getBadgeStatValue(def, stats);
        const t = def.requirement_value;
        const progress = Math.min(Math.max(0, st), t);
        const unlockedAt = finalMap[def.id] ?? null;
        return {
          user_id: uid,
          badge_id: def.id,
          progress,
          unlocked_at: unlockedAt,
        };
      });
      try {
        await upsertUserBadges(upserts);
      } catch {
        /* offline / tabel findes ikke */
      }
    })().catch(() => {});
  },

  dismissUnlockModal: () => {
    set(state => ({
      unlockModalQueue: state.unlockModalQueue.slice(1),
    }));
  },

  currentUnlockModal: () => {
    const q = get().unlockModalQueue;
    return q.length > 0 ? q[0] : null;
  },
}));

export function getBadgeProgressList(userId: string) {
  const store = useBadgeStore.getState();
  const stats = store.statsByUser[userId] ?? {
    total_training_time_minutes: 0,
    total_sessions: 0,
    current_streak_days: 0,
    longest_session_minutes: 0,
    friends_trained_with_count: 0,
    unique_gyms_count: 0,
  };
  return BADGE_DEFINITIONS.map(def => {
    const unlocked = store.isUnlocked(userId, def.id);
    return {
      def,
      progress: computeBadgeProgress(def, stats, unlocked),
    };
  });
}

export function countUnlockedBadges(userId: string | undefined): number {
  if (!userId) {
    return 0;
  }
  return useBadgeStore.getState().getUnlockedRecords(userId).length;
}
