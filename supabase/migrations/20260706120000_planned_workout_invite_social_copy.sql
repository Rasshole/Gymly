-- Venlig, social invitationstekst (én linje + valgfri note)

create or replace function public.create_planned_workout_invite(
  p_invitee_id uuid,
  p_center_id text,
  p_center_name text,
  p_scheduled_at timestamptz,
  p_training_types text[],
  p_note text,
  p_thread_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $f$
declare
  uid uuid := auth.uid();
  pw_id uuid;
  inviter_name text;
  body_text text;
  note_clean text;
  training_phrase text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_invitee_id = uid then
    raise exception 'cannot_invite_self';
  end if;
  if not public.are_friends(uid, p_invitee_id) then
    raise exception 'not_friends';
  end if;

  note_clean := nullif(trim(coalesce(p_note, '')), '');

  insert into public.planned_workouts (
    creator_user_id, center_id, center_name, scheduled_at, training_types, note, status, thread_id
  )
  values (
    uid, p_center_id, p_center_name, p_scheduled_at,
    coalesce(p_training_types, '{}'),
    note_clean,
    'active',
    p_thread_id
  )
  returning id into pw_id;

  insert into public.planned_workout_participants (planned_workout_id, user_id, role, response_status, responded_at)
  values (pw_id, uid, 'creator', 'accepted', now());

  insert into public.planned_workout_participants (planned_workout_id, user_id, role, response_status)
  values (pw_id, p_invitee_id, 'invitee', 'pending');

  select coalesce(nullif(trim(display_name), ''), nullif(trim(username), ''), 'Nogen')
  into inviter_name from public.profiles where id = uid;

  training_phrase := case
    when p_training_types is null or coalesce(array_length(p_training_types, 1), 0) = 0 then 'træning'
    when array_length(p_training_types, 1) = 1 then initcap(p_training_types[1]) || ' træning'
    else initcap(p_training_types[1]) || ' m.m.'
  end;

  body_text :=
    inviter_name
    || ' inviterede dig til '
    || training_phrase
    || ' i '
    || coalesce(nullif(trim(p_center_name), ''), 'centeret')
    || ' kl. '
    || to_char(p_scheduled_at at time zone 'Europe/Copenhagen', 'HH24:MI')
    || ' 💪';

  if note_clean is not null then
    body_text := body_text || E'\n' || note_clean;
  end if;

  insert into public.notifications (user_id, actor_user_id, type, title, body, data)
  values (
    p_invitee_id,
    uid,
    'planned_workout_invite',
    inviter_name || ' inviterede dig',
    body_text,
    jsonb_build_object(
      'plannedWorkoutId', pw_id::text,
      'inviterUserId', uid::text,
      'centerId', p_center_id,
      'centerName', p_center_name,
      'scheduledAt', p_scheduled_at::text,
      'trainingTypes', to_jsonb(coalesce(p_training_types, '{}')),
      'threadId', case
        when p_thread_id is null then null
        else p_thread_id::text
      end
    )
  );

  if p_thread_id is not null then
    insert into public.dm_messages (thread_id, sender_id, body)
    values (
      p_thread_id,
      uid,
      '[GYM_PLAN_INVITE]' || (
        jsonb_build_object(
          'plannedWorkoutId', pw_id::text,
          'centerName', p_center_name,
          'scheduledAt', p_scheduled_at::text,
          'trainingTypes', to_jsonb(coalesce(p_training_types, '{}')),
          'status', 'pending'
        )::text
      )
    );
  end if;

  return pw_id;
end;
$f$;

grant execute on function public.create_planned_workout_invite(uuid, text, text, timestamptz, text[], text, uuid) to authenticated;

comment on function public.create_planned_workout_invite is 'Opretter plan + deltager + notifikation med social, kort invitationstekst.';
