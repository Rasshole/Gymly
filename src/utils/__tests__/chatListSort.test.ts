import type {Chat} from '@/store/chatStore';
import {chatLastActivityMs, sortChatsByLastActivity} from '@/utils/chatListSort';

function makeChat(id: string, lastActivity: Date, lastMessageAt?: Date): Chat {
  return {
    id,
    participantIds: ['a', 'b'],
    participantNames: ['A', 'B'],
    lastActivity,
    unreadCount: 0,
    lastMessage: lastMessageAt
      ? {
          id: 'm1',
          text: 'hi',
          senderId: 'a',
          timestamp: lastMessageAt,
          isRead: true,
        }
      : undefined,
  };
}

describe('chatListSort', () => {
  it('sorts by latest message timestamp descending', () => {
    const old = makeChat('old', new Date('2026-05-20'), new Date('2026-05-20'));
    const newest = makeChat('newest', new Date('2026-05-26'), new Date('2026-05-26'));
    const mid = makeChat('mid', new Date('2026-05-24'), new Date('2026-05-24'));
    const sorted = sortChatsByLastActivity([old, newest, mid]);
    expect(sorted.map(c => c.id)).toEqual(['newest', 'mid', 'old']);
  });

  it('uses lastMessage timestamp over stale lastActivity', () => {
    const chat = makeChat('c1', new Date('2026-01-01'), new Date('2026-05-26'));
    expect(chatLastActivityMs(chat)).toBe(new Date('2026-05-26').getTime());
  });
});
