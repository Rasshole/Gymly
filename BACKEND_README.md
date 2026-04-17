# Gymly – Backend Integration Guide

Denne fil beskriver hvordan data layer er struktureret og hvad der skal erstattes for rigtig Firestore/backend integration.

## Arkitektur

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│    Screens      │────▶│  Hooks/Services  │────▶│  Mock / Firestore│
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

- **Screens** bruger hooks (`useActivityData`, `useGroups`, etc.) eller services
- **Services** i `src/services/data/` henter data via mock eller Firestore
- **Config** i `src/config/dataConfig.ts` styrer hvilken kilde der bruges

## Filer og ansvar

### Types (src/types/)

| Fil | Beskrivelse |
|-----|-------------|
| `activity.types.ts` | ActivityEvent, ActivityEventType |
| `checkIn.types.ts` | CheckIn, CheckInPayload |
| `profile.types.ts` | ProfileStats, ProfileBadge, Milestone |
| `group.types.ts` | Group, GroupMember, GroupActivity |
| `notification.types.ts` | Notification, NotificationType |
| `chat.types.ts` | Chat, ChatMessage |
| `online.types.ts` | OnlineUser, OnlineUserStatus |
| `leaderboard.types.ts` | LeaderboardEntry, LeaderboardStats |

### Mock data (src/mocks/)

- `src/mocks/index.ts` – re-eksporterer fra `src/data/mockData.ts`
- **Erstat:** Når Firestore er klar, fjern mock-imports i services og brug Firestore-queries

### Firestore services (src/services/firestore/)

| Service | Collections | Beskrivelse |
|---------|-------------|-------------|
| CheckinService | `checkins`, `activities` | submitCheckIn – batch write |
| ActivityFirestoreService | `activities` | subscribeToActivities – onSnapshot realtime |
| GymPresenceService | `checkins` | subscribeToGymPresence – check-ins &lt; 90 min |
| UserService | `users` | getUserStats – streak, weeklyCheckins, etc. |

Styres af `USE_MOCK_DATA` i `dataConfig.ts`.

### Services (src/services/data/)

| Service | Mock data | Firestore collection (foreslået) |
|---------|-----------|-----------------------------------|
| ActivityService | mockActivityEvents | `activities` (realtime) |
| GroupService | mockGroups, mockGroupActivity | `groups`, `groupActivity` |
| OnlineUsersService | mockOnlineUsers | `presence` eller `checkIns` (real-time) |
| ProfileService | mockProfileStats, mockProfileBadges | `users/{id}/profile`, `users/{id}/badges` |
| LeaderboardDataService | mockLeaderboardEntries | `leaderboardStats` (se leaderboardService) |

### Config (src/config/)

- `dataConfig.ts` – `USE_MOCK_DATA.activity`, `.groups`, etc.
- `leaderboardConfig.ts` – `USE_FIRESTORE_LEADERBOARD` (leaderboard har allerede Firestore-støtte)

## Hvad skal erstattes

### 1. ActivityService
- **Nu:** Returnerer `mockActivityEvents`
- **Senere:** Firestore `activityEvents` collection med `orderBy('timestamp', 'desc')`
- **Realtime:** `onSnapshot` for live feed

### 2. GroupService
- **Nu:** Returnerer `mockGroups`
- **Senere:** Firestore `groups` collection
- **Subcollections:** `groups/{id}/members`, `groups/{id}/activity`

### 3. OnlineUsersService
- **Nu:** Returnerer `mockOnlineUsers`
- **Senere:** Supabase Realtime Presence eller Firestore `presence` / check-ins med `isActive`

### 4. ProfileService
- **Nu:** Returnerer mock profile stats
- **Senere:** Firestore `users/{userId}` document med `profile` subcollection

### 5. Notifications
- **Nu:** `notificationStore` med `seedWithMock`
- **Senere:** Firestore `notifications/{userId}` collection med `where('read', '==', false)`
- **Realtime:** `onSnapshot` for nye notifikationer

### 6. Chat/Messages
- **Nu:** `chatStore` med `seedWithMock`
- **Senere:** Firestore `chats` og `chats/{chatId}/messages`
- **Realtime:** `onSnapshot` på messages for live chat

### 7. Check-ins
- **Nu:** `gymStore` / lokale check-ins
- **Senere:** Firestore `checkIns` collection

## Næste skridt for rigtig integration

1. **Opret Firestore collections** efter strukturen i types
2. **Implementer Firestore-queries** i hver service (efter `if (!USE_MOCK_DATA.x)`)
3. **Skift config** – sæt `USE_MOCK_DATA.x = false` for hvert domain
4. **Tilføj Realtime** hvor relevant (activity, notifications, chat)
5. **Sikkerhed** – Firestore rules så users kun læser/skriver egne data

## Eksempel: ActivityService med Firestore

```typescript
// I ActivityService.ts
if (!USE_MOCK_DATA.activity) {
  const snapshot = await firestore()
    .collection('activityEvents')
    .where('userId', 'in', [userId, ...friendIds])
    .orderBy('timestamp', 'desc')
    .limit(options.limit ?? 50)
    .get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
```
