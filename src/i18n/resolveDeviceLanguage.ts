import type {AppLanguage} from './types';
import {SUPPORTED_LANGUAGES} from './types';

export function resolveDeviceLanguage(): AppLanguage {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? '';
    const tag = locale.split(/[-_]/)[0]?.toLowerCase();
    if (tag && SUPPORTED_LANGUAGES.includes(tag as AppLanguage)) {
      return tag as AppLanguage;
    }
  } catch {
    /* ignore */
  }
  return 'en';
}
