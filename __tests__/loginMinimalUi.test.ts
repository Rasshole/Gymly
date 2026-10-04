/**
 * @jest-environment node
 *
 * Login minimal UI — no hero glow/card; flat CTA; native Apple button preserved;
 * resting scroll disabled unless keyboard open.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('Login minimal UI contracts', () => {
  const login = read('src/screens/auth/LoginScreen.tsx');
  const en = read('src/i18n/translations/en.ts');

  it('removes large hero glow / form card / onboarding gradient CTA', () => {
    expect(login).not.toMatch(/logoGlow|logoHalo|logoFloat/);
    expect(login).not.toMatch(/styles\.card\b|cardSheen/);
    expect(login).not.toMatch(/OnboardingPrimaryButton/);
    expect(login).not.toMatch(/variant=["']premium["']/);
    expect(login).toMatch(/SocialPrimaryButton/);
    expect(login).toMatch(/GymlyLogo size=\{40\}/);
  });

  it('preserves auth handlers and an app-language Apple label', () => {
    const social = read('src/components/auth/SocialContinueButtons.tsx');
    expect(login).toMatch(/AuthService\.login/);
    expect(login).toMatch(/SocialContinueButtons/);
    expect(social).toMatch(/AuthService\.socialLogin/);
    expect(social).toMatch(/continueWithApple/);
    expect(social).toMatch(/runSocial\('apple'\)/);
    expect(social).toMatch(/runSocial\('google'\)/);
    expect(social).toMatch(/continueWithGoogle/);
  });

  it('resting layout disables scroll; keyboard enables it', () => {
    expect(login).toMatch(/scrollEnabled=\{keyboardOpen\}/);
    expect(login).toMatch(/KeyboardAvoidingView/);
    expect(login).toMatch(/keyboardShouldPersistTaps=["']handled["']/);
  });

  it('keeps navigation for signup / forgot / terms / privacy', () => {
    expect(login).toMatch(/navigate\('Register'\)/);
    expect(login).toMatch(/navigate\('ForgotPassword'\)/);
    expect(login).toMatch(/navigate\('Terms'\)/);
    expect(login).toMatch(/navigate\('PrivacyPolicy'\)/);
  });

  it('uses minimal welcome copy in English', () => {
    expect(en).toMatch(/loginTitle:\s*'Welcome back'/);
    expect(en).toMatch(/loginSubtitle:\s*'Log in to continue\.'/);
  });
});
