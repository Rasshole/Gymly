-- Say hi + session contact status (separate from sanitize_email_display_names).
-- Safe defaults: missing contact_status = not open to strangers.
-- Does NOT convert workout vibes into chats or friendships.

-- ---------------------------------------------------------------------------
-- Config (conservative rate limits)
-- ---------------------------------------------------------------------------
create table if not exists public.say_hi_config (
  id int primary key default 1 check (id = 1),
  max_per_hour int not null default 5 check (max_per_hour > 0 and max_per_hour <= 50),
  max_per_day int not null default 10 check (max_per_day > 0 and max_per_day <= 100),
  cooldown_hours int not null default 24 check (cooldown_hours > 0 and cooldown_hours <= 168),
  expiry_hours int not null default 24 check (expiry_hours > 0 and expiry_hours <= 168),
  max_message_chars int not null default 200 check (max_message_chars between 40 and 500)
);

insert into public.say_hi_config (id) values (1)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Contact status on active check-in (session-scoped; cleared on checkout by ending row)
-- ---------------------------------------------------------------------------
alter table public.check_ins
  add column if not exists contact_status text;

do $c$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'check_ins_contact_status_check'
  ) then
    alter table public.check_ins
      add constraint check_ins_contact_status_check
      check (contact_status is null or contact_status in ('open', 'focused'));
  end if;
end $c$;

comment on column public.check_ins.contact_status is
  'Session contact preference: open | focused | null (null = not open to stranger hi).';

-- ---------------------------------------------------------------------------
-- Blocks + reports (create if missing — app already assumes user_blocks RPCs)
-- ---------------------------------------------------------------------------
create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self check (blocker_id <> blocked_id)
);

alter table public.user_blocks enable row level security;

drop policy if exists "user_blocks_select_own" on public.user_blocks;
create policy "user_blocks_select_own"
  on public.user_blocks for select to authenticated
  using (blocker_id = auth.uid() or blocked_id = auth.uid());

create or replace function public.users_are_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_blocks ub
    where (ub.blocker_id = a and ub.blocked_id = b)
       or (ub.blocker_id = b and ub.blocked_id = a)
  );
$$;

revoke all on function public.users_are_blocked(uuid, uuid) from public;
grant execute on function public.users_are_blocked(uuid, uuid) to authenticated;

