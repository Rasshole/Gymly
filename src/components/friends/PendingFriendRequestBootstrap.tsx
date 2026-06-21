import {useEffect} from 'react';
import {AppState} from 'react-native';
import {useAppStore} from '@/store/appStore';
import {usePendingFriendRequestStore} from '@/store/pendingFriendRequestStore';

/** Hent pending venneanmodninger ved login + foreground (kilde til klokke-badge). */
export function PendingFriendRequestBootstrap(): null {
  const userId = useAppStore(s => s.user?.id);
  const load = usePendingFriendRequestStore(s => s.load);
  const reset = usePendingFriendRequestStore(s => s.reset);

  useEffect(() => {
    if (!userId) {
      reset();
      return;
    }
    void load(userId);
  }, [userId, load, reset]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active') {
        void load(userId);
      }
    });
    return () => sub.remove();
  }, [userId, load]);

  return null;
}
