/**
 * New Message Screen
 * Screen to compose and send a new message to a friend
 */

import React, {useRef, useState, useMemo, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useChatStore} from '@/store/chatStore';
import {useGroupStore, CURRENT_USER_PLACEHOLDER_ID, GymlyGroup} from '@/store/groupStore';
import {useAppStore} from '@/store/appStore';

// Mock friends list - in a real app, this would come from the backend
const mockFriends = [
  {id: '1', name: 'Jeff', avatar: null},
  {id: '2', name: 'Marie', avatar: null},
  {id: '3', name: 'Lars', avatar: null},
  {id: '4', name: 'Sofia', avatar: null},
];

const NewMessageScreen = ({navigation}: any) => {
  const {getChatByParticipants, addChat, initializeChatMessages} = useChatStore();
  const {groups} = useGroupStore();
  const {user} = useAppStore();
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<GymlyGroup | null>(null);
  const [message, setMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchActive, setSearchActive] = useState(true);
  const [messageInputFocused, setMessageInputFocused] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  const messageInputRef = useRef<TextInput>(null);

  const currentUserId = user?.id || CURRENT_USER_PLACEHOLDER_ID;
  const currentUserName = user?.displayName || 'Dig';

  const myGroups = useMemo(() => {
    return groups.filter(group =>
      group.members.some(
        member =>
          member.id === currentUserId || member.id === CURRENT_USER_PLACEHOLDER_ID,
      ),
    );
  }, [groups, currentUserId]);

  const normalizedGroupMembers = useCallback(
    (group: GymlyGroup) =>
      group.members.map(member =>
        member.id === CURRENT_USER_PLACEHOLDER_ID
          ? {id: currentUserId, name: currentUserName}
          : member,
      ),
    [currentUserId, currentUserName],
  );

  const filteredFriends = mockFriends.filter(
    friend =>
      friend.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !selectedFriends.includes(friend.id),
  );

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) {
      return [];
    }
    const query = searchQuery.trim().toLowerCase();
    return myGroups.filter(
      group =>
        group.name.toLowerCase().includes(query) ||
        group.members.some(member => member.name.toLowerCase().includes(query)),
    );
  }, [searchQuery, myGroups]);

  const handleSend = () => {
    if (selectedFriends.length === 0 && !selectedGroup) {
      Alert.alert('Vælg modtager', 'Vælg venligst en ven eller gruppe at sende beskeden til');
      return;
    }
    if (!message.trim()) {
      Alert.alert('Tom besked', 'Skriv venligst en besked');
      return;
    }

    const trimmedMessage = message.trim();

    // Handle group chat
    if (selectedGroup) {
      const members = normalizedGroupMembers(selectedGroup);
      const participantIds = Array.from(
        new Set([...members.map(member => member.id), currentUserId]),
      );
      const participantNames = participantIds.map(id => {
        if (id === currentUserId) {
          return currentUserName;
        }
        return (
          members.find(member => member.id === id)?.name ||
          'Ven'
        );
      });
      const existingChat = getChatByParticipants(participantIds);
      const chatId = existingChat?.id ?? `group_chat_${selectedGroup.id}`;

      if (!existingChat) {
        addChat({
          id: chatId,
          participantIds,
          participantNames,
          lastActivity: new Date(),
          unreadCount: 0,
          avatar: selectedGroup.image,
        });
        initializeChatMessages(chatId, []);
      }

      navigation.navigate('Chat', {
        chatId,
        friendId: selectedGroup.id,
        friendName: selectedGroup.name,
        participants: members.map(member => ({
          id: member.id,
          name: member.name,
        })),
        initialMessage: trimmedMessage,
      });

      setMessage('');
      setSelectedGroup(null);
      setSearchQuery('');
      setSearchActive(true);
      setMessageInputFocused(false);
      Keyboard.dismiss();
      return;
    }

    // Handle friend chat
    const friendObjects = mockFriends.filter(friend =>
      selectedFriends.includes(friend.id),
    );

    if (friendObjects.length === 0) {
      Alert.alert('Ups', 'Kunne ikke finde de valgte venner');
      return;
    }

    const allParticipantIds = [currentUserId, ...selectedFriends].sort();
    
    // Check if chat already exists
    const existingChat = getChatByParticipants(allParticipantIds);
    
    if (existingChat) {
      // Navigate to existing chat
      navigation.navigate('Chat', {
        chatId: existingChat.id,
        friendId: friendObjects.length === 1 ? friendObjects[0].id : `group_${existingChat.id}`,
        friendName: friendObjects.length === 1 ? friendObjects[0].name : `${friendObjects.length} venner`,
        participants: friendObjects.map(friend => ({id: friend.id, name: friend.name})),
        initialMessage: trimmedMessage,
      });
    } else {
      // Create new chat
      const chatId = `chat_${Date.now()}`;
      const newChat = {
        id: chatId,
        participantIds: allParticipantIds,
        participantNames: ['Dig', ...friendObjects.map(f => f.name)],
        lastActivity: new Date(),
        unreadCount: 0,
      };
      addChat(newChat);

      if (friendObjects.length === 1) {
        navigation.navigate('Chat', {
          chatId,
          friendId: friendObjects[0].id,
          friendName: friendObjects[0].name,
          participants: [{id: friendObjects[0].id, name: friendObjects[0].name}],
          initialMessage: trimmedMessage,
        });
      } else {
        navigation.navigate('Chat', {
          chatId,
          friendId: `group_${chatId}`,
          friendName: `${friendObjects.length} venner`,
          participants: friendObjects.map(friend => ({id: friend.id, name: friend.name})),
          initialMessage: trimmedMessage,
        });
      }
    }

    setMessage('');
    setSelectedFriends([]);
    setSearchQuery('');
    setSearchActive(true);
    setMessageInputFocused(false);
    Keyboard.dismiss();
  };

  const handleSelectFriend = (friendId: string) => {
    if (selectedFriends.includes(friendId)) {
      return;
    }
    setSelectedFriends(prev => [...prev, friendId]);
    setSelectedGroup(null); // Clear group selection when selecting friend
    setSearchQuery('');
    setSearchActive(false);
    Keyboard.dismiss();
  };

  const handleSelectGroup = (group: GymlyGroup) => {
    setSelectedGroup(group);
    setSelectedFriends([]); // Clear friend selection when selecting group
    setSearchQuery('');
    setSearchActive(false);
    Keyboard.dismiss();
  };

  const handleRemoveFriend = (friendId: string) => {
    setSelectedFriends(prev => {
      const updated = prev.filter(id => id !== friendId);
      if (updated.length === 0) {
        setSearchActive(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      return updated;
    });
  };

  const handleRemoveGroup = () => {
    setSelectedGroup(null);
    setSearchActive(true);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

const handleSearchFocus = () => {
  setSearchActive(true);
};

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <View style={styles.headerContent}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}>
            <Icon name="arrow-back" size={24} color="#000" />
            <Text style={styles.backButtonText}>Tilbage</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Ny besked</Text>
          <View style={styles.headerRight} />
        </View>
      </View>

      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        {/* To Section */}
        <View style={[styles.section, selectedFriends.length > 0 && styles.sectionCompact]}>
          <Text style={styles.sectionLabel}>Til</Text>
          <View style={styles.searchContainer}>
            <Icon name="search" size={20} color="#8E8E93" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder={
                selectedFriends.length > 0 ? 'Søg for at tilføje flere...' : 'Søg efter venner...'
              }
              placeholderTextColor="#8E8E93"
              value={searchQuery}
              onChangeText={setSearchQuery}
              ref={searchInputRef}
              onFocus={handleSearchFocus}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                style={styles.clearButton}>
                <Icon name="close-circle" size={20} color="#8E8E93" />
              </TouchableOpacity>
            )}
          </View>

          {/* Selected Friend or Group */}
          {(selectedFriends.length > 0 || selectedGroup) && (
            <View style={styles.selectedFriendContainer}>
              <View style={styles.chipList}>
                {selectedGroup && (
                  <View style={styles.selectedGroup}>
                    {selectedGroup.image ? (
                      <Image source={{uri: selectedGroup.image}} style={styles.selectedGroupImage} />
                    ) : (
                      <View style={styles.selectedGroupPlaceholder}>
                        <Text style={styles.selectedGroupPlaceholderText}>
                          {selectedGroup.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.selectedGroupName}>{selectedGroup.name}</Text>
                    <TouchableOpacity
                      onPress={handleRemoveGroup}
                      style={styles.removeButton}>
                      <Icon name="close-circle" size={18} color="#FF3B30" />
                    </TouchableOpacity>
                  </View>
                )}
                {selectedFriends.map(friendId => {
                  const friend = mockFriends.find(f => f.id === friendId);
                  if (!friend) {
                    return null;
                  }
                  return (
                    <View key={friend.id} style={styles.selectedFriend}>
                      <Text style={styles.selectedFriendName}>{friend.name}</Text>
                      <TouchableOpacity
                        onPress={() => handleRemoveFriend(friend.id)}
                        style={styles.removeButton}>
                        <Icon name="close-circle" size={18} color="#FF3B30" />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Friends and Groups List */}
          {searchActive && (
            <View style={styles.friendsList}>
              {/* Groups Section */}
              {filteredGroups.length > 0 && (
                <View style={styles.groupsSection}>
                  <Text style={styles.sectionSubtitle}>Grupper</Text>
                  {filteredGroups.map(group => {
                    const members = normalizedGroupMembers(group).filter(
                      member => member.id !== currentUserId,
                    );
                    return (
                      <TouchableOpacity
                        key={group.id}
                        style={styles.groupItem}
                        onPress={() => handleSelectGroup(group)}
                        activeOpacity={0.7}>
                        {group.image ? (
                          <Image source={{uri: group.image}} style={styles.groupItemImage} />
                        ) : (
                          <View style={styles.groupItemPlaceholder}>
                            <Text style={styles.groupItemPlaceholderText}>
                              {group.name.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <View style={styles.groupItemInfo}>
                          <Text style={styles.groupItemName}>{group.name}</Text>
                          <Text style={styles.groupItemMembers}>
                            {members.length > 0
                              ? members.map(member => member.name).join(', ')
                              : 'Kun dig i gruppen endnu'}
                          </Text>
                        </View>
                        <Icon name="chevron-forward" size={20} color="#C7C7CC" />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Friends Section */}
              {filteredFriends.length > 0 && (
                <View style={styles.friendsSection}>
                  {filteredGroups.length > 0 && (
                    <Text style={styles.sectionSubtitle}>Venner</Text>
                  )}
              {filteredFriends.map(friend => (
                <TouchableOpacity
                  key={friend.id}
                  style={styles.friendItem}
                  onPress={() => handleSelectFriend(friend.id)}
                  activeOpacity={0.7}>
                  <View style={styles.friendAvatar}>
                    <Text style={styles.friendAvatarText}>
                      {friend.name.charAt(0)}
                    </Text>
                  </View>
                  <Text style={styles.friendName}>{friend.name}</Text>
                  <Icon name="chevron-forward" size={20} color="#C7C7CC" />
                </TouchableOpacity>
              ))}
                </View>
              )}

              {/* Empty State */}
              {filteredFriends.length === 0 && filteredGroups.length === 0 && searchQuery.length > 0 && (
                <View style={styles.emptyState}>
                  <Icon name="people-outline" size={48} color="#C7C7CC" />
                  <Text style={styles.emptyText}>Ingen resultater fundet</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Message Input - Instagram style at bottom */}
      {(selectedFriends.length > 0 || selectedGroup) && (
        <View style={styles.messageInputBottom}>
          <View style={styles.messageInputWrapper}>
            <TextInput
              ref={messageInputRef}
              style={styles.messageInputBottomField}
              placeholder="Besked..."
              placeholderTextColor="#8E8E93"
              value={message}
              onChangeText={setMessage}
              onFocus={() => setMessageInputFocused(true)}
              onBlur={() => setMessageInputFocused(false)}
              multiline
              maxLength={1000}
            />
            {message.trim().length > 0 && (
              <TouchableOpacity
                onPress={handleSend}
                style={styles.sendButtonBottom}
                activeOpacity={0.7}>
                <Icon name="send" size={20} color="#007AFF" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFF4',
    paddingTop: 50, // Space for status bar
  },
  headerSpacer: {
    height: 0,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
  },
  backButtonText: {
    fontSize: 16,
    color: '#000',
    marginLeft: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  headerRight: {
    width: 80, // Balance the back button width
  },
  messageInputContainer: {
    position: 'relative',
  },
  messageInputFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  sendButtonIcon: {
    padding: 4,
  },
  sendButtonIconDisabled: {
    opacity: 0.3,
  },
  content: {
    flex: 1,
  },
  section: {
    backgroundColor: '#fff',
    padding: 16,
    marginTop: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#EFEFF4',
  },
  sectionCompact: {
    paddingBottom: 12,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
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
  selectedFriendContainer: {
    marginTop: 8,
  },
  chipList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectedFriend: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    gap: 6,
  },
  selectedFriendName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  selectedGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    gap: 6,
  },
  selectedGroupImage: {
    width: 24,
    height: 24,
    borderRadius: 6,
  },
  selectedGroupPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedGroupPlaceholderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  selectedGroupName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  removeButton: {
    padding: 4,
  },
  groupsSection: {
    marginBottom: 16,
  },
  friendsSection: {
    marginTop: 8,
  },
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  groupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  groupItemImage: {
    width: 40,
    height: 40,
    borderRadius: 10,
    marginRight: 12,
  },
  groupItemPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#E0E7FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  groupItemPlaceholderText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4338CA',
  },
  groupItemInfo: {
    flex: 1,
  },
  groupItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 2,
  },
  groupItemMembers: {
    fontSize: 13,
    color: '#8E8E93',
  },
  friendsList: {
    marginTop: 8,
  },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  friendAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  friendAvatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  friendName: {
    flex: 1,
    fontSize: 16,
    color: '#000',
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    color: '#8E8E93',
    marginTop: 12,
  },
  messageInput: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#000',
    minHeight: 150,
    maxHeight: 300,
  },
  characterCount: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'right',
    marginTop: 8,
  },
  messageInputBottom: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#EFEFF4',
    paddingHorizontal: 16,
    paddingVertical: 8,
    paddingBottom: Platform.OS === 'ios' ? 20 : 8,
  },
  messageInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
    maxHeight: 100,
  },
  messageInputBottomField: {
    flex: 1,
    fontSize: 16,
    color: '#000',
    maxHeight: 84,
    padding: 0,
  },
  sendButtonBottom: {
    marginLeft: 8,
    padding: 4,
  },
});

export default NewMessageScreen;

