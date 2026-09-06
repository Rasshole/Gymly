# Invite 5 Friends — Checkpoint B notes

## Locked product decisions

| Decision | Choice |
|----------|--------|
| Onboarding | `Language → Register entry → profile → gym → social → Main` |
| Invite code entry | Optional field on the **social** step |
| Account age | `auth.users.created_at` / client `User.createdAt` |
| Apply window | **24 hours** after account creation |
| Friend badge | Keep existing `social_squad_5` |
| Founding Crew badge | `referral_founder_5` — **server-awarded only** |
| Campaign | `invite_five_founding` (5 qualified referrals) |
| Canonical web | `website/` for gymlyapp.com |
| Invite landing | `/invite/{code}` (Checkpoint F) |
| i18n | `en`, `da`, `nb`, `sv` for new keys |
| Email verification | **Not required** (disabled in Gymly) |

## Workout vs check-in (product OR — no redundant trigger)

Inspection of the current app + migrations:

- Workout log tables (`workout_exercises`, `workout_sets`) FK to `check_ins.id` as `session_id`.
- RLS only allows inserting sets while the check-in is **active** (`ended_at is null`).
- Completing training always goes through `completeWorkoutSession` → `completeActiveTrainingSession` (client PATCH and/or `complete_my_active_check_in`), which sets `check_ins.ended_at`.
- There is **no** standalone workout-completion path that finishes without ending a check-in.

Therefore the single `check_ins.ended_at` qualify trigger covers both product cases. Qualification readiness inside `qualify_referral_for_user` is an **OR**:

1. First completed check-in lasting **≥ 5 minutes**, or
2. That same first completed check-in has at least one **`workout_sets`** row (genuinely logged workout), even if duration &lt; 5 minutes.

Source stored as `workout` when sets exist, else `check_in`. No second trigger on `workout_sets`.

## Migration

`supabase/migrations/20260906140000_invite_five_friends_referral.sql`

- Tables: `referral_codes`, `referrals`, `referral_rewards`
- RPCs: `get_or_create_my_referral_code`, `apply_referral_code`, `get_my_referral_progress`, `qualify_referral_for_user`
- Trigger on `check_ins.ended_at` → qualify (errors swallowed so checkout never rolls back)
- RLS: authenticated **SELECT own** only; no direct INSERT/UPDATE/DELETE
- `user_badges` trigger blocks client writes of `referral_founder_5` unless `gymly.allow_referral_founder_badge=on`

## Product-rule verification

SQL inspection script (run after applying migration):

`supabase/tests/invite_five_friends_referral_rules.sql`

| Rule | Enforcement |
|------|-------------|
| Self-referral rejected | `REFERRAL_SELF_NOT_ALLOWED` in `apply_referral_code` |
| One referrer per referred | Unique index on `referrals.referred_id` |
| 24h apply window | `auth.users.created_at` + `interval '24 hours'` |
| No double qualify | Early `already_qualified`; `UPDATE … WHERE status = 'attributed'` |
| No duplicate 5th reward/badge | Unique `(user_id, campaign_id)` + `ON CONFLICT DO NOTHING`; badge `ON CONFLICT` |
| Client cannot award Founding Crew | `trg_user_badges_block_referral_founder` |
| Qualify failure ≠ checkout rollback | Trigger `EXCEPTION` → `WARNING` only |
| No email confirm gate | No `email_confirmed` checks in referral RPCs |

Jest mirrors these contracts in `__tests__/inviteFiveFriendsReferral.test.ts`.

## Universal Links / App Links — do not overwrite yet

### AASA: `web/` vs `website/`

Both currently target iOS team `CDVFBW66X4` + bundle `com.test1.Gymly`.

| Path | Auth/confirm behaviour |
|------|------------------------|
| `website/.well-known/apple-app-site-association` | Includes `/auth/callback`, `/confirm`, `/reset-password` as applinks |
| `web/.well-known/apple-app-site-association` | **Excludes** `/confirm` and `/auth/callback` (web bridge first); only `/reset-password` opens app |

Canonical site is **`website/`**. Do **not** overwrite either AASA file until product decides whether email confirm/callback should open the app or the web bridge. Invite path `/invite/*` will be added in Checkpoint F after that decision.

### Android Digital Asset Links package ID

| Source | Package / application ID |
|--------|--------------------------|
| `android/app/build.gradle` `applicationId` | `com.gymly` |
| Signed local release AAB (`app-release.aab`, versionCode 51) | `com.gymly` (confirmed via manifest string scan) |
| `website/.well-known/assetlinks.json` | still `com.test1.Gymly` |
| `web/.well-known/assetlinks.json` | still `com.test1.Gymly` |
| iOS `PRODUCT_BUNDLE_IDENTIFIER` | still `com.test1.Gymly` |

**Do not edit `assetlinks.json` in this checkpoint.** Production Play package is confirmed as `com.gymly` from the signed AAB + Gradle. Updating Digital Asset Links (and adding `/invite` intent-filters) is deferred to Checkpoint F together with SHA-256 fingerprint verification for the Play signing key.
