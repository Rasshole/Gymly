-- Delivery is confirmed only when the other participant's client has the row.
-- Opening the thread still marks it read, and also records delivery.

create or replace function public.mark_dm_thread_messages_delivered(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1
    from public.dm_threads t
    where t.id = p_thread_id
      and uid in (t.user_a, t.user_b)
  ) then
    raise exception 'not a member';
  end if;

  update public.dm_messages m
  set delivered_at = coalesce(m.delivered_at, timezone('utc', now()))
  where m.thread_id = p_thread_id
    and m.sender_id is distinct from uid
    and m.delivered_at is null;
end;
$fn$;

create or replace function public.dm_refresh_thread_preview()
returns trigger
language plpgsql
security definer
set search_path = public
as $tr$
begin
  if tg_op = 'UPDATE'
     and new.body is not distinct from old.body
     and new.image_url is not distinct from old.image_url then
    return new;
  end if;

  update public.dm_threads
  set
    last_message_at = new.created_at,
    last_message_preview = case
      when new.image_url is not null
        and trim(new.image_url) <> ''
        and (new.body is null or trim(new.body) = '') then
        'Billede'
      else
        left(coalesce(trim(new.body), ''), 200)
    end,
    last_sender_id = new.sender_id
  where id = new.thread_id
    and (
      last_message_at is null
      or last_message_at <= new.created_at
    );
  return new;
end;
$tr$;

revoke all on function public.mark_dm_thread_messages_delivered(uuid) from public;
grant execute on function public.mark_dm_thread_messages_delivered(uuid) to authenticated;

create or replace function public.mark_dm_thread_messages_read(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1
    from public.dm_threads t
    where t.id = p_thread_id
      and uid in (t.user_a, t.user_b)
  ) then
    raise exception 'not_in_thread' using errcode = 'P0001';
  end if;

  update public.dm_messages m
  set
    read_at = coalesce(m.read_at, timezone('utc', now())),
    delivered_at = coalesce(m.delivered_at, timezone('utc', now()))
  where m.thread_id = p_thread_id
    and m.sender_id is distinct from uid
    and (m.read_at is null or m.delivered_at is null);
end;
$fn$;
