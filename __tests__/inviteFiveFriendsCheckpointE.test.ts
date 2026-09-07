/**
 * Checkpoint E — Founding Crew entitlement + one-time badge modal + shop CTA gates.
 */

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => store.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: jest.fn(async (key: string) => {
        store.delete(key);
      }),
      clear: jest.fn(async () => {
        store.clear();
      }),
      __store: store,
    },
  };
});

jest.mock('@/store/badgeStore', () => {
  const state = {
    unlockModalQueue: [] as Array<{id: string; requirement_type?: string}>,
  };
  const setState = (
    partial:
      | Partial<typeof state>
      | ((s: typeof state) => Partial<typeof state>),
  ) => {
    const next = typeof partial === 'function' ? partial(state) : partial;
    Object.assign(state, next);
  };
  return {
    useBadgeStore: Object.assign(
      (selector?: (s: typeof state) => unknown) =>
        typeof selector === 'function' ? selector(state) : state,
      {
        getState: () => state,
        setState,
      },
    ),
  };
});

import {BADGE_BY_ID} from '@/config/badgeDefinitions';
import {
  REFERRAL_REWARDS_COLLECTION_LIVE,
  REFERRAL_REWARDS_COLLECTION_URL,
  canOpenReferralRewardsCollection,
} from '@/config/referralRewardsConfig';
import {getBadgeStatValue} from '@/services/badgeEngine';
import {
  buildReferralProgressSlots,
  buildReferralRewardUiState,
  resolveFounderUnlocked,
  resolveShopCtaMode,
} from '@/services/referral/referralEntitlement';
import {
  REFERRAL_FOUNDER_BADGE_ID,
  SOCIAL_SQUAD_BADGE_ID,
} from '@/services/referral/referralCodeUtils';
import {
  clearServerBadgeUnlockModalShown,
  enqueueServerAwardedBadgeUnlockOnce,
  hasShownServerBadgeUnlockModal,
  isServerBadgeUnlockQueuedOrDisplaying,
  markServerBadgeUnlockModalDisplayed,
  onServerBadgeUnlockModalDismissed,
  resetServerBadgeUnlockEnqueueState,
} from '@/services/referral/serverBadgeUnlockModal';
import {useBadgeStore} from '@/store/badgeStore';
import type {UserBadgeStats} from '@/types/badge.types';

const emptyStats: UserBadgeStats = {
  total_training_time_minutes: 0,
  total_sessions: 0,
  current_streak_days: 0,
  longest_streak_days: 0,
  longest_session_minutes: 0,
  total_check_ins: 0,
  friends_trained_with_count: 99,
  unique_gyms_count: 0,
  total_messages_sent: 0,
  unique_dm_recipients: 0,
  planned_workouts_created: 0,
  planned_workouts_completed_valid: 0,
  early_check_ins: 0,
  late_check_ins: 0,
  total_logged_sets: 0,
  total_pr_events: 0,
};

function progress(partial: {
  qualifiedCount?: number;
  rewardUnlocked?: boolean;
  discountCode?: string | null;
}) {
  return {
    code: 'CREW01',
    url: 'https://gymlyapp.com/invite/CREW01',
    campaignId: 'invite_five_founding',
    badgeId: REFERRAL_FOUNDER_BADGE_ID,
    target: 5,
    attributedCount: partial.qualifiedCount ?? 0,
    qualifiedCount: partial.qualifiedCount ?? 0,
    rewardUnlocked: partial.rewardUnlocked ?? false,
    rewardStatus: partial.rewardUnlocked ? 'unlocked' : null,
    discountCode: partial.discountCode ?? null,
    shopDiscountPercent: 15,
  };
}

describe('Checkpoint E — locked/unlocked Founding Crew state', () => {
  it('stays locked below five and without local badge', () => {
    expect(
      resolveFounderUnlocked({
        progress: progress({qualifiedCount: 3}),
        localBadgeUnlocked: false,
      }),
    ).toBe(false);
  });

  it('unlocks from server reward flag, local badge, or five qualified', () => {
    expect(
      resolveFounderUnlocked({
        progress: progress({rewardUnlocked: true}),
        localBadgeUnlocked: false,
      }),
    ).toBe(true);
    expect(
      resolveFounderUnlocked({
        progress: progress({qualifiedCount: 2}),
        localBadgeUnlocked: true,
      }),
    ).toBe(true);
    expect(
      resolveFounderUnlocked({
        progress: progress({qualifiedCount: 5}),
        localBadgeUnlocked: false,
      }),
    ).toBe(true);
  });

  it('keeps referral_founder_5 server-only and separate from social_squad_5', () => {
    const founder = BADGE_BY_ID[REFERRAL_FOUNDER_BADGE_ID];
    expect(founder.requirement_type).toBe('manual_server');
    expect(founder.id).not.toBe(SOCIAL_SQUAD_BADGE_ID);
    expect(getBadgeStatValue(founder, emptyStats)).toBe(0);
  });
});

