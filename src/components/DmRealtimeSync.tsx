/**
 * Global DM Realtime: nye beskeder opdaterer Zustand som Instagram/Messenger
 */

import React, {useEffect} from 'react';
import {supabase} from '@/services/supabase/supabaseClient';
import {
  dmMessageFromPayload,
  fetchDmInboxItemForThread,
  inboxItemToChat,
  messageFromDmRow,
  type DmMessageRow,
} from '@/services/supabase/dmService';
import {syncDmInboxToStore} from '@/services/supabase/dmInboxSync';
import {useAppStore} from '@/store/appStore';
import {useChatStore} from '@/store/chatStore';

export function DmRealtimeSync() {
  const userId = useAppStore(s => s.user?.id);
  const displayName = useAppStore(s => s.user?.displayName);

  useEffect(() => {
    if (!userId) {
      return;
    }
    const channel = supabase
      .channel('dm_messages_global')
      .on(
        'postgres_changes',
        {event: 'INSERT', schema: 'public', table: 'dm_messages'},
        async payload => {
          const row = dmMessageFromPayload(payload.new);
          if (!row) {
            return;
          }
          const threadId = row.thread_id;
          const store = useChatStore.getState();
          let hasThread = store.chats.some(c => c.id === threadId);
          if (!hasThread) {
            try {
              await syncDmInboxToStore(userId, displayName?.trim() || 'Dig');
            } catch {
              // ignore
            }
            hasThread = useChatStore.getState().chats.some(c => c.id === threadId);
          }
          if (!hasThread) {
            const myName = displayName?.trim() || 'Dig';
            const item = await fetchDmInboxItemForThread(userId, threadId);
            if (item) {
              const chat = inboxItemToChat(item, userId, myName);
              useChatStore.getState().upsertChat({...chat, unreadCount: 0});
            }
          }
          const msg = messageFromDmRow(row as DmMessageRow);
          const fromMe = row.sender_id === userId;
          useChatStore
            .getState()
            .mergeIncomingMessage(threadId, msg, fromMe, userId);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, displayName]);

  return null;
}
