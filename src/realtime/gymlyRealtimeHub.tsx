/**
 * Central Supabase Realtime for den indloggede bruger: én kanal pr. session,
 * ingen duplikerede subscriptions til de samme tabeller (DM, notifikationer, venner,
 * badges, grupper, planlagte workouts, egne check_ins m.m.).
 *
 * Skærmspecifikke kanaler (fx ChatScreen planned_workout_participants, GroupDetail)
 * forbliver lokale — de har dynamiske filtre pr. skærm.
 */

import {useCallback, useEffect, useRef} from 'react';
import {AppState, AppStateStatus} from 'react-native';
import {supabase} from '@/services/supabase/supabaseClient';
import {flushPendingGroupParticipantCompletes} from '@/services/supabase/pendingGroupParticipantComplete';
import {useAppStore} from '@/store/appStore';
import {useChatStore} from '@/store/chatStore';
import {
  dmMessageFromPayload,
  fetchDmInboxItemForThread,
  fetchDmMessages,
  inboxItemToChat,
  markDmThreadMessagesDelivered,
  markDmThreadMessagesRead,
  messageFromDmRow,
  type DmMessageRow,
} from '@/services/supabase/dmService';
import {syncDmInboxToStore} from '@/services/supabase/dmInboxSync';
import {
  attachInAppNotificationsToHubChannel,
  useInAppNotificationStore,
} from '@/store/inAppNotificationStore';
import {useGymlyGroupsStore} from '@/store/gymlyGroupsStore';
import {useWorkoutPlanStore} from '@/store/workoutPlanStore';
import {loadWorkoutPlanEntriesForUser} from '@/services/supabase/plannedWorkoutService';
import {useFriendStore} from '@/store/friendStore';
import {emitProfileCentersChanged} from '@/realtime/profileCentersBridge';
import {usePendingFriendRequestStore} from '@/store/pendingFriendRequestStore';
import {useBadgeStore} from '@/store/badgeStore';
import {useSessionStore} from '@/store/sessionStore';
import {deleteMyLiveWorkoutSession} from '@/services/supabase/liveWorkoutSessionService';
import {useCheckInUIStore} from '@/store/checkInUIStore';
import {emitProfileStatsSelf} from '@/realtime/profileStatsSelfBridge';
import {
  logRealtimeCleanup,
  logRealtimeEvent,
  logRealtimeStatus,
  logRealtimeStore,
  logRealtimeSubscribed,
} from '@/realtime/realtimeDebug';
import {useRealtimeHealthStore} from '@/realtime/realtimeHealthStore';
import {isDemoContentMode} from '@/demo/demoContentGate';
import {mergeLatestServerPage} from '@/utils/dmMessageMerge';

const HUB_NAME = 'gymly_hub';

function recordHealthEvent(label: string) {
  if (__DEV__) {
    useRealtimeHealthStore.getState().recordEvent(label);
  }
}

