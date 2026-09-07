# Invite 5 Friends — Checkpoint E notes

## Scope

Founding Crew + shop entitlement helpers, one-time `BadgeUnlockModal` celebration (consume-after-display), tests.

## Safeguards

1. **Celebration consumed only after display** — `enqueueServerAwardedBadgeUnlockOnce` queues only; `markServerBadgeUnlockModalDisplayed` runs from `BadgeUnlockModal` `onShow` via `BadgeUnlockModalHost`.
2. **Dismiss / kill before display** — `onServerBadgeUnlockModalDismissed` clears the in-memory queue lock without marking shown. App restart + `hydrateUserBadgesFromServer` / invite hub re-call enqueue while pending.
3. **Once per device = celebration only** — AsyncStorage flag does not touch `user_badges` / `referral_rewards`. Reinstall or another device may show the modal again; the server badge/entitlement stay.
4. **No duplicate enqueue** — in-memory `queuedOrDisplaying` + queue membership + `hasShown` block repeated realtime/hydrate races.
5. **Server-only badge** — `manual_server` / no client upsert; helper refuses non-`manual_server` ids.
6. **Shop CTA** — `REFERRAL_REWARDS_COLLECTION_LIVE = false`; unlocked users see coming-soon / disabled, never open the unpublished collection.

## Files

| File | Role |
|------|------|
| `src/services/referral/referralEntitlement.ts` | Progress / CTA view-model |
| `src/services/referral/serverBadgeUnlockModal.ts` | Queue + consume-after-display |
| `src/components/badges/BadgeUnlockModal.tsx` | `onDisplayed` / Modal `onShow` |
| `src/components/badges/BadgeUnlockModalHost.tsx` | Wires display consume for `manual_server` |
| `src/store/badgeStore.ts` | Pending re-enqueue on hydrate; dismiss releases lock |
| `__tests__/inviteFiveFriendsCheckpointE.test.ts` | Edge-case tests |

## Assumptions

- “Successfully displayed” = native Modal `onShow` fired for that badge id.
- Collection remains unpublished until product flips `REFERRAL_REWARDS_COLLECTION_LIVE`.
