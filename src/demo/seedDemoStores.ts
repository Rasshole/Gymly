/**
 * Skriver demo-payload ind i Zustand-stores og rydder op ved deaktivering.
 */

import {useFeedStore} from '@/store/feedStore';
import {useFriendStore} from '@/store/friendStore';
import {useInAppNotificationStore} from '@/store/inAppNotificationStore';
import {useChatStore} from '@/store/chatStore';
import {useWorkoutPlanStore} from '@/store/workoutPlanStore';
import {useNotificationStore} from '@/store/notificationStore';
import {loadWorkoutPlanEntriesForUser} from '@/services/supabase/plannedWorkoutService';
import {isDemoContentMode} from '@/demo/demoContentGate';
import {buildDemoPayload} from '@/demo/buildDemoPayload';
import {useDashboardStatsStore} from '@/store/dashboardStatsStore';
import {checkAndUnlockBadges} from '@/store/badgeStore';
import {useAppStore} from '@/store/appStore';

export function seedDemoStores(realUserId: string): void {
  if (!isDemoContentMode() || !realUserId) {
    return;
  }
  const d = buildDemoPayload(realUserId);

  useFriendStore.setState({
    friends: d.friends,
    friendIds: new Set(d.friends.map(f => f.id)),
    lastLoadedUserId: realUserId,
    loading: false,
    version: useFriendStore.getState().version + 1,
  });

  const unread = d.notificationRows.filter(r => !r.is_read).length;
  const frPending = d.notificationRows.filter(
    r => !r.is_read && r.type === 'friend_request',
  ).length;
  useInAppNotificationStore.setState({
    rows: d.notificationRows,
    dbUnread: unread,
    loadedUserId: realUserId,
    friendRequestOutcomes: {},
  });
  useNotificationStore.getState().setIncomingFriendRequestCount(frPending);

  useFeedStore.getState().setFeedItems(d.feedItems);

  useWorkoutPlanStore.setState({
    plannedWorkouts: d.plannedWorkouts,
  });

  useChatStore.setState(s => {
    const keepChats = s.chats.filter(c => !c.id.startsWith('demo-thread-'));
    const keepMsgs = Object.fromEntries(
      Object.entries(s.messagesByChat).filter(([k]) => !k.startsWith('demo-thread-')),
    );
    const keepPlans = Object.fromEntries(
      Object.entries(s.activePlansByChat).filter(([k]) => !k.startsWith('demo-thread-')),
    );
    return {
      chats: [...keepChats, ...d.chats],
      messagesByChat: {...keepMsgs, ...d.messagesByChat},
      activePlansByChat: {...keepPlans, ...d.activePlansByChat},
    };
  });

  const upsert = useChatStore.getState().upsertDmPresence;
  d.friends.slice(0, 22).forEach((f, i) => {
    upsert(f.id, {
      isActive: i % 2 === 0,
      trainingNow: i % 3 !== 2,
      trainingGymName: i % 2 === 0 ? 'SATS' : 'PureGym',
    });
  });

  const todayKey = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Copenhagen',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  useDashboardStatsStore.getState().setStats({
    streak: 7,
    longestStreak: 14,
    lastCheckInDateKey: todayKey,
    weeklyCheckins: 4,
    weeklyMinutes: 220,
    lastCheckInAt: new Date(Date.now() - 2 * 3600_000),
  });
  checkAndUnlockBadges(
    realUserId,
    useAppStore.getState().user?.displayName?.trim() || 'Dig',
  ).catch(() => {});
}

export async function clearDemoStoresAfterDisable(realUserId: string): Promise<void> {
  useFeedStore.getState().setFeedItems([]);
  useChatStore.setState(s => {
    const dismissed = {...s.dismissedPlanInviteBannerByChat};
    Object.keys(dismissed).forEach(k => {
      if (k.startsWith('demo-thread-')) {
        delete dismissed[k];
      }
    });
    return {
      chats: s.chats.filter(c => !c.id.startsWith('demo-thread-')),
      messagesByChat: Object.fromEntries(
        Object.entries(s.messagesByChat).filter(([k]) => !k.startsWith('demo-thread-')),
      ),
      activePlansByChat: Object.fromEntries(
        Object.entries(s.activePlansByChat).filter(([k]) => !k.startsWith('demo-thread-')),
      ),
      dismissedPlanInviteBannerByChat: dismissed,
    };
  });
  useWorkoutPlanStore.setState(s => ({
    plannedWorkouts: s.plannedWorkouts.filter(
      p => !p.id.startsWith('demo-plan-') && !p.id.startsWith('demo-accepted-'),
    ),
  }));
  try {
    const entries = await loadWorkoutPlanEntriesForUser(realUserId, true);
    useWorkoutPlanStore.getState().mergePlannedFromServer(entries);
  } catch {
    /* offline */
  }
  await useFriendStore.getState().load(realUserId);
  await useInAppNotificationStore.getState().refresh(realUserId);
}
