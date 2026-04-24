-- Planlagte træninger med venner: DB + notifikationer + tjek-ind link

-- Udvid notification-typer
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
    'planned_workout_reminder'
  ));

create unique index if not exists notifications_dedupe_planned_invite
  on public.notifications (user_id, (data->>'plannedWorkoutId'))
  where type = 'planned_workout_invite' and data->>'plannedWorkoutId' is not null;

-- Hovedtabel
create table if not exists public.planned_workouts (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references auth.users (id) on delete cascade,
  center_id text not null,
  center_name text not null,
  scheduled_at timestamptz not null,
  training_types text[] not null default '{}',
  note text,
  status text not null default 'active' check (status in ('active', 'cancelled', 'completed')),
  thread_id uuid references public.dm_threads (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists planned_workouts_scheduled_idx
  on public.planned_workouts (scheduled_at asc);
create index if not exists planned_workouts_creator_idx
  on public.planned_workouts (creator_user_id);
create index if not exists planned_workouts_thread_idx
  on public.planned_workouts (thread_id);

create table if not exists public.planned_workout_participants (
  id uuid primary key default gen_random_uuid(),
  planned_workout_id uuid not null references public.planned_workouts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('creator', 'invitee')),
  response_status text not null default 'pending' check (
    response_status in ('pending', 'accepted', 'declined')
  ),
  responded_at timestamptz,
  unique (planned_workout_id, user_id)
);

create index if not exists planned_workout_participants_user_idx
  on public.planned_workout_participants (user_id);
create index if not exists planned_workout_participants_pw_idx
  on public.planned_workout_participants (planned_workout_id);

alter table public.planned_workouts enable row level security;
alter table public.planned_workout_participants enable row level security;

drop policy if exists "planned_workouts_select_participant" on public.planned_workouts;
create policy "planned_workouts_select_participant"
  on public.planned_workouts for select
  to authenticated
  using (
    exists (
      select 1 from public.planned_workout_participants p
      where p.planned_workout_id = planned_workouts.id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists "planned_workout_participants_select_own" on public.planned_workout_participants;
drop policy if exists "planned_workout_participants_select_shared" on public.planned_workout_participants;
create policy "planned_workout_participants_select_participant"
  on public.planned_workout_participants for select
  to authenticated
  using (
    exists (
      select 1 from public.planned_workout_participants me
      where me.planned_workout_id = planned_workout_participants.planned_workout_id
        and me.user_id = auth.uid()
    )
  );

-- Tjek-ind: link til plan (valgfrit)
alter table public.check_ins add column if not exists planned_workout_id uuid
  references public.planned_workouts (id) on delete set null;

create index if not exists check_ins_planned_workout_idx
  on public.check_ins (planned_workout_id)
  where planned_workout_id is not null;

-- Realtime
do $r$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'planned_workouts'
  ) then
    alter publication supabase_realtime add table public.planned_workouts;
  end if;
exception when undefined_object then null;
end $r$;

do $r$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'planned_workout_participants'
  ) then
    alter publication supabase_realtime add table public.planned_workout_participants;
  end if;
exception when undefined_object then null;
end $r$;

do $r$ begin
  if to_regclass('public.planned_workouts') is not null then
    execute 'alter table public.planned_workouts replica identity full';
  end if;
  if to_regclass('public.planned_workout_participants') is not null then
    execute 'alter table public.planned_workout_participants replica identity full';
  end if;
end $r$;

-- Hjælpetekst til notifikation (dansk kort dato)
create or replace function public._format_planned_workout_body(
  p_center text,
  p_scheduled timestamptz,
  p_types text[]
) returns text
language sql
stable
as $s$
  select coalesce(trim(p_center), 'Center') || E'\n' ||
    to_char(p_scheduled at time zone 'Europe/Copenhagen', 'TMday DD. TMmonth YYYY • HH24:MI')
    || case
      when p_types is null or array_length(p_types, 1) is null or array_length(p_types, 1) = 0
      then ''
      else E'\n' || array_to_string(p_types, ', ')
    end;
$s$;

create or replace function public.create_planned_workout_invite(
  p_invitee_id uuid,
  p_center_id text,
  p_center_name text,
  p_scheduled_at timestamptz,
  p_training_types text[],
  p_note text,
  p_thread_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $f$
declare
  uid uuid := auth.uid();
  pw_id uuid;
  inviter_name text;
  body_text text;
  note_clean text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_invitee_id = uid then
    raise exception 'cannot_invite_self';
  end if;
  if not public.are_friends(uid, p_invitee_id) then
    raise exception 'not_friends';
  end if;

  note_clean := nullif(trim(coalesce(p_note, '')), '');

  insert into planned_workouts (
    creator_user_id, center_id, center_name, scheduled_at, training_types, note, status, thread_id
  )
  values (
    uid, p_center_id, p_center_name, p_scheduled_at,
    coalesce(p_training_types, '{}'),
    note_clean,
    'active',
    p_thread_id
  )
  returning id into pw_id;

  insert into planned_workout_participants (planned_workout_id, user_id, role, response_status, responded_at)
  values (pw_id, uid, 'creator', 'accepted', now());

  insert into planned_workout_participants (planned_workout_id, user_id, role, response_status)
  values (pw_id, p_invitee_id, 'invitee', 'pending');

  select coalesce(nullif(trim(display_name), ''), nullif(trim(username), ''), 'Nogen')
  into inviter_name from profiles where id = uid;

  body_text := public._format_planned_workout_body(p_center_name, p_scheduled_at, coalesce(p_training_types, '{}'));
  if note_clean is not null then
    body_text := body_text || E'\n' || note_clean;
  end if;

  insert into public.notifications (user_id, actor_user_id, type, title, body, data)
  values (
    p_invitee_id,
    uid,
    'planned_workout_invite',
    inviter_name || ' inviterede dig til træning',
    body_text,
    jsonb_build_object(
      'plannedWorkoutId', pw_id::text,
      'centerId', p_center_id,
      'centerName', p_center_name,
      'scheduledAt', p_scheduled_at::text,
      'trainingTypes', to_jsonb(coalesce(p_training_types, '{}')),
      'threadId', case when p_thread_id is null then null else p_thread_id::text end
    )
  );

  return pw_id;
end;
$f$;

grant execute on function public.create_planned_workout_invite(uuid, text, text, timestamptz, text[], text, uuid) to authenticated;

create or replace function public.respond_planned_workout_invite(
  p_planned_workout_id uuid,
  p_accept boolean
) returns void
language plpgsql
security definer
set search_path = public
as $f$
declare
  uid uuid := auth.uid();
  pw record;
  invitee_name text;
  creator_uid uuid;
  n int;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select pw.* into pw from planned_workouts pw where pw.id = p_planned_workout_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if pw.status <> 'active' then
    raise exception 'not_active';
  end if;

  update public.planned_workout_participants
  set
    response_status = case when p_accept then 'accepted' else 'declined' end,
    responded_at = now()
  where planned_workout_id = p_planned_workout_id
    and user_id = uid
    and role = 'invitee';

  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'not_invitee';
  end if;

  select coalesce(nullif(trim(display_name), ''), nullif(trim(username), ''), 'Nogen')
  into invitee_name from profiles where id = uid;

  creator_uid := pw.creator_user_id;

  if p_accept then
    insert into public.notifications (user_id, actor_user_id, type, title, body, data)
    values (
      creator_uid,
      uid,
      'planned_workout_accepted',
      invitee_name || ' er med',
      public._format_planned_workout_body(pw.center_name, pw.scheduled_at, pw.training_types),
      jsonb_build_object(
        'plannedWorkoutId', pw.id::text,
        'centerId', pw.center_id,
        'centerName', pw.center_name,
        'scheduledAt', pw.scheduled_at::text,
        'threadId', case when pw.thread_id is null then null else pw.thread_id::text end
      )
    );
  else
    insert into public.notifications (user_id, actor_user_id, type, title, body, data)
    values (
      creator_uid,
      uid,
      'planned_workout_declined',
      invitee_name || ' sagde nej tak',
      public._format_planned_workout_body(pw.center_name, pw.scheduled_at, pw.training_types),
      jsonb_build_object(
        'plannedWorkoutId', pw.id::text,
        'centerId', pw.center_id,
        'threadId', case when pw.thread_id is null then null else pw.thread_id::text end
      )
    );
  end if;

  update public.notifications
  set is_read = true
  where user_id = uid
    and type = 'planned_workout_invite'
    and data->>'plannedWorkoutId' = p_planned_workout_id::text;
end;
$f$;

grant execute on function public.respond_planned_workout_invite(uuid, boolean) to authenticated;

comment on function public.create_planned_workout_invite is 'Opretter plan + deltager + notifikation til invitee (SECURITY DEFINER).';
comment on function public.respond_planned_workout_invite is 'Invitee accepterer/afviser; notificerer creator.';

-- Når begge deltagere har tjek-ind med samme planlagte træning → marker plan som gennemført
create or replace function public.trg_check_in_planned_pair_complete()
returns trigger
language plpgsql
security definer
set search_path = public
as $f$
declare
  partner_id uuid;
  n int;
begin
  if new.planned_workout_id is null then
    return new;
  end if;
  select p.user_id into partner_id
  from public.planned_workout_participants p
  where p.planned_workout_id = new.planned_workout_id
    and p.user_id <> new.user_id
    and p.response_status = 'accepted'
  limit 1;
  if partner_id is null then
    return new;
  end if;
  select count(distinct c.user_id) into n
  from public.check_ins c
  where c.planned_workout_id = new.planned_workout_id
    and c.user_id in (new.user_id, partner_id);
  if n >= 2 then
    update public.planned_workouts
    set
      status = 'completed',
      completed_at = coalesce(completed_at, now())
    where id = new.planned_workout_id
      and status = 'active';
  end if;
  return new;
end;
$f$;

drop trigger if exists trg_check_in_planned_pair on public.check_ins;
create trigger trg_check_in_planned_pair
  after insert on public.check_ins
  for each row
  execute function public.trg_check_in_planned_pair_complete();
