import {totalDmUnread} from '../dmUnreadTotal';
import type {Chat} from '@/store/chatStore';

function chat(partial: Partial<Chat> & {id: string}): Chat {
  return {
    participantIds: [],
    participantNames: [],
    lastActivity: new Date(0),
    unreadCount: 0,
    ...partial,
  };
}

describe('totalDmUnread', () => {
  it('sums unread across threads', () => {
    expect(
      totalDmUnread([
        chat({id: 'a', unreadCount: 1}),
        chat({id: 'b', unreadCount: 2}),
        chat({id: 'c', unreadCount: 0}),
      ]),
    ).toBe(3);
  });

  it('treats missing unreadCount as 0', () => {
    expect(totalDmUnread([chat({id: 'a'})])).toBe(0);
  });
});
