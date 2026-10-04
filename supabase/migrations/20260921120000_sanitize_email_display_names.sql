-- Sanitize email-like values from public display-name columns + prevent reintroduction.
-- Scope:
--   profiles.display_name
--   check_ins.user_display_name
--   workout_live_sessions.user_display_name
--   posts.author_display_name
-- RPCs that read profiles (display_name_for_user, gymly_leaderboard when present) use safe helpers.
--
-- Source of truth in this repo: migration files under supabase/migrations/.
-- This file does NOT prove the live production schema matches; verify on the target DB
-- before apply (column nullability, RLS, existing triggers).
--
-- Safe for older clients: triggers REWRITE email-like names; they do NOT raise and must
-- not abort check-in / profile upsert / live-session heartbeat / post insert.
--
-- Missing-name sentinel: empty string '' (schema: text not null default '').
-- App treats '' as unusable → onboarding / UI neutral fallback (no local-part-from-email).
--
-- BEFORE PRODUCTION: take a verified platform snapshot / logical backup of the target DB.
-- gymly_ops cleanup rows alone are NOT a sufficient restore strategy.
--
-- DO NOT apply to production from CI without an explicit ops step. Backup rows stay in
-- schema gymly_ops (DB only) — never dump old_value into Git or chat logs.
--
-- Retention (gymly_ops.display_name_email_cleanup_20260921):
--   Keep ≥ 30 days after successful prod verify, then DROP TABLE (or truncate) under
--   privileged role only. Do not export contents. Re-run dry-run counts before drop.

-- ---------------------------------------------------------------------------
-- Helpers (shared)
-- ---------------------------------------------------------------------------
create or replace function public.is_email_like_display_name(p text)
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $f$
  select case
    when p is null then false
    when length(btrim(p)) = 0 then false
    when btrim(p) ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' then true
    when btrim(p) ~* '@privaterelay\.appleid\.com$' then true
    when position('@' in btrim(p)) > 0
      and position(' ' in btrim(p)) = 0
      and (length(btrim(p)) - length(replace(btrim(p), '@', ''))) = 1
      and position('.' in split_part(btrim(p), '@', 2)) > 0
    then true
    else false
  end;
$f$;

comment on function public.is_email_like_display_name(text) is
  'True when text looks like an email (incl. Apple private relay). Used for public name sanitization.';

create or replace function public.is_usable_public_display_name(p text)
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $f$
  select case
    when p is null then false
    when char_length(btrim(p)) < 2 then false
    when public.is_email_like_display_name(p) then false
    when btrim(p) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then false
    when btrim(p) ~* '^u_[0-9a-f]{8,}$' then false
    when lower(btrim(p)) in (
      'gymly-bruger',
      'gymly bruger',
      'gymly user',
      'gymly member',
      'gymly-medlem',
      'gymly medlem',
      'gymly-bruker',
      'gymly-användare',
      'ukendt bruger',
      'unknown user',
      'ukjent bruker',
      'okänd användare',
      'bruger',
      'en bruger',
      'user'
    ) then false
    else true
  end;
$f$;

comment on function public.is_usable_public_display_name(text) is
  'Mirrors app isUsablePublicDisplayName for DB cleanup/triggers. Empty/email/UUID/bootstrap/neutral = false.';

-- Prefer a usable profile display_name, else usable username (never), else ''.
-- Never derives a name from email local-part.
create or replace function public.resolved_profile_public_display_name(p_user_id uuid)
returns text
language sql
stable
security invoker
set search_path = public
as $f$
  select coalesce(
    case
      when public.is_usable_public_display_name(p.display_name) then btrim(p.display_name)
      else null
    end,
    case
      when public.is_usable_public_display_name(p.username) then btrim(p.username)
      else null
    end,
    ''
  )
  from public.profiles p
  where p.id = p_user_id;
$f$;

create or replace function public.sanitize_incoming_public_display_name(
  p_raw text,
  p_user_id uuid
)
returns text
language plpgsql
stable
security invoker
set search_path = public
as $f$
declare
  v_raw text := coalesce(p_raw, '');
  v_from_profile text;
