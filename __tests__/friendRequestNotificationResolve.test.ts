import {
  mergeFriendRequestResolution,
  resolveFriendRequestUiState,
  shouldShowFriendRequestActions,
} from '../src/utils/friendRequestNotificationResolve';
import {localizedFriendRequestCopy} from '../src/utils/notificationCopy';
import type {Notification} from '../src/types/notification.types';

jest.mock('@/i18n', () => ({
  badgeDisplayName: (_t: unknown, def: {name: string}) => def.name,
}));

jest.mock('@/config/badgeDefinitions', () => ({
  BADGE_BY_ID: {},
}));

const tEn = (key: string, params?: Record<string, string>) => {
  const map: Record<string, string> = {
    'notifications.aFriend': 'A friend',
    'notifications.friendRequestPendingTitle': 'New friend request',
    'notifications.friendRequestPendingBody': `${params?.name} wants to be friends on Gymly`,
    'notifications.friendRequestAcceptedTitle': `You are now friends with ${params?.name}`,
    'notifications.friendRequestAcceptedStatus': 'Accepted',
    'notifications.friendRequestDeclinedTitle': 'Friend request',
    'notifications.friendRequestDeclinedBody': `You declined the friend request from ${params?.name}.`,
    'notifications.friendRequestDeclinedStatus': 'Declined',
    'notifications.friendRequestUnavailableTitle': 'Friend request',
    'notifications.friendRequestUnavailableBody':
      'This request is no longer available.',
  };
  return map[key] ?? key;
};

const tDa = (key: string, params?: Record<string, string>) => {
  const map: Record<string, string> = {
    'notifications.aFriend': 'En ven',
    'notifications.friendRequestPendingTitle': 'Ny venneanmodning',
    'notifications.friendRequestPendingBody': `${params?.name} vil være venner på Gymly`,
    'notifications.friendRequestAcceptedTitle': `Du er nu venner med ${params?.name}`,
    'notifications.friendRequestAcceptedStatus': 'Accepteret',
    'notifications.friendRequestDeclinedTitle': 'Venneanmodning',
    'notifications.friendRequestDeclinedBody': `Du har afvist venneanmodningen fra ${params?.name}.`,
    'notifications.friendRequestDeclinedStatus': 'Afvist',
    'notifications.friendRequestUnavailableTitle': 'Venneanmodning',
    'notifications.friendRequestUnavailableBody':
      'Denne anmodning er ikke længere tilgængelig.',
  };
  return map[key] ?? key;
};

describe('resolveFriendRequestUiState', () => {
  it('shows pending only for confirmed pending request', () => {
    expect(
      resolveFriendRequestUiState({
        requestStatus: 'pending',
        currentlyFriends: false,
        lookupOk: true,
      }),
    ).toBe('pending');
    expect(shouldShowFriendRequestActions('pending')).toBe(true);
  });

  it('keeps accepted after accept (server status)', () => {
    expect(
      resolveFriendRequestUiState({
        requestStatus: 'accepted',
        currentlyFriends: true,
        lookupOk: true,
      }),
    ).toBe('accepted');
    expect(shouldShowFriendRequestActions('accepted')).toBe(false);
  });

  it('treats old pending payload + existing friendship as accepted', () => {
    expect(
      resolveFriendRequestUiState({
        requestStatus: null,
        currentlyFriends: true,
        lookupOk: true,
      }),
    ).toBe('accepted');
  });

  it('does not treat missing request as pending after unfriend', () => {
    expect(
      resolveFriendRequestUiState({
        requestStatus: null,
        currentlyFriends: false,
        lookupOk: true,
      }),
    ).toBe('unavailable');
    expect(shouldShowFriendRequestActions('unavailable')).toBe(false);
  });

  it('does not auto-pending on lookup failure', () => {
    expect(
      resolveFriendRequestUiState({
        requestStatus: null,
        currentlyFriends: false,
        lookupOk: false,
      }),
    ).toBe('unknown');
    expect(shouldShowFriendRequestActions('unknown')).toBe(false);
  });

  it('declined stays declined', () => {
    expect(
      resolveFriendRequestUiState({
        requestStatus: 'declined',
        currentlyFriends: false,
        lookupOk: true,
      }),
    ).toBe('declined');
  });
});

