-- Reports on workout posts (moderation queue via SQL / dashboard)

create table if not exists public.post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, reporter_id)
);

create index if not exists post_reports_post_id_idx on public.post_reports (post_id);
create index if not exists post_reports_created_at_idx on public.post_reports (created_at desc);

alter table public.post_reports enable row level security;

drop policy if exists "post_reports_insert_own" on public.post_reports;
create policy "post_reports_insert_own"
  on public.post_reports for insert
  to authenticated
  with check (auth.uid() = reporter_id);
