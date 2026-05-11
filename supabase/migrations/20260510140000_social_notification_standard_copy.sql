-- Align notification title/body with standard iOS push banners (same rows power in-app bell + FCM).

-- Friend request → recipient
create or replace function public.trg_notify_friend_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $f$
declare
  sender_name text;
  mutual int;
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
  insert into public.notifications (user_id, actor_user_id, type, title, body, data)
  values (
    new.to_user_id,
    new.from_user_id,
    'friend_request',
    'Ny venneanmodning',
    format('%s vil være venner på Gymly', sender_name),
    jsonb_build_object(
      'friendRequestId', new.id::text,
      'targetUserId', new.from_user_id::text,
      'friendName', sender_name,
      'actorName', sender_name,
      'mutualFriends', mutual
    )
  );
  return new;
end;
$f$;

-- Friend request accepted → original requester
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
    'I er nu venner',
    format('%s accepterede din venneanmodning', accepter_name),
    jsonb_build_object(
      'targetUserId', new.to_user_id::text,
      'friendUserId', new.to_user_id::text,
      'friendName', accepter_name,
      'actorName', accepter_name
    )
  );
  return new;
end;
$f$;

-- Friend checked in → friends
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
  started text;
  workout_label text;
begin
  started := coalesce(new.started_at, new.created_at, now())::text;
  workout_label := case
    when new.workout_type is not null and trim(new.workout_type) <> '' then trim(new.workout_type)
    else 'Træning'
  end;
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
      format('%s er aktiv nu', friend_name),
      format(
        '%s · %s',
        coalesce(nullif(trim(new.gym_name), ''), 'Center'),
        workout_label
      ),
      jsonb_build_object(
        'checkInId', new.id::text,
        'friendUserId', new.user_id::text,
        'friendName', friend_name,
        'actorName', friend_name,
        'centerId', new.gym_id,
        'centerName', new.gym_name,
        'muscleGroups', to_jsonb(muscles),
        'startedAt', started
      )
    );
  end loop;
  return new;
end;
$f$;

-- DM: enrich data keys for clients / FCM (chat_id, thread_id, user_id)
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
      'chat_id', thread::text,
      'thread_id', thread::text,
      'messageId', new.id::text,
      'senderId', new.sender_id::text,
      'user_id', new.sender_id::text,
      'targetUserId', recipient::text
    )
  );
  return new;
end;
$f$;