describe('mergeFriendRequestResolution', () => {
  it('does not let delayed pending overwrite confirmed accept', () => {
    const merged = mergeFriendRequestResolution(
      {uiState: 'accepted', peerName: 'Mubarek', source: 'optimistic'},
      {uiState: 'pending', peerName: 'Mubarek', source: 'server'},
    );
    expect(merged.uiState).toBe('accepted');
  });

  it('does not revive pending over prior server accepted', () => {
    const merged = mergeFriendRequestResolution(
      {uiState: 'accepted', peerName: 'Mubarek', source: 'server'},
      {uiState: 'pending', peerName: 'Mubarek', source: 'server'},
    );
    expect(merged.uiState).toBe('accepted');
  });

  it('allows server accepted to replace optimistic accepted', () => {
    const merged = mergeFriendRequestResolution(
      {uiState: 'accepted', peerName: 'Mubarek', source: 'optimistic'},
      {uiState: 'accepted', peerName: 'Mubarek', source: 'server'},
    );
    expect(merged.source).toBe('server');
    expect(merged.uiState).toBe('accepted');
  });

  it('new pending request is independent (no previous)', () => {
    const merged = mergeFriendRequestResolution(undefined, {
      uiState: 'pending',
      peerName: 'Mubarek',
      source: 'server',
    });
    expect(merged.uiState).toBe('pending');
  });
});

describe('localizedFriendRequestCopy', () => {
  const base = {
    id: 'n1',
    type: 'friend_request' as const,
    title: 'Ny venneanmodning',
    message: 'Mubarek Guleed vil være venner på Gymly',
    timestamp: new Date(),
    read: false,
    friendName: 'Mubarek Guleed',
  };

  it('localizes pending in English without Danish leftovers', () => {
    const copy = localizedFriendRequestCopy(
      {...base, friendRequestUiState: 'pending'} as Notification,
      tEn as any,
    );
    expect(copy.title).toBe('New friend request');
    expect(copy.message).toContain('Mubarek Guleed');
    expect(copy.title).not.toContain('Ny');
    expect(copy.message).not.toContain('vil være');
  });

  it('localizes accepted in Danish and English', () => {
    const item = {
      ...base,
      friendRequestUiState: 'accepted',
    } as Notification;
    expect(localizedFriendRequestCopy(item, tEn as any).title).toBe(
      'You are now friends with Mubarek Guleed',
    );
    expect(localizedFriendRequestCopy(item, tDa as any).title).toBe(
      'Du er nu venner med Mubarek Guleed',
    );
    expect(localizedFriendRequestCopy(item, tEn as any).statusLabel).toBe(
      'Accepted',
    );
    expect(localizedFriendRequestCopy(item, tDa as any).statusLabel).toBe(
      'Accepteret',
    );
  });
});

/**
 * Simulates: accept → wipe local resolutions → reload from server facts.
 */
describe('accept then cold reload', () => {
  it('still Accepted when server request status is accepted', () => {
    const afterColdReload = resolveFriendRequestUiState({
      requestStatus: 'accepted',
      currentlyFriends: true,
      lookupOk: true,
    });
    expect(afterColdReload).toBe('accepted');
    expect(shouldShowFriendRequestActions(afterColdReload)).toBe(false);
  });

  it('Friends-accept path: friendship exists → Accepted in Notifications', () => {
    const fromFriendsScreen = resolveFriendRequestUiState({
      requestStatus: 'accepted',
      currentlyFriends: true,
      lookupOk: true,
    });
    expect(fromFriendsScreen).toBe('accepted');
  });

  it('new request id from same person can be pending again', () => {
    const oldAccepted = resolveFriendRequestUiState({
      requestStatus: 'accepted',
      currentlyFriends: false,
      lookupOk: true,
    });
    const newPending = resolveFriendRequestUiState({
      requestStatus: 'pending',
      currentlyFriends: false,
      lookupOk: true,
    });
    expect(oldAccepted).toBe('accepted');
    expect(newPending).toBe('pending');
  });
});
