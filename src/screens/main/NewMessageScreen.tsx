/**
 * New Message Screen
 * Screen to compose and send a new message to a friend
 */

import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

// Mock friends list - in a real app, this would come from the backend
const mockFriends = [
  {id: '1', name: 'Jeff', avatar: null},
  {id: '2', name: 'Marie', avatar: null},
  {id: '3', name: 'Lars', avatar: null},
  {id: '4', name: 'Sofia', avatar: null},
];

const NewMessageScreen = ({navigation}: any) => {
  const [selectedFriend, setSelectedFriend] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredFriends = mockFriends.filter(friend =>
    friend.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleSend = () => {
    if (!selectedFriend) {
      Alert.alert('Vælg ven', 'Vælg venligst en ven at sende beskeden til');
      return;
    }
    if (!message.trim()) {
      Alert.alert('Tom besked', 'Skriv venligst en besked');
      return;
    }

    const friend = mockFriends.find(f => f.id === selectedFriend);
    if (!friend) return;

    // Navigate to chat screen with the friend
    navigation.navigate('Chat', {
      friendId: selectedFriend,
      friendName: friend.name,
      initialMessage: message.trim(),
    });
  };

  return (
    <View style={styles.container}>
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
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Til</Text>
          <View style={styles.searchContainer}>
            <Icon name="search" size={20} color="#8E8E93" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Søg efter venner..."
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

          {/* Selected Friend */}
          {selectedFriend && (
            <View style={styles.selectedFriendContainer}>
              <View style={styles.selectedFriend}>
                <View style={styles.selectedFriendAvatar}>
                  <Text style={styles.selectedFriendAvatarText}>
                    {mockFriends.find(f => f.id === selectedFriend)?.name.charAt(0)}
                  </Text>
                </View>
                <Text style={styles.selectedFriendName}>
                  {mockFriends.find(f => f.id === selectedFriend)?.name}
                </Text>
                <TouchableOpacity
                  onPress={() => setSelectedFriend(null)}
                  style={styles.removeButton}>
                  <Icon name="close-circle" size={24} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Friends List */}
          {!selectedFriend && (
            <View style={styles.friendsList}>
              {filteredFriends.map(friend => (
                <TouchableOpacity
                  key={friend.id}
                  style={styles.friendItem}
                  onPress={() => setSelectedFriend(friend.id)}
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
              {filteredFriends.length === 0 && (
                <View style={styles.emptyState}>
                  <Icon name="people-outline" size={48} color="#C7C7CC" />
                  <Text style={styles.emptyText}>Ingen venner fundet</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Message Input */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Besked</Text>
          <View style={styles.messageInputContainer}>
            <TextInput
              style={styles.messageInput}
              placeholder="Skriv din besked her..."
              placeholderTextColor="#8E8E93"
              value={message}
              onChangeText={setMessage}
              multiline
              textAlignVertical="top"
              maxLength={1000}
            />
            <View style={styles.messageInputFooter}>
              <Text style={styles.characterCount}>
                {message.length} / 1000
              </Text>
              <TouchableOpacity
                onPress={handleSend}
                style={[
                  styles.sendButtonIcon,
                  (!selectedFriend || !message.trim()) && styles.sendButtonIconDisabled,
                ]}
                disabled={!selectedFriend || !message.trim()}>
                <Icon
                  name="arrow-forward-circle"
                  size={32}
                  color={(!selectedFriend || !message.trim()) ? '#C7C7CC' : '#007AFF'}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
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
  selectedFriend: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    padding: 12,
    borderRadius: 12,
  },
  selectedFriendAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  selectedFriendAvatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  selectedFriendName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  removeButton: {
    padding: 4,
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
});

export default NewMessageScreen;

