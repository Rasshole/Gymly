-- Undgå dobbelt push: planned_workout_invite sender allerede pæn notifikation;
-- syntetiske chat-rækker [GYM_PLAN_INVITE] / [GYM_PLAN_STATUS] må ikke udløse dm_message-notifikation.

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
  body_trim text;
begin
  body_trim := trim(coalesce(new.body, ''));
  if body_trim like '[GYM_PLAN_INVITE]%' or body_trim like '[GYM_PLAN_STATUS]%' then
    return new;
  end if;

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
