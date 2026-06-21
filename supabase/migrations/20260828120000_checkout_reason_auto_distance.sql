-- checkout_reason: manual | auto_distance | system_recovery
-- Server sweep: kun system_recovery for meget gamle sessioner (ikke GPS-distance uden app).

alter table public.check_ins
  add column if not exists checkout_reason text;

alter table public.check_ins drop constraint if exists check_ins_checkout_reason_check;

alter table public.check_ins
  add constraint check_ins_checkout_reason_check
  check (
    checkout_reason is null
    or checkout_reason in ('manual', 'auto_distance', 'system_recovery')
  );

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
      c.last_distance_meters,
      c.away_started_at,
      case
        when c.started_at <= (now() - interval '24 hours') then 'system_recovery'
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
      checkout_reason = 'system_recovery',
      auto_checkout_reason = 'inactivity',
      end_reason = 'inactivity',
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
