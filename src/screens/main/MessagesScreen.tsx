/**
 * Messages Screen
 * Premium conversation list – moderne, clean, social
 */

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Animated,
  Easing,
  Pressable,
  Platform,
} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {useBottomTabBarHeight} from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Ionicons';
import {ComposeMessageFab} from '@/components/messages/ComposeMessageFab';
import {useChatStore, Chat, ChatMessage} from '@/store/chatStore';
import {CURRENT_USER_PLACEHOLDER_ID} from '@/store/groupStore';
import {useAppStore} from '@/store/appStore';
import {isDemoContentMode} from '@/demo/demoContentGate';
import {getInitialChats, getInitialMessages} from '@/services/data';
import {syncDmInboxToStore} from '@/services/supabase/dmInboxSync';
import {supabase} from '@/services/supabase/supabaseClient';
import {useFormatRelativeTime} from '@/hooks/useFormatRelativeTime';
import {useTranslation} from '@/i18n';
import {safeDisplayName} from '@/utils/displayName';
import {getMessagePreview} from '@/utils/dmMessagePreview';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows} from '@/theme/designTokens';
import {EmptyState} from '@/components/ui/EmptyState';
import {UserAvatar} from '@/components/ui/UserAvatar';

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
  otherUserId?: string;
};

/** Kun modparten(e) i listen – ikke eget navn */
function getConversationTitle(
  chat: Chat,
  currentUserId: string | undefined,
  myDisplayName: string | undefined,
): string {
  const ids = chat.participantIds;
  const names = chat.participantNames;
  if (!names?.length) {
    return 'Besked';
  }
  if (ids?.length && names.length) {
    const n = Math.min(ids.length, names.length);
    const otherNames: string[] = [];
    for (let i = 0; i < n; i++) {
      const id = ids[i];
      if (
        (currentUserId && id === currentUserId) ||
        id === 'current_user' ||
        id === CURRENT_USER_PLACEHOLDER_ID
      ) {
        continue;
      }
      const label = names[i];
      if (label) {
        otherNames.push(safeDisplayName(label));
      }
    }
    if (otherNames.length > 0) {
      return otherNames.join(', ');
    }
  }
  const myLower = (myDisplayName || '').trim().toLowerCase();
  const filtered = names
    .map(name => safeDisplayName(name))
    .filter(
    name =>
      name &&
      name !== 'Dig' &&
      (!myLower || name.trim().toLowerCase() !== myLower),
  );
  return filtered.join(', ') || 'Gruppe';
}

const PREVIEW_MAX_LEN = 100;

function getDisplayMessageText(m: ChatMessage): string {
  return getMessagePreview(m);
}

function previewForListMessage(
  m: ChatMessage | undefined,
  myId: string | undefined,
  t: (path: string, params?: Record<string, string | number>) => string,
): string {
  if (!m) {
    return '';
  }
  const isMine =
    myId != null &&
    (m.senderId === myId ||
      m.senderId === 'current_user' ||
      m.senderId === CURRENT_USER_PLACEHOLDER_ID);
  let body = '';
  const previewText = getDisplayMessageText(m);
  if (previewText) {
    body =
      previewText.length > PREVIEW_MAX_LEN
        ? `${previewText.slice(0, PREVIEW_MAX_LEN - 1)}…`
        : previewText;
  } else if (m.imageUri) {
    body = t('messages.imagePreview');
  }
  if (!body) {
    return '';
  }
  return isMine ? t('messages.youPrefix', {message: body}) : body;
}

/** Seneste besked til listen: chat.lastMessage eller sidste i tråden */
function getLastMessageInThread(
  chat: Chat,
  messagesByChat: Record<string, ChatMessage[] | undefined>,
): ChatMessage | undefined {
  if (chat.lastMessage) {
    return chat.lastMessage;
  }
  const msgs = messagesByChat[chat.id];
  if (msgs?.length) {
    return msgs[msgs.length - 1];
  }
  return undefined;
}

function getChatListPreview(
  chat: Chat,
  messagesByChat: Record<string, ChatMessage[] | undefined>,
  myId: string | undefined,
  t: (path: string, params?: Record<string, string | number>) => string,
): string {
  const last = getLastMessageInThread(chat, messagesByChat);
  return previewForListMessage(last, myId, t);
}

