/**
 * @jest-environment node
 *
 * Onboarding/auth Continue CTA is a flat solid purple button.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('onboarding continue button', () => {
  const button = read('src/components/onboarding/OnboardingPrimaryButton.tsx');
  const register = read('src/screens/auth/RegisterScreen.tsx');
  const language = read('src/screens/settings/LanguageScreen.tsx');

  it('drops gradient, sheen, glow, and shadow from the shared CTA', () => {
    expect(button).not.toMatch(/LinearGradient|sheen|glow|shadowOpacity|elevation/);
    expect(button).toMatch(/backgroundColor: colors\.primary/);
    expect(button).toMatch(/minHeight: HEIGHT/);
    expect(button).toMatch(/const HEIGHT = 52/);
    expect(button).toMatch(/borderRadius: radius\.lg/);
    expect(button).toMatch(/opacity: 0\.88/);
    expect(button).toMatch(/opacity: 0\.4/);
    expect(button).toMatch(/typography\.bodyBold/);
  });

  it('keeps register Continue actions on the shared button', () => {
    expect(register).toMatch(/label=\{t\('register\.continue'\)\}/);
    expect(register).toMatch(/onPress=\{handleEntryContinue\}/);
    expect(register).toMatch(/onPress=\{handleProfileContinue\}/);
    expect(register).toMatch(
      /disabled=\{email\.trim\(\)\.length <= 3 \|\| !privacyAccepted \|\| !termsAccepted \|\| socialBusy\}/,
    );
    expect(register).toMatch(/disabled=\{!profileReady\}/);
  });

  it('matches the language-step Continue shape', () => {
    expect(language).toMatch(/minHeight: 52/);
    expect(language).toMatch(/borderRadius: radius\.lg/);
    expect(language).toMatch(/backgroundColor: colors\.primary/);
    expect(language).toMatch(/continueBtnPressed/);
    expect(language).toMatch(/opacity: 0\.88/);
    expect(language).not.toMatch(/LinearGradient|OnboardingPrimaryButton|logoGlow/);
  });
});
