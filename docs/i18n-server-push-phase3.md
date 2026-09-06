# Phase 3/4 — Server push notification localization

## Current behavior (do not change in Phase 2)

Gymly stores `title` / `body` on `public.notifications` when events fire.
`send-push` (Edge Function) forwards those stored strings to FCM/APNs.
In-app notification UI largely shows the same stored copy.

**Problem:** SQL triggers write **Danish** strings at insert time (writer/system locale), not the **recipient’s** preferred language.

## Known server-generated Danish templates

| Event | Source | Sample title / body pattern |
|-------|--------|------------------------------|
| Friend request | `trg_notify_friend_request` in `supabase/migrations/20260510140000_social_notification_standard_copy.sql` | `Ny venneanmodning` / `%s vil være venner på Gymly` |
| Friend accepted | `trg_notify_friend_request_accepted` (same migration) | `I er nu venner` / `%s accepterede din venneanmodning` |
| Friend checked in | `trg_notify_friends_on_check_in` (same migration) | Danish check-in copy with workout type |
| Group session invite | `supabase/migrations/20260725220000_gymly_group_sessions.sql` | `%s træner med %s i %s. Vil du være med?` |
| Other notification RPCs | Search `insert into public.notifications` under `supabase/migrations` | Various Danish strings |

Also review:
- `supabase/migrations/20260509140000_workout_vibe_sends.sql`
- `supabase/migrations/20260429150000_in_app_notifications.sql`
- Any later migrations that `format(...)` Danish into `title`/`body`

## Recommended Phase 3/4 plan

1. Add `profiles.preferred_language` (`text`, default `'en'`) synced from the app on language change.
2. Change triggers to store **structured payloads** in `data` (type, actorName, gymName, …) and either:
   - **A)** Resolve localized title/body in `send-push` using recipient language + template map, or
   - **B)** Store template key + params only; localize on client for in-app + on edge for push.
3. Keep English as master template set; add Danish (and later locales) as reviewed packs.
4. Backfill: existing rows remain as-is; only new notifications use the new path.
5. Do not break `send-push` contract — keep accepting `notification_id` and reading rows.

## Out of scope for Phase 2

No SQL/trigger changes. Client notification UI copy that is still hardcoded should use `t()`, but stored server strings will remain Danish until Phase 3/4.
