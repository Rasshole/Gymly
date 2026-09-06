export {LanguageProvider, useTranslation} from './LanguageContext';
export type {AppLanguage, SelectableLanguage, TranslationDict} from './types';
export {
  LANGUAGE_STORAGE_KEY,
  LANGUAGE_NATIVE_LABELS,
  ONBOARDING_LANGUAGES,
  SELECTABLE_LANGUAGES,
  SUPPORTED_LANGUAGES,
  FALLBACK_LANGUAGE,
  coerceToSelectableLanguage,
  normalizeLanguageTag,
} from './types';
export {getDateFnsLocale, getIntlLocale} from './locales';
export {useAppFormat} from './useAppFormat';
export {progressLabelT, upcomingBadgeHintT} from './badgeLabels';
export {badgeDisplayName, badgeDisplayDescription} from './badgeDisplay';
export {getExerciseDisplayName} from './exerciseNames';
export {
  LOCALE_REGISTRY,
  getReadyLocales,
  getReadyLocaleIds,
  matchesLocaleSearch,
} from './localeRegistry';
export type {LocaleDefinition, LocaleStatus} from './localeRegistry';
export {
  resolveDeviceLanguage,
  toSelectableLanguage,
  getRecommendedLocaleId,
} from './resolveDeviceLanguage';
export {getRuntimeLanguage, rt} from './runtimeLanguage';
export {useMuscleLabel} from './useMuscleLabel';
export {isRtlLanguage, applyLayoutDirectionForLanguage} from './rtl';
export {createTranslator, createPluralTranslator} from './translate';
export type {TranslateFn, PluralTranslateFn} from './translate';
