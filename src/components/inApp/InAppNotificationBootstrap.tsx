import {useEffect} from 'react';
import {useAppStore} from '@/store/appStore';
import {useInAppNotificationStore} from '@/store/inAppNotificationStore';

/**
 * Én enkelt sted: fetch + Realtime for public.notifications
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

  return null;
}
