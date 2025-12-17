/**
 * Gym Store
 * Manages gym activity, check-ins, and ratings
 */

import {create} from 'zustand';
import {GymActivity, GymCheckIn, GymRating, GymStats, GymHours, GymStatus} from '@/types/gym.types';
import danishGyms from '@/data/danishGyms';

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
// Generate random active users for many gyms to make it visible
// We'll generate for first 200 gyms with varying activity levels
const mockActivities: GymActivity[] = Array.from({length: 200}, (_, i) => {
  // Some gyms have no active users, some have many
  const hasActivity = Math.random() > 0.3; // 70% chance of having active users
  return {
    gymId: i + 1,
    activeUsers: hasActivity ? Math.floor(Math.random() * 25) + 1 : 0, // Random between 1-25 or 0
    activeUserIds: [],
  };
});

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

// Helper function to get default hours based on brand
const getDefaultHoursForBrand = (brand?: string): GymHours | null => {
  if (!brand) {
    // Default hours for unknown brands: 6:00-22:00 weekdays, 8:00-20:00 weekends
    return {
      gymId: 0, // Will be replaced
      monday: {open: '06:00', close: '22:00'},
      tuesday: {open: '06:00', close: '22:00'},
      wednesday: {open: '06:00', close: '22:00'},
      thursday: {open: '06:00', close: '22:00'},
      friday: {open: '06:00', close: '22:00'},
      saturday: {open: '08:00', close: '20:00'},
      sunday: {open: '08:00', close: '20:00'},
    };
  }

  const brandLower = brand.toLowerCase();
  
  // PureGym is typically 24/7
  if (brandLower.includes('puregym') || brandLower.includes('pure gym')) {
    return {
      gymId: 0, // Will be replaced
      isOpen24Hours: true,
    };
  }
  
  // SATS typically: Mo-Th 06:00-22:00, Fr 06:00-21:00, Sa 07:00-19:00, Su 07:00-20:00
  // (varies by location, but this is common)
  if (brandLower.includes('sats')) {
    return {
      gymId: 0, // Will be replaced
      monday: {open: '06:00', close: '22:00'},
      tuesday: {open: '06:00', close: '22:00'},
      wednesday: {open: '06:00', close: '22:00'},
      thursday: {open: '06:00', close: '22:00'},
      friday: {open: '06:00', close: '21:00'},
      saturday: {open: '07:00', close: '19:00'},
      sunday: {open: '07:00', close: '20:00'},
    };
  }
  
  // Fitness World typically: 6:00-22:00 weekdays, 8:00-20:00 weekends
  if (brandLower.includes('fitness world') || brandLower.includes('fitnessworld')) {
    return {
      gymId: 0, // Will be replaced
      monday: {open: '06:00', close: '22:00'},
      tuesday: {open: '06:00', close: '22:00'},
      wednesday: {open: '06:00', close: '22:00'},
      thursday: {open: '06:00', close: '22:00'},
      friday: {open: '06:00', close: '22:00'},
      saturday: {open: '08:00', close: '20:00'},
      sunday: {open: '08:00', close: '20:00'},
    };
  }
  
  // LOOP Fitness: typically 5:00-00:00 (24/7 style)
  if (brandLower.includes('loop')) {
    return {
      gymId: 0, // Will be replaced
      isOpen24Hours: true,
    };
  }
  
  // FitnessX: typically 6:00-22:00 weekdays, 8:00-20:00 weekends
  if (brandLower.includes('fitnessx')) {
    return {
      gymId: 0, // Will be replaced
      monday: {open: '06:00', close: '22:00'},
      tuesday: {open: '06:00', close: '22:00'},
      wednesday: {open: '06:00', close: '22:00'},
      thursday: {open: '06:00', close: '22:00'},
      friday: {open: '06:00', close: '22:00'},
      saturday: {open: '08:00', close: '20:00'},
      sunday: {open: '08:00', close: '20:00'},
    };
  }
  
  // Orange Fitness: typically 6:00-22:00 weekdays, 8:00-20:00 weekends
  if (brandLower.includes('orange fitness') || brandLower.includes('orangefitness')) {
    return {
      gymId: 0, // Will be replaced
      monday: {open: '06:00', close: '22:00'},
      tuesday: {open: '06:00', close: '22:00'},
      wednesday: {open: '06:00', close: '22:00'},
      thursday: {open: '06:00', close: '22:00'},
      friday: {open: '06:00', close: '22:00'},
      saturday: {open: '08:00', close: '20:00'},
      sunday: {open: '08:00', close: '20:00'},
    };
  }
  
  // Default hours for other brands
  return {
    gymId: 0, // Will be replaced
    monday: {open: '06:00', close: '22:00'},
    tuesday: {open: '06:00', close: '22:00'},
    wednesday: {open: '06:00', close: '22:00'},
    thursday: {open: '06:00', close: '22:00'},
    friday: {open: '06:00', close: '22:00'},
    saturday: {open: '08:00', close: '20:00'},
    sunday: {open: '08:00', close: '20:00'},
  };
};

// Helper function to check if gym is currently open
const checkGymStatus = (hours: GymHours | undefined, brand?: string): GymStatus => {
  // If no hours provided, generate default hours based on brand
  if (!hours) {
    const defaultHours = getDefaultHoursForBrand(brand);
    if (defaultHours) {
      hours = defaultHours;
    } else {
      return {isOpen: false};
    }
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
    // If no activity found in mock data, return a random number for demonstration
    if (!activity) {
      // Generate a consistent random number based on gymId for demo purposes
      const seed = gymId * 12345;
      return (seed % 20) + (seed % 3 === 0 ? 0 : 1); // Some gyms have 0, most have 1-20
    }
    return activity.activeUsers;
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
    const existingHours = state.hours.find((hours) => hours.gymId === gymId);
    
    // If hours exist, return them
    if (existingHours) {
      return existingHours;
    }
    
    // Otherwise, generate default hours based on brand
    const gym = danishGyms.find(g => g.id === gymId);
    if (!gym) {
      return undefined;
    }
    
    const defaultHours = getDefaultHoursForBrand(gym.brand);
    if (defaultHours) {
      return {
        ...defaultHours,
        gymId: gymId,
      };
    }
    
    return undefined;
  },

  /**
   * Get gym status (open/closed)
   */
  getGymStatus: (gymId) => {
    const state = get();
    const hours = state.hours.find((hours) => hours.gymId === gymId);
    // Get brand from danishGyms data
    const gym = danishGyms.find(g => g.id === gymId);
    const brand = gym?.brand;
    return checkGymStatus(hours, brand);
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

