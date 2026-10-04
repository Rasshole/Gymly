/**
 * Total unread DM count — same source as MessagesHeaderButton / tab badge.
 */
import type {Chat} from '@/store/chatStore';

export function totalDmUnread(chats: Chat[]): number {
  return chats.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);
}
