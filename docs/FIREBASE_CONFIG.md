# Firebase-konfiguration

Firebase er installeret. For at aktivere Firestore-rangliste:

## 1. Opret Firebase-projekt

1. Gå til [Firebase Console](https://console.firebase.google.com/)
2. Opret nyt projekt eller vælg eksisterende
3. Tilføj iOS-app med bundle ID fra Xcode (fx `com.gymly.app`)
4. Tilføj Android-app med package name `com.gymly.app`

## 2. Download konfigurationsfiler

### iOS
- Download `GoogleService-Info.plist` fra Firebase Console
- Erstat filen i `ios/GymlyFresh/GoogleService-Info.plist`

### Android
- Download `google-services.json` fra Firebase Console
- Erstat filen i `android/app/google-services.json`

## 3. Kør pod install (iOS)

```bash
cd ios && pod install && cd ..
```

## 4. Aktiver Firestore

I `src/config/leaderboardConfig.ts`:
```ts
export const USE_FIRESTORE_LEADERBOARD = true;
```

## 5. Opret Firestore-collections

Se `docs/LEADERBOARD_FIRESTORE_SETUP.md` for data model og indexes.
