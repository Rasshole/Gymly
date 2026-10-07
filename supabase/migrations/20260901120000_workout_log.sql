-- Workout log (fase 1): øvelser + sæt knyttet til aktiv check_ins-session
-- session_id = check_ins.id

-- ---------------------------------------------------------------------------
-- Live social status på aktiv check-in (læses via eksisterende check_ins RLS)
-- ---------------------------------------------------------------------------
alter table public.check_ins
  add column if not exists live_exercise_name text,
  add column if not exists live_set_count integer,
  add column if not exists live_exercise_count integer;

-- Kun hvis tabellen findes i miljøet (ikke alle deployments har den)
do $$
begin
  if to_regclass('public.workout_live_sessions') is not null then
    alter table public.workout_live_sessions
      add column if not exists live_exercise_name text,
      add column if not exists live_set_count integer,
      add column if not exists live_exercise_count integer;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- exercise_library
-- ---------------------------------------------------------------------------
create table if not exists public.exercise_library (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  muscle_group text not null,
  tracking_type text not null default 'weight_reps'
    check (tracking_type in ('weight_reps', 'reps_only', 'duration', 'distance_duration')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (name, muscle_group)
);

create index if not exists exercise_library_muscle_idx
  on public.exercise_library (muscle_group, sort_order);

alter table public.exercise_library enable row level security;

drop policy if exists "exercise_library_select_authenticated" on public.exercise_library;
create policy "exercise_library_select_authenticated"
  on public.exercise_library for select
  to authenticated
  using (true);

-- Seed (idempotent via unique name+muscle_group)
insert into public.exercise_library (name, muscle_group, tracking_type, sort_order) values
  ('Bench Press', 'chest', 'weight_reps', 1),
  ('Incline Bench Press', 'chest', 'weight_reps', 2),
  ('Chest Press', 'chest', 'weight_reps', 3),
  ('Cable Fly', 'chest', 'weight_reps', 4),
  ('Push-Up', 'chest', 'reps_only', 5),
  ('Lat Pulldown', 'back', 'weight_reps', 1),
  ('Pull-Up', 'back', 'reps_only', 2),
  ('Barbell Row', 'back', 'weight_reps', 3),
  ('Seated Cable Row', 'back', 'weight_reps', 4),
  ('Dumbbell Row', 'back', 'weight_reps', 5),
  ('Squat', 'legs', 'weight_reps', 1),
  ('Leg Press', 'legs', 'weight_reps', 2),
  ('Romanian Deadlift', 'legs', 'weight_reps', 3),
  ('Leg Extension', 'legs', 'weight_reps', 4),
  ('Leg Curl', 'legs', 'weight_reps', 5),
  ('Calf Raise', 'legs', 'weight_reps', 6),
  ('Shoulder Press', 'shoulders', 'weight_reps', 1),
  ('Lateral Raise', 'shoulders', 'weight_reps', 2),
  ('Rear Delt Fly', 'shoulders', 'weight_reps', 3),
  ('Biceps Curl', 'arms', 'weight_reps', 1),
  ('Hammer Curl', 'arms', 'weight_reps', 2),
  ('Triceps Pushdown', 'arms', 'weight_reps', 3),
  ('Skull Crusher', 'arms', 'weight_reps', 4),
  ('Hip Thrust', 'glutes', 'weight_reps', 1),
  ('Bulgarian Split Squat', 'glutes', 'weight_reps', 2),
  ('Hip Abduction', 'glutes', 'weight_reps', 3),
  ('Plank', 'core', 'duration', 1),
  ('Cable Crunch', 'core', 'weight_reps', 2),
  ('Leg Raise', 'core', 'reps_only', 3),
  ('Running', 'cardio', 'distance_duration', 1),
  ('Cycling', 'cardio', 'distance_duration', 2),
  ('Stairmaster', 'cardio', 'duration', 3),
  ('Rowing', 'cardio', 'distance_duration', 4)
on conflict (name, muscle_group) do nothing;

-- ---------------------------------------------------------------------------
-- workout_exercises
-- ---------------------------------------------------------------------------
create table if not exists public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.check_ins (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid references public.exercise_library (id) on delete set null,
  exercise_name text not null,
  muscle_group text,
  tracking_type text not null default 'weight_reps',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workout_exercises_session_idx
  on public.workout_exercises (session_id, position);
create index if not exists workout_exercises_user_idx
  on public.workout_exercises (user_id, created_at desc);

alter table public.workout_exercises enable row level security;

drop policy if exists "workout_exercises_select_own" on public.workout_exercises;
create policy "workout_exercises_select_own"
  on public.workout_exercises for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "workout_exercises_insert_own" on public.workout_exercises;
create policy "workout_exercises_insert_own"
  on public.workout_exercises for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.check_ins c
      where c.id = session_id
        and c.user_id = auth.uid()
        and c.is_active = true
        and c.ended_at is null
    )
  );

drop policy if exists "workout_exercises_update_own" on public.workout_exercises;
create policy "workout_exercises_update_own"
  on public.workout_exercises for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "workout_exercises_delete_own" on public.workout_exercises;
create policy "workout_exercises_delete_own"
  on public.workout_exercises for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- workout_sets
-- ---------------------------------------------------------------------------
create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references public.workout_exercises (id) on delete cascade,
  session_id uuid not null references public.check_ins (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  set_number integer not null,
  weight_kg numeric(8, 2),
  reps integer,
  duration_seconds integer,
  distance_meters numeric(10, 2),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workout_exercise_id, set_number)
);

