import {supabase} from '@/services/supabase/supabaseClient';

export type CreatorWorkspaceGroup = {
  groupId: string;
  name: string;
  adminAccess: boolean;
  togetherSessions: number | null;
  recentSessions: Array<{startedAt: string | null; endedAt: string | null}>;
};

export type CreatorLinkableGroup = {
  groupId: string;
  name: string;
};

export type CreatorWorkspaceFeatures = {
  profile: boolean;
  referralCode: boolean;
  groupSessions: boolean;
  referralCounts: boolean;
  linkOfficialGroup: boolean;
  addAdministrator: boolean;
  maxOfficialGroups: number;
  maxGroupAdmins: number;
  configStatus: string | null;
};

export type CreatorWorkspace = {
  status: string;
  identityType: string | null;
  effectiveTier: string;
  tierReason: string;
  publicVisible: boolean;
  description: string;
  contactUrl: string;
  referralCode: string | null;
  referralUrl: string | null;
  activeReferrals: number | null;
  nextTier: string | null;
  nextTierRequired: number | null;
  officialGroups: CreatorWorkspaceGroup[];
  linkableGroups: CreatorLinkableGroup[];
  features: CreatorWorkspaceFeatures;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function mapGroup(value: unknown): CreatorWorkspaceGroup | null {
  const row = asRecord(value);
  if (!row || typeof row.group_id !== 'string') {
    return null;
  }
  const recent = Array.isArray(row.recent_sessions) ? row.recent_sessions : [];
  return {
    groupId: row.group_id,
    name: typeof row.name === 'string' ? row.name : 'Gruppe',
    adminAccess: asBoolean(row.admin_access),
    togetherSessions: asNumber(row.together_sessions),
    recentSessions: recent
      .map(item => {
        const session = asRecord(item);
        if (!session) {
          return null;
        }
        return {
          startedAt: typeof session.started_at === 'string' ? session.started_at : null,
          endedAt: typeof session.ended_at === 'string' ? session.ended_at : null,
        };
      })
      .filter((item): item is {startedAt: string | null; endedAt: string | null} => item != null),
  };
}

function mapWorkspace(data: unknown): CreatorWorkspace | null {
  const row = asRecord(data);
  if (!row) {
    return null;
  }
  const features = asRecord(row.features) ?? {};
  const groups = Array.isArray(row.official_groups) ? row.official_groups : [];
  const linkable = Array.isArray(row.linkable_groups) ? row.linkable_groups : [];
  return {
    status: typeof row.status === 'string' ? row.status : 'none',
    identityType: typeof row.identity_type === 'string' ? row.identity_type : null,
    effectiveTier: typeof row.effective_tier === 'string' ? row.effective_tier : 'free',
    tierReason: typeof row.tier_reason === 'string' ? row.tier_reason : 'free',
    publicVisible: asBoolean(row.public_visible),
    description: typeof row.description === 'string' ? row.description : '',
    contactUrl: typeof row.contact_url === 'string' ? row.contact_url : '',
    referralCode: typeof row.referral_code === 'string' ? row.referral_code : null,
    referralUrl: typeof row.referral_url === 'string' ? row.referral_url : null,
    activeReferrals: asNumber(row.active_referrals),
    nextTier: typeof row.next_tier === 'string' ? row.next_tier : null,
    nextTierRequired: asNumber(row.next_tier_required),
    officialGroups: groups.map(mapGroup).filter((item): item is CreatorWorkspaceGroup => item != null),
    linkableGroups: linkable
      .map(item => {
        const group = asRecord(item);
        if (!group || typeof group.group_id !== 'string') {
          return null;
        }
        return {
          groupId: group.group_id,
          name: typeof group.name === 'string' ? group.name : 'Gruppe',
        };
      })
      .filter((item): item is CreatorLinkableGroup => item != null),
    features: {
      profile: asBoolean(features.profile),
      referralCode: asBoolean(features.referral_code),
      groupSessions: asBoolean(features.group_sessions),
      referralCounts: asBoolean(features.referral_counts),
      linkOfficialGroup: asBoolean(features.link_official_group),
      addAdministrator: asBoolean(features.add_administrator),
      maxOfficialGroups: asNumber(features.max_official_groups) ?? 0,
      maxGroupAdmins: asNumber(features.max_group_admins) ?? 0,
      configStatus: typeof features.config_status === 'string' ? features.config_status : null,
    },
  };
}

async function readWorkspace(call: PromiseLike<{data: unknown; error: {message: string} | null}>) {
  const {data, error} = await call;
  if (error) {
    throw new Error(error.message);
  }
  const workspace = mapWorkspace(data);
  if (!workspace) {
    throw new Error('CREATOR_WORKSPACE_EMPTY');
  }
  return workspace;
}

export function fetchMyCreatorWorkspace(): Promise<CreatorWorkspace> {
  return readWorkspace(supabase.rpc('get_my_creator_workspace'));
}

export function saveMyCreatorProfile(description: string, contactUrl: string): Promise<CreatorWorkspace> {
  return readWorkspace(
    supabase.rpc('save_my_creator_profile', {
      p_description: description,
      p_contact_url: contactUrl,
    }),
  );
}

export function linkMyOfficialGroup(groupId: string): Promise<CreatorWorkspace> {
  return readWorkspace(supabase.rpc('link_my_official_group', {p_group_id: groupId}));
}

export function unlinkMyOfficialGroup(groupId: string): Promise<CreatorWorkspace> {
  return readWorkspace(supabase.rpc('unlink_my_official_group', {p_group_id: groupId}));
}
