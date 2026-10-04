/**
 * @jest-environment node
 *
 * Phase 3 Batch 1 — packs, picker, device resolve, generic product copy.
 */

import {
  listVisiblePickerLocaleIds,
} from '../src/i18n/selectableLocales';
import {
  LANGUAGE_MODULE_IDS,
  hasTranslationModule,
  coerceToSelectableLanguage,
} from '../src/i18n/types';
import {resolveLanguageFromTag} from '../src/i18n/resolveDeviceLanguage';
import {LOCALE_BY_ID, matchesLocaleSearch} from '../src/i18n/localeRegistry';
import {TRANSLATION_MODULES} from '../src/i18n/translations';
import {getMuscleGroupLabel, labelForMuscleToken} from '../src/utils/muscleGroupLabels';
import {formatStreakLabel} from '../src/utils/streakUtils';
import {mapAppLanguageToStorefront} from '../src/shop/shopify/ShopifyStorefrontClient';
import {formatSocialNotificationBody} from '../src/services/notifications/socialNotificationCopy';
import {pickLocalizedString} from '../src/i18n/pickLocalizedString';

const {flatten, analyzeLocaleCoverage} = require('../scripts/lib/i18nCoverageCore.cjs');

function asDict(mod: unknown): Record<string, unknown> {
  const m = mod as {default?: Record<string, unknown>};
  return (m?.default ?? m) as Record<string, unknown>;
}