describe('Checkpoint E — shop CTA gating', () => {
  it('keeps collection live flag false and destination locked', () => {
    expect(REFERRAL_REWARDS_COLLECTION_LIVE).toBe(false);
    expect(REFERRAL_REWARDS_COLLECTION_URL).toBe(
      'https://shop.gymlyapp.com/collections/referral-rewards',
    );
    expect(canOpenReferralRewardsCollection(true, REFERRAL_REWARDS_COLLECTION_LIVE)).toBe(
      false,
    );
  });

  it('hides CTA while locked; disables when unlocked but collection not live', () => {
    expect(resolveShopCtaMode({founderUnlocked: false, collectionLive: true})).toBe(
      'hidden',
    );
    expect(
      resolveShopCtaMode({founderUnlocked: true, collectionLive: false}),
    ).toBe('disabled');
  });

  it('enables CTA only when unlocked and collection is live', () => {
    expect(resolveShopCtaMode({founderUnlocked: true, collectionLive: true})).toBe(
      'enabled',
    );
  });

  it('builds UI state with five progress slots and disabled shop CTA by default', () => {
    const ui = buildReferralRewardUiState({
      progress: progress({qualifiedCount: 3, rewardUnlocked: true}),
      localBadgeUnlocked: true,
      collectionLive: REFERRAL_REWARDS_COLLECTION_LIVE,
    });
    expect(ui.progressSlots).toEqual([true, true, true, false, false]);
    expect(ui.founderUnlocked).toBe(true);
    expect(ui.shopCtaMode).toBe('disabled');
    expect(ui.shopCtaEnabled).toBe(false);
    expect(buildReferralProgressSlots(0)).toHaveLength(5);
  });
});

describe('Checkpoint E — one-time BadgeUnlockModal (consume after display)', () => {
  beforeEach(async () => {
    useBadgeStore.setState({unlockModalQueue: []});
    resetServerBadgeUnlockEnqueueState();
    await clearServerBadgeUnlockModalShown(REFERRAL_FOUNDER_BADGE_ID);
  });

  it('enqueues without consuming; only display marks celebration consumed', async () => {
    const first = await enqueueServerAwardedBadgeUnlockOnce(
      REFERRAL_FOUNDER_BADGE_ID,
    );
    expect(first).toBe(true);
    expect(await hasShownServerBadgeUnlockModal(REFERRAL_FOUNDER_BADGE_ID)).toBe(
      false,
    );
    expect(isServerBadgeUnlockQueuedOrDisplaying(REFERRAL_FOUNDER_BADGE_ID)).toBe(
      true,
    );
    expect(useBadgeStore.getState().unlockModalQueue).toHaveLength(1);

    await markServerBadgeUnlockModalDisplayed(REFERRAL_FOUNDER_BADGE_ID);
    expect(await hasShownServerBadgeUnlockModal(REFERRAL_FOUNDER_BADGE_ID)).toBe(
      true,
    );
  });

  it('blocks duplicate enqueue from repeated hydrate/realtime while queued', async () => {
    expect(
      await enqueueServerAwardedBadgeUnlockOnce(REFERRAL_FOUNDER_BADGE_ID),
    ).toBe(true);
    expect(
      await enqueueServerAwardedBadgeUnlockOnce(REFERRAL_FOUNDER_BADGE_ID),
    ).toBe(false);
    expect(
      await enqueueServerAwardedBadgeUnlockOnce(REFERRAL_FOUNDER_BADGE_ID),
    ).toBe(false);
    expect(useBadgeStore.getState().unlockModalQueue).toHaveLength(1);
  });

  it('keeps celebration pending if dismissed before display', async () => {
    await enqueueServerAwardedBadgeUnlockOnce(REFERRAL_FOUNDER_BADGE_ID);
    useBadgeStore.setState({unlockModalQueue: []});
    await onServerBadgeUnlockModalDismissed(REFERRAL_FOUNDER_BADGE_ID);

    expect(await hasShownServerBadgeUnlockModal(REFERRAL_FOUNDER_BADGE_ID)).toBe(
      false,
    );
    expect(
      await enqueueServerAwardedBadgeUnlockOnce(REFERRAL_FOUNDER_BADGE_ID),
    ).toBe(true);
  });

  it('never re-enqueues after a successful display on this device', async () => {
    await enqueueServerAwardedBadgeUnlockOnce(REFERRAL_FOUNDER_BADGE_ID);
    await markServerBadgeUnlockModalDisplayed(REFERRAL_FOUNDER_BADGE_ID);
    useBadgeStore.setState({unlockModalQueue: []});
    expect(
      await enqueueServerAwardedBadgeUnlockOnce(REFERRAL_FOUNDER_BADGE_ID),
    ).toBe(false);
  });

  it('does not enqueue non-manual_server badges via server celebration helper', async () => {
    expect(await enqueueServerAwardedBadgeUnlockOnce(SOCIAL_SQUAD_BADGE_ID)).toBe(
      false,
    );
  });

  it('re-enqueues after process restart if celebration was never displayed', async () => {
    await enqueueServerAwardedBadgeUnlockOnce(REFERRAL_FOUNDER_BADGE_ID);
    useBadgeStore.setState({unlockModalQueue: []});
    // Simulate app kill: in-memory queue lock is gone; AsyncStorage not marked.
    resetServerBadgeUnlockEnqueueState();
    expect(await hasShownServerBadgeUnlockModal(REFERRAL_FOUNDER_BADGE_ID)).toBe(
      false,
    );
    expect(
      await enqueueServerAwardedBadgeUnlockOnce(REFERRAL_FOUNDER_BADGE_ID),
    ).toBe(true);
    expect(useBadgeStore.getState().unlockModalQueue).toHaveLength(1);
  });

  it('does not touch server badge/entitlement when celebration storage is cleared', async () => {
    await markServerBadgeUnlockModalDisplayed(REFERRAL_FOUNDER_BADGE_ID);
    await clearServerBadgeUnlockModalShown(REFERRAL_FOUNDER_BADGE_ID);
    // Local celebration flag cleared (reinstall / clear storage) — badge id &
    // entitlement remain server-owned; only the modal may show again.
    expect(BADGE_BY_ID[REFERRAL_FOUNDER_BADGE_ID].requirement_type).toBe(
      'manual_server',
    );
    expect(
      await enqueueServerAwardedBadgeUnlockOnce(REFERRAL_FOUNDER_BADGE_ID),
    ).toBe(true);
  });
});
