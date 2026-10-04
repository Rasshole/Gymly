/**
 * Pure resolution of friend_request notification UI state from server facts.
 * Pending actions only when the request row is confirmed still pending.
 */

export type FriendRequestDbStatus = 'pending' | 'accepted' | 'declined';

export type FriendRequestUiState =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'unavailable'
  | 'unknown';

export type FriendRequestResolveInput = {
  /** Status of friend_requests.id, or null if row missing. */
  requestStatus: FriendRequestDbStatus | null;
  /** True when a friendship currently exists with the actor. */
  currentlyFriends: boolean;
  /** False when status/friendship lookup failed — must not treat as pending. */
  lookupOk: boolean;
};

/**
 * Decide UI state for one friend_request notification.
 * - Confirmed pending → pending (Accept/Decline)
 * - Request accepted → accepted (even if later unfriended deleted the row — that path is missing)
 * - Missing request + currently friends → accepted (legacy / incomplete payload)
 * - Missing request + not friends → unavailable (not proof of accept; do not revive actions)
 * - Lookup failure → unknown (never auto-pending)
 */
export function resolveFriendRequestUiState(
  input: FriendRequestResolveInput,
): FriendRequestUiState {
  if (!input.lookupOk) {
    return 'unknown';
  }
  if (input.requestStatus === 'pending') {
    return 'pending';
  }
  if (input.requestStatus === 'accepted') {
    return 'accepted';
  }
  if (input.requestStatus === 'declined') {
    return 'declined';
  }
  // Missing request row
  if (input.currentlyFriends) {
    return 'accepted';
  }
  return 'unavailable';
}

export type ExistingResolution = {
  uiState: FriendRequestUiState;
  peerName: string;
  source: 'server' | 'optimistic';
};

/**
 * Merge a fresh server resolution with an existing one so a delayed/stale
 * pending response cannot overwrite a confirmed accept/decline.
 */
export function mergeFriendRequestResolution(
  previous: ExistingResolution | undefined,
  incoming: ExistingResolution,
): ExistingResolution {
  if (!previous) {
    return incoming;
  }
  const prevTerminal =
    previous.uiState === 'accepted' || previous.uiState === 'declined';
  const incomingPendingOrUnknown =
    incoming.uiState === 'pending' || incoming.uiState === 'unknown';

  if (prevTerminal && previous.source === 'optimistic' && incomingPendingOrUnknown) {
    return previous;
  }
  if (
    prevTerminal &&
    previous.source === 'server' &&
    incoming.uiState === 'pending'
  ) {
    // Stale pending must not revive actions after a confirmed terminal server state.
    return previous;
  }
  return incoming;
}

export function shouldShowFriendRequestActions(
  uiState: FriendRequestUiState | undefined,
): boolean {
  return uiState === 'pending';
}
