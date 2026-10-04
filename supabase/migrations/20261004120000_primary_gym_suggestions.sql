-- Opt-in suggestions for people who share a saved primary gym.
-- Default off for existing and new profiles. Does not expose check-ins or live presence.

alter table public.profiles
  add column if not exists discoverable_at_primary_gym boolean not null default false;

comment on column public.profiles.discoverable_at_primary_gym is
  'When true, other members with the same saved primary gym may see this profile in gym suggestions. Does not reveal training times.';

-- Saved primary center: user_centers (primary, else first) then profiles.favorite_gym_ids[1].
-- Not granted to clients; suggestion RPCs call it.
create or replace function public.primary_center_id(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select uc.center_id
      from public.user_centers uc
      where uc.user_id = p_user
      order by uc.is_primary desc, uc.sort_order asc
      limit 1
    ),
    (
      select p.favorite_gym_ids[1]
      from public.profiles p
      where p.id = p_user
        and cardinality(p.favorite_gym_ids) > 0
    )
  );
$$;

revoke all on function public.primary_center_id(uuid) from public;

create or replace function public.list_primary_gym_suggestions(p_center_id text)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  mine text;
  requested text := nullif(btrim(coalesce(p_center_id, '')), '');
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  mine := public.primary_center_id(me);
  -- A request for a center that is no longer this user's primary returns nothing.
  if mine is null or requested is null or mine <> requested then
    return;
  end if;

  return query
  select p.id, p.username, p.display_name, p.avatar_url
  from public.profiles p
  where p.id <> me
    and p.discoverable_at_primary_gym = true
    and public.primary_center_id(p.id) = mine
    and not exists (
      select 1
      from public.friendships f
      where f.user_a = least(me, p.id)
        and f.user_b = greatest(me, p.id)
    )
    and not public.users_are_blocked(me, p.id)
  order by lower(coalesce(p.display_name, '')), lower(coalesce(p.username, '')), p.id
  limit 10;
end;
$$;

revoke all on function public.list_primary_gym_suggestions(text) from public;
grant execute on function public.list_primary_gym_suggestions(text) to authenticated;

-- Owner-only. The argument is the new value; the row is always auth.uid().
create or replace function public.set_primary_gym_discoverable(p_visible boolean)
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
  if p_visible is null then
    raise exception 'invalid visibility';
  end if;
  update public.profiles
  set discoverable_at_primary_gym = p_visible,
      updated_at = now()
  where id = me;
end;
$$;

revoke all on function public.set_primary_gym_discoverable(boolean) from public;
grant execute on function public.set_primary_gym_discoverable(boolean) to authenticated;

create or replace function public.my_primary_gym_discoverable()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.discoverable_at_primary_gym
      from public.profiles p
      where p.id = auth.uid()
    ),
    false
  );
$$;

revoke all on function public.my_primary_gym_discoverable() from public;
grant execute on function public.my_primary_gym_discoverable() to authenticated;
