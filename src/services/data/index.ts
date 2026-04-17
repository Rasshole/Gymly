/**
 * Data services – abstraction layer for all domain data
 * Screens should use these services instead of importing mock data directly
 *
 * @see BACKEND_README.md for Firestore migration
 */

export * from './ActivityService';
export * from './GroupService';
export * from './OnlineUsersService';
export * from './ProfileService';
export * from './LeaderboardDataService';
export * from './NotificationDataService';
export * from './ChatDataService';
