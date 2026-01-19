/**
 * Authentication Utilities
 * Helper functions for getting current user information
 */

import {useAppStore} from '@/store/appStore';

/**
 * Get current user ID from app store
 * Returns null if user is not authenticated
 */
export const getCurrentUserId = (): string | null => {
  const user = useAppStore.getState().user;
  return user?.id || null;
};

/**
 * Hook to get current user ID
 * Returns null if user is not authenticated
 */
export const useCurrentUserId = (): string | null => {
  const user = useAppStore(state => state.user);
  return user?.id || null;
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = (): boolean => {
  return useAppStore.getState().isAuthenticated;
};

/**
 * Get current user object
 * Returns null if user is not authenticated
 */
export const getCurrentUser = () => {
  return useAppStore.getState().user;
};




