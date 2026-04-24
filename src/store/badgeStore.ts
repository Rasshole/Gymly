/**
 * Badge unlocks — lokalt persist (AsyncStorage). Senere: sync til Firestore user_badges.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {create} from 'zustand';
import {BADGE_BY_ID, BADGE_DEFINITIONS} from '@/config/badgeDefinitions';
import {
  evaluateNewUnlocks,
  computeBadgeProgress,
} from '@/services/badgeEngine';
import {
  insertBadgeUnlockedNotification,
  insertStreakMilestoneNotification,
  tryInsertBadgeProgressNotification,
} from '@/services/notifications/inAppNotificationService';
import {buildUserBadgeStats} from '@/services/userBadgeStats';
import {useActivityStore} from '@/store/activityStore';
import type {BadgeDefinition} from '@/types/badge.types';
import type {UnlockedBadgeRecord} from '@/types/badge.types';

const STORAGE_KEY = 'gymly_badge_unlocks_v1';

/** userId -> badgeId -> unlockedAt ISO */
type StoredUnlocks = Record<string, Record<string, string>>;

interface BadgeStoreState {
  unlockedByUser: StoredUnlocks;
  hydrated: boolean;
  /** Kø til unlock-modal (én ad gangen) */
  unlockModalQueue: BadgeDefinition[];
  hydrate: () => Promise<void>;
  persist: () => Promise<void>;
  isUnlocked: (userId: string, badgeId: string) => boolean;
  getUnlockedRecords: (userId: string) => UnlockedBadgeRecord[];
  /** Seneste først — til profil-strip */
  getRecentUnlockedDefinitions: (userId: string, limit: number) => BadgeDefinition[];
  syncBadgesForUser: (userId: string | undefined, displayName: string) => void;
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
  hydrated: false,
  unlockModalQueue: [],

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredUnlocks;
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

  syncBadgesForUser: (userId, displayName) => {
    if (!userId) {
      return;
    }
    const stats = buildUserBadgeStats(userId);
    const prev = get().unlockedByUser[userId] ?? {};
    const unlockedSet = new Set(Object.keys(prev));
    const newly = evaluateNewUnlocks(stats, unlockedSet);
    if (newly.length > 0) {
      const nextUserMap = {...prev};
      newly.forEach((def, i) => {
        nextUserMap[def.id] = new Date(Date.now() + i).toISOString();
      });
      set(state => ({
        unlockedByUser: {
          ...state.unlockedByUser,
          [userId]: nextUserMap,
        },
        unlockModalQueue: [...state.unlockModalQueue, ...newly],
      }));
      void get().persist();

      const addBadge = useActivityStore.getState().addBadgeUnlockedActivity;
      for (const def of newly) {
        addBadge({
          userId,
          displayName,
          badgeEmoji: def.emoji,
          badgeName: def.name,
        });
      }
      const postStats = buildUserBadgeStats(userId);
      for (const def of newly) {
        if (def.category === 'streak') {
          void insertStreakMilestoneNotification(
            userId,
            def.requirement_value,
            def,
          ).catch(() => {});
        } else {
          void insertBadgeUnlockedNotification(userId, def).catch(() => {});
        }
      }
    }
    const postStats = buildUserBadgeStats(userId);
    for (const def of BADGE_DEFINITIONS) {
      const unlocked = get().isUnlocked(userId, def.id);
      const prog = computeBadgeProgress(def, postStats, unlocked);
      if (prog.status === 'almost_unlocked' && prog.percent >= 80 && !unlocked) {
        void tryInsertBadgeProgressNotification(
          userId,
          def,
          prog.percent,
        ).catch(() => {});
      }
    }
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
  const stats = buildUserBadgeStats(userId);
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