begin
  if public.is_usable_public_display_name(v_raw) then
    return btrim(v_raw);
  end if;
  -- Email-like or otherwise unusable: try profile, else schema-compatible empty string.
  if p_user_id is not null then
    v_from_profile := public.resolved_profile_public_display_name(p_user_id);
    if public.is_usable_public_display_name(v_from_profile) then
      return btrim(v_from_profile);
    end if;
  end if;
  return '';
end;
$f$;

-- ---------------------------------------------------------------------------
-- Triggers: rewrite only; never RAISE on bad names (compat with old clients)
-- ---------------------------------------------------------------------------
create or replace function public.trg_profiles_sanitize_display_name()
returns trigger
language plpgsql
security invoker
set search_path = public
as $t$
begin
  -- Never persist email-shaped display_name. Prefer prior usable name when an
  -- older client tries to overwrite with an email. Do not RAISE (login/upsert must succeed).
  if public.is_email_like_display_name(new.display_name) then
    if tg_op = 'UPDATE' and public.is_usable_public_display_name(old.display_name) then
      new.display_name := btrim(old.display_name);
    else
      new.display_name := '';
    end if;
  end if;
  return new;
end;
$t$;

drop trigger if exists trg_profiles_sanitize_display_name on public.profiles;
create trigger trg_profiles_sanitize_display_name
  before insert or update of display_name on public.profiles
  for each row
  execute function public.trg_profiles_sanitize_display_name();

create or replace function public.trg_check_ins_sanitize_user_display_name()
returns trigger
language plpgsql
security invoker
set search_path = public
as $t$
begin
  -- Rewrite email-like only (compat: check-in must not fail). Substitute profile name or ''.
  if public.is_email_like_display_name(new.user_display_name) then
    new.user_display_name := public.sanitize_incoming_public_display_name(
      new.user_display_name,
      new.user_id
    );
  end if;
  return new;
end;
$t$;

drop trigger if exists trg_check_ins_sanitize_user_display_name on public.check_ins;
create trigger trg_check_ins_sanitize_user_display_name
  before insert or update of user_display_name on public.check_ins
  for each row
  execute function public.trg_check_ins_sanitize_user_display_name();

create or replace function public.trg_workout_live_sanitize_user_display_name()
returns trigger
language plpgsql
security invoker
set search_path = public
as $t$
begin
  if public.is_email_like_display_name(new.user_display_name) then
    new.user_display_name := public.sanitize_incoming_public_display_name(
      new.user_display_name,
      new.user_id
    );
  end if;
  return new;
end;
$t$;

drop trigger if exists trg_workout_live_sanitize_user_display_name on public.workout_live_sessions;
create trigger trg_workout_live_sanitize_user_display_name
  before insert or update of user_display_name on public.workout_live_sessions
  for each row
  execute function public.trg_workout_live_sanitize_user_display_name();

-- posts.author_display_name (public feed — authenticated select-all)
create or replace function public.trg_posts_sanitize_author_display_name()
returns trigger
language plpgsql
security invoker
set search_path = public
as $t$
begin
  if public.is_email_like_display_name(new.author_display_name) then
    new.author_display_name := public.sanitize_incoming_public_display_name(
      new.author_display_name,
      new.user_id
    );
  end if;
  return new;
end;
$t$;

drop trigger if exists trg_posts_sanitize_author_display_name on public.posts;
do $posts_trg$
begin
  if to_regclass('public.posts') is null then
    raise notice 'public.posts absent; skip author_display_name trigger';
    return;
  end if;
  execute 'drop trigger if exists trg_posts_sanitize_author_display_name on public.posts';
  execute $c$
    create trigger trg_posts_sanitize_author_display_name
      before insert or update of author_display_name on public.posts
      for each row
      execute function public.trg_posts_sanitize_author_display_name()
  $c$;
end;
$posts_trg$;

-- Keep notification helper from returning emails if a profile still has one mid-deploy.
create or replace function public.display_name_for_user(p_user_id uuid)
returns text
language sql
stable
security invoker
set search_path = public
as $s$
  select coalesce(
    nullif(public.resolved_profile_public_display_name(p_user_id), ''),
    'User'
  );
$s$;

