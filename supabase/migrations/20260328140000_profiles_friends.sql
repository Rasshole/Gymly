-- Profiler (søgning) + venner + anmodninger
-- Kør i Supabase SQL Editor (hel fil, Run → Run and enable RLS) eller: supabase db push
-- RPC’er er LANGUAGE sql (én sætning), så dashboard-editoren ikke splitter på ';'.

-- Profiler (synkroniseres fra app ved login)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  display_name text not null default '',
  avatar_url text,
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_auth" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_select_auth"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Venskab (én række pr. par, user_a < user_b)
create table if not exists public.friendships (
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  constraint friendships_ordered check (user_a < user_b)
);

create index if not exists friendships_user_a_idx on public.friendships (user_a);
create index if not exists friendships_user_b_idx on public.friendships (user_b);

alter table public.friendships enable row level security;

drop policy if exists "friendships_select" on public.friendships;
create policy "friendships_select"
  on public.friendships for select
  to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b);

drop policy if exists "friendships_insert_members" on public.friendships;
create policy "friendships_insert_members"
  on public.friendships for insert
  to authenticated
  with check (auth.uid() = user_a or auth.uid() = user_b);

-- Anmodninger indsættes af afsender; accepteres via funktion
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references auth.users (id) on delete cascade,
  to_user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  constraint friend_requests_distinct check (from_user_id <> to_user_id)
);

create unique index if not exists friend_requests_pair_pending_idx
  on public.friend_requests (from_user_id, to_user_id)
  where status = 'pending';

create index if not exists friend_requests_to_pending_idx
  on public.friend_requests (to_user_id)
  where status = 'pending';

alter table public.friend_requests enable row level security;

drop policy if exists "fr_select" on public.friend_requests;
drop policy if exists "fr_insert" on public.friend_requests;
drop policy if exists "fr_update_recipient" on public.friend_requests;
drop policy if exists "fr_delete_sender" on public.friend_requests;

create policy "fr_select"
  on public.friend_requests for select
  to authenticated
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

create policy "fr_insert"
  on public.friend_requests for insert
  to authenticated
  with check (auth.uid() = from_user_id);

create policy "fr_update_recipient"
  on public.friend_requests for update
  to authenticated
  using (auth.uid() = to_user_id or auth.uid() = from_user_id);

create policy "fr_delete_sender"
  on public.friend_requests for delete
  to authenticated
  using (auth.uid() = from_user_id);

-- LANGUAGE sql + én sætning: Supabase SQL Editor splitter på ';' inde i PL/pgSQL.
-- security invoker: kører som den bruger der trykker Accept, så RLS (inkl. INSERT på friendships) matcher JWT.
-- Fejl (ikke fundet / ikke autoriseret / ikke pending) → division by zero så RPC fejler for klienten.
create or replace function public.accept_friend_request(p_request_id uuid)
returns void
language sql
security invoker
set search_path = public
as $sql$
with updated as (
  update public.friend_requests r
  set status = 'accepted'
  where r.id = p_request_id
    and r.to_user_id = auth.uid()
    and r.status = 'pending'
  returning r.from_user_id, r.to_user_id
),
ins as (
  insert into public.friendships (user_a, user_b)
  select
    least(u.from_user_id, u.to_user_id),
    greatest(u.from_user_id, u.to_user_id)
  from updated u
  on conflict do nothing
  returning 1
),
guard as (
  select
    exists (
      select 1
      from public.friend_requests
      where id = p_request_id
    ) as exists_id,
    exists (select 1 from updated) as did_update
)
select
  case
    when not guard.exists_id then 1 / 0
    when not guard.did_update then 1 / 0
    else coalesce((select 1 from ins limit 1), 1)
  end
from guard
$sql$;

create or replace function public.decline_friend_request(p_request_id uuid)
returns void
language sql
security invoker
set search_path = public
as $sql$
update public.friend_requests
set status = 'declined'
where id = p_request_id
  and to_user_id = auth.uid()
  and status = 'pending'
$sql$;

grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.decline_friend_request(uuid) to authenticated;
