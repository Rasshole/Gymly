#!/usr/bin/env bash
# Isolated DB verification for sanitize_email_display_names (synthetic data only).
# Does NOT reset or modify the main local `postgres` database contents beyond creating
# a separate database `gymly_sanitize_verify` (dropped/recreated for this run).
set -euo pipefail

CONTAINER="${1:-supabase_db_Gymly-1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATION="$ROOT/supabase/migrations/20260921120000_sanitize_email_display_names.sql"
TEST_DB="gymly_sanitize_verify"
REPORT="/tmp/gymly_sanitize_verify_report.txt"

psqlc() {
  docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres "$@"
}

echo "=== Isolated sanitize verify on $CONTAINER / $TEST_DB ===" | tee "$REPORT"

# Recreate only the isolated test DB (not postgres)
psqlc -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$TEST_DB' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
psqlc -d postgres -c "DROP DATABASE IF EXISTS $TEST_DB;"
psqlc -d postgres -c "CREATE DATABASE $TEST_DB;"

echo "-- schema stub" | tee -a "$REPORT"
psqlc -d "$TEST_DB" <<'SQL'
create schema if not exists auth;
create table auth.users (id uuid primary key, email text);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  display_name text not null default '',
  avatar_url text,
  updated_at timestamptz not null default now()
);

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  gym_id text not null,
  gym_name text not null,
  user_display_name text not null default '',
  created_at timestamptz not null default now(),
  is_active boolean default true,
  ended_at timestamptz,
  started_at timestamptz default now()
);

create table public.workout_live_sessions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  gym_id text not null,
  gym_name text not null,
  user_display_name text not null default '',
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  image_url text not null default '',
  caption text not null default '',
  workout_duration int not null default 30,
  center_name text not null default 'Test',
  workout_type text not null default 'cardio',
  author_display_name text not null default '',
  created_at timestamptz not null default now()
);

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
SQL

echo "-- apply migration" | tee -a "$REPORT"
psqlc -d "$TEST_DB" < "$MIGRATION" 2>&1 | tee -a "$REPORT"

echo "-- seed + assertions" | tee -a "$REPORT"
psqlc -d "$TEST_DB" <<'SQL' | tee -a "$REPORT"
-- Synthetic users (no real PII)
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'alpha@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'beta@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'gamma@example.test');

-- Disable triggers briefly to plant email-like legacy rows, then re-enable
alter table public.profiles disable trigger trg_profiles_sanitize_display_name;
alter table public.check_ins disable trigger trg_check_ins_sanitize_user_display_name;
alter table public.workout_live_sessions disable trigger trg_workout_live_sanitize_user_display_name;
alter table public.posts disable trigger trg_posts_sanitize_author_display_name;