-- Leaderboard: filter at read time (SECURITY DEFINER already sets search_path = public).
-- Only replace when the function already exists (avoid creating a partial RPC on lean DBs).
do $lb$
begin
  if to_regprocedure('public.gymly_leaderboard(text,text,text,text,uuid)') is null then
    raise notice 'gymly_leaderboard absent; skip RPC display_name patch';
    return;
  end if;
  execute $fn$
create or replace function public.gymly_leaderboard(
  p_metric text,
  p_period text,
  p_scope text,
  p_center_gym_id text,
  p_viewer uuid
)
returns table (
  rank bigint,
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  check_ins_count integer,
  minutes_sum integer,
  streak_value integer,
  active_today boolean,
  hot_streak_hint boolean
)
language plpgsql
stable
security definer
set search_path = public
as $body$
begin
  if auth.uid() is null or auth.uid() <> p_viewer then
    return;
  end if;

  return query
  with bounds as (
    select
      case p_period
        when 'week' then
          (date_trunc('week', (now() at time zone 'Europe/Copenhagen')) at time zone 'Europe/Copenhagen')
        when 'month' then
          (date_trunc('month', (now() at time zone 'Europe/Copenhagen')) at time zone 'Europe/Copenhagen')
        else timestamptz '1970-01-01 UTC'
      end as ts_start,
      case p_period
        when 'all' then now() + interval '1 day'
        else now()
      end as ts_end
  ),
  agg as (
    select
      c.user_id,
      count(*)::integer as check_ins_count,
      coalesce(
        sum(
          greatest(
            1,
            least(24 * 60, round(extract(epoch from (c.ended_at - c.started_at)) / 60.0)::integer)
          )
        ),
        0
      )::integer as minutes_sum
    from public.check_ins c
    cross join bounds b
    where c.is_active = false
      and c.ended_at is not null
      and c.started_at is not null
      and c.ended_at >= b.ts_start
      and c.ended_at < b.ts_end
      and (
        p_scope <> 'center'
        or p_center_gym_id is null
        or length(trim(p_center_gym_id)) = 0
        or trim(c.gym_id) = trim(p_center_gym_id)
      )
    group by c.user_id
  ),
  session_days as (
    select distinct
      c.user_id,
      ((c.ended_at at time zone 'Europe/Copenhagen')::date) as d
    from public.check_ins c
    cross join bounds b
    where p_period in ('week', 'month')
      and c.is_active = false
      and c.ended_at is not null
      and c.started_at is not null
      and c.ended_at >= b.ts_start
      and c.ended_at < b.ts_end
      and (
        p_scope <> 'center'
        or p_center_gym_id is null
        or length(trim(p_center_gym_id)) = 0
        or trim(c.gym_id) = trim(p_center_gym_id)
      )
  ),
  streak_calc as (
    select
      chain.user_id,
      max(chain.seq_len)::integer as best_streak
    from (
      select
        chain_row.user_id,
        chain_row.streak_grp,
        count(*)::integer as seq_len
      from (
        select
          sd.user_id,
          sd.d,
          sd.d - (row_number() over (partition by sd.user_id order by sd.d))::integer as streak_grp
        from session_days sd
      ) chain_row
      group by chain_row.user_id, chain_row.streak_grp
    ) chain
    group by chain.user_id
  ),
  candidates as (
    select distinct uid
    from (
      select p_viewer as uid
      where p_scope = 'friends'
      union all
      select case
          when f.user_a = p_viewer then f.user_b
          else f.user_a
        end as uid
      from public.friendships f
      where
        p_scope = 'friends'
        and (f.user_a = p_viewer or f.user_b = p_viewer)
      union all
      select a.user_id
      from agg a
      where p_scope = 'global'
      union all
      select p_viewer
      where p_scope = 'global'
      union all
      select a.user_id
      from agg a
      where p_scope = 'center'
      union all
      select p_viewer
      where p_scope = 'center'
    ) s
  ),
  joined as (
    select
      c.uid as user_id,
      coalesce(
        nullif(public.resolved_profile_public_display_name(c.uid), ''),
        'Bruger'
      ) as display_name,
      coalesce(pr.username, '') as username,
      pr.avatar_url,
      coalesce(a.check_ins_count, 0) as check_ins_count,
      coalesce(a.minutes_sum, 0) as minutes_sum,
      case
        when p_metric <> 'streak' then 0
        when p_period = 'all' then coalesce(pr.longest_streak, 0)
        else coalesce(sc.best_streak, 0)
      end::integer as streak_value,
      exists (
        select 1
        from public.check_ins c2
        where c2.user_id = c.uid
          and c2.is_active = false
          and c2.ended_at is not null
          and (
            (c2.ended_at at time zone 'Europe/Copenhagen')::date
          ) = ((now() at time zone 'Europe/Copenhagen')::date)
      ) as active_today,
      case
        when p_metric = 'streak'
        and p_period in ('week', 'month')
        and coalesce(sc.best_streak, 0) >= 4 then true
        else false
      end as hot_streak_hint
    from candidates c
    left join agg a on a.user_id = c.uid
    left join public.profiles pr on pr.id = c.uid
    left join streak_calc sc on sc.user_id = c.uid
  ),
  scored as (
    select
      j.*,
      case p_metric
        when 'checkins' then j.check_ins_count
        when 'minutes' then j.minutes_sum
        when 'streak' then j.streak_value
        else 0
      end::integer as sort_value
    from joined j
  )
  select
    row_number() over (
      order by
        s.sort_value desc,
        lower(s.display_name) asc,
        s.user_id asc
    ) as rank,
    s.user_id,
    s.display_name,
    s.username,
    s.avatar_url,
    s.check_ins_count,
    s.minutes_sum,
    s.streak_value,
    s.active_today,
    s.hot_streak_hint
  from scored s
  order by rank asc
  limit 500;

