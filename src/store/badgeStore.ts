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
  isBadgeRequirementMet,
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
import type {BadgeDefinition, UnlockedBadgeRecord, UserBadgeStats} from '@/types/badge.types';
import {isDemoContentMode} from '@/demo/demoContentGate';
import {getDemoBadgeSnapshot} from '@/demo/demoBadgeSeed';

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
  /** Hent `user_badges` fra Supabase ind i lokal unlock-map (fx ven-profil). */
  hydrateUserBadgesFromServer: (userId: string) => Promise<void>;
  dismissUnlockModal: () => void;
  currentUnlockModal: () => BadgeDefinition | null;
}

function sortRecordsByDateDesc(records: UnlockedBadgeRecord[]): UnlockedBadgeRecord[] {
  return [...records].sort(
    (a, b) => new Date(b.unlockedAt).getTime() - new Date(a.unlockedAt).getTime(),
  );
}

function logBadgeEngine(...args: unknown[]) {
  if (__DEV__) {
    console.log('[BadgeEngine]', ...args);
  }
}

/** Én kø pr. bruger så parallel kald ikke dobbelt-unlock eller dobbelt modal-kø. */
const badgeSyncChainByUser = new Map<string, Promise<void>>();

/**
 * Genberegner stats, opdaterer fremskridt i `user_badges`, låser op én gang pr. badge
 * (animation/notif kun for nye unlocks). Kør efter handlinger der kan ændre badge-data.
 */
export async function checkAndUnlockBadges(
  userId: string | undefined,
  displayName?: string,
): Promise<void> {
  if (!userId) {
    return;
  }
  const uid = userId;
  const prev = badgeSyncChainByUser.get(uid) ?? Promise.resolve();
  const job = prev
    .catch(() => {})
    .then(() =>
      runCheckAndUnlockBadgesBody(uid, (displayName ?? '').trim() || 'Bruger'),
    );
  badgeSyncChainByUser.set(uid, job);
  await job.finally(() => {
    if (badgeSyncChainByUser.get(uid) === job) {
      badgeSyncChainByUser.delete(uid);
    }
  });
}

async function runCheckAndUnlockBadgesBody(uid: string, dn: string): Promise<void> {
  if (isDemoContentMode()) {
    const {stats, unlocked} = getDemoBadgeSnapshot();
    useBadgeStore.setState(state => ({
      statsByUser: {
        ...state.statsByUser,
        [uid]: stats,
      },
      unlockedByUser: {
        ...state.unlockedByUser,
        [uid]: unlocked,
      },
    }));
    return;
  }
  try {
    logBadgeEngine('checking badges for user', uid);
    const stats = await buildUserBadgeStats(uid);
    useBadgeStore.setState(state => ({
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

    const prevLocal = useBadgeStore.getState().unlockedByUser[uid] ?? {};
    const afterServer = mergeUnlockedFromServer(prevLocal, server);
    const unlockedSet = new Set(Object.keys(afterServer));

    for (const def of BADGE_DEFINITIONS) {
      if (isBadgeRequirementMet(def, stats) && unlockedSet.has(def.id)) {
        logBadgeEngine('skipped already unlocked badge:', def.name);
      }
    }

    const newly = evaluateNewUnlocks(stats, unlockedSet);

    if (newly.length > 0) {
      const nextUserMap = {...afterServer};
      newly.forEach((def, i) => {
        const existing = nextUserMap[def.id];
        const t = new Date(Date.now() + i).toISOString();
        nextUserMap[def.id] = existing ? pickEarlierIso(existing, t) : t;
        logBadgeEngine('unlocked badge:', def.name);
      });
      useBadgeStore.setState(state => ({
        unlockedByUser: {
          ...state.unlockedByUser,
          [uid]: nextUserMap,
        },
        unlockModalQueue: [...state.unlockModalQueue, ...newly],
      }));
      useBadgeStore.getState().persist().catch(() => {});

      const addBadge = useActivityStore.getState().addBadgeUnlockedActivity;
      for (const def of newly) {
        addBadge({
          userId: uid,
          displayName: dn,
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
      useBadgeStore.setState(state => ({
        unlockedByUser: {
          ...state.unlockedByUser,
          [uid]: afterServer,
        },
      }));
      useBadgeStore.getState().persist().catch(() => {});
    }

    const finalMap = useBadgeStore.getState().unlockedByUser[uid] ?? {};
    const postStats = await buildUserBadgeStats(uid);
    useBadgeStore.setState(state => ({
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
        tryInsertBadgeProgressNotification(uid, def, prog.percent).catch(() => {});
      }
    }

    const upserts = BADGE_DEFINITIONS.map(def => {
      const st = getBadgeStatValue(def, postStats);
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
      logBadgeEngine('progress updated');
    } catch {
      /* offline / tabel findes ikke */
    }
  } catch (e) {
    if (__DEV__) {
      console.warn('[BadgeEngine] check failed', e);
    }
  }
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

  hydrateUserBadgesFromServer: async userId => {
    if (!userId || isDemoContentMode()) {
      return;
    }
    try {
      const server = await fetchUserBadges(userId);
      const merged = mergeUnlockedFromServer(
        useBadgeStore.getState().unlockedByUser[userId] ?? {},
        server,
      );
      const cur = useBadgeStore.getState().unlockedByUser[userId] ?? {};
      if (unlockMapsEqual(cur, merged)) {
        return;
      }
      set(state => ({
        unlockedByUser: {
          ...state.unlockedByUser,
          [userId]: merged,
        },
      }));
    } catch {
      /* offline */
    }
  },

  syncBadgesForUser: (userId, displayName) => {
    void checkAndUnlockBadges(userId, displayName);
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
    longest_streak_days: 0,
    longest_session_minutes: 0,
    total_check_ins: 0,
    friends_trained_with_count: 0,
    unique_gyms_count: 0,
    total_messages_sent: 0,
    unique_dm_recipients: 0,
    planned_workouts_created: 0,
    planned_workouts_completed_valid: 0,
    early_check_ins: 0,
    late_check_ins: 0,
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
