-- Push tokens, per-user notification preferences, DM in-app rows + webhook note

-- ---------------------------------------------------------------------------
-- user_push_tokens: FCM device tokens (flere enheder pr. bruger)
-- ---------------------------------------------------------------------------
create table if not exists public.user_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null,
  platform text not null default 'ios' check (platform in ('ios', 'android')),
  device_id text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_push_tokens_user_token_uidx
  on public.user_push_tokens (user_id, token);

create index if not exists user_push_tokens_user_idx
  on public.user_push_tokens (user_id)
  where enabled = true;

create index if not exists user_push_tokens_device_idx
  on public.user_push_tokens (user_id, device_id)
  where device_id is not null;

alter table public.user_push_tokens enable row level security;

drop policy if exists "user_push_tokens_select_own" on public.user_push_tokens;
create policy "user_push_tokens_select_own"
  on public.user_push_tokens for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "user_push_tokens_insert_own" on public.user_push_tokens;
create policy "user_push_tokens_insert_own"
  on public.user_push_tokens for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "user_push_tokens_update_own" on public.user_push_tokens;
create policy "user_push_tokens_update_own"
  on public.user_push_tokens for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "user_push_tokens_delete_own" on public.user_push_tokens;
create policy "user_push_tokens_delete_own"
  on public.user_push_tokens for delete
  to authenticated
  using (user_id = auth.uid());

create or replace function public.set_user_push_tokens_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_push_tokens_updated on public.user_push_tokens;
create trigger trg_user_push_tokens_updated
  before update on public.user_push_tokens
  for each row execute function public.set_user_push_tokens_updated_at();

-- ---------------------------------------------------------------------------
-- notification_preferences: styrer push (server læser ved send-push)
-- ---------------------------------------------------------------------------
create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  push_enabled boolean not null default true,
  messages_enabled boolean not null default true,
  friend_requests_enabled boolean not null default true,
  check_ins_enabled boolean not null default true,
  badges_streaks_enabled boolean not null default true,
  planned_workouts_enabled boolean not null default true,
  workout_reminders_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists "notification_preferences_select_own" on public.notification_preferences;
create policy "notification_preferences_select_own"
  on public.notification_preferences for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "notification_preferences_upsert_own" on public.notification_preferences;
create policy "notification_preferences_upsert_own"
  on public.notification_preferences for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "notification_preferences_update_own" on public.notification_preferences;
create policy "notification_preferences_update_own"
  on public.notification_preferences for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Service role (Edge Function) skal kunne læse pr. modtager — tilføj policy for service role via bypass:
-- Edge function bruger service role key og omgår RLS.

-- ---------------------------------------------------------------------------
-- Udvid notification-typer: direkte besked
-- ---------------------------------------------------------------------------
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
    'workout_reminder'
  ));

create unique index if not exists notifications_dedupe_dm
  on public.notifications (user_id, (data->>'messageId'))
  where type = 'dm_message' and data->>'messageId' is not null;

-- DM: modtager får række når der postes besked (ikke afsender)
create or replace function public.trg_notify_dm_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $f$
declare
  ua uuid;
  ub uuid;
  recipient uuid;
  sender_name text;
  preview text;
  thread uuid;
begin
  thread := new.thread_id;
  select t.user_a, t.user_b into ua, ub
  from public.dm_threads t
  where t.id = thread;
  if ua is null or ub is null then
    return new;
  end if;
  if new.sender_id = ua then
    recipient := ub;
  elsif new.sender_id = ub then
    recipient := ua;
  else
    return new;
  end if;
  if recipient = new.sender_id then
    return new;
  end if;
  if exists (
    select 1 from public.notifications n
    where n.user_id = recipient
      and n.type = 'dm_message'
      and n.data->>'messageId' = new.id::text
  ) then
    return new;
  end if;
  select coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.username), ''), 'Besked')
  into sender_name
  from public.profiles p
  where p.id = new.sender_id;
  preview := case
    when new.image_url is not null and trim(new.image_url) <> '' then '📷 Billede'
    when new.body is not null and trim(new.body) <> '' then left(trim(new.body), 180)
    else 'Ny besked'
  end;
  insert into public.notifications (user_id, actor_user_id, type, title, body, data)
  values (
    recipient,
    new.sender_id,
    'dm_message',
    sender_name,
    preview,
    jsonb_build_object(
      'conversationId', thread::text,
      'messageId', new.id::text,
      'senderId', new.sender_id::text,
      'targetUserId', recipient::text
    )
  );
  return new;
end;
$f$;

drop trigger if exists trg_dm_message_notify on public.dm_messages;
create trigger trg_dm_message_notify
  after insert on public.dm_messages
  for each row
  execute function public.trg_notify_dm_message();
