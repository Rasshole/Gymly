/**
 * Zustand: intern demo-tilstand. Persist kun i __DEV__ (AsyncStorage).
 */

import {create} from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'gymly_internal_demo_content_v1';

function devBuild(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

type DemoModeState = {
  enabled: boolean;
  hydrated: boolean;
  /** Kun __DEV__: læs disk (kald ved app-start). */
  hydrateFromStorage: () => Promise<void>;
  /** Kun __DEV__: til/fra + persist. */
  setEnabled: (next: boolean) => Promise<void>;
};

export const useDemoModeStore = create<DemoModeState>((set, _get) => ({
  enabled: false,
  hydrated: false,

  hydrateFromStorage: async () => {
    if (!devBuild()) {
      set({hydrated: true, enabled: false});
      return;
    }
    try {
      const v = await AsyncStorage.getItem(STORAGE_KEY);
      set({enabled: v === '1', hydrated: true});
    } catch {
      set({hydrated: true});
    }
  },

  setEnabled: async next => {
    if (!devBuild()) {
      return;
    }
    if (next) {
      await AsyncStorage.setItem(STORAGE_KEY, '1');
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
    set({enabled: next});
  },
}));
