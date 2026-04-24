-- Realtime på friend_requests: modtageren ser INSERT (ny anmodning) uden at polle.
-- RLS: to_user_id kan læse rækken, så Realtime følger samme adgang.
do $r$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'friend_requests'
  ) then
    alter publication supabase_realtime add table public.friend_requests;
  end if;
exception
  when undefined_object then
    null;
end $r$;

do $r$
begin
  if to_regclass('public.friend_requests') is not null then
    execute 'alter table public.friend_requests replica identity full';
  end if;
end $r$;
