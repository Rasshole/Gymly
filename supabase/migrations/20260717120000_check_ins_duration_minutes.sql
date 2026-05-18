-- Persisted duration for completed sessions (stats + history).
alter table public.check_ins add column if not exists duration_minutes integer;

update public.check_ins
set duration_minutes = greatest(
  1,
  round(extract(epoch from (ended_at - started_at)) / 60.0)::integer
)
where ended_at is not null
  and started_at is not null
  and duration_minutes is null;
