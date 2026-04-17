/**
 * useAuth – returns current authenticated user
 * Wraps useAppStore for consistent auth API
 */

import {useAppStore} from '@/store/appStore';

export function useAuth() {
  return useAppStore(s => s.user);
}
