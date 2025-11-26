import {create} from 'zustand';
import {DanishGym} from '@/data/danishGyms';
import {MuscleGroup} from '@/types/workout.types';

export interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  timestamp: Date;
  isRead: boolean;
}

export interface Chat {
  id: string;
  participantIds: string[];
  participantNames: string[];
  lastMessage?: ChatMessage;
  lastActivity: Date;
  unreadCount: number;
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
  updateChatLastMessage: (chatId: string, message: ChatMessage) => void;
  getChatByParticipants: (participantIds: string[]) => Chat | null;
  markChatAsRead: (chatId: string) => void;
  initializeChatMessages: (chatId: string, initialMessages: ChatMessage[]) => void;
  addMessageToChat: (chatId: string, message: ChatMessage) => void;
  getMessagesForChat: (chatId: string) => ChatMessage[];
  setActivePlanForChat: (chatId: string, plan: ChatPlan | null) => void;
  updateActivePlanForChat: (chatId: string, updater: (plan: ChatPlan | null) => ChatPlan | null) => void;
  getActivePlanForChat: (chatId: string) => ChatPlan | null;
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

  updateChatLastMessage: (chatId, message) => {
    set((state) => ({
      chats: state.chats.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              lastMessage: message,
              lastActivity: new Date(),
              unreadCount: chat.id === chatId ? chat.unreadCount + 1 : chat.unreadCount,
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
}));


