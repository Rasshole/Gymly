-- Local QA coach/gym workspace on top of the tier foundation.
-- Feature rights come from creator_tier_feature_config, keyed only by
-- identity type and effective tier. Paid and referral-earned tiers share
-- that row. Provisional QA limits are not a release decision.
-- Multiple official groups reuse gymly_groups. Appointing another
-- administrator is not available and is not shown as a Pro benefit.
-- An official link does not grant group administration. Session details
-- require the caller to still be a group admin.
-- Tier expiry and unlinking do not delete groups, members, or content.
--
-- Local migration status: this file was applied with psql on the local
-- database only. 20261006180000 is intentionally absent from
-- supabase_migrations.schema_migrations. Do not insert a history row,
-- repair, reset, or apply this on a hosted database.

create table if not exists public.creator_tier_feature_config (
  identity_type text not null
    check (identity_type in ('coach', 'gym')),
  tier text not null
    check (tier in ('free', 'base', 'pro')),
  max_official_groups integer not null
    check (max_official_groups >= 0),
  max_group_admins integer not null
    check (max_group_admins >= 1),
  group_sessions_enabled boolean not null,
  referral_counts_enabled boolean not null,
  provisional_qa boolean not null default true,
  primary key (identity_type, tier)
);

-- Provisional QA values. Free cannot attach an official group.
-- Approved Free can read its own referral count and progress to Base.
-- That count is active_referral_count from the tier foundation.
-- Base: 1 official group. Pro: 3 official groups.
-- max_group_admins only rejects a link when the group already has more
-- admins than the tier allows. It does not appoint administrators.
insert into public.creator_tier_feature_config (
  identity_type, tier, max_official_groups, max_group_admins,
  group_sessions_enabled, referral_counts_enabled, provisional_qa
) values
  ('coach', 'free', 0, 1, false, true, true),
  ('coach', 'base', 1, 1, true, true, true),
  ('coach', 'pro', 3, 3, true, true, true),
  ('gym', 'free', 0, 1, false, true, true),
  ('gym', 'base', 1, 1, true, true, true),
  ('gym', 'pro', 3, 3, true, true, true)
on conflict (identity_type, tier) do nothing;

update public.creator_tier_feature_config
set referral_counts_enabled = true
where tier = 'free'
  and referral_counts_enabled = false;

comment on table public.creator_tier_feature_config is
  'Provisional local QA feature limits. Free 0 official groups, own referral progress visible. Base 1 official group. Pro 3 official groups. Not a release decision. Extra administrators are not a benefit and cannot be appointed.';

create table if not exists public.creator_profile_details (
  user_id uuid primary key references public.creator_identities (user_id) on delete cascade,
  description text,
  contact_url text,
  updated_at timestamptz not null default now(),
  constraint creator_profile_description_len check (
    description is null or char_length(description) <= 400
  ),
  constraint creator_profile_contact_len check (
    contact_url is null or char_length(contact_url) <= 200
  )
);

create table if not exists public.creator_official_groups (
  user_id uuid not null references public.creator_identities (user_id) on delete cascade,
  group_id uuid not null references public.gymly_groups (id) on delete cascade,
  linked_by uuid,
  linked_at timestamptz not null default now(),
  primary key (user_id, group_id)
);

create index if not exists creator_official_groups_group_idx
  on public.creator_official_groups (group_id);

alter table public.creator_tier_feature_config enable row level security;
alter table public.creator_profile_details enable row level security;
alter table public.creator_official_groups enable row level security;

revoke all on table public.creator_tier_feature_config from public, anon, authenticated;
revoke all on table public.creator_profile_details from public, anon, authenticated;
revoke all on table public.creator_official_groups from public, anon, authenticated;

create or replace function public.creator_workspace_block_client_write()
returns trigger
language plpgsql
as $f$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return coalesce(new, old);
  end if;
  raise exception 'CREATOR_WORKSPACE_WRITE_FORBIDDEN' using errcode = 'P0001';
end;
$f$;

drop trigger if exists creator_profile_details_block_client_write on public.creator_profile_details;
create trigger creator_profile_details_block_client_write
  before insert or update or delete on public.creator_profile_details
  for each row
  execute function public.creator_workspace_block_client_write();

