/**
 * @jest-environment node
 *
 * Startup: translation packs must load lazily (not evaluate all 29 at import).
 */

import {
  getTranslations,
  listLoadedTranslationIds,
  listInstalledTranslationIds,
  TRANSLATION_MODULES,
} from '../src/i18n/translations';
import {LANGUAGE_MODULE_IDS} from '../src/i18n/types';
import {listVisiblePickerLocaleIds} from '../src/i18n/selectableLocales';
import {LOCALE_BY_ID} from '../src/i18n/localeRegistry';

describe('lazy translation loading', () => {
  it('lists all installed module ids without loading every pack', () => {
    expect(listInstalledTranslationIds().length).toBe(LANGUAGE_MODULE_IDS.length);
    // Accessing the module map keys must not force-evaluate every locale.
    expect(Object.keys(TRANSLATION_MODULES).sort()).toEqual(
      [...LANGUAGE_MODULE_IDS].sort(),
    );
  });

  it('getTranslations(en) only evaluates English first', () => {
    const before = new Set(listLoadedTranslationIds());
    const dict = getTranslations('en') as {common?: {cancel?: string}};
    expect(dict.common?.cancel).toBeTruthy();
    const after = listLoadedTranslationIds();
    expect(after).toEqual(expect.arrayContaining(['en']));
    // Should not have eagerly loaded the bulk of locales just for EN.
    const newly = after.filter(id => !before.has(id));
    expect(newly.every(id => id === 'en' || id === 'da' || id === 'sv' || id === 'nb')).toBe(
      true,
    );
    expect(newly.length).toBeLessThanOrEqual(2);
  });

  it('loading a second locale does not load all ready picker locales', () => {
    getTranslations('en');
    const before = listLoadedTranslationIds().length;
    getTranslations('ja');
    const after = listLoadedTranslationIds();
    expect(after).toEqual(expect.arrayContaining(['en', 'ja']));
    expect(after.length).toBeLessThanOrEqual(before + 2);
    expect(after.length).toBeLessThan(listVisiblePickerLocaleIds().length);
  });

  it('keeps 27 ready locales selectable after lazy refactor', () => {
    const visible = listVisiblePickerLocaleIds();
    expect(visible.length).toBeGreaterThanOrEqual(27);
    for (const id of visible) {
      expect(LOCALE_BY_ID[id]?.status).toBe('ready');
      expect(TRANSLATION_MODULES[id as keyof typeof TRANSLATION_MODULES]).toBeTruthy();
    }
    expect(LOCALE_BY_ID.ar?.status).toBe('planned');
    expect(LOCALE_BY_ID.he?.status).toBe('planned');
    expect(visible).not.toContain('ar');
    expect(visible).not.toContain('he');
  });
});
