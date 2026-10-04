/**
 * @jest-environment node
 *
 * Onboarding gym picker V3 — Nearby/Suggestions via pickBrowseGyms,
 * no permission request, one-tap contracts.
 */

import fs from 'fs';
import path from 'path';
import {pickBrowseGyms, pickGlobalBrowseFallback} from '@/utils/pickBrowseGyms';
import type {DanishGym} from '@/data/danishGyms';

const ROOT = path.join(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function stubGym(partial: Partial<DanishGym> & {id: string}): DanishGym {
  return {
    id: partial.id,
    name: partial.name ?? partial.id,
    city: partial.city ?? 'City',
    address: partial.address ?? 'Street 1',
    postalCode: partial.postalCode ?? '1000',
    country: partial.country ?? 'Denmark',
    region: partial.region ?? 'Hovedstaden',
    latitude: partial.latitude ?? 55.67,
    longitude: partial.longitude ?? 12.56,
    brand: partial.brand ?? 'Test',
  };
}

describe('OnboardingGymPicker V3 contracts', () => {
  const picker = read('src/components/onboarding/OnboardingGymPicker.tsx');
  const register = read('src/screens/auth/RegisterScreen.tsx');

  it('uses default GymLogoView import (prior crash fix)', () => {
    expect(picker).toMatch(
      /import\s+GymLogoView\s+from\s+['"]@\/components\/ui\/GymLogoView['"]/,
    );
    expect(picker).not.toMatch(
      /import\s*\{\s*GymLogoView\s*\}\s*from/,
    );
  });

  it('passes TranslateFn into gymPickerLocationLine fallback path', () => {
    expect(picker).toMatch(/gymPickerLocationLine\(gym,\s*t\)/);
  });

  it('uses pickBrowseGyms + useOptionalUserCoords (no permission request)', () => {
    expect(picker).toMatch(/pickBrowseGyms/);
    expect(picker).toMatch(/browseCountryForLanguage\(language\)/);
    expect(picker).toMatch(/useOptionalUserCoords/);
    expect(picker).not.toMatch(/requestLocationPermission/);
    expect(picker).not.toMatch(/requestBackgroundLocation/);
    expect(picker).toContain('INITIAL_LIST_CAP = 4');
  });

  it('labels Nearby only with location; Centre/Gyms without', () => {
    expect(picker).toMatch(/register\.gymNearby/);
    expect(picker).toMatch(/register\.gymList/);
    expect(picker).not.toMatch(/register\.gymSuggestions/);
    expect(picker).not.toMatch(/register\.gymPopular/);
    expect(picker).not.toMatch(/Popular gyms/);
    expect(picker).not.toMatch(/POPULAR_ONBOARDING/);
  });

  it('does not put lineHeight on the gym search TextInput', () => {
    const block = picker.slice(
      picker.indexOf('searchInput:'),
      picker.indexOf('listTitle:'),
    );
    expect(block).not.toMatch(/lineHeight/);
    expect(block).not.toMatch(/\.\.\.typography\.body/);
    expect(block).toMatch(/alignSelf:\s*'stretch'/);
    expect(picker).toMatch(/minHeight:\s*48/);
  });

  it('has no radio circles / Continue button on gym step', () => {
    expect(picker).not.toMatch(/styles\.check\b/);
    expect(picker).not.toMatch(/checkOn/);
    expect(register).not.toMatch(/v2GymSub/);
    // Gym step must not render OnboardingPrimaryButton Continue
    const gymBlock = register.slice(
      register.indexOf('const renderGym'),
      register.indexOf('return (', register.indexOf('const renderGym')),
    );
    expect(gymBlock).not.toMatch(/OnboardingPrimaryButton/);
    expect(gymBlock).toMatch(/skipForNow/);
    expect(gymBlock).toMatch(/handleGymPicked/);
  });

  it('one-tap persists before Home; double-submit guarded', () => {
    expect(register).toMatch(/handleGymPicked/);
    expect(register).toMatch(/if \(isSubmitting\)/);
    expect(register).toMatch(/setIsSubmitting\(true\)/);
    // finishToHome only via complete* after await
    expect(register).toMatch(/await completePostAuth\(gymIds\)/);
    expect(register).toMatch(/await completeEmailRegistration\(gymIds\)/);
  });

  it('pickBrowseGyms: nearest when location; non-empty fallback without', () => {
    const gyms = [
      stubGym({id: 'far', latitude: 56.2, longitude: 10.2, country: 'Denmark'}),
      stubGym({id: 'near', latitude: 55.68, longitude: 12.57, country: 'Denmark'}),
      stubGym({id: 'se', latitude: 59.3, longitude: 18.0, country: 'Sweden'}),
      stubGym({id: 'no', latitude: 59.9, longitude: 10.7, country: 'Norway'}),
    ];
    const withLoc = pickBrowseGyms({
      gyms,
      userLocation: {latitude: 55.67, longitude: 12.56},
      cap: 4,
    });
    expect(withLoc[0].id).toBe('near');

    const noLoc = pickBrowseGyms({gyms, userLocation: null, cap: 4});
    expect(noLoc.length).toBe(4);
    // Country round-robin — first four include multiple countries, not DK-first dump
    const countries = new Set(noLoc.map(g => g.country));
    expect(countries.size).toBeGreaterThan(1);

    const fallback = pickGlobalBrowseFallback(gyms, new Set(), 3);
    expect(fallback).toHaveLength(3);
  });
});
