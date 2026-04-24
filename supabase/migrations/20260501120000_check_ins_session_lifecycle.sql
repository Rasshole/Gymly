-- Aktiv tjek-ind session: started_at, ended_at, is_active — én aktiv pr. bruger.
-- Historiske rækker (før migration) markeres som afsluttet.

alter table public.check_ins add column if not exists started_at timestamptz;
alter table public.check_ins add column if not exists ended_at timestamptz;
alter table public.check_ins add column if not exists is_active boolean not null default false;

-- Historik: hver række får tidsstempler, ingen åben session
update public.check_ins
set
  started_at = coalesce(created_at, now()),
  ended_at = coalesce(ended_at, created_at, now()),
  is_active = false
where started_at is null;

alter table public.check_ins
  alter column started_at set default now();

-- Ikke streng NOT NULL uden at bryde gamle miljøer — nye rækker sætter altid started_at i app.
create unique index if not exists check_ins_one_active_per_user
  on public.check_ins (user_id)
  where is_active = true and ended_at is null;

drop policy if exists "check_ins_update_own" on public.check_ins;
create policy "check_ins_update_own"
  on public.check_ins for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
