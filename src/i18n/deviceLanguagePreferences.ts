import {NativeModules, Platform} from 'react-native';

function pushLocale(target: string[], value: unknown) {
  if (typeof value !== 'string') {
    return;
  }
  const trimmed = value.trim();
  if (!trimmed || target.includes(trimmed)) {
    return;
  }
  target.push(trimmed);
}

/**
 * Ordered language preferences from the phone.
 * iOS: AppleLanguages, then AppleLocale. Android: localeIdentifier.
 * The active Intl locale is appended so a single-locale runtime still resolves.
 */
export function readDeviceLanguagePreferences(): string[] {
  const preferences: string[] = [];
  try {
    if (Platform.OS === 'ios') {
      const settings = NativeModules?.SettingsManager?.settings;
      const apple = settings?.AppleLanguages;
      if (Array.isArray(apple)) {
        for (const item of apple) {
          pushLocale(preferences, item);
        }
      } else {
        pushLocale(preferences, apple);
      }
      pushLocale(preferences, settings?.AppleLocale);
    } else if (Platform.OS === 'android') {
      pushLocale(preferences, NativeModules?.I18nManager?.localeIdentifier);
    }
  } catch {
    /* native settings are optional */
  }
  try {
    pushLocale(preferences, Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    /* Intl can throw in odd runtimes */
  }
  return preferences;
}
