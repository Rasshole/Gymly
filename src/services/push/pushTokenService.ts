import {Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import messaging, {AuthorizationStatus} from '@react-native-firebase/messaging';
import {supabase} from '@/services/supabase/supabaseClient';
import {isFirebaseNativeAvailable} from '@/services/firebase/nativeAvailability';

const DEVICE_ID_KEY = '@gymly/push_device_id_v1';
const PERMISSION_STATUS_KEY = '@gymly/push_permission_status_v1';

export type PushPermissionStatus =
  | 'authorized'
  | 'provisional'
  | 'denied'
  | 'not_determined'
  | 'unavailable';

function pushDebugLog(message: string, meta?: Record<string, unknown>) {
  if (!__DEV__) {
    return;
  }
  if (meta) {
    console.log(`[push] ${message}`, meta);
    return;
  }
  console.log(`[push] ${message}`);
}

function mapPermissionStatus(status: number): PushPermissionStatus {
  if (status === AuthorizationStatus.AUTHORIZED) {
    return 'authorized';
  }
  if (status === AuthorizationStatus.PROVISIONAL) {
    return 'provisional';
  }
  if (status === AuthorizationStatus.DENIED) {
    return 'denied';
  }
  return 'not_determined';
}

async function getOrCreateDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY).catch(() => null);
  if (existing && existing.trim()) {
    return existing.trim();
  }
  const created = `${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await AsyncStorage.setItem(DEVICE_ID_KEY, created).catch(() => {});
  return created;
}

/**
 * iOS: vis system-popup (efter I har vist eget Gymly-gennemsyn).
 */
export async function requestUserPermission(): Promise<boolean> {
  if (!isFirebaseNativeAvailable()) {
    pushDebugLog('permission request skipped (firebase unavailable)');
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
  const mappedStatus = mapPermissionStatus(status);
  await AsyncStorage.setItem(PERMISSION_STATUS_KEY, mappedStatus).catch(() => {});
  pushDebugLog('permission status', {status: mappedStatus, granted: ok});
  return ok;
}

export async function getPushPermissionStatus(): Promise<PushPermissionStatus> {
  if (!isFirebaseNativeAvailable()) {
    pushDebugLog('permission check (firebase unavailable)');
    return 'unavailable';
  }
  try {
    const status = await messaging().hasPermission();
    const mapped = mapPermissionStatus(status);
    await AsyncStorage.setItem(PERMISSION_STATUS_KEY, mapped).catch(() => {});
    return mapped;
  } catch {
    const cached = await AsyncStorage.getItem(PERMISSION_STATUS_KEY).catch(() => null);
    if (cached === 'authorized' || cached === 'provisional' || cached === 'denied' || cached === 'not_determined') {
      return cached;
    }
    return 'unavailable';
  }
}

export async function getFcmToken(): Promise<string | null> {
  if (!isFirebaseNativeAvailable()) {
    pushDebugLog('fcm token skipped (firebase unavailable)');
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
    const token = await messaging().getToken();
    pushDebugLog('fcm token generated', {generated: Boolean(token), length: token?.length ?? 0});
    return token;
  } catch (error) {
    pushDebugLog('fcm token generation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
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
    pushDebugLog('token save skipped (missing user/token)', {hasUserId: Boolean(userId)});
    return;
  }
  const baseRow = {
    user_id: userId,
    token: token.trim(),
    platform,
    enabled: true,
    updated_at: new Date().toISOString(),
  };
  const rowWithDeviceId = {
    ...baseRow,
    device_id: await getOrCreateDeviceId(),
  };

  const {error: primaryError} = await supabase
    .from('user_push_tokens')
    .upsert(rowWithDeviceId, {onConflict: 'user_id,token'});

  if (!primaryError) {
    pushDebugLog('token saved in user_push_tokens', {
      userId,
      platform,
      withDeviceId: true,
    });
    return;
  }

  pushDebugLog('primary token upsert failed', {error: primaryError.message});

  const {error: fallbackError} = await supabase
    .from('user_push_tokens')
    .upsert(baseRow, {onConflict: 'user_id,token'});

  if (fallbackError) {
    pushDebugLog('fallback token upsert failed', {error: fallbackError.message});
    return;
  }

  pushDebugLog('token saved in user_push_tokens (fallback without device_id)', {
    userId,
    platform,
    withDeviceId: false,
  });
}

export async function setPushTokenEnabledForUser(
  userId: string,
  enabled: boolean,
): Promise<void> {
  const {error} = await supabase
    .from('user_push_tokens')
    .update({enabled, updated_at: new Date().toISOString()})
    .eq('user_id', userId);
  if (error) {
    pushDebugLog('toggle token enabled failed', {error: error.message, enabled});
    return;
  }
  pushDebugLog('toggle token enabled succeeded', {enabled});
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
