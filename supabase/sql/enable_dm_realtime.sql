-- =============================================================================
-- KUN tilmelding til Realtime (tabeller skal allerede findes).
--
-- Første gang? Få "relation dm_messages does not exist" → brug i stedet:
--   supabase/sql/dm_complete_setup.sql
--   (opretter tabeller + RLS + RPC + publicering)
-- =============================================================================

-- Tilmeld dm_messages (nye beskeder)
do $r$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dm_messages'
  ) then
    alter publication supabase_realtime add table public.dm_messages;
  end if;
exception
  when undefined_object then
    -- Selvhostet uden supabase_realtime: opret public. først, eller brug hostet
    raise notice 'publication supabase_realtime findes ikke';
end $r$;

-- Tilmeld dm_threads (opdatering af sidste besked m.m.)
do $r$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dm_threads'
  ) then
    alter publication supabase_realtime add table public.dm_threads;
  end if;
exception
  when undefined_object then
    raise notice 'publication supabase_realtime findes ikke';
end $r$;

-- Valgfrit: anbefales ofte sammen med Realtime + RLS
do $r$
begin
  if to_regclass('public.dm_messages') is not null then
    execute 'alter table public.dm_messages replica identity full';
  end if;
  if to_regclass('public.dm_threads') is not null then
    execute 'alter table public.dm_threads replica identity full';
  end if;
end $r$;
