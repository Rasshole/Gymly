/**
 * New Message Screen
 * Screen to compose and send a new message to a friend
 */

import React, {useRef, useState, useMemo, useCallback} from 'react';
import {useFocusEffect} from '@react-navigation/native';
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
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useChatStore} from '@/store/chatStore';
import {useGroupStore, CURRENT_USER_PLACEHOLDER_ID, GymlyGroup} from '@/store/groupStore';
import {useAppStore} from '@/store/appStore';
import {listFriendsWithProfiles} from '@/services/supabase/friendService';
import {getOrCreateDmThread} from '@/services/supabase/dmService';
import colors from '@/theme/colors';
import {UserAvatar} from '@/components/ui/UserAvatar';

const NewMessageScreen = ({navigation}: any) => {
  const {getChatByParticipants, addChat, initializeChatMessages, upsertChat} =
    useChatStore();
  const {groups} = useGroupStore();
  const {user} = useAppStore();
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<GymlyGroup | null>(null);
  const [message, setMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchActive, setSearchActive] = useState(true);
  const [messageInputFocused, setMessageInputFocused] = useState(false);
  const [friends, setFriends] = useState<
    Array<{id: string; name: string; avatar: string | null}>
  >([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  const messageInputRef = useRef<TextInput>(null);

  const currentUserId = user?.id || CURRENT_USER_PLACEHOLDER_ID;
  const currentUserName = user?.displayName || 'Dig';

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) {
        setFriends([]);
        return;
      }
      let cancelled = false;
      setFriendsLoading(true);
      void (async () => {
        try {
          const profiles = await listFriendsWithProfiles(user.id);
          if (!cancelled) {
            setFriends(
              profiles.map(p => ({
                id: p.id,
                name: p.displayName,
                avatar: p.avatarUrl,
              })),
            );
          }
        } catch {
          if (!cancelled) {
            setFriends([]);
          }
        } finally {
          if (!cancelled) {
            setFriendsLoading(false);
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [user?.id]),
  );

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

  const q = searchQuery.trim().toLowerCase();
  const filteredFriends = friends.filter(friend => {
    if (selectedFriends.includes(friend.id)) {
      return false;
    }
    if (!q) {
      return true;
    }
    return friend.name.toLowerCase().includes(q);
  });

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

  const handleSend = async () => {
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
    const friendObjects = friends.filter(friend =>
      selectedFriends.includes(friend.id),
    );

    if (friendObjects.length === 0) {
      Alert.alert('Ups', 'Kunne ikke finde de valgte venner');
      return;
    }

    const allParticipantIds = [currentUserId, ...selectedFriends].sort();
    const nameById: Record<string, string> = {
      [currentUserId]: currentUserName,
      ...Object.fromEntries(friendObjects.map(f => [f.id, f.name] as const)),
    };
    const existingChat = getChatByParticipants(allParticipantIds);

    if (friendObjects.length === 1) {
      const other = friendObjects[0];
      try {
        const threadId = await getOrCreateDmThread(other.id);
        upsertChat({
          id: threadId,
          participantIds: allParticipantIds,
          participantNames: allParticipantIds.map(
            id => nameById[id] ?? 'Ven',
          ),
          lastActivity: new Date(),
          unreadCount: existingChat?.unreadCount ?? 0,
          avatar: existingChat?.avatar,
          avatarInitials: existingChat?.avatarInitials,
        });
        navigation.navigate('Chat', {
          chatId: threadId,
          friendId: other.id,
          friendName: other.name,
          participants: [{id: other.id, name: other.name}],
          initialMessage: trimmedMessage,
        });
      } catch (e) {
        Alert.alert('Besked', (e as Error).message);
        return;
      }
    } else {
      if (existingChat) {
        navigation.navigate('Chat', {
          chatId: existingChat.id,
          friendId: `group_${existingChat.id}`,
          friendName: `${friendObjects.length} venner`,
          participants: friendObjects.map(friend => ({
            id: friend.id,
            name: friend.name,
          })),
          initialMessage: trimmedMessage,
        });
      } else {
        const chatId = `chat_${Date.now()}`;
        addChat({
          id: chatId,
          participantIds: allParticipantIds,
          participantNames: allParticipantIds.map(
            id => nameById[id] ?? 'Ven',
          ),
          lastActivity: new Date(),
          unreadCount: 0,
        });
        initializeChatMessages(chatId, []);
        navigation.navigate('Chat', {
          chatId,
          friendId: `group_${chatId}`,
          friendName: `${friendObjects.length} venner`,
          participants: friendObjects.map(friend => ({
            id: friend.id,
            name: friend.name,
          })),
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
                  const friend = friends.find(f => f.id === friendId);
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
                  <Text style={styles.sectionSubtitle}>Venner</Text>
                  {filteredFriends.map(friend => (
                    <TouchableOpacity
                      key={friend.id}
                      style={styles.friendItem}
                      onPress={() => handleSelectFriend(friend.id)}
                      activeOpacity={0.7}>
                      <UserAvatar
                        name={friend.name}
                        imageUrl={friend.avatar}
                        size="md"
                        style={styles.friendAvatarImage}
                      />
                      <Text style={styles.friendName}>{friend.name}</Text>
                      <Icon name="chevron-forward" size={20} color="#C7C7CC" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {friendsLoading &&
                filteredGroups.length === 0 &&
                filteredFriends.length === 0 && (
                  <View style={styles.emptyState}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.emptySubtext}>Henter venner…</Text>
                  </View>
                )}

              {!friendsLoading &&
                friends.length === 0 &&
                filteredGroups.length === 0 &&
                filteredFriends.length === 0 &&
                searchQuery.trim().length === 0 && (
                  <View style={styles.emptyState}>
                    <Icon name="people-outline" size={48} color="#C7C7CC" />
                    <Text style={styles.emptyText}>Ingen venner endnu</Text>
                    <Text style={styles.emptySubtext}>
                      Tilføj venner under fanen Venner for at skrive sammen.
                    </Text>
                  </View>
                )}

              {/* Empty State — søgning uden match */}
              {!friendsLoading &&
                filteredFriends.length === 0 &&
                filteredGroups.length === 0 &&
                searchQuery.trim().length > 0 && (
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
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.backgroundCard,
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
    color: colors.text,
    marginLeft: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
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
    backgroundColor: colors.backgroundCard,
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
    color: colors.textMuted,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
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
    color: colors.text,
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
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    gap: 6,
  },
  selectedFriendName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  selectedGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
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
    backgroundColor: colors.secondary,
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
    color: colors.white,
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
    color: colors.textMuted,
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
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  groupItemPlaceholderText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  groupItemInfo: {
    flex: 1,
  },
  groupItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  groupItemMembers: {
    fontSize: 13,
    color: colors.textMuted,
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
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  friendAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    backgroundColor: colors.surface,
  },
  friendAvatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  friendName: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textMuted,
    marginTop: 12,
  },
  messageInput: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: colors.text,
    minHeight: 150,
    maxHeight: 300,
  },
  characterCount: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: 8,
  },
  messageInputBottom: {
    backgroundColor: colors.backgroundCard,
    borderTopWidth: 1,
    borderTopColor: '#EFEFF4',
    paddingHorizontal: 16,
    paddingVertical: 8,
    paddingBottom: Platform.OS === 'ios' ? 20 : 8,
  },
  messageInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
    maxHeight: 100,
  },
  messageInputBottomField: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    maxHeight: 84,
    padding: 0,
  },
  sendButtonBottom: {
    marginLeft: 8,
    padding: 4,
  },
});

export default NewMessageScreen;

