/**
 * Full local teardown after sign-out — stores, navigation, no placeholder user.
 *
 * Heavy store modules (and danishGyms → centers.json) are required lazily inside
 * clearAllUserStores so importing this file from App does not parse the gym catalog.
 */

import {navigationRef} from '@/navigation/navigationRef';
import {useAppStore} from '@/store/appStore';

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
  const {useSessionStore} = require('@/store/sessionStore') as typeof import('@/store/sessionStore');
  const {useCheckInUIStore} = require('@/store/checkInUIStore') as typeof import('@/store/checkInUIStore');
  const {useFriendStore} = require('@/store/friendStore') as typeof import('@/store/friendStore');
  const {usePendingFriendRequestStore} =
    require('@/store/pendingFriendRequestStore') as typeof import('@/store/pendingFriendRequestStore');
  const {useInAppNotificationStore} =
    require('@/store/inAppNotificationStore') as typeof import('@/store/inAppNotificationStore');
  const {useGymlyGroupsStore} =
    require('@/store/gymlyGroupsStore') as typeof import('@/store/gymlyGroupsStore');
  const {useFeedStore} = require('@/store/feedStore') as typeof import('@/store/feedStore');
  const {useNotificationStore} =
    require('@/store/notificationStore') as typeof import('@/store/notificationStore');
  const {useChatStore} = require('@/store/chatStore') as typeof import('@/store/chatStore');
  const {useWorkoutPlanStore} =
    require('@/store/workoutPlanStore') as typeof import('@/store/workoutPlanStore');
  const {useTrainingStatsStore} =
    require('@/store/trainingStatsStore') as typeof import('@/store/trainingStatsStore');
  const {useSavedShopProductsStore} =
    require('@/store/savedShopProductsStore') as typeof import('@/store/savedShopProductsStore');
  const {clearFocusRefreshThrottle} =
    require('@/utils/focusRefreshThrottle') as typeof import('@/utils/focusRefreshThrottle');

  useSessionStore.getState().endSession();
  useCheckInUIStore.getState().setShowAwayZoneWarning(false);
  useFriendStore.getState().reset();
  usePendingFriendRequestStore.getState().reset();
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
  clearFocusRefreshThrottle();
  useWorkoutPlanStore.setState({
    plannedWorkouts: [],
    completedWorkouts: [],
  });
  useTrainingStatsStore.getState().clear();
  useSavedShopProductsStore.getState().resetForLogout();

  if (__DEV__ && previousUserId) {
    const {useDemoModeStore} =
      require('@/demo/demoModeStore') as typeof import('@/demo/demoModeStore');
    const {clearDemoStoresAfterDisable} =
      require('@/demo/seedDemoStores') as typeof import('@/demo/seedDemoStores');
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
