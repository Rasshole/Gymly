-- Fix: composite-returning say_hi_active_check_in made SELECT INTO set FOUND=true
-- with a null row when no active check-in, so checkout was misreported as different_gym.

drop function if exists public.say_hi_active_check_in(uuid);

create or replace function public.say_hi_active_check_in(p_user uuid)
returns setof public.check_ins
language sql
stable
security definer
set search_path = public
as $$
  select c.*
  from public.check_ins c
  where c.user_id = p_user
    and c.is_active = true
    and c.ended_at is null
  order by c.started_at desc nulls last
  limit 1;
$$;

revoke all on function public.say_hi_active_check_in(uuid) from public;
grant execute on function public.say_hi_active_check_in(uuid) to authenticated;

create or replace function public.send_say_hi_request(
  p_recipient_id uuid,
  p_message text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender uuid := auth.uid();
  v_msg text := left(trim(coalesce(p_message, '')), 200);
  v_cfg public.say_hi_config%rowtype;
  v_sender_ci public.check_ins%rowtype;
  v_recip_ci public.check_ins%rowtype;
  v_existing uuid;
  v_incoming uuid;
  v_hour_count int;
  v_day_count int;
  v_cooldown_hit boolean;
  v_req_id uuid;
  v_sender_name text;
  v_notif_id uuid;
begin
  perform public.expire_say_hi_requests();

  if v_sender is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_recipient_id is null or p_recipient_id = v_sender then
    return jsonb_build_object('ok', false, 'error', 'invalid_recipient');
  end if;
  if v_msg is null or char_length(v_msg) < 1 then
    return jsonb_build_object('ok', false, 'error', 'empty_message');
  end if;

  select * into v_cfg from public.say_hi_config where id = 1;
  if not found then
    v_cfg.max_per_hour := 5;
    v_cfg.max_per_day := 10;
    v_cfg.cooldown_hours := 24;
    v_cfg.expiry_hours := 24;
    v_cfg.max_message_chars := 200;
  end if;

  if char_length(v_msg) > v_cfg.max_message_chars then
    return jsonb_build_object('ok', false, 'error', 'message_too_long');
  end if;

  if public.users_are_blocked(v_sender, p_recipient_id) then
    return jsonb_build_object('ok', false, 'error', 'blocked');
  end if;

  if exists (
    select 1 from public.friendships f
    where f.user_a = least(v_sender, p_recipient_id)
      and f.user_b = greatest(v_sender, p_recipient_id)
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_friends');
  end if;

  if exists (
    select 1 from public.dm_threads t
    where t.user_a = least(v_sender, p_recipient_id)
      and t.user_b = greatest(v_sender, p_recipient_id)
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_chatting');
  end if;

  select id into v_incoming
  from public.say_hi_requests
  where sender_id = p_recipient_id
    and recipient_id = v_sender
    and status = 'pending'
  limit 1;
  if v_incoming is not null then
    return jsonb_build_object(
      'ok', false,
      'error', 'incoming_pending',
      'request_id', v_incoming
    );
  end if;

  if exists (
    select 1 from public.say_hi_requests r
    where r.sender_id = v_sender
      and r.recipient_id = p_recipient_id
      and r.status = 'pending'
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_pending');
  end if;

  select exists (
    select 1 from public.say_hi_requests r
    where least(r.sender_id, r.recipient_id) = least(v_sender, p_recipient_id)
      and greatest(r.sender_id, r.recipient_id) = greatest(v_sender, p_recipient_id)
      and r.created_at > now() - make_interval(hours => v_cfg.cooldown_hours)
  ) into v_cooldown_hit;
  if v_cooldown_hit then
    return jsonb_build_object('ok', false, 'error', 'cooldown');
  end if;

  select * into v_sender_ci from public.say_hi_active_check_in(v_sender);
  if not found or v_sender_ci.id is null then
    return jsonb_build_object('ok', false, 'error', 'sender_not_checked_in');
  end if;

  select * into v_recip_ci from public.say_hi_active_check_in(p_recipient_id);
  if not found or v_recip_ci.id is null then
    return jsonb_build_object('ok', false, 'error', 'recipient_not_checked_in');
  end if;

  if v_sender_ci.gym_id is distinct from v_recip_ci.gym_id then
    return jsonb_build_object('ok', false, 'error', 'different_gym');
  end if;

  if v_recip_ci.contact_status is distinct from 'open' then
    return jsonb_build_object('ok', false, 'error', 'recipient_focused');
  end if;

  if exists (
    select 1 from public.say_hi_requests r
    where r.sender_id = v_sender
      and r.recipient_id = p_recipient_id
      and r.sender_check_in_id = v_sender_ci.id
  ) then
    return jsonb_build_object('ok', false, 'error', 'same_session_repeat');
  end if;

  select count(*)::int into v_hour_count
  from public.say_hi_requests r
  where r.sender_id = v_sender
    and r.created_at > now() - interval '1 hour';
  if v_hour_count >= v_cfg.max_per_hour then
    return jsonb_build_object('ok', false, 'error', 'rate_hour');
  end if;

  select count(*)::int into v_day_count
  from public.say_hi_requests r
  where r.sender_id = v_sender
    and r.created_at > now() - interval '24 hours';
  if v_day_count >= v_cfg.max_per_day then
    return jsonb_build_object('ok', false, 'error', 'rate_day');
  end if;

  begin
    insert into public.say_hi_requests (
      sender_id,
      recipient_id,
      message,
      gym_id,
      gym_name,
      sender_check_in_id,
      recipient_check_in_id,
      status,
      expires_at
    ) values (
      v_sender,
      p_recipient_id,
      v_msg,
      v_sender_ci.gym_id,
      coalesce(v_sender_ci.gym_name, v_recip_ci.gym_name),
      v_sender_ci.id,
      v_recip_ci.id,
      'pending',
      now() + make_interval(hours => v_cfg.expiry_hours)
    )
    returning id into v_req_id;
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'error', 'already_pending');
  end;

  select coalesce(
    nullif(trim(p.display_name), ''),
    nullif(trim(p.username), ''),
    'En Gymly-bruger'
  )
  into v_sender_name
  from public.profiles p
  where p.id = v_sender;

  if v_sender_name ~* '@' then
    v_sender_name := 'En Gymly-bruger';
  end if;

  insert into public.notifications (
    user_id, actor_user_id, type, title, body, data
  ) values (
    p_recipient_id,
    v_sender,
    'say_hi_request',
    'Ny hilsen',
    format('%s siger hej i centret', v_sender_name),
    jsonb_build_object(
      'sayHiRequestId', v_req_id::text,
      'fromUserId', v_sender::text,
      'actorName', v_sender_name,
      'routeTarget', 'say_hi_inbox',
      'gymId', v_sender_ci.gym_id,
      'gymName', coalesce(v_sender_ci.gym_name, '')
    )
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'request_id', v_req_id,
    'notification_id', v_notif_id,
    'expires_at', (now() + make_interval(hours => v_cfg.expiry_hours))
  );
end;
$$;

revoke all on function public.send_say_hi_request(uuid, text) from public;
grant execute on function public.send_say_hi_request(uuid, text) to authenticated;