drop trigger if exists creator_official_groups_block_client_write on public.creator_official_groups;
create trigger creator_official_groups_block_client_write
  before insert or update or delete on public.creator_official_groups
  for each row
  execute function public.creator_workspace_block_client_write();

drop trigger if exists creator_tier_feature_config_block_client_write on public.creator_tier_feature_config;
create trigger creator_tier_feature_config_block_client_write
  before insert or update or delete on public.creator_tier_feature_config
  for each row
  execute function public.creator_workspace_block_client_write();

create or replace view public.creator_public_profile_cards
with (security_barrier = true) as
select
  i.user_id,
  i.identity_type,
  i.effective_tier,
  d.description,
  d.contact_url
from public.creator_identities i
join public.creator_profile_details d on d.user_id = i.user_id
where i.status = 'approved';

comment on view public.creator_public_profile_cards is
  'Approved coach or gym description and contact link. Pending and rejected identities are omitted.';

create or replace function public.creator_normalize_contact_url(p_url text)
returns text
language plpgsql
immutable
as $f$
declare
  v_url text := nullif(trim(coalesce(p_url, '')), '');
begin
  if v_url is null then
    return null;
  end if;
  if char_length(v_url) > 200 or v_url !~* '^https://[^[:space:]]+$' then
    raise exception 'CREATOR_CONTACT_URL_INVALID' using errcode = 'P0001';
  end if;
  return v_url;
end;
$f$;

create or replace function public.get_my_creator_workspace()
returns json
language plpgsql
security definer
set search_path = public
as $f$
declare
  v_uid uuid := auth.uid();
  v_row public.creator_identities%rowtype;
  v_feat public.creator_tier_feature_config%rowtype;
  v_profile public.creator_profile_details%rowtype;
  v_code json;
  v_groups json;
  v_linkable json;
  v_approved boolean;
  v_sessions boolean := false;
  v_counts boolean := false;
  v_can_link boolean := false;
  v_tier json;
begin
  if v_uid is null then
    raise exception 'CREATOR_TIER_FORBIDDEN' using errcode = 'P0001';
  end if;

  select * into v_row from public.creator_identities where user_id = v_uid;
  v_approved := v_row.user_id is not null and v_row.status = 'approved';

  if v_approved then
    select * into v_feat
    from public.creator_tier_feature_config
    where identity_type = v_row.identity_type
      and tier = v_row.effective_tier;
    v_sessions := coalesce(v_feat.group_sessions_enabled, false);
    v_counts := coalesce(v_feat.referral_counts_enabled, false);
    v_can_link := coalesce(v_feat.max_official_groups, 0) > (
      select count(*) from public.creator_official_groups g where g.user_id = v_uid
    );
    select * into v_profile
    from public.creator_profile_details
    where user_id = v_uid;
    begin
      v_code := public.get_or_create_my_referral_code();
    exception
      when others then
        v_code := null;
    end;
    -- Same count, next tier, and threshold as the private tier status.
    v_tier := public.get_my_creator_tier_status();
  end if;

  select coalesce(json_agg(item order by item ->> 'name'), '[]'::json)
  into v_groups
  from (
    select json_build_object(
      'group_id', g.id,
      'name', g.name,
      'linked_at', og.linked_at,
      'admin_access', admin_row.is_admin,
      'together_sessions', case
        when v_sessions and admin_row.is_admin then (
          select count(*)::integer
          from public.gymly_group_sessions s
          where s.group_id = g.id
            and s.qualifies_as_together
        )
        else null
      end,
      'recent_sessions', case
        when v_sessions and admin_row.is_admin then (
          select coalesce(json_agg(sess order by sess ->> 'started_at' desc), '[]'::json)
          from (
            select json_build_object(
              'started_at', s.started_at,
              'ended_at', s.ended_at
            ) as sess
            from public.gymly_group_sessions s
            where s.group_id = g.id
              and s.qualifies_as_together
            order by s.started_at desc
            limit 5
          ) recent
        )
        else null
      end
    ) as item
    from public.creator_official_groups og
    join public.gymly_groups g on g.id = og.group_id
    cross join lateral (
      select public.gymly_is_group_admin(g.id, v_uid) as is_admin
    ) admin_row
    where og.user_id = v_uid
  ) listed;

  if v_can_link then
    select coalesce(json_agg(json_build_object('group_id', g.id, 'name', g.name) order by g.name), '[]'::json)
    into v_linkable
    from public.gymly_groups g
    join public.gymly_group_members m
      on m.group_id = g.id
     and m.user_id = v_uid
     and m.role = 'admin'
    where not exists (
      select 1
      from public.creator_official_groups og
      where og.user_id = v_uid
        and og.group_id = g.id
    );
  else
    v_linkable := '[]'::json;
  end if;

  return json_build_object(
    'status', coalesce(v_row.status, 'none'),
    'identity_type', v_row.identity_type,
    'effective_tier', case when v_approved then v_row.effective_tier else 'free' end,
    'tier_reason', case when v_approved then v_row.tier_reason else 'free' end,
    'public_visible', v_approved,
    'description', case when v_approved then v_profile.description else null end,
    'contact_url', case when v_approved then v_profile.contact_url else null end,
    'referral_code', case when v_approved then v_code ->> 'code' else null end,
    'referral_url', case when v_approved then v_code ->> 'url' else null end,
    'active_referrals', case
      when v_approved and v_counts then (v_tier ->> 'active_referrals')::integer
      else null
    end,
    'next_tier', case when v_approved and v_counts then v_tier ->> 'next_tier' else null end,
    'next_tier_required', case
      when v_approved and v_counts then (v_tier ->> 'next_tier_required')::integer
      else null
    end,
    'official_groups', coalesce(v_groups, '[]'::json),
    'linkable_groups', coalesce(v_linkable, '[]'::json),
    'features', json_build_object(
      'profile', v_approved,
      'referral_code', v_approved,
      'group_sessions', v_sessions,
      'referral_counts', v_counts,
      'link_official_group', v_can_link,
      'add_administrator', false,
      'max_official_groups', case when v_approved then coalesce(v_feat.max_official_groups, 0) else 0 end,
      'max_group_admins', case when v_approved then coalesce(v_feat.max_group_admins, 1) else 0 end,
      'config_status', case when v_feat.provisional_qa then 'provisional_qa' else null end
    )
  );
