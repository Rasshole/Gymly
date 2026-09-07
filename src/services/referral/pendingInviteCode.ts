/**
 * Persist an invite code captured before/during signup (deep link / paste)
 * until the onboarding social step can call applyReferralCode.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {normalizeReferralCode} from '@/services/referral/referralCodeUtils';

const PENDING_INVITE_CODE_KEY = '@gymly/pending_invite_code';

export async function savePendingInviteCode(
  rawCode: string | null | undefined,
): Promise<string | null> {
  const code = normalizeReferralCode(rawCode);
  if (!code || code.length < 4) {
    return null;
  }
  await AsyncStorage.setItem(PENDING_INVITE_CODE_KEY, code);
  return code;
}

export async function getPendingInviteCode(): Promise<string | null> {
  const raw = await AsyncStorage.getItem(PENDING_INVITE_CODE_KEY);
  return normalizeReferralCode(raw);
}

export async function clearPendingInviteCode(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_INVITE_CODE_KEY);
}

/** Read + clear. Returns null if missing/invalid. */
export async function consumePendingInviteCode(): Promise<string | null> {
  const code = await getPendingInviteCode();
  if (code) {
    await clearPendingInviteCode();
  }
  return code;
}
