/**
 * Friends Screen — launch focus: venneliste, søgning, tilføj ven, status på kort.
 * Live directory for alle brugere ligger fremtidigt i Online-fanen (FriendsNavigator) + Hjem / tjek ind.
 */

import React, {useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
  Alert,
} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useAppStore} from '@/store/appStore';
import {useFriendStore} from '@/store/friendStore';
import {useChatStore} from '@/store/chatStore';
import {getOrCreateDmThread} from '@/services/supabase/dmService';
import colors from '@/theme/colors';
import {typography} from '@/theme/designTokens';
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

const FriendsScreen = () => {
  const navigation = useNavigation<any>();
  const {user} = useAppStore();
  const loadFriendStore = useFriendStore(s => s.load);
  const getChatByParticipants = useChatStore(s => s.getChatByParticipants);
  const upsertChat = useChatStore(s => s.upsertChat);
  const [searchQuery, setSearchQuery] = useState('');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);

  const stackNavigate = useCallback((routeName: string) => {
    const stackNav = navigation.getParent()?.getParent?.();
    if (stackNav && typeof (stackNav as any).navigate === 'function') {
      (stackNav as any).navigate(routeName);
      return;
    }
    (navigation as any).navigate?.(routeName);
  }, [navigation]);

  const openAddFriend = useCallback(() => {
    stackNavigate('AddFriend');
  }, [stackNavigate]);

  const openNotifications = useCallback(() => {
    stackNavigate('Notifications');
  }, [stackNavigate]);

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
        Alert.alert('Besked', (e as Error).message);
      }
    },
    [user, getChatByParticipants, navigation, upsertChat],
  );

  useFocusEffect(
    useCallback(() => {
      if (!user) {
        setFriends([]);
        setLoadingFriends(false);
        return;
      }
      let cancelled = false;
      void (async () => {
        setLoadingFriends(true);
        try {
          await upsertMyProfile(user);
          void loadFriendStore(user.id);
          const profiles = await listFriendsWithProfiles(user.id);
          if (cancelled) {
            return;
          }
          const friendIds = profiles.map(p => p.id);
          let latestByUser = new Map<string, CheckInRow>();
          try {
            latestByUser = await fetchLatestCheckInPerUser(friendIds);
          } catch {
            latestByUser = new Map();
          }
          if (cancelled) {
            return;
          }
          const windowMs = PRESENCE_WINDOW_HOURS * 3600_000;
          const now = Date.now();
          setFriends(
            profiles.map(p => {
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
            }),
          );
        } catch {
          if (!cancelled) {
            setFriends([]);
          }
        } finally {
          if (!cancelled) {
            setLoadingFriends(false);
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [user, loadFriendStore]),
  );

  // Sort friends: online first (by check-in time, newest first), then offline (by check-out time, newest first)
  const sortedFriends = [...friends].sort((a, b) => {
    // Online friends come first
    if (a.isOnline && !b.isOnline) return -1;
    if (!a.isOnline && b.isOnline) return 1;

    // If both are online, sort by check-in time (newest first)
    if (a.isOnline && b.isOnline) {
      const aTime = a.checkInTime?.getTime() || 0;
      const bTime = b.checkInTime?.getTime() || 0;
      return bTime - aTime; // Descending (newest first)
    }

    // If both are offline, sort by check-out time (newest first)
    if (!a.isOnline && !b.isOnline) {
      const aTime = a.checkOutTime?.getTime() || 0;
      const bTime = b.checkOutTime?.getTime() || 0;
      return bTime - aTime; // Descending (newest first)
    }

    return 0;
  });

  const filteredFriends = sortedFriends.filter(friend =>
    friend.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  /** Kort “Aktiv nu” når check-in er frisk; ellers “Aktiv i X min”. */
  const formatActiveSubtitle = (activeTime: string): string => {
    const m = /^(\d+)\s*min$/.exec(String(activeTime).trim());
    if (m) {
      const mins = Number(m[1]);
      if (mins <= 12) {
        return 'Aktiv nu';
      }
    }
    return `Aktiv i ${activeTime}`;
  };

  const formatLastSeen = (checkOutTime?: Date): string => {
    if (!checkOutTime) {
      return 'Sidst online ukendt';
    }

    const now = new Date();
    const diffMs = now.getTime() - checkOutTime.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) {
      return 'Sidst online lige nu';
    } else if (diffMins < 60) {
      return `Sidst online for ${diffMins} ${diffMins === 1 ? 'minut' : 'minutter'} siden`;
    } else if (diffHours < 24) {
      return `Sidst online for ${diffHours} ${diffHours === 1 ? 'time' : 'timer'} siden`;
    } else if (diffDays < 7) {
      return `Sidst online for ${diffDays} ${diffDays === 1 ? 'dag' : 'dage'} siden`;
    } else {
      // For older dates, show the actual date
      const day = checkOutTime.getDate();
      const month = checkOutTime.toLocaleDateString('da-DK', {month: 'short'});
      return `Sidst online ${day}. ${month}`;
    }
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
        <Text style={styles.friendsEmptyTitle}>Ingen venner endnu</Text>
        <Text style={styles.friendsEmptyMessage}>
          Søg efter dit brugernavn hos hinanden og send en venneanmodning. Du kan
          også svare under Notifikationer.
        </Text>
      </View>
    </View>
  );

  const renderFriendItem = ({item}: {item: Friend}) => {
    const activeLabel =
      item.isOnline && item.activeTime ? formatActiveSubtitle(item.activeTime) : '';
    return (
    <View style={styles.friendItem}>
      <Pressable
        style={({pressed}) => [
          styles.friendInfoContainer,
          pressed && styles.friendInfoContainerPressed,
        ]}
        onPress={() => openFriendProfile(item)}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, se profil`}>
        <View style={styles.avatarContainer}>
          <UserAvatar
            name={item.name}
            imageUrl={item.avatar}
            size="lg"
            showOnlineIndicator={item.isOnline}
            isOnline={item.isOnline}
          />
        </View>
        <View style={styles.friendInfo}>
          <View style={styles.friendHeader}>
            <Text style={styles.friendName} numberOfLines={1}>
              {item.name}
            </Text>
            {activeLabel ? (
              <Text
                style={[
                  styles.activeTimeInline,
                  activeLabel === 'Aktiv nu' && styles.activeNowInline,
                ]}
                numberOfLines={1}>
                {activeLabel}
              </Text>
            ) : null}
            {item.isOnline && item.muscleGroup && (
              <View style={styles.muscleGroupIconContainer}>
                <MuscleGroupTileIcon
                  group={getMuscleGroupKey(item.muscleGroup)}
                  size={20}
                  style={styles.muscleGroupImage}
                />
              </View>
            )}
          </View>
          {item.isOnline && item.gymName && (
            <Text
              style={styles.activeText}
              numberOfLines={1}
              ellipsizeMode="tail">
              {item.gymName}
            </Text>
          )}
          {!item.isOnline && (
            <Text style={styles.offlineText} numberOfLines={1}>
              {formatLastSeen(item.checkOutTime)}
            </Text>
          )}
        </View>
      </Pressable>
      {item.isOnline && (
        <TouchableOpacity
          onPress={() => void openDmToFriend(item.id, item.name)}
          style={styles.activeFriendMessageBtn}
          hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
          accessibilityLabel="Besked"
          activeOpacity={0.75}>
          <Icon name="chatbubble-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      )}
    </View>
    );
  };

  return (
    <View style={styles.container}>
      <SocialSearchBar
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Søg efter folk på Gymly"
        style={styles.searchOuter}
      />

      {/* Friends List */}
      <FlatList
        data={filteredFriends}
        renderItem={renderFriendItem}
        keyExtractor={item => item.id}
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
              label="Tilføj ven"
              iconName="person-add-outline"
              onPress={openAddFriend}
              style={styles.addFriendBanner}
            />
            <Pressable
              onPress={openNotifications}
              style={({pressed}) => [
                styles.friendRequestsRow,
                pressed && styles.friendRequestsRowPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Åbn notifikationer for venneanmodninger">
              <Icon name="mail-unread-outline" size={20} color={colors.primary} />
              <View style={styles.friendRequestsTextCol}>
                <Text style={styles.friendRequestsTitle}>Venneanmodninger</Text>
                <Text style={styles.friendRequestsSubtitle}>
                  Accepter eller afvis under Notifikationer
                </Text>
              </View>
              <Icon name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        }
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchOuter: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 10,
  },
  listHeaderWrap: {
    marginBottom: 4,
    paddingTop: 2,
  },
  addFriendBanner: {
    marginHorizontal: 16,
    marginBottom: 10,
  },
  friendRequestsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.backgroundCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 10,
  },
  friendRequestsRowPressed: {
    opacity: 0.85,
  },
  friendRequestsTextCol: {
    flex: 1,
    minWidth: 0,
  },
  friendRequestsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  friendRequestsSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundCard,
    padding: 12,
    borderRadius: 12,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  friendInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  friendInfoContainerPressed: {
    opacity: 0.75,
  },
  separator: {
    height: 1,
    backgroundColor: '#E5E5EA',
    marginLeft: 80,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  friendInfo: {
    flex: 1,
    minWidth: 0, // Allow text to shrink
  },
  friendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  friendName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginRight: 8,
  },
  activeTimeInline: {
    fontSize: 14,
    color: '#8E8E93',
    marginRight: 8,
  },
  activeNowInline: {
    color: colors.success,
    fontWeight: '600',
  },
  muscleGroupIconContainer: {
    marginLeft: 4,
    marginRight: 4,
    padding: 4,
  },
  muscleGroupImage: {
    width: 20,
    height: 20,
  },
  activeText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  offlineText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  /** Match Home “Aktive nu” `activeNowMessageBtn` (+ trailing margin for card row). */
  activeFriendMessageBtn: {
    padding: 4,
    marginLeft: 8,
  },
  emptyList: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  friendsEmptyOuter: {
    flexGrow: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  friendsEmptyInner: {
    alignItems: 'center',
    transform: [{translateY: -40}],
  },
  friendsEmptyIconWrap: {
    marginBottom: 16,
  },
  friendsEmptyTitle: {
    ...typography.h4,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  friendsEmptyMessage: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 22,
  },
  loadingEmpty: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default FriendsScreen;

