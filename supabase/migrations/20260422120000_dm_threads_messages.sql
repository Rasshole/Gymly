-- 1:1 DM-threads + beskeder (Messenger/Instagram-lignende) med RLS + Realtime
-- Efter kør: beskeder persisteres og sync’es live mellem enheder.

-- Tabeller
create table if not exists public.dm_threads (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  last_message_at timestamptz,
  last_message_preview text,
  last_sender_id uuid references auth.users (id) on delete set null,
  constraint dm_threads_ordered check (user_a < user_b),
  constraint dm_threads_unique_pair unique (user_a, user_b)
);

create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.dm_threads (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text,
  image_url text,
  created_at timestamptz not null default now(),
  constraint dm_messages_body_or_image check (
    (coalesce(trim(body), '') <> '') or (image_url is not null and trim(image_url) <> '')
  )
);

create index if not exists dm_messages_thread_created_idx
  on public.dm_messages (thread_id, created_at desc);

-- Opdater tråd ved ny besked (definer, så RLS ikke blokerer thread-update)
create or replace function public.dm_set_thread_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.dm_threads
  set
    last_message_at = new.created_at,
    last_message_preview = case
      when new.image_url is not null and trim(new.image_url) <> '' and (new.body is null or trim(new.body) = '') then
        'Billede'
      else
        left(coalesce(trim(new.body), ''), 200)
    end,
    last_sender_id = new.sender_id
  where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists dm_messages_after_insert_thread on public.dm_messages;
create trigger dm_messages_after_insert_thread
  after insert on public.dm_messages
  for each row
  execute function public.dm_set_thread_on_message();

-- Hent/Opret tråd (kun hvis I er venner)
create or replace function public.get_or_create_dm_thread (p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  u uuid := auth.uid();
  a uuid; b uuid; tid uuid;
  is_friend boolean;
begin
  if u is null then
    raise exception 'not authenticated';
  end if;
  if p_other_user_id = u then
    raise exception 'invalid peer';
  end if;
  a := least(u, p_other_user_id);
  b := greatest(u, p_other_user_id);
  select exists (
    select 1
    from public.friendships f
    where f.user_a = a and f.user_b = b
  ) into is_friend;
  if not is_friend then
    raise exception 'not_friends' using errcode = 'P0001';
  end if;
  select t.id
    into tid
  from public.dm_threads t
  where t.user_a = a and t.user_b = b
  limit 1;
  if tid is not null then
    return tid;
  end if;
  insert into public.dm_threads (user_a, user_b)
  values (a, b)
  returning id into tid;
  return tid;
end;
$fn$;

grant execute on function public.get_or_create_dm_thread (uuid) to authenticated;

-- RLS
alter table public.dm_threads enable row level security;
alter table public.dm_messages enable row level security;

drop policy if exists "dm_threads_select_if_member" on public.dm_threads;
create policy "dm_threads_select_if_member"
  on public.dm_threads for select
  to authenticated
  using (auth.uid() in (user_a, user_b));

-- Kun via RPC definerer vi rækker; direkte insert kan slås fra:
drop policy if exists "dm_threads_no_direct_insert" on public.dm_threads;
create policy "dm_threads_no_direct_insert"
  on public.dm_threads for insert
  to authenticated
  with check (false);

drop policy if exists "dm_threads_no_update" on public.dm_threads;
create policy "dm_threads_no_update"
  on public.dm_threads for update
  to authenticated
  using (false)
  with check (false);

drop policy if exists "dm_messages_select_if_member" on public.dm_messages;
create policy "dm_messages_select_if_member"
  on public.dm_messages for select
  to authenticated
  using (
    exists (
      select 1
      from public.dm_threads t
      where t.id = dm_messages.thread_id
        and auth.uid() in (t.user_a, t.user_b)
    )
  );

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
    )
  );

-- Realtime (klient får kun rækker RLS tillader)
do $r$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dm_messages'
  ) then
    alter publication supabase_realtime add table public.dm_messages;
  end if;
exception
  when undefined_object then
    null;
end $r$;

do $r$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dm_threads'
  ) then
    alter publication supabase_realtime add table public.dm_threads;
  end if;
exception
  when undefined_object then
    null;
end $r$;
