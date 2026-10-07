/**
 * Apply a saved invite code once the signed-in account exists.
 * Same-code retries share one in-flight call. The server is idempotent too.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  applyReferralCode,
  recordReferralInviteOpen,
  type ApplyReferralResult,
} from '@/services/supabase/referralService';
import {
  mapReferralApplyError,
  referralApplyErrorMessageKey,
} from '@/services/referral/referralApplyErrors';
import {referralJourneyMayUseBackend} from '@/services/referral/inviteSurface';
import {
  clearPendingInviteCode,
  getPendingInviteCode,
  savePendingInviteCode,
} from '@/services/referral/pendingInviteCode';
import {normalizeReferralCode} from '@/services/referral/referralCodeUtils';

const ERROR_KEY = '@gymly/pending_invite_error';
const OPEN_PREFIX = '@gymly/referral_open_noted:';

export type SubmitInviteResult = {
  applied: boolean;
  idempotent: boolean;
  errorKey: string | null;
  result: ApplyReferralResult | null;
};

let inFlight: Promise<SubmitInviteResult> | null = null;

async function rememberError(errorKey: string | null): Promise<void> {
  if (!errorKey) {
    await AsyncStorage.removeItem(ERROR_KEY);
    return;
  }
  await AsyncStorage.setItem(ERROR_KEY, errorKey);
}

export async function getPendingInviteErrorKey(): Promise<string | null> {
  const raw = await AsyncStorage.getItem(ERROR_KEY);
  return raw && raw.length > 0 ? raw : null;
}

export async function noteReferralInviteOpened(rawCode: string): Promise<void> {
  if (!referralJourneyMayUseBackend()) {
    return;
  }
  const code = normalizeReferralCode(rawCode);
  if (!code) {
    return;
  }
  const key = `${OPEN_PREFIX}${code}`;
  if ((await AsyncStorage.getItem(key)) === '1') {
    return;
  }
  await recordReferralInviteOpen(code);
  await AsyncStorage.setItem(key, '1');
}

async function submitInviteCodeInner(rawCode: string): Promise<SubmitInviteResult> {
  try {
    const result = await applyReferralCode(rawCode);
    const onboardingDone = Boolean(result.onboardingCompletedAt);
    if (onboardingDone) {
      await clearPendingInviteCode();
    } else {
      await savePendingInviteCode(rawCode);
    }
    await rememberError(null);
    return {
      applied: true,
      idempotent: result.idempotent,
      errorKey: null,
      result,
    };
  } catch (error) {
    const kind = mapReferralApplyError(error);
    const errorKey = referralApplyErrorMessageKey(kind);
    if (kind === 'invalid' || kind === 'expired' || kind === 'self' || kind === 'already') {
      await clearPendingInviteCode();
    }
    await rememberError(errorKey);
    return {applied: false, idempotent: false, errorKey, result: null};
  }
}

/** One shared lock for deep-link apply and manual double-tap. */
export async function submitInviteCode(rawCode: string): Promise<SubmitInviteResult> {
  if (!referralJourneyMayUseBackend()) {
    return {applied: false, idempotent: false, errorKey: null, result: null};
  }
  if (inFlight) {
    return inFlight;
  }
  inFlight = submitInviteCodeInner(rawCode).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export async function applyPendingInviteCode(): Promise<SubmitInviteResult> {
  const pending = await getPendingInviteCode();
  if (!pending) {
    return {applied: false, idempotent: false, errorKey: null, result: null};
  }
  return submitInviteCode(pending);
}
