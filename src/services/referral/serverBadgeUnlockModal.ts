import AsyncStorage from '@react-native-async-storage/async-storage';
import {BADGE_BY_ID} from '@/config/badgeDefinitions';
import {REFERRAL_FOUNDER_BADGE_ID} from '@/services/referral/referralCodeUtils';
import {useBadgeStore} from '@/store/badgeStore';

const modalShownKey = (badgeId: string) =>
  `@gymly/badge_unlock_modal_shown:${badgeId}`;

export async function hasShownServerBadgeUnlockModal(
  badgeId: string,
): Promise<boolean> {
  const raw = await AsyncStorage.getItem(modalShownKey(badgeId));
  return raw === '1';
}

export async function markServerBadgeUnlockModalShown(
  badgeId: string,
): Promise<void> {
  await AsyncStorage.setItem(modalShownKey(badgeId), '1');
}

/** Test helper */
export async function clearServerBadgeUnlockModalShown(
  badgeId: string,
): Promise<void> {
  await AsyncStorage.removeItem(modalShownKey(badgeId));
}

/**
 * Queue BadgeUnlockModal for a server-awarded badge at most once per device.
 * Does not write user_badges — DB remains authoritative.
 */
export async function enqueueServerAwardedBadgeUnlockOnce(
  badgeId: string,
): Promise<boolean> {
  const def = BADGE_BY_ID[badgeId];
  if (!def) {
    return false;
  }
  if (await hasShownServerBadgeUnlockModal(badgeId)) {
    return false;
  }
  const queue = useBadgeStore.getState().unlockModalQueue;
  if (queue.some(b => b.id === badgeId)) {
    return false;
  }
  await markServerBadgeUnlockModalShown(badgeId);
  useBadgeStore.setState(state => ({
    unlockModalQueue: [...state.unlockModalQueue, def],
  }));
  return true;
}

/** Convenience for Founding Crew */
export function enqueueFoundingCrewUnlockOnce(): Promise<boolean> {
  return enqueueServerAwardedBadgeUnlockOnce(REFERRAL_FOUNDER_BADGE_ID);
}
