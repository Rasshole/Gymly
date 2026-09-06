const mockStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockStore.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStore.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      mockStore.delete(key);
    }),
    clear: jest.fn(async () => {
      mockStore.clear();
    }),
  },
}));

jest.mock('@/services/supabase/supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(async () => ({
        data: {user: {id: 'user-test-1'}},
        error: null,
      })),
    },
  },
}));

import {
  createCustomExercise,
  loadCustomExercises,
} from '@/services/supabase/customExerciseService';

describe('custom exercises persistence', () => {
  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
  });

  it('creates and reloads a custom exercise for the user', async () => {
    const created = await createCustomExercise({
      name: 'My Cable Something',
      muscleGroup: 'back',
      equipment: 'cable',
    });
    expect(created.isCustom).toBe(true);
    expect(created.id.startsWith('custom-')).toBe(true);

    const loaded = await loadCustomExercises('user-test-1');
    expect(loaded.some(e => e.name === 'My Cable Something')).toBe(true);
  });

  it('does not duplicate same name for the same user', async () => {
    await createCustomExercise({
      name: 'Unique Press',
      muscleGroup: 'chest',
      equipment: 'machine',
    });
    await createCustomExercise({
      name: 'unique press',
      muscleGroup: 'chest',
      equipment: 'machine',
    });
    const loaded = await loadCustomExercises('user-test-1');
    expect(
      loaded.filter(e => e.name.toLowerCase() === 'unique press'),
    ).toHaveLength(1);
  });
});
