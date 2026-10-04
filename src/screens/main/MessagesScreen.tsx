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
import {useFocusEffect, useNavigation, useRoute} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import {ComposeMessageFab} from '@/components/messages/ComposeMessageFab';
import {useChatStore, Chat, ChatMessage} from '@/store/chatStore';
import {CURRENT_USER_PLACEHOLDER_ID} from '@/store/groupStore';
import {useAppStore} from '@/store/appStore';
import {getInitialChats, getInitialMessages} from '@/services/data';
import {sortChatsByLastActivity} from '@/utils/chatListSort';
import {useDmInboxUnreadSync} from '@/hooks/useDmInboxUnreadSync';
import {supabase} from '@/services/supabase/supabaseClient';
import {useFormatRelativeTime} from '@/hooks/useFormatRelativeTime';
import {useOptionalBottomTabBarHeight} from '@/hooks/useOptionalBottomTabBarHeight';
import {useTranslation} from '@/i18n';
import {useNotificationStore} from '@/store/notificationStore';
import {usePendingFriendRequestStore} from '@/store/pendingFriendRequestStore';
import {safeDisplayName} from '@/utils/displayName';
import {getMessagePreview} from '@/utils/dmMessagePreview';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
import {EmptyState} from '@/components/ui/EmptyState';
import {UserAvatar} from '@/components/ui/UserAvatar';
import {shouldShowMessagesInlineTitle} from '@/screens/main/messagesPresentation';
import SayHiRequestsSheet from '@/components/social/SayHiRequestsSheet';
import {listIncomingSayHiRequests} from '@/services/supabase/sayHiService';

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

const FriendRequestsBanner = ({
  onPress,
  pendingCount,
  title,
  iconName = 'person-add-outline',
}: {
  onPress: () => void;
  pendingCount: number;
  title?: string;
  iconName?: string;
}) => {
  const {t} = useTranslation();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({pressed}) => [styles.friendRequestsRow, pressed && styles.friendRequestsRowPressed]}>
      <View style={styles.friendRequestsIconWrap}>
        <Icon name={iconName} size={16} color={colors.primary} />
      </View>
      <Text style={styles.friendRequestsBannerTitle} numberOfLines={1}>
        {title ?? t('messages.friendRequestsTitle')}
      </Text>
      {pendingCount > 0 ? (
        <View style={styles.friendRequestsCountBadge}>
          <Text style={styles.friendRequestsCountText}>
            {pendingCount > 99 ? '99+' : pendingCount}
          </Text>
        </View>
      ) : null}
      <Icon name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
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
          <UserAvatar
            name={safeDisplayName(item.name)}
            imageUrl={item.avatar}
            size="lg"
          />
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
      </Animated.View>
    </Pressable>
  );
};

