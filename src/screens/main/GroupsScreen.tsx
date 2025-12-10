/**
 * Groups Screen
 * Create and manage groups with friends
 */

import React, {useState, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  SectionList,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ScrollView,
  Switch,
  Platform,
  Linking,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
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
  adminId: string; // User ID of the group admin
  members: Friend[];
  totalWorkouts: number;
  totalTimeTogether: number; // in minutes
  createdAt: Date;
};

// Mock friends for testing
const mockFriends: Friend[] = [
  {
    id: '1',
    name: 'Jeff',
    isOnline: true,
  },
  {
    id: '2',
    name: 'Marie',
    isOnline: false,
  },
  {
    id: '3',
    name: 'Lars',
    isOnline: true,
  },
  {
    id: '4',
    name: 'Sofia',
    isOnline: false,
  },
  {
    id: '5',
    name: 'Jens',
    isOnline: true,
  },
  {
    id: '6',
    name: 'Mette',
    isOnline: true,
  },
  {
    id: '7',
    name: 'Thomas',
    isOnline: false,
  },
  {
    id: '8',
    name: 'Anne',
    isOnline: true,
  },
  {
    id: '9',
    name: 'Peter',
    isOnline: false,
  },
  {
    id: '10',
    name: 'Emma',
    isOnline: true,
  },
];

// Mock groups
const mockGroups: Group[] = [
  {
    id: '1',
    name: 'Weekend Warriors',
    description: 'Vi træner sammen hver weekend og holder hinanden motiveret!',
    biography: 'En gruppe for dem der elsker weekend træning. Vi holder hinanden motiveret og deler tips.',
    isPrivate: false,
    adminId: '1', // Jeff is admin
    members: [
      mockFriends[0], // Jeff
      mockFriends[2], // Lars
      mockFriends[1], // Marie
      mockFriends[3], // Sofia
      mockFriends[4], // Jens
      mockFriends[5], // Mette
      mockFriends[6], // Thomas
    ],
    totalWorkouts: 12,
    totalTimeTogether: 1440, // 24 hours in minutes
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  },
  {
    id: '2',
    name: 'Morgenmotionister',
    description: 'Træner hver morgen før arbejde. Kom og vær med!',
    biography: 'Tidlig opstigning og træning før dagens første møde. Perfekt til dem der har travlt.',
    isPrivate: true,
    adminId: '5', // Jens is admin
    members: [mockFriends[4], mockFriends[5], mockFriends[7]],
    totalWorkouts: 25,
    totalTimeTogether: 3120, // 52 hours in minutes
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  },
  {
    id: '3',
    name: 'Kraftstation',
    description: 'Fokus på styrketræning og progression',
    biography: 'Vi fokuserer på styrketræning, progression og hjælper hinanden med teknik.',
    isPrivate: false,
    adminId: '2', // Marie is admin
    members: [mockFriends[1], mockFriends[6], mockFriends[9]],
    totalWorkouts: 8,
    totalTimeTogether: 960, // 16 hours in minutes
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
  },
  {
    id: '4',
    name: 'Crosstraining Crew',
    description: 'Blandet træning med fokus på funktionalitet',
    biography: 'Blandet træning for at blive stærkere og mere funktionel i hverdagen.',
    isPrivate: false,
    adminId: '4', // Sofia is admin
    members: [mockFriends[3], mockFriends[8], mockFriends[9]],
    totalWorkouts: 15,
    totalTimeTogether: 1800, // 30 hours in minutes
    createdAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000),
  },
  {
    id: '5',
    name: 'Løbeklubben',
    description: 'Løbetræning og maratonforberedelse',
    biography: 'For løbere af alle niveauer. Vi træner til maraton og korte løb.',
    isPrivate: false,
    adminId: '5', // Jens is admin
    members: [mockFriends[4], mockFriends[7]],
    totalWorkouts: 30,
    totalTimeTogether: 3600, // 60 hours in minutes
    createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
  },
];

