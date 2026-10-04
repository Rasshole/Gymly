import {resolveSessionGymMeta} from '@/utils/sessionGymMeta';
import {formatWorkoutTypeDisplay} from '@/utils/muscleGroupLabels';
import {formatWorkoutDuration} from '@/utils/groupSessionFormat';

/**
 * Avoid loading PNG requires from gymLogoService in Jest.
 * Keep detectGymChain behaviour by re-implementing the SATS name check used in meta.
 */
jest.mock('@/services/gymLogoService', () => ({
  detectGymChain: (brand?: string, gymName?: string) => {
    const combined = `${brand || ''} ${gymName || ''}`.toLowerCase();
    if (/sats/.test(combined)) {
      return {chain: 'sats', displayName: 'SATS'};
    }
    return {
      chain: 'unknown',
      displayName: (gymName || 'Gymly').split(/\s+/)[0] || 'Gymly',
    };
  },
}));

describe('resolveSessionGymMeta', () => {
  it('infers SATS brand from gym name without gym_id', () => {
    const meta = resolveSessionGymMeta({
      gym_name: 'SATS — Blox',
      gym_id: null,
    });
    expect(meta.gymBrand).toBe('SATS');
    expect(meta.gymName).toContain('SATS');
  });

  it('infers SATS for FRB Falkoner style names', () => {
    const meta = resolveSessionGymMeta({
      gym_name: 'SATS — FRB - Falkoner',
    });
    expect(meta.gymBrand).toBe('SATS');
  });

  it('keeps unknown centers without inventing a chain brand', () => {
    const meta = resolveSessionGymMeta({
      gym_name: 'Local Garage Gym',
      gym_id: null,
    });
    expect(meta.gymBrand).toBeNull();
    expect(meta.gymName).toBe('Local Garage Gym');
  });
});

describe('friend history localization', () => {
  it('translates muscle tokens for English viewers', () => {
    expect(formatWorkoutTypeDisplay('biceps,ryg,triceps', 'en')).toBe(
      'Biceps, Back, Triceps',
    );
    expect(formatWorkoutTypeDisplay('Ryg, Triceps', 'en')).toBe('Back, Triceps');
  });

  it('keeps Danish muscle labels for Danish viewers', () => {
    expect(formatWorkoutTypeDisplay('biceps,ryg,triceps', 'da')).toBe(
      'Biceps, Ryg, Triceps',
    );
  });

  it('formats durations in viewer language', () => {
    expect(formatWorkoutDuration(216, 'en')).toBe('3 h 36 min');
    expect(formatWorkoutDuration(61, 'en')).toBe('1 h 1 min');
    expect(formatWorkoutDuration(216, 'da')).toBe('3 t 36 min');
  });
});
