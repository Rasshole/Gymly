/**
 * Friends Screen — launch focus: venneliste, søgning, tilføj ven, status på kort.
 * Live directory for alle brugere ligger fremtidigt i Online-fanen (FriendsNavigator) + Hjem / tjek ind.
 */

import React, {useState, useCallback, useEffect, useRef, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Pressable,
  Alert,
  Animated,
  Platform,
} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useAppStore} from '@/store/appStore';
import {useFriendStore} from '@/store/friendStore';
import {usePendingFriendRequestStore} from '@/store/pendingFriendRequestStore';
import {useNotificationStore} from '@/store/notificationStore';
import {useChatStore} from '@/store/chatStore';
import {getOrCreateDmThread} from '@/services/supabase/dmService';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows} from '@/theme/designTokens';
import {INVITE_5_FRIENDS_ENABLED} from '@/config/launchSurfaceConfig';
import {MuscleGroup} from '@/types/workout.types';
import MuscleGroupTileIcon from '@/components/ui/MuscleGroupTileIcon';
import {
  listFriendsWithProfiles,
  upsertMyProfile,
} from '@/services/supabase/friendService';
import {UserAvatar} from '@/components/ui/UserAvatar';
import {
  PRESENCE_WINDOW_HOURS,
  fetchLatestCheckInPerUser,
  type CheckInRow,
} from '@/services/supabase/presenceService';
import {navigateToFriendProfile} from '@/navigation/rootNavigation';
import SocialSearchBar from '@/components/social/SocialSearchBar';
import SocialPrimaryButton from '@/components/social/SocialPrimaryButton';
import {isDemoContentMode} from '@/demo/demoContentGate';
import {buildDemoFriendsScreenList} from '@/demo/demoFriendsList';
import {formatWorkoutTypeDisplay} from '@/utils/muscleGroupLabels';
import {formatTrainingDurationDa} from '@/utils/socialTrainingLive';
import {useTranslation} from '@/i18n';
import {isFocusRefreshStale, markFocusRefreshed} from '@/utils/focusRefreshThrottle';

type Friend = {
  id: string;
  name: string;
  avatar?: string;
  isOnline: boolean;
  activeTime?: string; // e.g., "00:01:07"
  gymName?: string; // e.g., "Puregym Glo."
  muscleGroup?: string; // e.g., "Bryst & Triceps"
  checkInTime?: Date; // When they checked in (for sorting online friends)
  checkOutTime?: Date; // When they checked out (for sorting offline friends)
};

function mapProfilesToFriends(
  profiles: {id: string; displayName: string; avatarUrl?: string | null}[],
  latestByUser: Map<string, CheckInRow>,
): Friend[] {
  const windowMs = PRESENCE_WINDOW_HOURS * 3600_000;
  const now = Date.now();
  return profiles.map(p => {
    const row = latestByUser.get(p.id);
    if (row && now - new Date(row.created_at).getTime() <= windowMs) {
      const mins = Math.max(
        1,
        Math.floor((now - new Date(row.created_at).getTime()) / 60_000),
      );
      return {
        id: p.id,
        name: p.displayName,
        avatar: p.avatarUrl ?? undefined,
        isOnline: true,
        gymName: row.gym_name,
        activeTime: `${mins} min`,
        muscleGroup: row.workout_type ?? undefined,
        checkInTime: new Date(row.created_at),
        checkOutTime: undefined,
      };
    }
    return {
      id: p.id,
      name: p.displayName,
      avatar: p.avatarUrl ?? undefined,
      isOnline: false,
      checkOutTime: row ? new Date(row.created_at) : undefined,
      checkInTime: undefined,
    };
  });
}

