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
    <TouchableOpacity style={styles.friendItem} activeOpacity={0.7}>
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
          <Text style={styles.offlineText}>Offline</Text>
        )}
      </View>
      <TouchableOpacity
        style={styles.inviteButton}
        onPress={() => {
          navigation.navigate('InviteToWorkout', {
            friendId: item.id,
            friendName: item.name,
          });
        }}
        activeOpacity={0.7}>
        <Icon name="fitness" size={18} color="#007AFF" />
        <Text style={styles.inviteButtonText}>Inviter</Text>
      </TouchableOpacity>
    </TouchableOpacity>
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
  onlineBadge: {
    marginLeft: 8,
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
    color: '#C7C7CC',
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginLeft: 8,
  },
  inviteButtonText: {
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

