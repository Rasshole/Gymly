/**
 * Invite 5 Friends — Founding Crew + shop entitlement view-model helpers.
 * Server (referral_rewards / user_badges) remains authoritative.
 */

import {
  REFERRAL_REWARDS_COLLECTION_LIVE,
  REFERRAL_REWARDS_COLLECTION_URL,
  canOpenReferralRewardsCollection,
} from '@/config/referralRewardsConfig';
import {
  REFERRAL_FOUNDER_BADGE_ID,
  REFERRAL_QUALIFIED_TARGET,
  SOCIAL_SQUAD_BADGE_ID,
} from '@/services/referral/referralCodeUtils';
import type {ReferralProgress} from '@/services/supabase/referralService';

export type ReferralRewardUiState = {
  founderBadgeId: string;
  socialSquadBadgeId: string;
  qualifiedCount: number;
  target: number;
  progressSlots: boolean[];
  founderUnlocked: boolean;
  shopEntitlementUnlocked: boolean;
  shopRewardTitleKey: 'inviteFive.shopRewardTitle';
  shopCollectionUrl: string;
  shopCtaEnabled: boolean;
  shopCtaMode: 'hidden' | 'disabled' | 'enabled';
  discountCode: string | null;
};

export function buildReferralProgressSlots(
  qualifiedCount: number,
  target: number = REFERRAL_QUALIFIED_TARGET,
): boolean[] {
  const safeTarget = Math.max(1, target);
  const filled = Math.max(0, Math.min(safeTarget, qualifiedCount));
  return Array.from({length: safeTarget}, (_, i) => i < filled);
}

export function resolveFounderUnlocked(params: {
  progress: Pick<ReferralProgress, 'rewardUnlocked' | 'qualifiedCount'> | null;
  localBadgeUnlocked: boolean;
}): boolean {
  if (params.localBadgeUnlocked) {
    return true;
  }
  if (!params.progress) {
    return false;
  }
  if (params.progress.rewardUnlocked) {
    return true;
  }
  return params.progress.qualifiedCount >= REFERRAL_QUALIFIED_TARGET;
}

/**
 * Shop CTA rules:
 * - Locked reward → hidden (no dead tease link)
 * - Unlocked + collection not live → disabled / coming soon
 * - Unlocked + live → enabled
 */
export function resolveShopCtaMode(params: {
  founderUnlocked: boolean;
  collectionLive?: boolean;
}): 'hidden' | 'disabled' | 'enabled' {
  if (!params.founderUnlocked) {
    return 'hidden';
  }
  const live = params.collectionLive ?? REFERRAL_REWARDS_COLLECTION_LIVE;
  return canOpenReferralRewardsCollection(true, live) ? 'enabled' : 'disabled';
}

export function buildReferralRewardUiState(params: {
  progress: ReferralProgress | null;
  localBadgeUnlocked: boolean;
  collectionLive?: boolean;
}): ReferralRewardUiState {
  const founderUnlocked = resolveFounderUnlocked({
    progress: params.progress,
    localBadgeUnlocked: params.localBadgeUnlocked,
  });
  const qualifiedCount = params.progress?.qualifiedCount ?? 0;
  const target = params.progress?.target ?? REFERRAL_QUALIFIED_TARGET;
  const shopCtaMode = resolveShopCtaMode({
    founderUnlocked,
    collectionLive: params.collectionLive,
  });

  return {
    founderBadgeId: REFERRAL_FOUNDER_BADGE_ID,
    socialSquadBadgeId: SOCIAL_SQUAD_BADGE_ID,
    qualifiedCount,
    target,
    progressSlots: buildReferralProgressSlots(qualifiedCount, target),
    founderUnlocked,
    shopEntitlementUnlocked: founderUnlocked,
    shopRewardTitleKey: 'inviteFive.shopRewardTitle',
    shopCollectionUrl: REFERRAL_REWARDS_COLLECTION_URL,
    shopCtaEnabled: shopCtaMode === 'enabled',
    shopCtaMode,
    discountCode: params.progress?.discountCode ?? null,
  };
}