create index if not exists workout_sets_session_idx
  on public.workout_sets (session_id, created_at);
create index if not exists workout_sets_exercise_idx
  on public.workout_sets (workout_exercise_id, set_number);
create index if not exists workout_sets_user_idx
  on public.workout_sets (user_id, created_at desc);

alter table public.workout_sets enable row level security;

drop policy if exists "workout_sets_select_own" on public.workout_sets;
create policy "workout_sets_select_own"
  on public.workout_sets for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "workout_sets_insert_own" on public.workout_sets;
create policy "workout_sets_insert_own"
  on public.workout_sets for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.check_ins c
      where c.id = session_id
        and c.user_id = auth.uid()
        and c.is_active = true
        and c.ended_at is null
    )
    and exists (
      select 1 from public.workout_exercises we
      where we.id = workout_exercise_id
        and we.user_id = auth.uid()
        and we.session_id = session_id
    )
  );

drop policy if exists "workout_sets_update_own" on public.workout_sets;
create policy "workout_sets_update_own"
  on public.workout_sets for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "workout_sets_delete_own" on public.workout_sets;
create policy "workout_sets_delete_own"
  on public.workout_sets for delete
  to authenticated
  using (auth.uid() = user_id);

-- Friends/same-center can read live status via check_ins; optional read of
-- summary-only workout presence is already covered by check_ins live_* columns.

-- Realtime for live workout updates (own client + optimistic sync)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'workout_exercises'
  ) then
    alter publication supabase_realtime add table public.workout_exercises;
  end if;
exception when undefined_object then null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'workout_sets'
  ) then
    alter publication supabase_realtime add table public.workout_sets;
  end if;
exception when undefined_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Refresh live status on check_ins + workout_live_sessions after set changes
-- ---------------------------------------------------------------------------
create or replace function public.refresh_check_in_live_workout_status(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_exercise_name text;
  v_set_count integer;
  v_exercise_count integer;
begin
  select c.user_id into v_user_id
  from public.check_ins c
  where c.id = p_session_id;

  if v_user_id is null then
    return;
  end if;

  select count(*)::integer into v_exercise_count
  from public.workout_exercises we
  where we.session_id = p_session_id
    and exists (
      select 1 from public.workout_sets ws where ws.workout_exercise_id = we.id
    );

  select we.exercise_name,
         (select count(*)::integer from public.workout_sets ws where ws.workout_exercise_id = we.id)
  into v_exercise_name, v_set_count
  from public.workout_exercises we
  where we.session_id = p_session_id
    and exists (select 1 from public.workout_sets ws where ws.workout_exercise_id = we.id)
  order by we.updated_at desc nulls last, we.created_at desc
  limit 1;

  if v_exercise_count = 0 then
    v_exercise_name := null;
    v_set_count := null;
  end if;

  update public.check_ins
  set live_exercise_name = v_exercise_name,
      live_set_count = v_set_count,
      live_exercise_count = nullif(v_exercise_count, 0)
  where id = p_session_id;

  if to_regclass('public.workout_live_sessions') is not null then
    update public.workout_live_sessions
    set live_exercise_name = v_exercise_name,
        live_set_count = v_set_count,
        live_exercise_count = nullif(v_exercise_count, 0),
        updated_at = now()
    where user_id = v_user_id;
  end if;
end;
$$;

grant execute on function public.refresh_check_in_live_workout_status(uuid) to authenticated;

create or replace function public.trg_workout_sets_refresh_live_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sid uuid;
begin
  sid := coalesce(new.session_id, old.session_id);
  if sid is not null then
    perform public.refresh_check_in_live_workout_status(sid);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists workout_sets_refresh_live_status on public.workout_sets;
create trigger workout_sets_refresh_live_status
  after insert or update or delete on public.workout_sets
  for each row execute function public.trg_workout_sets_refresh_live_status();

create or replace function public.trg_workout_exercises_touch_updated()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists workout_exercises_touch_updated on public.workout_exercises;
create trigger workout_exercises_touch_updated
  before update on public.workout_exercises
  for each row execute function public.trg_workout_exercises_touch_updated();

-- Clear live status when check-in ends
create or replace function public.trg_check_ins_clear_live_workout_on_end()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (old.is_active = true and new.is_active = false)
     or (old.ended_at is null and new.ended_at is not null) then
    new.live_exercise_name := null;
    new.live_set_count := null;
    new.live_exercise_count := null;
  end if;
  return new;
end;
$$;

drop trigger if exists check_ins_clear_live_workout_on_end on public.check_ins;
create trigger check_ins_clear_live_workout_on_end
  before update on public.check_ins
  for each row execute function public.trg_check_ins_clear_live_workout_on_end();

-- personal_record_events is created earlier, before these tables exist.
do $$
begin
  if to_regclass('public.personal_record_events') is null then
    return;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'personal_record_events_workout_exercise_id_fkey'
  ) then
    alter table public.personal_record_events
      add constraint personal_record_events_workout_exercise_id_fkey
      foreign key (workout_exercise_id) references public.workout_exercises (id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'personal_record_events_set_id_fkey'
  ) then
    alter table public.personal_record_events
      add constraint personal_record_events_set_id_fkey
      foreign key (set_id) references public.workout_sets (id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'personal_record_events_exercise_id_fkey'
  ) then
    alter table public.personal_record_events
      add constraint personal_record_events_exercise_id_fkey
      foreign key (exercise_id) references public.exercise_library (id) on delete set null;
  end if;
end $$;
