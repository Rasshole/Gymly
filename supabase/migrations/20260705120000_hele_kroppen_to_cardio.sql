-- Normaliser legacy træningstype `hele_kroppen` → `cardio` (check-ins, planlagte træninger)
-- NB: `live_workout_sessions` er valgfri — ikke alle miljøer har tabellen endnu.

update public.check_ins
set workout_type = 'cardio'
where workout_type = 'hele_kroppen';

do $body$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'live_workout_sessions'
  ) then
    update public.live_workout_sessions
    set workout_type = 'cardio'
    where workout_type = 'hele_kroppen';
  end if;
end;
$body$;

update public.planned_workouts pw
set training_types = coalesce(
  (
    select array_agg(
      (case when elem = 'hele_kroppen' then 'cardio'::text else elem end)
      order by ord
    )
    from unnest(pw.training_types) with ordinality as t(elem, ord)
  ),
  '{}'::text[]
)
where pw.training_types is not null
  and 'hele_kroppen' = any(pw.training_types);
