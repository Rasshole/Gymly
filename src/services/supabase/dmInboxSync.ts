/**
 * Synkroniser DM-indbakke fra Supabase til Zustand (samme kilde som Messenger)
 */

import {useChatStore, type Chat} from '@/store/chatStore';
import {
  fetchDmInbox,
  fetchDmUnreadCountsByThread,
  inboxItemToChat,
} from '@/services/supabase/dmService';

export async function syncDmInboxToStore(
  myUserId: string,
  myDisplayName: string,
): Promise<void> {
  const items = await fetchDmInbox(myUserId, myDisplayName);
  const threadIds = items.map(i => i.thread.id);
  const unreadByThread = await fetchDmUnreadCountsByThread(myUserId, threadIds);
  const {chats, threadLastReadAt, foregroundOpenChatId} = useChatStore.getState();
  const upsert = useChatStore.getState().upsertChat;
  for (const item of items) {
    const chat = inboxItemToChat(item, myUserId, myDisplayName);
    const existing =
      chats.find(c => c.id === chat.id) ||
      chats.find(
        c =>
          c.participantIds.length === chat.participantIds.length &&
          c.participantIds.every(id => chat.participantIds.includes(id)),
      );
    const thread = item.thread;
    let unreadCount = 0;
    if (foregroundOpenChatId === thread.id) {
      unreadCount = 0;
    } else if (unreadByThread !== null) {
      unreadCount = unreadByThread[thread.id] ?? 0;
    } else {
      const lastMsgMs = thread.last_message_at
        ? new Date(thread.last_message_at).getTime()
        : 0;
      const readMs = threadLastReadAt[thread.id] ?? 0;
      const sid = thread.last_sender_id;
      const fromOther = !!sid && sid !== myUserId;
      const hasUnseenMessage = fromOther && lastMsgMs > readMs;
      unreadCount = hasUnseenMessage
        ? Math.max(1, existing?.unreadCount ?? 0)
        : 0;
    }
    upsert({...chat, unreadCount} as Chat);
  }
}
