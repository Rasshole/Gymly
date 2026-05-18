-- Never auto-end active check-ins from DB cleanup.
-- Sessions end only via client manual checkout or confirmed geofence auto-checkout.

create or replace function public.cleanup_stale_active_check_ins()
returns integer
language plpgsql
security definer
set search_path = public
as $f$
begin
  return 0;
end;
$f$;

revoke all on function public.cleanup_stale_active_check_ins() from public;
grant execute on function public.cleanup_stale_active_check_ins() to authenticated;