const TypingDots = () => {
  const {t} = useTranslation();
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
      <Text style={styles.typingText}>{t('phase2ui.typing')}</Text>
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
  const route = useRoute<any>();
  const {t} = useTranslation();
  const formatRelativeTime = useFormatRelativeTime();
  const chats = useChatStore(s => s.chats);
  const seedChatsFromInitial = useChatStore(s => s.seedChatsFromInitial);
  const markChatAsRead = useChatStore(s => s.markChatAsRead);
  const pendingFriendRequests = useNotificationStore(
    s => s.incomingFriendRequestCount,
  );
  const openFriendRequestsSheet = usePendingFriendRequestStore(s => s.openSheet);
  const [sayHiOpen, setSayHiOpen] = useState(false);
  const [sayHiCount, setSayHiCount] = useState(0);
  const [focusSayHiId, setFocusSayHiId] = useState<string | null>(null);

  useEffect(() => {
    if (route.params?.openSayHi) {
      setSayHiOpen(true);
      if (route.params?.sayHiRequestId) {
        setFocusSayHiId(String(route.params.sayHiRequestId));
      }
      navigation.setParams?.({openSayHi: undefined, sayHiRequestId: undefined});
    }
  }, [route.params?.openSayHi, route.params?.sayHiRequestId, navigation]);

  const refreshSayHiCount = useCallback(async () => {
    try {
      const {requests, backendUnavailable} = await listIncomingSayHiRequests();
      setSayHiCount(backendUnavailable ? 0 : requests.length);
    } catch {
      setSayHiCount(0);
    }
  }, []);
  const dmPresenceByUser = useChatStore(s => s.dmPresenceByUser);
  const upsertDmPresence = useChatStore(s => s.upsertDmPresence);
  const user = useAppStore(s => s.user);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const tabBarHeight = useOptionalBottomTabBarHeight();
  const fabBottom = tabBarHeight + spacing.md;
  const listBottomPad = fabBottom + 64;

  // Inbox unread → chatStore (shared with header badge). Does not mark messages read.
  useDmInboxUnreadSync();

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) {
        return;
      }
      void refreshSayHiCount();
    }, [user?.id, refreshSayHiCount]),
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
    return sortChatsByLastActivity(chats)
      .map((chat) => ({
        id: chat.id,
        name: safeDisplayName(getConversationTitle(chat, meId, meName)),
        lastMessage: previewForListMessage(chat.lastMessage, meId, t),
        timestamp: formatRelativeTime(chat.lastMessage?.timestamp ?? chat.lastActivity),
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
  }, [chats, searchQuery, user?.id, user?.displayName, t, formatRelativeTime]);

  const presenceTargets = useMemo(() => {
    const meId = user?.id;
    if (!meId) {
      return [];
    }
    return sortChatsByLastActivity(chats)
      .slice(0, 15)
      .map(chat => {
        const otherUserId = (chat.participantIds || []).find(
          id =>
            id !== meId &&
            id !== 'current_user' &&
            id !== CURRENT_USER_PLACEHOLDER_ID,
        );
        if (!otherUserId || !chat.id) {
          return null;
        }
        return {threadId: chat.id, otherUserId};
      })
      .filter((item): item is {threadId: string; otherUserId: string} => item != null);
  }, [chats, user?.id]);

  const presenceTargetsKey = useMemo(
    () => presenceTargets.map(item => `${item.threadId}:${item.otherUserId}`).join('|'),
    [presenceTargets],
  );

  useEffect(() => {
    if (!user?.id || presenceTargets.length === 0) {
      return;
    }
    const channels: any[] = [];
    presenceTargets.forEach(({threadId, otherUserId}) => {
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
  }, [presenceTargetsKey, presenceTargets, upsertDmPresence, user?.id]);

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
      {shouldShowMessagesInlineTitle('stack') ? (
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('messages.title')}</Text>
        </View>
      ) : null}

      {chats.length > 0 ? (
        <View
          style={[
            styles.searchWrapper,
            searchFocused && styles.searchWrapperFocused,
          ]}>
          <Icon
            name="search"
            size={17}
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
              <Icon name="close-circle" size={18} color={colors.textMuted} />
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
        ItemSeparatorComponent={() => <View style={styles.rowSeparator} />}
        ListHeaderComponent={
          <View>
            <FriendRequestsBanner
              onPress={openFriendRequestsSheet}
              pendingCount={pendingFriendRequests}
            />
            <FriendRequestsBanner
              onPress={() => setSayHiOpen(true)}
              pendingCount={sayHiCount}
              title={t('sayHi.inboxTitle')}
              iconName="hand-left-outline"
            />
          </View>
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
      <SayHiRequestsSheet
        visible={sayHiOpen}
        onClose={() => {
          setSayHiOpen(false);
          setFocusSayHiId(null);
          void refreshSayHiCount();
        }}
        focusRequestId={focusSayHiId}
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
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    backgroundColor: colors.background,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: colors.text,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    minHeight: 40,
    backgroundColor: colors.surfaceLight ?? colors.border + '55',
    borderRadius: radius.md,
  },
  searchWrapperFocused: {
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  friendRequestsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.xs,
  },
  friendRequestsRowPressed: {
    opacity: 0.7,
  },
  friendRequestsIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary + '14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendRequestsBannerTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
    flex: 1,
    minWidth: 0,
  },
  friendRequestsCountBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendRequestsCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.white,
    lineHeight: 13,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
    padding: 0,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  rowSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 64,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
  },
  rowUnread: {
    backgroundColor: 'transparent',
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: spacing.md,
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
    borderColor: colors.background,
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
    borderColor: colors.background,
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
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    flex: 1,
    letterSpacing: -0.2,
  },
  nameUnread: {
    fontWeight: '700',
    color: colors.text,
  },
  timestamp: {
    ...typography.caption,
    color: colors.textMuted,
    marginLeft: spacing.sm,
    fontSize: 12,
  },
  timestampUnread: {
    color: colors.primary,
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
