-- DM read receipts: recipient sets read_at; sender sees "Læst" via Realtime UPDATE

alter table public.dm_messages
  add column if not exists read_at timestamptz;

comment on column public.dm_messages.read_at is
  'When the other participant opened the thread; null until marked read.';

-- Realtime UPDATE payloads need old row for filters; FULL is standard for partial updates.
alter table public.dm_messages replica identity full;

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
  set read_at = coalesce(m.read_at, timezone('utc', now()))
  where m.thread_id = p_thread_id
    and m.sender_id is distinct from uid
    and m.read_at is null;
end;
$fn$;

revoke all on function public.mark_dm_thread_messages_read(uuid) from PUBLIC;
grant execute on function public.mark_dm_thread_messages_read(uuid) to authenticated;
