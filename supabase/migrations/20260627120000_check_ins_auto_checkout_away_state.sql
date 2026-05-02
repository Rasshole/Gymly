-- Persisteret "væk fra center" til auto-checkout (ikke kun i app-hukommelse)
alter table public.check_ins add column if not exists away_started_at timestamptz;
alter table public.check_ins add column if not exists last_distance_meters integer;
alter table public.check_ins add column if not exists auto_checkout_reason text;

-- Backfill: tidligere grace-felter
update public.check_ins
set
  away_started_at = coalesce(away_started_at, geofence_grace_started_at)
where
  is_active = true
  and ended_at is null
  and away_started_at is null
  and geofence_grace_started_at is not null;

-- Bedre Realtime-UPDATE (fuld række i payload)
do $r$ begin
  execute 'alter table public.check_ins replica identity full';
exception when others then null;
end $r$;
