import {create} from 'zustand';
import {DanishGym} from '@/data/danishGyms';
import {MuscleGroup} from '@/types/workout.types';

export interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  timestamp: Date;
  isRead: boolean;
  imageUri?: string;
}

export interface Chat {
  id: string;
  participantIds: string[];
  participantNames: string[];
  lastMessage?: ChatMessage;
  lastActivity: Date;
  unreadCount: number;
  avatar?: string;
  avatarInitials?: string;
  isActive?: boolean; // Online / recently active
}

export interface ChatPlan {
  id: string;
  gym: DanishGym;
  muscles: MuscleGroup[];
  scheduledAt: Date;
  createdBy: string;
  joinedIds: string[];
  invitedIds: string[];
}

interface ChatState {
  chats: Chat[];
  messagesByChat: Record<string, ChatMessage[]>;
  activePlansByChat: Record<string, ChatPlan | null>;
  addChat: (chat: Chat) => void;
  updateChatLastMessage: (chatId: string, message: ChatMessage, options?: { fromCurrentUser?: boolean }) => void;
  getChatByParticipants: (participantIds: string[]) => Chat | null;
  markChatAsRead: (chatId: string) => void;
  initializeChatMessages: (chatId: string, initialMessages: ChatMessage[]) => void;
  addMessageToChat: (chatId: string, message: ChatMessage) => void;
  getMessagesForChat: (chatId: string) => ChatMessage[];
  setActivePlanForChat: (chatId: string, plan: ChatPlan | null) => void;
  updateActivePlanForChat: (chatId: string, updater: (plan: ChatPlan | null) => ChatPlan | null) => void;
  getActivePlanForChat: (chatId: string) => ChatPlan | null;
  seedChatsFromInitial: (chats: Chat[], messagesByChat: Record<string, ChatMessage[]>) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  messagesByChat: {},
  activePlansByChat: {},

  addChat: (chat) => {
    set((state) => {
      // Check if chat already exists
      const existing = state.chats.find(
        (c) =>
          c.participantIds.length === chat.participantIds.length &&
          c.participantIds.every((id) => chat.participantIds.includes(id)),
      );
      if (existing) {
        return state;
      }
      return {
        chats: [...state.chats, chat],
      };
    });
  },

  updateChatLastMessage: (chatId, message, options) => {
    const fromCurrentUser = options?.fromCurrentUser ?? false;
    set((state) => ({
      chats: state.chats.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              lastMessage: message,
              lastActivity: new Date(),
              unreadCount: fromCurrentUser ? chat.unreadCount : chat.unreadCount + 1,
            }
          : chat,
      ),
    }));
  },

  getChatByParticipants: (participantIds) => {
    const state = get();
    return (
      state.chats.find(
        (chat) =>
          chat.participantIds.length === participantIds.length &&
          chat.participantIds.every((id) => participantIds.includes(id)),
      ) || null
    );
  },

  markChatAsRead: (chatId) => {
    set((state) => ({
      chats: state.chats.map((chat) =>
        chat.id === chatId ? {...chat, unreadCount: 0} : chat,
      ),
    }));
  },

  initializeChatMessages: (chatId, initialMessages) => {
    set((state) => {
      if (state.messagesByChat[chatId]) {
        return {};
      }
      return {
        messagesByChat: {
          ...state.messagesByChat,
          [chatId]: initialMessages,
        },
      };
    });
  },

  addMessageToChat: (chatId, message) => {
    set((state) => ({
      messagesByChat: {
        ...state.messagesByChat,
        [chatId]: [...(state.messagesByChat[chatId] ?? []), message],
      },
    }));
  },

  getMessagesForChat: (chatId) => {
    const state = get();
    return state.messagesByChat[chatId] ?? [];
  },

  setActivePlanForChat: (chatId, plan) => {
    set((state) => ({
      activePlansByChat: {
        ...state.activePlansByChat,
        [chatId]: plan,
      },
    }));
  },

  updateActivePlanForChat: (chatId, updater) => {
    set((state) => ({
      activePlansByChat: {
        ...state.activePlansByChat,
        [chatId]: updater(state.activePlansByChat[chatId] ?? null),
      },
    }));
  },

  getActivePlanForChat: (chatId) => {
    const state = get();
    return state.activePlansByChat[chatId] ?? null;
  },

  seedChatsFromInitial: (chats, messagesByChat) => {
    const state = get();
    if (state.chats.length > 0) return;
    const normalizedChats = chats.map((c) => ({
      ...c,
      lastMessage: c.lastMessage
        ? {
            ...c.lastMessage,
            timestamp:
              c.lastMessage.timestamp instanceof Date
                ? c.lastMessage.timestamp
                : new Date(c.lastMessage.timestamp),
          }
        : undefined,
      lastActivity:
        c.lastActivity instanceof Date ? c.lastActivity : new Date(c.lastActivity),
    }));
    const normalizedMessages: Record<string, ChatMessage[]> = {};
    Object.entries(messagesByChat).forEach(([chatId, msgs]) => {
      normalizedMessages[chatId] = msgs.map((m) => ({
        ...m,
        timestamp: m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp),
      }));
    });
    set({
      chats: normalizedChats,
      messagesByChat: { ...state.messagesByChat, ...normalizedMessages },
    });
  },
}));


