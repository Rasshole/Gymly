# Active Check-in Flow – File Mapping

**Purpose:** Identify the exact files that power each part of the currently visible flow in the simulator.

---

## 1. TJEK IND TAB SCREEN

| Item | Value |
|------|-------|
| **Route** | `MainTabParamList.CheckIn` |
| **Navigator** | `MainNavigator.tsx` → `MainTabs` → `Tab.Screen name="CheckIn"` |
| **Active file** | `src/screens/main/CheckInScreen.tsx` |
| **Component** | `CheckInScreen` (default export) |

**Render path:**
- Tab bar: `CustomTabBar.tsx` (tab label "Tjek ind")
- Screen: `CheckInScreen.tsx` – form with gym selector, time, workout chips, note, social signals, **SwipeCheckIn** (replaces old "Check ind" button)

---

## 2. CHECKED-IN SCREEN / STATE

After swipe/check-in, there are two possible states:

### A. Active session (new flow)
| Item | Value |
|------|-------|
| **Condition** | `activeSession !== null` (from `useSessionStore`) |
| **Active file** | `src/screens/main/CheckInScreen.tsx` (lines 236–259) |
| **Renders** | `ActiveSessionView` from `src/components/checkin/ActiveSessionView.tsx` |
| **Content** | Gym name, "Du er tjekket ind", live timer, LIVE pill, active users, "Afslut træning" |

### B. Success state (after ending session)
| Item | Value |
|------|-------|
| **Condition** | `showSuccess === true` |
| **Active file** | `src/screens/main/CheckInScreen.tsx` (lines 261–288) |
| **Renders** | Inline success view (checkmark, "Check-in registreret", "Færdig" button) |
| **Not a component** | Inline JSX in CheckInScreen |

---

## 3. END WORKOUT MODAL

| Item | Value |
|------|-------|
| **Trigger** | User taps "Afslut træning" in `ActiveSessionView` |
| **Handler** | `handleEndSession` in CheckInScreen → `setShowSummaryModal(true)` |
| **Active file** | `src/components/checkin/WorkoutSummaryModal.tsx` |
| **Rendered in** | `CheckInScreen.tsx` (lines 248–256) when `showSummaryModal && activeSession` |

**Note:** WorkoutSummaryModal shows workout summary + share flow (media, caption, mood, Del på feed / Kun mig). It is the only end-workout modal in the check-in flow.

---

## 4. FEED POST CARD

There are three separate feed-like areas with different render paths:

### A. Home screen – main feed (primary feed)
| Item | Value |
|------|-------|
| **Screen** | `src/screens/main/HomeScreen.tsx` |
| **Data** | `feedItems` from `useFeedStore()` (`src/store/feedStore.ts`) |
| **Render** | **Inline** – no shared card component |
| **Structure** | `feedItems.map` → `View` + `feedCardHeader` + `feedWorkoutInfoLine` + `FeedPhoto` or `Video` + `feedHighlight` |
| **Lines** | ~1475–1650 in HomeScreen.tsx |
| **Components** | `FeedPhoto` (memo component inside HomeScreen), inline Video |

### B. Home screen – activity preview (3 items)
| Item | Value |
|------|-------|
| **Screen** | `src/screens/main/HomeScreen.tsx` |
| **Section** | "Aktivitet" (DashboardSection) |
| **Data** | `activityEvents` (from mock/firestore) |
| **Active file** | `src/components/ui/ActivityCard.tsx` |
| **Lines** | ~1210–1236 in HomeScreen.tsx |

### C. Activity feed screen (full list)
| Item | Value |
|------|-------|
| **Route** | `ActivityFeed` (navigated via "Se al aktivitet", "Aktivitet" quick action) |
| **Active file** | `src/screens/main/ActivityFeedScreen.tsx` |
| **Cards** | `ActivityCard` for non-workout events; `GymlyPostCard` for `check_in` / `workout_completed` |
| **Data** | `useActivityData` → `activityEvents` |

---

## 5. PROFILE POST CARD

| Item | Value |
|------|-------|
| **Screen** | `src/screens/main/ProfileScreen.tsx` |
| **Section** | "Seneste aktivitet" |
| **Render** | **Inline** – no ActivityCard, no GymlyPostCard |
| **Structure** | `userActivity.map` → `View` + `activityRow` + `activityAvatar` + `activityContent` |
| **Lines** | ~168–188 in ProfileScreen.tsx |
| **Data** | `mockActivityEvents` filtered by current user |

**Friend profile:** `FriendProfileScreen.tsx` has a "feed" tab but shows `emptyFeed` – "Ingen indlæg endnu" (no actual post rendering).

---

## SUMMARY TABLE

| Flow part | Active file(s) | Component / render |
|-----------|----------------|--------------------|
| Tjek ind tab | `CheckInScreen.tsx` | CheckInScreen + SwipeCheckIn |
| Checked-in (live) | `CheckInScreen.tsx` → `ActiveSessionView.tsx` | ActiveSessionView |
| Checked-in (success) | `CheckInScreen.tsx` | Inline success view |
| End workout modal | `WorkoutSummaryModal.tsx` | WorkoutSummaryModal |
| Home main feed | `HomeScreen.tsx` | Inline feedCard + FeedPhoto/Video |
| Home activity preview | `HomeScreen.tsx` | ActivityCard |
| Activity feed screen | `ActivityFeedScreen.tsx` | ActivityCard + GymlyPostCard |
| Profile activity | `ProfileScreen.tsx` | Inline activityRow |

---

## IMPORTANT

- **HomeScreen main feed** uses its own inline UI, not ActivityCard or GymlyPostCard.
- **ProfileScreen** uses its own inline activity rows, not shared card components.
- **GymlyPostCard** is used only in `ActivityFeedScreen`.
- **addFeedItem** (feedStore) is never called; `feedItems` stays empty unless another path adds items.
