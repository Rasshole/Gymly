/**
 * @jest-environment node
 *
 * Friends empty state must use existing friendsScreen keys and real pack copy.
 * Missing keys are humanized ("Find Friends Title") and must not ship.
 */

import fs from 'fs';
import path from 'path';
import {getReadyLocaleIds} from '../src/i18n/localeRegistry';
import {getTranslationModule} from '../src/i18n/translations';
import {createTranslator} from '../src/i18n/translate';

const RAW = [
  'Search People Placeholder',
  'Find Friends Title',
  'Find Friends Message',
];

const KEYS = [
  'friendsScreen.searchPlaceholder',
  'friendsScreen.emptyTitle',
  'friendsScreen.emptyMessage',
] as const;

function friendsCopy(localeId: string) {
  const pack = getTranslationModule(localeId);
  if (!pack) {
    throw new Error(`missing pack ${localeId}`);
  }
  const screen = pack.friendsScreen as Record<string, string>;
  return {
    searchPlaceholder: screen.searchPlaceholder,
    emptyTitle: screen.emptyTitle,
    emptyMessage: screen.emptyMessage,
  };
}

describe('friends empty state copy', () => {
  it('renders existing keys, not hardcoded or missing-key placeholders', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/screens/main/FriendsScreen.tsx'),
      'utf8',
    );
    expect(source).toContain("t('friendsScreen.searchPlaceholder')");
    expect(source).toContain("t('friendsScreen.emptyTitle')");
    expect(source).toContain("t('friendsScreen.emptyMessage')");
    expect(source).not.toContain('searchPeoplePlaceholder');
    expect(source).not.toContain('findFriendsTitle');
    expect(source).not.toContain('findFriendsMessage');
    for (const raw of RAW) {
      expect(source).not.toContain(raw);
    }
  });

  it('uses the specified Danish and English product copy', () => {
    expect(friendsCopy('da')).toEqual({
      searchPlaceholder: 'Søg efter venner...',
      emptyTitle: 'Find dine venner',
      emptyMessage: 'Tilføj venner og se, hvornår de træner.',
    });
    expect(friendsCopy('en')).toEqual({
      searchPlaceholder: 'Search for friends...',
      emptyTitle: 'Find your friends',
      emptyMessage: 'Add friends and see when they’re training.',
    });
  });

  it('gives every ready locale its own copy for the three keys', () => {
    const ready = getReadyLocaleIds();
    expect(ready).toHaveLength(27);
    const en = friendsCopy('en');
    const enPack = getTranslationModule('en') as Record<string, unknown>;

    for (const id of ready) {
      const copy = friendsCopy(id);
      const pack = getTranslationModule(id) as Record<string, unknown>;
      const t = createTranslator(pack, enPack);
      for (const key of KEYS) {
        const value = t(key);
        expect(value.length).toBeGreaterThan(0);
        expect(RAW).not.toContain(value);
        expect(value).not.toBe(key);
      }
      if (id !== 'en') {
        expect(copy.searchPlaceholder).not.toBe(en.searchPlaceholder);
        expect(copy.emptyTitle).not.toBe(en.emptyTitle);
        expect(copy.emptyMessage).not.toBe(en.emptyMessage);
      }
    }
  });
});
