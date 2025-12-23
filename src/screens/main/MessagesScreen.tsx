/**
 * Messages Screen
 * List of messages/conversations with friends
 */

import React, {useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  TextInput,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import {useChatStore} from '@/store/chatStore';
import {formatDistanceToNow} from 'date-fns';
import {da} from 'date-fns/locale';
import {colors} from '@/theme/colors';

type Message = {
  id: string;
  name: string;
  lastMessage: string;
  timestamp: string;
  unreadCount: number;
  participantIds?: string[];
  participants?: string[];
  avatar?: string;
};

const MessagesScreen = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const {chats} = useChatStore();
  const [searchQuery, setSearchQuery] = useState('');
  
  const messages = useMemo(() => {
    return chats.map(chat => ({
      id: chat.id,
      name: chat.participantNames.filter(name => name !== 'Dig').join(', ') || 'Gruppe',
      lastMessage: chat.lastMessage?.text || '',
      timestamp: chat.lastMessage 
        ? formatDistanceToNow(chat.lastMessage.timestamp, {addSuffix: true, locale: da})
        : formatDistanceToNow(chat.lastActivity, {addSuffix: true, locale: da}),
      unreadCount: chat.unreadCount,
      participantIds: chat.participantIds,
      participants: chat.participantNames,
      avatar: chat.avatar,
    }))
    .filter(message => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      return message.name.toLowerCase().includes(query) ||
             message.lastMessage.toLowerCase().includes(query);
    });
  }, [chats, searchQuery]);

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <Icon name="chatbubbles-outline" size={80} color="#C7C7CC" />
      </View>
      <Text style={styles.emptyTitle}>Ingen beskeder endnu</Text>
      <Text style={styles.emptyText}>
        Når du får beskeder fra dine venner, vil de vises her
      </Text>
    </View>
  );

  const renderMessageItem = ({item}: {item: Message}) => (
    <TouchableOpacity
      style={styles.messageItem}
      activeOpacity={0.7}
      onPress={() => {
        // Navigate to chat screen
        const participantIds = item.participantIds || [];
        const participants = participantIds
          .filter(id => id !== 'current_user')
          .map((id, idx) => ({
            id,
            name: item.participants?.[idx + 1] || 'Ven',
          }));
        
        navigation.navigate('Chat', {
          chatId: item.id,
          friendId: participants.length === 1 ? participants[0].id : `group_${item.id}`,
          friendName: item.name,
          participants: participants.length > 0 ? participants : undefined,
        });
      }}>
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
        {item.unreadCount > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>
              {item.unreadCount > 99 ? '99+' : item.unreadCount}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.messageContent}>
        <View style={styles.messageHeader}>
          <Text style={styles.messageName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.messageTime}>{item.timestamp}</Text>
        </View>
        <Text
          style={[
            styles.messagePreview,
            item.unreadCount > 0 && styles.unreadPreview,
          ]}
          numberOfLines={1}>
          {item.lastMessage}
        </Text>
      </View>
      <Icon name="chevron-forward" size={20} color="#C7C7CC" />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Icon name="search" size={20} color="#8E8E93" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Søg efter beskeder..."
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
      
      <FlatList
        data={messages}
        renderItem={renderMessageItem}
        keyExtractor={item => item.id}
        contentContainerStyle={
          messages.length === 0 ? styles.emptyList : styles.list
        }
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
      />
      
      {/* Floating Action Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('NewMessage')}
        activeOpacity={0.8}>
        <Icon name="create" size={28} color="#fff" />
      </TouchableOpacity>
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
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
  list: {
    padding: 16,
  },
  messageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundCard,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
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
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  unreadBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  unreadText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  messageContent: {
    flex: 1,
    marginRight: 8,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  messageName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  messageTime: {
    fontSize: 12,
    color: colors.textMuted,
    marginLeft: 8,
  },
  messagePreview: {
    fontSize: 14,
    color: colors.textMuted,
  },
  unreadPreview: {
    color: colors.text,
    fontWeight: '500',
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
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 24,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 90, // Above the tab bar (tab bar is ~50px + some padding)
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});

export default MessagesScreen;

