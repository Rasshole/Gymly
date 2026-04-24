-- In-app notifikationer. Venskab = public.friendships (user_a, user_b).

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  type text not null check (type in (
    'friend_request',
    'friend_request_accepted',
    'friend_checked_in',
    'badge_unlocked',
    'streak_milestone',
    'badge_progress'
  )),
  title text not null,
  body text not null,
  data jsonb default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, is_read) where is_read = false;

create unique index if not exists notifications_dedupe_checkin
  on public.notifications (user_id, (data->>'checkInId'))
  where type = 'friend_checked_in' and data->>'checkInId' is not null;

create unique index if not exists notifications_dedupe_friend_request
  on public.notifications (user_id, (data->>'friendRequestId'))
  where type = 'friend_request' and data->>'friendRequestId' is not null;

create unique index if not exists notifications_dedupe_badge_progress
  on public.notifications (user_id, (data->>'badgeId'), (data->>'progressTier'))
  where type = 'badge_progress' and data->>'badgeId' is not null and data->>'progressTier' is not null;

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "notifications_insert_self" on public.notifications;
create policy "notifications_insert_self"
  on public.notifications for insert
  to authenticated
  with check (user_id = auth.uid());

do $r$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception when undefined_object then null;
end $r$;

do $r$ begin
  if to_regclass('public.notifications') is not null then
    execute 'alter table public.notifications replica identity full';
  end if;
end $r$;

create or replace function public.count_mutual_friends(p_a uuid, p_b uuid)
returns integer
language sql
stable
set search_path = public
as $s$
  with fa as (
    select case when f.user_a = p_a then f.user_b else f.user_a end as uid
    from public.friendships f
    where f.user_a = p_a or f.user_b = p_a
  ),
  fb as (
    select case when f.user_a = p_b then f.user_b else f.user_a end as uid
    from public.friendships f
    where f.user_a = p_b or f.user_b = p_b
  )
  select coalesce((
    select count(*)::int
    from fa
    where uid in (select uid from fb)
      and uid not in (p_a, p_b)
  ), 0);
$s$;

create or replace function public.friend_user_ids(p_uid uuid)
returns setof uuid
language sql
stable
set search_path = public
as $s$
  select case when f.user_a = p_uid then f.user_b else f.user_a end
  from public.friendships f
  where f.user_a = p_uid or f.user_b = p_uid;
$s$;

create or replace function public.are_friends(p_u1 uuid, p_u2 uuid)
returns boolean
language sql
stable
set search_path = public
as $s$
  select exists (
    select 1
    from public.friendships f
    where f.user_a = least(p_u1, p_u2) and f.user_b = greatest(p_u1, p_u2)
  );
$s$;

-- Venneanmodning → modtager
create or replace function public.trg_notify_friend_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $f$
declare
  sender_name text;
  mutual int;
  body_extra text;
begin
  if new.status is distinct from 'pending' then
    return new;
  end if;
  if exists (
    select 1 from public.notifications n
    where n.user_id = new.to_user_id
      and n.type = 'friend_request'
      and n.data->>'friendRequestId' = new.id::text
  ) then
    return new;
  end if;
  select coalesce((
    select coalesce(p.display_name, p.username) from public.profiles p
    where p.id = new.from_user_id
  ), 'Nogen') into sender_name;
  mutual := public.count_mutual_friends(new.from_user_id, new.to_user_id);
  body_extra := format('%s har sendt dig en venneanmodning', sender_name);
  if mutual > 0 then
    body_extra := body_extra || format(E'\n%d fælles venner', mutual);
  end if;
  insert into public.notifications (user_id, actor_user_id, type, title, body, data)
  values (
    new.to_user_id,
    new.from_user_id,
    'friend_request',
    'Venneanmodning',
    body_extra,
    jsonb_build_object(
      'friendRequestId', new.id::text,
      'targetUserId', new.from_user_id::text,
      'mutualFriends', mutual
    )
  );
  return new;
end;
$f$;

-- Check-in → kun bekræftede venskaber (række i public.friendships)
create or replace function public.trg_notify_friends_on_check_in()
returns trigger
language plpgsql
security definer
set search_path = public
as $f$
declare
  fid uuid;
  friend_name text;
  muscles text[];
begin
  for fid in select * from public.friend_user_ids(new.user_id) loop
    if not public.are_friends(new.user_id, fid) then
      continue;
    end if;
    if exists (
      select 1 from public.notifications n
      where n.user_id = fid
        and n.type = 'friend_checked_in'
        and n.data->>'checkInId' = new.id::text
    ) then
      continue;
    end if;
    select coalesce((
      select coalesce(p.display_name, p.username) from public.profiles p
      where p.id = new.user_id
    ), 'En ven') into friend_name;
    muscles := case
      when new.workout_type is null or trim(new.workout_type) = '' then array[]::text[]
      else string_to_array(new.workout_type, ',')
    end;
    insert into public.notifications (user_id, actor_user_id, type, title, body, data)
    values (
      fid,
      new.user_id,
      'friend_checked_in',
      format('%s tjekkede ind', friend_name),
      format('%s er tjekket ind i %s', friend_name, new.gym_name) ||
        case
          when new.workout_type is not null and trim(new.workout_type) <> ''
          then E'\n' || 'Træner: ' || new.workout_type
          else ''
        end,
      jsonb_build_object(
        'checkInId', new.id::text,
        'friendUserId', new.user_id::text,
        'centerId', new.gym_id,
        'centerName', new.gym_name,
        'muscleGroups', to_jsonb(muscles)
      )
    );
  end loop;
  return new;
end;
$f$;

-- Accept → afsender får bekræftelse
create or replace function public.trg_notify_friend_request_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $f$
declare
  accepter_name text;
begin
  if not (old.status = 'pending' and new.status = 'accepted') then
    return new;
  end if;
  select coalesce((
    select coalesce(p.display_name, p.username) from public.profiles p
    where p.id = new.to_user_id
  ), 'Nogen') into accepter_name;
  insert into public.notifications (user_id, actor_user_id, type, title, body, data)
  values (
    new.from_user_id,
    new.to_user_id,
    'friend_request_accepted',
    'Anmodning accepteret',
    format('%s accepterede din venneanmodning', accepter_name),
    jsonb_build_object('targetUserId', new.to_user_id::text)
  );
  return new;
end;
$f$;

drop trigger if exists trg_friend_request_notify on public.friend_requests;
create trigger trg_friend_request_notify
  after insert on public.friend_requests
  for each row
  execute function public.trg_notify_friend_request();

drop trigger if exists trg_check_in_notify_friends on public.check_ins;
create trigger trg_check_in_notify_friends
  after insert on public.check_ins
  for each row
  execute function public.trg_notify_friends_on_check_in();

drop trigger if exists trg_fr_accepted_notify on public.friend_requests;
create trigger trg_fr_accepted_notify
  after update of status on public.friend_requests
  for each row
  execute function public.trg_notify_friend_request_accepted();
