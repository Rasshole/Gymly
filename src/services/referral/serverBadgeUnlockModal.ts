/**
 * One-time per-device celebration for server-awarded badges (e.g. referral_founder_5).
 *
 * - Consumed only after BadgeUnlockModal has actually displayed (Modal onShow).
 * - Does not write user_badges / referral_rewards — DB remains authoritative.
 * - Reinstall / cleared storage / other devices may show the celebration again;
 *   the server badge and entitlement are unchanged.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {BADGE_BY_ID} from '@/config/badgeDefinitions';
import {REFERRAL_FOUNDER_BADGE_ID} from '@/services/referral/referralCodeUtils';
import {useBadgeStore} from '@/store/badgeStore';

const modalShownKey = (badgeId: string) =>
  `@gymly/badge_unlock_modal_shown:${badgeId}`;

/** In-memory: queued or displaying — prevents duplicate enqueue from realtime + hydrate races. */
const queuedOrDisplaying = new Set<string>();

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
  queuedOrDisplaying.delete(badgeId);
}

/** Test helper */
export function resetServerBadgeUnlockEnqueueState(): void {
  queuedOrDisplaying.clear();
}

export function isServerBadgeUnlockQueuedOrDisplaying(badgeId: string): boolean {
  return queuedOrDisplaying.has(badgeId);
}

/**
 * Queue BadgeUnlockModal for a server-awarded badge.
 * Does NOT mark celebration consumed — that happens in markServerBadgeUnlockModalDisplayed.
 */
export async function enqueueServerAwardedBadgeUnlockOnce(
  badgeId: string,
): Promise<boolean> {
  const def = BADGE_BY_ID[badgeId];
  if (!def || def.requirement_type !== 'manual_server') {
    return false;
  }
  if (await hasShownServerBadgeUnlockModal(badgeId)) {
    return false;
  }
  if (queuedOrDisplaying.has(badgeId)) {
    return false;
  }

  const alreadyQueued = useBadgeStore
    .getState()
    .unlockModalQueue.some(b => b.id === badgeId);
  if (alreadyQueued) {
    queuedOrDisplaying.add(badgeId);
    return false;
  }

  queuedOrDisplaying.add(badgeId);

  useBadgeStore.setState(state => {
    if (state.unlockModalQueue.some(b => b.id === badgeId)) {
      return state;
    }
    return {
      unlockModalQueue: [...state.unlockModalQueue, def],
    };
  });

  const queued = useBadgeStore
    .getState()
    .unlockModalQueue.some(b => b.id === badgeId);
  if (!queued) {
    queuedOrDisplaying.delete(badgeId);
    return false;
  }
  return true;
}

/**
 * Call from Modal onShow once the celebration is actually on screen.
 * This is the only place celebration is marked consumed.
 */
export async function markServerBadgeUnlockModalDisplayed(
  badgeId: string,
): Promise<void> {
  await markServerBadgeUnlockModalShown(badgeId);
  queuedOrDisplaying.delete(badgeId);
}

/**
 * If the modal is dismissed without ever displaying, keep celebration pending.
 */
export async function onServerBadgeUnlockModalDismissed(
  badgeId: string,
): Promise<void> {
  if (await hasShownServerBadgeUnlockModal(badgeId)) {
    queuedOrDisplaying.delete(badgeId);
    return;
  }
  queuedOrDisplaying.delete(badgeId);
}

export function enqueueFoundingCrewUnlockOnce(): Promise<boolean> {
  return enqueueServerAwardedBadgeUnlockOnce(REFERRAL_FOUNDER_BADGE_ID);
}
