-- Gymly grupper: tabeller, RLS, notifikationer, RPC, realtime, check_ins link
-- Kopiér HELE filen ind i Supabase SQL Editor og kør ét script.
-- Kolonner i CREATE TABLE adskilles med KOMMA — aldrig semikolon inde i parentesen.

-- Udvid notifikationstyper
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
    'gymly_group_invite',
    'gymly_group_invite_declined',
    'gymly_group_member_joined',
    'gymly_group_message',
    'gymly_planned_in_group',
    'gymly_group_check_in'
  ));

create table if not exists public.gymly_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_private boolean not null default true,
  center_id text,
  city text,
  focus text,
  image_url text,
  created_by uuid not null references auth.users (id) on delete restrict,
  member_count int not null default 0,
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gymly_group_members (
  group_id uuid not null references public.gymly_groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.gymly_group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.gymly_groups (id) on delete cascade,
  inviter_id uuid not null references auth.users (id) on delete cascade,
  invitee_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (group_id, invitee_id)
);

create table if not exists public.gymly_group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.gymly_groups (id) on delete cascade,
  sender_id uuid references auth.users (id) on delete set null,
  body text,
  message_type text not null default 'text' check (message_type in (
    'text', 'system', 'planned_workout', 'check_in'
  )),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.gymly_group_member_state (
  group_id uuid not null references public.gymly_groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz,
  last_read_message_id uuid,
  primary key (group_id, user_id)
);

create index if not exists gymly_group_members_user_idx
  on public.gymly_group_members (user_id);
create index if not exists gymly_group_invites_invitee_idx
  on public.gymly_group_invites (invitee_id) where status = 'pending';
create index if not exists gymly_group_messages_group_time_idx
  on public.gymly_group_messages (group_id, created_at desc);

