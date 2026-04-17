/**
 * Chat Data Service — chats fra Firestore når integration er klar
 */

import type {Chat, ChatMessage} from '@/types/chat.types';

export async function getInitialChats(): Promise<Chat[]> {
  return [];
}

export async function getInitialMessages(): Promise<Record<string, ChatMessage[]>> {
  return {};
}
