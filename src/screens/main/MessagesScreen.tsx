/**
 * Messages Screen
 * Premium conversation list – moderne, clean, social
 */

import React, {useEffect, useMemo, useState} from 'react';
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
import Icon from 'react-native-vector-icons/Ionicons';
import {useChatStore, Chat} from '@/store/chatStore';
import {getInitialChats, getInitialMessages} from '@/services/data';
import {formatRelativeTime} from '@/utils/formatRelativeTime';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
import {EmptyState} from '@/components/ui/EmptyState';

type ConversationItem = {
  id: string;
  name: string;
  lastMessage: string;
  timestamp: string;
  unreadCount: number;
  participantIds: string[];
  participants: string[];
  avatar?: string;
  avatarInitials?: string;
  isActive?: boolean;
};

const MessagesScreen = () => {
  const navigation = useNavigation<any>();
  const {chats, seedChatsFromInitial, markChatAsRead} = useChatStore();
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (chats.length === 0) {
      Promise.all([getInitialChats(), getInitialMessages()]).then(
        ([chatsData, messagesData]) => {
          if (chatsData.length > 0) {
            seedChatsFromInitial(chatsData, messagesData);
          }
        }
      );
    }
  }, [chats.length, seedChatsFromInitial]);

  const conversations = useMemo(() => {
    return chats
      .map((chat) => ({
        id: chat.id,
        name:
          chat.participantNames.filter((n) => n !== 'Dig').join(', ') || 'Gruppe',
        lastMessage: chat.lastMessage?.text || '',
        timestamp: chat.lastMessage
          ? formatRelativeTime(chat.lastMessage.timestamp)
          : formatRelativeTime(chat.lastActivity),
        unreadCount: chat.unreadCount,
        participantIds: chat.participantIds,
        participants: chat.participantNames,
        avatar: chat.avatar,
        avatarInitials: chat.avatarInitials,
        isActive: chat.isActive,
      }))
      .filter((item) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          item.lastMessage.toLowerCase().includes(q)
        );
      });
  }, [chats, searchQuery]);

  const handleOpenChat = (item: ConversationItem) => {
    const participantIds = item.participantIds || [];
    const participants = participantIds
      .filter((id) => id !== 'current_user')
      .map((id, idx) => ({
        id,
        name: item.participants?.[participantIds.indexOf(id)] || 'Ven',
      }));

    markChatAsRead(item.id);

    navigation.navigate('Chat', {
      chatId: item.id,
      friendId: participants.length === 1 ? participants[0].id : `group_${item.id}`,
      friendName: item.name,
      participants: participants.length > 0 ? participants : undefined,
    });
  };

  const renderConversationItem = ({item}: {item: ConversationItem}) => (
    <TouchableOpacity
      style={[styles.row, item.unreadCount > 0 && styles.rowUnread]}
      activeOpacity={0.8}
      onPress={() => handleOpenChat(item)}>
      <View style={styles.avatarWrapper}>
        {item.avatar ? (
          <Image source={{uri: item.avatar}} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>
              {item.avatarInitials || item.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        {item.isActive && <View style={styles.activeDot} />}
        {item.unreadCount > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>
              {item.unreadCount > 99 ? '99+' : item.unreadCount}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.content}>
        <View style={styles.rowHeader}>
          <Text
            style={[styles.name, item.unreadCount > 0 && styles.nameUnread]}
            numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.timestamp}>{item.timestamp}</Text>
        </View>
        <Text
          style={[
            styles.preview,
            item.unreadCount > 0 && styles.previewUnread,
          ]}
          numberOfLines={1}>
          {item.lastMessage || 'Ingen beskeder endnu'}
        </Text>
      </View>
      <Icon name="chevron-forward" size={20} color={colors.textMuted} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Beskeder</Text>
        <Text style={styles.headerSubtitle}>
          Chat med venner og hold styr på træningsplaner
        </Text>
      </View>

      {chats.length > 0 && (
        <View style={styles.searchWrapper}>
          <Icon name="search" size={20} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Søg i beskeder..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
              <Icon name="close-circle" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      )}

      <FlatList
        data={conversations}
        renderItem={renderConversationItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={
          conversations.length === 0 ? styles.emptyContainer : styles.list
        }
        ListEmptyComponent={
          <EmptyState
            icon="chatbubbles-outline"
            title="Ingen beskeder endnu"
            message="Start en samtale med en ven eller find nye træningspartnere. Når du får beskeder, vises de her."
            actionLabel="Ny besked"
            onAction={() => navigation.navigate('NewMessage')}
          />
        }
        showsVerticalScrollIndicator={false}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('NewMessage')}
        activeOpacity={0.9}>
        <Icon name="create" size={26} color={colors.white} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.backgroundCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    ...typography.h4,
    color: colors.text,
  },
  headerSubtitle: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 4,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    padding: 0,
  },
  list: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  emptyContainer: {
    flexGrow: 1,
    paddingBottom: spacing.xxxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.backgroundCard,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowUnread: {
    backgroundColor: colors.primary + '08',
    borderColor: colors.primary + '30',
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: spacing.md,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary + '30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  activeDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.backgroundCard,
  },
  unreadBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: colors.backgroundCard,
  },
  unreadText: {
    ...typography.badge,
    color: colors.white,
  },
  content: {
    flex: 1,
    minWidth: 0,
    marginRight: spacing.sm,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  name: {
    ...typography.bodyBold,
    color: colors.text,
    flex: 1,
  },
  nameUnread: {
    fontWeight: '700',
  },
  timestamp: {
    ...typography.caption,
    color: colors.textMuted,
    marginLeft: spacing.sm,
  },
  preview: {
    ...typography.small,
    color: colors.textSecondary,
  },
  previewUnread: {
    color: colors.text,
    fontWeight: '500',
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xl,
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
