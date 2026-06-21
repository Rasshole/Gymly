-- Auto-checkout: session saved immediately; user reviews caption/share later.

alter table public.check_ins
  add column if not exists workout_needs_review boolean not null default false;

create index if not exists check_ins_workout_needs_review_idx
  on public.check_ins (user_id, workout_needs_review)
  where workout_needs_review = true and ended_at is not null;
