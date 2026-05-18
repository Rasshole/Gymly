import {create} from 'zustand';
import {useNotificationStore} from '@/store/notificationStore';
import {DanishGym} from '@/data/danishGyms';
import {MuscleGroup} from '@/types/workout.types';
import {safeDisplayName} from '@/utils/displayName';
import {getMessagePreview} from '@/utils/dmMessagePreview';

export type PlannedWorkoutDmEmbed =
  | {
      kind: 'invite';
      plannedWorkoutId: string;
      centerName: string;
      scheduledAt: string;
      trainingTypes: string[];
      status: 'pending';
    }
  | {
      kind: 'status';
      plannedWorkoutId: string;
      status: 'accepted' | 'declined';
    };

export interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  timestamp: Date;
  isRead: boolean;
  imageUri?: string;
  /** DM body [GYM_PLAN_INVITE] / [GYM_PLAN_STATUS] (parsed in dmService) */
  plannedWorkoutEmbed?: PlannedWorkoutDmEmbed;
  /** Når modtager har åbnet tråden (kun meningsfuldt for beskeder modparten sendte) */
  readAt?: Date | null;
  /** Optimistisk afsendelse (fjernes når server-besked indsættes) */
  sendState?: 'sending';
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

export type DmPresenceState = {
  isActive: boolean;
  lastSeenAt?: number;
  trainingGymName?: string;
  trainingNow?: boolean;
  typingByThread: Record<string, boolean>;
};

export interface ChatPlan {
  id: string;
  /** Supabase planned_workouts.id når plan er synket */
  serverPlannedWorkoutId?: string;
  gym: DanishGym;
  muscles: MuscleGroup[];
  scheduledAt: Date;
  createdBy: string;
  joinedIds: string[];
  invitedIds: string[];
  /** Modtagerens svar (kun meningsfuldt for én-til-én-inviter) */
  inviteeResponse?: 'pending' | 'accepted' | 'declined';
}

interface ChatState {
  /** Tråd der lige nu vises (Chat-screen fokus) – ulæste tælles ikke for den */
  foregroundOpenChatId: string | null;
  setForegroundOpenChatId: (chatId: string | null) => void;
  /**
   * Seneste "jeg har set denne tråd"-tid (ms). Indbagkesync sammenligner med
   * serverens last_message_at så badget vises også når Realtime udebliver.
   */
  threadLastReadAt: Record<string, number>;
  chats: Chat[];
  messagesByChat: Record<string, ChatMessage[]>;
  activePlansByChat: Record<string, ChatPlan | null>;
  /**
   * Visuelt skjult plan-invite banner (surface id pr. tråd). Påvirker ikke DB eller invitation.
   * Nulstilles når bruger får en ny plan (ny surface id) i samme tråd.
   */
  dismissedPlanInviteBannerByChat: Record<string, string>;
  setDismissedPlanInviteBanner: (chatId: string, surfaceId: string | null) => void;
  dmPresenceByUser: Record<string, DmPresenceState>;
  threadSeenAtByUser: Record<string, Record<string, number>>;
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
  /** Erstat tråd (bruges når server har uuid / sync indbakke) */
  upsertChat: (chat: Chat) => void;
  /** Opdatér eget viste navn i DM-listen efter profil-gem */
  updateMyDmParticipantLabels: (myUserId: string, displayName: string) => void;
  /** Erstat hele besked-listen (hent fra Supabase) */
  setMessagesForChat: (chatId: string, messages: ChatMessage[]) => void;
  mergeIncomingMessage: (
    threadId: string,
    message: ChatMessage,
    fromCurrentUser: boolean,
    myUserId?: string,
  ) => void;
  patchChatMessage: (chatId: string, messageId: string, patch: Partial<ChatMessage>) => void;
  resolvePendingDmMessage: (chatId: string, tempId: string, sent: ChatMessage) => void;
  abortPendingDmMessage: (chatId: string, tempId: string) => void;
  upsertDmPresence: (
    userId: string,
    patch: Partial<Omit<DmPresenceState, 'typingByThread'>> & {
      typingForThread?: {threadId: string; typing: boolean};
    },
  ) => void;
  setThreadSeenAtByUser: (threadId: string, userId: string, seenAt: number) => void;
  getThreadSeenAtByUser: (threadId: string, userId: string) => number;
}

