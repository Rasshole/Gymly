-- Offentlig rollup pr. center: alle autentificerede kan læse → Realtime virker for alle
-- når nogen tjekker ind/ud (RLS skjuler andres rå check_ins for ikke-venner).
create table if not exists public.gym_active_checkin_rollup (
  gym_id text primary key,
  active_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists gym_checkin_rollup_updated_idx
  on public.gym_active_checkin_rollup (updated_at desc);

alter table public.gym_active_checkin_rollup enable row level security;

drop policy if exists "gym_rollup_select_authenticated" on public.gym_active_checkin_rollup;
create policy "gym_rollup_select_authenticated"
  on public.gym_active_checkin_rollup for select
  to authenticated
  using (true);

-- Ingen manuel insert/update fra klient; trigger maintainer
revoke insert, update, delete on public.gym_active_checkin_rollup from authenticated;

create or replace function public.recalc_gym_checkin_rollup(p_gym_id text)
returns void
language plpgsql
security definer
set search_path = public
as $f$
declare
  c int;
begin
  if p_gym_id is null or length(trim(p_gym_id)) = 0 then
    return;
  end if;
  select count(*)::int into c
  from public.check_ins
  where gym_id = p_gym_id
    and is_active = true
    and ended_at is null;

  if c <= 0 then
    delete from public.gym_active_checkin_rollup where gym_id = p_gym_id;
  else
    insert into public.gym_active_checkin_rollup (gym_id, active_count, updated_at)
    values (p_gym_id, c, now())
    on conflict (gym_id) do update
      set active_count = excluded.active_count,
          updated_at = excluded.updated_at;
  end if;
end;
$f$;

create or replace function public.tg_check_ins_touch_gym_rollup()
returns trigger
language plpgsql
security definer
set search_path = public
as $f$
begin
  if tg_op = 'INSERT' and new.gym_id is not null then
    perform public.recalc_gym_checkin_rollup(new.gym_id);
  elsif tg_op = 'UPDATE' then
    if old.gym_id is not null and (old.gym_id is distinct from new.gym_id) then
      perform public.recalc_gym_checkin_rollup(old.gym_id);
    end if;
    if new.gym_id is not null then
      perform public.recalc_gym_checkin_rollup(new.gym_id);
    end if;
  elsif tg_op = 'DELETE' and old.gym_id is not null then
    perform public.recalc_gym_checkin_rollup(old.gym_id);
  end if;
  return null;
end;
$f$;

drop trigger if exists trg_check_ins_gym_rollup on public.check_ins;
-- VIGTIG: ikke ved last_seen / geofence opdateringer (sker ofte) — kun tjek status / center
create trigger trg_check_ins_gym_rollup
  after insert or delete or update of is_active, ended_at, gym_id on public.check_ins
  for each row
  execute function public.tg_check_ins_touch_gym_rollup();

-- Backfill
insert into public.gym_active_checkin_rollup (gym_id, active_count, updated_at)
select c.gym_id, count(*)::int, now()
from public.check_ins c
where c.is_active = true
  and c.ended_at is null
group by c.gym_id
on conflict (gym_id) do update
  set active_count = excluded.active_count,
      updated_at = excluded.updated_at;

do $r$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'gym_active_checkin_rollup'
  ) then
    alter publication supabase_realtime add table public.gym_active_checkin_rollup;
  end if;
exception
  when undefined_object then null;
end $r$;

do $r$ begin
  execute 'alter table public.gym_active_checkin_rollup replica identity full';
exception when others then null;
end $r$;
