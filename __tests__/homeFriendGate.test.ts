import {resolveHomeFriendGate} from '@/utils/homeFriendGate';

const userId = 'user-a';

describe('resolveHomeFriendGate', () => {
  it('stays loading until this user has a successful friend load', () => {
    expect(
      resolveHomeFriendGate({
        userId,
        lastLoadedUserId: null,
        loading: true,
        loadError: false,
        friendCount: 0,
      }),
    ).toBe('loading');
    expect(
      resolveHomeFriendGate({
        userId,
        lastLoadedUserId: 'someone-else',
        loading: true,
        loadError: false,
        friendCount: 3,
      }),
    ).toBe('loading');
  });

  it('shows an error only when the first load failed', () => {
    expect(
      resolveHomeFriendGate({
        userId,
        lastLoadedUserId: null,
        loading: false,
        loadError: true,
        friendCount: 0,
      }),
    ).toBe('error');
  });

  it('shows the welcome path only for a confirmed empty list', () => {
    expect(
      resolveHomeFriendGate({
        userId,
        lastLoadedUserId: userId,
        loading: false,
        loadError: false,
        friendCount: 0,
      }),
    ).toBe('empty');
  });

  it('hides the welcome path when the user already has friends', () => {
    expect(
      resolveHomeFriendGate({
        userId,
        lastLoadedUserId: userId,
        loading: true,
        loadError: false,
        friendCount: 2,
      }),
    ).toBe('hasFriends');
  });
});
