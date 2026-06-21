/**
 * Notification Store
 * Manages notifications – uses types from @/types/notification.types
 */

import {create} from 'zustand';
import type {Notification, NotificationType} from '@/types/notification.types';

export type {Notification, NotificationType};

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  /** Pending venneanmodninger (friend_requests) — klokke-badge i header */
  incomingFriendRequestCount: number;

  // Actions
  setIncomingFriendRequestCount: (count: number) => void;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  removeNotification: (id: string) => void;
  checkOutFriend: (friendName: string) => void; // Mark friend as checked out
  markInviteJoined: (id: string) => void;
  /** Marker besked-notifikationer for en chat som læst (når brugeren åbner tråden) */
  markMessageNotificationsForChatRead: (chatId: string) => void;
  seedNotifications: (notifications: Omit<Notification, 'id' | 'timestamp' | 'read'>[]) => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  incomingFriendRequestCount: 0,

  setIncomingFriendRequestCount: count => set({incomingFriendRequestCount: Math.max(0, count)}),

  /**
   * Add a new notification
   */
  addNotification: (notificationData) => {
    if (notificationData.friendRequestId) {
      const frId = notificationData.friendRequestId;
      if (
        get().notifications.some(
          n =>
            n.type === 'friend_request' && n.friendRequestId === frId,
        )
      ) {
        return;
      }
    }
    const now = new Date();
    const notification: Notification = {
      ...notificationData,
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: now,
      read: false,
      checkInTime: notificationData.checkInTime || now,
      isActive: notificationData.isActive !== undefined ? notificationData.isActive : true,
      joined: notificationData.type === 'workout_invite' ? false : undefined,
    };

    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    }));
  },

  /**
   * Mark a notification as read
   */
  markAsRead: (id) => {
    set((state) => {
      const updated = state.notifications.map((notif) =>
        notif.id === id ? {...notif, read: true} : notif,
      );
      const unreadCount = updated.filter((n) => !n.read).length;
      return {
        notifications: updated,
        unreadCount,
      };
    });
  },

  /**
   * Mark all notifications as read
   */
  markAllAsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((notif) => ({
        ...notif,
        read: true,
      })),
      unreadCount: 0,
    }));
  },

  /**
   * Clear all notifications
   */
  clearNotifications: () => {
    set({
      notifications: [],
      unreadCount: 0,
    });
  },

  /**
   * Remove a notification
   */
  removeNotification: (id) => {
    set((state) => {
      const notification = state.notifications.find((n) => n.id === id);
      const updated = state.notifications.filter((n) => n.id !== id);
      const unreadCount = notification && !notification.read
        ? state.unreadCount - 1
        : state.unreadCount;
      return {
        notifications: updated,
        unreadCount,
      };
    });
  },

  /**
   * Mark a friend as checked out
   */
  checkOutFriend: (friendName) => {
    set((state) => {
      const updated = state.notifications.map((notif) => {
        if (
          notif.type === 'friend_checkin' &&
          notif.friendName === friendName &&
          notif.isActive
        ) {
          return {
            ...notif,
            isActive: false,
            checkOutTime: new Date(),
            message: `${friendName} har forladt ${notif.gymName || 'gymmet'}`,
          };
        }
        return notif;
      });
      return {
        notifications: updated,
      };
    });
  },

  /**
   * Mark workout invite as joined (toggle)
   */
  markInviteJoined: id => {
    set(state => {
      const notifications = state.notifications.map(notif => {
        if (notif.id === id) {
          const newJoinedState = !notif.joined;
          return {
            ...notif,
            joined: newJoinedState,
            read: newJoinedState ? true : notif.read, // Only mark as read when joining
          };
        }
        return notif;
      });
      return {
        notifications,
        unreadCount: notifications.filter(notif => !notif.read).length,
      };
    });
  },

  markMessageNotificationsForChatRead: chatId => {
    if (!chatId) return;
    set(state => {
      const notifications = state.notifications.map(notif =>
        notif.type === 'message' && notif.chatId === chatId
          ? {...notif, read: true}
          : notif,
      );
      return {
        notifications,
        unreadCount: notifications.filter(n => !n.read).length,
      };
    });
  },

  seedNotifications: (incoming: Array<Partial<Notification> & {timestamp?: Date; read?: boolean}>) => {
    const state = get();
    if (state.notifications.length > 0) return;
    const now = new Date();
    const notifications: Notification[] = incoming.map((n, i) => ({
      ...n,
      id: `notif_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: (n as any).timestamp
        ? new Date((n as any).timestamp)
        : new Date(now.getTime() - i * 3600000),
      read: (n as any).read ?? i >= 2,
    }));
    set({
      notifications,
      unreadCount: notifications.filter(n => !n.read).length,
    });
  },
}));

