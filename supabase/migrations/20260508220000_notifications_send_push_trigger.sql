-- Auto-call send-push Edge Function for every new notification row.
create extension if not exists pg_net with schema extensions;

create or replace function public.trg_call_send_push_on_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  request_id bigint;
begin
  select extensions.net.http_post(
    url := 'https://ykantlsuszpauddasqvz.supabase.co/functions/v1/send-push',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'notifications',
      'schema', 'public',
      'notification_id', new.id::text,
      'record', row_to_json(new)
    ),
    timeout_milliseconds := 5000
  )
  into request_id;

  if request_id is not null then
    raise notice 'send-push queued for notification %, request %', new.id, request_id;
  else
    raise warning 'send-push queue failed for notification %', new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notifications_send_push on public.notifications;
create trigger trg_notifications_send_push
  after insert on public.notifications
  for each row
  execute function public.trg_call_send_push_on_notification();

