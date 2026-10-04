import AsyncStorage from '@react-native-async-storage/async-storage';
import type {AppLanguage} from './types';
import {
  LANGUAGE_STORAGE_KEY,
  hasTranslationModule,
  coerceToSelectableLanguage,
} from './types';

export async function loadStoredLanguage(): Promise<AppLanguage | null> {
  try {
    const raw = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (raw && hasTranslationModule(raw)) {
      return coerceToSelectableLanguage(raw);
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Persist only selectable (ready) languages so partial packs are not sticky in the picker. */
export async function persistLanguage(lang: AppLanguage): Promise<void> {
  await AsyncStorage.setItem(
    LANGUAGE_STORAGE_KEY,
    coerceToSelectableLanguage(lang),
  );
}
