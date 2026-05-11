-- Fremhævede badges på profil (max 3). Synkes på tværs af enheder.

alter table public.profiles
  add column if not exists featured_badge_ids text[] not null default '{}';

alter table public.profiles
  drop constraint if exists profiles_featured_badges_max_3;

alter table public.profiles
  add constraint profiles_featured_badges_max_3
  check (
    array_length(featured_badge_ids, 1) is null
    or array_length(featured_badge_ids, 1) <= 3
  );

comment on column public.profiles.featured_badge_ids is
  'Op til 3 badge_id fra appens badgeDefinitions, vist på profil.';
