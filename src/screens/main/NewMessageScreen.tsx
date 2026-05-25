/**
 * New Message Screen — compose DM to friend(s)
 */

import React, {
  useRef,
  useState,
  useMemo,
  useCallback,
  useEffect,
  useId,
} from 'react';
import type {LayoutChangeEvent} from 'react-native';
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
  Pressable,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import {useChatStore} from '@/store/chatStore';
import {useGroupStore, CURRENT_USER_PLACEHOLDER_ID, GymlyGroup} from '@/store/groupStore';
import {useAppStore} from '@/store/appStore';
import {listFriendsWithProfiles} from '@/services/supabase/friendService';
import {getOrCreateDmThread} from '@/services/supabase/dmService';
import colors from '@/theme/colors';
import {spacing, radius, shadows, typography} from '@/theme/designTokens';
import {UserAvatar} from '@/components/ui/UserAvatar';
import {SURFACE_GROUPS_IN_APP} from '@/config/launchSurfaceConfig';
import {useTranslation} from '@/i18n';

type FriendChip = {id: string; name: string; avatar: string | null};

function RecipientChip({
  label,
  avatarUrl,
  onRemove,
}: {
  label: string;
  avatarUrl?: string | null;
  onRemove: () => void;
}) {
  const gradId = useId().replace(/:/g, '');
  const initial = label.trim().charAt(0).toUpperCase() || '?';
  const [size, setSize] = useState({w: 1, h: 40});

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const {width, height} = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setSize({w: width, h: height});
    }
  }, []);

  return (
    <View style={chipStyles.wrap}>
      <View style={chipStyles.gradientClip} onLayout={onLayout}>
        <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={colors.primaryLight} />
              <Stop offset="50%" stopColor={colors.primary} />
              <Stop offset="100%" stopColor={colors.primaryDark} />
            </LinearGradient>
          </Defs>
          <Rect
            x={0}
            y={0}
            width={size.w}
            height={size.h}
            rx={size.h / 2}
            fill={`url(#${gradId})`}
          />
        </Svg>
        <View style={chipStyles.inner}>
          {avatarUrl ? (
            <Image source={{uri: avatarUrl}} style={chipStyles.avatar} />
          ) : (
            <View style={chipStyles.avatarFallback}>
              <Text style={chipStyles.avatarInitial}>{initial}</Text>
            </View>
          )}
          <Text style={chipStyles.label} numberOfLines={1}>
            {label}
          </Text>
          <Pressable
            onPress={onRemove}
            hitSlop={8}
            style={chipStyles.removeHit}
            accessibilityLabel="Fjern modtager">
            <View style={chipStyles.removeCircle}>
              <Icon name="close" size={14} color={colors.white} />
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  wrap: {
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
    maxWidth: '100%',
  },
  gradientClip: {
    borderRadius: radius.full,
    overflow: 'hidden',
    ...shadows.sm,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.sm,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  avatarFallback: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
    flexShrink: 1,
    maxWidth: 200,
  },
  removeHit: {
    marginLeft: spacing.xs,
  },
  removeCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const NewMessageScreen = ({navigation}: any) => {
  const {getChatByParticipants, addChat, initializeChatMessages, upsertChat} =
    useChatStore();
  const {groups} = useGroupStore();
  const {user} = useAppStore();
  const insets = useSafeAreaInsets();
  const {t} = useTranslation();

  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<GymlyGroup | null>(null);
  const [message, setMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchActive, setSearchActive] = useState(true);
  const [friends, setFriends] = useState<FriendChip[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);

  useEffect(() => {
    if (!SURFACE_GROUPS_IN_APP) {
      setSelectedGroup(null);
    }
  }, []);

  const searchInputRef = useRef<TextInput>(null);
  const messageInputRef = useRef<TextInput>(null);

  const currentUserId = user?.id || CURRENT_USER_PLACEHOLDER_ID;
  const currentUserName = user?.displayName || 'Dig';
  const hasRecipient = selectedFriends.length > 0 || !!selectedGroup;
  const canSend = message.trim().length > 0 && hasRecipient;

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
    if (!hasRecipient) {
      Alert.alert(
        t('newMessage.selectRecipientTitle'),
        SURFACE_GROUPS_IN_APP
          ? t('newMessage.selectRecipientGroup')
          : t('newMessage.selectRecipientFriend'),
      );
      return;
    }
    if (!message.trim()) {
      Alert.alert(t('newMessage.emptyMessage'), t('newMessage.writeMessage'));
      return;
    }

    const trimmedMessage = message.trim();

    if (SURFACE_GROUPS_IN_APP && selectedGroup) {
      const members = normalizedGroupMembers(selectedGroup);
      const participantIds = Array.from(
        new Set([...members.map(member => member.id), currentUserId]),
      );
      const participantNames = participantIds.map(id => {
        if (id === currentUserId) {
          return currentUserName;
        }
        return members.find(member => member.id === id)?.name || 'Ven';
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
      Keyboard.dismiss();
      return;
    }

    const friendObjects = friends.filter(friend =>
      selectedFriends.includes(friend.id),
    );

    if (friendObjects.length === 0) {
      Alert.alert(t('newMessage.oops'), t('newMessage.couldNotFindFriends'));
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
          participantNames: allParticipantIds.map(id => nameById[id] ?? 'Ven'),
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
        Alert.alert(t('friendsScreen.messageError'), (e as Error).message);
        return;
      }
    } else if (existingChat) {
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
        participantNames: allParticipantIds.map(id => nameById[id] ?? 'Ven'),
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

    setMessage('');
    setSelectedFriends([]);
    setSearchQuery('');
    setSearchActive(true);
    Keyboard.dismiss();
  };

  const handleSelectFriend = (friendId: string) => {
    if (selectedFriends.includes(friendId)) {
      return;
    }
    setSelectedFriends(prev => [...prev, friendId]);
    setSelectedGroup(null);
    setSearchQuery('');
    setSearchActive(false);
    Keyboard.dismiss();
    setTimeout(() => messageInputRef.current?.focus(), 120);
  };

  const handleSelectGroup = (group: GymlyGroup) => {
    setSelectedGroup(group);
    setSelectedFriends([]);
    setSearchQuery('');
    setSearchActive(false);
    Keyboard.dismiss();
    setTimeout(() => messageInputRef.current?.focus(), 120);
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

  return (
    <View style={styles.root}>
      <View style={[styles.header, {paddingTop: insets.top + spacing.sm}]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
          accessibilityLabel="Tilbage">
          <Icon name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('newMessage.title')}</Text>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.recipientCard}>
        <Text style={styles.tilLabel}>{t('newMessage.to')}</Text>
        <View style={styles.searchRow}>
          <Icon name="search" size={18} color={colors.textMuted} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder={
              selectedFriends.length > 0
                ? t('newMessage.searchMore')
                : t('newMessage.searchFriends')
            }
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setSearchActive(true)}
            returnKeyType="search"
          />
          {searchQuery.length > 0 ? (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <Icon name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {hasRecipient ? (
          <View style={styles.chipRow}>
            {selectedGroup ? (
              <RecipientChip
                label={selectedGroup.name}
                avatarUrl={selectedGroup.image}
                onRemove={handleRemoveGroup}
              />
            ) : null}
            {selectedFriends.map(friendId => {
              const friend = friends.find(f => f.id === friendId);
              if (!friend) {
                return null;
              }
              return (
                <RecipientChip
                  key={friend.id}
                  label={friend.name}
                  avatarUrl={friend.avatar}
                  onRemove={() => handleRemoveFriend(friend.id)}
                />
              );
            })}
          </View>
        ) : null}
      </View>

      {searchActive ? (
        <ScrollView
          style={styles.listScroll}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {SURFACE_GROUPS_IN_APP && filteredGroups.length > 0 ? (
            <View style={styles.listSection}>
              <Text style={styles.listSectionLabel}>{t('friendsTabs.groups')}</Text>
              {filteredGroups.map(group => {
                const members = normalizedGroupMembers(group).filter(
                  member => member.id !== currentUserId,
                );
                return (
                  <TouchableOpacity
                    key={group.id}
                    style={styles.listRow}
                    onPress={() => handleSelectGroup(group)}
                    activeOpacity={0.65}>
                    {group.image ? (
                      <Image source={{uri: group.image}} style={styles.listRowAvatar} />
                    ) : (
                      <View style={styles.listRowAvatarPlaceholder}>
                        <Text style={styles.listRowAvatarLetter}>
                          {group.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={styles.listRowBody}>
                      <Text style={styles.listRowTitle}>{group.name}</Text>
                      <Text style={styles.listRowSubtitle} numberOfLines={1}>
                        {members.length > 0
                          ? members.map(member => member.name).join(', ')
                          : 'Kun dig i gruppen endnu'}
                      </Text>
                    </View>
                    <Icon name="chevron-forward" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          {filteredFriends.length > 0 ? (
            <View style={styles.listSection}>
              <Text style={styles.listSectionLabel}>{t('newMessage.friends')}</Text>
              {filteredFriends.map(friend => (
                <TouchableOpacity
                  key={friend.id}
                  style={styles.listRow}
                  onPress={() => handleSelectFriend(friend.id)}
                  activeOpacity={0.65}>
                  <UserAvatar
                    name={friend.name}
                    imageUrl={friend.avatar}
                    size="md"
                    style={styles.listRowAvatarImage}
                  />
                  <Text style={styles.listRowTitleFlex}>{friend.name}</Text>
                  <Icon name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {friendsLoading &&
            filteredFriends.length === 0 &&
            (!SURFACE_GROUPS_IN_APP || filteredGroups.length === 0) && (
              <View style={styles.emptyBlock}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.emptySub}>{t('newMessage.loadingFriends')}</Text>
              </View>
            )}

          {!friendsLoading &&
            friends.length === 0 &&
            filteredFriends.length === 0 &&
            (!SURFACE_GROUPS_IN_APP || filteredGroups.length === 0) &&
            searchQuery.trim().length === 0 && (
              <View style={styles.emptyBlock}>
                <Icon name="people-outline" size={44} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>{t('newMessage.noFriends')}</Text>
                <Text style={styles.emptySub}>{t('newMessage.noFriendsSub')}</Text>
              </View>
            )}

          {!friendsLoading &&
            filteredFriends.length === 0 &&
            (!SURFACE_GROUPS_IN_APP || filteredGroups.length === 0) &&
            searchQuery.trim().length > 0 && (
              <View style={styles.emptyBlock}>
                <Icon name="search-outline" size={44} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>{t('newMessage.noResults')}</Text>
              </View>
            )}
        </ScrollView>
      ) : null}

      {hasRecipient ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}>
          <View
            style={[
              styles.composerBar,
              {paddingBottom: Math.max(insets.bottom, spacing.sm)},
            ]}>
            <View style={styles.composerCard}>
              <TextInput
                ref={messageInputRef}
                style={styles.composerInput}
                placeholder={t('newMessage.writeMessage')}
                placeholderTextColor={colors.textMuted}
                value={message}
                onChangeText={setMessage}
                multiline
                maxLength={1000}
                textAlignVertical="center"
              />
              <TouchableOpacity
                onPress={handleSend}
                disabled={!canSend}
                style={[
                  styles.sendButton,
                  canSend ? styles.sendButtonEnabled : styles.sendButtonDisabled,
                ]}
                activeOpacity={0.85}
                accessibilityLabel="Send besked">
                <Icon
                  name="paper-plane"
                  size={18}
                  color={canSend ? colors.white : colors.textMuted}
                />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.backgroundCard,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.h3,
    fontSize: 17,
    color: colors.text,
    textAlign: 'center',
  },
  headerRight: {
    width: 40,
  },
  recipientCard: {
    backgroundColor: colors.backgroundCard,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    ...shadows.card,
  },
  tilLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundCardLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm,
    gap: spacing.sm,
    ...shadows.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    padding: 0,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.md,
  },
  listScroll: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  listSection: {
    backgroundColor: colors.backgroundCard,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  listSectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  listRowAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: spacing.md,
  },
  listRowAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  listRowAvatarLetter: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.primary,
  },
  listRowAvatarImage: {
    marginRight: spacing.md,
  },
  listRowBody: {
    flex: 1,
    marginRight: spacing.sm,
  },
  listRowTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  listRowTitleFlex: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginRight: spacing.sm,
  },
  listRowSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
  },
  emptyBlock: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  emptySub: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  composerBar: {
    backgroundColor: colors.backgroundCard,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  composerCard: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.backgroundCardLight,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
    minHeight: 48,
    ...shadows.sm,
  },
  composerInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    maxHeight: 120,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    paddingRight: spacing.sm,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  sendButtonEnabled: {
    backgroundColor: colors.primary,
    ...shadows.glow,
  },
  sendButtonDisabled: {
    backgroundColor: colors.surface,
  },
});

export default NewMessageScreen;
