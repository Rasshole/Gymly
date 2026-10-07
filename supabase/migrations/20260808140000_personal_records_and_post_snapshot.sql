-- Personal record events + optional structured snapshot on shared posts
-- Source of truth for lifts remains workout_exercises / workout_sets.

create table if not exists public.personal_record_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_session_id uuid not null references public.check_ins (id) on delete cascade,
  -- FKs to workout_exercises / workout_sets / exercise_library are added in
  -- 20260901120000, which creates those tables.
  workout_exercise_id uuid,
  set_id uuid,
  exercise_id uuid,
  exercise_name text not null,
  record_type text not null
    check (record_type in ('weight_pr', 'rep_pr')),
  weight_kg numeric(8, 2),
  reps integer,
  previous_weight_kg numeric(8, 2),
  previous_reps integer,
  created_at timestamptz not null default now()
);

create index if not exists personal_record_events_user_created_idx
  on public.personal_record_events (user_id, created_at desc);

create index if not exists personal_record_events_user_exercise_idx
  on public.personal_record_events (user_id, exercise_name, created_at desc);

create index if not exists personal_record_events_session_idx
  on public.personal_record_events (workout_session_id);

alter table public.personal_record_events enable row level security;

drop policy if exists "personal_record_events_select_own" on public.personal_record_events;
create policy "personal_record_events_select_own"
  on public.personal_record_events for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "personal_record_events_insert_own" on public.personal_record_events;
create policy "personal_record_events_insert_own"
  on public.personal_record_events for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "personal_record_events_delete_own" on public.personal_record_events;
create policy "personal_record_events_delete_own"
  on public.personal_record_events for delete
  to authenticated
  using (auth.uid() = user_id);

-- Shared workout snapshot on posts (intentional share payload; not private history)
alter table public.posts
  add column if not exists check_in_id uuid references public.check_ins (id) on delete set null,
  add column if not exists workout_snapshot jsonb;

create index if not exists posts_check_in_id_idx on public.posts (check_in_id);
