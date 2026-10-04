/**
 * Send 💪 as normal DM messages from Notifications.
 * - One getOrCreateDmThread per peer (in-flight promise cache)
 * - Client message UUID for retry without duplicates
 * - Small concurrency-limited queue for rapid taps
 */

import {
  getOrCreateDmThread,
  sendDmMessage,
  userFacingDmError,
} from '@/services/supabase/dmService';
import {usersAreBlocked} from '@/services/supabase/userBlockService';
import {FriendActionUnavailableError} from '@/utils/userBlockErrors';
import {useChatStore, type ChatMessage} from '@/store/chatStore';

export const BICEPS_DM_BODY = '💪';
const MAX_CONCURRENT = 2;

export function newClientMessageId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

type Job = {
  clientMessageId: string;
  currentUserId: string;
  friendId: string;
  friendName: string;
  resolve: (message: ChatMessage) => void;
  reject: (error: Error) => void;
};

const threadPromiseByPeer = new Map<string, Promise<string>>();
const queue: Job[] = [];
let active = 0;

async function ensureThreadCached(
  currentUserId: string,
  friendId: string,
  friendName: string,
): Promise<string> {
  const existing = threadPromiseByPeer.get(friendId);
  if (existing) {
    return existing;
  }
  const promise = (async () => {
    if (await usersAreBlocked(currentUserId, friendId)) {
      throw new FriendActionUnavailableError();
    }
    const threadId = await getOrCreateDmThread(friendId);
    const participantIds = [currentUserId, friendId].sort();
    const store = useChatStore.getState();
    const existingChat = store.getChatByParticipants?.(participantIds);
    store.upsertChat({
      id: threadId,
      participantIds,
      participantNames: participantIds.map(id =>
        id === currentUserId ? 'Dig' : friendName || 'Ven',
      ),
      lastActivity: existingChat?.lastActivity ?? new Date(),
      unreadCount: existingChat?.unreadCount ?? 0,
      avatar: existingChat?.avatar,
      avatarInitials: existingChat?.avatarInitials,
    });
    return threadId;
  })().catch(err => {
    threadPromiseByPeer.delete(friendId);
    throw err;
  });
  threadPromiseByPeer.set(friendId, promise);
  return promise;
}

async function runJob(job: Job): Promise<void> {
  // Re-check on every send — thread may be cached after a later block.
  if (await usersAreBlocked(job.currentUserId, job.friendId)) {
    threadPromiseByPeer.delete(job.friendId);
    job.reject(new FriendActionUnavailableError());
    return;
  }
  const threadId = await ensureThreadCached(
    job.currentUserId,
    job.friendId,
    job.friendName,
  );
  const store = useChatStore.getState();
  const optimistic: ChatMessage = {
    id: job.clientMessageId,
    text: BICEPS_DM_BODY,
    senderId: job.currentUserId,
    timestamp: new Date(),
    isRead: false,
    sendState: 'sending',
  };
  store.addMessageToChat(threadId, optimistic);
  store.updateChatLastMessage(threadId, optimistic, {fromCurrentUser: true});

  try {
    const {message} = await sendDmMessage(threadId, {
      body: BICEPS_DM_BODY,
      id: job.clientMessageId,
    });
    store.resolvePendingDmMessage(threadId, job.clientMessageId, message);
    store.updateChatLastMessage(threadId, message, {fromCurrentUser: true});
    job.resolve(message);
  } catch (e) {
    store.abortPendingDmMessage(threadId, job.clientMessageId);
    const err =
      e instanceof Error
        ? e
        : new Error(userFacingDmError(e, 'Kunne ikke sende'));
    job.reject(err);
  }
}

function pump(): void {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const job = queue.shift()!;
    active += 1;
    void runJob(job).finally(() => {
      active -= 1;
      pump();
    });
  }
}

/** Enqueue one 💪 send. Same clientMessageId retries the same row (no duplicate). */
export function enqueueBicepsDm(params: {
  clientMessageId: string;
  currentUserId: string;
  friendId: string;
  friendName: string;
}): Promise<ChatMessage> {
  return new Promise((resolve, reject) => {
    queue.push({...params, resolve, reject});
    pump();
  });
}

/** Clear cached thread promise (e.g. after block). */
export function clearBicepsDmThreadCache(friendId?: string): void {
  if (friendId) {
    threadPromiseByPeer.delete(friendId);
    return;
  }
  threadPromiseByPeer.clear();
}

/** Test helpers */
export function __resetBicepsDmQueueForTests(): void {
  queue.length = 0;
  active = 0;
  threadPromiseByPeer.clear();
}

export function __bicepsDmQueueDepthForTests(): number {
  return queue.length + active;
}
