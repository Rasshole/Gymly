-- Globally unique usernames (case-insensitive), normalize to lowercase, gate forced rename.

alter table public.profiles
  add column if not exists username_requires_change boolean not null default false;

-- Resolve existing duplicates: keep oldest auth.users.created_at; rename others + force gate.
with ranked as (
  select
    p.id,
    lower(trim(p.username)) as lu,
    u.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
),
dup_groups as (
  select lu, array_agg(id order by created_at asc) as ids
  from ranked
  group by lu
  having count(*) > 1
),
victims as (
  select
    d.lu,
    t.uid as id,
    t.ord
  from dup_groups d,
  lateral unnest(d.ids) with ordinality as t(uid, ord)
  where t.ord > 1
)
update public.profiles p
set
  username = 'dup' || substr(replace(p.id::text, '-', ''), 1, 17),
  username_requires_change = true,
  updated_at = now()
from victims v
where p.id = v.id;

create or replace function public.profiles_normalize_username()
returns trigger
language plpgsql
security invoker
set search_path = public
as $f$
begin
  new.username := lower(trim(new.username));
  return new;
end;
$f$;

drop trigger if exists trg_profiles_normalize_username on public.profiles;
create trigger trg_profiles_normalize_username
  before insert or update of username on public.profiles
  for each row
  execute function public.profiles_normalize_username();

-- Availability check (onboarding = anon; edit = authenticated with exclude id).
create or replace function public.is_username_available(
  p_username text,
  p_exclude_user_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $q$
  select not exists (
    select 1
    from public.profiles p
    where lower(trim(p.username)) = lower(trim(p_username))
      and (p_exclude_user_id is null or p.id <> p_exclude_user_id)
  );
$q$;

revoke all on function public.is_username_available(text, uuid) from public;
grant execute on function public.is_username_available(text, uuid) to anon;
grant execute on function public.is_username_available(text, uuid) to authenticated;
