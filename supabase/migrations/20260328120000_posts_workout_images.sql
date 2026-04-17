-- Workout posts (social feed) + public storage for images
-- Apply in Supabase SQL editor or: supabase db push

-- Posts table
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  image_url text not null default '',
  caption text not null default '',
  workout_duration int not null,
  center_name text not null,
  workout_type text not null,
  mood_rating smallint,
  author_display_name text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists posts_user_id_idx on public.posts (user_id);

alter table public.posts enable row level security;

drop policy if exists "posts_select_authenticated" on public.posts;
drop policy if exists "posts_insert_own" on public.posts;
drop policy if exists "posts_update_own" on public.posts;
drop policy if exists "posts_delete_own" on public.posts;

create policy "posts_select_authenticated"
  on public.posts for select
  to authenticated
  using (true);

create policy "posts_insert_own"
  on public.posts for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "posts_update_own"
  on public.posts for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "posts_delete_own"
  on public.posts for delete
  to authenticated
  using (auth.uid() = user_id);

-- Storage bucket (public read for feed URLs)
insert into storage.buckets (id, name, public)
values ('workout-images', 'workout-images', true)
on conflict (id) do update set public = excluded.public;

-- Storage policies: users upload only under their user_id prefix
drop policy if exists "workout_images_insert_own" on storage.objects;
drop policy if exists "workout_images_select_public" on storage.objects;
drop policy if exists "workout_images_update_own" on storage.objects;
drop policy if exists "workout_images_delete_own" on storage.objects;

create policy "workout_images_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'workout-images'
    and (storage.foldername (name))[1] = auth.uid()::text
  );

create policy "workout_images_select_public"
  on storage.objects for select
  to public
  using (bucket_id = 'workout-images');

create policy "workout_images_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'workout-images'
    and (storage.foldername (name))[1] = auth.uid()::text
  );

create policy "workout_images_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'workout-images'
    and (storage.foldername (name))[1] = auth.uid()::text
  );
