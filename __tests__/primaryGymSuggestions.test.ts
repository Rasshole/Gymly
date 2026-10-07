import {
  gymSuggestPhase,
  mergeGymSuggestionRows,
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

describe('mergeGymSuggestionRows', () => {
  const row = (
    id: string,
    status: string,
    incomingRequestId?: string,
  ) => ({id, status, incomingRequestId});

  it('hides friends and blocks and keeps an outgoing request', () => {
    const rows = [
      row('friend', 'none'),
      row('blocked', 'none'),
      row('sent', 'pending_sent'),
      row('open', 'none'),
    ];
    const merged = mergeGymSuggestionRows(
      rows,
      new Map([['sent', 'req-in']]),
      new Set(['friend', 'blocked']),
    );
    expect(merged.map(item => item.id)).toEqual(['sent', 'open']);
    expect(merged[0].status).toBe('pending_sent');
  });

  it('attaches an incoming request without clearing one already on the row', () => {
    const rows = [
      row('incoming', 'none'),
      row('known', 'pending_received', 'req-1'),
    ];
    const merged = mergeGymSuggestionRows(
      rows,
      new Map([['incoming', 'req-2']]),
      new Set(),
    );
    expect(merged[0]).toMatchObject({
      status: 'pending_received',
      incomingRequestId: 'req-2',
    });
    expect(merged[1]).toBe(rows[1]);
  });

  it('returns the same list when nothing changes', () => {
    const rows = [row('open', 'none')];
    expect(mergeGymSuggestionRows(rows, new Map(), new Set())).toBe(rows);
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
    const centerFn = sql.slice(
      sql.indexOf('function public.primary_center_id'),
      sql.indexOf('revoke all on function public.primary_center_id'),
    );
    expect(centerFn).not.toMatch(/favorite_gym_ids/);
    expect(centerFn).toMatch(/from public\.user_centers uc/);
    expect(sql).toMatch(
      /revoke all on function public\.primary_center_id\(uuid\) from public, anon, authenticated, service_role/,
    );
    expect(sql).toMatch(/order by lower\(coalesce\(p\.display_name, ''\)\)/);
    expect(sql).not.toMatch(/check_ins/);
  });

  it('returns only the fields the list renders', () => {
    expect(sql).toMatch(
      /returns table \(\s*id uuid,\s*username text,\s*display_name text,\s*avatar_url text\s*\)/,
    );
  });
});
