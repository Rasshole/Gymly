import {
  formatWorkoutDuration,
  formatGroupDurationLabel,
} from '@/utils/groupSessionFormat';

describe('formatWorkoutDuration', () => {
  it('formats 0 and under 60 minutes', () => {
    expect(formatWorkoutDuration(0)).toBe('0 min');
    expect(formatWorkoutDuration(24)).toBe('24 min');
    expect(formatWorkoutDuration(45)).toBe('45 min');
    expect(formatWorkoutDuration(59)).toBe('59 min');
  });

  it('formats exact hours without a zero-minute tail', () => {
    expect(formatWorkoutDuration(60)).toBe('1 t');
    expect(formatWorkoutDuration(120)).toBe('2 t');
    expect(formatWorkoutDuration(240)).toBe('4 t');
    expect(formatWorkoutDuration(240, 'en')).toBe('4 h');
    expect(formatWorkoutDuration(120, 'en')).toBe('2 h');
  });

  it('formats hours and minutes', () => {
    expect(formatWorkoutDuration(75)).toBe('1 t 15 min');
    expect(formatWorkoutDuration(116)).toBe('1 t 56 min');
    expect(formatWorkoutDuration(166)).toBe('2 t 46 min');
    expect(formatWorkoutDuration(185)).toBe('3 t 5 min');
    expect(formatWorkoutDuration(4329)).toBe('72 t 9 min');
    expect(formatWorkoutDuration(116, 'en')).toBe('1 h 56 min');
  });

  it('handles non-finite input', () => {
    expect(formatWorkoutDuration(Number.NaN)).toBe('0 min');
  });
});

describe('formatGroupDurationLabel', () => {
  it('converts seconds via minutes formatter', () => {
    expect(formatGroupDurationLabel(45 * 60)).toBe('45 min');
    expect(formatGroupDurationLabel((2 * 60 + 35) * 60)).toBe('2 t 35 min');
  });
});
