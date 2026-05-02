-- Reaktion på ven tjek ind: workout_reaction (én pr. afsender/check-in/modetager)

alter table public.notifications drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (type in (
    'friend_request',
    'friend_request_accepted',
    'friend_checked_in',
    'badge_unlocked',
    'streak_milestone',
    'badge_progress',
    'planned_workout_invite',
    'planned_workout_accepted',
    'planned_workout_declined',
    'planned_workout_reminder',
    'dm_message',
    'workout_reminder',
    'workout_reaction'
  ));

-- Én biceps-reaktion per (modtager af notifikation, tjek-ind, afsender)
create unique index if not exists notifications_dedupe_workout_reaction_biceps
  on public.notifications (user_id, (data->>'checkInId'), actor_user_id)
  where type = 'workout_reaction'
    and data->>'reaction' = 'biceps'
    and data->>'checkInId' is not null;

create or replace function public.send_workout_biceps_reaction(
  p_to_user_id uuid,
  p_check_in_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $f$
declare
  uid uuid := auth.uid();
  sender_name text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if uid = p_to_user_id then
    raise exception 'invalid_target';
  end if;
  if not public.are_friends(uid, p_to_user_id) then
    raise exception 'not_friends';
  end if;
  if not exists (
    select 1 from public.check_ins c
    where c.id = p_check_in_id
      and c.user_id = p_to_user_id
      and c.is_active = true
      and c.ended_at is null
  ) then
    raise exception 'no_active_check_in';
  end if;
  if exists (
    select 1 from public.notifications n
    where n.user_id = p_to_user_id
      and n.type = 'workout_reaction'
      and n.actor_user_id = uid
      and coalesce(n.data->>'reaction', '') = 'biceps'
      and n.data->>'checkInId' = p_check_in_id::text
  ) then
    return;
  end if;
  select coalesce(
    nullif(trim(p.display_name), ''),
    nullif(trim(p.username), ''),
    'En ven'
  )
  into sender_name
  from public.profiles p
  where p.id = uid;
  insert into public.notifications (user_id, actor_user_id, type, title, body, data)
  values (
    p_to_user_id,
    uid,
    'workout_reaction',
    format('%s giver dig biceps', sender_name),
    format('%s giver dig biceps på din træning 💪', sender_name),
    jsonb_build_object(
      'fromUserId', uid::text,
      'toUserId', p_to_user_id::text,
      'checkInId', p_check_in_id::text,
      'reaction', 'biceps'
    )
  );
end;
$f$;

revoke all on function public.send_workout_biceps_reaction(uuid, uuid) from public;
grant execute on function public.send_workout_biceps_reaction(uuid, uuid) to authenticated;

comment on function public.send_workout_biceps_reaction is
  'Opretter in-app (evt. push) notifikation til tjek-ind-bruger; idempotent.';
