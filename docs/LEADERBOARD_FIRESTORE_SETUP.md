# Rangliste – Firestore Setup

## Oversigt

Rangliste-systemet understøtter både mock data (Zustand) og Firestore. Skift i `src/config/leaderboardConfig.ts`:

```ts
export const USE_FIRESTORE_LEADERBOARD = true;
```

## Data Model

### 1. Bruger-stats: `/users/{uid}/leaderboardStats`

```json
{
  "userId": "string",
  "checkIns": { "weekly": 0, "monthly": 0, "allTime": 0 },
  "prs": { "weekly": 0, "monthly": 0, "allTime": 0 },
  "trainingMinutes": { "weekly": 0, "monthly": 0, "allTime": 0 },
  "socialWorkouts": { "weekly": 0, "monthly": 0, "allTime": 0 },
  "streak": 0,
  "muscleGroupsTrained": { "weekly": 0, "monthly": 0, "allTime": 0 },
  "strengthPRs": { "bench": 0, "squat": 0, "deadlift": 0 },
  "activityScore": { "weekly": 0, "monthly": 0, "allTime": 0 },
  "updatedAt": "Timestamp"
}
```

### 2. Gym leaderboard: `/gyms/{gymId}/leaderboards/{period}/entries/{userId}`

- `period`: `weekly` | `monthly` | `allTime`
- Entry: `userId`, `username`, `displayName`, `photoURL`, `score`, `checkIns`, `updatedAt`

### 3. Weekly Champion: `/gyms/{gymId}/weeklyChampion`

- `userId`, `displayName`, `photoURL`, `activityScore`, `weekStart` (YYYY-MM-DD), `updatedAt`

## Firestore Indexes

Kør i Firebase Console eller via CLI:

```bash
firebase deploy --only firestore:indexes
```

Se `firestore.indexes.json` for composite indexes. Firestore vil foreslå indexes ved første query hvis de mangler.

## Stats-opdatering (Cloud Functions)

Anbefalet: brug Cloud Functions til at opdatere leaderboard-stats ved:

1. **onCheckIn** – når bruger tjekker ind
2. **onCheckOut** – når bruger tjekker ud (opdater gym activity, Weekly Champion)
3. **onWorkoutComplete** – når træning afsluttes
4. **onPRSet** – når PR slås

Client kalder `leaderboardStatsUpdater.ts` – disse funktioner er tomme når `USE_FIRESTORE_LEADERBOARD` er true, og Cloud Functions lytter på Firestore/Realtime Database events.

## Aktivitetsscore-formel

```
activityScore = (checkIns * 2) + (prs * 5) + (trainingMinutes / 30) + (socialWorkouts * 3)
```

## Installation af Firebase

```bash
npm install @react-native-firebase/app @react-native-firebase/firestore
```

iOS: `cd ios && pod install`

Konfigurer `GoogleService-Info.plist` (iOS) og `google-services.json` (Android).
