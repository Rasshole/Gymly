import {mapPostRowToFeedItem} from '../src/services/supabase/workoutPostService';
import type {WorkoutPostRow} from '../src/types/post.types';

jest.mock('../src/services/supabase/supabaseClient', () => ({
  supabase: {},
}));

jest.mock('../src/i18n/runtimeLanguage', () => ({
  getRuntimeLanguage: () => 'da',
}));

jest.mock('../src/utils/formatRelativeTime', () => ({
  formatRelativeTime: () => 'lige nu',
}));

jest.mock('../src/services/gymLogoService', () => ({
  detectGymChain: () => ({displayName: 'SATS'}),
}));

jest.mock('../src/utils/gymDisplay', () => ({
  formatGymNameWithBrand: (name: string) => name,
}));

jest.mock('../src/utils/avatar', () => ({
  withAvatarCacheBust: (url: string | null) => url,
}));

function baseRow(overrides: Partial<WorkoutPostRow> = {}): WorkoutPostRow {
  return {
    id: 'post-1',
    user_id: 'user-1',
    image_url: '',
    caption: 'Felt strong',
    workout_duration: 48,
    center_name: 'SATS FRB',
    workout_type: 'Chest',
    mood_rating: 5,
    author_display_name: 'Patrick',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('mapPostRowToFeedItem composition', () => {
  test('PR + image keeps photoUri and snapshot together', () => {
    const item = mapPostRowToFeedItem(
      baseRow({
        image_url: 'https://cdn.example/photo.jpg',
        workout_snapshot: {
          sessionId: 's1',
          exerciseCount: 6,
          setCount: 18,
          totalVolumeKg: 5840,
          durationMinutes: 48,
          exercises: [],
          prs: [
            {
              recordType: 'weight_pr',
              exerciseName: 'Bench Press',
              weightKg: 110,
              reps: 4,
            },
          ],
        },
      }),
    );

    expect(item.photoUri).toBe('https://cdn.example/photo.jpg');
    expect(item.workoutSnapshot?.prs).toHaveLength(1);
    expect(item.description).toBe('Felt strong');
    // Media wins type hint, PR remains on snapshot
    expect(item.type).toBe('photo');
    expect(item.prInfo).toContain('Bench Press');
  });

  test('PR without image still exposes snapshot', () => {
    const item = mapPostRowToFeedItem(
      baseRow({
        image_url: '',
        workout_snapshot: {
          sessionId: 's1',
          exerciseCount: 2,
          setCount: 4,
          totalVolumeKg: 1000,
          durationMinutes: 30,
          exercises: [],
          prs: [
            {
              recordType: 'rep_pr',
              exerciseName: 'Curl',
              weightKg: 20,
              reps: 15,
            },
          ],
        },
      }),
    );
    expect(item.photoUri).toBeUndefined();
    expect(item.type).toBe('pr');
    expect(item.workoutSnapshot?.prs[0].exerciseName).toBe('Curl');
  });

  test('image without PR stays photo', () => {
    const item = mapPostRowToFeedItem(
      baseRow({
        image_url: 'https://cdn.example/x.jpg',
        workout_snapshot: {
          sessionId: 's1',
          exerciseCount: 3,
          setCount: 9,
          totalVolumeKg: 2000,
          durationMinutes: 40,
          exercises: [],
          prs: [],
        },
      }),
    );
    expect(item.type).toBe('photo');
    expect(item.photoUri).toBeTruthy();
    expect(item.prInfo).toBeUndefined();
  });
});
