-- Brugerens foretrukne centre (max 3, sorteret, ét primært)
create table if not exists public.user_centers (
  user_id uuid not null references auth.users (id) on delete cascade,
  center_id text not null,
  sort_order smallint not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, center_id),
  constraint user_centers_sort_order_range check (sort_order >= 0 and sort_order <= 2)
);

create index if not exists user_centers_user_sort_idx
  on public.user_centers (user_id, sort_order);

-- Kun én primær per bruger
create unique index if not exists user_centers_one_primary_per_user
  on public.user_centers (user_id)
  where is_primary;

alter table public.user_centers enable row level security;

drop policy if exists "user_centers_select_auth" on public.user_centers;
drop policy if exists "user_centers_insert_own" on public.user_centers;
drop policy if exists "user_centers_update_own" on public.user_centers;
drop policy if exists "user_centers_delete_own" on public.user_centers;

create policy "user_centers_select_auth"
  on public.user_centers for select
  to authenticated
  using (true);

create policy "user_centers_insert_own"
  on public.user_centers for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "user_centers_update_own"
  on public.user_centers for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_centers_delete_own"
  on public.user_centers for delete
  to authenticated
  using (auth.uid() = user_id);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_centers'
  ) then
    alter publication supabase_realtime add table public.user_centers;
  end if;
end $$;
