# Invite 5 Friends — Checkpoint C notes

## Scope (uncommitted for review)

Client referral service + post-checkout qualify fallback. No UI / i18n / deep-link landing yet (D–F).

## Assumptions

1. Server trigger on `check_ins.ended_at` remains authoritative for qualification.
2. Client `scheduleReferralQualifyAfterActivity` is a best-effort fallback after `completeActiveTrainingSession` succeeds; it never throws into checkout.
3. Source argument defaults to `check_in`; server still labels `workout` when `workout_sets` exist.
4. Optional invite code on the onboarding **social** step will call `applyReferralCode` / pending-code helpers in Checkpoint D (service is ready; UI not wired yet).
5. Email verification is not checked client-side or server-side for referrals.

## Changed files

| File | Change |
|------|--------|
| `src/services/supabase/referralService.ts` | RPC wrappers + non-throwing qualify helpers |
| `src/services/referral/pendingInviteCode.ts` | AsyncStorage pending code for onboarding/deep link |
| `src/services/supabase/checkInService.ts` | Schedule qualify after successful checkout |
| `__tests__/referralServiceCheckpointC.test.ts` | Service + pending-code unit tests |

## Tests

`npx jest __tests__/referralServiceCheckpointC.test.ts`
