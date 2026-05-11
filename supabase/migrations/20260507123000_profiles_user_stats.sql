alter table public.profiles
  add column if not exists current_streak integer not null default 0,
  add column if not exists longest_streak integer not null default 0,
  add column if not exists last_streak_date text,
  add column if not exists streak_freeze_available integer not null default 1,
  add column if not exists streak_freeze_used_this_month boolean not null default false,
  add column if not exists streak_freeze_month text,
  add column if not exists total_check_ins integer not null default 0,
  add column if not exists total_training_minutes integer not null default 0;

create index if not exists profiles_current_streak_idx
  on public.profiles (current_streak desc, longest_streak desc, total_training_minutes desc);
