-- Check-ins (erstatter Firestore `checkins` for builds uden native Firebase)
-- Kør i Supabase SQL Editor eller: supabase db push

create table if not exists public.check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  gym_id text not null,
  gym_name text not null,
  city text,
  workout_type text,
  note text,
  user_display_name text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists check_ins_user_created_idx
  on public.check_ins (user_id, created_at desc);
create index if not exists check_ins_created_idx
  on public.check_ins (created_at desc);

alter table public.check_ins enable row level security;

drop policy if exists "check_ins_select_own" on public.check_ins;
drop policy if exists "check_ins_insert_own" on public.check_ins;

create policy "check_ins_select_own"
  on public.check_ins for select
  to authenticated
  using (auth.uid() = user_id);

create policy "check_ins_insert_own"
  on public.check_ins for insert
  to authenticated
  with check (auth.uid() = user_id);
