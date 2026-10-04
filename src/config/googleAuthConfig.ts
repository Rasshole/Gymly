/**
 * Google Sign-In client IDs — from native env / react-native-config only.
 * Never hardcode production secrets in source.
 */

import {Platform} from 'react-native';
import {collectNativeConfigEnv} from '@/config/nativeConfigEnv';

function readConfig(key: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Config = require('react-native-config').default as Record<
      string,
      string | undefined
    >;
    const fromRn = Config?.[key]?.trim();
    if (fromRn) {
      return fromRn;
    }
  } catch {
    /* optional */
  }
  const native = collectNativeConfigEnv();
  const fromNative = native[key]?.trim();
  return fromNative || '';
}

export function getGoogleWebClientId(): string {
  return readConfig('GOOGLE_WEB_CLIENT_ID');
}

export function getGoogleIosClientId(): string {
  return readConfig('GOOGLE_IOS_CLIENT_ID');
}

export function isGoogleSignInConfigured(): boolean {
  if (!getGoogleWebClientId()) {
    return false;
  }
  // iOS native Google Sign-In requires the iOS OAuth client id (URL scheme + SDK).
  if (Platform.OS === 'ios' && !getGoogleIosClientId()) {
    return false;
  }
  return true;
}
