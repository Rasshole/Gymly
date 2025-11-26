/**
 * Friends Screen
 * Shows list of friends and who is currently online/active at gyms
 */

import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';

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

// Mock friends for testing
const mockFriends: Friend[] = [
  {
    id: '1',
    name: 'Jeff',
    isOnline: true,
    activeTime: '00:15:30',
    gymName: 'PureGym',
    muscleGroup: 'Bryst & Triceps',
    checkInTime: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
  },
  {
    id: '2',
    name: 'Marie',
    isOnline: false,
    checkOutTime: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
  },
  {
    id: '3',
    name: 'Lars',
    isOnline: true,
    activeTime: '00:05:12',
    gymName: 'SATS',
    muscleGroup: 'Ben & Ryg',
    checkInTime: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago (newer check-in)
  },
  {
    id: '4',
    name: 'Sofia',
    isOnline: false,
    checkOutTime: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago (newer check-out)
  },
];

const FriendsScreen = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const [searchQuery, setSearchQuery] = useState('');

  // Use mock friends for now
  const friends: Friend[] = mockFriends;

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

  // Get muscle group icon based on muscle group name
  const getMuscleGroupIcon = (muscleGroup?: string): string => {
    if (!muscleGroup) return 'fitness-outline';
    
    const lower = muscleGroup.toLowerCase();
    if (lower.includes('bryst') || lower.includes('chest')) {
      return 'body-outline';
    } else if (lower.includes('triceps')) {
      return 'fitness-outline';
    } else if (lower.includes('biceps')) {
      return 'fitness-outline';
    } else if (lower.includes('ben') || lower.includes('legs')) {
      return 'walk-outline';
    } else if (lower.includes('ryg') || lower.includes('back')) {
      return 'body-outline';
    } else if (lower.includes('skulder') || lower.includes('shoulder')) {
      return 'body-outline';
    } else if (lower.includes('abs') || lower.includes('mave')) {
      return 'body-outline';
    }
    return 'fitness-outline';
  };

  const handleRequestJoin = (friend: Friend) => {
    Alert.alert(
      'Spørg om deltagelse',
      `Vil du spørge ${friend.name} om du må deltage i deres træning?`,
      [
        {
          text: 'Annuller',
          style: 'cancel',
        },
        {
          text: 'Spørg om deltagelse',
          onPress: () => {
            // TODO: Implement actual API call to send join request
            Alert.alert(
              'Anmodning sendt',
              `Du har spurgt ${friend.name} om du må deltage i deres træning`,
            );
          },
        },
      ],
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <Icon name="people-outline" size={80} color="#C7C7CC" />
      </View>
      <Text style={styles.emptyTitle}>Ingen venner endnu</Text>
      <Text style={styles.emptyText}>
        Når du tilføjer venner, vil de vises her med deres online status
      </Text>
    </View>
  );

  const renderFriendItem = ({item}: {item: Friend}) => (
    <View style={styles.friendItem}>
      <TouchableOpacity
        style={styles.friendInfoContainer}
        onPress={() => {
          if (item.isOnline) {
            navigation.navigate('FriendWorkoutDetail', {
              friendId: item.id,
              friendName: item.name,
              activeTime: item.activeTime,
              gymName: item.gymName,
              muscleGroup: item.muscleGroup,
            });
          }
        }}
        activeOpacity={item.isOnline ? 0.7 : 1}
        disabled={!item.isOnline}>
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
            {item.isOnline && item.muscleGroup && (
              <View style={styles.muscleGroupIconContainer}>
                <Icon
                  name={getMuscleGroupIcon(item.muscleGroup)}
                  size={18}
                  color="#007AFF"
                />
              </View>
            )}
            {item.isOnline && (
              <View style={styles.onlineBadge}>
                <View style={styles.onlineDot} />
              </View>
            )}
          </View>
          {item.isOnline && item.activeTime && (
            <Text style={styles.activeText} numberOfLines={1}>
              {formatActiveTime(item.activeTime)}
              {item.gymName && ` (${item.gymName})`}
            </Text>
          )}
          {!item.isOnline && (
            <Text style={styles.offlineText} numberOfLines={1}>
              {formatLastSeen(item.checkOutTime)}
            </Text>
          )}
        </View>
      </TouchableOpacity>
      {item.isOnline && (
        <TouchableOpacity
          style={styles.requestButton}
          onPress={() => handleRequestJoin(item)}
          activeOpacity={0.7}>
          <Text style={styles.requestButtonText}>Deltag</Text>
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
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    shadowColor: '#000',
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
    color: '#000',
    padding: 0,
  },
  clearButton: {
    marginLeft: 8,
    padding: 4,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 12,
    shadowColor: '#000',
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
    backgroundColor: '#C7C7CC',
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
  },
  friendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  friendName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    flex: 1,
  },
  muscleGroupIconContainer: {
    marginLeft: 8,
    marginRight: 4,
    padding: 4,
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
    color: '#8E8E93',
  },
  offlineText: {
    fontSize: 14,
    color: '#8E8E93',
  },
  requestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginLeft: 8,
  },
  requestButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
    marginLeft: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyList: {
    flexGrow: 1,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 24,
  },
});

export default FriendsScreen;

