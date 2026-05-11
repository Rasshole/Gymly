-- Gymly ranglister: aggregeret data via SECURITY DEFINER (RLS tillader ikke global check_ins-læsning).
-- Kør: supabase db push eller SQL Editor (hele filen).

create index if not exists check_ins_gym_ended_idx
  on public.check_ins (gym_id, ended_at desc)
  where is_active = false and ended_at is not null and started_at is not null;

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
as $$
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
        nullif(trim(pr.display_name), ''),
        nullif(trim(pr.username), ''),
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
$$;

comment on function public.gymly_leaderboard(text, text, text, text, uuid) is
  'Aggregér ranglister (check-ins, minutter, streak) uden at eksponere rækker på tværs af RLS.';

revoke all on function public.gymly_leaderboard(text, text, text, text, uuid) from public;
grant execute on function public.gymly_leaderboard(text, text, text, text, uuid) to authenticated;
