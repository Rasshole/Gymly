/**
 * Notification Store
 * Manages notifications for friend check-ins
 */

import {create} from 'zustand';

export type NotificationType = 'friend_checkin' | 'friend_request' | 'message';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  friendName?: string;
  gymName?: string;
  timestamp: Date;
  read: boolean;
  checkInTime?: Date; // When the friend checked in
  isActive?: boolean; // Whether the friend is still checked in
  checkOutTime?: Date; // When the friend checked out
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  
  // Actions
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  removeNotification: (id: string) => void;
  checkOutFriend: (friendName: string) => void; // Mark friend as checked out
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,

  /**
   * Add a new notification
   */
  addNotification: (notificationData) => {
    const now = new Date();
    const notification: Notification = {
      ...notificationData,
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: now,
      read: false,
      checkInTime: notificationData.checkInTime || now,
      isActive: notificationData.isActive !== undefined ? notificationData.isActive : true,
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
}));

