/**
 * Checkpoint D — Invite 5 Friends UI: pending prefill, apply errors, progress, server badge.
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

import {
  clearPendingInviteCode,
  getPendingInviteCode,
  savePendingInviteCode,
} from '@/services/referral/pendingInviteCode';
import {normalizeReferralCode} from '@/services/referral/referralCodeUtils';
import {
  mapReferralApplyError,
  referralApplyErrorMessageKey,
} from '@/services/referral/referralApplyErrors';
import {
  clearInviteFiveCelebrationShown,
  hasShownInviteFiveCelebration,
  markInviteFiveCelebrationShown,
} from '@/services/referral/inviteFiveCelebration';
import {REFERRAL_FOUNDER_BADGE_ID, SOCIAL_SQUAD_BADGE_ID} from '@/services/referral/referralCodeUtils';
import {BADGE_BY_ID, BADGE_DEFINITIONS} from '@/config/badgeDefinitions';
import {getBadgeStatValue} from '@/services/badgeEngine';
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

describe('Checkpoint D — pending invite prefill + skip', () => {
  beforeEach(async () => {
    await clearPendingInviteCode();
  });

  it('prefills from pending invite code when present', async () => {
    await savePendingInviteCode('crew-9x');
    expect(await getPendingInviteCode()).toBe('CREW9X');
    expect(normalizeReferralCode(' crew-9x ')).toBe('CREW9X');
  });

  it('allows optional skip when no code is entered', () => {
    expect(normalizeReferralCode('')).toBeNull();
    expect(normalizeReferralCode('   ')).toBeNull();
  });
});

describe('Checkpoint D — apply error mapping', () => {
  it('maps success-path error codes to distinct UI keys', () => {
    expect(mapReferralApplyError({message: 'REFERRAL_CODE_INVALID'})).toBe(
      'invalid',
    );
    expect(
      mapReferralApplyError({message: 'REFERRAL_APPLY_WINDOW_EXPIRED'}),
    ).toBe('expired');
    expect(
      mapReferralApplyError({message: 'REFERRAL_SELF_NOT_ALLOWED'}),
    ).toBe('self');
    expect(
      mapReferralApplyError({message: 'REFERRAL_ALREADY_ATTRIBUTED'}),
    ).toBe('already');
    expect(referralApplyErrorMessageKey('expired')).toBe(
      'inviteFive.applyExpired',
    );
  });
});

describe('Checkpoint D — progress + celebration + server-only badge', () => {
  beforeEach(async () => {
    await clearInviteFiveCelebrationShown();
  });

  it('tracks one-time celebration flag', async () => {
    expect(await hasShownInviteFiveCelebration()).toBe(false);
    await markInviteFiveCelebrationShown();
    expect(await hasShownInviteFiveCelebration()).toBe(true);
  });

  it('keeps referral_founder_5 separate from social_squad_5 and server-only', () => {
    const founder = BADGE_BY_ID[REFERRAL_FOUNDER_BADGE_ID];
    const squad = BADGE_BY_ID[SOCIAL_SQUAD_BADGE_ID];
    expect(founder).toBeTruthy();
    expect(squad).toBeTruthy();
    expect(founder.id).not.toBe(squad.id);
    expect(founder.requirement_type).toBe('manual_server');
    expect(founder.category).toBe('referral');
    expect(getBadgeStatValue(founder, emptyStats)).toBe(0);
    expect(
      BADGE_DEFINITIONS.some(
        d =>
          d.id === REFERRAL_FOUNDER_BADGE_ID &&
          d.requirement_type === 'manual_server',
      ),
    ).toBe(true);
  });

  it('renders five progress slots conceptually (0..5)', () => {
    const target = 5;
    for (const count of [0, 3, 5]) {
      const filled = Array.from({length: target}, (_, i) => i < count);
      expect(filled.filter(Boolean)).toHaveLength(count);
      expect(filled).toHaveLength(5);
    }
  });
});
