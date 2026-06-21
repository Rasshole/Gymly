import type {Chat} from '@/store/chatStore';

/** Milliseconds for sorting — prefers latest message timestamp, then lastActivity. */
export function chatLastActivityMs(chat: Chat): number {
  const fromMsg = chat.lastMessage?.timestamp;
  if (fromMsg != null) {
    const t =
      fromMsg instanceof Date ? fromMsg.getTime() : new Date(fromMsg).getTime();
    if (Number.isFinite(t)) {
      return t;
    }
  }
  const la = chat.lastActivity;
  if (la != null) {
    const t = la instanceof Date ? la.getTime() : new Date(la).getTime();
    if (Number.isFinite(t)) {
      return t;
    }
  }
  return 0;
}

/** Newest conversation first. */
export function sortChatsByLastActivity(chats: Chat[]): Chat[] {
  return [...chats].sort((a, b) => chatLastActivityMs(b) - chatLastActivityMs(a));
}

export function messageTimestamp(message: {timestamp: Date}): Date {
  return message.timestamp instanceof Date
    ? message.timestamp
    : new Date(message.timestamp);
}

/** Keep the newer preview when merging local state with server sync. */
export function mergeChatActivity(prev: Chat, incoming: Chat): Chat {
  const merged: Chat = {...prev, ...incoming};
  if (chatLastActivityMs(prev) > chatLastActivityMs(merged) && prev.lastMessage) {
    return {
      ...merged,
      lastMessage: prev.lastMessage,
      lastActivity: prev.lastActivity,
    };
  }
  return merged;
}
