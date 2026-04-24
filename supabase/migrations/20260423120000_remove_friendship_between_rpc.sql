-- Atomar fjernelse af venskab: korrekt par (user_a, user_b) uden klient-uuid-sortering,
-- plus oprydning i friend_requests. Kører som definer, så resultatet er pålideligt.
create or replace function public.remove_friendship_between(p_other uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  me uuid := auth.uid();
  a  uuid;
  b  uuid;
begin
  if me is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if p_other is null or p_other = me then
    raise exception 'invalid' using errcode = 'P0001';
  end if;
  a := least(me, p_other);
  b := greatest(me, p_other);
  delete from public.friendships f
  where f.user_a = a and f.user_b = b;
  delete from public.friend_requests fr
  where (fr.from_user_id = me and fr.to_user_id = p_other)
     or (fr.from_user_id = p_other and fr.to_user_id = me);
end;
$fn$;

revoke all on function public.remove_friendship_between(uuid) from public;
grant execute on function public.remove_friendship_between(uuid) to authenticated;
