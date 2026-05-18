-- Beskedliste / last_message_preview: ingen rå [GYM_PLAN_INVITE]-JSON i tråd-meta.

create or replace function public.dm_set_thread_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  b text := trim(coalesce(new.body, ''));
begin
  update public.dm_threads
  set
    last_message_at = new.created_at,
    last_message_preview = case
      when new.image_url is not null and trim(new.image_url) <> '' and (new.body is null or trim(new.body) = '') then
        'Billede'
      when b like '[GYM_PLAN_INVITE]%' then
        '💪 Inviterede dig til træning'
      when b like '[GYM_PLAN_STATUS]%' then
        'Træningsinvitation opdateret'
      else
        left(b, 200)
    end,
    last_sender_id = new.sender_id
  where id = new.thread_id;
  return new;
end;
$$;