insert into public.profiles (id, username, display_name) values
  ('11111111-1111-4111-8111-111111111111', 'sofie_h', 'Sofie Hansen'),
  ('22222222-2222-4222-8222-222222222222', 'u_22222222222222', 'legacy@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'u_33333333333333', '');

insert into public.check_ins (user_id, gym_id, gym_name, user_display_name, is_active) values
  ('11111111-1111-4111-8111-111111111111', 'g1', 'Gym', 'Sofie Hansen', true),
  ('22222222-2222-4222-8222-222222222222', 'g1', 'Gym', 'legacy@example.test', true),
  ('33333333-3333-4333-8333-333333333333', 'g1', 'Gym', 'ghost@example.test', true);

insert into public.workout_live_sessions (user_id, gym_id, gym_name, user_display_name) values
  ('11111111-1111-4111-8111-111111111111', 'g1', 'Gym', 'Sofie Hansen'),
  ('22222222-2222-4222-8222-222222222222', 'g1', 'Gym', 'legacy@example.test');

insert into public.posts (user_id, author_display_name) values
  ('11111111-1111-4111-8111-111111111111', 'Sofie Hansen'),
  ('22222222-2222-4222-8222-222222222222', 'legacy@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'relay@privaterelay.appleid.com');

alter table public.profiles enable trigger trg_profiles_sanitize_display_name;
alter table public.check_ins enable trigger trg_check_ins_sanitize_user_display_name;
alter table public.workout_live_sessions enable trigger trg_workout_live_sanitize_user_display_name;
alter table public.posts enable trigger trg_posts_sanitize_author_display_name;

-- Re-run cleanup path by invoking the same email updates (migration cleanup already ran on empty tables).
-- Simulate post-migration cleanup against planted rows:
update public.profiles p
set display_name = '', updated_at = now()
where public.is_email_like_display_name(p.display_name);

update public.check_ins c
set user_display_name = coalesce(nullif(public.resolved_profile_public_display_name(c.user_id), ''), '')
where public.is_email_like_display_name(c.user_display_name);

update public.workout_live_sessions l
set user_display_name = coalesce(nullif(public.resolved_profile_public_display_name(l.user_id), ''), '')
where public.is_email_like_display_name(l.user_display_name);

update public.posts p
set author_display_name = coalesce(nullif(public.resolved_profile_public_display_name(p.user_id), ''), '')
where public.is_email_like_display_name(p.author_display_name);

-- Assertions (counts / booleans only)
select 'valid_name_preserved' as check,
  (select display_name from public.profiles where id = '11111111-1111-4111-8111-111111111111') = 'Sofie Hansen' as ok;

select 'profile_email_cleared' as check,
  (select display_name from public.profiles where id = '22222222-2222-4222-8222-222222222222') = '' as ok;

select 'empty_name_allowed' as check,
  (select display_name from public.profiles where id = '33333333-3333-4333-8333-333333333333') = '' as ok;

select 'check_in_email_cleared_or_substituted' as check,
  not exists (
    select 1 from public.check_ins where public.is_email_like_display_name(user_display_name)
  ) as ok;

select 'check_in_with_profile_gets_sofie' as check,
  (select user_display_name from public.check_ins
   where user_id = '11111111-1111-4111-8111-111111111111' limit 1) = 'Sofie Hansen' as ok;

select 'live_and_posts_no_email' as check,
  not exists (select 1 from public.workout_live_sessions where public.is_email_like_display_name(user_display_name))
  and not exists (select 1 from public.posts where public.is_email_like_display_name(author_display_name)) as ok;

-- Old client write: email must be rewritten without failing the insert
insert into public.check_ins (user_id, gym_id, gym_name, user_display_name)
values ('11111111-1111-4111-8111-111111111111', 'g2', 'Gym2', 'oldclient@example.test');

select 'old_client_checkin_rewritten' as check,
  (select user_display_name from public.check_ins where gym_id = 'g2') = 'Sofie Hansen' as ok;

insert into public.posts (user_id, author_display_name)
values ('22222222-2222-4222-8222-222222222222', 'oldclient@example.test');

select 'old_client_post_rewritten_empty' as check,
  (select author_display_name from public.posts
   where user_id = '22222222-2222-4222-8222-222222222222'
   order by created_at desc limit 1) = '' as ok;

-- RPC helper
select 'display_name_for_user_filters' as check,
  public.display_name_for_user('11111111-1111-4111-8111-111111111111') = 'Sofie Hansen'
  and public.display_name_for_user('22222222-2222-4222-8222-222222222222') = 'User' as ok;

-- gymly_ops locked from anon/authenticated/service_role
select 'ops_backup_locked' as check,
  not has_table_privilege('anon', 'gymly_ops.display_name_email_cleanup_20260921', 'select')
  and not has_table_privilege('authenticated', 'gymly_ops.display_name_email_cleanup_20260921', 'select')
  and not has_table_privilege('service_role', 'gymly_ops.display_name_email_cleanup_20260921', 'select') as ok;

-- Conditional rollback must not clobber user edit after cleanup
update public.profiles
set display_name = 'Ny Sofie'
where id = '11111111-1111-4111-8111-111111111111';

-- Plant a fake backup row claiming we cleaned Sofie→'' (should NOT restore over Ny Sofie)
insert into gymly_ops.display_name_email_cleanup_20260921
  (source_table, row_pk, column_name, old_value, new_value)
values ('profiles', '11111111-1111-4111-8111-111111111111', 'display_name', 'x@example.test', '');

alter table public.profiles disable trigger trg_profiles_sanitize_display_name;
update public.profiles p
set display_name = b.old_value
from gymly_ops.display_name_email_cleanup_20260921 b
where b.source_table = 'profiles'
  and p.id = b.row_pk::uuid
  and p.display_name is not distinct from b.new_value
  and b.row_pk = '11111111-1111-4111-8111-111111111111';
alter table public.profiles enable trigger trg_profiles_sanitize_display_name;

select 'rollback_skips_user_edited_name' as check,
  (select display_name from public.profiles where id = '11111111-1111-4111-8111-111111111111') = 'Ny Sofie' as ok;

select 'zero_email_like_remaining' as check,
  not exists (select 1 from public.profiles where public.is_email_like_display_name(display_name))
  and not exists (select 1 from public.check_ins where public.is_email_like_display_name(user_display_name))
  and not exists (select 1 from public.workout_live_sessions where public.is_email_like_display_name(user_display_name))
  and not exists (select 1 from public.posts where public.is_email_like_display_name(author_display_name)) as ok;
SQL

echo "=== DONE report: $REPORT ===" | tee -a "$REPORT"
