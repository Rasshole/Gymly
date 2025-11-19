/**
 * Gym Store
 * Manages gym activity, check-ins, and ratings
 */

import {create} from 'zustand';
import {GymActivity, GymCheckIn, GymRating, GymStats, GymHours, GymStatus} from '@/types/gym.types';

interface GymState {
  activities: GymActivity[];
  checkIns: GymCheckIn[];
  ratings: GymRating[];
  hours: GymHours[];
  
  // Actions
  getGymActivity: (gymId: number) => GymActivity | undefined;
  getActiveUsersCount: (gymId: number) => number;
  getUserCheckInsCount: (gymId: number, userId: string) => number;
  getGymStats: (gymId: number, userId: string) => GymStats;
  getGymHours: (gymId: number) => GymHours | undefined;
  getGymStatus: (gymId: number) => GymStatus;
  addCheckIn: (checkIn: Omit<GymCheckIn, 'id'>) => void;
  addRating: (rating: Omit<GymRating, 'createdAt'>) => void;
}

// Mock data for demonstration
const mockActivities: GymActivity[] = [
  {gymId: 1, activeUsers: 12, activeUserIds: []},
  {gymId: 2, activeUsers: 5, activeUserIds: []},
  {gymId: 3, activeUsers: 8, activeUserIds: []},
  {gymId: 4, activeUsers: 3, activeUserIds: []},
  {gymId: 5, activeUsers: 15, activeUserIds: []},
];

const mockCheckIns: GymCheckIn[] = [
  {
    id: '1',
    userId: 'current_user',
    gymId: 1,
    checkInTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
    checkOutTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
  },
  {
    id: '2',
    userId: 'current_user',
    gymId: 1,
    checkInTime: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
    checkOutTime: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 90 * 60 * 1000),
  },
];

const mockRatings: GymRating[] = [
  {gymId: 1, userId: 'user1', rating: 5, comment: 'Fantastisk center!', createdAt: new Date()},
  {gymId: 1, userId: 'user2', rating: 4, comment: 'Godt udstyr', createdAt: new Date()},
  {gymId: 1, userId: 'user3', rating: 5, createdAt: new Date()},
  {gymId: 1, userId: 'user4', rating: 4, createdAt: new Date()},
  {gymId: 1, userId: 'user5', rating: 5, createdAt: new Date()},
];

// Mock gym hours - most gyms are open 6:00-22:00 on weekdays, 8:00-20:00 on weekends
const mockHours: GymHours[] = [
  {
    gymId: 1,
    monday: {open: '06:00', close: '22:00'},
    tuesday: {open: '06:00', close: '22:00'},
    wednesday: {open: '06:00', close: '22:00'},
    thursday: {open: '06:00', close: '22:00'},
    friday: {open: '06:00', close: '22:00'},
    saturday: {open: '08:00', close: '20:00'},
    sunday: {open: '08:00', close: '20:00'},
  },
  {
    gymId: 2,
    isOpen24Hours: true, // PureGym is often 24/7
  },
  {
    gymId: 3,
    monday: {open: '06:00', close: '23:00'},
    tuesday: {open: '06:00', close: '23:00'},
    wednesday: {open: '06:00', close: '23:00'},
    thursday: {open: '06:00', close: '23:00'},
    friday: {open: '06:00', close: '23:00'},
    saturday: {open: '07:00', close: '21:00'},
    sunday: {open: '07:00', close: '21:00'},
  },
];

// Helper function to check if gym is currently open
const checkGymStatus = (hours: GymHours | undefined): GymStatus => {
  if (!hours) {
    return {isOpen: false};
  }

  if (hours.isOpen24Hours) {
    return {isOpen: true};
  }

  const now = new Date();
  const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const currentTime = now.getHours() * 100 + now.getMinutes(); // e.g., 1130 for 11:30

  let todayHours: {open: string; close: string} | undefined;

  switch (currentDay) {
    case 0:
      todayHours = hours.sunday;
      break;
    case 1:
      todayHours = hours.monday;
      break;
    case 2:
      todayHours = hours.tuesday;
      break;
    case 3:
      todayHours = hours.wednesday;
      break;
    case 4:
      todayHours = hours.thursday;
      break;
    case 5:
      todayHours = hours.friday;
      break;
    case 6:
      todayHours = hours.saturday;
      break;
  }

  if (!todayHours) {
    return {isOpen: false};
  }

  const openTime = parseInt(todayHours.open.replace(':', ''));
  const closeTime = parseInt(todayHours.close.replace(':', ''));

  const isOpen = currentTime >= openTime && currentTime < closeTime;

  return {
    isOpen,
    currentHours: todayHours,
  };
};

export const useGymStore = create<GymState>((set, get) => ({
  activities: mockActivities,
  checkIns: mockCheckIns,
  ratings: mockRatings,
  hours: mockHours,

  /**
   * Get activity for a specific gym
   */
  getGymActivity: (gymId) => {
    const state = get();
    return state.activities.find((activity) => activity.gymId === gymId);
  },

  /**
   * Get number of active users at a gym
   */
  getActiveUsersCount: (gymId) => {
    const state = get();
    const activity = state.activities.find((activity) => activity.gymId === gymId);
    return activity?.activeUsers || 0;
  },

  /**
   * Get number of check-ins by a specific user at a gym
   */
  getUserCheckInsCount: (gymId, userId) => {
    const state = get();
    return state.checkIns.filter(
      (checkIn) => checkIn.gymId === gymId && checkIn.userId === userId
    ).length;
  },

  /**
   * Get comprehensive stats for a gym
   */
  getGymStats: (gymId, userId) => {
    const state = get();
    const gymCheckIns = state.checkIns.filter((checkIn) => checkIn.gymId === gymId);
    const userCheckIns = gymCheckIns.filter((checkIn) => checkIn.userId === userId);
    const gymRatings = state.ratings.filter((rating) => rating.gymId === gymId);
    
    const averageRating =
      gymRatings.length > 0
        ? gymRatings.reduce((sum, rating) => sum + rating.rating, 0) / gymRatings.length
        : 0;

    return {
      gymId,
      totalCheckIns: gymCheckIns.length,
      userCheckIns: userCheckIns.length,
      averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
      totalRatings: gymRatings.length,
    };
  },

  /**
   * Add a check-in
   */
  addCheckIn: (checkInData) => {
    const checkIn: GymCheckIn = {
      ...checkInData,
      id: `checkin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };

    set((state) => ({
      checkIns: [checkIn, ...state.checkIns],
    }));
  },

  /**
   * Get gym hours
   */
  getGymHours: (gymId) => {
    const state = get();
    return state.hours.find((hours) => hours.gymId === gymId);
  },

  /**
   * Get gym status (open/closed)
   */
  getGymStatus: (gymId) => {
    const state = get();
    const hours = state.hours.find((hours) => hours.gymId === gymId);
    return checkGymStatus(hours);
  },

  /**
   * Add a rating
   */
  addRating: (ratingData) => {
    const rating: GymRating = {
      ...ratingData,
      createdAt: new Date(),
    };

    set((state) => ({
      ratings: [rating, ...state.ratings],
    }));
  },
}));

