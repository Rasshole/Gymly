import {
  gymSuggestPhase,
  shouldCommitGymSuggestions,
} from '@/utils/primaryGymSuggestions';
import fs from 'fs';
import path from 'path';

describe('gym suggestion commit', () => {
  it('keeps only the latest response for the current primary center', () => {
    expect(shouldCommitGymSuggestions(2, 'gym-a', 2, 'gym-a')).toBe(true);
    expect(shouldCommitGymSuggestions(1, 'gym-a', 2, 'gym-b')).toBe(false);
    expect(shouldCommitGymSuggestions(2, 'gym-a', 2, 'gym-b')).toBe(false);
    expect(shouldCommitGymSuggestions(1, 'gym-a', 2, 'gym-a')).toBe(false);
  });
});

describe('gymSuggestPhase', () => {
  it('separates loading, error, no gym, empty, and a list', () => {
    expect(
      gymSuggestPhase({
        centerKnown: false,
        centerId: null,
        loading: true,
        error: false,
        count: 0,
      }),
    ).toBe('loading');
    expect(
      gymSuggestPhase({
        centerKnown: false,
        centerId: null,
        loading: false,
        error: true,
        count: 0,
      }),
    ).toBe('error');
    expect(
      gymSuggestPhase({
        centerKnown: true,
        centerId: null,
        loading: false,
        error: false,
        count: 0,
      }),
    ).toBe('noGym');
    expect(
      gymSuggestPhase({
        centerKnown: true,
        centerId: 'gym-a',
        loading: false,
        error: false,
        count: 0,
      }),
    ).toBe('empty');
    expect(
      gymSuggestPhase({
        centerKnown: true,
        centerId: 'gym-a',
        loading: false,
        error: true,
        count: 0,
      }),
    ).toBe('error');
    expect(
      gymSuggestPhase({
        centerKnown: true,
        centerId: 'gym-a',
        loading: true,
        error: false,
        count: 2,
      }),
    ).toBe('ready');
  });
});

describe('primary gym suggestion migration', () => {
  const sql = fs.readFileSync(
    path.join(
      __dirname,
      '../supabase/migrations/20261004120000_primary_gym_suggestions.sql',
    ),
    'utf8',
  );

  it('defaults the opt-in off and only lets the signed-in user change it', () => {
    expect(sql).toMatch(
      /discoverable_at_primary_gym boolean not null default false/,
    );
    expect(sql).toMatch(/where id = me/);
    expect(sql).not.toMatch(/p_user_id/);
  });

  it('filters on the server by center, visibility, self, friends, and blocks', () => {
    expect(sql).toMatch(/discoverable_at_primary_gym = true/);
    expect(sql).toMatch(/primary_center_id\(p\.id\) = mine/);
    expect(sql).toMatch(/p\.id <> me/);
    expect(sql).toMatch(/users_are_blocked\(me, p\.id\)/);
    expect(sql).toMatch(/friendships/);
    expect(sql).toMatch(/limit 10/);
    expect(sql).toMatch(/order by lower\(coalesce\(p\.display_name, ''\)\)/);
    expect(sql).not.toMatch(/check_ins/);
  });

  it('returns only the fields the list renders', () => {
    expect(sql).toMatch(
      /returns table \(\s*id uuid,\s*username text,\s*display_name text,\s*avatar_url text\s*\)/,
    );
  });
});