end;
$f$;

create or replace function public.save_my_creator_profile(
  p_description text,
  p_contact_url text
)
returns json
language plpgsql
security definer
set search_path = public
as $f$
declare
  v_uid uuid := auth.uid();
  v_row public.creator_identities%rowtype;
  v_description text := nullif(trim(coalesce(p_description, '')), '');
  v_contact text;
begin
  if v_uid is null then
    raise exception 'CREATOR_TIER_FORBIDDEN' using errcode = 'P0001';
  end if;
  select * into v_row
  from public.creator_identities
  where user_id = v_uid
  for update;
  if v_row.user_id is null or v_row.status <> 'approved' then
    raise exception 'CREATOR_TIER_NOT_APPROVED' using errcode = 'P0001';
  end if;
  if v_description is not null and char_length(v_description) > 400 then
    raise exception 'CREATOR_DESCRIPTION_TOO_LONG' using errcode = 'P0001';
  end if;
  v_contact := public.creator_normalize_contact_url(p_contact_url);

  insert into public.creator_profile_details (user_id, description, contact_url, updated_at)
  values (v_uid, v_description, v_contact, now())
  on conflict (user_id) do update
  set description = excluded.description,
      contact_url = excluded.contact_url,
      updated_at = now();

  insert into public.creator_tier_audit (
    user_id, action, actor_id, actor_role, identity_type,
    old_status, new_status, old_tier, new_tier, tier_reason
  ) values (
    v_uid, 'profile_saved', v_uid, 'authenticated', v_row.identity_type,
    v_row.status, v_row.status, v_row.effective_tier, v_row.effective_tier, v_row.tier_reason
  );

  return public.get_my_creator_workspace();
end;
$f$;

