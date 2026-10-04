/**
 * @jest-environment node
 *
 * Global language expansion — registry-driven picker, ready packs, RTL stay planned.
 */

import {listVisiblePickerLocaleIds} from '../src/i18n/selectableLocales';
import {
  LANGUAGE_MODULE_IDS,
  hasTranslationModule,
  coerceToSelectableLanguage,
  normalizeLanguageTag,
} from '../src/i18n/types';
import {resolveLanguageFromTag} from '../src/i18n/resolveDeviceLanguage';
import {
  LOCALE_BY_ID,
  matchesLocaleSearch,
  isReadyLocale,
} from '../src/i18n/localeRegistry';
import {TRANSLATION_MODULES} from '../src/i18n/translations';
import {getMuscleGroupLabel} from '../src/utils/muscleGroupLabels';
import {formatStreakLabel} from '../src/utils/streakUtils';
import {mapAppLanguageToStorefront} from '../src/shop/shopify/ShopifyStorefrontClient';
import {formatSocialNotificationBody} from '../src/services/notifications/socialNotificationCopy';
import {pickLocalizedString} from '../src/i18n/pickLocalizedString';
import {isRtlLanguage, applyLayoutDirectionForLanguage} from '../src/i18n/rtl';

const {flatten, analyzeLocaleCoverage} = require('../scripts/lib/i18nCoverageCore.cjs');

function asDict(mod: unknown): Record<string, unknown> {
  const m = mod as {default?: Record<string, unknown>};
  return (m?.default ?? m) as Record<string, unknown>;
}

