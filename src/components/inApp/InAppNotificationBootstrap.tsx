import {useEffect} from 'react';
import {AppState} from 'react-native';
import {useAppStore} from '@/store/appStore';
import {useInAppNotificationStore} from '@/store/inAppNotificationStore';

/**
 * Fetch notifications on login + refetch unread count when app returns to foreground.
 */
export function InAppNotificationBootstrap() {
  const userId = useAppStore(s => s.user?.id);
  const refresh = useInAppNotificationStore(s => s.refresh);
  const reset = useInAppNotificationStore(s => s.reset);

  useEffect(() => {
    if (!userId) {
      reset();
      return;
    }
    void refresh(userId);
  }, [userId, refresh, reset]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active') {
        void refresh(userId);
      }
    });
    return () => sub.remove();
  }, [userId, refresh]);

  return null;
}