-- Er medlem? (bruges i policies)
create or replace function public.gymly_is_group_member(p_group uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $s$
  select exists (
    select 1 from public.gymly_group_members m
    where m.group_id = p_group and m.user_id = p_user
  );
$s$;

-- --- RLS ---
alter table public.gymly_groups enable row level security;
alter table public.gymly_group_members enable row level security;
alter table public.gymly_group_invites enable row level security;
alter table public.gymly_group_messages enable row level security;
alter table public.gymly_group_member_state enable row level security;

drop policy if exists "gymly_groups_select_member" on public.gymly_groups;
create policy "gymly_groups_select_member"
  on public.gymly_groups for select
  to authenticated
  using (public.gymly_is_group_member(id, auth.uid()));

-- Opret kun via public.gymly_create_group (security definer)

drop policy if exists "gymly_groups_update_admin" on public.gymly_groups;
create policy "gymly_groups_update_admin"
  on public.gymly_groups for update
  to authenticated
  using (
    exists (
      select 1 from public.gymly_group_members m
      where m.group_id = gymly_groups.id
        and m.user_id = auth.uid()
        and m.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.gymly_group_members m
      where m.group_id = gymly_groups.id
        and m.user_id = auth.uid()
        and m.role = 'admin'
    )
  );

-- Medlemmer: synlige for medlemmer af samme gruppe
drop policy if exists "gymly_group_members_select" on public.gymly_group_members;
create policy "gymly_group_members_select"
  on public.gymly_group_members for select
  to authenticated
  using (public.gymly_is_group_member(group_id, auth.uid()));

drop policy if exists "gymly_group_invites_select" on public.gymly_group_invites;
create policy "gymly_group_invites_select"
  on public.gymly_group_invites for select
  to authenticated
  using (
    invitee_id = auth.uid()
    or inviter_id = auth.uid()
    or public.gymly_is_group_member(group_id, auth.uid())
  );

-- Beskeder: kun medlemmer
drop policy if exists "gymly_group_messages_select" on public.gymly_group_messages;
create policy "gymly_group_messages_select"
  on public.gymly_group_messages for select
  to authenticated
  using (public.gymly_is_group_member(group_id, auth.uid()));

drop policy if exists "gymly_group_messages_insert_member" on public.gymly_group_messages;
create policy "gymly_group_messages_insert_member"
  on public.gymly_group_messages for insert
  to authenticated
  with check (
    public.gymly_is_group_member(group_id, auth.uid())
    and (sender_id is null or sender_id = auth.uid())
  );

-- Læst-state: egen
drop policy if exists "gymly_group_state_select" on public.gymly_group_member_state;
create policy "gymly_group_state_select"
  on public.gymly_group_member_state for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "gymly_group_state_upsert" on public.gymly_group_member_state;
create policy "gymly_group_state_upsert"
  on public.gymly_group_member_state for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- member_count
create or replace function public.gymly_sync_group_member_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $f$
declare
  g uuid;
  c int;
begin
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    g := new.group_id;
  else
    g := old.group_id;
  end if;
  if g is null then
    return null;
  end if;
  select count(*)::int into c from public.gymly_group_members where group_id = g;
  update public.gymly_groups set member_count = c, updated_at = now() where id = g;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$f$;

drop trigger if exists trg_gymly_member_count on public.gymly_group_members;
create trigger trg_gymly_member_count
  after insert or delete on public.gymly_group_members
  for each row
  execute function public.gymly_sync_group_member_count();

-- Sidste besked på gruppe
create or replace function public.gymly_on_group_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $f$
declare
  prev text;
begin
  prev := case
    when new.body is not null and length(trim(new.body)) > 0
    then left(trim(new.body), 200)
    else coalesce((new.message_type::text) || ' besked', 'Aktivitet')
  end;
  update public.gymly_groups
  set
    last_message_at = new.created_at,
    last_message_preview = prev,
    updated_at = now()
  where id = new.group_id;
  return new;
end;
$f$;

drop trigger if exists trg_gymly_msg_last on public.gymly_group_messages;
create trigger trg_gymly_msg_last
  after insert on public.gymly_group_messages
  for each row
  execute function public.gymly_on_group_message();

-- Invit → notifikation til modtager
create or replace function public.gymly_trg_notify_group_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $f$
declare
  gname text;
  iname text;
begin
  if new.status is distinct from 'pending' then
    return new;
  end if;
  select g.name into gname from public.gymly_groups g where g.id = new.group_id;
  select coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.username), ''), 'Nogen')
  into iname
  from public.profiles p
  where p.id = new.inviter_id;
  if exists (
    select 1 from public.notifications n
    where n.user_id = new.invitee_id
      and n.type = 'gymly_group_invite'
      and n.data->>'groupInviteId' = new.id::text
  ) then
    return new;
  end if;
  insert into public.notifications (user_id, actor_user_id, type, title, body, data)
  values (
    new.invitee_id,
    new.inviter_id,
    'gymly_group_invite',
    'Gruppeinvitation',
    format('%s inviterede dig til gruppen %s', iname, coalesce(gname, 'en gruppe')),
    jsonb_build_object(
      'groupInviteId', new.id::text,
      'groupId', new.group_id::text,
      'groupName', coalesce(gname, '')
    )
  );
  return new;
end;
$f$;

drop trigger if exists trg_gymly_invite_notif on public.gymly_group_invites;
create trigger trg_gymly_invite_notif
  after insert on public.gymly_group_invites
  for each row
  execute function public.gymly_trg_notify_group_invite();

