-- Igangværende træningssessioner: én række per bruger mens app-session kører (heartbeat). Fjernes når de afslutter.
-- Tælling pr. center til kort: kun brugere med frisk updated_at.

create table if not exists public.workout_live_sessions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  gym_id text not null,
  gym_name text not null,
  city text,
  workout_type text,
  user_display_name text not null default '',
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workout_live_sessions_gym_id_idx
  on public.workout_live_sessions (gym_id);
create index if not exists workout_live_sessions_updated_idx
  on public.workout_live_sessions (updated_at desc);

alter table public.workout_live_sessions enable row level security;

drop policy if exists "workout_live_select_own_or_friends" on public.workout_live_sessions;
create policy "workout_live_select_own_or_friends"
  on public.workout_live_sessions for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.friendships f
      where (f.user_a = auth.uid() and f.user_b = workout_live_sessions.user_id)
         or (f.user_b = auth.uid() and f.user_a = workout_live_sessions.user_id)
    )
  );

drop policy if exists "workout_live_upsert_own" on public.workout_live_sessions;
create policy "workout_live_upsert_own"
  on public.workout_live_sessions for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "workout_live_update_own" on public.workout_live_sessions;
create policy "workout_live_update_own"
  on public.workout_live_sessions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "workout_live_delete_own" on public.workout_live_sessions;
create policy "workout_live_delete_own"
  on public.workout_live_sessions for delete
  to authenticated
  using (auth.uid() = user_id);

-- Offentlig aggregering til kort (alle der er i live session lige nu = frisk updated_at)
create or replace function public.gym_live_session_counts(p_stale_mins int default 4)
returns table (gym_id text, user_count bigint)
language sql
security definer
set search_path = public
as $$
  select l.gym_id::text, count(*)::bigint
  from public.workout_live_sessions l
  where l.updated_at > now() - (p_stale_mins * interval '1 minute')
  group by l.gym_id
$$;

grant execute on function public.gym_live_session_counts(integer) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'workout_live_sessions'
  ) then
    alter publication supabase_realtime add table public.workout_live_sessions;
  end if;
exception
  when undefined_object then
    null;
end $$;
