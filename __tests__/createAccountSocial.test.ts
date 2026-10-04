/**
 * @jest-environment node
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('Create Account social entry', () => {
  const register = read('src/screens/auth/RegisterScreen.tsx');
  const login = read('src/screens/auth/LoginScreen.tsx');
  const social = read('src/components/auth/SocialContinueButtons.tsx');
  const en = read('src/i18n/translations/en.ts');
  const da = read('src/i18n/translations/da.ts');

  it('places the shared Apple/Google buttons above email on Create Account', () => {
    const entry = register.slice(
      register.indexOf('const renderEntry'),
      register.indexOf('const renderProfile'),
    );
    expect(entry).toMatch(/SocialContinueButtons/);
    expect(entry).toMatch(/divider="after"/);
    const socialAt = entry.indexOf('SocialContinueButtons');
    const emailAt = entry.indexOf("t('auth.email')");
    const continueAt = entry.indexOf('handleEntryContinue');
    expect(socialAt).toBeGreaterThan(-1);
    expect(socialAt).toBeLessThan(emailAt);
    expect(emailAt).toBeLessThan(continueAt);
    expect(entry).toMatch(/OnboardingPrimaryButton/);
    expect(entry).toMatch(/privacyAccepted/);
    expect(entry).toMatch(/termsAccepted/);
  });

  it('reuses AuthService.socialLogin and does not add a second OAuth path', () => {
    expect(social).toMatch(/AuthService\.socialLogin/);
    expect(social).not.toMatch(/signInWithIdToken/);
    expect(register).not.toMatch(/signInWithIdToken|signInWithApple|signInWithGoogle/);
    expect(login).toMatch(/SocialContinueButtons/);
    expect(login).toMatch(/AuthService\.login/);
  });

  it('uses the requested subtitle and the word Google', () => {
    expect(en).toMatch(/v2EntrySub:\s*'Continue with Apple, Google or email\.'/);
    expect(da).toMatch(/v2EntrySub:\s*'Fortsæt med Apple, Google eller e-mail\.'/);
    expect(en).not.toMatch(/Google Play/);
    expect(da).not.toMatch(/Google Play/);
    expect(social).toMatch(/continueWithGoogle/);
    expect(social).toMatch(/auth\.orContinueWith/);
  });
});
