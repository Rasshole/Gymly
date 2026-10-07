-- One-way profile follows. Separate from friendships.
-- A user can read only the rows where they are the follower.
-- There is no follower-list or follower-count API.

create table if not exists public.profile_follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  followed_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  constraint profile_follows_no_self check (follower_id <> followed_id)
);

create index if not exists profile_follows_followed_idx
  on public.profile_follows (followed_id);

alter table public.profile_follows enable row level security;

drop policy if exists "profile_follows_select_own" on public.profile_follows;
create policy "profile_follows_select_own"
  on public.profile_follows for select
  to authenticated
  using (follower_id = auth.uid());

revoke all on table public.profile_follows from public, anon, authenticated, service_role;
grant select on table public.profile_follows to authenticated;
grant select, insert, delete on table public.profile_follows to postgres, service_role;

create or replace function public.follow_profile(p_followed uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  if p_followed is null or p_followed = me then
    raise exception 'follow_self';
  end if;
  if public.users_are_blocked(me, p_followed)
     or not exists (select 1 from public.profiles p where p.id = p_followed) then
    raise exception 'follow_unavailable';
  end if;
  insert into public.profile_follows (follower_id, followed_id)
  values (me, p_followed)
  on conflict (follower_id, followed_id) do nothing;
end;
$$;

create or replace function public.unfollow_profile(p_followed uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  if p_followed is null or p_followed = me then
    raise exception 'follow_self';
  end if;
  delete from public.profile_follows
  where follower_id = me
    and followed_id = p_followed;
end;
$$;

revoke all on function public.follow_profile(uuid) from public, anon, authenticated, service_role;
revoke all on function public.unfollow_profile(uuid) from public, anon, authenticated, service_role;
grant execute on function public.follow_profile(uuid) to postgres, authenticated, service_role;
grant execute on function public.unfollow_profile(uuid) to postgres, authenticated, service_role;

create or replace function public.profile_follows_clear_on_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.profile_follows pf
  where (pf.follower_id = new.blocker_id and pf.followed_id = new.blocked_id)
     or (pf.follower_id = new.blocked_id and pf.followed_id = new.blocker_id);
  return new;
end;
$$;

revoke all on function public.profile_follows_clear_on_block() from public, anon, authenticated, service_role;
grant execute on function public.profile_follows_clear_on_block() to postgres;

drop trigger if exists trg_profile_follows_clear_on_block on public.user_blocks;
create trigger trg_profile_follows_clear_on_block
  after insert on public.user_blocks
  for each row
  execute function public.profile_follows_clear_on_block();
