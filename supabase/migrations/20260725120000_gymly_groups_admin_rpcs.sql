-- Admin RPCs for Groups MVP: delete group, remove member
-- Update of gymly_groups (name/description/image) already allowed via RLS for admins.

create or replace function public.gymly_is_group_admin(p_group uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $s$
  select exists (
    select 1 from public.gymly_group_members m
    where m.group_id = p_group
      and m.user_id = p_user
      and m.role = 'admin'
  );
$s$;

-- Slet gruppe (kun admin)
create or replace function public.gymly_delete_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $f$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.gymly_is_group_admin(p_group_id, uid) then
    raise exception 'forbidden';
  end if;
  delete from public.gymly_groups where id = p_group_id;
end;
$f$;
grant execute on function public.gymly_delete_group(uuid) to authenticated;

-- Fjern medlem (kun admin; kan ikke fjerne sig selv via denne RPC)
create or replace function public.gymly_remove_group_member(
  p_group_id uuid,
  p_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $f$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_member_id = uid then
    raise exception 'use_leave_group';
  end if;
  if not public.gymly_is_group_admin(p_group_id, uid) then
    raise exception 'forbidden';
  end if;
  if not public.gymly_is_group_member(p_group_id, p_member_id) then
    return;
  end if;
  -- Behold mindst én admin
  if public.gymly_is_group_admin(p_group_id, p_member_id) then
    if (
      select count(*)::int
      from public.gymly_group_members m
      where m.group_id = p_group_id and m.role = 'admin'
    ) <= 1 then
      raise exception 'last_admin';
    end if;
  end if;
  delete from public.gymly_group_members
  where group_id = p_group_id and user_id = p_member_id;
  delete from public.gymly_group_member_state
  where group_id = p_group_id and user_id = p_member_id;
end;
$f$;
grant execute on function public.gymly_remove_group_member(uuid, uuid) to authenticated;
