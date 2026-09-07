# Invite 5 Friends — Checkpoint D notes

## Navigation placement

| Entry | Location |
|-------|----------|
| Primary | Friends tab list header — secondary CTA under Add friend |
| Secondary | Settings → Account — “Invite 5 friends” |
| Screen | `MainStack` route `InviteFiveFriends` (`InviteFiveFriendsScreen`) |

Onboarding: optional invite code on Register **social** step; apply on submit via `applyReferralCode` (never blocks account creation).

## UI description

**Invite hub:** white cards on light background, purple primary CTAs, five progress dots, personal code + link, Share / Copy link / Copy code, Founding Crew locked/unlocked card, shop entitlement copy (“15% off selected Gymly Shop products”). Shop CTA opens `https://shop.gymlyapp.com/collections/referral-rewards` only when unlocked **and** `REFERRAL_REWARDS_COLLECTION_LIVE`; otherwise the CTA is disabled/coming-soon. Founding Crew celebration uses existing `BadgeUnlockModal` (one-time via AsyncStorage + badge store queue).

**Onboarding:** invite field under bio; optional; prefilled from `pendingInviteCode`; errors via Alert after register without blocking Main.

## Changed files (uncommitted)

- `src/screens/main/InviteFiveFriendsScreen.tsx`
- `src/screens/auth/RegisterScreen.tsx`
- `src/screens/main/FriendsScreen.tsx`
- `src/screens/main/SettingsScreen.tsx`
- `src/navigation/MainNavigator.tsx`
- `src/config/badgeDefinitions.ts` (+ `referral_founder_5`)
- `src/types/badge.types.ts`, `src/services/badgeEngine.ts`, `src/store/badgeStore.ts` (skip client upsert for `manual_server`)
- `src/screens/main/BadgesScreen.tsx` (referral section)
- `src/services/referral/*`, `src/utils/clipboard.ts`
- i18n `en` / `da` / `nb` / `sv`
- `__tests__/inviteFiveFriendsCheckpointD.test.ts`

## Unresolved product decisions

- Flip `REFERRAL_REWARDS_COLLECTION_LIVE` to `true` when the Shopify collection is published.
- Deep-link → `savePendingInviteCode` wiring remains Checkpoint F.
