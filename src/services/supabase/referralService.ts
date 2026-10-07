/**
 * Invite 5 Friends — client wrappers around server RPCs.
 * Qualification is authoritative on the server (trigger + qualify_referral_for_user).
 * Client calls are best-effort fallbacks and must never fail checkout/workout UX.
 */

import {supabase} from '@/services/supabase/supabaseClient';
import {isInviteFiveFriendsSurfaceEnabled} from '@/services/referral/inviteSurface';
import {
  REFERRAL_CAMPAIGN_ID,
  REFERRAL_FOUNDER_BADGE_ID,
  REFERRAL_QUALIFIED_TARGET,
  normalizeReferralCode,
} from '@/services/referral/referralCodeUtils';

export type ReferralCodeResult = {
  id: string;
  code: string;
  isActive: boolean;
  url: string;
  createdAt: string | null;
};

export type ReferralProgress = {
  code: string;
  url: string;
  campaignId: string;
  badgeId: string;
  target: number;
  invitedCount: number;
  signedUpCount: number;
  onboardedCount: number;
  attributedCount: number;
  qualifiedCount: number;
  rewardUnlocked: boolean;
  rewardStatus: string | null;
  discountCode: string | null;
  shopDiscountPercent: number;
};

export type ApplyReferralResult = {
  id: string;
  status: string;
  attributedAt: string | null;
  referrerId: string;
  inviteCapturedAt: string | null;
  accountCreatedAt: string | null;
  onboardingCompletedAt: string | null;
  qualifiedAt: string | null;
  idempotent: boolean;
};

export type QualifyReferralResult = {
  ok: boolean;
  status: string;
  qualifiedAt?: string | null;
  qualificationSource?: string | null;
  rewardUnlocked?: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function mapCode(raw: Record<string, unknown>): ReferralCodeResult {
  return {
    id: String(raw.id ?? ''),
    code: String(raw.code ?? ''),
    isActive: raw.is_active !== false,
    url: String(raw.url ?? ''),
    createdAt: (raw.created_at as string | null) ?? null,
  };
}

function mapProgress(raw: Record<string, unknown>): ReferralProgress {
  return {
    code: String(raw.code ?? ''),
    url: String(raw.url ?? ''),
    campaignId: String(raw.campaign_id ?? REFERRAL_CAMPAIGN_ID),
    badgeId: String(raw.badge_id ?? REFERRAL_FOUNDER_BADGE_ID),
    target: Number(raw.target ?? REFERRAL_QUALIFIED_TARGET),
    // Accounts that applied the code. Link opens are not included.
    invitedCount: Number(raw.signed_up_count ?? raw.invited_count ?? 0),
    signedUpCount: Number(raw.signed_up_count ?? raw.attributed_count ?? 0),
    onboardedCount: Number(raw.onboarded_count ?? 0),
    attributedCount: Number(raw.attributed_count ?? 0),
    qualifiedCount: Number(raw.qualified_count ?? 0),
    rewardUnlocked: raw.reward_unlocked === true,
    rewardStatus: (raw.reward_status as string | null) ?? null,
    discountCode: (raw.discount_code as string | null) ?? null,
    shopDiscountPercent: Number(raw.shop_discount_percent ?? 15),
  };
}

export async function getOrCreateMyReferralCode(): Promise<ReferralCodeResult> {
  const {data, error} = await supabase.rpc('get_or_create_my_referral_code');
  if (error) {
    throw error;
  }
  const row = asRecord(data);
  if (!row?.code) {
    throw new Error('REFERRAL_CODE_MISSING');
  }
  return mapCode(row);
}

export async function applyReferralCode(
  rawCode: string,
): Promise<ApplyReferralResult> {
  const code = normalizeReferralCode(rawCode);
  if (!code || code.length < 4) {
    throw new Error('REFERRAL_CODE_INVALID');
  }
  const {data, error} = await supabase.rpc('apply_referral_code', {
    p_code: code,
  });
  if (error) {
    throw error;
  }
  const row = asRecord(data);
  if (!row?.id) {
    throw new Error('REFERRAL_APPLY_FAILED');
  }
  return {
    id: String(row.id),
    status: String(row.status ?? 'attributed'),
    attributedAt: (row.attributed_at as string | null) ?? null,
    referrerId: String(row.referrer_id ?? ''),
    inviteCapturedAt: (row.invite_captured_at as string | null) ?? null,
    accountCreatedAt: (row.account_created_at as string | null) ?? null,
    onboardingCompletedAt: (row.onboarding_completed_at as string | null) ?? null,
    qualifiedAt: (row.qualified_at as string | null) ?? null,
    idempotent: row.idempotent === true,
  };
}

export async function recordReferralInviteOpen(rawCode: string): Promise<void> {
  const code = normalizeReferralCode(rawCode);
  if (!code || code.length < 4) {
    throw new Error('REFERRAL_CODE_INVALID');
  }
  const {data, error} = await supabase.rpc('record_referral_invite_open', {
    p_code: code,
  });
  if (error) {
    throw error;
  }
  const row = asRecord(data);
  if (row?.ok === false) {
    throw new Error(
      row.status === 'invalid' ? 'REFERRAL_CODE_INVALID' : 'REFERRAL_CODE_NOT_FOUND',
    );
  }
}

export async function getMyReferralProgress(): Promise<ReferralProgress> {
  const {data, error} = await supabase.rpc('get_my_referral_progress');
  if (error) {
    throw error;
  }
  const row = asRecord(data);
  if (!row) {
    throw new Error('REFERRAL_PROGRESS_MISSING');
  }
  return mapProgress(row);
}

/**
 * Idempotent qualify for the authenticated user (self).
 * Prefer the DB trigger; this is a safe client fallback after checkout.
 */
export async function tryQualifyMyReferral(
  userId: string,
  source: 'check_in' | 'workout' = 'check_in',
): Promise<QualifyReferralResult | null> {
  if (!userId) {
    return null;
  }
  try {
    const {data, error} = await supabase.rpc('qualify_referral_for_user', {
      p_referred_id: userId,
      p_source: source,
    });
    if (error) {
      if (__DEV__) {
        console.warn('[Referral] qualify failed', error.message);
      }
      return null;
    }
    const row = asRecord(data);
    if (!row) {
      return null;
    }
    return {
      ok: row.ok !== false,
      status: String(row.status ?? 'unknown'),
      qualifiedAt: (row.qualified_at as string | null) ?? null,
      qualificationSource: (row.qualification_source as string | null) ?? null,
      rewardUnlocked: row.reward_unlocked === true,
    };
  } catch (err) {
    if (__DEV__) {
      console.warn('[Referral] qualify threw', err);
    }
    return null;
  }
}

/** Fire-and-forget after a successful check-in/workout completion. Never throws. */
export function scheduleReferralQualifyAfterActivity(
  userId: string,
  source: 'check_in' | 'workout' = 'check_in',
): void {
  // Launch surface: skip client qualify fallback while Invite 5 Friends is hidden.
  // Server check-in trigger may still run independently; UI remains gated.
  if (!isInviteFiveFriendsSurfaceEnabled()) {
    return;
  }
  void tryQualifyMyReferral(userId, source);
}
