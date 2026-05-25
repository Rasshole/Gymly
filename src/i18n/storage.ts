import AsyncStorage from '@react-native-async-storage/async-storage';
import type {AppLanguage} from './types';
import {LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES} from './types';

export async function loadStoredLanguage(): Promise<AppLanguage | null> {
  try {
    const raw = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (raw && SUPPORTED_LANGUAGES.includes(raw as AppLanguage)) {
      return raw as AppLanguage;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function persistLanguage(lang: AppLanguage): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
}
