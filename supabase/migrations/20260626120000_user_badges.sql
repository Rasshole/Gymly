-- Per-user badge progress + unlock timestamps. Source of truth for cross-device + persistence.

create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  badge_id text not null,
  progress integer not null default 0,
  unlocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_badges_user_badge_key
  on public.user_badges (user_id, badge_id);

create index if not exists user_badges_user_id_idx
  on public.user_badges (user_id);

create or replace function public.user_badges_touch_updated_at()
returns trigger
language plpgsql
as $f$
begin
  new.updated_at = now();
  return new;
end;
$f$;

drop trigger if exists set_user_badges_updated_at on public.user_badges;
create trigger set_user_badges_updated_at
  before update on public.user_badges
  for each row
  execute function public.user_badges_touch_updated_at();

alter table public.user_badges enable row level security;

drop policy if exists "user_badges_select_own" on public.user_badges;
create policy "user_badges_select_own"
  on public.user_badges for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "user_badges_insert_own" on public.user_badges;
create policy "user_badges_insert_own"
  on public.user_badges for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "user_badges_update_own" on public.user_badges;
create policy "user_badges_update_own"
  on public.user_badges for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "user_badges_delete_own" on public.user_badges;
create policy "user_badges_delete_own"
  on public.user_badges for delete
  to authenticated
  using (user_id = (select auth.uid()));

do $r$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_badges'
  ) then
    alter publication supabase_realtime add table public.user_badges;
  end if;
exception when undefined_object then null;
end $r$;

do $r$ begin
  if to_regclass('public.user_badges') is not null then
    execute 'alter table public.user_badges replica identity full';
  end if;
end $r$;
