/**
 * @jest-environment node
 */

import {
  isOpenToSayHi,
  normalizeContactStatus,
  sharedMuscleGroups,
  validateSayHiMessage,
  SAY_HI_MAX_CHARS,
} from '@/utils/contactStatus';

describe('contactStatus', () => {
  it('treats missing status as not open (safe fallback)', () => {
    expect(normalizeContactStatus(null)).toBeNull();
    expect(normalizeContactStatus(undefined)).toBeNull();
    expect(normalizeContactStatus('')).toBeNull();
    expect(normalizeContactStatus('maybe')).toBeNull();
    expect(isOpenToSayHi(null)).toBe(false);
    expect(isOpenToSayHi('focused')).toBe(false);
    expect(isOpenToSayHi('open')).toBe(true);
  });

  it('finds shared muscle groups from real session strings', () => {
    expect(sharedMuscleGroups('ben,skulder', 'ben,cardio')).toEqual(['ben']);
    expect(sharedMuscleGroups('Chest', 'chest')).toEqual(['chest']);
    expect(sharedMuscleGroups('ryg', 'ben')).toEqual([]);
  });

  it('validates say-hi message length', () => {
    expect(validateSayHiMessage('').ok).toBe(false);
    expect(validateSayHiMessage('Hey').ok).toBe(true);
    expect(validateSayHiMessage('x'.repeat(SAY_HI_MAX_CHARS + 1)).error).toBe(
      'too_long',
    );
  });
});
