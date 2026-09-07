# Invite 5 Friends — Checkpoint F notes

## Status

Uncommitted for review. Production assumptions verified as far as local project + live store APIs allow.

## App

- `inviteDeepLink.ts` — parse / validate / normalize → `savePendingInviteCode`
- `appDeepLinkRouter.ts` — invite **before** auth; cold (`getInitialURL`) + warm (`Linking` url) share the same path
- Independent of login — only pending storage; Register social still applies (Checkpoint D)

## Android App Links

| Item | Value |
|------|--------|
| `package_name` | **`com.gymly`** (`android/app/build.gradle` `applicationId`) |
| Play App Signing SHA-256 | `52:5B:1C:D0:D6:3C:0D:F4:FB:2C:15:7E:D2:11:FD:C4:23:8C:48:E3:3B:5D:69:B6:87:11:D4:8C:3F:59:A3:30` (Play Console) |
| Upload / local release keystore SHA-256 | `13:5E:51:77:82:CD:9D:21:C7:ED:AF:D9:45:8F:D8:D1:52:54:5F:2C:AD:F1:3A:7D:C0:38:4F:BA:BF:40:28:2F` (from `gymly-release.keystore` + signed `app-release.aab`) |
| Debug keystore SHA-256 | `BE:09:CA:6D:AD:0A:71:03:EA:0C:A5:09:FF:7B:E1:43:52:32:5A:E8:05:32:07:79:E8:8B:C8:F3:E7:C3:9D:0B` (optional; local App Links) |

`assetlinks.json` (website + web) includes **Play App Signing + upload + debug**. Extra fingerprints do not weaken production Digital Asset Links verification.

## iOS Universal Links

| Item | Source | Value |
|------|--------|--------|
| Team ID | `DEVELOPMENT_TEAM` in `ios/Gymly.xcodeproj/project.pbxproj` | `CDVFBW66X4` |
| Bundle ID | `PRODUCT_BUNDLE_IDENTIFIER` (GymlyFresh) + Firebase `BUNDLE_ID` + live App Store | `com.test1.Gymly` |
| AASA `appIDs` | `TEAM_ID.BUNDLE_ID` | `CDVFBW66X4.com.test1.Gymly` |

Auth include/exclude differences between `website/` and `web/` AASA are preserved; `/invite` + `/invite/*` added to both.

## Store destinations

| Store | Status |
|-------|--------|
| App Store | Verified: `https://apps.apple.com/dk/app/gymly-staerkere-sammen/id6757790972` (bundle `com.test1.Gymly`, id `6757790972`) |
| Google Play | **Unverified** — `id=com.gymly` returns 404; landing omits Play URL (`GYMLY_PLAY_STORE_URL = null`) |

## Manual production steps still required

1. Deploy website (including `.well-known` overlay from `web/`) so live `assetlinks.json` / AASA include `/invite` + Play App Signing fingerprint.
2. Verify Android App Links: `adb shell pm get-app-links com.gymly` after install from Play.
3. Supply public Play Store URL when the listing is live; set `GYMLY_PLAY_STORE_URL` + landing link.
