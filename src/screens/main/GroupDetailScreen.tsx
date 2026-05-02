/**
 * Group Detail Screen
 * Gruppens detaljer – beskrivelse, medlemmer, aktivitet, join/leave/invite
 */

import React, {useState, useMemo, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  Modal,
  FlatList,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation, useRoute, useFocusEffect} from '@react-navigation/native';
import {supabase} from '@/services/supabase/supabaseClient';
import {
  fetchGymlyGroupMessages,
  leaveGymlyGroup,
  fetchGymlyGroupMembers,
  inviteToGymlyGroup,
  sendGymlyGroupMessage,
} from '@/services/supabase/gymlyGroupsService';
import {useFriendStore} from '@/store/friendStore';
import type {PublicProfile} from '@/services/supabase/friendService';
import type {GymlyGroupMessageRow} from '@/types/gymlyGroups.types';
import {useGymlyGroupsStore} from '@/store/gymlyGroupsStore';
import {useInAppNotificationStore} from '@/store/inAppNotificationStore';
import ScreenHeader from '@/components/ui/ScreenHeader';
import {Card} from '@/components/ui/Card';
import {useAppStore} from '@/store/appStore';
import {useGroup, useGroupActivity} from '@/hooks/data';
import {formatRelativeTime} from '@/utils/formatRelativeTime';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
import type {GroupMember} from '@/types/group.types';

type Group = {
  id: string;
  name: string;
  description?: string;
  biography?: string;
  image?: string;
  isPrivate?: boolean;
  adminId?: string;
  members: Array<{id: string; name: string; avatar?: string; isOnline?: boolean}>;
  totalWorkouts?: number;
  totalTimeTogether?: number;
  totalCheckIns?: number;
  location?: string;
  focus?: string;
  createdAt?: Date | string;
};

const GroupDetailScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const {group: initialGroup, groupId: routeGroupId} = (route.params as any) || {};
  const {user} = useAppStore();
  const groupId = (routeGroupId as string) || initialGroup?.id;
  const refreshGymly = useGymlyGroupsStore(s => s.refresh);
  const refreshNotif = useInAppNotificationStore(s => s.refresh);
  const loadFriends = useFriendStore(s => s.load);
  const friends = useFriendStore(s => s.friends);
  const [serverMessages, setServerMessages] = useState<GymlyGroupMessageRow[]>([]);
  const [serverMembers, setServerMembers] = useState(
    () => initialGroup?.members,
  );
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  const {group: groupFromMock} = useGroup(initialGroup?.id, user?.id || 'current_user');
  const groupActivityRaw = useGroupActivity(initialGroup?.id, user?.id || 'current_user');

  const [isMember, setIsMember] = useState(() => {
    if (!user || !initialGroup?.members) return false;
    return initialGroup.members.some(
      (m: GroupMember) => m.id === user.id || m.id === 'current',
    );
  });

  const totalCheckIns =
    initialGroup?.totalCheckIns ??
    groupFromMock?.totalCheckIns ??
    (initialGroup?.totalWorkouts ?? 0) * 2;

  const groupActivity = useMemo(
    () =>
      [...groupActivityRaw]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 5),
    [groupActivityRaw]
  );

  const isRealGroup =
    groupId && typeof groupId === 'string' && !groupId.startsWith('g_');

  const loadMembersOnly = useCallback(async () => {
    if (!isRealGroup || !user?.id || !groupId) {
      return;
    }
    try {
      const mem = await fetchGymlyGroupMembers(groupId);
      const mapped = mem.map(m => ({
        id: m.user_id,
        name: m.displayName,
        avatar: m.avatarUrl ?? undefined,
        isOnline: false,
      }));
      setServerMembers(mapped);
      if (user?.id) {
        setIsMember(mapped.some(m => m.id === user.id));
      }
    } catch {
      /* tabel findes muligvis ikke */
    }
  }, [isRealGroup, groupId, user?.id]);

  const loadMessagesOnly = useCallback(async () => {
    if (!isRealGroup || !user?.id || !groupId) {
      return;
    }
    try {
      const msg = await fetchGymlyGroupMessages(groupId, 50);
      setServerMessages([...msg].reverse());
    } catch {
      /* tabel findes muligvis ikke */
    }
  }, [isRealGroup, groupId, user?.id]);

  const loadServerData = useCallback(async () => {
    await Promise.all([loadMembersOnly(), loadMessagesOnly()]);
  }, [loadMembersOnly, loadMessagesOnly]);


  useFocusEffect(
    useCallback(() => {
      void loadServerData();
    }, [loadServerData]),
  );

  useEffect(() => {
    if (!isRealGroup || !groupId) {
      return;
    }
    const ch = supabase
      .channel(`gymly_gd_msg_${groupId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'gymly_group_messages',
          filter: `group_id=eq.${groupId}`,
        },
        () => {
          void loadMessagesOnly();
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'gymly_group_members',
          filter: `group_id=eq.${groupId}`,
        },
        () => {
          void loadMembersOnly();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [isRealGroup, groupId, loadMessagesOnly, loadMembersOnly]);

  const displayMembers = serverMembers ?? initialGroup?.members;

  const isAdmin =
    user && initialGroup?.adminId && (initialGroup.adminId === user.id || initialGroup.adminId === 'current');

  const handleJoin = () => {
    if (isRealGroup) {
      Alert.alert(
        'Kun med invitation',
        'Gruppen er privat. Be et medlem om en invitation for at være med.',
      );
      return;
    }
    setIsMember(true);
    Alert.alert('Velkommen!', `Du er nu medlem af ${initialGroup.name}`);
  };

  const handleLeave = () => {
    Alert.alert(
      'Forlad gruppe',
      `Er du sikker på at du vil forlade ${initialGroup.name}?`,
      [
        {text: 'Annuller', style: 'cancel'},
        {
          text: 'Forlad',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              if (isRealGroup && user?.id) {
                try {
                  await leaveGymlyGroup(groupId);
                  await refreshGymly(user.id);
                  await refreshNotif(user.id);
                } catch (e) {
                  console.warn('leaveGymlyGroup', e);
                }
              }
              setIsMember(false);
              navigation.goBack();
            })();
          },
        },
      ]
    );
  };

  const handleInvite = () => {
    if (!user?.id) {
      return;
    }
    setInviteModalVisible(true);
    void loadFriends(user.id);
  };

  const memberIdSet = useMemo(() => {
    const s = new Set<string>();
    (serverMembers ?? initialGroup?.members ?? []).forEach((m: GroupMember) =>
      s.add(m.id),
    );
    return s;
  }, [serverMembers, initialGroup?.members]);

  const inviteCandidates = useMemo(
    () =>
      friends.filter(
        f => f.id !== user?.id && !memberIdSet.has(f.id),
      ),
    [friends, user?.id, memberIdSet],
  );

  const onPickFriendToInvite = async (p: PublicProfile) => {
    if (!groupId || !user?.id) {
      return;
    }
    setInvitingId(p.id);
    try {
      await inviteToGymlyGroup(groupId, p.id);
      await refreshGymly(user.id);
      await refreshNotif(user.id);
      setInviteModalVisible(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Kunne ikke invitere', msg);
    } finally {
      setInvitingId(null);
    }
  };

  const handleSendGroupChat = async () => {
    const t = messageDraft.trim();
    if (!t || !groupId || !isRealGroup || !user?.id) {
      return;
    }
    setSendingMessage(true);
    try {
      await sendGymlyGroupMessage(groupId, t, 'text');
      setMessageDraft('');
      await loadMessagesOnly();
      await refreshGymly(user.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Kunne ikke sende', msg);
    } finally {
      setSendingMessage(false);
    }
  };

  if (!initialGroup) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Gruppe" onBack={() => navigation.goBack()} />
        <View style={styles.errorContainer}>
          <Icon name="alert-circle-outline" size={48} color={colors.textMuted} />
          <Text style={styles.errorText}>Gruppe ikke fundet</Text>
        </View>
      </View>
    );
  }

  const createdAtDate =
    typeof initialGroup.createdAt === 'string'
      ? new Date(initialGroup.createdAt)
      : initialGroup.createdAt ?? new Date();

  const formatTime = (minutes: number): string => {
    if (!minutes || minutes === 0) return '0 min';
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h}t` : `${h}t ${m}m`;
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
      <ScreenHeader
        title={initialGroup.name}
        onBack={() => navigation.goBack()}
        rightElement={
          isAdmin ? (
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('EditGroup', {
                  group: {
                    ...initialGroup,
                    createdAt:
                      typeof initialGroup.createdAt === 'string'
                        ? initialGroup.createdAt
                        : initialGroup.createdAt?.toISOString?.(),
                  },
                })
              }>
              <Icon name="create-outline" size={24} color={colors.primary} />
            </TouchableOpacity>
          ) : undefined
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.groupIcon}>
            {initialGroup.image ? (
              <Image
                source={{uri: initialGroup.image}}
                style={styles.groupImage}
                resizeMode="cover"
              />
            ) : (
              <Icon name="people" size={48} color={colors.primary} />
            )}
            {initialGroup.isPrivate && (
              <View style={styles.privateBadge}>
                <Icon name="lock-closed" size={14} color={colors.white} />
              </View>
            )}
          </View>
          <Text style={styles.groupName}>{initialGroup.name}</Text>
          {(initialGroup.location || initialGroup.focus) && (
            <Text style={styles.groupMeta}>
              {[initialGroup.location, initialGroup.focus]
                .filter(Boolean)
                .join(' • ')}
            </Text>
          )}
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.description}>
            {initialGroup.biography || initialGroup.description || 'Ingen beskrivelse'}
          </Text>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Icon name="checkmark-circle" size={24} color={colors.primary} />
            <Text style={styles.statValue}>{totalCheckIns}</Text>
            <Text style={styles.statLabel}>Check-ins</Text>
          </View>
          <View style={styles.statCard}>
            <Icon name="people" size={24} color={colors.primary} />
            <Text style={styles.statValue}>
              {displayMembers?.length ?? initialGroup.members?.length ?? 0}
            </Text>
            <Text style={styles.statLabel}>Medlemmer</Text>
          </View>
          <View style={styles.statCard}>
            <Icon name="time" size={24} color={colors.primary} />
            <Text style={styles.statValue}>
              {formatTime(initialGroup.totalTimeTogether ?? 0)}
            </Text>
            <Text style={styles.statLabel}>Træningstid</Text>
          </View>
        </View>

        {/* CTAs */}
        <View style={styles.ctaRow}>
          {isMember ? (
            <>
              <TouchableOpacity
                style={styles.ctaPrimary}
                onPress={handleInvite}
                activeOpacity={0.8}>
                <Icon name="person-add" size={20} color={colors.white} />
                <Text style={styles.ctaPrimaryText}>Inviter</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ctaSecondary}
                onPress={handleLeave}
                activeOpacity={0.8}>
                <Text style={styles.ctaSecondaryText}>Forlad gruppe</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.ctaJoin}
              onPress={handleJoin}
              activeOpacity={0.8}>
              <Icon name="add-circle" size={24} color={colors.white} />
              <Text style={styles.ctaJoinText}>Join gruppe</Text>
            </TouchableOpacity>
          )}
        </View>

        {isRealGroup && isMember && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Gruppechat</Text>
            {serverMessages.length > 0 ? (
              <Card variant="outlined" padding="md">
                {serverMessages.map(m => (
                  <View key={m.id} style={styles.activityRow}>
                    <View style={styles.activityContent}>
                      <Text style={styles.activityText} numberOfLines={8}>
                        {m.message_type === 'text'
                          ? m.body
                          : `${m.message_type}: ${m.body || ''}`}
                      </Text>
                      <Text style={styles.activityTime}>
                        {formatRelativeTime(new Date(m.created_at))}
                      </Text>
                    </View>
                  </View>
                ))}
              </Card>
            ) : (
              <Text style={styles.emptyChatHint}>Ingen beskeder endnu – sig hej 👋</Text>
            )}
            <View style={styles.composerRow}>
              <TextInput
                style={styles.composerInput}
                value={messageDraft}
                onChangeText={setMessageDraft}
                placeholder="Skriv til gruppen…"
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={2000}
                editable={!sendingMessage}
              />
              <TouchableOpacity
                style={[
                  styles.composerSend,
                  (!messageDraft.trim() || sendingMessage) && styles.composerSendDisabled,
                ]}
                onPress={() => {
                  void handleSendGroupChat();
                }}
                disabled={!messageDraft.trim() || sendingMessage}>
                {sendingMessage ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Icon name="send" size={20} color={colors.white} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Activity feed preview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Seneste aktivitet</Text>
          {groupActivity.length > 0 ? (
            <Card variant="outlined" padding="md">
              {groupActivity.map(activity => (
                <View key={activity.id} style={styles.activityRow}>
                  <View style={styles.activityAvatar}>
                    <Text style={styles.activityAvatarText}>
                      {activity.userName.charAt(0)}
                    </Text>
                  </View>
                  <View style={styles.activityContent}>
                    <Text style={styles.activityText}>{activity.message}</Text>
                    <Text style={styles.activityTime}>
                      {formatRelativeTime(activity.timestamp)}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          ) : (
            <View style={styles.emptyActivity}>
              <Icon name="pulse-outline" size={32} color={colors.textMuted} />
              <Text style={styles.emptyActivityText}>
                Ingen aktivitet endnu
              </Text>
              <Text style={styles.emptyActivitySubtext}>
                Tjek ind for at vise aktivitet her
              </Text>
            </View>
          )}
        </View>

        {/* Members */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Medlemmer ({displayMembers?.length ?? initialGroup.members?.length ?? 0})
          </Text>
          <View style={styles.membersCard}>
            {displayMembers?.map((member: GroupMember, idx: number) => {
              const isCurrentUser =
                user && (member.id === user.id || member.id === 'current');
              const isGroupAdmin = member.id === initialGroup.adminId;
              return (
                <TouchableOpacity
                  key={member.id}
                  style={[
                    styles.memberRow,
                    idx < (displayMembers?.length ?? 0) - 1 && styles.memberRowBorder,
                  ]}
                  onPress={() => {
                    if (!isCurrentUser) {
                      navigation.navigate('FriendProfile', {
                        friendId: member.id,
                        friendName: member.name,
                        mutualFriends: 0,
                        gyms: [],
                      });
                    }
                  }}
                  activeOpacity={0.8}>
                  <View style={styles.memberAvatar}>
                    {member.avatar ? (
                      <Image
                        source={{uri: member.avatar}}
                        style={styles.memberAvatarImage}
                      />
                    ) : (
                      <Text style={styles.memberAvatarText}>
                        {member.name.charAt(0)}
                      </Text>
                    )}
                    {member.isOnline && <View style={styles.onlineDot} />}
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>
                      {isCurrentUser ? 'Dig' : member.name}
                      {isGroupAdmin && (
                        <Text style={styles.adminLabel}> • Admin</Text>
                      )}
                    </Text>
                    <Text
                      style={[
                        styles.memberStatus,
                        member.isOnline && styles.memberStatusOnline,
                      ]}>
                      {member.isOnline ? 'Online' : 'Offline'}
                    </Text>
                  </View>
                  {!isCurrentUser && (
                    <Icon name="chevron-forward" size={18} color={colors.textMuted} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Created */}
        <View style={styles.metadata}>
          <Icon name="calendar-outline" size={16} color={colors.textMuted} />
          <Text style={styles.metadataText}>
            Oprettet{' '}
            {createdAtDate.toLocaleDateString('da-DK', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </Text>
        </View>
      </ScrollView>

      <Modal
        visible={inviteModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setInviteModalVisible(false)}>
        <View style={styles.inviteModal}>
          <View style={styles.inviteHeader}>
            <Text style={styles.inviteTitle}>Inviter ven</Text>
            <TouchableOpacity
              onPress={() => setInviteModalVisible(false)}
              hitSlop={12}>
              <Text style={styles.inviteClose}>Luk</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.inviteSub}>
            Vælg en ven – du skal være venner, og de må ikke allerede være
            medlem.
          </Text>
          {inviteCandidates.length === 0 ? (
            <View style={styles.inviteEmpty}>
              <Text style={styles.emptyChatHint}>
                Ingen venner at invitere lige nu.
              </Text>
            </View>
          ) : (
            <FlatList
              data={inviteCandidates}
              keyExtractor={it => it.id}
              contentContainerStyle={styles.inviteList}
              renderItem={({item}) => (
                <TouchableOpacity
                  style={styles.inviteRow}
                  onPress={() => {
                    void onPickFriendToInvite(item);
                  }}
                  disabled={invitingId != null}>
                  <View style={styles.inviteAvatar}>
                    <Text style={styles.inviteAvatarText}>
                      {(item.displayName || item.username || '?').charAt(0)}
                    </Text>
                  </View>
                  <Text style={styles.inviteName}>
                    {item.displayName?.trim() || item.username || 'Bruger'}
                  </Text>
                  {invitingId === item.id ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Icon name="chevron-forward" size={20} color={colors.textMuted} />
                  )}
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {flex: 1},
  scrollContent: {paddingBottom: spacing.xxxl},
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  errorText: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  header: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  groupIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    position: 'relative',
  },
  groupImage: {
    width: '100%',
    height: '100%',
    borderRadius: 44,
  },
  privateBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: colors.textMuted,
    borderRadius: 10,
    padding: 4,
  },
  groupName: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
  },
  groupMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  description: {
    ...typography.body,
    color: colors.text,
    lineHeight: 24,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.backgroundCard,
    padding: spacing.md,
    borderRadius: radius.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    ...typography.h4,
    color: colors.text,
    marginTop: spacing.sm,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  ctaRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  ctaPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
  },
  ctaPrimaryText: {
    ...typography.bodyBold,
    color: colors.white,
  },
  ctaSecondary: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  ctaSecondaryText: {
    ...typography.bodyBold,
    color: colors.error,
  },
  ctaJoin: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
  },
  ctaJoinText: {
    ...typography.bodyBold,
    color: colors.white,
  },
  sectionTitle: {
    ...typography.h4,
    color: colors.text,
    marginBottom: spacing.md,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  activityAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  activityAvatarText: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  activityContent: {flex: 1},
  activityText: {
    ...typography.body,
    color: colors.text,
  },
  activityTime: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  emptyActivity: {
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  emptyActivityText: {
    ...typography.body,
    color: colors.text,
    marginTop: spacing.sm,
  },
  emptyChatHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  composerInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm,
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.backgroundCard,
  },
  composerSend: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerSendDisabled: {
    opacity: 0.5,
  },
  inviteModal: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: spacing.xl,
  },
  inviteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  inviteTitle: {
    ...typography.h4,
    color: colors.text,
  },
  inviteClose: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  inviteSub: {
    ...typography.caption,
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  inviteEmpty: {padding: spacing.xl, alignItems: 'center'},
  inviteList: {paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl},
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  inviteAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary + '22',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  inviteAvatarText: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  inviteName: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
  emptyActivitySubtext: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  membersCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  memberRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    position: 'relative',
  },
  memberAvatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  memberAvatarText: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.backgroundCard,
  },
  memberInfo: {flex: 1},
  memberName: {
    ...typography.bodyBold,
    color: colors.text,
  },
  adminLabel: {
    ...typography.small,
    color: colors.warning,
    fontWeight: '400',
  },
  memberStatus: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  memberStatusOnline: {
    color: colors.success,
  },
  metadata: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  metadataText: {
    ...typography.caption,
    color: colors.textMuted,
  },
});

export default GroupDetailScreen;