create or replace function public.link_my_official_group(p_group_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $f$
declare
  v_uid uuid := auth.uid();
  v_row public.creator_identities%rowtype;
  v_feat public.creator_tier_feature_config%rowtype;
  v_linked integer;
  v_admins integer;
begin
  if v_uid is null then
    raise exception 'CREATOR_TIER_FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_group_id is null then
    raise exception 'CREATOR_GROUP_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_row
  from public.creator_identities
  where user_id = v_uid
  for update;
  if v_row.user_id is null or v_row.status <> 'approved' then
    raise exception 'CREATOR_TIER_NOT_APPROVED' using errcode = 'P0001';
  end if;
  if not public.gymly_is_group_admin(p_group_id, v_uid) then
    raise exception 'CREATOR_GROUP_ADMIN_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_feat
  from public.creator_tier_feature_config
  where identity_type = v_row.identity_type
    and tier = v_row.effective_tier;
  if v_feat.tier is null then
    raise exception 'CREATOR_TIER_CONFIG_MISSING' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.creator_official_groups
    where user_id = v_uid and group_id = p_group_id
  ) then
    return public.get_my_creator_workspace();
  end if;

  select count(*)::integer into v_linked
  from public.creator_official_groups
  where user_id = v_uid;
  if v_linked >= v_feat.max_official_groups then
    raise exception 'CREATOR_TIER_FEATURE_LOCKED' using errcode = 'P0001';
  end if;

  select count(*)::integer into v_admins
  from public.gymly_group_members
  where group_id = p_group_id
    and role = 'admin';
  if v_admins > v_feat.max_group_admins then
    raise exception 'CREATOR_GROUP_ADMIN_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.creator_official_groups (user_id, group_id, linked_by)
  values (v_uid, p_group_id, v_uid);

  insert into public.creator_tier_audit (
    user_id, action, actor_id, actor_role, identity_type,
    old_status, new_status, old_tier, new_tier, tier_reason
  ) values (
    v_uid, 'official_group_linked', v_uid, 'authenticated', v_row.identity_type,
    v_row.status, v_row.status, v_row.effective_tier, v_row.effective_tier, v_row.tier_reason
  );

  return public.get_my_creator_workspace();
end;
$f$;

create or replace function public.unlink_my_official_group(p_group_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $f$
declare
  v_uid uuid := auth.uid();
  v_row public.creator_identities%rowtype;
  v_deleted integer;
begin
  if v_uid is null then
    raise exception 'CREATOR_TIER_FORBIDDEN' using errcode = 'P0001';
  end if;
  select * into v_row
  from public.creator_identities
  where user_id = v_uid
    and status = 'approved';
  if v_row.user_id is null then
    raise exception 'CREATOR_TIER_NOT_APPROVED' using errcode = 'P0001';
  end if;
  -- Only the identity that owns the link can remove it. A second call
  -- finds no row and leaves the group, members, and sessions in place.
  delete from public.creator_official_groups
  where user_id = v_uid
    and group_id = p_group_id;
  get diagnostics v_deleted = row_count;
  if v_deleted > 0 then
    insert into public.creator_tier_audit (
      user_id, action, actor_id, actor_role, identity_type,
      old_status, new_status, old_tier, new_tier, tier_reason
    ) values (
      v_uid, 'official_group_unlinked', v_uid, 'authenticated', v_row.identity_type,
      v_row.status, v_row.status, v_row.effective_tier, v_row.effective_tier, v_row.tier_reason
    );
  end if;
  return public.get_my_creator_workspace();
end;
$f$;

revoke all on function public.creator_normalize_contact_url(text) from public, anon, authenticated, service_role;
revoke all on function public.creator_workspace_block_client_write() from public, anon, authenticated, service_role;
revoke all on function public.get_my_creator_workspace() from public, anon, authenticated, service_role;
revoke all on function public.save_my_creator_profile(text, text) from public, anon, authenticated, service_role;
revoke all on function public.link_my_official_group(uuid) from public, anon, authenticated, service_role;
revoke all on function public.unlink_my_official_group(uuid) from public, anon, authenticated, service_role;

grant execute on function public.get_my_creator_workspace() to postgres, authenticated, service_role;
grant execute on function public.save_my_creator_profile(text, text) to postgres, authenticated, service_role;
grant execute on function public.link_my_official_group(uuid) to postgres, authenticated, service_role;
grant execute on function public.unlink_my_official_group(uuid) to postgres, authenticated, service_role;
grant select on public.creator_public_profile_cards to anon, authenticated, service_role;
