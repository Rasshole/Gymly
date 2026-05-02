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
} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useChatStore, Chat, ChatMessage} from '@/store/chatStore';
import {CURRENT_USER_PLACEHOLDER_ID} from '@/store/groupStore';
import {useAppStore} from '@/store/appStore';
import {getInitialChats, getInitialMessages} from '@/services/data';
import {syncDmInboxToStore} from '@/services/supabase/dmInboxSync';
import {supabase} from '@/services/supabase/supabaseClient';
import {formatRelativeTime} from '@/utils/formatRelativeTime';
import {safeDisplayName} from '@/utils/displayName';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
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
const GYM_PLAN_STATUS_PREFIX = '[GYM_PLAN_STATUS]';

function formatGymPlanStatus(status: string | undefined): string {
  switch (status) {
    case 'accepted':
      return 'Accepteret';
    case 'declined':
      return 'Afvist';
    case 'pending':
      return 'Inviteret';
    case 'joined':
      return 'Joinet';
    case 'left':
      return 'Forladt';
    default:
      return 'Opdateret';
  }
}

function parseGymPlanStatusPreview(rawText: string): string | null {
  const raw = rawText.trim();
  if (!raw.startsWith(GYM_PLAN_STATUS_PREFIX)) {
    return null;
  }
  try {
    const payload = JSON.parse(
      raw.slice(GYM_PLAN_STATUS_PREFIX.length),
    ) as {status?: string};
    return formatGymPlanStatus(payload.status);
  } catch {
    return 'Opdateret træning';
  }
}

function getDisplayMessageText(m: ChatMessage): string {
  if (m.plannedWorkoutEmbed?.kind === 'status') {
    return formatGymPlanStatus(m.plannedWorkoutEmbed.status);
  }
  if (m.plannedWorkoutEmbed?.kind === 'invite') {
    return 'Inviteret';
  }
  const t = m.text?.trim() ?? '';
  if (!t) {
    return '';
  }
  return parseGymPlanStatusPreview(t) ?? t;
}

function previewForListMessage(
  m: ChatMessage | undefined,
  myId: string | undefined,
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
  const t = getDisplayMessageText(m);
  if (t) {
    body = t.length > PREVIEW_MAX_LEN ? `${t.slice(0, PREVIEW_MAX_LEN - 1)}…` : t;
  } else if (m.imageUri) {
    body = 'Billede';
  }
  if (!body) {
    return '';
  }
  return isMine ? `Du: ${body}` : body;
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
): string {
  const last = getLastMessageInThread(chat, messagesByChat);
  return previewForListMessage(last, myId);
}

function formatLastSeenText(lastSeenAt?: number): string {
  if (!lastSeenAt) {
    return 'Sidst set for nylig';
  }
  const diffMs = Date.now() - lastSeenAt;
  const mins = Math.max(1, Math.floor(diffMs / 60000));
  if (mins < 60) {
    return `Sidst set for ${mins} min siden`;
  }
  const hours = Math.floor(mins / 60);
  return `Sidst set for ${hours} t siden`;
}

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
  const {chats, seedChatsFromInitial, markChatAsRead} = useChatStore();
  const messagesByChat = useChatStore(s => s.messagesByChat);
  const totalMessageUnread = useChatStore(s =>
    s.chats.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0),
  );
  const dmPresenceByUser = useChatStore(s => s.dmPresenceByUser);
  const upsertDmPresence = useChatStore(s => s.upsertDmPresence);
  const {user} = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) {
        return;
      }
      void (async () => {
        try {
          await syncDmInboxToStore(
            user.id,
            user.displayName?.trim() || 'Dig',
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
        lastMessage: getChatListPreview(chat, messagesByChat, meId),
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
  }, [chats, searchQuery, user?.id, user?.displayName, messagesByChat]);

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
    (() => {
      const presence = item.otherUserId ? dmPresenceByUser[item.otherUserId] : undefined;
      const typing = !!presence?.typingByThread?.[item.id];
      const trainingNow = !!presence?.trainingNow;
      const statusText = trainingNow
        ? `🏋️ Træner nu i ${presence?.trainingGymName || 'center'}`
        : presence?.isActive
          ? 'Aktiv nu'
          : formatLastSeenText(presence?.lastSeenAt);
      return (
    <TouchableOpacity
      style={[styles.row, item.unreadCount > 0 && styles.rowUnread]}
      activeOpacity={0.8}
      onPress={() => handleOpenChat(item)}>
      <View style={styles.avatarWrapper}>
        <UserAvatar
          name={safeDisplayName(item.name)}
          imageUrl={item.avatar}
          size="lg"
        />
        {(presence?.isActive || trainingNow) && <View style={styles.activeDot} />}
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
        <Text style={[styles.statusLine, trainingNow && styles.trainingStatus]} numberOfLines={1}>
          {statusText}
        </Text>
        {typing ? (
          <TypingDots />
        ) : (
        <Text
          style={[
            styles.preview,
            item.unreadCount > 0 && styles.previewUnread,
          ]}
          numberOfLines={1}>
          {item.lastMessage || 'Ingen beskeder endnu'}
        </Text>
        )}
      </View>
      <Icon name="chevron-forward" size={20} color={colors.textMuted} />
    </TouchableOpacity>
      );
    })()
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
        ListHeaderComponent={
          totalMessageUnread > 0 && conversations.length > 0 ? (
            <View style={styles.unreadStrip}>
              <Icon name="notifications-outline" size={18} color={colors.primary} />
              <Text style={styles.unreadStripText}>
                {totalMessageUnread === 1
                  ? '1 ny besked – åbn samtalen nedenfor'
                  : `${totalMessageUnread} nye beskeder – åbn samtalerne nedenfor`}
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="chatbubbles-outline"
            title="Ingen beskeder endnu"
            message="Start en samtale med en ven eller find nye træningspartnere. Når du får beskeder, vises de her."
            actionLabel="Start en samtale"
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
  unreadStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.primary + '12',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary + '28',
  },
  unreadStripText: {
    ...typography.caption,
    color: colors.text,
    flex: 1,
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
  statusLine: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  trainingStatus: {
    color: colors.primary,
    fontWeight: '600',
  },
  previewUnread: {
    color: colors.text,
    fontWeight: '500',
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  typingText: {
    ...typography.small,
    color: colors.primary,
    fontStyle: 'italic',
  },
  typingDot: {
    ...typography.small,
    color: colors.primary,
    fontWeight: '700',
    marginLeft: 1,
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
