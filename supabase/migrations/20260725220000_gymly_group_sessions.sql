-- Group training sessions: optional link from check-ins to gymly groups
-- Tables: gymly_group_sessions, gymly_group_session_participants
-- Stats via RPC (no cached counters on gymly_groups)

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.gymly_group_sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.gymly_groups (id) on delete cascade,
  gym_id text not null,
  started_by uuid not null references auth.users (id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'active'
    check (status in ('active', 'completed', 'cancelled')),
  qualifies_as_together boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists gymly_group_sessions_one_active_per_group_gym
  on public.gymly_group_sessions (group_id, gym_id)
  where status = 'active';

create index if not exists gymly_group_sessions_group_id_idx
  on public.gymly_group_sessions (group_id, started_at desc);

create table if not exists public.gymly_group_session_participants (
  id uuid primary key default gen_random_uuid(),
  group_session_id uuid not null references public.gymly_group_sessions (id) on delete cascade,
  group_id uuid not null references public.gymly_groups (id) on delete cascade,
  user_id uuid not null references auth.users (id),
  check_in_id uuid not null references public.check_ins (id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  duration_seconds bigint not null default 0,
  unique (group_session_id, user_id),
  unique (check_in_id)
);

create index if not exists gymly_group_session_participants_session_idx
  on public.gymly_group_session_participants (group_session_id);

create index if not exists gymly_group_session_participants_group_idx
  on public.gymly_group_session_participants (group_id, joined_at desc);

create index if not exists gymly_group_session_participants_user_idx
  on public.gymly_group_session_participants (user_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.gymly_group_sessions enable row level security;
alter table public.gymly_group_session_participants enable row level security;

drop policy if exists "gymly_group_sessions_select_member" on public.gymly_group_sessions;
create policy "gymly_group_sessions_select_member"
  on public.gymly_group_sessions for select
  to authenticated
  using (public.gymly_is_group_member(group_id, auth.uid()));

drop policy if exists "gymly_group_session_participants_select_member"
  on public.gymly_group_session_participants;
create policy "gymly_group_session_participants_select_member"
  on public.gymly_group_session_participants for select
  to authenticated
  using (public.gymly_is_group_member(group_id, auth.uid()));

-- Writes only via security definer RPCs

-- ---------------------------------------------------------------------------
-- Overlap helper (≥ 10 minutes between two intervals)
-- ---------------------------------------------------------------------------

create or replace function public.gymly_intervals_overlap_seconds(
  a_start timestamptz,
  a_end timestamptz,
  b_start timestamptz,
  b_end timestamptz
)
returns bigint
language sql
immutable
as $s$
  select greatest(
    0,
    floor(
      extract(
        epoch from (
          least(coalesce(a_end, 'infinity'::timestamptz), coalesce(b_end, 'infinity'::timestamptz))
          - greatest(a_start, b_start)
        )
      )
    )::bigint
  );
$s$;

-- ---------------------------------------------------------------------------
-- Qualify session (idempotent)
-- ---------------------------------------------------------------------------

create or replace function public.gymly_qualify_group_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $f$
declare
  v_qualifies boolean := false;
  r1 record;
  r2 record;
  overlap_s bigint;
begin
  for r1 in
    select
      p.user_id,
      ci.started_at,
      coalesce(p.left_at, ci.ended_at, now()) as end_at
    from public.gymly_group_session_participants p
    join public.check_ins ci on ci.id = p.check_in_id
    where p.group_session_id = p_session_id
  loop
    for r2 in
      select
        p.user_id,
        ci.started_at,
        coalesce(p.left_at, ci.ended_at, now()) as end_at
      from public.gymly_group_session_participants p
      join public.check_ins ci on ci.id = p.check_in_id
      where p.group_session_id = p_session_id
        and p.user_id > r1.user_id
    loop
      overlap_s := public.gymly_intervals_overlap_seconds(
        r1.started_at, r1.end_at, r2.started_at, r2.end_at
      );
      if overlap_s >= 600 then
        v_qualifies := true;
        exit;
      end if;
    end loop;
    exit when v_qualifies;
  end loop;

  update public.gymly_group_sessions
  set qualifies_as_together = v_qualifies
  where id = p_session_id;

  return v_qualifies;
end;
$f$;

-- ---------------------------------------------------------------------------
-- Start or join (race-safe)
-- ---------------------------------------------------------------------------

create or replace function public.gymly_start_or_join_group_session(
  p_group_id uuid,
  p_check_in_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $f$
declare
  uid uuid := auth.uid();
  ci record;
  sid uuid;
  already uuid;
  participant_count int;
  gname text;
  uname text;
  gym_label text;
  member_id uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.gymly_is_group_member(p_group_id, uid) then
    raise exception 'not_member';
  end if;

  select c.id, c.user_id, c.gym_id, c.gym_name, c.is_active, c.ended_at
  into ci
  from public.check_ins c
  where c.id = p_check_in_id
  for update;

  if not found then
    raise exception 'check_in_not_found';
  end if;
  if ci.user_id is distinct from uid then
    raise exception 'forbidden';
  end if;
  if ci.is_active is not true or ci.ended_at is not null then
    raise exception 'check_in_not_active';
  end if;
  if ci.gym_id is null or length(trim(ci.gym_id)) = 0 then
    raise exception 'gym_required';
  end if;

  -- Already linked to a session via this check-in?
  select p.group_session_id into already
  from public.gymly_group_session_participants p
  where p.check_in_id = p_check_in_id;
  if already is not null then
    return already;
  end if;

  update public.check_ins
  set gymly_group_id = p_group_id
  where id = p_check_in_id;

  -- Find or create active session for group + gym
  select s.id into sid
  from public.gymly_group_sessions s
  where s.group_id = p_group_id
    and s.gym_id = ci.gym_id
    and s.status = 'active'
  for update;

  if sid is null then
    begin
      insert into public.gymly_group_sessions (
        group_id, gym_id, started_by, status
      )
      values (p_group_id, ci.gym_id, uid, 'active')
      returning id into sid;
    exception
      when unique_violation then
        select s.id into sid
        from public.gymly_group_sessions s
        where s.group_id = p_group_id
          and s.gym_id = ci.gym_id
          and s.status = 'active';
        if sid is null then
          raise;
        end if;
    end;
  end if;

  insert into public.gymly_group_session_participants (
    group_session_id, group_id, user_id, check_in_id
  )
  values (sid, p_group_id, uid, p_check_in_id)
  on conflict (group_session_id, user_id) do nothing;

  select count(*)::int into participant_count
  from public.gymly_group_session_participants
  where group_session_id = sid;

  -- Notify other members only when first participant starts the session
  if participant_count = 1 then
    select g.name into gname from public.gymly_groups g where g.id = p_group_id;
    select coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.username), ''), 'Nogen')
    into uname
    from public.profiles p where p.id = uid;
    gym_label := coalesce(nullif(trim(ci.gym_name), ''), 'centret');

    for member_id in
      select m.user_id
      from public.gymly_group_members m
      where m.group_id = p_group_id
        and m.user_id is distinct from uid
    loop
      insert into public.notifications (user_id, actor_user_id, type, title, body, data)
      values (
        member_id,
        uid,
        'gymly_group_check_in',
        'Gruppetræning',
        format('%s træner med %s i %s. Vil du være med?', uname, coalesce(gname, 'gruppen'), gym_label),
        jsonb_build_object(
          'groupId', p_group_id::text,
          'groupName', coalesce(gname, ''),
          'groupSessionId', sid::text,
          'gymId', ci.gym_id,
          'gymName', gym_label
        )
      );
    end loop;
  end if;

  return sid;
end;
$f$;
grant execute on function public.gymly_start_or_join_group_session(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Complete participant (call after check-in ends)
-- ---------------------------------------------------------------------------

create or replace function public.gymly_complete_group_participant(p_check_in_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $f$
declare
  uid uuid := auth.uid();
  part record;
  ci record;
  remaining int;
  dur_s bigint;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into part
  from public.gymly_group_session_participants
  where check_in_id = p_check_in_id
  for update;

  if not found then
    return;
  end if;

  -- Allow owner or system (same user as participant)
  if part.user_id is distinct from uid then
    -- Also allow if the check-in belongs to uid (should be same)
    if not exists (
      select 1 from public.check_ins c
      where c.id = p_check_in_id and c.user_id = uid
    ) then
      raise exception 'forbidden';
    end if;
  end if;

  select * into ci from public.check_ins where id = p_check_in_id;

  if part.left_at is null then
    dur_s := greatest(
      0,
      floor(
        extract(
          epoch from (
            coalesce(ci.ended_at, now()) - coalesce(ci.started_at, part.joined_at)
          )
        )
      )::bigint
    );
    -- Prefer duration_minutes when set
    if ci.duration_minutes is not null and ci.duration_minutes > 0 then
      dur_s := (ci.duration_minutes::bigint) * 60;
    end if;

    update public.gymly_group_session_participants
    set
      left_at = coalesce(ci.ended_at, now()),
      duration_seconds = dur_s
    where id = part.id;
  end if;

  select count(*)::int into remaining
  from public.gymly_group_session_participants p
  where p.group_session_id = part.group_session_id
    and p.left_at is null;

  if remaining = 0 then
    update public.gymly_group_sessions
    set
      status = 'completed',
      ended_at = coalesce(ended_at, now())
    where id = part.group_session_id
      and status = 'active';

    perform public.gymly_qualify_group_session(part.group_session_id);
  end if;
end;
$f$;
grant execute on function public.gymly_complete_group_participant(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Stats RPC
-- ---------------------------------------------------------------------------

create or replace function public.gymly_get_group_stats(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $f$
declare
  uid uuid := auth.uid();
  together_count int := 0;
  total_seconds bigint := 0;
  mem_count int := 0;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.gymly_is_group_member(p_group_id, uid) then
    raise exception 'not_member';
  end if;

  select count(*)::int into mem_count
  from public.gymly_group_members
  where group_id = p_group_id;

  select count(*)::int into together_count
  from public.gymly_group_sessions s
  where s.group_id = p_group_id
    and s.qualifies_as_together = true;

  select coalesce(sum(p.duration_seconds), 0)::bigint into total_seconds
  from public.gymly_group_session_participants p
  join public.gymly_group_sessions s on s.id = p.group_session_id
  where s.group_id = p_group_id
    and s.qualifies_as_together = true;

  return jsonb_build_object(
    'togetherSessionCount', together_count,
    'totalDurationSeconds', total_seconds,
    'memberCount', mem_count
  );
end;
$f$;
grant execute on function public.gymly_get_group_stats(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Active session + participants
-- ---------------------------------------------------------------------------

create or replace function public.gymly_get_active_group_session(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $f$
declare
  uid uuid := auth.uid();
  s record;
  parts jsonb;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.gymly_is_group_member(p_group_id, uid) then
    raise exception 'not_member';
  end if;

  select *
  into s
  from public.gymly_group_sessions
  where group_id = p_group_id
    and status = 'active'
  order by started_at desc
  limit 1;

  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'userId', p.user_id,
      'displayName', coalesce(nullif(trim(pr.display_name), ''), nullif(trim(pr.username), ''), 'Bruger'),
      'avatarUrl', pr.avatar_url,
      'joinedAt', p.joined_at,
      'checkInId', p.check_in_id
    )
    order by p.joined_at
  ), '[]'::jsonb)
  into parts
  from public.gymly_group_session_participants p
  left join public.profiles pr on pr.id = p.user_id
  where p.group_session_id = s.id
    and p.left_at is null;

  return jsonb_build_object(
    'id', s.id,
    'groupId', s.group_id,
    'gymId', s.gym_id,
    'gymName', (
      select ci.gym_name
      from public.gymly_group_session_participants p
      join public.check_ins ci on ci.id = p.check_in_id
      where p.group_session_id = s.id
      order by p.joined_at
      limit 1
    ),
    'startedBy', s.started_by,
    'startedAt', s.started_at,
    'status', s.status,
    'participants', parts
  );
end;
$f$;
grant execute on function public.gymly_get_active_group_session(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Recent qualified sessions
-- ---------------------------------------------------------------------------

create or replace function public.gymly_list_recent_group_sessions(
  p_group_id uuid,
  p_limit int default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $f$
declare
  uid uuid := auth.uid();
  out jsonb;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.gymly_is_group_member(p_group_id, uid) then
    raise exception 'not_member';
  end if;

  select coalesce(jsonb_agg(row_data order by started_at desc), '[]'::jsonb)
  into out
  from (
    select
      jsonb_build_object(
        'id', s.id,
        'gymId', s.gym_id,
        'gymName', (
          select ci.gym_name
          from public.gymly_group_session_participants p
          join public.check_ins ci on ci.id = p.check_in_id
          where p.group_session_id = s.id
          order by p.joined_at
          limit 1
        ),
        'startedAt', s.started_at,
        'endedAt', s.ended_at,
        'totalDurationSeconds', (
          select coalesce(sum(p.duration_seconds), 0)::bigint
          from public.gymly_group_session_participants p
          where p.group_session_id = s.id
        ),
        'participantNames', (
          select coalesce(jsonb_agg(
            coalesce(nullif(trim(pr.display_name), ''), nullif(trim(pr.username), ''), 'Bruger')
            order by p.joined_at
          ), '[]'::jsonb)
          from public.gymly_group_session_participants p
          left join public.profiles pr on pr.id = p.user_id
          where p.group_session_id = s.id
        )
      ) as row_data,
      s.started_at
    from public.gymly_group_sessions s
    where s.group_id = p_group_id
      and s.qualifies_as_together = true
    order by s.started_at desc
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  ) q;

  return out;
end;
$f$;
grant execute on function public.gymly_list_recent_group_sessions(uuid, int) to authenticated;

-- Realtime (optional)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'gymly_group_sessions'
  ) then
    alter publication supabase_realtime add table public.gymly_group_sessions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'gymly_group_session_participants'
  ) then
    alter publication supabase_realtime add table public.gymly_group_session_participants;
  end if;
exception when others then
  null;
end $$;
