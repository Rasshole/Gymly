import {supabase} from '@/services/supabase/supabaseClient';

export type CreatorTierStatus = {
  identityType: string | null;
  status: string;
  effectiveTier: string;
  tierReason: string;
  activeReferrals: number;
  baseRequired: number | null;
  proRequired: number | null;
  nextTier: string | null;
  nextTierRequired: number | null;
  tierStartsAt: string | null;
  tierExpiresAt: string | null;
  graceUntil: string | null;
  publicVisible: boolean;
  earnedValidDays: number | null;
  graceDays: number | null;
  configStatus: string | null;
};

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return null;
}

export async function fetchMyCreatorTierStatus(): Promise<CreatorTierStatus | null> {
  const {data, error} = await supabase.rpc('get_my_creator_tier_status');
  if (error || !data || typeof data !== 'object') {
    return null;
  }
  const row = data as Record<string, unknown>;
  return {
    identityType: typeof row.identity_type === 'string' ? row.identity_type : null,
    status: typeof row.status === 'string' ? row.status : 'none',
    effectiveTier: typeof row.effective_tier === 'string' ? row.effective_tier : 'free',
    tierReason: typeof row.tier_reason === 'string' ? row.tier_reason : 'free',
    activeReferrals: asNumber(row.active_referrals) ?? 0,
    baseRequired: asNumber(row.base_required),
    proRequired: asNumber(row.pro_required),
    nextTier: typeof row.next_tier === 'string' ? row.next_tier : null,
    nextTierRequired: asNumber(row.next_tier_required),
    tierStartsAt: typeof row.tier_starts_at === 'string' ? row.tier_starts_at : null,
    tierExpiresAt: typeof row.tier_expires_at === 'string' ? row.tier_expires_at : null,
    graceUntil: typeof row.grace_until === 'string' ? row.grace_until : null,
    publicVisible: row.public_visible === true,
    earnedValidDays: asNumber(row.earned_valid_days),
    graceDays: asNumber(row.grace_days),
    configStatus: typeof row.config_status === 'string' ? row.config_status : null,
  };
}
