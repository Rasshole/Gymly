/**
 * Invite 5 Friends — shop entitlement destination.
 * Keep URL canonical; gate the CTA until the collection is live.
 */

export const REFERRAL_REWARDS_COLLECTION_URL =
  'https://shop.gymlyapp.com/collections/referral-rewards';

/**
 * Flip to true when https://shop.gymlyapp.com/collections/referral-rewards is published.
 * While false, the invite hub must hide/disable the shop CTA (no dead links).
 */
export const REFERRAL_REWARDS_COLLECTION_LIVE = false;

export function canOpenReferralRewardsCollection(
  rewardUnlocked: boolean,
  collectionLive: boolean = REFERRAL_REWARDS_COLLECTION_LIVE,
): boolean {
  return rewardUnlocked && collectionLive;
}
