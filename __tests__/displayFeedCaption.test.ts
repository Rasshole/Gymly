import {displayFeedCaption, buildWorkoutInfoLine} from '@/utils/workoutPostLocalization';

describe('displayFeedCaption', () => {
  it('drops automatic finished-workout lines so the name is not repeated', () => {
    expect(displayFeedCaption('Stef finished a workout 💪', 'da')).toBe('');
    expect(displayFeedCaption('Magnus afsluttede en træning 💪', 'en')).toBe('');
  });

  it('keeps the user\'s own text', () => {
    expect(displayFeedCaption('Ben i dag', 'da')).toBe('Ben i dag');
    expect(displayFeedCaption('Sauna efterfølgende og en lang note om hvordan benene føltes efter de tunge sæt i dag', 'da')).toContain('Sauna');
  });

  it('rewrites a PR line in the viewer language without the name', () => {
    expect(displayFeedCaption('Stef slog sin bænkpres PR 🔥', 'en')).toBe(
      'Beat their bænkpres PR 🔥',
    );
  });
});

describe('buildWorkoutInfoLine', () => {
  it('does not leave a raw minute count in the feed line', () => {
    const line = buildWorkoutInfoLine({
      centerLabel: 'SATS — Valby',
      durationMinutes: 240,
      workoutTypeStored: 'ben',
      language: 'da',
    });
    expect(line).toBe('SATS — Valby · 4 t · Ben');
    expect(line).not.toContain('240 min');
  });
});
