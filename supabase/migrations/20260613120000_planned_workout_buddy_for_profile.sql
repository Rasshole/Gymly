-- Partner til "Med: ..." på profil, uden at genåbne RLS på planned_workout_participants for ikke-deltagere.
create or replace function public.get_planned_workout_buddy_id_for_profile(
  p_profile_user_id uuid,
  p_planned_workout_id uuid
) returns uuid
language plpgsql
stable
security definer
set search_path = public
as $f$
declare
  buddy uuid;
begin
  if p_planned_workout_id is null then
    return null;
  end if;
  if auth.uid() is null then
    return null;
  end if;
  if auth.uid() is distinct from p_profile_user_id
     and not public.are_friends(auth.uid(), p_profile_user_id) then
    return null;
  end if;
  select p.user_id into buddy
  from public.planned_workout_participants p
  where p.planned_workout_id = p_planned_workout_id
    and p.user_id is distinct from p_profile_user_id
  limit 1;
  return buddy;
end;
$f$;

revoke all on function public.get_planned_workout_buddy_id_for_profile(uuid, uuid) from public;
grant execute on function public.get_planned_workout_buddy_id_for_profile(uuid, uuid) to authenticated;
