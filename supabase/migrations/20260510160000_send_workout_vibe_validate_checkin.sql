-- Fix vibe send: stale/wrong recipient_check_in_id caused FK violation on workout_vibe_sends.
-- RLS: allow authenticated users to insert their own sender row (covers non-superuser definer edge cases).

drop policy if exists "workout_vibe_sends_insert_sender" on public.workout_vibe_sends;
create policy "workout_vibe_sends_insert_sender"
  on public.workout_vibe_sends for insert
  to authenticated
  with check (sender_id = auth.uid());

create or replace function public.send_workout_vibe(
  p_recipient_id uuid,
  p_emoji text,
  p_recipient_check_in_id uuid default null,
  p_center_name text default '',
  p_workout_type text default '',
  p_thread_id text default null,
  p_route_chat boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $f$
declare
  v_sender uuid := auth.uid();
  v_bucket timestamptz := null;
  v_emoji text := left(trim(coalesce(p_emoji, '')), 16);
  v_sender_name text;
  v_center text := coalesce(nullif(trim(p_center_name), ''), 'centeret');
  v_workout text := coalesce(nullif(trim(p_workout_type), ''), 'Træning');
  v_thread text := nullif(trim(coalesce(p_thread_id, '')), '');
  v_notif_id uuid;
  v_check_in uuid := p_recipient_check_in_id;
begin
  if v_sender is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_recipient_id = v_sender then
    return jsonb_build_object('ok', false, 'error', 'self');
  end if;
  if v_emoji is null or v_emoji = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid_emoji');
  end if;

  if v_check_in is not null then
    if not exists (
      select 1
      from public.check_ins ci
      where ci.id = v_check_in
        and ci.user_id = p_recipient_id
    ) then
      v_check_in := null;
    end if;
  end if;

  begin
    if v_check_in is not null then
      insert into public.workout_vibe_sends (
        sender_id, recipient_id, emoji, recipient_check_in_id, window_bucket_start
      )
      values (v_sender, p_recipient_id, v_emoji, v_check_in, null);
    else
      v_bucket := public.workout_vibe_window_bucket_utc();
      insert into public.workout_vibe_sends (
        sender_id, recipient_id, emoji, recipient_check_in_id, window_bucket_start
      )
      values (v_sender, p_recipient_id, v_emoji, null, v_bucket);
    end if;
  exception
    when unique_violation then
      return jsonb_build_object('ok', true, 'duplicate', true);
  end;

  select coalesce(
    nullif(trim(p.display_name), ''),
    nullif(trim(p.username), ''),
    'En ven'
  )
  into v_sender_name
  from public.profiles p
  where p.id = v_sender;

  insert into public.notifications (
    user_id,
    actor_user_id,
    type,
    title,
    body,
    data
  )
  values (
    p_recipient_id,
    v_sender,
    'workout_reaction',
    'Ny vibe',
    format('%s sendte dig %s', v_sender_name, v_emoji),
    jsonb_build_object(
      'emoji', v_emoji,
      'vibeKind', 'session',
      'recipientSessionId', case when v_check_in is not null then v_check_in::text else null end,
      'windowBucketStart', case when v_bucket is not null then v_bucket::text else null end,
      'actorName', v_sender_name,
      'fromUserId', v_sender::text,
      'senderId', v_sender::text,
      'threadId', v_thread,
      'chatId', v_thread,
      'conversationId', v_thread,
      'routeTarget', case when p_route_chat then 'chat' else 'notifications' end,
      'centerName', v_center,
      'workoutType', v_workout,
      'targetUserId', p_recipient_id::text
    )
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'notification_id', v_notif_id
  );
end;
$f$;

revoke all on function public.send_workout_vibe(uuid, text, uuid, text, text, text, boolean) from public;
grant execute on function public.send_workout_vibe(uuid, text, uuid, text, text, text, boolean) to authenticated;
