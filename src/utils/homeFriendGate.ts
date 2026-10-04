/**
 * Home should tell loading, a failed first load, an empty friend list,
 * and a list that already has friends apart from each other.
 */
export type HomeFriendGate = 'loading' | 'error' | 'empty' | 'hasFriends';

export function resolveHomeFriendGate(input: {
  userId: string | null | undefined;
  lastLoadedUserId: string | null;
  loading: boolean;
  loadError: boolean;
  friendCount: number;
}): HomeFriendGate {
  const userId = input.userId ?? '';
  const known = userId.length > 0 && input.lastLoadedUserId === userId;
  if (!known) {
    if (input.loadError && !input.loading) {
      return 'error';
    }
    return 'loading';
  }
  if (input.friendCount > 0) {
    return 'hasFriends';
  }
  return 'empty';
}
