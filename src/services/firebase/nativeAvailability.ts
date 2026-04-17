/**
 * Native Firebase (@react-native-firebase) er valgfri i Gymly: auth og primær data
 * kører via Supabase. Firestore bruges kun når native app er initialiseret
 * (GoogleService-Info.plist / google-services.json + Firebase SDK).
 */

import firebase from '@react-native-firebase/app';

/**
 * `true` når mindst én Firebase-app er registreret (typisk [DEFAULT]).
 * `false` før init eller på builds uden Firebase-konfiguration — kald ikke `firestore()`.
 */
export function isFirebaseNativeAvailable(): boolean {
  try {
    return firebase.apps.length > 0;
  } catch {
    return false;
  }
}
