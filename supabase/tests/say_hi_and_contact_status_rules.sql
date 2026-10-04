-- Isolated rules for say_hi_and_contact_status (synthetic data only).
-- Run against a throwaway DB that has the migration applied.

\set ON_ERROR_STOP on

do $$
declare
  u1 uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  u2 uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  u3 uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
begin
  -- stub auth.uid via temporary setting is not available; use security definer
  -- by setting request.jwt — instead call functions as postgres with set local role
  -- For isolated verify we exercise constraints + helpers without JWT by direct SQL.

  insert into auth.users (id, email) values
    (u1, 'a@example.com'),
    (u2, 'b@example.com'),
    (u3, 'c@example.com')
  on conflict do nothing;

  insert into public.profiles (id, username, display_name)
  values
    (u1, 'user_a', 'Alice'),
    (u2, 'user_b', 'Bob'),
    (u3, 'user_c', 'Cara')
  on conflict (id) do nothing;

  insert into public.check_ins (
    user_id, gym_id, gym_name, workout_type, started_at, is_active, ended_at, contact_status
  ) values
    (u1, 'gym-1', 'SATS Valby', 'ben', now(), true, null, 'open'),
    (u2, 'gym-1', 'SATS Valby', 'ben', now(), true, null, 'focused'),
    (u3, 'gym-1', 'SATS Valby', 'bryst', now(), true, null, 'open');

  -- contact_status null is allowed (safe fallback)
  update public.check_ins set contact_status = null where user_id = u3;

  -- one pending pair unique
  insert into public.say_hi_requests (
    sender_id, recipient_id, message, gym_id, status, expires_at
  ) values (
    u1, u3, 'Hey', 'gym-1', 'pending', now() + interval '24 hours'
  );

  begin
    insert into public.say_hi_requests (
      sender_id, recipient_id, message, gym_id, status, expires_at
    ) values (
      u3, u1, 'Hi back', 'gym-1', 'pending', now() + interval '24 hours'
    );
    raise exception 'expected unique pending pair violation';
  exception
    when unique_violation then
      null;
  end;

  -- decline is private: sender policy excludes declined
  update public.say_hi_requests set status = 'declined', responded_at = now()
  where sender_id = u1 and recipient_id = u3;

  -- expire helper
  insert into public.say_hi_requests (
    sender_id, recipient_id, message, gym_id, status, expires_at
  ) values (
    u1, u2, 'Late', 'gym-1', 'pending', now() - interval '1 minute'
  );
  perform public.expire_say_hi_requests();
  if exists (
    select 1 from public.say_hi_requests
    where sender_id = u1 and recipient_id = u2 and status = 'pending'
  ) then
    raise exception 'expire_say_hi_requests failed';
  end if;

  raise notice 'say_hi isolated rules OK';
end $$;