create or replace function public.block_user(p_other uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  u uuid := auth.uid();
begin
  if u is null then
    raise exception 'not authenticated';
  end if;
  if p_other is null or p_other = u then
    raise exception 'invalid peer';
  end if;
  insert into public.user_blocks (blocker_id, blocked_id)
  values (u, p_other)
  on conflict do nothing;
  delete from public.friendships f
  where f.user_a = least(u, p_other) and f.user_b = greatest(u, p_other);
  delete from public.friend_requests fr
  where (fr.from_user_id = u and fr.to_user_id = p_other)
     or (fr.from_user_id = p_other and fr.to_user_id = u);
end;
$$;

revoke all on function public.block_user(uuid) from public;
grant execute on function public.block_user(uuid) to authenticated;

create or replace function public.unblock_user(p_other uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  u uuid := auth.uid();
begin
  if u is null then
    raise exception 'not authenticated';
  end if;
  delete from public.user_blocks
  where blocker_id = u and blocked_id = p_other;
end;
$$;

revoke all on function public.unblock_user(uuid) from public;
grant execute on function public.unblock_user(uuid) to authenticated;

create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reported_id uuid not null references auth.users (id) on delete cascade,
  reason text not null default 'other',
  details text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint user_reports_no_self check (reporter_id <> reported_id),
  constraint user_reports_reason_len check (char_length(reason) between 1 and 64),
  constraint user_reports_details_len check (details is null or char_length(details) <= 1000)
);

create index if not exists user_reports_reporter_idx
  on public.user_reports (reporter_id, created_at desc);

alter table public.user_reports enable row level security;

drop policy if exists "user_reports_insert_own" on public.user_reports;
create policy "user_reports_insert_own"
  on public.user_reports for insert to authenticated
  with check (reporter_id = auth.uid());

drop policy if exists "user_reports_select_own" on public.user_reports;
create policy "user_reports_select_own"
  on public.user_reports for select to authenticated
  using (reporter_id = auth.uid());

create or replace function public.report_user(
  p_other uuid,
  p_reason text default 'other',
  p_details text default null,
  p_context jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  u uuid := auth.uid();
  rid uuid;
  reason text := left(trim(coalesce(p_reason, 'other')), 64);
begin
  if u is null then
    raise exception 'not authenticated';
  end if;
  if p_other is null or p_other = u then
    raise exception 'invalid peer';
  end if;
  if reason = '' then
    reason := 'other';
  end if;
  insert into public.user_reports (reporter_id, reported_id, reason, details, context)
  values (
    u,
    p_other,
    reason,
    nullif(left(trim(coalesce(p_details, '')), 1000), ''),
    coalesce(p_context, '{}'::jsonb)
  )
  returning id into rid;
  return rid;
end;
$$;

revoke all on function public.report_user(uuid, text, text, jsonb) from public;
grant execute on function public.report_user(uuid, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Say-hi requests
-- ---------------------------------------------------------------------------
create table if not exists public.say_hi_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  message text not null,
  gym_id text not null,
  gym_name text,
  sender_check_in_id uuid references public.check_ins (id) on delete set null,
  recipient_check_in_id uuid references public.check_ins (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'expired')),
  thread_id uuid references public.dm_threads (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  responded_at timestamptz,
  constraint say_hi_no_self check (sender_id <> recipient_id),
  constraint say_hi_message_len check (char_length(message) between 1 and 200)
);

create unique index if not exists say_hi_one_pending_pair
  on public.say_hi_requests (
    least(sender_id, recipient_id),
    greatest(sender_id, recipient_id)
  )
  where status = 'pending';

create index if not exists say_hi_recipient_pending_idx
  on public.say_hi_requests (recipient_id, created_at desc)
  where status = 'pending';

create index if not exists say_hi_sender_created_idx
  on public.say_hi_requests (sender_id, created_at desc);

create index if not exists say_hi_expires_pending_idx
  on public.say_hi_requests (expires_at)
  where status = 'pending';

alter table public.say_hi_requests enable row level security;

-- Recipients see pending/accepted/expired; declined visible only to recipient.
-- Senders never see declined rows (private decline).
drop policy if exists "say_hi_select_parties" on public.say_hi_requests;
create policy "say_hi_select_parties"
  on public.say_hi_requests for select to authenticated
  using (
    (
      recipient_id = auth.uid()
      and status in ('pending', 'accepted', 'declined', 'expired')
    )
    or (
      sender_id = auth.uid()
      and status in ('pending', 'accepted', 'expired')
    )
  );

-- No direct client inserts/updates — RPCs only
drop policy if exists "say_hi_no_direct_insert" on public.say_hi_requests;
create policy "say_hi_no_direct_insert"
  on public.say_hi_requests for insert to authenticated
  with check (false);

drop policy if exists "say_hi_no_direct_update" on public.say_hi_requests;
create policy "say_hi_no_direct_update"
  on public.say_hi_requests for update to authenticated
  using (false)
  with check (false);

-- DM threads: mark opening path (optional metadata)
alter table public.dm_threads
  add column if not exists opened_via text;

do $d$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'dm_threads_opened_via_check'
  ) then
    alter table public.dm_threads
      add constraint dm_threads_opened_via_check
      check (opened_via is null or opened_via in ('friendship', 'say_hi'));
  end if;
end $d$;

-- Notifications: allow say_hi_request type
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
    'workout_reaction',
    'biceps_reaction',
    'post_like',
    'post_comment',
    'comment_like',
    'gymly_group_invite',
    'gymly_group_invite_declined',
    'gymly_group_member_joined',
    'gymly_group_message',
    'gymly_planned_in_group',
    'gymly_group_check_in',
    'say_hi_request'
  ));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.expire_say_hi_requests()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update public.say_hi_requests
  set status = 'expired',
      responded_at = coalesce(responded_at, now())
  where status = 'pending'
    and expires_at <= now();
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.expire_say_hi_requests() from public;
grant execute on function public.expire_say_hi_requests() to authenticated;

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

