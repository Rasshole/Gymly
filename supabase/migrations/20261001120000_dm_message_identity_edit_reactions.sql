-- Stable send identity, edits, replies and reactions for 1:1 messages.
-- Same text sent twice stays two rows. A retry reuses client_send_id.

alter table public.dm_messages
  add column if not exists client_send_id uuid,
  add column if not exists edited_at timestamptz,
  add column if not exists reply_to_id uuid references public.dm_messages (id) on delete set null,
  add column if not exists reactions jsonb not null default '{}'::jsonb;

create unique index if not exists dm_messages_sender_client_send_uidx
  on public.dm_messages (sender_id, client_send_id)
  where client_send_id is not null;

create index if not exists dm_messages_reply_to_idx
  on public.dm_messages (reply_to_id)
  where reply_to_id is not null;

-- Sender may update their own row. Body changes are still checked in edit_dm_message.
drop policy if exists "dm_messages_update_own" on public.dm_messages;
create policy "dm_messages_update_own"
  on public.dm_messages for update
  to authenticated
  using (
    sender_id = auth.uid()
    and exists (
      select 1
      from public.dm_threads t
      where t.id = dm_messages.thread_id
        and auth.uid() in (t.user_a, t.user_b)
    )
  )
  with check (
    sender_id = auth.uid()
    and exists (
      select 1
      from public.dm_threads t
      where t.id = dm_messages.thread_id
        and auth.uid() in (t.user_a, t.user_b)
    )
  );

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
    last_message_at = case
      when tg_op = 'INSERT' then new.created_at
      else last_message_at
    end,
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
      tg_op = 'INSERT'
      or last_message_at is null
      or last_message_at <= new.created_at
    );
  return new;
end;
$tr$;

create or replace function public.dm_messages_validate_reply()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if new.reply_to_id is null then
    return new;
  end if;
  if not exists (
    select 1
    from public.dm_messages m
    where m.id = new.reply_to_id
      and m.thread_id = new.thread_id
  ) then
    raise exception 'reply outside thread';
  end if;
  return new;
end;
$fn$;

drop trigger if exists dm_messages_validate_reply on public.dm_messages;
create trigger dm_messages_validate_reply
  before insert or update of reply_to_id on public.dm_messages
  for each row
  execute function public.dm_messages_validate_reply();

drop trigger if exists dm_messages_after_insert_thread on public.dm_messages;
drop trigger if exists dm_messages_after_write_thread on public.dm_messages;
create trigger dm_messages_after_write_thread
  after insert or update of body, image_url on public.dm_messages
  for each row
  execute function public.dm_refresh_thread_preview();

create or replace function public.edit_dm_message(p_message_id uuid, p_body text)
returns public.dm_messages
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_row public.dm_messages;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'empty body';
  end if;

  select * into v_row
  from public.dm_messages
  where id = p_message_id;

  if v_row.id is null then
    raise exception 'not found';
  end if;
  if v_row.sender_id <> v_uid then
    raise exception 'not owner';
  end if;
  if not exists (
    select 1
    from public.dm_threads t
    where t.id = v_row.thread_id
      and v_uid in (t.user_a, t.user_b)
  ) then
    raise exception 'not a member';
  end if;

  update public.dm_messages
  set
    body = trim(p_body),
    edited_at = now()
  where id = p_message_id
    and sender_id = v_uid
  returning * into v_row;

  return v_row;
end;
$fn$;

revoke all on function public.edit_dm_message(uuid, text) from public;
grant execute on function public.edit_dm_message(uuid, text) to authenticated;

create or replace function public.set_dm_reaction(p_message_id uuid, p_emoji text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_thread uuid;
  v_reactions jsonb;
  v_current text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select thread_id, reactions
  into v_thread, v_reactions
  from public.dm_messages
  where id = p_message_id;

  if v_thread is null then
    raise exception 'not found';
  end if;
  if not exists (
    select 1
    from public.dm_threads t
    where t.id = v_thread
      and v_uid in (t.user_a, t.user_b)
  ) then
    raise exception 'not a member';
  end if;

  v_reactions := coalesce(v_reactions, '{}'::jsonb);
  v_current := v_reactions ->> v_uid::text;

  if p_emoji is null or length(trim(p_emoji)) = 0 or v_current = p_emoji then
    v_reactions := v_reactions - v_uid::text;
  else
    if p_emoji not in ('💪', '❤️', '😂', '🔥', '👍') then
      raise exception 'invalid emoji';
    end if;
    v_reactions := jsonb_set(v_reactions, array[v_uid::text], to_jsonb(p_emoji), true);
  end if;

  update public.dm_messages
  set reactions = v_reactions
  where id = p_message_id;

  return v_reactions;
end;
$fn$;

revoke all on function public.set_dm_reaction(uuid, text) from public;
grant execute on function public.set_dm_reaction(uuid, text) to authenticated;