export const useChatStore = create<ChatState>((set, get) => ({
  foregroundOpenChatId: null,
  setForegroundOpenChatId: chatId => set({foregroundOpenChatId: chatId}),

  threadLastReadAt: {},

  chats: [],
  messagesByChat: {},
  activePlansByChat: {},
  dismissedPlanInviteBannerByChat: {},
  setDismissedPlanInviteBanner: (chatId, surfaceId) => {
    set(state => {
      const next = {...state.dismissedPlanInviteBannerByChat};
      if (surfaceId == null) {
        delete next[chatId];
      } else {
        next[chatId] = surfaceId;
      }
      return {dismissedPlanInviteBannerByChat: next};
    });
  },
  dmPresenceByUser: {},
  threadSeenAtByUser: {},

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
    const openId = get().foregroundOpenChatId;
    const skipUnread = fromCurrentUser || openId === chatId;
    set((state) => ({
      chats: state.chats.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              lastMessage: message,
              lastActivity: new Date(),
              unreadCount: skipUnread ? chat.unreadCount : chat.unreadCount + 1,
            }
          : chat,
      ),
    }));
    if (!fromCurrentUser && openId !== chatId) {
      const chat = get().chats.find((c) => c.id === chatId);
      if (chat) {
        const i = chat.participantIds.indexOf(message.senderId);
        const senderName =
          i >= 0
            ? safeDisplayName(chat.participantNames[i], 'Ukendt bruger')
            : 'Ukendt bruger';
        const preview = getMessagePreview(message);
        useNotificationStore.getState().addNotification({
          type: 'message',
          title: 'Ny besked',
          message: senderName ? `${senderName}: ${preview}` : preview,
          friendName: senderName,
          chatId,
          friendId: message.senderId,
        });
      }
    }
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
    const now = Date.now();
    set((state) => ({
      threadLastReadAt: {
        ...state.threadLastReadAt,
        [chatId]: now,
      },
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
    set((state) => {
      const list = state.messagesByChat[chatId] ?? [];
      const idx = list.findIndex(m => m.id === message.id);
      if (idx >= 0) {
        const next = [...list];
        next[idx] = {...next[idx], ...message};
        return {
          messagesByChat: {
            ...state.messagesByChat,
            [chatId]: next,
          },
        };
      }
      return {
        messagesByChat: {
          ...state.messagesByChat,
          [chatId]: [...list, message],
        },
      };
    });
  },

  patchChatMessage: (chatId, messageId, patch) => {
    set(state => {
      const list = state.messagesByChat[chatId] ?? [];
      if (!list.some(m => m.id === messageId)) {
        return state;
      }
      return {
        messagesByChat: {
          ...state.messagesByChat,
          [chatId]: list.map(m => (m.id === messageId ? {...m, ...patch} : m)),
        },
      };
    });
  },

  resolvePendingDmMessage: (chatId, tempId, sent) => {
    set(state => {
      const list = state.messagesByChat[chatId] ?? [];
      const withoutTemp = list.filter(m => m.id !== tempId);
      const idx = withoutTemp.findIndex(m => m.id === sent.id);
      let next: ChatMessage[];
      if (idx >= 0) {
        next = [...withoutTemp];
        next[idx] = {...next[idx], ...sent};
      } else {
        next = [...withoutTemp, sent];
      }
      return {
        messagesByChat: {
          ...state.messagesByChat,
          [chatId]: next,
        },
      };
    });
  },

  abortPendingDmMessage: (chatId, tempId) => {
    set(state => ({
      messagesByChat: {
        ...state.messagesByChat,
        [chatId]: (state.messagesByChat[chatId] ?? []).filter(m => m.id !== tempId),
      },
    }));
  },

  setMessagesForChat: (chatId, messages) => {
    set((state) => ({
      messagesByChat: {
        ...state.messagesByChat,
        [chatId]: messages,
      },
    }));
  },

  upsertChat: (chat) => {
    set((state) => {
      // unreadCount: 0 er et gyldigt værdier – må ikke nulstille via ?? når
      // forrige var fx 1. Undlad felt = behold forrige (fx ved indbagkesync uden
      // eksplicit ulæs).
      const mergeUnread = (prevUnread: number) =>
        Object.prototype.hasOwnProperty.call(chat, 'unreadCount')
          ? (chat as Chat).unreadCount
          : prevUnread;

      const i = state.chats.findIndex((c) => c.id === chat.id);
      if (i >= 0) {
        const next = [...state.chats];
        const prev = state.chats[i];
        next[i] = {
          ...prev,
          ...chat,
          participantIds: chat.participantIds,
          participantNames: chat.participantNames,
          unreadCount: mergeUnread(prev.unreadCount),
        };
        return {chats: next};
      }
      const byParticipants = state.chats.find(
        (c) =>
          c.participantIds.length === chat.participantIds.length &&
          c.participantIds.every((id) => chat.participantIds.includes(id)),
      );
      if (byParticipants) {
        return {
          chats: state.chats.map((c) =>
            c.id === byParticipants.id
              ? {
                  ...c,
                  id: chat.id,
                  ...chat,
                  participantIds: chat.participantIds,
                  participantNames: chat.participantNames,
                  unreadCount: mergeUnread(c.unreadCount),
                }
              : c,
          ),
        };
      }
      return {
        chats: [
          ...state.chats,
          {
            ...chat,
            unreadCount: mergeUnread(0),
          } as Chat,
        ],
      };
    });
  },

  updateMyDmParticipantLabels: (myUserId, displayName) => {
    const label = (displayName || '').trim() || 'Dig';
    set(state => ({
      chats: state.chats.map(chat => {
        const idx = chat.participantIds.findIndex(id => id === myUserId);
        if (idx < 0) {
          return chat;
        }
        const names = [...chat.participantNames];
        if (names[idx] === label) {
          return chat;
        }
        names[idx] = label;
        return {...chat, participantNames: names};
      }),
    }));
  },

  mergeIncomingMessage: (threadId, message, fromCurrentUser, myUserId) => {
    if (
      myUserId &&
      !fromCurrentUser &&
      !get().chats.some(c => c.id === threadId)
    ) {
      const ids = [myUserId, message.senderId].sort();
      get().upsertChat({
        id: threadId,
        participantIds: ids,
        participantNames: ids.map(id => (id === myUserId ? 'Dig' : 'Ukendt bruger')),
        lastActivity: message.timestamp,
        lastMessage: message,
        unreadCount: 0,
      });
    }
    get().addMessageToChat(threadId, message);
    get().updateChatLastMessage(threadId, message, {fromCurrentUser: fromCurrentUser});
  },

  upsertDmPresence: (userId, patch) => {
    set(state => {
      const prev = state.dmPresenceByUser[userId] ?? {
        isActive: false,
        typingByThread: {},
      };
      const nextTyping = patch.typingForThread
        ? {
            ...prev.typingByThread,
            [patch.typingForThread.threadId]: patch.typingForThread.typing,
          }
        : prev.typingByThread;
      return {
        dmPresenceByUser: {
          ...state.dmPresenceByUser,
          [userId]: {
            ...prev,
            ...(typeof patch.isActive === 'boolean' ? {isActive: patch.isActive} : {}),
            ...(typeof patch.lastSeenAt === 'number' ? {lastSeenAt: patch.lastSeenAt} : {}),
            ...(typeof patch.trainingGymName === 'string' || patch.trainingGymName === undefined
              ? {trainingGymName: patch.trainingGymName}
              : {}),
            ...(typeof patch.trainingNow === 'boolean'
              ? {trainingNow: patch.trainingNow}
              : {}),
            typingByThread: nextTyping,
          },
        },
      };
    });
  },

  setThreadSeenAtByUser: (threadId, userId, seenAt) => {
    set(state => ({
      threadSeenAtByUser: {
        ...state.threadSeenAtByUser,
        [threadId]: {
          ...(state.threadSeenAtByUser[threadId] ?? {}),
          [userId]: seenAt,
        },
      },
    }));
  },

  getThreadSeenAtByUser: (threadId, userId) => {
    const state = get();
    return state.threadSeenAtByUser[threadId]?.[userId] ?? 0;
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


