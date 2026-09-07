/**
 * Checkpoint C — client referral service + qualify fallback wiring.
 */

const mockRpc = jest.fn();

jest.mock('@/services/supabase/supabaseClient', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

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
  applyReferralCode,
  getMyReferralProgress,
  getOrCreateMyReferralCode,
  tryQualifyMyReferral,
} from '@/services/supabase/referralService';
import {
  clearPendingInviteCode,
  consumePendingInviteCode,
  getPendingInviteCode,
  savePendingInviteCode,
} from '@/services/referral/pendingInviteCode';

describe('referralService', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('maps get_or_create_my_referral_code', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        id: 'c1',
        code: 'PATRICK7X',
        is_active: true,
        url: 'https://gymlyapp.com/invite/PATRICK7X',
        created_at: '2026-09-06T00:00:00.000Z',
      },
      error: null,
    });
    const result = await getOrCreateMyReferralCode();
    expect(mockRpc).toHaveBeenCalledWith('get_or_create_my_referral_code');
    expect(result.code).toBe('PATRICK7X');
    expect(result.url).toContain('/invite/PATRICK7X');
  });

  it('normalizes before apply_referral_code', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        id: 'r1',
        status: 'attributed',
        attributed_at: '2026-09-06T00:00:00.000Z',
        referrer_id: 'ref-1',
      },
      error: null,
    });
    await applyReferralCode(' patrick-7x ');
    expect(mockRpc).toHaveBeenCalledWith('apply_referral_code', {
      p_code: 'PATRICK7X',
    });
  });

  it('maps referral progress fields', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        code: 'ABC123',
        url: 'https://gymlyapp.com/invite/ABC123',
        campaign_id: 'invite_five_founding',
        badge_id: 'referral_founder_5',
        target: 5,
        attributed_count: 2,
        qualified_count: 1,
        reward_unlocked: false,
        reward_status: null,
        discount_code: null,
        shop_discount_percent: 15,
      },
      error: null,
    });
    const progress = await getMyReferralProgress();
    expect(progress.qualifiedCount).toBe(1);
    expect(progress.badgeId).toBe('referral_founder_5');
    expect(progress.rewardUnlocked).toBe(false);
  });

  it('tryQualifyMyReferral swallows RPC errors', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: {message: 'boom'},
    });
    await expect(
      tryQualifyMyReferral('user-1', 'check_in'),
    ).resolves.toBeNull();
  });

  it('tryQualifyMyReferral returns mapped status on success', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        ok: true,
        status: 'already_qualified',
        qualified_at: '2026-09-06T01:00:00.000Z',
        qualification_source: 'workout',
        reward_unlocked: false,
      },
      error: null,
    });
    const result = await tryQualifyMyReferral('user-1', 'workout');
    expect(result?.status).toBe('already_qualified');
    expect(result?.qualificationSource).toBe('workout');
  });
});

describe('pendingInviteCode', () => {
  beforeEach(async () => {
    await clearPendingInviteCode();
  });

  it('saves normalized pending codes and consumes once', async () => {
    await savePendingInviteCode(' crew-01 ');
    expect(await getPendingInviteCode()).toBe('CREW01');
    expect(await consumePendingInviteCode()).toBe('CREW01');
    expect(await getPendingInviteCode()).toBeNull();
  });

  it('rejects short/invalid codes', async () => {
    expect(await savePendingInviteCode('ab')).toBeNull();
    expect(await getPendingInviteCode()).toBeNull();
  });
});