-- Opret gruppe + admin (én transaktion)
create or replace function public.gymly_create_group(
  p_name text,
  p_description text,
  p_is_private boolean,
  p_center_id text,
  p_city text,
  p_focus text,
  p_image_url text
) returns uuid
language plpgsql
security definer
set search_path = public
as $f$
declare
  uid uuid := auth.uid();
  gid uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'name_required';
  end if;
  insert into public.gymly_groups (
    name, description, is_private, center_id, city, focus, image_url, created_by
  )
  values (
    trim(p_name),
    nullif(trim(coalesce(p_description, '')), ''),
    coalesce(p_is_private, true),
    nullif(trim(coalesce(p_center_id, '')), ''),
    nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_focus, '')), ''),
    nullif(trim(coalesce(p_image_url, '')), ''),
    uid
  )
  returning id into gid;

  insert into public.gymly_group_members (group_id, user_id, role)
  values (gid, uid, 'admin');

  insert into public.gymly_group_member_state (group_id, user_id, last_read_at)
  values (gid, uid, now())
  on conflict (group_id, user_id) do update set last_read_at = excluded.last_read_at;

  insert into public.gymly_group_messages (group_id, sender_id, body, message_type, metadata)
  values (gid, uid, 'Gruppen er oprettet', 'system', '{}'::jsonb);

  return gid;
end;
$f$;
grant execute on function public.gymly_create_group(text, text, boolean, text, text, text, text) to authenticated;

-- Invitér
create or replace function public.gymly_invite_to_group(
  p_group_id uuid,
  p_invitee_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $f$
declare
  uid uuid := auth.uid();
  iid uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_invitee_id = uid then
    raise exception 'cannot_invite_self';
  end if;
  if not public.gymly_is_group_member(p_group_id, uid) then
    raise exception 'not_member';
  end if;
  if not public.are_friends(uid, p_invitee_id) then
    raise exception 'not_friends';
  end if;
  if public.gymly_is_group_member(p_group_id, p_invitee_id) then
    raise exception 'already_member';
  end if;
  insert into public.gymly_group_invites (group_id, inviter_id, invitee_id, status)
  values (p_group_id, uid, p_invitee_id, 'pending')
  on conflict (group_id, invitee_id) do nothing
  returning id into iid;
  if iid is null then
    select i.id into iid from public.gymly_group_invites i
    where i.group_id = p_group_id and i.invitee_id = p_invitee_id and i.status = 'pending'
    limit 1;
  end if;
  return iid;
end;
$f$;
grant execute on function public.gymly_invite_to_group(uuid, uuid) to authenticated;

-- Accepter
create or replace function public.gymly_accept_group_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $f$
declare
  uid uuid := auth.uid();
  r record;
  gname text;
  joiner text;
  adm uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  select * into r from public.gymly_group_invites where id = p_invite_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if r.invitee_id is distinct from uid then
    raise exception 'forbidden';
  end if;
  if r.status is distinct from 'pending' then
    raise exception 'not_pending';
  end if;
  update public.gymly_group_invites
  set status = 'accepted', responded_at = now()
  where id = p_invite_id;

  insert into public.gymly_group_members (group_id, user_id, role)
  values (r.group_id, uid, 'member')
  on conflict (group_id, user_id) do nothing;

  delete from public.notifications
  where user_id = uid
    and type = 'gymly_group_invite'
    and data->>'groupInviteId' = p_invite_id::text;

  select g.name into gname from public.gymly_groups g where g.id = r.group_id;
  select coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.username), ''), 'Nogen')
  into joiner
  from public.profiles p where p.id = uid;

  for adm in
    select m.user_id
    from public.gymly_group_members m
    where m.group_id = r.group_id and m.user_id is distinct from uid
  loop
    insert into public.notifications (user_id, actor_user_id, type, title, body, data)
    values (
      adm,
      uid,
      'gymly_group_member_joined',
      'Nyt medlem',
      format('%s er med i %s', joiner, coalesce(gname, 'gruppen')),
      jsonb_build_object('groupId', r.group_id::text, 'groupName', coalesce(gname, ''))
    );
  end loop;
end;
$f$;
grant execute on function public.gymly_accept_group_invite(uuid) to authenticated;