end;
$body$;
  $fn$;
  revoke all on function public.gymly_leaderboard(text, text, text, text, uuid) from public;
  grant execute on function public.gymly_leaderboard(text, text, text, text, uuid) to authenticated;
end;
$lb$;

-- ---------------------------------------------------------------------------
-- Transactional cleanup (one-shot data fix) + DB-local backup (no Git export)
-- ---------------------------------------------------------------------------
do $cleanup$
declare
  v_profiles int := 0;
  v_check_ins int := 0;
  v_live int := 0;
  v_posts int := 0;
begin
  create schema if not exists gymly_ops;

  create table if not exists gymly_ops.display_name_email_cleanup_20260921 (
    id bigserial primary key,
    source_table text not null,
    row_pk text not null,
    column_name text not null,
    old_value text not null,
    new_value text not null,
    cleaned_at timestamptz not null default now()
  );

  -- Lock down ops schema: no PUBLIC / anon / authenticated / service_role access.
  revoke all on schema gymly_ops from public;
  revoke all on schema gymly_ops from anon, authenticated, service_role;
  grant usage on schema gymly_ops to postgres;
  grant all on all tables in schema gymly_ops to postgres;
  grant all on all sequences in schema gymly_ops to postgres;
  alter table gymly_ops.display_name_email_cleanup_20260921 owner to postgres;
  revoke all on table gymly_ops.display_name_email_cleanup_20260921 from public;
  revoke all on table gymly_ops.display_name_email_cleanup_20260921 from anon, authenticated, service_role;
  alter default privileges in schema gymly_ops revoke all on tables from public;
  alter default privileges in schema gymly_ops revoke all on tables from anon, authenticated, service_role;

  -- profiles.display_name → ''
  with victims as (
    select p.id, p.display_name as old_value
    from public.profiles p
    where public.is_email_like_display_name(p.display_name)
  ),
  logged as (
    insert into gymly_ops.display_name_email_cleanup_20260921
      (source_table, row_pk, column_name, old_value, new_value)
    select 'profiles', v.id::text, 'display_name', v.old_value, ''
    from victims v
    returning 1
  ),
  updated as (
    update public.profiles p
    set display_name = '', updated_at = now()
    from victims v
    where p.id = v.id
    returning 1
  )
  select (select count(*) from updated) into v_profiles;

  -- check_ins.user_display_name → profile name or ''
  with victims as (
    select
      c.id,
      c.user_id,
      c.user_display_name as old_value,
      coalesce(
        nullif(public.resolved_profile_public_display_name(c.user_id), ''),
        ''
      ) as new_value
    from public.check_ins c
    where public.is_email_like_display_name(c.user_display_name)
  ),
  logged as (
    insert into gymly_ops.display_name_email_cleanup_20260921
      (source_table, row_pk, column_name, old_value, new_value)
    select 'check_ins', v.id::text, 'user_display_name', v.old_value, v.new_value
    from victims v
    returning 1
  ),
  updated as (
    update public.check_ins c
    set user_display_name = v.new_value
    from victims v
    where c.id = v.id
    returning 1
  )
  select (select count(*) from updated) into v_check_ins;

  -- workout_live_sessions.user_display_name → profile name or ''
  with victims as (
    select
      l.user_id,
      l.user_display_name as old_value,
      coalesce(
        nullif(public.resolved_profile_public_display_name(l.user_id), ''),
        ''
      ) as new_value
    from public.workout_live_sessions l
    where public.is_email_like_display_name(l.user_display_name)
  ),
  logged as (
    insert into gymly_ops.display_name_email_cleanup_20260921
      (source_table, row_pk, column_name, old_value, new_value)
    select 'workout_live_sessions', v.user_id::text, 'user_display_name', v.old_value, v.new_value
    from victims v
    returning 1
  ),
  updated as (
    update public.workout_live_sessions l
    set user_display_name = v.new_value
    from victims v
    where l.user_id = v.user_id
    returning 1
  )
  select (select count(*) from updated) into v_live;

  -- posts.author_display_name → profile name or ''
  if to_regclass('public.posts') is not null then
    with victims as (
      select
        p.id,
        p.user_id,
        p.author_display_name as old_value,
        coalesce(
          nullif(public.resolved_profile_public_display_name(p.user_id), ''),
          ''
        ) as new_value
      from public.posts p
      where public.is_email_like_display_name(p.author_display_name)
    ),
    logged as (
      insert into gymly_ops.display_name_email_cleanup_20260921
        (source_table, row_pk, column_name, old_value, new_value)
      select 'posts', v.id::text, 'author_display_name', v.old_value, v.new_value
      from victims v
      returning 1
    ),
    updated as (
      update public.posts p
      set author_display_name = v.new_value
      from victims v
      where p.id = v.id
      returning 1
    )
    select (select count(*) from updated) into v_posts;
  end if;

  raise notice
    'email display-name cleanup done: profiles=%, check_ins=%, workout_live_sessions=%, posts=% (counts only; values in gymly_ops backup)',
    v_profiles, v_check_ins, v_live, v_posts;