function formatLastSeenText(
  lastSeenAt: number | undefined,
  t: (path: string, params?: Record<string, string | number>) => string,
): string {
  if (!lastSeenAt) {
    return t('messages.lastSeenRecent');
  }
  const diffMs = Date.now() - lastSeenAt;
  const mins = Math.max(1, Math.floor(diffMs / 60000));
  if (mins < 60) {
    return t('messages.lastSeenMinutes', {mins});
  }
  const hours = Math.floor(mins / 60);
  return t('messages.lastSeenHours', {hours});
}

const UnreadBanner = ({count}: {count: number}) => {
  const {t} = useTranslation();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(6)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 340,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 340,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [count, opacity, translateY]);

  return (
    <Animated.View
      style={[
        styles.unreadStrip,
        {opacity, transform: [{translateY}]},
      ]}>
      <View style={styles.unreadStripIconWrap}>
        <Icon name="notifications" size={16} color={colors.primary} />
      </View>
      <Text style={styles.unreadStripText}>
        {t('messages.newMessages', {count})}
      </Text>
    </Animated.View>
  );
};

type ConversationRowProps = {
  item: ConversationItem;
  presence?: {
    typingByThread?: Record<string, boolean>;
    trainingNow?: boolean;
    trainingGymName?: string;
    isActive?: boolean;
    lastSeenAt?: number;
  };
  onPress: () => void;
};

const ConversationRow = ({item, presence, onPress}: ConversationRowProps) => {
  const {t} = useTranslation();
  const scale = useRef(new Animated.Value(1)).current;
  const typing = !!presence?.typingByThread?.[item.id];
  const trainingNow = !!presence?.trainingNow;
  const isUnread = item.unreadCount > 0;
  const statusText = trainingNow
    ? t('messages.trainingNowAt', {
        gym: presence?.trainingGymName || t('messages.defaultGym'),
      })
    : presence?.isActive
      ? t('messages.activeNow')
      : formatLastSeenText(presence?.lastSeenAt, t);

  const pressIn = () => {
    Animated.spring(scale, {
      toValue: 0.985,
      friction: 9,
      tension: 280,
      useNativeDriver: true,
    }).start();
  };

  const pressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 5,
      tension: 140,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut}>
      <Animated.View
        style={[
          styles.row,
          isUnread && styles.rowUnread,
          {transform: [{scale}]},
        ]}>
        <View style={styles.avatarWrapper}>
          <View style={[styles.avatarRing, isUnread && styles.avatarRingUnread]}>
            <UserAvatar
              name={safeDisplayName(item.name)}
              imageUrl={item.avatar}
              size="lg"
            />
            <View style={styles.avatarSheen} pointerEvents="none" />
          </View>
          {(presence?.isActive || trainingNow) && <View style={styles.activeDot} />}
          {isUnread ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>
                {item.unreadCount > 99 ? '99+' : item.unreadCount}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.content}>
          <View style={styles.rowHeader}>
            <Text
              style={[styles.name, isUnread && styles.nameUnread]}
              numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={[styles.timestamp, isUnread && styles.timestampUnread]}>
              {item.timestamp}
            </Text>
          </View>
          <Text
            style={[styles.statusLine, trainingNow && styles.trainingStatus]}
            numberOfLines={1}>
            {statusText}
          </Text>
          {typing ? (
            <TypingDots />
          ) : (
            <Text
              style={[styles.preview, isUnread && styles.previewUnread]}
              numberOfLines={1}>
              {item.lastMessage || t('messages.noMessagesYet')}
            </Text>
          )}
        </View>
        <Icon name="chevron-forward" size={18} color={colors.textMuted} />
      </Animated.View>
    </Pressable>
  );
};

const TypingDots = () => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  return (
    <View style={styles.typingRow}>
      <Text style={styles.typingText}>Skriver</Text>
      {[0, 1, 2].map(i => (
        <Animated.Text
          key={i}
          style={[
            styles.typingDot,
            {
              opacity: anim.interpolate({
                inputRange: [0, 0.33, 0.66, 1],
                outputRange:
                  i === 0 ? [0.35, 1, 0.35, 0.35] : i === 1 ? [0.35, 0.35, 1, 0.35] : [0.35, 0.35, 0.35, 1],
              }),
            },
          ]}>
          .
        </Animated.Text>
      ))}
    </View>
  );
};

