/**
 * @jest-environment node
 *
 * Static review checks for the email display-name backend migration.
 * Does not connect to production. Local DB verification is a separate ops step.
 */

import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260921120000_sanitize_email_display_names.sql',
);
const dryRunPath = path.join(
  root,
  'supabase/sql/sanitize_email_display_names_dry_run.sql',
);
const rollbackPath = path.join(
  root,
  'supabase/sql/sanitize_email_display_names_rollback.sql',
);
const rulesPath = path.join(
  root,
  'supabase/tests/sanitize_email_display_names_rules.sql',
);

describe('sanitize_email_display_names migration (static)', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  const dry = fs.readFileSync(dryRunPath, 'utf8');
  const rollback = fs.readFileSync(rollbackPath, 'utf8');
  const rules = fs.readFileSync(rulesPath, 'utf8');

  it('covers the public name columns including posts', () => {
    expect(sql).toContain('profiles');
    expect(sql).toContain('display_name');
    expect(sql).toContain('check_ins');
    expect(sql).toContain('user_display_name');
    expect(sql).toContain('workout_live_sessions');
    expect(sql).toContain('posts');
    expect(sql).toContain('author_display_name');
  });

  it('rewrites emails via triggers without RAISE on bad names', () => {
    expect(sql).toContain('trg_profiles_sanitize_display_name');
    expect(sql).toContain('trg_check_ins_sanitize_user_display_name');
    expect(sql).toContain('trg_workout_live_sanitize_user_display_name');
    expect(sql).toMatch(/do NOT raise/i);
    expect(sql.toLowerCase()).toContain('not abort');
  });

  it('never derives names from email local-part', () => {
    expect(sql.toLowerCase()).toContain('never derives');
    expect(sql).not.toMatch(/split_part\([^)]+@[^)]+,\s*1\)/);
  });

  it('uses empty string as schema-compatible missing name', () => {
    expect(sql).toContain("new.display_name := ''");
    expect(sql).toMatch(/return '';/);
  });

  it('keeps PII backup in gymly_ops and documents no Git export', () => {
    expect(sql).toContain('gymly_ops.display_name_email_cleanup_20260921');
    expect(sql).toMatch(/never dump old_value into Git/i);
    expect(rollback).toContain('gymly_ops.display_name_email_cleanup_20260921');
    expect(rollback).toMatch(/Never export/i);
  });

  it('dry-run is count-only and includes posts', () => {
    expect(dry).toMatch(/READ-ONLY/i);
    expect(dry).toContain('profiles_email_like_display_name');
    expect(dry).toContain('check_ins_email_like_user_display_name');
    expect(dry).toContain('workout_live_email_like_user_display_name');
    expect(dry).toContain('posts_email_like_author_display_name');
    expect(dry).toMatch(/Never SELECT the raw name values/i);
  });

  it('post-verify rules assert zero remaining emails', () => {
    expect(rules).toContain('zero_email_like_remaining');
    expect(rules).toContain('ops_backup_locked_down');
  });
});
