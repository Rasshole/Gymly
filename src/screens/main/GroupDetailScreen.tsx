/**
 * Group Detail — MVP: aktive nu, ugens leaderboard, medlemmer, admin-menu
 * Visuelt aligned med Profil + Hjem cards.
 */

import React, {useCallback, useMemo, useState} from 'react';
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
  ActivityIndicator,
  Platform,
  Pressable,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useFocusEffect, useNavigation, useRoute} from '@react-navigation/native';
import ScreenHeader from '@/components/ui/ScreenHeader';
import {UserAvatar} from '@/components/ui/UserAvatar';
import {useAppStore} from '@/store/appStore';
import {useFriendStore} from '@/store/friendStore';
import {useGymlyGroupsStore} from '@/store/gymlyGroupsStore';
import {
  fetchGymlyGroup,
  fetchGymlyGroupMembers,
  fetchGymlyGroupActiveMembers,
  fetchGymlyGroupWeeklyLeaderboard,
  inviteToGymlyGroup,
  leaveGymlyGroup,
  deleteGymlyGroup,
  removeGymlyGroupMember,
  type GymlyGroupActiveMember,
} from '@/services/supabase/gymlyGroupsService';
import {
  fetchGymlyGroupStats,
  fetchActiveGymlyGroupSession,
  fetchRecentGymlyGroupSessions,
  formatGroupDurationLabel,
  type GymlyGroupStats,
  type GymlyActiveGroupSession,
  type GymlyRecentGroupSession,
} from '@/services/supabase/gymlyGroupSessionService';
import SocialPrimaryButton from '@/components/social/SocialPrimaryButton';
import type {GymlyGroupRow} from '@/types/gymlyGroups.types';
import {formatTrainingDurationDa} from '@/utils/socialTrainingLive';
import {formatWeeklyRankLabel} from '@/utils/weeklySummary';
import type {WeeklyFriendLeaderboardEntry} from '@/utils/weeklySummary';
import {useTranslation} from '@/i18n';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows} from '@/theme/designTokens';

type MemberRow = {
  user_id: string;
  role: 'admin' | 'member';
  displayName: string;
  avatarUrl: string | null;
};

