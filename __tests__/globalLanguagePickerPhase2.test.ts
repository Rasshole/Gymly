/**
 * @jest-environment node
 *
 * Global language picker + scalable i18n architecture (Phase 2), updated for Phase 3 ready locales.
 */

import {
  LOCALE_REGISTRY,
  LOCALE_BY_ID,
  getReadyLocales,
  matchesLocaleSearch,
  sortLocalesByNativeName,
  getExerciseNamePolicy,
} from '../src/i18n/localeRegistry';
import {
  SELECTABLE_LANGUAGES,
  LANGUAGE_MODULE_IDS,
  hasTranslationModule,
  coerceToSelectableLanguage,
  normalizeLanguageTag,
} from '../src/i18n/types';
import {resolveLanguageFromTag} from '../src/i18n/resolveDeviceLanguage';
import {listVisiblePickerLocaleIds} from '../src/i18n/selectableLocales';
import fs from 'fs';
import path from 'path';

const {analyzeLocaleCoverage, flatten} = require('../scripts/lib/i18nCoverageCore.cjs');

describe('Phase 2 global language architecture', () => {
  it('keeps core four ready and selectable', () => {
    expect(SELECTABLE_LANGUAGES).toEqual(
      expect.arrayContaining(['da', 'en', 'nb', 'sv']),
    );
    expect(LANGUAGE_MODULE_IDS).toEqual(
      expect.arrayContaining(['da', 'en', 'nb', 'sv']),
    );
    expect(getReadyLocales().map(l => l.id)).toEqual(
      expect.arrayContaining(['da', 'en', 'nb', 'sv']),
    );
  });

  it('hides planned / RTL locales from picker', () => {
    const visible = listVisiblePickerLocaleIds();
    for (const id of ['ar', 'he'] as const) {
      expect(visible).not.toContain(id);
    }
    for (const id of ['ja', 'ko', 'zh-Hans', 'fi', 'ms'] as const) {
      if (LOCALE_BY_ID[id]?.status !== 'ready') {
        expect(visible).not.toContain(id);
      }
    }
    expect(visible).toEqual(expect.arrayContaining(['da', 'en', 'nb', 'sv']));
  });

  it('sorts picker by native name', () => {
    const names = sortLocalesByNativeName(
      getReadyLocales().filter(l => hasTranslationModule(l.id)),
    ).map(l => l.nativeName);
    expect(names).toEqual(
      [...names].sort((a, b) => a.localeCompare(b, 'en', {sensitivity: 'base'})),
    );
    expect(names).toEqual(
      expect.arrayContaining(['Dansk', 'English', 'Norsk', 'Svenska']),
    );
  });

  it('search matches native and English names', () => {
    const dansk = LOCALE_REGISTRY.find(l => l.id === 'da')!;
    const deutsch = LOCALE_REGISTRY.find(l => l.id === 'de')!;
    expect(matchesLocaleSearch(dansk, 'dans')).toBe(true);
    expect(matchesLocaleSearch(dansk, 'Danish')).toBe(true);
    expect(matchesLocaleSearch(dansk, 'xyz')).toBe(false);
    expect(matchesLocaleSearch(deutsch, 'german')).toBe(true);
  });

  it('maps device locales generically via registry readiness', () => {
    expect(resolveLanguageFromTag('da-DK')).toBe('da');
    expect(resolveLanguageFromTag('sv-SE')).toBe('sv');
    expect(resolveLanguageFromTag('nb-NO')).toBe('nb');
    expect(resolveLanguageFromTag('no-NO')).toBe('nb');
    expect(resolveLanguageFromTag('en-US')).toBe('en');
    if (LOCALE_BY_ID.de?.status === 'ready') {
      expect(resolveLanguageFromTag('de-DE')).toBe('de');
    } else {
      expect(resolveLanguageFromTag('de-DE')).toBe('en');
    }
    if (LOCALE_BY_ID.fr?.status !== 'ready') {
      expect(resolveLanguageFromTag('fr-FR')).toBe('en');
    }
    if (LOCALE_BY_ID.ja?.status === 'ready') {
      expect(resolveLanguageFromTag('ja-JP')).toBe('ja');
    } else {
      expect(resolveLanguageFromTag('ja-JP')).toBe('en');
    }
    expect(normalizeLanguageTag('nn-NO')).toBeNull();
    expect(coerceToSelectableLanguage('da')).toBe('da');
  });

  it('Danish remains first-class with gym-English exercise policy', () => {
    expect(hasTranslationModule('da')).toBe(true);
    expect(getExerciseNamePolicy('da')).toBe('CANONICAL_GYM_ENGLISH_ALLOWED');
    expect(getExerciseNamePolicy('sv')).toBe('FULLY_LOCALIZED');
    expect(getExerciseNamePolicy('nb')).toBe('FULLY_LOCALIZED');
  });

  it('LanguageScreen source is a flat global picker (no flags/recommended/cards)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/screens/settings/LanguageScreen.tsx'),
      'utf8',
    );
    expect(src).not.toMatch(/locale\.flag|styles\.flag/);
    expect(src).not.toMatch(
      /t\('language\.recommended'\)|t\('language\.allLanguages'\)|sectionLabel:/,
    );
    expect(src).not.toMatch(/LinearGradient|OnboardingPrimaryButton|logoGlow/);
    expect(src).toMatch(/language-continue/);
    expect(src).toMatch(/getSelectablePickerLocales/);
    expect(src).toMatch(/GymlyLogo/);
  });

  it('rtl module does not call forceRTL', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/i18n/rtl.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/forceRTL\s*\(/);
    expect(src).not.toMatch(/I18nManager\.(allowRTL|forceRTL)/);
  });
});

