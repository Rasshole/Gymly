/**
 * Gym Types
 * Types for gym/center data and statistics
 */

export interface GymActivity {
  gymId: string;
  activeUsers: number; // Number of users currently checked in
  activeUserIds: string[]; // IDs of active users
}

export interface GymCheckIn {
  id: string;
  userId: string;
  gymId: string;
  gymName: string;
  userName?: string;
  checkInTime: Date;
  checkOutTime?: Date;
}

export interface GymRating {
  gymId: string;
  userId: string;
  rating: number; // 1-5 stars
  comment?: string;
  createdAt: Date;
}

export interface GymStats {
  gymId: string;
  totalCheckIns: number; // Total check-ins by all users
  userCheckIns: number; // Check-ins by current user
  averageRating: number; // Average rating (1-5)
  totalRatings: number; // Number of ratings
}

export interface GymHours {
  gymId: string;
  monday?: {open: string; close: string}; // e.g., "06:00", "22:00"
  tuesday?: {open: string; close: string};
  wednesday?: {open: string; close: string};
  thursday?: {open: string; close: string};
  friday?: {open: string; close: string};
  saturday?: {open: string; close: string};
  sunday?: {open: string; close: string};
  isOpen24Hours?: boolean; // Some gyms are open 24/7
}

export interface GymStatus {
  isOpen: boolean;
  currentHours?: {open: string; close: string};
  nextOpenTime?: Date;
}