const listCardShadow = Platform.select({
  ios: {
    shadowColor: '#0F172A',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  android: {elevation: 2},
});

const GroupDetailScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const {t, intlLocale} = useTranslation();
  const params = (route.params as {groupId?: string; group?: {id: string; name?: string}}) || {};
  const groupId = params.groupId || params.group?.id;
  const user = useAppStore(s => s.user);
  const refreshGymly = useGymlyGroupsStore(s => s.refresh);
  const friends = useFriendStore(s => s.friends);
  const loadFriends = useFriendStore(s => s.load);

  const [group, setGroup] = useState<GymlyGroupRow | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [activeMembers, setActiveMembers] = useState<GymlyGroupActiveMember[]>([]);
  const [leaderboard, setLeaderboard] = useState<WeeklyFriendLeaderboardEntry[]>([]);
  const [stats, setStats] = useState<GymlyGroupStats | null>(null);
  const [activeSession, setActiveSession] = useState<GymlyActiveGroupSession | null>(
    null,
  );
  const [recentSessions, setRecentSessions] = useState<GymlyRecentGroupSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteVisible, setInviteVisible] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);

  const myRole = useMemo(() => {
    if (!user?.id) {
      return null;
    }
    return members.find(m => m.user_id === user.id)?.role ?? null;
  }, [members, user?.id]);

  const isAdmin = myRole === 'admin';

  const reload = useCallback(async () => {
    if (!groupId) {
      return;
    }
    setLoading(true);
    try {
      const [g, mems, active, week, groupStats, session, recent] =
        await Promise.all([
          fetchGymlyGroup(groupId),
          fetchGymlyGroupMembers(groupId),
          fetchGymlyGroupActiveMembers(groupId),
          fetchGymlyGroupWeeklyLeaderboard(groupId),
          fetchGymlyGroupStats(groupId).catch(() => null),
          fetchActiveGymlyGroupSession(groupId).catch(() => null),
          fetchRecentGymlyGroupSessions(groupId, 5).catch(() => []),
        ]);
      setGroup(g);
      setMembers(
        mems.map(m => ({
          user_id: m.user_id,
          role: m.role,
          displayName: m.displayName,
          avatarUrl: m.avatarUrl,
        })),
      );
      setActiveMembers(active);
      setLeaderboard(week);
      setStats(groupStats);
      setActiveSession(session);
      setRecentSessions(recent);
    } catch (e) {
      console.warn('GroupDetail reload', e);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      void reload();
      if (user?.id) {
        void loadFriends(user.id);
      }
    }, [reload, user?.id, loadFriends]),
  );

  const memberIds = useMemo(() => new Set(members.map(m => m.user_id)), [members]);

  const inviteCandidates = useMemo(
    () => friends.filter(f => !memberIds.has(f.id)),
    [friends, memberIds],
  );

  const openProfile = (userId: string, name: string) => {
    navigation.navigate('FriendProfile', {friendId: userId, friendName: name});
  };

  const goStartOrJoinTraining = () => {
    if (!groupId) {
      return;
    }
    navigation.navigate('CheckIn', {
      screen: 'CheckInMain',
      params: {preselectedGroupId: groupId},
    });
  };

  const onInvite = async (friendId: string) => {
    if (!groupId) {
      return;
    }
    setInvitingId(friendId);
    try {
      await inviteToGymlyGroup(groupId, friendId);
      Alert.alert(t('groups.inviteSentTitle'), t('groups.inviteSentBody'));
    } catch (e) {
      console.warn('invite', e);
      Alert.alert(t('groups.inviteFailedTitle'), t('groups.inviteFailedBody'));
    } finally {
      setInvitingId(null);
    }
  };

  const onLeave = () => {
    if (!groupId || !user?.id) {
      return;
    }
    Alert.alert(t('groups.leaveTitle'), t('groups.leaveBody'), [
      {text: t('groups.cancel'), style: 'cancel'},
      {
        text: t('groups.leaveConfirm'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await leaveGymlyGroup(groupId);
              await refreshGymly(user.id);
              navigation.goBack();
            } catch (e) {
              console.warn('leave', e);
              Alert.alert(t('groups.actionFailed'));
            }
          })();
        },
      },
    ]);
  };

  const onDelete = () => {
    if (!groupId || !user?.id) {
      return;
    }
    Alert.alert(t('groups.deleteTitle'), t('groups.deleteBody'), [
      {text: t('groups.cancel'), style: 'cancel'},
      {
        text: t('groups.deleteConfirm'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await deleteGymlyGroup(groupId);
              await refreshGymly(user.id);
              navigation.goBack();
            } catch (e) {
              console.warn('delete', e);
              Alert.alert(t('groups.actionFailed'));
            }
          })();
        },
      },
    ]);
  };

  const onRemoveMember = (member: MemberRow) => {
    if (!groupId || !user?.id) {
      return;
    }
    Alert.alert(
      t('groups.removeMemberTitle'),
      t('groups.removeMemberBody', {name: member.displayName}),
      [
        {text: t('groups.cancel'), style: 'cancel'},
        {
          text: t('groups.removeConfirm'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await removeGymlyGroupMember(groupId, member.user_id);
                await reload();
                await refreshGymly(user.id);
              } catch (e) {
                console.warn('remove', e);
                Alert.alert(t('groups.actionFailed'));
              }
            })();
          },
        },
      ],
    );
  };

  if (!groupId) {
    return (
      <View style={styles.container}>
        <ScreenHeader title={t('groups.title')} onBack={() => navigation.goBack()} showBack />
        <Text style={styles.errorText}>{t('groups.notFound')}</Text>
      </View>
    );
  }

  const title = group?.name ?? params.group?.name ?? t('groups.title');

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={title}
        onBack={() => navigation.goBack()}
        showBack
        rightElement={
          <TouchableOpacity
            onPress={() => setMenuVisible(true)}
            hitSlop={12}
            accessibilityLabel={t('groups.menu')}>
            <Icon name="ellipsis-horizontal" size={22} color={colors.text} />
          </TouchableOpacity>
        }
      />

      {loading && !group ? (
        <ActivityIndicator color={colors.primary} style={{marginTop: spacing.xl}} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            {group?.image_url ? (
              <Image source={{uri: group.image_url}} style={styles.heroImage} />
            ) : (
              <View style={styles.heroPlaceholder}>
                <Icon name="people" size={36} color={colors.white} />
              </View>
            )}
            <Text style={styles.heroName}>{group?.name}</Text>
            {group?.description ? (
              <Text style={styles.heroDesc}>{group.description}</Text>
            ) : null}
            <View style={styles.metaPill}>
              <Text style={styles.metaPillText}>
                {t('groups.memberCount', {
                  count: stats?.memberCount ?? members.length,
                })}
              </Text>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                {stats?.togetherSessionCount ?? 0}
              </Text>
              <Text style={styles.statLabel}>{t('groups.togetherTrained')}</Text>
              <Text style={styles.statHint}>{t('groups.togetherTimes')}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
                {formatGroupDurationLabel(stats?.totalDurationSeconds ?? 0)}
              </Text>
              <Text style={styles.statLabel}>{t('groups.totalTrainingTime')}</Text>
              <Text style={styles.statHint}>{t('groups.totalTrainingLabel')}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                {stats?.memberCount ?? members.length}
              </Text>
              <Text style={styles.statLabel}>{t('groups.membersInGroup')}</Text>
              <Text style={styles.statHint}>{t('groups.membersInGroupLabel')}</Text>
            </View>
          </ScrollView>

          {activeSession ? (
            <View style={styles.activeSessionCard}>
              <Text style={styles.activeSessionTitle}>
                {t('groups.activeSessionAt', {
                  gym: activeSession.gymName || activeSession.gymId,
                })}
              </Text>
              <Text style={styles.activeSessionMeta}>
                {t('groups.activeSessionPeople', {
                  count: activeSession.participants.length,
                })}
                {' · '}
                {t('groups.activeSessionFor', {
                  time: formatTrainingDurationDa(new Date(activeSession.startedAt)),
                })}
              </Text>
              <View style={styles.activeSessionAvatars}>
                {activeSession.participants.slice(0, 5).map(p => (
                  <View key={p.userId} style={styles.activeSessionAvatar}>
                    <UserAvatar
                      name={p.displayName}
                      imageUrl={p.avatarUrl}
                      size="xs"
                    />
                  </View>
                ))}
              </View>
              <SocialPrimaryButton
                label={t('groups.joinGroupTraining')}
                onPress={goStartOrJoinTraining}
                variant="premium"
                style={styles.trainCta}
              />
            </View>
          ) : (
            <SocialPrimaryButton
              label={t('groups.startGroupTraining')}
              onPress={goStartOrJoinTraining}
              variant="premium"
              style={styles.trainCta}
            />
          )}

          <Text style={styles.sectionTitle}>{t('groups.activeNow')}</Text>
          {activeMembers.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyCardText}>{t('groups.noOneTraining')}</Text>
            </View>
          ) : (
            activeMembers.map(m => (
              <Pressable
                key={m.userId}
                style={({pressed}) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => openProfile(m.userId, m.displayName)}>
                <UserAvatar
                  name={m.displayName}
                  imageUrl={m.avatarUrl}
                  size="md"
                  showOnlineIndicator
                  isOnline
                />
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {m.displayName}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={2}>
                    {m.liveExerciseName
                      ? `${m.liveExerciseName}${
                          m.liveSetCount != null ? ` · ${m.liveSetCount} sæt` : ''
                        }`
                      : m.gymName
                        ? `${m.gymName} · ${formatTrainingDurationDa(new Date(m.startedAt))}`
                        : formatTrainingDurationDa(new Date(m.startedAt))}
                  </Text>
                </View>
                <Icon name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            ))
          )}

          <Text style={styles.sectionTitle}>{t('groups.weekLeaderboard')}</Text>
          {leaderboard.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyCardText}>{t('groups.weekEmpty')}</Text>
            </View>
          ) : (
            <View style={styles.lbCard}>
              {leaderboard.map((entry, index) => (
                <View
                  key={entry.userId}
                  style={[
                    styles.lbRow,
                    index < leaderboard.length - 1 && styles.lbRowBorder,
                    entry.userId === user?.id && styles.lbRowSelf,
                  ]}>
                  <Text style={styles.rank}>{formatWeeklyRankLabel(entry.rank)}</Text>
                  <UserAvatar name={entry.name} size="sm" />
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {entry.name}
                  </Text>
                  <Text style={styles.lbCount}>
                    {t('groups.checkInCount', {count: entry.checkInCount})}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.sectionTitle}>{t('groups.recentGroupSessions')}</Text>
          {recentSessions.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyCardText}>{t('groups.recentSessionEmpty')}</Text>
            </View>
          ) : (
            recentSessions.map(s => (
              <View key={s.id} style={styles.recentCard}>
                <Text style={styles.recentGym} numberOfLines={1}>
                  {s.gymName || s.gymId}
                </Text>
                <Text style={styles.recentMeta}>
                  {new Date(s.startedAt).toLocaleDateString(intlLocale, {
                    day: 'numeric',
                    month: 'short',
                  })}
                  {' · '}
                  {formatGroupDurationLabel(s.totalDurationSeconds)}
                </Text>
                <Text style={styles.recentPeople} numberOfLines={2}>
                  {s.participantNames.join(', ')}
                </Text>
              </View>
            ))
          )}

          <View style={styles.membersHeader}>
            <Text style={[styles.sectionTitle, styles.sectionTitleInline]}>
              {t('groups.members')}
            </Text>
            <TouchableOpacity onPress={() => setInviteVisible(true)} hitSlop={8}>
              <Text style={styles.inviteLink}>{t('groups.invite')}</Text>
            </TouchableOpacity>
          </View>
          {members.map(m => (
            <Pressable
              key={m.user_id}
              style={({pressed}) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => openProfile(m.user_id, m.displayName)}
              onLongPress={
                isAdmin && m.user_id !== user?.id
                  ? () => onRemoveMember(m)
                  : undefined
              }>
              <UserAvatar name={m.displayName} imageUrl={m.avatarUrl} size="md" />
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {m.displayName}
                </Text>
                {m.role === 'admin' ? (
                  <View style={styles.adminPill}>
                    <Text style={styles.adminPillText}>{t('groups.admin')}</Text>
                  </View>
                ) : null}
              </View>
              {isAdmin && m.user_id !== user?.id ? (
                <TouchableOpacity
                  onPress={() => onRemoveMember(m)}
                  hitSlop={10}
                  accessibilityLabel={t('groups.removeConfirm')}>
                  <Icon name="remove-circle-outline" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              ) : (
                <Icon name="chevron-forward" size={16} color={colors.textMuted} />
              )}
            </Pressable>
          ))}
        </ScrollView>
      )}

      <Modal visible={menuVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.menuBackdrop}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}>
          <View style={styles.menuSheet}>
            {isAdmin ? (
              <>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setMenuVisible(false);
                    navigation.navigate('EditGroup', {
                      groupId,
                      group: {
                        id: groupId,
                        name: group?.name,
                        description: group?.description,
                        image: group?.image_url,
                        isPrivate: group?.is_private,
                        adminId: group?.created_by,
                        members: members.map(m => ({
                          id: m.user_id,
                          name: m.displayName,
                          avatar: m.avatarUrl ?? undefined,
                        })),
                      },
                    });
                  }}>
                  <Text style={styles.menuItemText}>{t('groups.edit')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setMenuVisible(false);
                    onDelete();
                  }}>
                  <Text style={[styles.menuItemText, styles.danger]}>
                    {t('groups.delete')}
                  </Text>
                </TouchableOpacity>
              </>
            ) : null}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                setInviteVisible(true);
              }}>
              <Text style={styles.menuItemText}>{t('groups.invite')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                onLeave();
              }}>
              <Text style={[styles.menuItemText, styles.danger]}>{t('groups.leave')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => setMenuVisible(false)}>
              <Text style={styles.menuItemMuted}>{t('groups.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={inviteVisible} transparent animationType="slide">
        <View style={styles.inviteModal}>
          <View style={styles.inviteSheet}>
            <View style={styles.inviteHeader}>
              <Text style={styles.inviteTitle}>{t('groups.invite')}</Text>
              <TouchableOpacity onPress={() => setInviteVisible(false)}>
                <Icon name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            {inviteCandidates.length === 0 ? (
              <Text style={styles.emptyCardText}>{t('groups.noFriendsToInvite')}</Text>
            ) : (
              <FlatList
                data={inviteCandidates}
                keyExtractor={item => item.id}
                renderItem={({item}) => (
                  <Pressable
                    style={({pressed}) => [styles.row, pressed && styles.rowPressed]}
                    onPress={() => void onInvite(item.id)}
                    disabled={invitingId === item.id}>
                    <UserAvatar
                      name={item.displayName}
                      imageUrl={item.avatarUrl}
                      size="md"
                    />
                    <Text style={[styles.rowTitle, {flex: 1}]} numberOfLines={1}>
                      {item.displayName}
                    </Text>
                    {invitingId === item.id ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <Icon name="person-add-outline" size={20} color={colors.primary} />
                    )}
                  </Pressable>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  errorText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  hero: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    marginTop: spacing.md,
  },
  heroImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
    marginBottom: spacing.md,
    borderWidth: 3,
    borderColor: colors.primary + '55',
  },
  heroPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: {width: 0, height: 4},
        shadowOpacity: 0.25,
        shadowRadius: 10,
      },
      android: {elevation: 3},
    }),
  },
  heroName: {
    ...typography.h3,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  heroDesc: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    lineHeight: 22,
  },
  metaPill: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.primary + '14',
  },
  metaPillText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
  },
  statsRow: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  statCard: {
    width: 128,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border + 'CC',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    ...shadows.sm,
    ...listCardShadow,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
    marginBottom: 4,
  },
  statLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.text,
  },
  statHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  trainCta: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  activeSessionCard: {
    backgroundColor: colors.primary + '08',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.primary + '28',
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  activeSessionTitle: {
    ...typography.bodyBold,
    color: colors.text,
  },
  activeSessionMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  activeSessionAvatars: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  activeSessionAvatar: {
    marginRight: -6,
    borderWidth: 2,
    borderColor: colors.backgroundCard,
    borderRadius: 14,
  },
  recentCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border + 'CC',
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
    ...listCardShadow,
  },
  recentGym: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  recentMeta: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  recentPeople: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 4,
  },
  sectionTitle: {
    ...typography.sectionCaps,
    color: colors.textMuted,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionTitleInline: {
    marginTop: 0,
    marginBottom: 0,
  },
  membersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  inviteLink: {
    ...typography.small,
    color: colors.primary,
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border + 'CC',
    padding: spacing.lg,
    marginBottom: spacing.sm,
    ...shadows.sm,
    ...listCardShadow,
  },
  emptyCardText: {...typography.body, color: colors.textMuted},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border + 'CC',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
    ...listCardShadow,
  },
  rowPressed: {opacity: 0.92},
  rowBody: {flex: 1, minWidth: 0},
  rowTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    flexShrink: 1,
  },
  rowSub: {...typography.caption, color: colors.textMuted, marginTop: 2},
  adminPill: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.primary + '14',
  },
  adminPillText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
  },
  lbCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border + 'CC',
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
    ...shadows.sm,
    ...listCardShadow,
  },
  lbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  lbRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  lbRowSelf: {
    backgroundColor: colors.primary + '08',
  },
  rank: {width: 28, textAlign: 'center', fontSize: 16},
  lbCount: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
    marginLeft: 'auto',
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: colors.backgroundCard,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
    ...shadows.sheet,
  },
  menuItem: {
    paddingVertical: 16,
    paddingHorizontal: spacing.lg,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  menuItemMuted: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  danger: {color: colors.error},
  inviteModal: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  inviteSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '70%',
    padding: spacing.lg,
  },
  inviteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  inviteTitle: {...typography.h4, color: colors.text},
});

export default GroupDetailScreen;
