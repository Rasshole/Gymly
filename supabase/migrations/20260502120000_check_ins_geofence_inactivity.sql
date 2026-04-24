-- Geofence-grace, last_seen (inaktivitet) og end_reason for auto-tjek-ud
alter table public.check_ins add column if not exists last_seen_at timestamptz;
alter table public.check_ins add column if not exists geofence_grace_started_at timestamptz;
alter table public.check_ins add column if not exists geofence_grace_kind text;
alter table public.check_ins add column if not exists end_reason text;

update public.check_ins
set last_seen_at = coalesce(started_at, created_at, now())
where is_active = true
  and ended_at is null
  and last_seen_at is null;
