-- Expire ghost/stale active check_ins so rollup + clients stay aligned.
-- Rules (match app): >6h since start OR no heartbeat for 30m (last_seen_at ?? started_at).

create or replace function public.cleanup_stale_active_check_ins()
returns integer
language plpgsql
security definer
set search_path = public
as $f$
declare
  n integer;
begin
  with u as (
    update public.check_ins c
    set
      is_active = false,
      ended_at = now(),
      end_reason = 'stale_expired',
      auto_checkout_reason = null,
      geofence_grace_started_at = null,
      geofence_grace_kind = null,
      away_started_at = null,
      last_distance_meters = null
    where
      c.is_active = true
      and c.ended_at is null
      and (
        c.started_at < (now() - interval '6 hours')
        or coalesce(c.last_seen_at, c.started_at) < (now() - interval '30 minutes')
      )
    returning c.id
  )
  select count(*)::int into n from u;

  return coalesce(n, 0);
end;
$f$;

revoke all on function public.cleanup_stale_active_check_ins() from public;
grant execute on function public.cleanup_stale_active_check_ins() to authenticated;
