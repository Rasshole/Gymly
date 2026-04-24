import {Platform} from 'react-native';
import messaging, {AuthorizationStatus} from '@react-native-firebase/messaging';
import {supabase} from '@/services/supabase/supabaseClient';
import {isFirebaseNativeAvailable} from '@/services/firebase/nativeAvailability';

/**
 * iOS: vis system-popup (efter I har vist eget Gymly-gennemsyn).
 */
export async function requestUserPermission(): Promise<boolean> {
  if (!isFirebaseNativeAvailable()) {
    return false;
  }
  if (Platform.OS === 'ios') {
    try {
      await messaging().registerDeviceForRemoteMessages();
    } catch {
      // ignore
    }
  }
  const status = await messaging().requestPermission();
  const ok =
    status === AuthorizationStatus.AUTHORIZED ||
    status === AuthorizationStatus.PROVISIONAL;
  return ok;
}

export async function getFcmToken(): Promise<string | null> {
  if (!isFirebaseNativeAvailable()) {
    return null;
  }
  try {
    if (Platform.OS === 'ios') {
      try {
        await messaging().registerDeviceForRemoteMessages();
      } catch {
        // ignore
      }
    }
    return await messaging().getToken();
  } catch {
    return null;
  }
}

/**
 * Gem / opdater token i Supabase (unik per bruger+token).
 */
export async function savePushTokenToSupabase(
  userId: string,
  token: string,
  platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android',
): Promise<void> {
  if (!userId || !token?.trim()) {
    return;
  }
  const {error} = await supabase.from('user_push_tokens').upsert(
    {
      user_id: userId,
      token: token.trim(),
      platform,
      enabled: true,
      updated_at: new Date().toISOString(),
    },
    {onConflict: 'user_id,token'},
  );
  if (error && __DEV__) {
    console.warn('[push] save token', error.message);
  }
}

export function subscribeToTokenRefresh(onToken: (token: string) => void): () => void {
  if (!isFirebaseNativeAvailable()) {
    return () => {};
  }
  return messaging().onTokenRefresh(t => {
    onToken(t);
  });
}

export function getMessaging() {
  return isFirebaseNativeAvailable() ? messaging() : null;
}
