-- Én planlagt session + flere inviterede, påmindelse ~1 time før, solo gennemførelse ved tjek-ind

alter table public.planned_workouts
  add column if not exists reminder_sent_at timestamptz;

-- Kompakt invitationstekst til notifikation
create or replace function public._planned_invite_notification_body(
  p_training_types text[],
  p_center_name text,
  p_scheduled timestamptz
) returns text
language sql
stable
as $s$
  select
    case
      when p_training_types is null or coalesce(array_length(p_training_types, 1), 0) = 0 then 'Træning'
      when array_length(p_training_types, 1) = 1 then initcap(p_training_types[1])
      else initcap(p_training_types[1]) || ' m.m.'
    end
    || ' i '
    || coalesce(nullif(trim(p_center_name), ''), 'centeret')
    || ' — kl. '
    || to_char(p_scheduled at time zone 'Europe/Copenhagen', 'HH24:MI')
    || ' 💪';
$s$;

-- Opret én session + valgfri liste af inviterede (venner). Solo: tom array.
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

  invite_title := inviter_name || ' inviterede dig til træning';
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

comment on function public.create_planned_session is 'Én planlagt session; valgfri liste af inviterede (én notifikation pr. ven).';

-- Bagudkompatibel: enkelt-invite → samme session-RPC
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
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_invitee_id = auth.uid() then
    raise exception 'cannot_invite_self';
  end if;
  return public.create_planned_session(
    p_center_id,
    p_center_name,
    p_scheduled_at,
    p_training_types,
    p_note,
    array[p_invitee_id]::uuid[],
    p_thread_id
  );
end;
$f$;

grant execute on function public.create_planned_workout_invite(uuid, text, text, timestamptz, text[], text, uuid) to authenticated;

-- Accept / afvis: opdateret copy til creator
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
  short_line text;
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

  short_line := public._planned_invite_notification_body(
    workout_row.training_types,
    workout_row.center_name,
    workout_row.scheduled_at
  );

  if p_accept then
    insert into public.notifications (user_id, actor_user_id, type, title, body, data)
    values (
      creator_uid,
      uid,
      'planned_workout_accepted',
      invitee_name || ' deltager i din træning 💪',
      short_line,
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
      invitee_name || ' kan ikke deltage denne gang',
      short_line,
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

-- Solo: luk session når accepteret deltager har linket tjek-ind, uden ventende invitationer
create or replace function public.trg_check_in_planned_pair_complete()
returns trigger
language plpgsql
security definer
set search_path = public
as $f$
declare
  partner_id uuid;
  n int;
  has_pending_invitee boolean;
begin
  if new.planned_workout_id is null then
    return new;
  end if;

  select exists (
    select 1
    from public.planned_workout_participants p
    where p.planned_workout_id = new.planned_workout_id
      and p.role = 'invitee'
      and p.response_status = 'pending'
  )
  into has_pending_invitee;

  select p.user_id into partner_id
  from public.planned_workout_participants p
  where p.planned_workout_id = new.planned_workout_id
    and p.user_id <> new.user_id
    and p.response_status = 'accepted'
  limit 1;

  if partner_id is not null then
    select count(distinct c.user_id) into n
    from public.check_ins c
    where c.planned_workout_id = new.planned_workout_id
      and c.user_id in (new.user_id, partner_id);
    if n >= 2 then
      update public.planned_workouts
      set
        status = 'completed',
        completed_at = coalesce(completed_at, now())
      where id = new.planned_workout_id
        and status = 'active';
    end if;
    return new;
  end if;

  if has_pending_invitee then
    return new;
  end if;

  if exists (
    select 1
    from public.planned_workout_participants p
    where p.planned_workout_id = new.planned_workout_id
      and p.user_id = new.user_id
      and p.response_status = 'accepted'
  ) then
    update public.planned_workouts
    set
      status = 'completed',
      completed_at = coalesce(completed_at, now())
    where id = new.planned_workout_id
      and status = 'active';
  end if;

  return new;
end;
$f$;

-- Påmindelse ca. 1 time før (idempotent via reminder_sent_at)
create or replace function public.dispatch_planned_workout_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $f$
declare
  w record;
  sent_count integer := 0;
  rid uuid;
  training_line text;
  time_str text;
  other_names text;
  body_line text;
begin
  for w in
    select pw.*
    from public.planned_workouts pw
    where pw.status = 'active'
      and pw.reminder_sent_at is null
      and pw.scheduled_at > now()
      and pw.scheduled_at <= now() + interval '1 hour'
  loop
    training_line := case
      when w.training_types is null or coalesce(array_length(w.training_types, 1), 0) = 0 then 'Træning'
      when array_length(w.training_types, 1) = 1 then initcap(w.training_types[1])
      else initcap(w.training_types[1]) || ' m.m.'
    end;
    time_str := to_char(w.scheduled_at at time zone 'Europe/Copenhagen', 'HH24:MI');

    for rid in
      select p.user_id
      from public.planned_workout_participants p
      where p.planned_workout_id = w.id
        and (p.role = 'creator' or p.response_status = 'accepted')
    loop
      select coalesce(string_agg(q.display, ', ' order by q.display), '')
      into other_names
      from (
        select coalesce(nullif(trim(pr.display_name), ''), nullif(trim(pr.username), ''), 'Ven') as display
        from public.planned_workout_participants p2
        join public.profiles pr on pr.id = p2.user_id
        where p2.planned_workout_id = w.id
          and p2.user_id <> rid
          and (p2.role = 'creator' or p2.response_status = 'accepted')
      ) q;

      if other_names <> '' then
        body_line := training_line || ' i ' || coalesce(nullif(trim(w.center_name), ''), 'centeret')
          || ' med ' || other_names || ' 💪';
      else
        body_line := training_line || ' i ' || coalesce(nullif(trim(w.center_name), ''), 'centeret') || ' 💪';
      end if;

      insert into public.notifications (user_id, actor_user_id, type, title, body, data)
      values (
        rid,
        w.creator_user_id,
        'planned_workout_reminder',
        'Træning om 1 time',
        body_line,
        jsonb_build_object(
          'plannedWorkoutId', w.id::text,
          'centerId', w.center_id,
          'centerName', w.center_name,
          'scheduledAt', w.scheduled_at::text,
          'trainingTypes', to_jsonb(coalesce(w.training_types, '{}'))
        )
      );
      sent_count := sent_count + 1;
    end loop;

    update public.planned_workouts
    set reminder_sent_at = now()
    where id = w.id;
  end loop;

  return sent_count;
end;
$f$;

revoke all on function public.dispatch_planned_workout_reminders() from public;
grant execute on function public.dispatch_planned_workout_reminders() to service_role;
grant execute on function public.dispatch_planned_workout_reminders() to postgres;

do $cron$
declare
  reminder_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    select jobid
    into reminder_job_id
    from cron.job
    where jobname = 'gymly_planned_session_reminders_5m'
    limit 1;

    if reminder_job_id is not null then
      perform cron.unschedule(reminder_job_id);
    end if;

    perform cron.schedule(
      'gymly_planned_session_reminders_5m',
      '*/5 * * * *',
      $j$select public.dispatch_planned_workout_reminders();$j$
    );
  end if;
end $cron$;

comment on function public.dispatch_planned_workout_reminders is 'Sender planned_workout_reminder til creator + accepterede, én gang pr. session (reminder_sent_at).';
