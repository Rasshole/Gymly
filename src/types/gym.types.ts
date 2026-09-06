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

export interface GymDayHours {
  open: string;
  close: string;
  /** Staffed/reception hours — string for simple or complex schedules */
  staffed?: string | null;
}

export interface GymHours {
  gymId: string;
  monday?: GymDayHours;
  tuesday?: GymDayHours;
  wednesday?: GymDayHours;
  thursday?: GymDayHours;
  friday?: GymDayHours;
  saturday?: GymDayHours;
  sunday?: GymDayHours;
  isOpen24Hours?: boolean;
  notes?: string;
}

export interface GymStatus {
  isOpen: boolean;
  currentHours?: {open: string; close: string};
  nextOpenTime?: Date;
}

