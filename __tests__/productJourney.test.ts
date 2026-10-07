import fs from 'fs';
import path from 'path';
import {
  addCalendarDays,
  retentionWindowStatus,
} from '../src/services/productJourney/retentionWindow';

const sql = fs.readFileSync(
  path.join(__dirname, '../supabase/migrations/20261006120000_product_journey_events.sql'),
  'utf8',
);

describe('product journey tracking', () => {
  it('stores steps once and leaves out passwords, tokens and profile text', () => {
    expect(sql).toMatch(/on conflict \(dedupe_key\) do nothing/);
    expect(sql).toMatch(/'signup'/);
    expect(sql).toMatch(/'onboarding_completed'/);
    expect(sql).toMatch(/'first_activity'/);
    expect(sql).toMatch(/'returning_activity'/);
    expect(sql).toMatch(/user_id = auth\.uid\(\)/);
    expect(sql).not.toMatch(/password|access_token|refresh_token|email|display_name|phone/i);
  });

  it('does not treat the signup day as D1 or D7 retention', () => {
    const first = '2026-10-06';
    const sameDay = retentionWindowStatus(first, [first], first);
    expect(sameDay).toEqual({
      d1Due: false,
      d7Due: false,
      d1Returned: null,
      d7Returned: null,
    });
    expect(addCalendarDays(first, 1)).toBe('2026-10-07');
    expect(addCalendarDays(first, 7)).toBe('2026-10-13');
  });

  it('measures a return only on the following calendar days', () => {
    const first = '2026-10-06';
    const missed = retentionWindowStatus(first, [first], '2026-10-07');
    expect(missed.d1Due).toBe(true);
    expect(missed.d1Returned).toBe(false);
    expect(missed.d7Due).toBe(false);
    expect(missed.d7Returned).toBeNull();

    const returned = retentionWindowStatus(
      first,
      [first, '2026-10-07', '2026-10-13'],
      '2026-10-13',
    );
    expect(returned.d1Returned).toBe(true);
    expect(returned.d7Due).toBe(true);
    expect(returned.d7Returned).toBe(true);
  });
});
