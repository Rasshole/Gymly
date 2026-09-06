/**
 * Production audit tests — Share Workout duration, units, privacy, capture.
 */

import {
  formatShareDuration,
  formatShareVolumeKg,
  resolveShareWorkoutDurationMinutes,
} from '@/utils/shareWorkoutFormat';
import {
  canShareWorkoutFromFeedPost,
  shareWorkoutGymLabel,
} from '@/utils/shareWorkoutPrivacy';
import {
  shareCanvasBackgroundColor,
  shareCaptureDimensions,
  sharePreviewUsesCheckerboard,
} from '@/utils/shareWorkoutCapture';
import {SHARE_EXPORT_FORMATS} from '@/types/shareWorkout.types';

describe('resolveShareWorkoutDurationMinutes', () => {
  const started = '2026-08-13T10:00:00.000Z';
  const ended84m = '2026-08-13T11:24:00.000Z';

  it('prefers persisted duration_minutes when valid', () => {
    expect(
      resolveShareWorkoutDurationMinutes({
        durationMinutesStored: 78,
        startedAt: started,
        endedAt: ended84m,
      }),
    ).toBe(78);
  });

  it('falls back to started_at/ended_at when stored duration missing', () => {
    expect(
      resolveShareWorkoutDurationMinutes({
        durationMinutesStored: null,
        startedAt: started,
        endedAt: ended84m,
      }),
    ).toBe(84);
  });

  it('falls back to timestamps when stored duration is zero', () => {
    expect(
      resolveShareWorkoutDurationMinutes({
        durationMinutesStored: 0,
        startedAt: started,
        endedAt: ended84m,
      }),
    ).toBe(84);
  });

  it('returns null when timestamps are invalid', () => {
    expect(
      resolveShareWorkoutDurationMinutes({
        durationMinutesStored: null,
        startedAt: started,
        endedAt: started,
      }),
    ).toBeNull();
  });

  it('returns null when timestamps are missing', () => {
    expect(
      resolveShareWorkoutDurationMinutes({
        durationMinutesStored: null,
        startedAt: null,
        endedAt: null,
      }),
    ).toBeNull();
  });
});

describe('formatShareDuration', () => {
  it('returns null for invalid duration', () => {
    expect(formatShareDuration(null)).toBeNull();
    expect(formatShareDuration(0)).toBeNull();
    expect(formatShareDuration(NaN)).toBeNull();
  });
});

describe('formatShareVolumeKg units', () => {
  it('formats metric volume with locale separators', () => {
    expect(formatShareVolumeKg(8420, 'en')).toBe('8,420 kg');
    expect(formatShareVolumeKg(8420, 'da')).toMatch(/8\.420 kg|8,420 kg/);
  });

  it('formats imperial volume when unit param is lb', () => {
    expect(formatShareVolumeKg(100, 'en', undefined, 'lb')).toBe('220 lb');
  });

  it('hides invalid or zero volume', () => {
    expect(formatShareVolumeKg(0, 'en')).toBeNull();
    expect(formatShareVolumeKg(-5, 'en')).toBeNull();
    expect(formatShareVolumeKg(NaN, 'en')).toBeNull();
  });

  it('documents kg-only production default — no persisted user unit preference exists', () => {
    // SettingsScreen units toggle is local state only; share cards default to kg.
    expect(formatShareVolumeKg(5000, 'en')).toContain('kg');
    expect(formatShareVolumeKg(5000, 'en')).not.toContain('lb');
  });
});

describe('shareWorkoutPrivacy', () => {
  it('allows share only for own posts with checkInId', () => {
    expect(
      canShareWorkoutFromFeedPost({isOwn: true, checkInId: 'session-1'}),
    ).toBe(true);
    expect(
      canShareWorkoutFromFeedPost({isOwn: false, checkInId: 'session-1'}),
    ).toBe(false);
    expect(canShareWorkoutFromFeedPost({isOwn: true, checkInId: ''})).toBe(false);
    expect(canShareWorkoutFromFeedPost({isOwn: true, checkInId: null})).toBe(
      false,
    );
  });

  it('hides gym by default and exports name only when enabled', () => {
    expect(shareWorkoutGymLabel('PureGym Vanløse', false)).toBeNull();
    expect(shareWorkoutGymLabel('PureGym Vanløse', true)).toBe(
      'PureGym Vanløse',
    );
  });
});

describe('shareWorkoutCapture invariants', () => {
  it('captures at 1080x1920 story pixels', () => {
    expect(shareCaptureDimensions()).toEqual({
      width: 1080,
      height: 1920,
    });
    expect(SHARE_EXPORT_FORMATS.stories.width).toBe(1080);
    expect(SHARE_EXPORT_FORMATS.stories.height).toBe(1920);
  });

  it('uses transparent canvas for transparent exports', () => {
    expect(shareCanvasBackgroundColor('transparent')).toBe('transparent');
  });

  it('uses checkerboard only in transparent preview mode', () => {
    expect(sharePreviewUsesCheckerboard('transparent')).toBe(true);
    expect(sharePreviewUsesCheckerboard('white')).toBe(false);
    expect(sharePreviewUsesCheckerboard('purple')).toBe(false);
    expect(sharePreviewUsesCheckerboard('photo')).toBe(false);
  });
});
