/**
 * Full local teardown after sign-out — stores, navigation, no placeholder user.
 */

import {navigationRef} from '@/navigation/navigationRef';
import {useAppStore} from '@/store/appStore';
import {useFriendStore} from '@/store/friendStore';
import {useInAppNotificationStore} from '@/store/inAppNotificationStore';
import {useGymlyGroupsStore} from '@/store/gymlyGroupsStore';
import {useFeedStore} from '@/store/feedStore';
import {useNotificationStore} from '@/store/notificationStore';
import {useChatStore} from '@/store/chatStore';
import {useWorkoutPlanStore} from '@/store/workoutPlanStore';
import {useSessionStore} from '@/store/sessionStore';
import {useCheckInUIStore} from '@/store/checkInUIStore';
import {useDemoModeStore} from '@/demo/demoModeStore';
import {clearDemoStoresAfterDisable} from '@/demo/seedDemoStores';

/** Hard reset to Login — user cannot navigate back into Main. */
export function resetNavigationToLogin(): void {
  if (!navigationRef.isReady()) {
    return;
  }
  navigationRef.reset({
    index: 0,
    routes: [
      {
        name: 'Auth',
        state: {routes: [{name: 'Login'}], index: 0},
      },
    ],
  });
}

/** Clears all in-memory user-bound state (no Supabase signOut). */
export function clearAllUserStores(previousUserId?: string | null): void {
  useSessionStore.getState().endSession();
  useCheckInUIStore.getState().setShowAwayZoneWarning(false);
  useFriendStore.getState().reset();
  useInAppNotificationStore.getState().reset();
  useGymlyGroupsStore.getState().reset();
  useFeedStore.getState().setFeedItems([]);
  useNotificationStore.getState().clearNotifications();
  useNotificationStore.getState().setIncomingFriendRequestCount(0);
  useChatStore.setState({
    foregroundOpenChatId: null,
    threadLastReadAt: {},
    chats: [],
    messagesByChat: {},
    activePlansByChat: {},
    dismissedPlanInviteBannerByChat: {},
    dmPresenceByUser: {},
    threadSeenAtByUser: {},
  });
  useWorkoutPlanStore.setState({
    plannedWorkouts: [],
    completedWorkouts: [],
  });

  if (__DEV__ && previousUserId) {
    void useDemoModeStore
      .getState()
      .setEnabled(false)
      .then(() => clearDemoStoresAfterDisable(previousUserId))
      .catch(() => {});
  }
}

/** Zustand auth slice + stores; optional navigation reset. */
export function clearLocalUserSession(options?: {
  navigate?: boolean;
  previousUserId?: string | null;
}): void {
  const prevId = options?.previousUserId ?? useAppStore.getState().user?.id ?? null;
  clearAllUserStores(prevId);
  useAppStore.setState({
    isAuthenticated: false,
    user: null,
    tokens: null,
  });
  if (options?.navigate !== false) {
    resetNavigationToLogin();
  }
}
