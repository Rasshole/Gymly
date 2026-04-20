-- Profiler (søgning) + venner + anmodninger
-- Kør i Supabase SQL Editor eller: supabase db push

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

create or replace function public.accept_friend_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fr record;
  a uuid;
  b uuid;
begin
  select id, from_user_id, to_user_id, status
  into fr
  from public.friend_requests
  where id = p_request_id
  for update;

  if fr.id is null then
    raise exception 'request not found';
  end if;

  if fr.to_user_id <> auth.uid() then
    raise exception 'not authorized';
  end if;

  if fr.status <> 'pending' then
    raise exception 'not pending';
  end if;

  update public.friend_requests
  set status = 'accepted'
  where id = p_request_id;

  if fr.from_user_id < fr.to_user_id then
    a := fr.from_user_id;
    b := fr.to_user_id;
  else
    a := fr.to_user_id;
    b := fr.from_user_id;
  end if;

  insert into public.friendships (user_a, user_b)
  values (a, b)
  on conflict do nothing;
end;
$$;

create or replace function public.decline_friend_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.friend_requests
  set status = 'declined'
  where id = p_request_id
    and to_user_id = auth.uid()
    and status = 'pending';
end;
$$;

grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.decline_friend_request(uuid) to authenticated;
