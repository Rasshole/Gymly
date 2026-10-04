/**
 * @jest-environment node
 *
 * OnboardingGymPicker must pass TranslateFn into gymPickerLocationLine —
 * calling with only the gym object leaves `t` undefined and crashes at
 * formatGymCountryLabel(country, t) → t(key).
 */

import {gymPickerLocationLine, formatGymCountryLabel} from '@/utils/gymCountryLabel';

describe('OnboardingGymPicker gymPickerLocationLine contract', () => {
  const t = (key: string) => {
    if (key === 'countries.denmark') {
      return 'Denmark';
    }
    return key;
  };

  const gym = {
    city: 'Valby',
    region: 'Hovedstaden',
    country: 'Denmark',
  };

  it('renders location line when TranslateFn is provided', () => {
    const line = gymPickerLocationLine(gym, t);
    expect(line).toContain('Valby');
    expect(typeof line).toBe('string');
    expect(line.length).toBeGreaterThan(0);
  });

  it('formatGymCountryLabel requires a callable TranslateFn', () => {
    expect(formatGymCountryLabel('Denmark', t)).toBe('Denmark');
    expect(() =>
      formatGymCountryLabel('Denmark', undefined as unknown as typeof t),
    ).toThrow();
  });

  it('gymPickerLocationLine without t throws (the onboarding crash)', () => {
    expect(() =>
      // @ts-expect-error intentional wrong arity — mirrors the buggy call site
      gymPickerLocationLine(gym),
    ).toThrow();
  });
});
