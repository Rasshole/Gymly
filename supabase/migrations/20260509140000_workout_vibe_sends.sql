-- Session vibes: one emoji per sender → recipient per active check-in (or 6h UTC window fallback).

create table if not exists public.workout_vibe_sends (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  emoji text not null,
  recipient_check_in_id uuid references public.check_ins (id) on delete cascade,
  window_bucket_start timestamptz,
  created_at timestamptz not null default now(),
  constraint workout_vibe_sends_session_xor_window check (
    (recipient_check_in_id is not null and window_bucket_start is null)
    or (recipient_check_in_id is null and window_bucket_start is not null)
  ),
  constraint workout_vibe_sends_emoji_len check (char_length(emoji) between 1 and 16)
);

create unique index if not exists workout_vibe_sends_unique_session
  on public.workout_vibe_sends (sender_id, recipient_id, emoji, recipient_check_in_id)
  where recipient_check_in_id is not null;

create unique index if not exists workout_vibe_sends_unique_window
  on public.workout_vibe_sends (sender_id, recipient_id, emoji, window_bucket_start)
  where recipient_check_in_id is null;

create index if not exists workout_vibe_sends_lookup_idx
  on public.workout_vibe_sends (sender_id, recipient_id, created_at desc);

alter table public.workout_vibe_sends enable row level security;

drop policy if exists "workout_vibe_sends_select_parties" on public.workout_vibe_sends;
create policy "workout_vibe_sends_select_parties"
  on public.workout_vibe_sends for select
  to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());

-- 6-hour buckets in UTC (matches app fallback window).
create or replace function public.workout_vibe_window_bucket_utc()
returns timestamptz
language sql
stable
set search_path = public
as $fn$
  select to_timestamp(
    floor(extract(epoch from timezone('utc', now())) / 21600.0) * 21600.0
  )::timestamptz;
$fn$;

-- Emojis already sent by current user to this recipient for this session or current window.
create or replace function public.get_workout_vibes_sent(
  p_recipient_id uuid,
  p_recipient_check_in_id uuid default null
) returns text[]
language plpgsql
stable
security definer
set search_path = public
as $f$
declare
  v_sender uuid := auth.uid();
  v_bucket timestamptz;
begin
  if v_sender is null then
    return array[]::text[];
  end if;
  if p_recipient_check_in_id is not null then
    return coalesce((
      select array_agg(s.emoji order by s.created_at)
      from public.workout_vibe_sends s
      where s.sender_id = v_sender
        and s.recipient_id = p_recipient_id
        and s.recipient_check_in_id = p_recipient_check_in_id
    ), array[]::text[]);
  end if;
  v_bucket := public.workout_vibe_window_bucket_utc();
  return coalesce((
    select array_agg(s.emoji order by s.created_at)
    from public.workout_vibe_sends s
    where s.sender_id = v_sender
      and s.recipient_id = p_recipient_id
      and s.recipient_check_in_id is null
      and s.window_bucket_start = v_bucket
  ), array[]::text[]);
end;
$f$;

revoke all on function public.get_workout_vibes_sent(uuid, uuid) from public;
grant execute on function public.get_workout_vibes_sent(uuid, uuid) to authenticated;

-- Dedupe + insert notification (triggers push). Idempotent: duplicate → no row, no push.
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

  begin
    if p_recipient_check_in_id is not null then
      insert into public.workout_vibe_sends (
        sender_id, recipient_id, emoji, recipient_check_in_id, window_bucket_start
      )
      values (v_sender, p_recipient_id, v_emoji, p_recipient_check_in_id, null);
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
      'recipientSessionId', case when p_recipient_check_in_id is not null then p_recipient_check_in_id::text else null end,
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

comment on table public.workout_vibe_sends is
  'Dedupe for in-session / windowed workout vibes; pairs with send_workout_vibe RPC.';
