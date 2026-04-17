/**
 * Activity Store – user-generated activities (e.g. from check-in)
 * Kombineres med Firestore-aktivitet i feedet
 */

import {create} from 'zustand';
import type {ActivityEvent} from '@/types/activity.types';

interface ActivityStoreState {
  userActivities: ActivityEvent[];
  addCheckInActivity: (params: {
    userId: string;
    displayName: string;
    gymName: string;
    city?: string;
  }) => void;
  addBadgeUnlockedActivity: (params: {
    userId: string;
    displayName: string;
    badgeEmoji: string;
    badgeName: string;
  }) => void;
}

export const useActivityStore = create<ActivityStoreState>(set => ({
  userActivities: [],

  addCheckInActivity: ({userId, displayName, gymName, city}) =>
    set(state => {
      const event: ActivityEvent = {
        id: `activity_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        type: 'check_in',
        userId,
        displayName,
        message: `checkede ind i ${gymName}`,
        timestamp: new Date(),
        gymName,
        city,
        scope: 'friends',
      };
      return {
        userActivities: [event, ...state.userActivities],
      };
    }),

  addBadgeUnlockedActivity: ({userId, displayName, badgeEmoji, badgeName}) =>
    set(state => {
      const event: ActivityEvent = {
        id: `activity_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        type: 'badge_unlocked',
        userId,
        displayName,
        message: `låste op ${badgeEmoji} ${badgeName}`,
        timestamp: new Date(),
        badgeName,
        badge: `${badgeEmoji} ${badgeName}`,
        scope: 'friends',
      };
      return {
        userActivities: [event, ...state.userActivities],
      };
    }),
}));
