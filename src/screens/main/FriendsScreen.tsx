/**
 * Friends Screen
 * Shows list of friends and who is currently online/active at gyms
 */

import React, {useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useAppStore} from '@/store/appStore';
import {useFriendStore} from '@/store/friendStore';
import NotificationService from '@/services/notifications/NotificationService';
import EmptyState from '@/components/ui/EmptyState';
import colors from '@/theme/colors';
import {MuscleGroup} from '@/types/workout.types';
import muscleImg from '@/utils/muscleGroupImages';
import {
  listFriendsWithProfiles,
  upsertMyProfile,
} from '@/services/supabase/friendService';
import {
  PRESENCE_WINDOW_HOURS,
  fetchLatestCheckInPerUser,
  type CheckInRow,
} from '@/services/supabase/presenceService';
import {navigateToFriendProfile} from '@/navigation/rootNavigation';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingJoinRequests, setPendingJoinRequests] = useState<Set<string>>(new Set());
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);

  const openAddFriend = useCallback(() => {
    const stackNav = navigation.getParent()?.getParent?.();
    if (stackNav && typeof (stackNav as any).navigate === 'function') {
      (stackNav as any).navigate('AddFriend');
      return;
    }
    (navigation as any).navigate?.('AddFriend');
  }, [navigation]);

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

  const formatActiveTime = (time: string) => {
    return `Aktiv i ${time}`;
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
    if (!muscleGroup) return 'hele_kroppen';
    
    const lower = muscleGroup.toLowerCase();
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
    return 'hele_kroppen';
  };

  const handleRequestJoin = (friend: Friend) => {
    if (pendingJoinRequests.has(friend.id)) {
      // Cancel request
      setPendingJoinRequests(prev => {
        const newSet = new Set(prev);
        newSet.delete(friend.id);
        return newSet;
      });
    } else {
      // Send join request
      if (user) {
        NotificationService.sendJoinRequest(
          user.displayName || 'En ven',
          friend.id,
          friend.name,
          friend.gymName,
        );
        
        setPendingJoinRequests(prev => new Set(prev).add(friend.id));
      }
    }
  };

  const renderEmptyState = () => (
    <EmptyState
      icon="people-outline"
      title="Ingen venner endnu"
      message="Søg efter dit brugernavn hos hinanden og send en venneanmodning. Du kan også svare under Notifikationer."
      actionLabel="Tilføj ven"
      onAction={openAddFriend}
    />
  );

  const renderFriendItem = ({item}: {item: Friend}) => (
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
          {item.avatar ? (
            <Image source={{uri: item.avatar}} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {item.name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          {item.isOnline && <View style={styles.onlineIndicator} />}
        </View>
        <View style={styles.friendInfo}>
          <View style={styles.friendHeader}>
            <Text style={styles.friendName} numberOfLines={1}>
              {item.name}
            </Text>
            {item.isOnline && item.activeTime && (
              <Text style={styles.activeTimeInline} numberOfLines={1}>
                {formatActiveTime(item.activeTime)}
              </Text>
            )}
            {item.isOnline && item.muscleGroup && (
              <View style={styles.muscleGroupIconContainer}>
                <Image
                  source={muscleImg.getMuscleGroupImage(getMuscleGroupKey(item.muscleGroup))}
                  style={styles.muscleGroupImage}
                  resizeMode="contain"
                />
              </View>
            )}
            {item.isOnline && (
              <View style={styles.onlineBadge}>
                <View style={styles.onlineDot} />
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
          style={[
            styles.requestButton,
            pendingJoinRequests.has(item.id) && styles.requestButtonPending,
          ]}
          onPress={() => handleRequestJoin(item)}
          activeOpacity={0.7}>
          <Text
            style={[
              styles.requestButtonText,
              pendingJoinRequests.has(item.id) && styles.requestButtonTextPending,
            ]}>
            {pendingJoinRequests.has(item.id) ? 'Anmodet' : 'Deltag'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Icon name="search" size={20} color="#8E8E93" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Søg efter folk på Gymly"
          placeholderTextColor="#8E8E93"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearchQuery('')}
            style={styles.clearButton}>
            <Icon name="close-circle" size={20} color="#8E8E93" />
          </TouchableOpacity>
        )}
      </View>

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
          <TouchableOpacity
            style={styles.addFriendBanner}
            onPress={openAddFriend}
            activeOpacity={0.85}>
            <Icon name="person-add-outline" size={22} color={colors.white} />
            <Text style={styles.addFriendBannerText}>Tilføj ven</Text>
            <Icon name="chevron-forward" size={18} color={colors.white} />
          </TouchableOpacity>
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundCard,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    padding: 0,
  },
  clearButton: {
    marginLeft: 8,
    padding: 4,
  },
  addFriendBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  addFriendBannerText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
    marginLeft: 10,
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
  onlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#34C759',
    borderWidth: 2,
    borderColor: '#fff',
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
  muscleGroupIconContainer: {
    marginLeft: 4,
    marginRight: 4,
    padding: 4,
  },
  muscleGroupImage: {
    width: 20,
    height: 20,
  },
  onlineBadge: {
    marginLeft: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34C759',
  },
  activeText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  offlineText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  requestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginLeft: 8,
  },
  requestButtonPending: {
    backgroundColor: '#F0F0F0',
  },
  requestButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
    marginLeft: 4,
  },
  requestButtonTextPending: {
    color: colors.textMuted,
  },
  emptyList: {
    flexGrow: 1,
  },
  loadingEmpty: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default FriendsScreen;

