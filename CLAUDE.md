# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start Metro bundler
npm run start               # or npm run metro

# Run on device/simulator
npm run ios                 # uses --scheme GymlyFresh
npm run android

# Reset Metro cache
npm run start:clean

# Lint
npm run lint                # ESLint over .js/.jsx/.ts/.tsx

# Tests
npm test                    # run all Jest tests
npx jest src/services/autoCheckout/__tests__/evaluateAutoCheckout.test.ts  # single file

# iOS pod install (after native dependency changes)
npm run ios:pod             # cd ios && pod install

# Open Xcode
npm run ios:open
```

After `npm install`, patches are auto-applied via `patch-package` (see `patches/`).

## Architecture

### Dual-backend data layer

The app uses **two backends simultaneously**:

- **Supabase** (`src/services/supabase/`) — primary data store for profiles, check-ins, DMs, friends, leaderboards, planned workouts, presence, and realtime subscriptions. Client is a singleton at `src/services/supabase/supabaseClient.ts`.
- **Firebase** (`src/services/firestore/`, `src/services/firebase/`) — handles FCM push notifications, Firestore-based activity feed, and some legacy data paths. Cloud Functions live in `functions/src/index.ts`.

`src/config/dataConfig.ts` contains `SKIP_CHECK_IN_LOCATION_RADIUS` (dev-only GPS override). `src/config/launchSurfaceConfig.ts` contains feature flags that gate entire UI surfaces (leaderboard, groups, online tab, demo mode) — these features are fully implemented but hidden; flip the flag to re-surface them.

### State management

Zustand stores in `src/store/` are the single source of truth for UI state. Each domain has its own store (e.g., `sessionStore`, `workoutStore`, `checkInUIStore`). The primary auth/user state lives in `appStore.ts`.

### Navigation structure

```
RootNavigator          — switches Auth ↔ Main based on appStore.isAuthenticated
  AuthNavigator        — Login, Register, ForgotPassword
  MainNavigator        — wraps everything post-login
    MainTabs (bottom)  — Home | Friends | CheckIn | Badges | Messages | Profile
    Stack screens      — all modal/detail screens pushed on top of tabs
```

`MainNavigator` also mounts several headless bootstrap components that start realtime subscriptions and background services: `GymlyRealtimeHub`, `CheckInSessionController`, `InAppNotificationBootstrap`, `PushNotificationBootstrap`, `UserBadgesRealtimeSync`.

### Realtime

`src/realtime/gymlyRealtimeHub.tsx` is the central Supabase Realtime coordinator — it manages channel subscriptions for presence, active check-ins, and profile updates. Individual subscription files in `src/realtime/` bridge data into Zustand stores.

### Check-in & auto-checkout

The active session lifecycle is:
1. User checks in → `src/services/supabase/checkInService.ts` + `liveWorkoutSessionService.ts`
2. `CheckInSessionController` (`src/components/checkin/`) polls GPS and calls `evaluateAutoCheckout.ts`
3. Auto-checkout fires if the user is >200 m away for longer than the grace period, or after 4 h of inactivity — pure functions in `evaluateAutoCheckout.ts` are unit-tested
4. Session completion → `src/services/session/completeWorkoutSession.ts` → badge engine → stats update

### Path aliases

`@/` maps to `src/` everywhere (configured in both `babel.config.js` and `tsconfig.json`). Additional aliases: `@components`, `@screens`, `@services`, `@utils`, `@types`, `@store`.

### i18n

Translations live in `src/i18n/translations/` (Danish `da.ts`, English `en.ts`, Swedish `sv.ts`). Use the `useTranslation()` hook from `@/i18n`. Danish is the default/primary language.

### iOS Live Activity

`ios/GymlyLiveActivityWidget/` is a Swift extension that shows an active workout timer on the Dynamic Island / lock screen. It is driven from `src/services/ios/workoutLiveActivity.ts`.

### Deploy bundle

`deploy-bundle/` is a static web app (Netlify/Vercel) for auth deep links (email confirm, password reset) and legal pages. It is separate from the React Native app.
