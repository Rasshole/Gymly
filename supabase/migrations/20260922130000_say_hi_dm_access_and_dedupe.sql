-- Follow-up: say-hi accepted chats must work without friendship;
-- blocks must stop DM inserts; notification dedupe for say_hi_request.

-- DM insert: participants only + not blocked either direction
drop policy if exists "dm_messages_insert_if_member" on public.dm_messages;
create policy "dm_messages_insert_if_member"
  on public.dm_messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1
      from public.dm_threads t
      where t.id = thread_id
        and auth.uid() in (t.user_a, t.user_b)
        and not public.users_are_blocked(t.user_a, t.user_b)
    )
  );

-- Ensure find-existing thread without creating (no friendship required)
create or replace function public.find_dm_thread_with(p_other uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  u uuid := auth.uid();
  tid uuid;
begin
  if u is null or p_other is null or p_other = u then
    return null;
  end if;
  if public.users_are_blocked(u, p_other) then
    return null;
  end if;
  select t.id into tid
  from public.dm_threads t
  where t.user_a = least(u, p_other)
    and t.user_b = greatest(u, p_other)
  limit 1;
  return tid;
end;
$$;

revoke all on function public.find_dm_thread_with(uuid) from public;
grant execute on function public.find_dm_thread_with(uuid) to authenticated;

-- list_incoming must be VOLATILE (calls expire UPDATE); STABLE → PostgREST read-only txn fails
create or replace function public.list_incoming_say_hi_requests()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  u uuid := auth.uid();
begin
  perform public.expire_say_hi_requests();
  if u is null then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc)
    from (
      select
        r.id,
        r.sender_id,
        r.message,
        r.gym_id,
        r.gym_name,
        r.created_at,
        r.expires_at,
        r.status,
        coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.username), ''), 'Gymly') as sender_display_name,
        p.avatar_url as sender_avatar_url,
        case
          when ci.id is not null and ci.is_active and ci.ended_at is null
            then ci.workout_type
          else null
        end as live_workout_type,
        case
          when ci.id is not null and ci.is_active and ci.ended_at is null
            then ci.gym_name
          else null
        end as live_gym_name,
        case
          when ci.id is not null and ci.is_active and ci.ended_at is null
            then ci.contact_status
          else null
        end as live_contact_status
      from public.say_hi_requests r
      left join public.profiles p on p.id = r.sender_id
      left join public.check_ins ci
        on ci.user_id = r.sender_id
       and ci.is_active = true
       and ci.ended_at is null
      where r.recipient_id = u
        and r.status = 'pending'
        and r.expires_at > now()
        and not public.users_are_blocked(u, r.sender_id)
      order by r.created_at desc
      limit 50
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_incoming_say_hi_requests() from public;
grant execute on function public.list_incoming_say_hi_requests() to authenticated;

create or replace function public.get_say_hi_relation(p_other uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  u uuid := auth.uid();
  v_friend boolean;
  v_thread uuid;
  v_out uuid;
  v_in uuid;
  v_other_ci public.check_ins%rowtype;
begin
  perform public.expire_say_hi_requests();
  if u is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_other is null or p_other = u then
    return jsonb_build_object('ok', true, 'relation', 'self');
  end if;
  if public.users_are_blocked(u, p_other) then
    return jsonb_build_object('ok', true, 'relation', 'blocked');
  end if;

  select exists (
    select 1 from public.friendships f
    where f.user_a = least(u, p_other) and f.user_b = greatest(u, p_other)
  ) into v_friend;

  select t.id into v_thread
  from public.dm_threads t
  where t.user_a = least(u, p_other) and t.user_b = greatest(u, p_other)
  limit 1;

  select id into v_out from public.say_hi_requests
  where sender_id = u and recipient_id = p_other and status = 'pending'
  limit 1;

  select id into v_in from public.say_hi_requests
  where sender_id = p_other and recipient_id = u and status = 'pending'
  limit 1;

  select * into v_other_ci from public.say_hi_active_check_in(p_other);

  return jsonb_build_object(
    'ok', true,
    'is_friend', coalesce(v_friend, false),
    'thread_id', v_thread,
    'outgoing_request_id', v_out,
    'incoming_request_id', v_in,
    'other_contact_status', case
      when v_other_ci.id is null then null
      else v_other_ci.contact_status
    end,
    'other_live', case
      when v_other_ci.id is null then null
      else jsonb_build_object(
        'check_in_id', v_other_ci.id,
        'gym_id', v_other_ci.gym_id,
        'gym_name', v_other_ci.gym_name,
        'workout_type', v_other_ci.workout_type,
        'started_at', v_other_ci.started_at,
        'contact_status', v_other_ci.contact_status
      )
    end
  );
end;
$$;

revoke all on function public.get_say_hi_relation(uuid) from public;
grant execute on function public.get_say_hi_relation(uuid) to authenticated;

-- Dedupe say_hi notifications on retry (same request id)
create unique index if not exists notifications_dedupe_say_hi_request
  on public.notifications (user_id, (data->>'sayHiRequestId'))
  where type = 'say_hi_request' and data->>'sayHiRequestId' is not null;