const MessagesScreen = () => {
  const navigation = useNavigation<any>();
  const {t} = useTranslation();
  const formatRelativeTime = useFormatRelativeTime();
  const {chats, seedChatsFromInitial, markChatAsRead} = useChatStore();
  const messagesByChat = useChatStore(s => s.messagesByChat);
  const totalMessageUnread = useChatStore(s =>
    s.chats.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0),
  );
  const dmPresenceByUser = useChatStore(s => s.dmPresenceByUser);
  const upsertDmPresence = useChatStore(s => s.upsertDmPresence);
  const {user} = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const tabBarHeight = useBottomTabBarHeight();
  const fabBottom = tabBarHeight + spacing.md;
  const listBottomPad = fabBottom + 72;

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) {
        return;
      }
      void (async () => {
        try {
          if (isDemoContentMode()) {
            return;
          }
          await syncDmInboxToStore(
            user.id,
            user.displayName?.trim() || t('common.you'),
          );
        } catch {
          // offline / RLS: ignore; liste viser cache
        }
      })();
    }, [user?.id, user?.displayName]),
  );

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
    const meId = user?.id;
    const meName = user?.displayName;
    return chats
      .map((chat) => ({
        id: chat.id,
        name: safeDisplayName(getConversationTitle(chat, meId, meName)),
        lastMessage: getChatListPreview(chat, messagesByChat, meId, t),
        timestamp: (() => {
          const last = getLastMessageInThread(chat, messagesByChat);
          return last
            ? formatRelativeTime(last.timestamp)
            : formatRelativeTime(chat.lastActivity);
        })(),
        unreadCount: chat.unreadCount,
        participantIds: chat.participantIds,
        participants: chat.participantNames,
        avatar: chat.avatar,
        avatarInitials: chat.avatarInitials,
        isActive: chat.isActive,
        otherUserId: (chat.participantIds || []).find(
          id =>
            id !== meId &&
            id !== 'current_user' &&
            id !== CURRENT_USER_PLACEHOLDER_ID,
        ),
      }))
      .filter((item) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          item.lastMessage.toLowerCase().includes(q)
        );
      });
  }, [chats, searchQuery, user?.id, user?.displayName, messagesByChat, t, formatRelativeTime]);

  useEffect(() => {
    if (!user?.id || conversations.length === 0) {
      return;
    }
    const channels: any[] = [];
    const activeConversations = conversations.filter(c => c.id && c.otherUserId);
    activeConversations.forEach(item => {
      const threadId = item.id;
      const otherUserId = item.otherUserId!;
      const channel = supabase
        .channel(`dm_presence_${threadId}`, {
          config: {presence: {key: user.id}},
        })
        .on('presence', {event: 'sync'}, () => {
          const state = channel.presenceState() as Record<string, Array<Record<string, unknown>>>;
          const remoteMeta = Object.values(state)
            .flat()
            .find(meta => meta.userId === otherUserId) as
            | {
                typing?: boolean;
                active?: boolean;
                lastSeenAt?: number;
                trainingNow?: boolean;
                trainingGymName?: string;
              }
            | undefined;
          upsertDmPresence(otherUserId, {
            isActive: !!remoteMeta?.active,
            lastSeenAt:
              typeof remoteMeta?.lastSeenAt === 'number'
                ? remoteMeta.lastSeenAt
                : undefined,
            trainingNow: !!remoteMeta?.trainingNow,
            trainingGymName:
              typeof remoteMeta?.trainingGymName === 'string'
                ? remoteMeta.trainingGymName
                : undefined,
            typingForThread: {threadId, typing: !!remoteMeta?.typing},
          });
        })
        .subscribe(status => {
          if (status === 'SUBSCRIBED') {
            channel.track({
              userId: user.id,
              active: true,
              typing: false,
              lastSeenAt: Date.now(),
            });
          }
        });
      channels.push(channel);
    });

    return () => {
      channels.forEach(ch => {
        void supabase.removeChannel(ch);
      });
    };
  }, [conversations, upsertDmPresence, user?.id]);

  const handleOpenChat = (item: ConversationItem) => {
    const myId = user?.id;
    const participantIds = item.participantIds || [];
    const participants = participantIds
      .filter(
        id =>
          id !== 'current_user' &&
          id !== CURRENT_USER_PLACEHOLDER_ID &&
          (myId ? id !== myId : true),
      )
      .map(id => ({
        id,
        name: safeDisplayName(item.participants?.[participantIds.indexOf(id)], 'Ukendt bruger'),
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
    <ConversationRow
      item={item}
      presence={item.otherUserId ? dmPresenceByUser[item.otherUserId] : undefined}
      onPress={() => handleOpenChat(item)}
    />
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('messages.title')}</Text>
        <Text style={styles.headerSubtitle}>{t('messages.subtitle')}</Text>
      </View>

      {chats.length > 0 ? (
        <View
          style={[
            styles.searchWrapper,
            searchFocused && styles.searchWrapperFocused,
          ]}>
          <Icon
            name="search"
            size={19}
            color={searchFocused ? colors.primary : colors.textMuted}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder={t('messages.searchPlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            returnKeyType="search"
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
              <Icon name="close-circle" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <FlatList
        data={conversations}
        renderItem={renderConversationItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={
          conversations.length === 0
            ? [styles.emptyContainer, {paddingBottom: listBottomPad}]
            : [styles.list, {paddingBottom: listBottomPad}]
        }
        ListHeaderComponent={
          totalMessageUnread > 0 && conversations.length > 0 ? (
            <UnreadBanner count={totalMessageUnread} />
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="chatbubbles-outline"
            title={t('messages.noMessagesYet')}
            message={t('messages.emptyMessage')}
            actionLabel={t('messages.startConversation')}
            onAction={() => navigation.navigate('NewMessage')}
          />
        }
        showsVerticalScrollIndicator={false}
      />

      <ComposeMessageFab
        bottom={fabBottom}
        right={spacing.lg}
        onPress={() => navigation.navigate('NewMessage')}
      />
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
    backgroundColor: colors.background,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: colors.text,
  },
  headerSubtitle: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 5,
    lineHeight: 20,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  searchWrapperFocused: {
    borderColor: colors.primary + '55',
    backgroundColor: colors.white,
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: {width: 0, height: 0},
        shadowOpacity: 0.14,
        shadowRadius: 10,
      },
      android: {elevation: 3},
    }),
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  unreadStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.primary + '0A',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.primary + '22',
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.1,
        shadowRadius: 10,
      },
      android: {elevation: 2},
    }),
  },
  unreadStripIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadStripText: {
    ...typography.small,
    color: colors.text,
    flex: 1,
    fontWeight: '600',
    lineHeight: 19,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    padding: 0,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.backgroundCard,
    marginBottom: spacing.sm,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border + 'CC',
    ...shadows.sm,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: {width: 0, height: 3},
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
      android: {elevation: 2},
    }),
  },
  rowUnread: {
    backgroundColor: colors.primary + '07',
    borderColor: colors.primary + '40',
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: {elevation: 3},
    }),
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: spacing.md,
  },
  avatarRing: {
    borderRadius: 999,
    padding: 2,
    overflow: 'hidden',
    backgroundColor: colors.primaryLight,
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.18,
        shadowRadius: 6,
      },
      android: {elevation: 2},
    }),
  },
  avatarRingUnread: {
    backgroundColor: colors.primary,
  },
  avatarSheen: {
    position: 'absolute',
    top: 4,
    left: 8,
    right: 8,
    height: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  activeDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.backgroundCard,
  },
  unreadBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: colors.primary,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: colors.backgroundCard,
    ...Platform.select({
      ios: {
        shadowColor: colors.primaryDark,
        shadowOffset: {width: 0, height: 1},
        shadowOpacity: 0.35,
        shadowRadius: 3,
      },
      android: {elevation: 3},
    }),
  },
  unreadText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.white,
    lineHeight: 12,
  },
  content: {
    flex: 1,
    minWidth: 0,
    marginRight: spacing.xs,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    letterSpacing: -0.2,
  },
  nameUnread: {
    fontWeight: '800',
    color: colors.text,
  },
  timestamp: {
    ...typography.caption,
    color: colors.textMuted,
    marginLeft: spacing.sm,
    fontSize: 12,
  },
  timestampUnread: {
    color: colors.primaryDark,
    fontWeight: '600',
  },
  preview: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 1,
    lineHeight: 18,
  },
  statusLine: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 1,
    lineHeight: 16,
  },
  trainingStatus: {
    color: colors.primary,
    fontWeight: '600',
  },
  previewUnread: {
    color: colors.text,
    fontWeight: '600',
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 1,
  },
  typingText: {
    ...typography.small,
    color: colors.primary,
    fontStyle: 'italic',
    fontWeight: '600',
  },
  typingDot: {
    ...typography.small,
    color: colors.primary,
    fontWeight: '700',
    marginLeft: 1,
  },
});

export default MessagesScreen;
