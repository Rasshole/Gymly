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

## Release plan

`INVITE_5_FRIENDS_ENABLED` stays `false` in the public App Store and Play version until the internal tests below pass. Do not deploy the website, push database migrations, or upload store builds as part of preparing this plan.

1. **Migration clarification.** Requires Supabase CLI login. Read `schema_migrations` for `20260716120000`, including `name` and `statements`, and compare that SQL with `20260716120000_disable_stale_checkin_cleanup.sql` and `20260716120100_user_centers.sql`. Also check whether `public.user_centers` exists and whether `referrals` has `invite_captured_at`, `account_created_at`, and `onboarding_completed_at`. The version list alone does not show which SQL ran under the shared version.
2. **Database changes.** Requires approval after step 1. Only then consider applying `20260716120100`, `20261005193000`, and `20261005213000` to the hosted project.
3. **Public invite page and verification files.** Requires approval. Confirm the Play App Signing fingerprint `52:5B:1C:D0:…:A3:30` in Play Console first; it is unverified. Then publish the invite page, AASA, and `assetlinks.json`.
4. **Android release signing.** When Java and `android/keystore.properties` plus the real keystore are available, run `./gradlew :app:assembleRelease` and confirm the artifact is signed with that release key. Without Java or without the keystore configuration, the release build must fail and must not be signed with the debug key. On 2026-10-05 this Mac had no Java runtime and no `keystore.properties`; `./gradlew :app:assembleRelease` exited 1 with “Unable to locate a Java Runtime”, so the signed build was not run and the keystore check inside Gradle was not reached.
5. **Internal invite test.** After steps 1–3 are approved and applied, distribute internal iOS and Android builds with the invite surface on for those builds only. Test an invite link while the app is already installed, and test typing the code manually after a fresh install. Do not ship those binaries as the public version.
6. **Public flag.** Requires a separate decision after step 5 passes. Set `INVITE_5_FRIENDS_ENABLED` to `true` only in the public release that follows those tests.
