/**
 * Edit Group Screen
 * Allows admin to edit group details
 */

import React, {useState, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  Switch,
  Platform,
  SafeAreaView,
} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import {useAppStore} from '@/store/appStore';
import colors from '@/theme/colors';
import {
  launchCamera,
  launchImageLibrary,
  CameraOptions,
  ImagePickerResponse,
} from 'react-native-image-picker';

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
  totalTimeTogether: number;
  createdAt: Date | string;
};

const EditGroupScreen = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const route = useRoute();
  const {group: initialGroup} = (route.params as any) || {};
  const {user} = useAppStore();

  const [groupName, setGroupName] = useState(initialGroup?.name || '');
  const [groupBiography, setGroupBiography] = useState(
    initialGroup?.biography || initialGroup?.description || '',
  );
  const [groupImage, setGroupImage] = useState<string | null>(
    initialGroup?.image || null,
  );
  // Start with public (false = public, true = private)
  const [isPrivate, setIsPrivate] = useState(initialGroup?.isPrivate || false);
  // Initialize selected members with all current members
  const [selectedMembers, setSelectedMembers] = useState<string[]>(() => {
    if (initialGroup?.members) {
      return initialGroup.members.map((m: Friend) => m.id);
    }
    return [];
  });
  const [selectedAdmin, setSelectedAdmin] = useState<string>(
    initialGroup?.adminId || '',
  );
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  // Track pending invitations
  const [pendingInvitations, setPendingInvitations] = useState<string[]>([]);

  if (!initialGroup) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}>
            <Icon name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Rediger gruppe</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Gruppe ikke fundet</Text>
        </View>
      </SafeAreaView>
    );
  }

  const friends: Friend[] = [];

  const availableFriends = useMemo(() => {
    const memberIds = new Set(initialGroup.members.map((m: Friend) => m.id));
    return friends.filter(f => !memberIds.has(f.id));
  }, [initialGroup.members]);

  // Filter friends based on search - only show non-members when searching
  const filteredFriends = useMemo(() => {
    if (!memberSearchQuery.trim()) {
      return []; // Don't show any suggestions when not searching
    }
    return availableFriends.filter(friend =>
      friend.name.toLowerCase().includes(memberSearchQuery.toLowerCase()),
    );
  }, [memberSearchQuery, availableFriends]);

  const handleSave = () => {
    if (!groupName.trim()) {
      Alert.alert('Mangler navn', 'Indtast venligst et gruppenavn');
      return;
    }

    // TODO: Save changes to backend
    Alert.alert('Gruppe opdateret', 'Ændringerne er blevet gemt');
    navigation.goBack();
  };

  const handleGroupImagePick = () => {
    Alert.alert('Vælg gruppebillede', 'Hvordan vil du tilføje et billede?', [
      {
        text: 'Tag billede',
        onPress: async () => {
          const cameraOptions: CameraOptions = {
            mediaType: 'photo',
            cameraType: 'back',
            saveToPhotos: false,
            quality: 0.8,
          };
          const response: ImagePickerResponse = await launchCamera(cameraOptions);
          const asset = response.assets && response.assets[0];
          if (asset?.uri) {
            setGroupImage(asset.uri);
          }
        },
      },
      {
        text: 'Vælg fra bibliotek',
        onPress: async () => {
          const response: ImagePickerResponse = await launchImageLibrary({
            mediaType: 'photo',
            selectionLimit: 1,
            quality: 0.8,
          });
          const asset = response.assets && response.assets[0];
          if (asset?.uri) {
            setGroupImage(asset.uri);
          }
        },
      },
      {text: 'Annuller', style: 'cancel'},
    ]);
  };

  const handleSendInvitation = (friendId: string) => {
    // Send invitation instead of adding directly
    if (!pendingInvitations.includes(friendId)) {
      setPendingInvitations(prev => [...prev, friendId]);
      Alert.alert(
        'Invitation sendt',
        'Venneren har modtaget en invitation og skal acceptere den før de bliver medlem.',
      );
    }
  };

  const handleCancelInvitation = (friendId: string) => {
    setPendingInvitations(prev => prev.filter(id => id !== friendId));
  };

  const handleToggleMember = (memberId: string) => {
    const isCurrentMember = initialGroup.members.some(
      (m: Friend) => m.id === memberId,
    );

    if (isCurrentMember) {
      // Remove member
      if (memberId === selectedAdmin) {
        Alert.alert(
          'Kan ikke fjerne admin',
          'Vælg først en anden admin, før du fjerner den nuværende.',
        );
        return;
      }
      setSelectedMembers(prev => prev.filter(id => id !== memberId));
    }
  };

  const handleChangeAdmin = (memberId: string) => {
    setSelectedAdmin(memberId);
  };

  const handleRemoveMember = (memberId: string) => {
    if (memberId === selectedAdmin) {
      Alert.alert(
        'Kan ikke fjerne admin',
        'Vælg først en anden admin, før du fjerner den nuværende.',
      );
      return;
    }
    setSelectedMembers(prev => prev.filter(id => id !== memberId));
  };

  const handleMemberPress = (memberId: string) => {
    // Navigate to member profile
    const member = initialGroup.members.find((m: Friend) => m.id === memberId);
    if (member) {
      navigation.navigate('FriendProfile', {
        friendId: memberId,
        friendName: member.name,
        mutualFriends: 0,
        gyms: [],
      });
    }
  };

  const renderMemberItem = (member: Friend) => {
    const isCurrentMember = initialGroup.members.some(
      (m: Friend) => m.id === member.id,
    );
    const isSelected = selectedMembers.includes(member.id);
    const isAdmin = selectedAdmin === member.id;

    return (
      <View key={member.id} style={styles.memberRow}>
        <TouchableOpacity
          style={styles.memberItem}
          onPress={() => {
            if (isCurrentMember) {
              handleMemberPress(member.id);
            } else {
              handleToggleMember(member.id);
            }
          }}
          activeOpacity={0.7}>
          <View style={styles.avatarContainer}>
            {member.avatar ? (
              <Image source={{uri: member.avatar}} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {member.name.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            {member.isOnline && <View style={styles.onlineIndicator} />}
          </View>
          <View style={styles.memberInfo}>
            <Text style={styles.memberName}>{member.name}</Text>
            {isAdmin && <Text style={styles.adminLabel}>Admin</Text>}
            {isCurrentMember && !isSelected && (
              <Text style={styles.removedLabel}>Vil blive fjernet</Text>
            )}
          </View>
        </TouchableOpacity>
        {/* Action buttons for current members */}
        {isCurrentMember && (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.adminButton}
              onPress={() => handleChangeAdmin(member.id)}
              activeOpacity={0.7}>
              <Icon
                name={isAdmin ? 'star' : 'star-outline'}
                size={20}
                color={isAdmin ? '#FF9500' : '#8E8E93'}
              />
            </TouchableOpacity>
            {!isAdmin && (
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => handleRemoveMember(member.id)}
                activeOpacity={0.7}>
                <Icon name="close-circle" size={24} color="#FF3B30" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderFriendItem = (friend: Friend) => {
    const hasPendingInvitation = pendingInvitations.includes(friend.id);

    return (
      <View key={friend.id} style={styles.memberRow}>
        <TouchableOpacity
          style={styles.memberItem}
          onPress={() => {
            if (!hasPendingInvitation) {
              handleSendInvitation(friend.id);
            }
          }}
          activeOpacity={0.7}
          disabled={hasPendingInvitation}>
          <View style={styles.avatarContainer}>
            {friend.avatar ? (
              <Image source={{uri: friend.avatar}} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {friend.name.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            {friend.isOnline && <View style={styles.onlineIndicator} />}
          </View>
          <View style={styles.memberInfo}>
            <Text style={styles.memberName}>{friend.name}</Text>
            {hasPendingInvitation && (
              <Text style={styles.invitationLabel}>Invitation sendt</Text>
            )}
          </View>
          {hasPendingInvitation ? (
            <TouchableOpacity
              style={styles.cancelInvitationButton}
              onPress={() => handleCancelInvitation(friend.id)}
              activeOpacity={0.7}>
              <Icon name="close-circle" size={24} color="#8E8E93" />
            </TouchableOpacity>
          ) : (
            <View style={styles.addIconContainer}>
              <Icon name="person-add-outline" size={24} color="#007AFF" />
            </View>
          )}
        </TouchableOpacity>
      </View>
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
        <Text style={styles.headerTitle}>Rediger gruppe</Text>
        <TouchableOpacity onPress={handleSave} style={styles.saveButton}>
          <Text style={styles.saveButtonText}>Gem</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}>
        {/* Group Image */}
        <View style={styles.imageSection}>
          <View style={styles.imagePickerWrapper}>
            <TouchableOpacity
              style={styles.imagePicker}
              onPress={handleGroupImagePick}
              activeOpacity={0.7}>
              {groupImage ? (
                <Image source={{uri: groupImage}} style={styles.groupImage} resizeMode="cover" />
              ) : (
                <Image
                  source={require('@/assets/images/gymly-kettlebell.png')}
                  style={styles.groupImageLogo}
                  resizeMode="cover"
                />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.imagePlusBadge}
              onPress={handleGroupImagePick}
              activeOpacity={0.8}>
              <Icon name="add" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Group Name */}
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

        {/* Biography */}
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

        {/* Members Section */}
        <View style={styles.membersSection}>
          {/* Friend Search */}
          <View style={styles.friendSearchSection}>
            <Text style={styles.sectionTitle}>Tilføj venner</Text>
          <View style={styles.memberSearchContainer}>
            <Icon
              name="search"
              size={20}
              color="#8E8E93"
              style={styles.searchIcon}
            />
            <TextInput
              style={styles.memberSearchInput}
                placeholder="Søg efter venner..."
              placeholderTextColor="#8E8E93"
              value={memberSearchQuery}
              onChangeText={setMemberSearchQuery}
            />
            {memberSearchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setMemberSearchQuery('')}
                style={styles.clearButton}>
                <Icon name="close-circle" size={20} color="#8E8E93" />
              </TouchableOpacity>
            )}
          </View>

            {/* Search Results - Friends List */}
            {memberSearchQuery.trim().length > 0 && (
              <View style={styles.membersList}>
                {filteredFriends.length > 0 ? (
                  filteredFriends.map(friend => renderFriendItem(friend))
                ) : (
                  <View style={styles.noResultsContainer}>
                    <Text style={styles.noResultsText}>
                      Ingen venner fundet
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>

          <Text style={styles.sectionTitle}>Gruppemedlemmer</Text>

          {/* Current Members List */}
          <View style={styles.membersList}>
            {initialGroup.members.map(member => renderMemberItem(member))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.backgroundCard,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  headerRight: {
    width: 32,
  },
  saveButton: {
    padding: 4,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.secondary,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: colors.textMuted,
  },
  imageSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  imagePickerWrapper: {
    width: 140,
    height: 140,
    position: 'relative',
  },
  imagePicker: {
    width: 140,
    height: 140,
    borderRadius: 70,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  groupImage: {
    width: '100%',
    height: '100%',
  },
  groupImageLogo: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePlusBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputGroup: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  biographyInput: {
    minHeight: 100,
    paddingTop: 12,
  },
  privacySection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.backgroundCard,
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  privacyInfo: {
    flex: 1,
    marginRight: 16,
  },
  privacySubtext: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 4,
  },
  membersSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  memberSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  memberSearchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 12,
  },
  clearButton: {
    padding: 4,
  },
  membersList: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 12,
    overflow: 'hidden',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  memberItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
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
  avatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
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
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  adminLabel: {
    fontSize: 14,
    color: '#FF9500',
    marginTop: 2,
    fontWeight: '600',
  },
  addedLabel: {
    fontSize: 12,
    color: '#34C759',
    marginTop: 2,
    fontStyle: 'italic',
  },
  removedLabel: {
    fontSize: 12,
    color: '#FF3B30',
    marginTop: 2,
    fontStyle: 'italic',
  },
  invitationLabel: {
    fontSize: 12,
    color: '#007AFF',
    marginTop: 2,
    fontStyle: 'italic',
  },
  friendSearchSection: {
    marginBottom: 24,
  },
  noResultsContainer: {
    padding: 20,
    alignItems: 'center',
  },
  noResultsText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  cancelInvitationButton: {
    padding: 4,
  },
  addIconContainer: {
    marginLeft: 8,
  },
  adminButton: {
    padding: 8,
    marginRight: 4,
  },
  removeButton: {
    padding: 8,
  },
});

export default EditGroupScreen;