const GroupsScreen = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const {user} = useAppStore();
  const [groups, setGroups] = useState<Group[]>(mockGroups);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupBiography, setGroupBiography] = useState('');
  const [groupImage, setGroupImage] = useState<string | null>(null);
  // Start with public (false = public, true = private)
  const [isPrivate, setIsPrivate] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const friends: Friend[] = mockFriends;

  // Filter and categorize groups
  const filteredAndCategorizedGroups = useMemo(() => {
    const filtered = groups.filter(group =>
      group.name.toLowerCase().includes(searchQuery.toLowerCase()),
    );

    const myGroups: Group[] = [];
    const otherGroups: Group[] = [];

    filtered.forEach(group => {
      // Check if current user is a member of the group
      const isMember = user
        ? group.members.some(member => member.id === user.id)
        : false;

      if (isMember) {
        myGroups.push(group);
      } else {
        otherGroups.push(group);
      }
    });

    const sections: Array<{title: string; data: Group[]}> = [];

    if (myGroups.length > 0) {
      sections.push({title: 'mine grupper', data: myGroups});
    }

    if (otherGroups.length > 0) {
      sections.push({title: 'andre grupper', data: otherGroups});
    }

    return sections;
  }, [groups, searchQuery, user]);

  const handleToggleFriend = (friendId: string) => {
    setSelectedFriends(prev =>
      prev.includes(friendId)
        ? prev.filter(id => id !== friendId)
        : [...prev, friendId],
    );
  };

  const handleCreateGroup = () => {
    if (!groupName.trim()) {
      Alert.alert('Mangler navn', 'Indtast venligst et gruppenavn');
      return;
    }

    if (selectedFriends.length === 0) {
      Alert.alert('Ingen venner valgt', 'Vælg mindst én ven til gruppen');
      return;
    }

    // Add current user as a member
    const selectedFriendMembers = friends.filter(f => selectedFriends.includes(f.id));
    const currentUserAsFriend: Friend | null = user
      ? {
          id: user.id,
          name: user.displayName,
          avatar: user.profileImageUrl,
          isOnline: true,
        }
      : null;

    const newGroup: Group = {
      id: `group_${Date.now()}`,
      name: groupName.trim(),
      description: '', // Keep for backward compatibility
      biography: groupBiography.trim() || undefined,
      image: groupImage || undefined,
      isPrivate: isPrivate,
      adminId: user?.id || '', // Current user is admin
      members: currentUserAsFriend
        ? [currentUserAsFriend, ...selectedFriendMembers]
        : selectedFriendMembers,
      totalWorkouts: 0,
      totalTimeTogether: 0,
      createdAt: new Date(),
    };

    setGroups([newGroup, ...groups]);
    setGroupName('');
    setGroupBiography('');
    setGroupImage(null);
    setIsPrivate(false);
    setSelectedFriends([]);
    setFriendSearchQuery('');
    setShowCreateGroup(false);
    Alert.alert('Gruppe oprettet', `Gruppen "${newGroup.name}" er blevet oprettet`);
  };

  const handleOpenCommunity = async () => {
    // Show alert since website is not ready yet
    Alert.alert(
      'Community kommer snart',
      'Vores Community forum med åbent forum kommer snart. Hold øje med opdateringer!',
    );
    
    // When website is ready, uncomment below and use actual URL:
    // const url = 'https://gymly.dk/forum';
    // try {
    //   const supported = await Linking.canOpenURL(url);
    //   if (supported) {
    //     await Linking.openURL(url);
    //   } else {
    //     Alert.alert('Fejl', 'Kunne ikke åbne hjemmesiden');
    //   }
    // } catch (error) {
    //   Alert.alert('Fejl', 'Kunne ikke åbne hjemmesiden');
    // }
  };

  const renderGroupItem = ({item}: {item: Group}) => {
    // Check if any member is online
    const hasOnlineMembers = item.members.some(member => member.isOnline);
    const onlineCount = item.members.filter(member => member.isOnline).length;

    return (
      <TouchableOpacity
        style={styles.groupItem}
        activeOpacity={0.7}
        onPress={() => {
          // Convert Date to ISO string for navigation serialization
          const serializableGroup = {
            ...item,
            createdAt: item.createdAt.toISOString(),
          };
          navigation.navigate('GroupDetail', {group: serializableGroup});
        }}>
        <View style={styles.groupIconContainer}>
          {item.image ? (
            <Image source={{uri: item.image}} style={styles.groupIconImage} />
          ) : (
            <Icon name="people" size={32} color="#007AFF" />
          )}
          {hasOnlineMembers && (
            <View style={styles.onlineGroupIndicator} />
          )}
          {item.isPrivate && (
            <View style={styles.privateGroupBadge}>
              <Icon name="lock-closed" size={12} color="#8E8E93" />
            </View>
          )}
        </View>
        <View style={styles.groupInfo}>
          <View style={styles.groupNameRow}>
            <Text style={styles.groupName} numberOfLines={1}>{item.name}</Text>
            {hasOnlineMembers && (
              <View style={styles.onlineBadge}>
                <View style={styles.onlineDot} />
                <Text style={styles.onlineText}>
                  {onlineCount} online
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.groupMembers}>
            {item.members.length} medlem{item.members.length !== 1 ? 'mer' : ''}
          </Text>
          <View style={styles.memberAvatars}>
            {item.members.slice(0, 3).map((member, index) => (
              <View
                key={member.id}
                style={[
                  styles.memberAvatar,
                  {marginLeft: index > 0 ? -8 : 0},
                ]}>
                {member.avatar ? (
                  <Image source={{uri: member.avatar}} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarText}>
                    {member.name.charAt(0).toUpperCase()}
                  </Text>
                )}
                {member.isOnline && (
                  <View style={styles.memberOnlineIndicator} />
                )}
              </View>
            ))}
            {item.members.length > 3 && (
              <View style={[styles.memberAvatar, styles.moreMembers]}>
                <Text style={styles.moreMembersText}>+{item.members.length - 3}</Text>
              </View>
            )}
          </View>
        </View>
        <Icon name="chevron-forward" size={20} color="#C7C7CC" />
      </TouchableOpacity>
    );
  };

  // Filter friends based on search query
  const filteredFriends = useMemo(() => {
    if (!friendSearchQuery.trim()) return friends;
    return friends.filter(friend =>
      friend.name.toLowerCase().includes(friendSearchQuery.toLowerCase()),
    );
  }, [friendSearchQuery, friends]);

  const renderFriendItem = ({item}: {item: Friend}) => {
    const isSelected = selectedFriends.includes(item.id);
    return (
      <TouchableOpacity
        style={[styles.friendItem, isSelected && styles.friendItemSelected]}
        onPress={() => handleToggleFriend(item.id)}
        activeOpacity={0.7}>
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
          <Text style={styles.friendName}>{item.name}</Text>
        </View>
        {isSelected && (
          <View style={styles.checkmarkContainer}>
            <Icon name="checkmark-circle" size={24} color="#007AFF" />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (showCreateGroup) {
    return (
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              setShowCreateGroup(false);
              setGroupName('');
              setGroupBiography('');
              setGroupImage(null);
              setIsPrivate(false);
              setSelectedFriends([]);
              setFriendSearchQuery('');
            }}
            style={styles.backButton}
            activeOpacity={0.7}>
            <Icon name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Opret gruppe</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.createGroupContent}
          contentContainerStyle={styles.createGroupScrollContent}
          showsVerticalScrollIndicator={false}>
          {/* Group Image */}
          <View style={styles.imageSection}>
            <TouchableOpacity
              style={styles.imagePicker}
              onPress={() => {
                // TODO: Implement image picker
                Alert.alert('Billede', 'Billede upload funktion kommer snart');
              }}
              activeOpacity={0.7}>
              {groupImage ? (
                <Image source={{uri: groupImage}} style={styles.groupImage} />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <Icon name="camera" size={32} color="#007AFF" />
                  <Text style={styles.imagePlaceholderText}>
                    Tilføj gruppebillede
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Group Name Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Gruppenavn *</Text>
            <TextInput
              style={styles.input}
              value={groupName}
              onChangeText={setGroupName}
              placeholder="F.eks. Weekend Warriors"
              placeholderTextColor="#8E8E93"
            />
          </View>

          {/* Biography Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Biografi</Text>
            <TextInput
              style={[styles.input, styles.biographyInput]}
              value={groupBiography}
              onChangeText={setGroupBiography}
              placeholder="Beskriv din gruppe..."
              placeholderTextColor="#8E8E93"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* Privacy Toggle */}
          <View style={styles.privacySection}>
            <View style={styles.privacyInfo}>
              <Text style={styles.inputLabel}>Gruppe synlighed</Text>
              <Text style={styles.privacySubtext}>
                {isPrivate
                  ? 'Privat - Kun medlemmer kan se gruppen'
                  : 'Offentlig - Alle kan se og søge efter gruppen'}
              </Text>
            </View>
            <Switch
              value={!isPrivate}
              onValueChange={(value) => setIsPrivate(!value)}
              trackColor={{false: '#E5E5EA', true: '#007AFF'}}
              thumbColor={Platform.OS === 'ios' ? '#fff' : '#fff'}
            />
          </View>

          {/* Friends Selection */}
          <View style={styles.friendsSection}>
            <Text style={styles.sectionTitle}>
              Vælg venner ({selectedFriends.length} valgt)
            </Text>
            {/* Friend Search */}
            <View style={styles.friendSearchContainer}>
              <Icon name="search" size={20} color="#8E8E93" style={styles.searchIcon} />
              <TextInput
                style={styles.friendSearchInput}
                placeholder="Søg efter venner..."
                placeholderTextColor="#8E8E93"
                value={friendSearchQuery}
                onChangeText={setFriendSearchQuery}
              />
              {friendSearchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => setFriendSearchQuery('')}
                  style={styles.clearButton}>
                  <Icon name="close-circle" size={20} color="#8E8E93" />
                </TouchableOpacity>
              )}
            </View>
            <FlatList
              data={filteredFriends}
              renderItem={renderFriendItem}
              keyExtractor={item => item.id}
              showsVerticalScrollIndicator={false}
              scrollEnabled={false}
              nestedScrollEnabled={false}
            />
          </View>

          {/* Create Button */}
          <TouchableOpacity
            style={[
              styles.createButton,
              (!groupName.trim() || selectedFriends.length === 0) &&
                styles.createButtonDisabled,
            ]}
            onPress={handleCreateGroup}
            disabled={!groupName.trim() || selectedFriends.length === 0}
            activeOpacity={0.8}>
            <Text style={styles.createButtonText}>Opret gruppe</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Create Group Button */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Grupper</Text>
        <TouchableOpacity
          style={styles.createButtonHeader}
          onPress={() => setShowCreateGroup(true)}
          activeOpacity={0.7}>
          <Icon name="add-circle" size={24} color="#007AFF" />
          <Text style={styles.createButtonHeaderText}>Opret</Text>
        </TouchableOpacity>
      </View>

      {/* Search Field */}
      <View style={styles.searchContainer}>
        <Icon name="search" size={20} color="#8E8E93" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Søg efter grupper"
          placeholderTextColor="#8E8E93"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearchQuery('')}
            style={styles.clearButton}
            activeOpacity={0.7}>
            <Icon name="close-circle" size={20} color="#8E8E93" />
          </TouchableOpacity>
        )}
      </View>

      {/* Groups List with Sections */}
      {filteredAndCategorizedGroups.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <Icon name="people-outline" size={80} color="#C7C7CC" />
          </View>
          <Text style={styles.emptyTitle}>
            {searchQuery ? 'Ingen grupper fundet' : 'Ingen grupper endnu'}
          </Text>
          <Text style={styles.emptyText}>
            {searchQuery
              ? 'Prøv at søge efter noget andet'
              : 'Opret en gruppe for at træne sammen med dine venner'}
          </Text>
          {!searchQuery && (
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => setShowCreateGroup(true)}
              activeOpacity={0.8}>
              <Icon name="add-circle" size={20} color="#007AFF" />
              <Text style={styles.emptyButtonText}>Opret første gruppe</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <SectionList
          sections={filteredAndCategorizedGroups}
          renderItem={renderGroupItem}
          renderSectionHeader={({section: {title}}) => (
            <View style={styles.sectionHeader} key={`header-${title}`}>
              <Text style={styles.sectionHeaderText}>{title}</Text>
            </View>
          )}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          SectionSeparatorComponent={() => <View style={styles.sectionSeparator} />}
          stickySectionHeadersEnabled={false}
        />
      )}

      {/* Community Button - Bottom (above main tabs) */}
      <View style={styles.communityButtonContainer}>
        <TouchableOpacity
          style={styles.communityButton}
          onPress={handleOpenCommunity}
          activeOpacity={0.8}>
          <Icon name="people" size={24} color="#007AFF" style={{marginRight: 12}} />
          <Text style={styles.communityButtonText}>Community</Text>
          <Icon name="chevron-forward" size={20} color="#8E8E93" style={{marginLeft: 8}} />
        </TouchableOpacity>
      </View>
    </View>
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
  headerSpacer: {
    width: 32,
  },
  createButtonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  createButtonHeaderText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
    marginLeft: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000',
    paddingVertical: 12,
  },
  clearButton: {
    padding: 4,
  },
  list: {
    padding: 16,
    paddingBottom: 8,
  },
  sectionHeader: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginTop: 8,
  },
  sectionHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'capitalize',
  },
  sectionSeparator: {
    height: 16,
  },
  emptyList: {
    flexGrow: 1,
  },
  groupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  separator: {
    height: 12,
  },
  groupIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  groupIconImage: {
    width: '100%',
    height: '100%',
  },
  privateGroupBadge: {
    position: 'absolute',
    top: 2,
    left: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 8,
    padding: 2,
  },
  onlineGroupIndicator: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#34C759',
    borderWidth: 2,
    borderColor: '#fff',
  },
  groupNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  groupName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    flexShrink: 1,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34C759',
    marginRight: 4,
  },
  onlineText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#34C759',
  },
  memberOnlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#34C759',
    borderWidth: 2,
    borderColor: '#fff',
  },
  groupInfo: {
    flex: 1,
  },
  groupMembers: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 8,
  },
  memberAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#C7C7CC',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  avatarImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  moreMembers: {
    backgroundColor: '#E3F2FD',
  },
  moreMembersText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007AFF',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
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
    marginBottom: 24,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
  },
  emptyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
    marginLeft: 8,
  },
  createGroupContent: {
    flex: 1,
  },
  createGroupScrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  imageSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  imagePicker: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#E5E5EA',
    borderStyle: 'dashed',
  },
  groupImage: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F8F9FA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePlaceholderText: {
    fontSize: 12,
    color: '#007AFF',
    marginTop: 4,
    textAlign: 'center',
  },
  biographyInput: {
    minHeight: 100,
    paddingTop: 12,
  },
  privacySection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  privacyInfo: {
    flex: 1,
    marginRight: 16,
  },
  privacySubtext: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 4,
  },
  friendSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  friendSearchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000',
    paddingVertical: 12,
  },
  inputGroup: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#000',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  friendsSection: {
    flex: 1,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  friendItemSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#E3F2FD',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#C7C7CC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#34C759',
    borderWidth: 2,
    borderColor: '#fff',
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  checkmarkContainer: {
    marginLeft: 8,
  },
  createButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#007AFF',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  createButtonDisabled: {
    backgroundColor: '#C7C7CC',
    shadowOpacity: 0,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  communityButtonContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 8,
    backgroundColor: '#F8F9FA',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  communityButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  communityButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
});

export default GroupsScreen;