const FriendsScreen = () => {
  const navigation = useNavigation<any>();
  const {t, intlLocale} = useTranslation();
  const {user} = useAppStore();
  const loadFriendStore = useFriendStore(s => s.load);
  const getChatByParticipants = useChatStore(s => s.getChatByParticipants);
  const upsertChat = useChatStore(s => s.upsertChat);
  const [searchQuery, setSearchQuery] = useState('');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [liveDurationTick, setLiveDurationTick] = useState(0);
  const friendsFetchGenRef = useRef(0);
  const userId = user?.id;

  useEffect(() => {
    const id = setInterval(() => setLiveDurationTick(n => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const stackNavigate = useCallback(
    (routeName: string) => {
      const stackNav = navigation.getParent()?.getParent?.();
      if (stackNav && typeof (stackNav as any).navigate === 'function') {
        (stackNav as any).navigate(routeName);
        return;
      }
      (navigation as any).navigate?.(routeName);
    },
    [navigation],
  );

  const openAddFriend = useCallback(() => {
    stackNavigate('AddFriend');
  }, [stackNavigate]);

  const openInviteFiveFriends = useCallback(() => {
    if (!INVITE_5_FRIENDS_ENABLED) {
      return;
    }
    stackNavigate('InviteFiveFriends');
  }, [stackNavigate]);

  const openFriendRequestsSheet = usePendingFriendRequestStore(s => s.openSheet);
  const pendingFriendRequests = useNotificationStore(
    s => s.incomingFriendRequestCount,
  );

  const openFriendProfile = useCallback(
    (item: Friend) => {
      navigateToFriendProfile(navigation, {
        friendId: item.id,
        friendName: item.name,
        mutualFriends: 0,
        gyms: item.gymName ? [item.gymName] : [],
        friendAvatarUrl: item.avatar,
      });
    },
    [navigation],
  );

  const openDmToFriend = useCallback(
    async (friendId: string, friendName: string) => {
      if (!user?.id) {
        return;
      }
      const participantIds = [user.id, friendId].sort();
      const nameById: Record<string, string> = {
        [user.id]: user.displayName || 'Dig',
        [friendId]: friendName,
      };
      const participantNames = participantIds.map(id => nameById[id] ?? 'Ven');
      const existingChat = getChatByParticipants(participantIds);
      try {
        const threadId = await getOrCreateDmThread(friendId);
        upsertChat({
          id: threadId,
          participantIds,
          participantNames,
          lastActivity: existingChat?.lastActivity ?? new Date(),
          unreadCount: existingChat?.unreadCount ?? 0,
          avatar: existingChat?.avatar,
          avatarInitials: existingChat?.avatarInitials,
        });
        navigation.navigate('Chat', {
          chatId: threadId,
          friendId,
          friendName,
          participants: [{id: friendId, name: friendName}],
        });
      } catch (e) {
        Alert.alert(t('friendProfile.messageAlertTitle'), (e as Error).message);
      }
    },
    [user, getChatByParticipants, navigation, upsertChat],
  );

  useFocusEffect(
    useCallback(() => {
      setLiveDurationTick(n => n + 1);
      if (!userId) {
        setFriends([]);
        setLoadingFriends(false);
        return;
      }

      const fetchGen = ++friendsFetchGenRef.current;
      const cachedStore = useFriendStore.getState();
      if (cachedStore.lastLoadedUserId === userId && cachedStore.friends.length > 0) {
        setFriends(mapProfilesToFriends(cachedStore.friends, new Map()));
        setLoadingFriends(false);
      } else {
        setLoadingFriends(true);
      }

      void (async () => {
        try {
          const currentUser = useAppStore.getState().user;
          if (currentUser) {
            void upsertMyProfile(currentUser).catch(() => {});
          }
          void loadFriendStore(userId);

          const friendsKey = `friends:list:${userId}`;
          const skipNetwork =
            !isFocusRefreshStale(friendsKey, 45_000) &&
            useFriendStore.getState().lastLoadedUserId === userId &&
            useFriendStore.getState().friends.length > 0;

          if (isDemoContentMode()) {
            if (fetchGen !== friendsFetchGenRef.current) {
              return;
            }
            setFriends(buildDemoFriendsScreenList(userId) as Friend[]);
            return;
          }

          if (skipNetwork) {
            return;
          }

          const profiles = await listFriendsWithProfiles(userId);
          if (fetchGen !== friendsFetchGenRef.current) {
            return;
          }

          const friendIds = profiles.map(p => p.id);
          let latestByUser = new Map<string, CheckInRow>();
          try {
            latestByUser = await fetchLatestCheckInPerUser(friendIds);
          } catch {
            latestByUser = new Map();
          }
          if (fetchGen !== friendsFetchGenRef.current) {
            return;
          }

          setFriends(mapProfilesToFriends(profiles, latestByUser));
          markFocusRefreshed(`friends:list:${userId}`);
        } catch {
          if (fetchGen === friendsFetchGenRef.current) {
            setFriends([]);
          }
        } finally {
          if (fetchGen === friendsFetchGenRef.current) {
            setLoadingFriends(false);
          }
        }
      })();
    }, [userId, loadFriendStore]),
  );

  // Sort friends: online first (by check-in time, newest first), then offline (by check-out time, newest first)
  const sortedFriends = useMemo(
    () =>
      [...friends].sort((a, b) => {
        if (a.isOnline && !b.isOnline) {
          return -1;
        }
        if (!a.isOnline && b.isOnline) {
          return 1;
        }
        if (a.isOnline && b.isOnline) {
          const aTime = a.checkInTime?.getTime() || 0;
          const bTime = b.checkInTime?.getTime() || 0;
          return bTime - aTime;
        }
        if (!a.isOnline && !b.isOnline) {
          const aTime = a.checkOutTime?.getTime() || 0;
          const bTime = b.checkOutTime?.getTime() || 0;
          return bTime - aTime;
        }
        return 0;
      }),
    [friends],
  );

  const filteredFriends = useMemo(
    () =>
      sortedFriends.filter(friend =>
        friend.name.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [sortedFriends, searchQuery],
  );

  /** Kort “Aktiv nu” når check-in er frisk; ellers “Aktiv i X min”. */
  const formatActiveSubtitle = (activeTime: string): string => {
    const m = /^(\d+)\s*min$/.exec(String(activeTime).trim());
    if (m) {
      const mins = Number(m[1]);
      if (mins <= 12) {
        return t('friendsScreen.activeNow');
      }
    }
    return t('friendsScreen.activeFor', {time: activeTime});
  };

  const formatLastSeen = (checkOutTime?: Date): string => {
    if (!checkOutTime) {
      return t('friendsScreen.lastSeenUnknown');
    }

    const now = new Date();
    const diffMs = now.getTime() - checkOutTime.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) {
      return t('friendsScreen.lastSeenJustNow');
    }
    if (diffMins < 60) {
      return t('friendsScreen.lastSeenMinutes', {count: String(diffMins)});
    }
    if (diffHours < 24) {
      return t('friendsScreen.lastSeenHours', {count: String(diffHours)});
    }
    if (diffDays < 7) {
      return t('friendsScreen.lastSeenDays', {count: String(diffDays)});
    }
    const day = checkOutTime.getDate();
    const month = checkOutTime.toLocaleDateString(intlLocale, {month: 'short'});
    return t('friendsScreen.lastSeenDate', {date: `${day}. ${month}`});
  };

  // Get muscle group key based on muscle group name
  const getMuscleGroupKey = (muscleGroup?: string): MuscleGroup => {
    if (!muscleGroup) return 'cardio';

    const lower = muscleGroup.toLowerCase();
    if (
      lower.includes('cardio') ||
      lower.includes('hele kropp') ||
      lower.includes('hele_kroppen')
    ) {
      return 'cardio';
    }
    if (lower.includes('bryst') || lower.includes('chest')) {
      return 'bryst';
    } else if (lower.includes('triceps')) {
      return 'triceps';
    } else if (lower.includes('biceps')) {
      return 'biceps';
    } else if (lower.includes('ben') || lower.includes('legs')) {
      return 'ben';
    } else if (lower.includes('ryg') || lower.includes('back')) {
      return 'ryg';
    } else if (lower.includes('skulder') || lower.includes('shoulder')) {
      return 'skulder';
    } else if (lower.includes('abs') || lower.includes('mave')) {
      return 'mave';
    } else if (lower.includes('reformer')) {
      return 'reformer';
    } else if (lower.includes('pilates')) {
      return 'pilates';
    }
    return 'cardio';
  };

  const renderEmptyState = () => (
    <View style={styles.friendsEmptyOuter}>
      <View style={styles.friendsEmptyInner}>
        <View style={styles.friendsEmptyIconWrap}>
          <Icon name="people-outline" size={52} color={colors.textMuted} />
        </View>
        <Text style={styles.friendsEmptyTitle}>{t('friendsScreen.emptyTitle')}</Text>
        <Text style={styles.friendsEmptyMessage}>{t('friendsScreen.emptyMessage')}</Text>
      </View>
    </View>
  );

  const renderFriendItem = ({item}: {item: Friend}) => (
    <FriendListRow
      item={item}
      formatActiveSubtitle={formatActiveSubtitle}
      formatLastSeen={formatLastSeen}
      formatTrainingDurationDa={formatTrainingDurationDa}
      formatWorkoutTypeDisplay={formatWorkoutTypeDisplay}
      getMuscleGroupKey={getMuscleGroupKey}
      onOpenProfile={() => openFriendProfile(item)}
      onMessage={() => void openDmToFriend(item.id, item.name)}
    />
  );

  return (
    <View style={styles.container}>
      <SocialSearchBar
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder={t('friendsScreen.searchPlaceholder')}
        style={styles.searchOuter}
      />

      {/* Friends List */}
      <FlatList
        data={filteredFriends}
        extraData={liveDurationTick}
        renderItem={renderFriendItem}
        keyExtractor={item => item.id}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        contentContainerStyle={
          filteredFriends.length === 0 ? styles.emptyList : styles.list
        }
        ListEmptyComponent={
          loadingFriends ? (
            <View style={styles.loadingEmpty}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            renderEmptyState()
          )
        }
        ListHeaderComponent={
          <View style={styles.listHeaderWrap}>
            <SocialPrimaryButton
              label={t('friendsScreen.addFriend')}
              iconName="person-add-outline"
              onPress={openAddFriend}
              variant="premium"
              style={styles.addFriendBanner}
            />
            {INVITE_5_FRIENDS_ENABLED ? (
              <SocialPrimaryButton
                label={t('inviteFive.friendsEntry')}
                iconName="gift-outline"
                onPress={openInviteFiveFriends}
                variant="flat"
                style={styles.inviteFriendsBanner}
              />
            ) : null}
            {pendingFriendRequests > 0 ? (
              <FriendRequestsCard onPress={openFriendRequestsSheet} />
            ) : null}
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

type FriendListRowProps = {
  item: Friend;
  formatActiveSubtitle: (activeTime: string) => string;
  formatLastSeen: (checkOutTime?: Date) => string;
  formatTrainingDurationDa: (checkInTime: Date) => string;
  formatWorkoutTypeDisplay: (encoded: string) => string;
  getMuscleGroupKey: (muscleGroup?: string) => MuscleGroup;
  onOpenProfile: () => void;
  onMessage: () => void;
};

const FriendListRow = React.memo(({
  item,
  formatActiveSubtitle,
  formatLastSeen,
  formatTrainingDurationDa,
  formatWorkoutTypeDisplay,
  getMuscleGroupKey,
  onOpenProfile,
  onMessage,
}: FriendListRowProps) => {
  const {t} = useTranslation();
  const scale = useRef(new Animated.Value(1)).current;
  const activeLabel =
    item.isOnline && item.activeTime ? formatActiveSubtitle(item.activeTime) : '';

  let trainingLiveLine: string | null = null;
  if (item.isOnline) {
    if (item.checkInTime) {
      trainingLiveLine = formatTrainingDurationDa(item.checkInTime);
    } else if (item.activeTime) {
      const mm = /^(\d+)\s*min$/.exec(String(item.activeTime).trim());
      trainingLiveLine = mm ? `${mm[1]} min i gang` : `${item.activeTime} i gang`;
    }
  }

  const muscleLabel =
    item.muscleGroup && item.muscleGroup.trim().length > 0
      ? formatWorkoutTypeDisplay(item.muscleGroup)
      : '';
  const gymMuscleLine = [item.gymName, muscleLabel].filter(Boolean).join(' · ');

  const pressIn = () => {
    Animated.spring(scale, {
      toValue: 0.985,
      friction: 9,
      tension: 280,
      useNativeDriver: true,
    }).start();
  };

  const pressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 5,
      tension: 140,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View
      style={[
        rowStyles.card,
        item.isOnline && rowStyles.cardOnline,
        {transform: [{scale}]},
      ]}>
      <Pressable
        onPress={onOpenProfile}
        onPressIn={pressIn}
        onPressOut={pressOut}
        style={rowStyles.profileTap}
        accessibilityRole="button"
        accessibilityLabel={t('chat.openProfile', {name: item.name})}>
        <View style={rowStyles.avatarWrapper}>
          <View style={[rowStyles.avatarRing, item.isOnline && rowStyles.avatarRingOnline]}>
            <UserAvatar
              name={item.name}
              imageUrl={item.avatar}
              size="lg"
              showOnlineIndicator={false}
              isOnline={item.isOnline}
            />
            <View style={rowStyles.avatarSheen} pointerEvents="none" />
          </View>
          {item.isOnline ? <View style={rowStyles.activeDot} /> : null}
        </View>

        <View style={rowStyles.content}>
          <View style={rowStyles.nameRow}>
            <Text style={rowStyles.name} numberOfLines={1}>
              {item.name}
            </Text>
            {activeLabel ? (
              <Text
                style={[
                  rowStyles.activePill,
                  activeLabel === 'Aktiv nu' && rowStyles.activePillNow,
                ]}
                numberOfLines={1}>
                {activeLabel}
              </Text>
            ) : null}
            {item.isOnline && item.muscleGroup ? (
              <View style={rowStyles.muscleIcon}>
                <MuscleGroupTileIcon
                  group={getMuscleGroupKey(item.muscleGroup)}
                  size={18}
                  style={rowStyles.muscleImage}
                />
              </View>
            ) : null}
          </View>
          {item.isOnline && gymMuscleLine ? (
            <Text style={rowStyles.gymLine} numberOfLines={1}>
              {gymMuscleLine}
            </Text>
          ) : null}
          {item.isOnline && trainingLiveLine ? (
            <Text style={rowStyles.liveLine} numberOfLines={1}>
              {trainingLiveLine}
            </Text>
          ) : null}
          {!item.isOnline ? (
            <Text style={rowStyles.offlineLine} numberOfLines={1}>
              {formatLastSeen(item.checkOutTime)}
            </Text>
          ) : null}
        </View>
      </Pressable>

      {item.isOnline ? (
        <Pressable
          onPress={onMessage}
          style={({pressed}) => [
            rowStyles.messageBtn,
            pressed && rowStyles.messageBtnPressed,
          ]}
          hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
          accessibilityLabel={t('a11y.message')}>
          <Icon name="chatbubble" size={20} color={colors.primary} />
        </Pressable>
      ) : (
        <Icon name="chevron-forward" size={18} color={colors.textMuted} />
      )}
    </Animated.View>
  );
});

const FriendRequestsCard = ({onPress}: {onPress: () => void}) => {
  const {t} = useTranslation();
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    Animated.spring(scale, {
      toValue: 0.985,
      friction: 9,
      tension: 280,
      useNativeDriver: true,
    }).start();
  };

  const pressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 5,
      tension: 140,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      accessibilityRole="button"
      accessibilityLabel={t('a11y.openFriendRequestNotifications')}>
      <Animated.View style={[rowStyles.requestsCard, {transform: [{scale}]}]}>
        <View style={rowStyles.requestsIconWrap}>
          <Icon name="mail-unread" size={20} color={colors.primary} />
        </View>
        <View style={rowStyles.requestsTextCol}>
          <Text style={rowStyles.requestsTitle}>
            {t('messages.friendRequestsTitle')}
          </Text>
          <Text style={rowStyles.requestsSubtitle}>
            {t('messages.friendRequestsSubtitle')}
          </Text>
        </View>
        <View style={rowStyles.chevronWrap}>
          <Icon name="chevron-forward" size={16} color={colors.textMuted} />
        </View>
      </Animated.View>
    </Pressable>
  );
};

const rowStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border + 'CC',
    marginBottom: spacing.sm,
    ...shadows.sm,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: {width: 0, height: 3},
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
      android: {elevation: 2},
    }),
  },
  cardOnline: {
    backgroundColor: colors.primary + '06',
    borderColor: colors.primary + '28',
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: {elevation: 3},
    }),
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: spacing.md,
  },
  avatarRing: {
    borderRadius: radius.full,
    padding: 2,
    overflow: 'hidden',
    backgroundColor: colors.primaryLight,
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.16,
        shadowRadius: 6,
      },
      android: {elevation: 2},
    }),
  },
  avatarRingOnline: {
    backgroundColor: colors.primary,
  },
  avatarSheen: {
    position: 'absolute',
    top: 4,
    left: 8,
    right: 8,
    height: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  activeDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.backgroundCard,
  },
  profileTap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  content: {
    flex: 1,
    minWidth: 0,
    marginRight: spacing.xs,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 2,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.25,
    marginRight: spacing.sm,
    flexShrink: 1,
  },
  activePill: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
    marginRight: spacing.xs,
  },
  activePillNow: {
    color: colors.success,
  },
  muscleIcon: {
    padding: 2,
  },
  muscleImage: {
    width: 18,
    height: 18,
  },
  gymLine: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '600',
    marginTop: 1,
    lineHeight: 19,
  },
  liveLine: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 2,
    lineHeight: 17,
  },
  offlineLine: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 18,
  },
  messageBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary + '12',
    borderWidth: 1,
    borderColor: colors.primary + '28',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      android: {elevation: 2},
    }),
  },
  messageBtnPressed: {
    opacity: 0.82,
    transform: [{scale: 0.96}],
  },
  requestsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.primary + '22',
    gap: spacing.md,
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.1,
        shadowRadius: 10,
      },
      android: {elevation: 2},
    }),
  },
  requestsIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary + '14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestsTextCol: {
    flex: 1,
    minWidth: 0,
  },
  requestsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.2,
  },
  requestsSubtitle: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 3,
    lineHeight: 18,
  },
  chevronWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchOuter: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  listHeaderWrap: {
    marginBottom: spacing.xs,
    paddingTop: spacing.xs,
  },
  addFriendBanner: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  inviteFriendsBanner: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.xs,
  },
  emptyList: {
    flexGrow: 1,
    paddingBottom: spacing.xl,
  },
  friendsEmptyOuter: {
    flexGrow: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  friendsEmptyInner: {
    alignItems: 'center',
    transform: [{translateY: -40}],
  },
  friendsEmptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.backgroundCard,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  friendsEmptyTitle: {
    ...typography.h4,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  friendsEmptyMessage: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 22,
  },
  loadingEmpty: {
    paddingVertical: spacing.xxxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default FriendsScreen;

