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

  // Mock friends - in real app, this would come from a store/service
  const mockFriends: Friend[] = [
    {id: '1', name: 'Jeff', isOnline: true},
    {id: '2', name: 'Marie', isOnline: false},
    {id: '3', name: 'Lars', isOnline: true},
    {id: '4', name: 'Sofia', isOnline: false},
    {id: '5', name: 'Jens', isOnline: true},
    {id: '6', name: 'Mette', isOnline: true},
    {id: '7', name: 'Thomas', isOnline: false},
    {id: '8', name: 'Anne', isOnline: true},
    {id: '9', name: 'Peter', isOnline: false},
    {id: '10', name: 'Emma', isOnline: true},
  ];

  // Get all available friends (current members + others)
  const availableFriends = useMemo(() => {
    const memberIds = new Set(initialGroup.members.map((m: Friend) => m.id));
    return mockFriends.filter(f => !memberIds.has(f.id));
  }, [initialGroup.members]);

  // Filter members based on search
  const filteredMembers = useMemo(() => {
    const allMembers = [...initialGroup.members, ...availableFriends];
    if (!memberSearchQuery.trim()) return allMembers;
    return allMembers.filter(member =>
      member.name.toLowerCase().includes(memberSearchQuery.toLowerCase()),
    );
  }, [memberSearchQuery, initialGroup.members, availableFriends]);

  const handleSave = () => {
    if (!groupName.trim()) {
      Alert.alert('Mangler navn', 'Indtast venligst et gruppenavn');
      return;
    }

    // TODO: Save changes to backend
    Alert.alert('Gruppe opdateret', 'Ændringerne er blevet gemt');
    navigation.goBack();
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
    } else {
      // Add member
      setSelectedMembers(prev => [...prev, memberId]);
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
            if (!isCurrentMember) {
              handleToggleMember(member.id);
            }
          }}
          activeOpacity={!isCurrentMember ? 0.7 : 1}
          disabled={isCurrentMember}>
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
            {!isCurrentMember && isSelected && (
              <Text style={styles.addedLabel}>Vil blive tilføjet</Text>
            )}
            {isCurrentMember && !isSelected && (
              <Text style={styles.removedLabel}>Vil blive fjernet</Text>
            )}
          </View>
          {isSelected && (
            <View style={styles.checkmarkContainer}>
              <Icon name="checkmark-circle" size={24} color="#007AFF" />
            </View>
          )}
          {!isCurrentMember && !isSelected && (
            <View style={styles.addIconContainer}>
              <Icon name="add-circle-outline" size={24} color="#34C759" />
            </View>
          )}
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
          <TouchableOpacity
            style={styles.imagePicker}
            onPress={() => {
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
          <Text style={styles.sectionTitle}>Gruppemedlemmer</Text>

          {/* Member Search */}
          <View style={styles.memberSearchContainer}>
            <Icon
              name="search"
              size={20}
              color="#8E8E93"
              style={styles.searchIcon}
            />
            <TextInput
              style={styles.memberSearchInput}
              placeholder="Søg efter medlemmer..."
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

          {/* Members List */}
          <View style={styles.membersList}>
            {filteredMembers.map(member => renderMemberItem(member))}
          </View>
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
  saveButton: {
    padding: 4,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
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
    color: '#8E8E93',
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
  membersSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  memberSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  memberSearchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000',
    paddingVertical: 12,
  },
  clearButton: {
    padding: 4,
  },
  membersList: {
    backgroundColor: '#fff',
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
    color: '#000',
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
  checkmarkContainer: {
    marginLeft: 8,
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