function extractTokens(s: string): string[] {
  return [...s.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort();
}

describe('Phase 3 Batch 1 modules', () => {
  it('loads installed Batch 1 modules that were promoted', () => {
    for (const id of ['de', 'es', 'nl', 'it', 'pt'] as const) {
      if (LOCALE_BY_ID[id]?.status === 'ready') {
        expect(hasTranslationModule(id)).toBe(true);
        expect(TRANSLATION_MODULES[id as keyof typeof TRANSLATION_MODULES]).toBeTruthy();
      }
    }
  });

  it('planned locales stay hidden from picker', () => {
    const visible = listVisiblePickerLocaleIds();
    for (const id of ['ar', 'he']) {
      expect(visible).not.toContain(id);
    }
    for (const id of ['ja', 'ko', 'fr', 'pl'] as const) {
      if (LOCALE_BY_ID[id]?.status !== 'ready') {
        expect(visible).not.toContain(id);
      }
    }
  });

  it('picker includes core four + ready Batch 1', () => {
    const visible = listVisiblePickerLocaleIds().sort();
    expect(visible).toEqual(expect.arrayContaining(['da', 'en', 'nb', 'sv']));
    for (const id of LANGUAGE_MODULE_IDS) {
      if (LOCALE_BY_ID[id]?.status === 'ready') {
        expect(visible).toContain(id);
      }
    }
  });

  it('search matches native and English names for Batch 1', () => {
    const de = LOCALE_BY_ID.de!;
    expect(matchesLocaleSearch(de, 'deutsch')).toBe(true);
    expect(matchesLocaleSearch(de, 'German')).toBe(true);
    const fr = LOCALE_BY_ID.fr!;
    expect(matchesLocaleSearch(fr, 'français')).toBe(true);
  });

  it('device resolution for Batch 1 ready locales', () => {
    if (LOCALE_BY_ID.de?.status === 'ready') {
      expect(resolveLanguageFromTag('de-DE')).toBe('de');
    }
    if (LOCALE_BY_ID.nl?.status === 'ready') {
      expect(resolveLanguageFromTag('nl-NL')).toBe('nl');
    }
    if (LOCALE_BY_ID.it?.status === 'ready') {
      expect(resolveLanguageFromTag('it-IT')).toBe('it');
    }
    if (LOCALE_BY_ID.es?.status === 'ready') {
      expect(resolveLanguageFromTag('es-ES')).toBe('es');
    }
    if (LOCALE_BY_ID.pt?.status === 'ready') {
      expect(resolveLanguageFromTag('pt-PT')).toBe('pt');
    }
    // planned French → English
    if (LOCALE_BY_ID.fr?.status !== 'ready') {
      expect(resolveLanguageFromTag('fr-FR')).toBe('en');
    }
  });

  it('persistence coerce keeps ready codes', () => {
    expect(coerceToSelectableLanguage('da')).toBe('da');
    expect(coerceToSelectableLanguage('en')).toBe('en');
    if (LOCALE_BY_ID.de?.status === 'ready') {
      expect(coerceToSelectableLanguage('de')).toBe('de');
    }
    expect(coerceToSelectableLanguage('zz')).toBe('en');
  });
});

describe('Phase 3 coverage + tokens', () => {
  const enFlat = flatten(asDict(TRANSLATION_MODULES.en));

  it('each ready installed locale has 100% key coverage', () => {
    for (const id of Object.keys(TRANSLATION_MODULES)) {
      if (LOCALE_BY_ID[id]?.status !== 'ready' && id !== 'en') {
        continue;
      }
      const report = analyzeLocaleCoverage({
        enFlat,
        localeFlat: flatten(asDict(TRANSLATION_MODULES[id as keyof typeof TRANSLATION_MODULES])),
        localeId: id,
        exerciseNamePolicy: LOCALE_BY_ID[id]?.exerciseNamePolicy,
        isEnglishMaster: id === 'en',
        badgeIds: [],
      });
      expect(report.missingCount).toBe(0);
      expect(report.verdict).toBe('READY');
    }
  });

  it('interpolation tokens match English for Batch 1 ready packs', () => {
    const batch1 = new Set(['de', 'fr', 'es', 'nl', 'it', 'pl', 'pt']);
    for (const id of Object.keys(TRANSLATION_MODULES)) {
      if (!batch1.has(id)) {
        continue;
      }
      if (LOCALE_BY_ID[id]?.status !== 'ready') {
        continue;
      }
      const flat = flatten(
        asDict(TRANSLATION_MODULES[id as keyof typeof TRANSLATION_MODULES]),
      );
      for (const [key, enVal] of Object.entries(enFlat) as [string, string][]) {
        const locVal = flat[key];
        if (!locVal) {
          continue;
        }
        expect(extractTokens(locVal)).toEqual(extractTokens(enVal));
      }
    }
  });
});

describe('Generic product copy (locale → EN, never DA default)', () => {
  it('muscle labels use locale packs and EN fallback', () => {
    expect(getMuscleGroupLabel('bryst', 'en')).toBe('Chest');
    expect(getMuscleGroupLabel('bryst', 'da')).toBe('Bryst');
    expect(getMuscleGroupLabel('bryst', 'de')).toBe('Brust');
    expect(getMuscleGroupLabel('bryst', 'zz' as any)).toBe('Chest');
    expect(labelForMuscleToken('fri', 'de')).toBe('Freies Training');
    expect(labelForMuscleToken('fri', 'en')).toBe('Open workout');
  });

  it('streak labels are locale-driven with EN fallback', () => {
    expect(formatStreakLabel(1, 'en')).toMatch(/1 day/);
    expect(formatStreakLabel(1, 'da')).toMatch(/1 dag/);
    expect(formatStreakLabel(3, 'de')).toMatch(/3 Tage/);
    expect(formatStreakLabel(2, 'unknown')).toMatch(/2 days/);
  });

  it('Shopify mapping is table-driven with EN fallback', () => {
    expect(mapAppLanguageToStorefront('da')).toBe('DA');
    expect(mapAppLanguageToStorefront('de')).toBe('DE');
    expect(mapAppLanguageToStorefront('fr')).toBe('FR');
    expect(mapAppLanguageToStorefront('zz')).toBe('EN');
  });

  it('social notification copy falls back to English for unknown locales', () => {
    const en = formatSocialNotificationBody('en', {
      type: 'post_comment',
      actorName: 'Alex',
    });
    const de = formatSocialNotificationBody('de', {
      type: 'post_comment',
      actorName: 'Alex',
    });
    const unknown = formatSocialNotificationBody('zz', {
      type: 'post_comment',
      actorName: 'Alex',
    });
    expect(en).toContain('commented');
    expect(de).toContain('kommentiert');
    expect(unknown).toBe(en);
  });

  it('pickLocalizedString never falls back to Danish', () => {
    expect(
      pickLocalizedString('fr', {en: 'Hello', da: 'Hej', de: 'Hallo'}),
    ).toBe('Hello');
  });
});

describe('DA/EN/SV/NB regression', () => {
  it('core four remain modules + selectable when ready', () => {
    for (const id of ['da', 'en', 'sv', 'nb'] as const) {
      expect(hasTranslationModule(id)).toBe(true);
      expect(LOCALE_BY_ID[id]?.status).toBe('ready');
      expect(listVisiblePickerLocaleIds()).toContain(id);
    }
  });
});
