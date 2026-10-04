import {
  resolveFeedAuthorProfileTarget,
  shouldShowFeedMessageAction,
} from '../src/navigation/feedAuthorNavigation';

describe('resolveFeedAuthorProfileTarget', () => {
  it('routes other-author taps to other profile', () => {
    expect(resolveFeedAuthorProfileTarget('mubarek-id', 'patrick-id')).toBe(
      'other',
    );
  });

  it('routes own-author taps to self profile', () => {
    expect(resolveFeedAuthorProfileTarget('patrick-id', 'patrick-id')).toBe(
      'self',
    );
  });

  it('treats current_user sentinel as self', () => {
    expect(resolveFeedAuthorProfileTarget('current_user', 'patrick-id')).toBe(
      'self',
    );
  });

  it('returns none when author id is missing', () => {
    expect(resolveFeedAuthorProfileTarget(undefined, 'patrick-id')).toBe(
      'none',
    );
    expect(resolveFeedAuthorProfileTarget('', 'patrick-id')).toBe('none');
  });

  it('treats author without viewer as other (safe FriendProfile path)', () => {
    expect(resolveFeedAuthorProfileTarget('mubarek-id', undefined)).toBe(
      'other',
    );
  });
});

describe('shouldShowFeedMessageAction', () => {
  it('shows Message on another user post', () => {
    expect(shouldShowFeedMessageAction('mubarek-id', 'patrick-id')).toBe(true);
  });

  it('hides Message on own post', () => {
    expect(shouldShowFeedMessageAction('patrick-id', 'patrick-id')).toBe(false);
  });

  it('hides Message for current_user sentinel', () => {
    expect(shouldShowFeedMessageAction('current_user', 'patrick-id')).toBe(
      false,
    );
  });

  it('hides Message when author id is missing (system / invalid)', () => {
    expect(shouldShowFeedMessageAction(undefined, 'patrick-id')).toBe(false);
  });
});
