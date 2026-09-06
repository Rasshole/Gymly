/**
 * Checkpoint B — Invite 5 Friends migration + referral helper contracts.
 */

import fs from 'fs';
import path from 'path';
import {
  REFERRAL_APPLY_WINDOW_HOURS,
  REFERRAL_CAMPAIGN_ID,
  REFERRAL_FOUNDER_BADGE_ID,
  REFERRAL_INVITE_ORIGIN,
  REFERRAL_QUALIFIED_TARGET,
  SOCIAL_SQUAD_BADGE_ID,
  buildReferralInviteUrl,
  isWithinReferralApplyWindow,
  normalizeReferralCode,
  parseInviteCodeFromPath,
} from '@/services/referral/referralCodeUtils';

const MIGRATION = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260906140000_invite_five_friends_referral.sql',
);

describe('referralCodeUtils', () => {
  it('normalizes codes like SQL referral_normalize_code', () => {
    expect(normalizeReferralCode(' patrick-7x ')).toBe('PATRICK7X');
    expect(normalizeReferralCode('')).toBeNull();
    expect(normalizeReferralCode(null)).toBeNull();
  });

  it('builds canonical invite URLs under gymlyapp.com/invite/{code}', () => {
    expect(buildReferralInviteUrl('patrick7x')).toBe(
      `${REFERRAL_INVITE_ORIGIN}/invite/PATRICK7X`,
    );
  });

  it('parses invite codes from landing paths', () => {
    expect(parseInviteCodeFromPath('/invite/PATRICK7X')).toBe('PATRICK7X');
    expect(parseInviteCodeFromPath('/invite/patrick-7x?x=1')).toBe('PATRICK7X');
    expect(parseInviteCodeFromPath('/auth/callback')).toBeNull();
  });

  it('enforces the 24h apply window from createdAt', () => {
    const now = Date.parse('2026-09-06T12:00:00.000Z');
    expect(
      isWithinReferralApplyWindow('2026-09-06T01:00:00.000Z', now),
    ).toBe(true);
    expect(
      isWithinReferralApplyWindow('2026-09-04T11:00:00.000Z', now),
    ).toBe(false);
    expect(REFERRAL_APPLY_WINDOW_HOURS).toBe(24);
  });

  it('keeps Founding Crew separate from social_squad_5', () => {
    expect(REFERRAL_FOUNDER_BADGE_ID).toBe('referral_founder_5');
    expect(SOCIAL_SQUAD_BADGE_ID).toBe('social_squad_5');
    expect(REFERRAL_FOUNDER_BADGE_ID).not.toBe(SOCIAL_SQUAD_BADGE_ID);
    expect(REFERRAL_CAMPAIGN_ID).toBe('invite_five_founding');
    expect(REFERRAL_QUALIFIED_TARGET).toBe(5);
  });
});

describe('invite five friends migration contract', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8');

  it('creates referral tables and RLS with no authenticated writes', () => {
    expect(sql).toContain('create table if not exists public.referral_codes');
    expect(sql).toContain('create table if not exists public.referrals');
    expect(sql).toContain('create table if not exists public.referral_rewards');
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('No INSERT/UPDATE/DELETE policies');
    expect(sql).not.toMatch(
      /create policy "[^"]+"\s+on public\.referral_codes for insert/i,
    );
    expect(sql).not.toMatch(
      /create policy "[^"]+"\s+on public\.referrals for insert/i,
    );
    expect(sql).not.toMatch(
      /create policy "[^"]+"\s+on public\.referral_rewards for insert/i,
    );
  });

  it('exposes the required SECURITY DEFINER RPCs', () => {
    for (const name of [
      'get_or_create_my_referral_code',
      'apply_referral_code',
      'get_my_referral_progress',
      'qualify_referral_for_user',
      'try_unlock_invite_five_reward',
    ]) {
      expect(sql).toContain(`create or replace function public.${name}`);
      expect(sql).toMatch(
        new RegExp(`security definer\\s+set search_path = public[\\s\\S]*?${name}|${name}[\\s\\S]*?security definer`, 'i'),
      );
    }
    expect(sql).toContain('auth.users.created_at');
    expect(sql).toContain("interval '24 hours'");
  });

  it('awards referral_founder_5 only via server gate and keeps social_squad_5 separate', () => {
    expect(sql).toContain(`'${REFERRAL_FOUNDER_BADGE_ID}'`);
    expect(sql).toContain(SOCIAL_SQUAD_BADGE_ID);
    expect(sql).toContain('gymly.allow_referral_founder_badge');
    expect(sql).toContain('REFERRAL_FOUNDER_BADGE_SERVER_ONLY');
    expect(sql).toContain(`'${REFERRAL_CAMPAIGN_ID}'`);
  });

  it('qualifies from check-in completion without failing checkout', () => {
    expect(sql).toContain('trg_referral_on_check_in_completed');
    expect(sql).toContain('referral qualify skipped for check_in');
    expect(sql).toContain('workout_sets');
    expect(sql).toContain('duration_minutes');
    expect(sql).toContain('https://gymlyapp.com/invite/');
  });

  it('covers workout OR check-in readiness without a workout_sets trigger', () => {
    expect(sql).toMatch(/coalesce\(v_duration, 0\) < 5 and not v_has_sets/);
    expect(sql).toContain(
      'Workout log always requires an active check_in',
    );
    expect(sql).not.toMatch(
      /create trigger trg_referral_on_workout/i,
    );
    expect(sql).not.toMatch(/email_confirmed/i);
  });

  it('encodes self-referral, unique attribution, 24h window, and idempotency', () => {
    expect(sql).toContain('REFERRAL_SELF_NOT_ALLOWED');
    expect(sql).toContain('referrals_referred_id_key');
    expect(sql).toContain('on public.referrals (referred_id)');
    expect(sql).toContain('REFERRAL_APPLY_WINDOW_EXPIRED');
    expect(sql).toContain("interval '24 hours'");
    expect(sql).toContain('already_qualified');
    expect(sql).toContain("and r.status = 'attributed'");
    expect(sql).toContain(
      'on conflict on constraint referral_rewards_user_campaign_key do nothing',
    );
    expect(sql).toContain('REFERRAL_FOUNDER_BADGE_SERVER_ONLY');
  });
});
