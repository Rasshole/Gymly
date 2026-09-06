-- Server-backup: auto-checkout når klienten har rapporteret ude for radius + grace (12s).
-- Matcher klient: 450 m radius, 12 sekunder grace. Beholder 24t system_recovery.

create or replace function public.run_auto_checkout_sweep(p_limit integer default 500)
returns table (
  check_in_id uuid,
  reason text,
  distance_m integer,
  away_started_at timestamptz,
  checked_out boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select
      c.id,
      c.started_at,
      c.last_distance_meters,
      c.away_started_at,
      case
        when c.started_at <= (now() - interval '24 hours') then 'system_recovery'
        when c.away_started_at is not null
          and c.last_distance_meters > 450
          and c.away_started_at <= (now() - interval '12 seconds') then 'left_geofence'
        else null
      end as auto_reason
    from public.check_ins c
    where c.is_active = true
      and c.ended_at is null
    order by c.started_at asc
    limit greatest(1, coalesce(p_limit, 500))
  ),
  actionable as (
    select *
    from candidates
    where auto_reason is not null
  ),
  updated as (
    update public.check_ins c
    set
      is_active = false,
      ended_at = now(),
      duration_minutes = greatest(
        1,
        floor(extract(epoch from (now() - c.started_at)) / 60)::integer
      ),
      checkout_reason = case
        when a.auto_reason = 'system_recovery' then 'system_recovery'
        else 'auto_distance'
      end,
      auto_checkout_reason = a.auto_reason,
      end_reason = case
        when a.auto_reason = 'system_recovery' then 'inactivity'
        else 'geofence_outside'
      end,
      workout_needs_review = (a.auto_reason = 'left_geofence'),
      away_started_at = null,
      last_distance_meters = null,
      geofence_grace_started_at = null,
      geofence_grace_kind = null
    from actionable a
    where c.id = a.id
      and c.is_active = true
      and c.ended_at is null
    returning c.id, a.auto_reason, a.last_distance_meters, a.away_started_at
  )
  select
    u.id as check_in_id,
    u.auto_reason as reason,
    u.last_distance_meters as distance_m,
    u.away_started_at,
    true as checked_out
  from updated u;
end;
$$;

revoke all on function public.run_auto_checkout_sweep(integer) from public;
grant execute on function public.run_auto_checkout_sweep(integer) to service_role;
