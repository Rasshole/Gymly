-- Push dispatch logging table (one row per token send attempt).
create table if not exists public.notification_push_dispatches (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  token text not null,
  status text not null check (status in ('pending', 'sent', 'failed')),
  provider text not null default 'firebase',
  response jsonb,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists notification_push_dispatches_notification_idx
  on public.notification_push_dispatches (notification_id, created_at desc);

create index if not exists notification_push_dispatches_recipient_idx
  on public.notification_push_dispatches (recipient_id, created_at desc);

