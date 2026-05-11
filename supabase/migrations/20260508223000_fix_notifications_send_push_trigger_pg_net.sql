-- Hotfix: use correct pg_net schema and never block message inserts on push errors.
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
  begin
    select net.http_post(
      url := 'https://ykantlsuszpauddasqvz.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'type', 'INSERT',
        'table', 'notifications',
        'schema', 'public',
        'notification_id', new.id::text,
        'record', row_to_json(new)
      )
    )
    into request_id;

    raise notice 'send-push queued for notification %, request %', new.id, request_id;
  exception
    when others then
      -- Push dispatch must not break DM/notification writes.
      raise warning 'send-push queue failed for notification %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists trg_notifications_send_push on public.notifications;
create trigger trg_notifications_send_push
  after insert on public.notifications
  for each row
  execute function public.trg_call_send_push_on_notification();

