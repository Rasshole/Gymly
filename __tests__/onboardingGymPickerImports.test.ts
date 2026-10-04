/**
 * @jest-environment node
 *
 * Guards the OnboardingGymPicker render tree against undefined React elements
 * caused by named/default import mismatches (device Render Error).
 */

import fs from 'fs';
import path from 'path';

describe('OnboardingGymPicker import contracts', () => {
  const root = path.join(__dirname, '..');
  const pickerSrc = fs.readFileSync(
    path.join(root, 'src/components/onboarding/OnboardingGymPicker.tsx'),
    'utf8',
  );
  const logoSrc = fs.readFileSync(
    path.join(root, 'src/components/ui/GymLogoView.tsx'),
    'utf8',
  );
  const barrelSrc = fs.readFileSync(
    path.join(root, 'src/components/onboarding/index.ts'),
    'utf8',
  );
  const buttonSrc = fs.readFileSync(
    path.join(root, 'src/components/onboarding/OnboardingPrimaryButton.tsx'),
    'utf8',
  );

  it('GymLogoView is default-exported only (no named GymLogoView export)', () => {
    expect(logoSrc).toMatch(/export\s+default\s+GymLogoView/);
    expect(logoSrc).not.toMatch(/export\s+(?:function|const|class)\s+GymLogoView\b/);
    expect(logoSrc).not.toMatch(/export\s*\{\s*GymLogoView\s*\}/);
  });

  it('OnboardingGymPicker uses default import for GymLogoView', () => {
    // Named import {GymLogoView} → undefined at runtime → Render Error.
    expect(pickerSrc).toMatch(
      /import\s+GymLogoView\s+from\s+['"]@\/components\/ui\/GymLogoView['"]/,
    );
    expect(pickerSrc).not.toMatch(
      /import\s*\{\s*GymLogoView\s*\}\s*from\s+['"]@\/components\/ui\/GymLogoView['"]/,
    );
  });

  it('OnboardingGymPicker Icon uses default Ionicons import (working app pattern)', () => {
    expect(pickerSrc).toMatch(
      /import\s+Icon\s+from\s+['"]react-native-vector-icons\/Ionicons['"]/,
    );
  });

  it('barrel exports named OnboardingGymPicker and OnboardingPrimaryButton', () => {
    expect(barrelSrc).toContain(
      "export {OnboardingGymPicker} from './OnboardingGymPicker'",
    );
    expect(barrelSrc).toContain(
      "export {OnboardingPrimaryButton} from './OnboardingPrimaryButton'",
    );
    expect(buttonSrc).toMatch(/export\s+function\s+OnboardingPrimaryButton/);
    expect(pickerSrc).toMatch(/export\s+function\s+OnboardingGymPicker/);
  });

  it('picker custom (non-RN) JSX elements are only Icon + GymLogoView', () => {
    const rnBuiltIns = new Set([
      'View',
      'Text',
      'TextInput',
      'Pressable',
      'ScrollView',
      'Image',
      'FlatList',
      'ActivityIndicator',
    ]);
    const jsxTags = [
      ...pickerSrc.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g),
    ].map(m => m[1]);
    const custom = [...new Set(jsxTags.filter(t => !rnBuiltIns.has(t)))].sort();
    expect(custom).toEqual(['GymLogoView', 'Icon']);
  });
});
