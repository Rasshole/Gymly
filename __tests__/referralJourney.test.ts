/**
 * Referral journey helpers: release stays off, Danish plural, funnel SQL.
 */

import fs from 'fs';
import path from 'path';
import {createPluralTranslator} from '@/i18n/translate';
import da from '@/i18n/translations/da';
import en from '@/i18n/translations/en';
import {INVITE_5_FRIENDS_ENABLED} from '@/config/launchSurfaceConfig';
import {isInviteFiveFriendsSurfaceEnabled} from '@/services/referral/inviteSurface';

const root = path.join(__dirname, '..');

describe('referral journey gates', () => {
  it('keeps the release flag off and hides the surface outside local QA', () => {
    expect(INVITE_5_FRIENDS_ENABLED).toBe(false);
    expect(isInviteFiveFriendsSurfaceEnabled()).toBe(false);
  });

  it('uses singular Danish for one friend request', () => {
    const tp = createPluralTranslator(
      da as unknown as Record<string, unknown>,
      en as unknown as Record<string, unknown>,
      'da',
    );
    expect(tp('friendsScreen.friendRequestsCount', 1)).toBe('1 venneanmodning');
    expect(tp('friendsScreen.friendRequestsCount', 2)).toBe('2 venneanmodninger');
    expect(tp('inviteFive.funnelAccountsUsed', 0)).toBe('Konti der har brugt koden');
    expect(da.inviteFive.funnelRules).toContain('24 timer');
    expect(da.inviteFive.funnelRules).toContain('nuværende regler');
  });

  it('keeps apply idempotent and does not treat opens as active', () => {
    const sql = fs.readFileSync(
      path.join(root, 'supabase/migrations/20261005193000_referral_funnel_idempotent_apply.sql'),
      'utf8',
    );
    expect(sql).toContain("interval '24 hours'");
    expect(sql).toContain('REFERRAL_SELF_NOT_ALLOWED');
    expect(sql).toContain('REFERRAL_ALREADY_ATTRIBUTED');
    expect(sql).toContain("'idempotent', true");
    expect(sql).toContain('and r.status = \'attributed\'');
    expect(sql).toContain('Never creates a referral and never qualifies one');
    expect(sql).not.toContain('referral_qualify_bypass');
    expect(sql).not.toContain('greatest(coalesce(v_code.invite_open_count');
    expect(sql).toContain('revoke all on function public.qualify_referral_for_user(uuid, text) from public, anon, authenticated, service_role');
    expect(sql).toContain('grant execute on function public.qualify_referral_for_user(uuid, text) to postgres');
    expect(sql).not.toMatch(/grant execute on function public\.qualify_referral_for_user\(uuid, text\) to (?!postgres)/);
    expect(da.inviteFive.founderDesc).toBe(
      '5 venner har brugt koden og gennemført deres første kvalificerende aktivitet.',
    );
    expect(en.inviteFive.founderDesc).toBe(
      '5 friends used the code and completed their first qualifying activity.',
    );
    expect(da.inviteFive.progressLabel).toContain('kvalificeret');
    expect(en.inviteFive.progressLabel).toContain('qualified');
    expect(sql).toContain('revoke all on function public.referral_qualify_recorded(uuid, text) from public, anon, authenticated, service_role');
    expect(sql).toContain('invited_count');
    expect(sql).toContain('signed_up_count');
    expect(sql).toContain('onboarded_count');
    expect(sql).toContain('qualified_count');
  });

  it('does not treat placeholder usernames as finished onboarding', () => {
    const sql = fs.readFileSync(
      path.join(
        root,
        'supabase/migrations/20261005213000_referral_placeholder_username_not_onboarded.sql',
      ),
      'utf8',
    );
    expect(sql).toContain("'gymly_user', 'appleuser', 'googleuser'");
    expect(sql).toContain('username_requires_change');
    expect(sql).toContain("'^u_[a-f0-9]{8,}$'");
  });

  it('has one file per migration version, including the renamed user_centers migration', () => {
    const dir = path.join(root, 'supabase/migrations');
    const versions = fs
      .readdirSync(dir)
      .filter(name => name.endsWith('.sql'))
      .map(name => name.split('_')[0]);
    const dupes = versions.filter((version, index) => versions.indexOf(version) !== index);
    expect(dupes).toEqual([]);
    expect(versions.filter(version => version === '20260716120000')).toHaveLength(1);
    expect(versions.filter(version => version === '20260716120100')).toHaveLength(1);
  });
});
