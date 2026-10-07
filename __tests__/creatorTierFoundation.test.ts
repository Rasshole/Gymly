import fs from 'fs';
import path from 'path';
import {
  shouldShowCreatorIdentityBadge,
  SURFACE_CREATOR_IDENTITY_BADGES,
} from '../src/config/creatorTierSurface';

const sql = fs.readFileSync(
  path.join(__dirname, '../supabase/migrations/20261006150000_creator_tier_foundation.sql'),
  'utf8',
);

describe('creator tier foundation', () => {
  it('keeps public badges off until an identity is approved', () => {
    expect(SURFACE_CREATOR_IDENTITY_BADGES).toBe(false);
    expect(shouldShowCreatorIdentityBadge('pending')).toBe(false);
    expect(shouldShowCreatorIdentityBadge('rejected')).toBe(false);
    expect(shouldShowCreatorIdentityBadge(null)).toBe(false);
    expect(shouldShowCreatorIdentityBadge('approved')).toBe(false);
  });

  it('reuses qualified referrals and blocks client writes', () => {
    expect(sql).toMatch(/status = 'qualified'/);
    expect(sql).toMatch(/referral_account_is_eligible/);
    expect(sql).not.toMatch(/duration_minutes|workout_sets/);
    expect(sql).toMatch(/CREATOR_TIER_WRITE_FORBIDDEN/);
    expect(sql).toMatch(/CREATOR_TIER_FORBIDDEN/);
    expect(sql).toMatch(/status = 'approved'/);
    expect(sql).toMatch(/grant select on public\.creator_public_identities to anon, authenticated, service_role/);
    expect(sql).toMatch(/revoke all on table public\.creator_identities from public, anon, authenticated/);
    expect(sql).toMatch(/Does not charge or create a subscription/);
    expect(sql).toMatch(/provisional_qa/);
    expect(sql).toMatch(/Provisional local QA configuration/);
    const workspace = fs.readFileSync(
      path.join(__dirname, '../supabase/migrations/20261006180000_creator_workspace.sql'),
      'utf8',
    );
    expect(workspace).toMatch(/provisional_qa/);
    expect(workspace).toMatch(/add_administrator', false/);
    expect(workspace).toMatch(/get_my_creator_tier_status\(\)/);
    expect(workspace).toMatch(/gymly_is_group_admin/);
    expect(workspace).toMatch(/schema_migrations/);
    expect(workspace).not.toMatch(/display_name|check_ins/);
    expect(workspace).toMatch(/CREATOR_WORKSPACE_WRITE_FORBIDDEN/);
  });
});
