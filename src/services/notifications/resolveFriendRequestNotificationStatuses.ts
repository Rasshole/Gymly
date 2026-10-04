/**
 * Batch-resolve friend_request notification rows against friend_requests + friendships.
 */

import type {NotificationRow} from '@/services/notifications/inAppNotificationService';
import {
  fetchFriendRequestStatusesByIds,
  getMyFriendIds,
} from '@/services/supabase/friendService';
import {
  mergeFriendRequestResolution,
  resolveFriendRequestUiState,
  type ExistingResolution,
  type FriendRequestDbStatus,
  type FriendRequestUiState,
} from '@/utils/friendRequestNotificationResolve';

export type FriendRequestNotifResolution = ExistingResolution & {
  requestId?: string;
};

export type FriendRequestResolutionMap = Record<
  string,
  FriendRequestNotifResolution
>;

function asDbStatus(raw: string | undefined): FriendRequestDbStatus | null {
  if (raw === 'pending' || raw === 'accepted' || raw === 'declined') {
    return raw;
  }
  return null;
}

function extractFrTargets(rows: NotificationRow[]): Array<{
  notifId: string;
  requestId?: string;
  actorId?: string;
  peerName: string;
}> {
  const out: Array<{
    notifId: string;
    requestId?: string;
    actorId?: string;
    peerName: string;
  }> = [];
  for (const row of rows) {
    if (row.type !== 'friend_request') {
      continue;
    }
    const data = row.data ?? {};
    const requestId =
      typeof data.friendRequestId === 'string' && data.friendRequestId.trim()
        ? data.friendRequestId.trim()
        : undefined;
    const peerName =
      (typeof data.friendName === 'string' && data.friendName.trim()) ||
      (typeof data.actorName === 'string' && data.actorName.trim()) ||
      (typeof data.displayName === 'string' && data.displayName.trim()) ||
      '';
    out.push({
      notifId: row.id,
      requestId,
      actorId: row.actor_user_id || undefined,
      peerName,
    });
  }
  return out;
}

/**
 * One batch pass for all friend_request notifications in the loaded list.
 * On network/query failure returns lookupOk=false resolutions (unknown).
 */
export async function resolveFriendRequestNotifications(params: {
  userId: string;
  rows: NotificationRow[];
  previous?: FriendRequestResolutionMap;
}): Promise<FriendRequestResolutionMap> {
  const targets = extractFrTargets(params.rows);
  if (targets.length === 0) {
    return {};
  }

  const requestIds = targets
    .map(t => t.requestId)
    .filter((id): id is string => !!id);
  const actorIds = [
    ...new Set(targets.map(t => t.actorId).filter((id): id is string => !!id)),
  ];

  let lookupOk = true;
  let statusById = new Map<
    string,
    {id: string; status: string; fromUserId: string; toUserId: string}
  >();
  let friendIds = new Set<string>();

  try {
    const [statuses, friends] = await Promise.all([
      fetchFriendRequestStatusesByIds(requestIds),
      actorIds.length > 0
        ? getMyFriendIds(params.userId)
        : Promise.resolve(new Set<string>()),
    ]);
    statusById = statuses;
    friendIds = friends;
  } catch {
    lookupOk = false;
  }

  const next: FriendRequestResolutionMap = {};
  for (const t of targets) {
    const row = t.requestId ? statusById.get(t.requestId) : undefined;
    const requestStatus = lookupOk
      ? t.requestId
        ? row
          ? asDbStatus(row.status)
          : null
        : null
      : null;
    const currentlyFriends = !!(t.actorId && friendIds.has(t.actorId));
    const uiState: FriendRequestUiState = resolveFriendRequestUiState({
      requestStatus,
      currentlyFriends,
      lookupOk,
    });
    const incoming: FriendRequestNotifResolution = {
      uiState,
      peerName: t.peerName,
      source: 'server',
      requestId: t.requestId,
    };
    next[t.notifId] = mergeFriendRequestResolution(
      params.previous?.[t.notifId],
      incoming,
    );
  }
  return next;
}

/** Apply optimistic accept/decline for matching notification ids / request ids. */
export function applyOptimisticFriendRequestResolution(
  previous: FriendRequestResolutionMap,
  rows: NotificationRow[],
  opts: {
    notifId?: string;
    requestId?: string;
    outcome: 'accepted' | 'declined';
    peerName: string;
  },
): FriendRequestResolutionMap {
  const next = {...previous};
  for (const row of rows) {
    if (row.type !== 'friend_request') {
      continue;
    }
    const data = row.data ?? {};
    const rid =
      typeof data.friendRequestId === 'string' ? data.friendRequestId : undefined;
    const matchNotif = opts.notifId && row.id === opts.notifId;
    const matchReq = opts.requestId && rid === opts.requestId;
    if (!matchNotif && !matchReq) {
      continue;
    }
    next[row.id] = {
      uiState: opts.outcome,
      peerName: opts.peerName,
      source: 'optimistic',
      requestId: rid,
    };
  }
  return next;
}