describe('i18n coverage gate', () => {
  const enFlat = {
    'auth.login': 'Log in',
    'home.title': 'Home',
    'badges.catalog.streak_starter_3.name': 'Starter',
    'badges.catalog.streak_starter_3.description': 'Desc',
  };

  it('FAILS when a required key is missing (EN merge does not count)', () => {
    const report = analyzeLocaleCoverage({
      enFlat,
      localeFlat: {
        'auth.login': 'Log ind',
        'badges.catalog.streak_starter_3.name': 'Starter',
        'badges.catalog.streak_starter_3.description': 'Desc',
      },
      localeId: 'da',
      exerciseNamePolicy: 'CANONICAL_GYM_ENGLISH_ALLOWED',
      badgeIds: ['streak_starter_3'],
      englishMergeDoesNotCountAsComplete: true,
    });
    expect(report.missingCount).toBe(1);
    expect(report.verdict).toBe('FAIL');
    expect(report.englishMergeDoesNotCountAsComplete).toBe(true);
  });

  it('PASSES when keys are present on the locale pack itself', () => {
    const report = analyzeLocaleCoverage({
      enFlat,
      localeFlat: {...enFlat, 'auth.login': 'Log ind', 'home.title': 'Hjem'},
      localeId: 'da',
      exerciseNamePolicy: 'CANONICAL_GYM_ENGLISH_ALLOWED',
      badgeIds: ['streak_starter_3'],
    });
    expect(report.verdict).toBe('READY');
    expect(report.missingCount).toBe(0);
  });

  it('FULLY_LOCALIZED exercise policy fails when overrides incomplete', () => {
    const libraryIds = Array.from({length: 50}, (_, i) => `ex-${i}`);
    const report = analyzeLocaleCoverage({
      enFlat,
      localeFlat: enFlat,
      localeId: 'sv',
      exerciseNamePolicy: 'FULLY_LOCALIZED',
      exerciseLibraryIds: libraryIds,
      exerciseOverrides: {'ex-0': 'A'},
      badgeIds: ['streak_starter_3'],
    });
    expect(report.exerciseOk).toBe(false);
    expect(report.verdict).toBe('FAIL');
  });

  it('CANONICAL_GYM_ENGLISH_ALLOWED does not fail Danish-style partial overrides', () => {
    const report = analyzeLocaleCoverage({
      enFlat,
      localeFlat: enFlat,
      localeId: 'da',
      exerciseNamePolicy: 'CANONICAL_GYM_ENGLISH_ALLOWED',
      exerciseLibraryIds: ['ex-a', 'ex-b'],
      exerciseOverrides: {'ex-a': 'A'},
      badgeIds: ['streak_starter_3'],
    });
    expect(report.exerciseOk).toBe(true);
    expect(report.verdict).toBe('READY');
  });

  it('flatten extracts nested leaves', () => {
    expect(flatten({a: {b: 'x'}, c: 'y'})).toEqual({'a.b': 'x', c: 'y'});
  });
});

describe('language persistence helpers', () => {
  it('coerce rejects planned codes and keeps stored ready codes', () => {
    expect(coerceToSelectableLanguage('sv')).toBe('sv');
    expect(coerceToSelectableLanguage('nb')).toBe('nb');
    expect(coerceToSelectableLanguage('en')).toBe('en');
    expect(coerceToSelectableLanguage('garbage')).toBe('en');
  });
});