create or replace function public.update_my_contact_status(p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  u uuid := auth.uid();
  st text := nullif(trim(coalesce(p_status, '')), '');
  updated int;
begin
  if u is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if st is not null and st not in ('open', 'focused') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;
  update public.check_ins
  set contact_status = st
  where user_id = u
    and is_active = true
    and ended_at is null;
  get diagnostics updated = row_count;
  if updated = 0 then
    return jsonb_build_object('ok', false, 'error', 'no_active_session');
  end if;
  return jsonb_build_object('ok', true, 'contact_status', st);
end;
$$;

revoke all on function public.update_my_contact_status(text) from public;
grant execute on function public.update_my_contact_status(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Send say-hi (server re-validates all gates)
-- ---------------------------------------------------------------------------
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

  -- Existing friendship or DM thread → no new request needed
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

  -- Recipient must explicitly be open (null/focused = not open)
  if v_recip_ci.contact_status is distinct from 'open' then
    return jsonb_build_object('ok', false, 'error', 'recipient_focused');
  end if;

  -- Same session: no second request to same person
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

  -- Never use email-looking names in notifications
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

-- ---------------------------------------------------------------------------
-- Respond: accept (atomic thread + first message) or decline (silent to sender)
-- ---------------------------------------------------------------------------
create or replace function public.respond_say_hi_request(
  p_request_id uuid,
  p_action text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  u uuid := auth.uid();
  act text := lower(trim(coalesce(p_action, '')));
  r public.say_hi_requests%rowtype;
  a uuid;
  b uuid;
  tid uuid;
  mid uuid;
begin
  perform public.expire_say_hi_requests();

  if u is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if act not in ('accept', 'decline') then
    return jsonb_build_object('ok', false, 'error', 'invalid_action');
  end if;

  select * into r from public.say_hi_requests where id = p_request_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if r.recipient_id <> u then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if r.status = 'accepted' and r.thread_id is not null then
    return jsonb_build_object('ok', true, 'duplicate', true, 'thread_id', r.thread_id, 'status', 'accepted');
  end if;
  if r.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'not_pending', 'status', r.status);
  end if;
  if r.expires_at <= now() then
    update public.say_hi_requests
    set status = 'expired', responded_at = now()
    where id = r.id;
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  if public.users_are_blocked(r.sender_id, r.recipient_id) then
    update public.say_hi_requests
    set status = 'declined', responded_at = now()
    where id = r.id;
    return jsonb_build_object('ok', false, 'error', 'blocked');
  end if;

  if act = 'decline' then
    update public.say_hi_requests
    set status = 'declined', responded_at = now()
    where id = r.id and status = 'pending';
    -- No notification / read receipt to sender
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;

  -- accept
  a := least(r.sender_id, r.recipient_id);
  b := greatest(r.sender_id, r.recipient_id);

  select t.id into tid
  from public.dm_threads t
  where t.user_a = a and t.user_b = b
  limit 1;

  if tid is null then
    insert into public.dm_threads (user_a, user_b, opened_via)
    values (a, b, 'say_hi')
    returning id into tid;
  end if;

  -- First greeting once
  if not exists (
    select 1 from public.dm_messages m
    where m.thread_id = tid
      and m.sender_id = r.sender_id
      and m.body = r.message
  ) then
    insert into public.dm_messages (thread_id, sender_id, body, image_url)
    values (tid, r.sender_id, r.message, null)
    returning id into mid;
  end if;

  update public.say_hi_requests
  set status = 'accepted',
      responded_at = now(),
      thread_id = tid
  where id = r.id
    and status = 'pending';

  -- Do NOT create friendship
  return jsonb_build_object(
    'ok', true,
    'status', 'accepted',
    'thread_id', tid,
    'message_id', mid,
    'duplicate', false
  );
end;
$$;

revoke all on function public.respond_say_hi_request(uuid, text) from public;
grant execute on function public.respond_say_hi_request(uuid, text) to authenticated;

-- List incoming pending for inbox
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
        -- Live snapshot only if still actively checked in at same gym; else nulls
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

-- Relation probe for mini-profile primary CTA
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
