-- A bootstrap or placeholder username is unfinished onboarding.
-- gymly_user, appleuser, googleuser, and u_<hex> must not stamp
-- referrals.onboarding_completed_at. The 24-hour window, one referrer,
-- and self-referral rules stay unchanged.

create or replace function public.referral_account_is_eligible(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $f$
declare
  v_username text;
  v_email text;
  v_demo_meta text;
  v_requires_change boolean;
begin
  if p_user_id is null then
    return false;
  end if;

  select p.username, coalesce(p.username_requires_change, false)
  into v_username, v_requires_change
  from public.profiles p
  where p.id = p_user_id;

  if v_username is null or length(trim(v_username)) = 0 then
    return false;
  end if;

  if v_requires_change then
    return false;
  end if;

  if lower(v_username) in ('gymly_user', 'appleuser', 'googleuser') then
    return false;
  end if;

  if v_username ~* '^u_[a-f0-9]{8,}$' then
    return false;
  end if;

  if lower(v_username) like 'demo[_]%'
     or lower(v_username) like 'test[_]%seed%' then
    return false;
  end if;

  select u.email, u.raw_user_meta_data ->> 'gymly_demo'
  into v_email, v_demo_meta
  from auth.users u
  where u.id = p_user_id;

  if coalesce(v_demo_meta, '') in ('true', '1', 'yes') then
    return false;
  end if;

  if v_email is not null and (
    lower(v_email) like '%+demo@%'
    or lower(v_email) like '%@gymly.demo'
    or lower(v_email) like '%@example.com'
  ) then
    return false;
  end if;

  return true;
end;
$f$;

revoke all on function public.referral_account_is_eligible(uuid) from public, anon, authenticated, service_role;
grant execute on function public.referral_account_is_eligible(uuid) to postgres;