end;
$cleanup$;

-- Post-condition: zero email-like public names in scoped columns
do $verify$
declare
  v_left int := 0;
  v_extra int := 0;
begin
  select count(*) into v_left from (
    select 1 from public.profiles p where public.is_email_like_display_name(p.display_name)
    union all
    select 1 from public.check_ins c where public.is_email_like_display_name(c.user_display_name)
    union all
    select 1 from public.workout_live_sessions l where public.is_email_like_display_name(l.user_display_name)
  ) s;
  if to_regclass('public.posts') is not null then
    execute $q$
      select count(*) from public.posts p
      where public.is_email_like_display_name(p.author_display_name)
    $q$ into v_extra;
    v_left := v_left + v_extra;
  end if;
  if v_left > 0 then
    raise exception 'sanitize_email_display_names: % email-like public name row(s) remain', v_left;
  end if;
end;
$verify$;

-- Helper functions: invoker + fixed search_path; no elevated definer on sanitizers.
revoke all on function public.is_email_like_display_name(text) from public;
revoke all on function public.is_usable_public_display_name(text) from public;
revoke all on function public.resolved_profile_public_display_name(uuid) from public;
revoke all on function public.sanitize_incoming_public_display_name(text, uuid) from public;
grant execute on function public.is_email_like_display_name(text) to authenticated, anon, service_role;
grant execute on function public.is_usable_public_display_name(text) to authenticated, anon, service_role;
grant execute on function public.resolved_profile_public_display_name(uuid) to authenticated, service_role;
grant execute on function public.sanitize_incoming_public_display_name(text, uuid) to authenticated, service_role;
-- Triggers run as table owner / invoker; postgres retains execute by default as owner.