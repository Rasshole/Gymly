-- planned_workout_invite: titel matcher social kopi (💪 på titellinjen)

create or replace function public.create_planned_session(
  p_center_id text,
  p_center_name text,
  p_scheduled_at timestamptz,
  p_training_types text[],
  p_note text,
  p_invitee_ids uuid[],
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
  note_clean text;
  invite_title text;
  invite_body text;
  inv uuid;
  clean_ids uuid[];
  new_part_id uuid;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  note_clean := nullif(trim(coalesce(p_note, '')), '');

  clean_ids := coalesce(
    (
      select array_agg(distinct u)
      from unnest(coalesce(p_invitee_ids, '{}'::uuid[])) as u
      where u is not null and u <> uid
    ),
    '{}'::uuid[]
  );

  if clean_ids is not null and cardinality(clean_ids) > 0 then
    foreach inv in array clean_ids
    loop
      if not public.are_friends(uid, inv) then
        raise exception 'not_friends';
      end if;
    end loop;
  end if;

  insert into public.planned_workouts (
    creator_user_id, center_id, center_name, scheduled_at, training_types, note, status, thread_id, reminder_sent_at
  )
  values (
    uid, p_center_id, p_center_name, p_scheduled_at,
    coalesce(p_training_types, '{}'),
    note_clean,
    'active',
    p_thread_id,
    null
  )
  returning id into pw_id;

  insert into public.planned_workout_participants (planned_workout_id, user_id, role, response_status, responded_at)
  values (pw_id, uid, 'creator', 'accepted', now());

  select coalesce(nullif(trim(display_name), ''), nullif(trim(username), ''), 'Nogen')
  into inviter_name from public.profiles where id = uid;

  invite_title := inviter_name || ' inviterede dig til træning 💪';
  invite_body := public._planned_invite_notification_body(
    coalesce(p_training_types, '{}'),
    p_center_name,
    p_scheduled_at
  );

  if clean_ids is not null and cardinality(clean_ids) > 0 then
    foreach inv in array clean_ids
    loop
      new_part_id := null;
      insert into public.planned_workout_participants (
        planned_workout_id, user_id, role, response_status
      )
      values (pw_id, inv, 'invitee', 'pending')
      on conflict (planned_workout_id, user_id) do nothing
      returning id into new_part_id;

      if new_part_id is not null then
        insert into public.notifications (user_id, actor_user_id, type, title, body, data)
        values (
          inv,
          uid,
          'planned_workout_invite',
          invite_title,
          case when note_clean is not null then invite_body || E'\n' || note_clean else invite_body end,
          jsonb_build_object(
            'plannedWorkoutId', pw_id::text,
            'inviterUserId', uid::text,
            'centerId', p_center_id,
            'centerName', p_center_name,
            'scheduledAt', p_scheduled_at::text,
            'trainingTypes', to_jsonb(coalesce(p_training_types, '{}')),
            'threadId', case when p_thread_id is null then null else p_thread_id::text end
          )
        );
      end if;
    end loop;
  end if;

  if p_thread_id is not null and clean_ids is not null and cardinality(clean_ids) = 1 then
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

revoke all on function public.create_planned_session(text, text, timestamptz, text[], text, uuid[], uuid) from public;
grant execute on function public.create_planned_session(text, text, timestamptz, text[], text, uuid[], uuid) to authenticated;
