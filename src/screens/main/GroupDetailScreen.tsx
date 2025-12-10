/**
 * Group Detail Screen
 * Shows detailed information about a specific group
 */

import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  SafeAreaView,
  Switch,
  Platform,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation, useRoute} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {useAppStore} from '@/store/appStore';

type Friend = {
  id: string;
  name: string;
  avatar?: string;
  isOnline: boolean;
};

type Group = {
  id: string;
  name: string;
  description?: string;
  biography?: string;
  image?: string;
  isPrivate: boolean;
  adminId: string;
  members: Friend[];
  totalWorkouts: number;
  totalTimeTogether: number; // in minutes
  createdAt: Date | string;
};

type GroupDetailScreenProps = {
  route: {
    params: {
      group: Group;
    };
  };
};

const GroupDetailScreen = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const route = useRoute();
  const {group: initialGroup} = (route.params as any) || {};
  const {user} = useAppStore();
  
  // Track privacy state
  const [isPrivate, setIsPrivate] = useState(initialGroup?.isPrivate || false);

  if (!initialGroup) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}>
            <Icon name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Gruppe detaljer</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Gruppe ikke fundet</Text>
        </View>
      </View>
    );
  }

  const formatTime = (minutes: number): string => {
    if (minutes === 0) {
      return '0 minutter';
    }
    
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (hours > 0 && mins > 0) {
      return `${hours} ${hours === 1 ? 'time' : 'timer'} og ${mins} ${mins === 1 ? 'minut' : 'minutter'}`;
    } else if (hours > 0) {
      return `${hours} ${hours === 1 ? 'time' : 'timer'}`;
    } else {
      return `${mins} ${mins === 1 ? 'minut' : 'minutter'}`;
    }
  };

  // Convert createdAt to Date if it's a string
  const createdAtDate = typeof initialGroup.createdAt === 'string' 
    ? new Date(initialGroup.createdAt) 
    : initialGroup.createdAt;

  // Check if current user is a member
  const isMember = user ? initialGroup.members.some(m => m.id === user.id) : false;
  
  // Check if current user is admin
  const isAdmin = user ? initialGroup.adminId === user.id : false;

  const handleEditGroup = () => {
    // Navigate to edit group screen
    const serializableGroup = {
      ...initialGroup,
      isPrivate,
      createdAt: typeof initialGroup.createdAt === 'string' ? initialGroup.createdAt : initialGroup.createdAt.toISOString(),
    };
    navigation.navigate('EditGroup', {group: serializableGroup});
  };

  const handleMemberPress = (memberId: string) => {
    // Navigate to member profile
    const member = initialGroup.members.find(m => m.id === memberId);
    if (member) {
      navigation.navigate('FriendProfile', {
        friendId: memberId,
        friendName: member.name,
        mutualFriends: 0,
        gyms: [],
      });
    }
  };

  const handleTogglePrivacy = (value: boolean) => {
    // Reverse the logic: value is the switch state (true = public/blue, false = private/grey)
    const newPrivacyState = !value;
    setIsPrivate(newPrivacyState);
    
    // TODO: Save to backend
    // For now, just show a confirmation
    Alert.alert(
      'Synlighed opdateret',
      newPrivacyState
        ? 'Gruppen er nu privat'
        : 'Gruppen er nu offentlig'
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}>
          <Icon name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Gruppe detaljer</Text>
        {isAdmin && (
          <TouchableOpacity
            onPress={handleEditGroup}
            style={styles.editButton}
            activeOpacity={0.7}>
            <Icon name="brush-outline" size={24} color="#007AFF" />
          </TouchableOpacity>
        )}
        {!isAdmin && <View style={styles.headerRight} />}
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}>
        {/* Group Header */}
        <View style={styles.groupHeader}>
          <View style={styles.groupIconContainer}>
            {initialGroup.image ? (
              <Image source={{uri: initialGroup.image}} style={styles.groupImage} />
            ) : (
              <Icon name="people" size={48} color="#007AFF" />
            )}
            {isPrivate && (
              <View style={styles.privateBadge}>
                <Icon name="lock-closed" size={16} color="#8E8E93" />
              </View>
            )}
          </View>
          <Text style={styles.groupName}>{initialGroup.name}</Text>
        </View>

        {/* Group Biography/Description */}
        {initialGroup.biography && (
          <View style={styles.descriptionSection}>
            <Text style={styles.descriptionText}>{initialGroup.biography}</Text>
          </View>
        )}
        {!initialGroup.biography && initialGroup.description && (
          <View style={styles.descriptionSection}>
            <Text style={styles.descriptionText}>{initialGroup.description}</Text>
          </View>
        )}

        {/* Privacy Toggle - Only for admin */}
        {isAdmin && (
          <View style={styles.privacySection}>
            <View style={styles.privacyInfo}>
              <Text style={styles.privacyLabel}>Gruppe synlighed</Text>
              <Text style={styles.privacySubtext}>
                {isPrivate
                  ? 'Privat - Kun medlemmer kan se gruppen'
                  : 'Offentlig - Alle kan se og søge efter gruppen'}
              </Text>
            </View>
            <Switch
              value={!isPrivate}
              onValueChange={handleTogglePrivacy}
              trackColor={{false: '#E5E5EA', true: '#007AFF'}}
              thumbColor={Platform.OS === 'ios' ? '#fff' : '#fff'}
            />
          </View>
        )}

        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Icon name="fitness" size={28} color="#007AFF" />
            <Text style={styles.statValue}>{initialGroup.totalWorkouts}</Text>
            <Text style={styles.statLabel}>
              Træning{initialGroup.totalWorkouts !== 1 ? 'er' : ''} sammen
            </Text>
          </View>
          <View style={styles.statCard}>
            <Icon name="time-outline" size={28} color="#007AFF" />
            <Text style={styles.statValue} numberOfLines={2}>
              {formatTime(initialGroup.totalTimeTogether)}
            </Text>
            <Text style={styles.statLabel}>Samlet træningstid</Text>
          </View>
        </View>

        {/* Members Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Medlemmer ({initialGroup.members.length})
          </Text>
          <View style={styles.membersList}>
            {initialGroup.members.map((member, index) => {
              const isCurrentUser = user && member.id === user.id;
              const isGroupAdmin = member.id === initialGroup.adminId;
              return (
                <TouchableOpacity
                  key={member.id}
                  style={styles.memberItem}
                  onPress={() => handleMemberPress(member.id)}
                  activeOpacity={0.7}>
                  <View style={styles.memberAvatarContainer}>
                    {member.avatar ? (
                      <Image
                        source={{uri: member.avatar}}
                        style={styles.memberAvatarImage}
                      />
                    ) : (
                      <View style={styles.memberAvatarPlaceholder}>
                        <Text style={styles.memberAvatarText}>
                          {member.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    {member.isOnline && (
                      <View style={styles.onlineIndicator} />
                    )}
                  </View>
                  <View style={styles.memberInfo}>
                    <View style={styles.memberNameRow}>
                      <Text style={styles.memberName}>
                        {member.name}
                        {isCurrentUser && (
                          <Text style={styles.currentUserLabel}> (Dig)</Text>
                        )}
                        {isGroupAdmin && (
                          <Text style={styles.adminLabel}> • Admin</Text>
                        )}
                      </Text>
                    </View>
                    {member.isOnline ? (
                      <Text style={styles.memberStatus}>Online</Text>
                    ) : (
                      <Text style={styles.memberStatusOffline}>Offline</Text>
                    )}
                  </View>
                  <Icon name="chevron-forward" size={20} color="#C7C7CC" />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Group Created Date */}
        <View style={styles.metadataSection}>
          <Icon name="calendar-outline" size={16} color="#8E8E93" />
          <Text style={styles.metadataText}>
            Oprettet {createdAtDate.toLocaleDateString('da-DK', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  headerRight: {
    width: 32,
  },
  editButton: {
    padding: 4,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  adminLabel: {
    fontSize: 14,
    fontWeight: '400',
    color: '#FF9500',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#8E8E93',
  },
  groupHeader: {
    alignItems: 'center',
    marginBottom: 24,
    paddingVertical: 24,
  },
  groupIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  groupImage: {
    width: '100%',
    height: '100%',
  },
  privateBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 12,
    padding: 4,
  },
  groupName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    textAlign: 'center',
  },
  descriptionSection: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  descriptionText: {
    fontSize: 16,
    color: '#000',
    lineHeight: 24,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
    marginTop: 8,
    marginBottom: 4,
    textAlign: 'center',
    minHeight: 44,
  },
  statLabel: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  membersList: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  memberAvatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  memberAvatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#C7C7CC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberAvatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  memberAvatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#34C759',
    borderWidth: 2,
    borderColor: '#fff',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  currentUserLabel: {
    fontSize: 14,
    fontWeight: '400',
    color: '#007AFF',
  },
  memberStatus: {
    fontSize: 14,
    color: '#34C759',
  },
  memberStatusOffline: {
    fontSize: 14,
    color: '#8E8E93',
  },
  onlineBadge: {
    marginLeft: 8,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34C759',
  },
  metadataSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  metadataText: {
    fontSize: 14,
    color: '#8E8E93',
  },
  privacySection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  privacyInfo: {
    flex: 1,
    marginRight: 16,
  },
  privacyLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  privacySubtext: {
    fontSize: 14,
    color: '#8E8E93',
  },
});

export default GroupDetailScreen;

