#!/usr/bin/env bash
# Isolated DB verification for say_hi_and_contact_status (synthetic data only).
# Does NOT reset or modify the main local postgres DB contents beyond creating
# a separate database gymly_say_hi_verify.
set -euo pipefail

CONTAINER="${1:-supabase_db_Gymly-1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATION="$ROOT/supabase/migrations/20260922120000_say_hi_and_contact_status.sql"
TEST_DB="gymly_say_hi_verify"
REPORT="/tmp/gymly_say_hi_verify_report.txt"

psqlc() {
  docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres "$@"
}

echo "=== Isolated say_hi verify on $CONTAINER / $TEST_DB ===" | tee "$REPORT"

psqlc -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$TEST_DB' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
psqlc -d postgres -c "DROP DATABASE IF EXISTS $TEST_DB;"
psqlc -d postgres -c "CREATE DATABASE $TEST_DB;"

echo "-- schema stub" | tee -a "$REPORT"
psqlc -d "$TEST_DB" <<'SQL'
create schema if not exists auth;
create table auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

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
  gym_name text,
  workout_type text,
  started_at timestamptz,
  ended_at timestamptz,
  is_active boolean not null default false,
  user_display_name text
);

create table public.friendships (
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  constraint friendships_ordered check (user_a < user_b)
);

create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references auth.users (id) on delete cascade,
  to_user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending'
);

create table public.dm_threads (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  last_message_at timestamptz,
  last_message_preview text,
  last_sender_id uuid,
  constraint dm_threads_ordered check (user_a < user_b),
  constraint dm_threads_unique_pair unique (user_a, user_b)
);

create table public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.dm_threads (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text,
  image_url text,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  type text not null,
  title text not null,
  body text not null,
  data jsonb default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
SQL

echo "-- apply migration" | tee -a "$REPORT"
psqlc -d "$TEST_DB" -f - < "$MIGRATION" >>"$REPORT" 2>&1

echo "-- run rules test" | tee -a "$REPORT"
psqlc -d "$TEST_DB" -f - < "$ROOT/supabase/tests/say_hi_and_contact_status_rules.sql" >>"$REPORT" 2>&1

echo "PASS isolated say_hi verify" | tee -a "$REPORT"
echo "Report: $REPORT"