export function GymlyRealtimeHub() {
  const userId = useAppStore(s => s.user?.id);
  const displayName = useAppStore(s => s.user?.displayName);
  const endSession = useSessionStore(s => s.endSession);
  const syncBadges = useBadgeStore(s => s.syncBadgesForUser);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const catchUpOpenDmRef = useRef<() => void>(() => {});
  const reconnectDmRef = useRef<() => void>(() => {});
  const badgeSyncLockRef = useRef(false);
  const badgeSyncPendingRef = useRef(false);

  const clearTimers = useCallback(() => {
    for (const k of Object.keys(timersRef.current)) {
      clearTimeout(timersRef.current[k]);
      delete timersRef.current[k];
    }
  }, []);

  const debounce = useCallback((key: string, ms: number, fn: () => void) => {
    const prev = timersRef.current[key];
    if (prev) {
      clearTimeout(prev);
    }
    timersRef.current[key] = setTimeout(() => {
      delete timersRef.current[key];
      fn();
    }, ms);
  }, []);

  useEffect(() => {
    if (!userId) {
      return;
    }
    void flushPendingGroupParticipantCompletes();
  }, [userId]);

  const runBadgeSync = useCallback(() => {
    if (!userId) {
      return;
    }
    if (badgeSyncLockRef.current) {
      badgeSyncPendingRef.current = true;
      return;
    }
    badgeSyncLockRef.current = true;
    const dn = (displayName || '').trim() || 'Bruger';
    syncBadges(userId, dn);
    setTimeout(() => {
      badgeSyncLockRef.current = false;
      if (badgeSyncPendingRef.current) {
        badgeSyncPendingRef.current = false;
        runBadgeSync();
      }
    }, 1200);
  }, [userId, displayName, syncBadges]);

  const refreshFriends = useCallback(() => {
    if (!userId) {
      return;
    }
    if (isDemoContentMode()) {
      useFriendStore.getState().load(userId).catch(() => {});
      return;
    }
    usePendingFriendRequestStore.getState().load(userId).catch(() => {});
    useFriendStore.getState().load(userId).catch(() => {});
    const dn = useAppStore.getState().user?.displayName?.trim() || 'Bruger';
    syncDmInboxToStore(userId, dn).catch(() => {});
  }, [userId]);

  const refreshGroupsAndPlan = useCallback(() => {
    if (!userId) {
      return;
    }
    if (isDemoContentMode()) {
      return;
    }
    useGymlyGroupsStore.getState().refresh(userId).catch(() => {});
    (async () => {
      try {
        const entries = await loadWorkoutPlanEntriesForUser(userId, true);
        useWorkoutPlanStore.getState().mergePlannedFromServer(entries);
      } catch {
        /* RLS / offline */
      }
    })().catch(() => {});
  }, [userId]);

  const onSelfCheckInPayload = useCallback(
    (payload: {new?: Record<string, unknown>}) => {
      const next = payload.new as {
        id?: string;
        ended_at?: string | null;
        is_active?: boolean;
      };
      const cur = useSessionStore.getState().activeSession;
      if (cur?.checkInId && next.id === cur.checkInId) {
        if (next.ended_at != null || next.is_active === false) {
          endSession();
          useCheckInUIStore.getState().setShowAwayZoneWarning(false);
          if (userId) {
            deleteMyLiveWorkoutSession(userId).catch(() => {});
          }
        }
      } else if (!cur && next.is_active === false) {
        useCheckInUIStore.getState().setShowAwayZoneWarning(false);
      }
    },
    [endSession, userId],
  );

  useEffect(() => {
    if (!userId) {
      clearTimers();
      useRealtimeHealthStore.getState().reset();
      return;
    }

    const channelId = `${HUB_NAME}_${userId}`;
    const bumpHealth = (table: string, ev: string) => {
      recordHealthEvent(`${table}:${ev}`);
      if (__DEV__) {
        logRealtimeEvent(channelId, table, ev);
      }
    };

    const mergeSelfProfile = async () => {
      try {
        const {data, error} = await supabase
          .from('profiles')
          .select(
            'id, username, display_name, avatar_url, featured_badge_ids, favorite_gym_ids',
          )
          .eq('id', userId)
          .maybeSingle();
        if (error || !data) {
          return;
        }
        const u = useAppStore.getState().user;
        if (!u || u.id !== userId) {
          return;
        }
        const row = data as {
          username?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          featured_badge_ids?: unknown;
          favorite_gym_ids?: unknown;
        };
        const rawFeatured = row.featured_badge_ids;
        const featuredBadgeIds = Array.isArray(rawFeatured)
          ? rawFeatured.map(x => String(x)).filter(Boolean).slice(0, 3)
          : u.featuredBadgeIds;
        const rawGyms = row.favorite_gym_ids;
        const favoriteGyms = Array.isArray(rawGyms)
          ? rawGyms.map(x => String(x)).filter(Boolean).slice(0, 3)
          : u.favoriteGyms;
        const prevGyms = (u.favoriteGyms ?? []).join(',');
        const nextGyms = (favoriteGyms ?? []).join(',');
        useAppStore.getState().setUser(
          {
            ...u,
            username: row.username?.trim() || u.username,
            displayName: (row.display_name ?? '').trim() || u.displayName,
            profileImageUrl: row.avatar_url ?? u.profileImageUrl,
            featuredBadgeIds,
            favoriteGyms,
            updatedAt: new Date(),
          },
          {skipProfileSync: true},
        );
        if (prevGyms !== nextGyms) {
          emitProfileCentersChanged(u.id);
          if (__DEV__) {
            console.log('[homeGyms] realtime.profiles_gyms', {userId: u.id, favoriteGyms});
          }
        }
        logRealtimeStore('profiles', 'merge_self');
      } catch {
        /* ignore */
      }
    };

    let ch = supabase.channel(channelId);
    ch = attachInAppNotificationsToHubChannel(ch, userId);

    ch = ch
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friend_requests',
          filter: `to_user_id=eq.${userId}`,
        },
        () => {
          bumpHealth('friend_requests', '*');
          debounce('fr_to', 120, () => {
            refreshFriends();
            logRealtimeStore('friend_requests', 'refresh');
          });
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friend_requests',
          filter: `from_user_id=eq.${userId}`,
        },
        () => {
          bumpHealth('friend_requests', '*');
          debounce('fr_from', 120, () => {
            refreshFriends();
            logRealtimeStore('friend_requests', 'refresh');
          });
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friendships',
          filter: `user_a=eq.${userId}`,
        },
        () => {
          bumpHealth('friendships', '*');
          debounce('fs_a', 120, () => {
            refreshFriends();
            emitProfileStatsSelf(userId);
            debounce('badges_fs', 200, () => runBadgeSync());
            logRealtimeStore('friendships', 'refresh');
          });
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friendships',
          filter: `user_b=eq.${userId}`,
        },
        () => {
          bumpHealth('friendships', '*');
          debounce('fs_b', 120, () => {
            refreshFriends();
            emitProfileStatsSelf(userId);
            debounce('badges_fs', 200, () => runBadgeSync());
            logRealtimeStore('friendships', 'refresh');
          });
        },
      );

    ch = ch
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_badges',
          filter: `user_id=eq.${userId}`,
        },
        payload => {
          bumpHealth('user_badges', '*');
          const n = payload.new as {
            badge_id?: string;
            progress?: number;
            unlocked_at?: string | null;
          } | null;
          if (n?.badge_id) {
            useBadgeStore.getState().applyRemoteUserBadgeRow(userId, {
              badge_id: n.badge_id,
              progress: Number(n.progress ?? 0),
              unlocked_at: n.unlocked_at ?? null,
            });
          }
          debounce('badges', 200, () => {
            runBadgeSync();
            logRealtimeStore('user_badges', 'sync');
          });
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'check_ins',
          filter: `user_id=eq.${userId}`,
        },
        payload => {
          bumpHealth('check_ins', '*');
          const ev = (payload as {eventType?: string}).eventType;
          if (ev === 'UPDATE') {
            onSelfCheckInPayload(payload as {new?: Record<string, unknown>});
          }
          debounce('check_ins_self', 100, () => {
            emitProfileStatsSelf(userId);
            debounce('badges_ci', 250, () => {
              runBadgeSync();
            });
            logRealtimeStore('check_ins', 'profile+badges');
          });
        },
      );

    ch = ch
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'gymly_groups',
        },
        () => {
          bumpHealth('gymly_groups', '*');
          debounce('groups', 140, () => {
            refreshGroupsAndPlan();
            logRealtimeStore('gymly_groups', 'refresh');
          });
        },
      )
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'gymly_group_members'},
        () => {
          bumpHealth('gymly_group_members', '*');
          debounce('gmem', 140, () => {
            refreshGroupsAndPlan();
            emitProfileStatsSelf(userId);
            logRealtimeStore('gymly_group_members', 'refresh');
          });
        },
      )
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'gymly_group_invites'},
        () => {
          bumpHealth('gymly_group_invites', '*');
          debounce('ginv', 140, () => {
            refreshGroupsAndPlan();
            logRealtimeStore('gymly_group_invites', 'refresh');
          });
        },
      )
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'gymly_group_messages'},
        () => {
          bumpHealth('gymly_group_messages', '*');
          debounce('gmsg', 140, () => {
            refreshGroupsAndPlan();
            logRealtimeStore('gymly_group_messages', 'refresh');
          });
        },
      )
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'gymly_group_member_state'},
        () => {
          bumpHealth('gymly_group_member_state', '*');
          debounce('gmstate', 140, () => {
            refreshGroupsAndPlan();
            logRealtimeStore('gymly_group_member_state', 'refresh');
          });
        },
      )
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'planned_workouts'},
        () => {
          bumpHealth('planned_workouts', '*');
          debounce('pw', 160, () => {
            refreshGroupsAndPlan();
            debounce('badges_pw', 220, () => runBadgeSync());
            logRealtimeStore('planned_workouts', 'refresh');
          });
        },
      )
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'planned_workout_participants'},
        () => {
          bumpHealth('planned_workout_participants', '*');
          debounce('pwp', 160, () => {
            refreshGroupsAndPlan();
            debounce('badges_pwp', 220, () => runBadgeSync());
            logRealtimeStore('planned_workout_participants', 'refresh');
          });
        },
      );

    ch = ch.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${userId}`,
      },
      () => {
        bumpHealth('profiles', 'UPDATE');
        debounce('prof', 400, () => {
          mergeSelfProfile().catch(() => {});
        });
      },
    );

    ch.subscribe((status, err) => {
      logRealtimeStatus(channelId, status, err?.message);
      useRealtimeHealthStore.getState().setHubMeta(channelId, status, err?.message ?? null);
      if (status === 'SUBSCRIBED') {
        logRealtimeSubscribed(channelId, HUB_NAME);
        useRealtimeHealthStore.getState().setActiveCount(1);
      }
    });

    return () => {
      logRealtimeCleanup(channelId);
      clearTimers();
      supabase.removeChannel(ch).catch(() => {});
      useRealtimeHealthStore.getState().setHubMeta(null, 'CLOSED', null);
    };
  }, [
    userId,
    displayName,
    clearTimers,
    debounce,
    refreshFriends,
    refreshGroupsAndPlan,
    runBadgeSync,
    onSelfCheckInPayload,
  ]);

  useEffect(() => {
    if (!userId) {
      catchUpOpenDmRef.current = () => {};
      reconnectDmRef.current = () => {};
      return;
    }
    let stopped = false;
    let generation = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const catchUpOpenChat = async () => {
      const chatId = useChatStore.getState().foregroundOpenChatId;
      if (!chatId) {
        return;
      }
      try {
        const page = await fetchDmMessages(chatId, {limit: 40});
        if (stopped) {
          return;
        }
        const local = useChatStore.getState().getMessagesForChat(chatId);
        const merged = mergeLatestServerPage(local, page);
        useChatStore.getState().setMessagesForChat(chatId, merged);
        const list = useChatStore.getState().getMessagesForChat(chatId);
        const last = list[list.length - 1];
        if (last && !last.id.startsWith('pending-')) {
          useChatStore.getState().updateChatLastMessage(chatId, last, {
            fromCurrentUser: last.senderId === userId,
          });
        }
      } catch {
        /* The next reconnect or focus tries again. */
      }
    };
    catchUpOpenDmRef.current = () => {
      void catchUpOpenChat();
    };

    const onInsert = async (payload: {new?: unknown}) => {
      recordHealthEvent('dm_messages:INSERT');
      const row = dmMessageFromPayload(payload.new);
      if (!row) {
        return;
      }
      const threadId = row.thread_id;
      let hasThread = useChatStore.getState().chats.some(c => c.id === threadId);
      if (!hasThread) {
        try {
          await syncDmInboxToStore(userId, (displayName || '').trim() || 'Dig');
        } catch {
          /* ignore */
        }
        hasThread = useChatStore.getState().chats.some(c => c.id === threadId);
      }
      if (!hasThread) {
        const myName = (displayName || '').trim() || 'Dig';
        const item = await fetchDmInboxItemForThread(userId, threadId);
        if (item) {
          const chat = inboxItemToChat(item, userId, myName);
          useChatStore.getState().upsertChat({...chat, unreadCount: 0});
        }
      }
      const msg = messageFromDmRow(row as DmMessageRow);
      const fromMe = row.sender_id === userId;
      useChatStore.getState().mergeIncomingMessage(threadId, msg, fromMe, userId);
      if (!fromMe) {
        const openId = useChatStore.getState().foregroundOpenChatId;
        debounce(`dm_ack_${threadId}`, 180, () => {
          if (openId === threadId) {
            void markDmThreadMessagesRead(threadId);
          } else {
            void markDmThreadMessagesDelivered(threadId);
          }
        });
      }
      if (fromMe) {
        debounce('badges_dm', 280, () => {
          runBadgeSync();
        });
      }
      logRealtimeStore('dm_messages', 'merge_message');
    };

    const onUpdate = (payload: {new?: unknown}) => {
      recordHealthEvent('dm_messages:UPDATE');
      const row = dmMessageFromPayload(payload.new);
      if (!row) {
        return;
      }
      const msg = messageFromDmRow(row);
      useChatStore.getState().patchChatMessage(row.thread_id, row.id, {
        text: msg.text,
        editedAt: msg.editedAt,
        reactions: msg.reactions ?? {},
        readAt: msg.readAt,
        deliveredAt: msg.deliveredAt,
        replyToId: msg.replyToId,
      });
      const list = useChatStore.getState().getMessagesForChat(row.thread_id);
      const updated = list.find(item => item.id === row.id);
      const last = list[list.length - 1];
      if (updated && last?.id === row.id) {
        useChatStore.getState().updateChatLastMessage(row.thread_id, updated, {
          fromCurrentUser: row.sender_id === userId,
        });
      }
      logRealtimeStore('dm_messages', 'message_update');
    };

    const scheduleRetry = (gen: number) => {
      if (stopped || gen !== generation) {
        return;
      }
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void connect();
      }, 1500);
    };

    const connect = async () => {
      if (stopped) {
        return;
      }
      const gen = ++generation;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      const previous = channel;
      channel = null;
      if (previous) {
        // removeChannel is async. A same-topic channel() call would reuse the
        // leaving socket and subscribe() would no-op, so the next join never starts.
        supabase.removeChannel(previous).catch(() => {});
      }
      if (stopped || gen !== generation) {
        return;
      }
      const dmChannelId = `gymly_dm_${userId}_${gen}`;
      const next = supabase
        .channel(dmChannelId)
        .on('postgres_changes', {event: 'INSERT', schema: 'public', table: 'dm_messages'}, payload => {
          void onInsert(payload);
        })
        .on('postgres_changes', {event: 'UPDATE', schema: 'public', table: 'dm_messages'}, payload => {
          onUpdate(payload);
        });
      channel = next;
      next.subscribe((status, err) => {
        if (stopped || gen !== generation || channel !== next) {
          return;
        }
        logRealtimeStatus(dmChannelId, status, err?.message);
        if (status === 'SUBSCRIBED') {
          logRealtimeSubscribed(dmChannelId, 'gymly_dm');
          void catchUpOpenChat();
        } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          scheduleRetry(gen);
        }
      }, 20000);
    };
    reconnectDmRef.current = () => {
      void connect();
    };
    void connect();

    return () => {
      stopped = true;
      generation += 1;
      catchUpOpenDmRef.current = () => {};
      reconnectDmRef.current = () => {};
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      if (channel) {
        supabase.removeChannel(channel).catch(() => {});
      }
    };
  }, [userId, displayName, debounce, runBadgeSync]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    const sub = AppState.addEventListener('change', next => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active') {
        catchUpOpenDmRef.current();
        reconnectDmRef.current();
        void flushPendingGroupParticipantCompletes();
        useInAppNotificationStore.getState().refresh(userId).catch(() => {});
        useGymlyGroupsStore.getState().refresh(userId).catch(() => {});
        (async () => {
          try {
            const entries = await loadWorkoutPlanEntriesForUser(userId, true);
            useWorkoutPlanStore.getState().mergePlannedFromServer(entries);
          } catch {
            /* ignore */
          }
        })().catch(() => {});
        emitProfileStatsSelf(userId);
        const dn = (displayName || '').trim() || 'Bruger';
        useBadgeStore.getState().syncBadgesForUser(userId, dn);
        refreshFriends();
        if (__DEV__) {
          console.log('[Realtime] app resume → refresh burst');
        }
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [userId, displayName, refreshFriends]);

  return null;
}
