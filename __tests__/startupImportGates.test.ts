/**
 * @jest-environment node
 *
 * Physical-device splash hang: App → RootNavigator must not static-import
 * RegisterScreen / danishGyms / centers.json during module evaluation.
 */

import fs from 'fs';
import path from 'path';

describe('startup import gates', () => {
  const root = path.join(__dirname, '..');

  it('RootNavigator does not static-import Auth/Onboarding/Register', () => {
    const src = fs.readFileSync(
      path.join(root, 'src/navigation/RootNavigator.tsx'),
      'utf8',
    );
    expect(src).not.toMatch(/import\s+AuthNavigator\s+from/);
    expect(src).not.toMatch(/import\s+OnboardingNavigator\s+from/);
    expect(src).not.toMatch(/\bRegisterScreen\b/);
    expect(src).toMatch(/LazyAuthNavigator/);
    expect(src).toMatch(/LazyOnboardingNavigator/);
  });

  it('AuthNavigator defers RegisterScreen via getComponent', () => {
    const src = fs.readFileSync(
      path.join(root, 'src/navigation/AuthNavigator.tsx'),
      'utf8',
    );
    expect(src).not.toMatch(/import\s+RegisterScreen\s+from/);
    expect(src).toMatch(/getComponent=\{\(\)\s*=>\s*require\(/);
  });

  it('OnboardingNavigator defers RegisterScreen via getComponent', () => {
    const src = fs.readFileSync(
      path.join(root, 'src/navigation/OnboardingNavigator.tsx'),
      'utf8',
    );
    expect(src).not.toMatch(/import\s+RegisterScreen\s+from/);
    expect(src).toMatch(/getComponent=\{\(\)\s*=>\s*require\(/);
  });
});
