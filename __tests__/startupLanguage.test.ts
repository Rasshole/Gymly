/**
 * @jest-environment node
 *
 * First-open language: first supported phone preference, English fallback,
 * saved choice wins. Auth starts on Login and can still open the picker.
 */

import fs from 'fs';
import path from 'path';
import {getPasswordIssue} from '../src/services/auth/passwordPolicy';
import {
  resolveLanguageFromPreferences,
  resolveStartupLanguage,
} from '../src/i18n/resolveDeviceLanguage';

const ROOT = path.join(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('startup language', () => {
  it('uses the first supported preference and falls back to English', () => {
    expect(resolveLanguageFromPreferences(['da-DK', 'en-US'])).toBe('da');
    expect(resolveLanguageFromPreferences(['en-GB'])).toBe('en');
    expect(resolveLanguageFromPreferences(['en'])).toBe('en');
    expect(resolveLanguageFromPreferences(['is-IS'])).toBe('en');
    expect(resolveLanguageFromPreferences(['nn-NO', 'en-US'])).toBe('en');
    expect(resolveLanguageFromPreferences(['is-IS', 'sv-SE', 'en'])).toBe('sv');
    expect(resolveLanguageFromPreferences([])).toBe('en');
  });

  it('keeps a saved language ahead of the phone preferences', () => {
    expect(resolveStartupLanguage('da', ['en-US', 'sv-SE'])).toBe('da');
    expect(resolveStartupLanguage('en', ['da-DK'])).toBe('en');
    expect(resolveStartupLanguage(null, ['da-DK'])).toBe('da');
    expect(resolveStartupLanguage('  ', ['en-US'])).toBe('en');
    expect(resolveStartupLanguage(undefined, ['is-IS'])).toBe('en');
  });

  it('opens Login first and still offers the existing language picker', () => {
    const auth = read('src/navigation/AuthNavigator.tsx');
    const login = read('src/screens/auth/LoginScreen.tsx');
    const register = read('src/screens/auth/RegisterScreen.tsx');
    expect(auth).toMatch(/initialRouteName="Login"/);
    expect(auth).toMatch(/LanguageSettingsScreen/);
    expect(auth).not.toMatch(/hasUserChosenLanguage/);
    expect(login).toMatch(/AuthLanguageButton/);
    expect(register).toMatch(/AuthLanguageButton/);
    expect(read('src/screens/main/SettingsScreen.tsx')).toMatch(
      /LanguageSettings/,
    );
  });
});

describe('signup password help matches the policy', () => {
  it('requires 8 characters, upper, lower and a digit', () => {
    expect(getPasswordIssue('')).toBe('minLength');
    expect(getPasswordIssue('Abcdefg')).toBe('minLength');
    expect(getPasswordIssue('abcdefg1')).toBe('upper');
    expect(getPasswordIssue('ABCDEFG1')).toBe('lower');
    expect(getPasswordIssue('Abcdefgh')).toBe('digit');
    expect(getPasswordIssue('Abcdefg1')).toBeNull();
  });

  it('shows the full requirement in Danish and English', () => {
    expect(read('src/i18n/translations/da.ts')).toContain(
      "passwordMinLength: 'Mindst 8 tegn med stort og lille bogstav samt et tal.'",
    );
    expect(read('src/i18n/translations/en.ts')).toContain(
      "passwordMinLength: 'At least 8 characters, including uppercase, lowercase and a number.'",
    );
    const register = read('src/screens/auth/RegisterScreen.tsx');
    expect(register).toMatch(/passwordMinLength/);
    expect(register).toMatch(/passwordUpper/);
    expect(register).toMatch(/passwordLower/);
    expect(register).toMatch(/passwordDigit/);
  });
});
