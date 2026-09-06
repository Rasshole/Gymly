/**
 * Saved Shop products — local AsyncStorage, scoped per signed-in user.
 * Replaceable by cloud sync later; no Supabase table in Phase 1A.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {create} from 'zustand';

const STORAGE_KEY = 'gymly_saved_shop_products_v1';

/** userId → productId[] */
type SavedMap = Record<string, string[]>;

async function readMap(): Promise<SavedMap> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as SavedMap;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

async function writeMap(map: SavedMap): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore persist errors */
  }
}

type SavedShopProductsState = {
  userId: string | null;
  savedIds: string[];
  hydrated: boolean;
  hydrateForUser: (userId: string | null) => Promise<void>;
  isSaved: (productId: string) => boolean;
  toggleSaved: (productId: string) => Promise<void>;
  removeSaved: (productId: string) => Promise<void>;
  /** Clears in-memory state on logout — does not wipe other users' persisted saves. */
  resetForLogout: () => void;
};

export const useSavedShopProductsStore = create<SavedShopProductsState>((set, get) => ({
  userId: null,
  savedIds: [],
  hydrated: false,

  hydrateForUser: async (userId: string | null) => {
    if (!userId) {
      set({userId: null, savedIds: [], hydrated: true});
      return;
    }
    const map = await readMap();
    const savedIds = Array.isArray(map[userId]) ? [...map[userId]!] : [];
    set({userId, savedIds, hydrated: true});
  },

  isSaved: (productId: string) => get().savedIds.includes(productId),

  toggleSaved: async (productId: string) => {
    const {userId, savedIds} = get();
    if (!userId || !productId) {
      return;
    }
    const next = savedIds.includes(productId)
      ? savedIds.filter(id => id !== productId)
      : [...savedIds, productId];
    set({savedIds: next});
    const map = await readMap();
    map[userId] = next;
    await writeMap(map);
  },

  removeSaved: async (productId: string) => {
    const {userId, savedIds} = get();
    if (!userId || !productId) {
      return;
    }
    if (!savedIds.includes(productId)) {
      return;
    }
    const next = savedIds.filter(id => id !== productId);
    set({savedIds: next});
    const map = await readMap();
    map[userId] = next;
    await writeMap(map);
  },

  resetForLogout: () => {
    set({userId: null, savedIds: [], hydrated: false});
  },
}));