-- Afvis
create or replace function public.gymly_decline_group_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $f$
declare
  uid uuid := auth.uid();
  r record;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  select * into r from public.gymly_group_invites where id = p_invite_id;
  if not found then
    raise exception 'not_found';
  end if;
  if r.invitee_id is distinct from uid then
    raise exception 'forbidden';
  end if;
  if r.status is distinct from 'pending' then
    return;
  end if;
  update public.gymly_group_invites
  set status = 'declined', responded_at = now()
  where id = p_invite_id;

  delete from public.notifications
  where user_id = uid
    and type = 'gymly_group_invite'
    and data->>'groupInviteId' = p_invite_id::text;
end;
$f$;
grant execute on function public.gymly_decline_group_invite(uuid) to authenticated;

-- Forlad (slet egen række i medlemmer)
create or replace function public.gymly_leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $f$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.gymly_is_group_member(p_group_id, uid) then
    return;
  end if;
  delete from public.gymly_group_members
  where group_id = p_group_id and user_id = uid;
  delete from public.gymly_group_member_state
  where group_id = p_group_id and user_id = uid;
end;
$f$;
grant execute on function public.gymly_leave_group(uuid) to authenticated;

-- Send gruppebesked
create or replace function public.gymly_send_group_message(
  p_group_id uuid,
  p_body text,
  p_message_type text
) returns uuid
language plpgsql
security definer
set search_path = public
as $f$
declare
  uid uuid := auth.uid();
  mid uuid;
  t text;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.gymly_is_group_member(p_group_id, uid) then
    raise exception 'not_member';
  end if;
  t := coalesce(nullif(p_message_type, ''), 'text');
  insert into public.gymly_group_messages (group_id, sender_id, body, message_type, metadata)
  values (p_group_id, uid, p_body, t, '{}'::jsonb)
  returning id into mid;
  return mid;
end;
$f$;
grant execute on function public.gymly_send_group_message(uuid, text, text) to authenticated;

-- check_ins: valgfri gruppe
alter table public.check_ins add column if not exists gymly_group_id uuid
  references public.gymly_groups (id) on delete set null;
create index if not exists check_ins_gymly_group_idx
  on public.check_ins (gymly_group_id)
  where gymly_group_id is not null;

-- Planlagt træning i gruppe (fremtidig brug)
alter table public.planned_workouts add column if not exists gymly_group_id uuid
  references public.gymly_groups (id) on delete set null;
create index if not exists planned_workouts_gymly_group_idx
  on public.planned_workouts (gymly_group_id)
  where gymly_group_id is not null;

-- Realtime
do $r$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'gymly_groups') then
    alter publication supabase_realtime add table public.gymly_groups;
  end if;
exception when undefined_object then null;
end $r$;
do $r$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'gymly_group_members') then
    alter publication supabase_realtime add table public.gymly_group_members;
  end if;
exception when undefined_object then null;
end $r$;
do $r$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'gymly_group_invites') then
    alter publication supabase_realtime add table public.gymly_group_invites;
  end if;
exception when undefined_object then null;
end $r$;
do $r$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'gymly_group_messages') then
    alter publication supabase_realtime add table public.gymly_group_messages;
  end if;
exception when undefined_object then null;
end $r$;
do $r$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'gymly_group_member_state') then
    alter publication supabase_realtime add table public.gymly_group_member_state;
  end if;
exception when undefined_object then null;
end $r$;

do $r$ begin
  if to_regclass('public.gymly_groups') is not null then
    execute 'alter table public.gymly_groups replica identity full';
  end if;
  if to_regclass('public.gymly_group_members') is not null then
    execute 'alter table public.gymly_group_members replica identity full';
  end if;
  if to_regclass('public.gymly_group_invites') is not null then
    execute 'alter table public.gymly_group_invites replica identity full';
  end if;
  if to_regclass('public.gymly_group_messages') is not null then
    execute 'alter table public.gymly_group_messages replica identity full';
  end if;
  if to_regclass('public.gymly_group_member_state') is not null then
    execute 'alter table public.gymly_group_member_state replica identity full';
  end if;
end $r$;
