-- Fix: PL/pgSQL variable "pw" shadowed alias "pw" → "column reference pw.* is ambiguous"
-- + DM thread messages for planned workout invite + accept/decline status
-- + notification title/data (inviterUserId, Ny træningsinvitation)

create or replace function public.respond_planned_workout_invite(
  p_planned_workout_id uuid,
  p_accept boolean
) returns void
language plpgsql
security definer
set search_path = public
as $f$
declare
  uid uuid := auth.uid();
  workout_row public.planned_workouts%rowtype;
  invitee_name text;
  creator_uid uuid;
  n int;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select *
  into workout_row
  from public.planned_workouts
  where id = p_planned_workout_id
  for update;

  if not found then
    raise exception 'not_found';
  end if;
  if workout_row.status <> 'active' then
    raise exception 'not_active';
  end if;

  update public.planned_workout_participants
  set
    response_status = case when p_accept then 'accepted' else 'declined' end,
    responded_at = now()
  where planned_workout_id = p_planned_workout_id
    and user_id = uid
    and role = 'invitee';

  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'not_invitee';
  end if;

  select coalesce(nullif(trim(display_name), ''), nullif(trim(username), ''), 'Nogen')
  into invitee_name from public.profiles where id = uid;

  creator_uid := workout_row.creator_user_id;

  if p_accept then
    insert into public.notifications (user_id, actor_user_id, type, title, body, data)
    values (
      creator_uid,
      uid,
      'planned_workout_accepted',
      invitee_name || ' er med',
      public._format_planned_workout_body(
        workout_row.center_name,
        workout_row.scheduled_at,
        workout_row.training_types
      ),
      jsonb_build_object(
        'plannedWorkoutId', workout_row.id::text,
        'centerId', workout_row.center_id,
        'centerName', workout_row.center_name,
        'scheduledAt', workout_row.scheduled_at::text,
        'inviterUserId', creator_uid::text,
        'inviteeUserId', uid::text,
        'threadId', case
          when workout_row.thread_id is null then null
          else workout_row.thread_id::text
        end
      )
    );
  else
    insert into public.notifications (user_id, actor_user_id, type, title, body, data)
    values (
      creator_uid,
      uid,
      'planned_workout_declined',
      invitee_name || ' sagde nej tak',
      public._format_planned_workout_body(
        workout_row.center_name,
        workout_row.scheduled_at,
        workout_row.training_types
      ),
      jsonb_build_object(
        'plannedWorkoutId', workout_row.id::text,
        'centerId', workout_row.center_id,
        'centerName', workout_row.center_name,
        'scheduledAt', workout_row.scheduled_at::text,
        'inviterUserId', creator_uid::text,
        'inviteeUserId', uid::text,
        'threadId', case
          when workout_row.thread_id is null then null
          else workout_row.thread_id::text
        end
      )
    );
  end if;

  if workout_row.thread_id is not null then
    insert into public.dm_messages (thread_id, sender_id, body)
    values (
      workout_row.thread_id,
      uid,
      '[GYM_PLAN_STATUS]' || (
        jsonb_build_object(
          'plannedWorkoutId', p_planned_workout_id::text,
          'status', case when p_accept then 'accepted' else 'declined' end
        )::text
      )
    );
  end if;

  update public.notifications
  set is_read = true
  where user_id = uid
    and type = 'planned_workout_invite'
    and data->>'plannedWorkoutId' = p_planned_workout_id::text;
end;
$f$;

grant execute on function public.respond_planned_workout_invite(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Opret plan-invitation: notifikation + valgfri DM-besked i tråden
-- ---------------------------------------------------------------------------

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

  body_text := public._format_planned_workout_body(p_center_name, p_scheduled_at, coalesce(p_training_types, '{}'));
  if note_clean is not null then
    body_text := body_text || E'\n' || note_clean;
  end if;

  insert into public.notifications (user_id, actor_user_id, type, title, body, data)
  values (
    p_invitee_id,
    uid,
    'planned_workout_invite',
    'Ny træningsinvitation',
    inviter_name || ' inviterede dig til træning' || E'\n' || body_text,
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

comment on function public.respond_planned_workout_invite is 'Invitee accepterer/afviser; notificerer creator; valgfri DM-status i tråd.';