function extractTokens(s: string): string[] {
  return [...s.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort();
}

const SEALED = ['da', 'en', 'sv', 'nb', 'de', 'fr', 'es', 'it', 'nl', 'pl', 'pt'] as const;

describe('Global language expansion', () => {
  it('every installed translation module loads', () => {
    for (const id of LANGUAGE_MODULE_IDS) {
      expect(hasTranslationModule(id)).toBe(true);
      expect(TRANSLATION_MODULES[id as keyof typeof TRANSLATION_MODULES]).toBeTruthy();
      const flat = flatten(asDict(TRANSLATION_MODULES[id as keyof typeof TRANSLATION_MODULES]));
      expect(Object.keys(flat).length).toBeGreaterThan(1000);
    }
  });

  it('all ready locales pass coverage gate', () => {
    const enFlat = flatten(asDict(TRANSLATION_MODULES.en));
    for (const id of LANGUAGE_MODULE_IDS) {
      if (!isReadyLocale(id)) continue;
      const locFlat = flatten(asDict(TRANSLATION_MODULES[id as keyof typeof TRANSLATION_MODULES]));
      const report = analyzeLocaleCoverage({
        localeId: id,
        enFlat,
        localeFlat: locFlat,
        exerciseNamePolicy: LOCALE_BY_ID[id]?.exerciseNamePolicy ?? 'CANONICAL_GYM_ENGLISH_ALLOWED',
        exerciseOverrides: {},
        exerciseLibraryIds: [],
        badgeIds: [],
      });
      expect(report.verdict).toBe('READY');
      expect(report.missing.length).toBe(0);
    }
  });

  it('RTL ar/he stay planned and hidden', () => {
    expect(LOCALE_BY_ID.ar?.status).toBe('planned');
    expect(LOCALE_BY_ID.he?.status).toBe('planned');
    expect(LOCALE_BY_ID.ar?.rtl).toBe(true);
    expect(LOCALE_BY_ID.he?.rtl).toBe(true);
    const visible = listVisiblePickerLocaleIds();
    expect(visible).not.toContain('ar');
    expect(visible).not.toContain('he');
    expect(isRtlLanguage('ar')).toBe(true);
    expect(isRtlLanguage('he')).toBe(true);
    // applyLayoutDirectionForLanguage is a no-op until dedicated RTL QA
    expect(() => applyLayoutDirectionForLanguage('ar')).not.toThrow();
  });

  it('picker is registry-driven: ready ∩ installed only', () => {
    const visible = listVisiblePickerLocaleIds();
    for (const id of visible) {
      expect(isReadyLocale(id)).toBe(true);
      expect(hasTranslationModule(id)).toBe(true);
    }
    for (const id of SEALED) {
      expect(visible).toContain(id);
    }
  });

  it('native-name and English-name search work for global ready locales', () => {
    if (isReadyLocale('ja') && LOCALE_BY_ID.ja) {
      expect(matchesLocaleSearch(LOCALE_BY_ID.ja, '日本語')).toBe(true);
      expect(matchesLocaleSearch(LOCALE_BY_ID.ja, 'Japanese')).toBe(true);
    }
    if (isReadyLocale('ko') && LOCALE_BY_ID.ko) {
      expect(matchesLocaleSearch(LOCALE_BY_ID.ko, '한국어')).toBe(true);
      expect(matchesLocaleSearch(LOCALE_BY_ID.ko, 'Korean')).toBe(true);
    }
    if (isReadyLocale('zh-Hans') && LOCALE_BY_ID['zh-Hans']) {
      expect(matchesLocaleSearch(LOCALE_BY_ID['zh-Hans'], '简体')).toBe(true);
      expect(matchesLocaleSearch(LOCALE_BY_ID['zh-Hans'], 'Chinese')).toBe(true);
    }
  });

  it('device locale aliases map to ready packs else English', () => {
    if (isReadyLocale('de')) {
      expect(resolveLanguageFromTag('de-DE')).toBe('de');
    }
    if (isReadyLocale('ja')) {
      expect(resolveLanguageFromTag('ja-JP')).toBe('ja');
    }
    if (isReadyLocale('ko')) {
      expect(resolveLanguageFromTag('ko-KR')).toBe('ko');
    }
    if (isReadyLocale('zh-Hans')) {
      expect(resolveLanguageFromTag('zh-CN')).toBe('zh-Hans');
    }
    if (isReadyLocale('zh-Hant')) {
      expect(resolveLanguageFromTag('zh-TW')).toBe('zh-Hant');
    }
    if (isReadyLocale('pt')) {
      expect(resolveLanguageFromTag('pt-BR')).toBe('pt');
    }
    // Unsupported → English
    expect(resolveLanguageFromTag('xx-YY')).toBe('en');
    // Planned RTL never wins
    expect(resolveLanguageFromTag('ar-SA')).toBe('en');
    expect(resolveLanguageFromTag('he-IL')).toBe('en');
  });

  it('normalizeLanguageTag aliases', () => {
    expect(normalizeLanguageTag('zh-CN')).toBe('zh-Hans');
    expect(normalizeLanguageTag('zh-TW')).toBe('zh-Hant');
    expect(normalizeLanguageTag('pt-BR')).toBe('pt');
  });

  it('persistence coerce keeps ready codes', () => {
    expect(coerceToSelectableLanguage('da')).toBe('da');
    expect(coerceToSelectableLanguage('en')).toBe('en');
    if (isReadyLocale('ja')) {
      expect(coerceToSelectableLanguage('ja')).toBe('ja');
    }
    expect(coerceToSelectableLanguage('ar')).toBe('en');
  });

  it('interpolation tokens match EN for every ready installed pack', () => {
    const enFlat = flatten(asDict(TRANSLATION_MODULES.en)) as Record<string, string>;
    for (const id of LANGUAGE_MODULE_IDS) {
      if (!isReadyLocale(id) || id === 'en') continue;
      const locFlat = flatten(
        asDict(TRANSLATION_MODULES[id as keyof typeof TRANSLATION_MODULES]),
      ) as Record<string, string>;
      const mismatches: string[] = [];
      for (const [k, ev] of Object.entries(enFlat)) {
        const lv = locFlat[k];
        if (lv == null) continue;
        const enToks = extractTokens(ev);
        const locToks = extractTokens(String(lv));
        // Locale may add plural-helper tokens (e.g. da {{daysSuffix}}); all EN tokens must remain.
        const missingEn = enToks.filter(t => !locToks.includes(t));
        if (missingEn.length > 0) {
          mismatches.push(k);
        }
      }
      expect(mismatches).toEqual([]);
    }
  });

  it('muscle groups / streaks / shopify / social fall back to EN never DA', () => {
    expect(getMuscleGroupLabel('bryst', 'xx')).toBe(getMuscleGroupLabel('bryst', 'en'));
    expect(formatStreakLabel(3, 'xx')).toBe(formatStreakLabel(3, 'en'));
    expect(mapAppLanguageToStorefront('xx')).toBe('EN');
    expect(mapAppLanguageToStorefront('da')).toBe('DA');
    if (isReadyLocale('ja')) {
      expect(mapAppLanguageToStorefront('ja')).toBe('JA');
    }
    if (isReadyLocale('zh-Hans')) {
      expect(mapAppLanguageToStorefront('zh-Hans')).toBe('ZH_CN');
    }
    const body = formatSocialNotificationBody('xx', {
      type: 'post_like',
      actorName: 'Alex',
    });
    expect(body).toBe(
      formatSocialNotificationBody('en', {type: 'post_like', actorName: 'Alex'}),
    );
    expect(pickLocalizedString('xx', {en: 'Hello', da: 'Hej'})).toBe('Hello');
  });

  it('DA/EN/SV/NB sealed regression — still ready and pickable', () => {
    for (const id of ['da', 'en', 'sv', 'nb'] as const) {
      expect(isReadyLocale(id)).toBe(true);
      expect(listVisiblePickerLocaleIds()).toContain(id);
      expect(hasTranslationModule(id)).toBe(true);
    }
  });
});
