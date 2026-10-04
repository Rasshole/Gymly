/**
 * GymPresenceScreen – aktive centre, eller detalje for ét center (live + synlige brugere).
 */
import React, {useCallback, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import {useNavigation, useRoute, useFocusEffect} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import ScreenHeader from '@/components/ui/ScreenHeader';
import {EmptyState} from '@/components/ui/EmptyState';
import {useActiveCentersRealtime} from '@/hooks/useActiveCentersRealtime';
import {ActiveCenterCard} from '@/components/ui/ActiveCenterCard';
import type {ActiveCenter, ActiveCenterSession} from '@/types/activeCenter.types';
import type {GymPresence} from '@/types/gymPresence.types';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows} from '@/theme/designTokens';
import {UserAvatar} from '@/components/ui/UserAvatar';
import {formatWorkoutTypeDisplay} from '@/utils/muscleGroupLabels';
import {formatDurationIgang} from '@/utils/activeSessionFormat';
import {getLogoSource, getDefaultGymlyLogoAsset} from '@/services/gymLogoService';
import {useAppStore} from '@/store/appStore';
import {useChatStore} from '@/store/chatStore';
import {getOrCreateDmThread} from '@/services/supabase/dmService';
import {useTranslation, getRuntimeLanguage} from '@/i18n';
import {
  formatCompactAddressForGym,
} from '@/utils/gymDisplay';
import {
  safeDisplayName,
  firstUsableDisplayName,
} from '@/utils/displayName';
import LiveMiniProfileSheet from '@/components/social/LiveMiniProfileSheet';
import type {ActiveUser} from '@/components/checkin/ActiveUsersList';
import SayHiRequestsSheet from '@/components/social/SayHiRequestsSheet';

const MAX_LIVE_AVATARS = 5;

function sortVisibleSessions(
  sessions: ActiveCenterSession[],
  friendIds: Set<string>,
  currentUserId?: string,
): ActiveCenterSession[] {
  return [...sessions].sort((a, b) => {
    const score = (s: ActiveCenterSession) => {
      if (currentUserId && s.userId === currentUserId) {
        return 0;
      }
      if (friendIds.has(s.userId)) {
        return 1;
      }
      return 2;
    };
    const byRole = score(a) - score(b);
    if (byRole !== 0) {
      return byRole;
    }
    return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime();
  });
}

const GymPresenceScreen = () => {
  const {t, tp} = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const currentUser = useAppStore(s => s.user);
  const getChatByParticipants = useChatStore(s => s.getChatByParticipants);
  const upsertChat = useChatStore(s => s.upsertChat);
  const paramCenter = route.params?.activeCenter as ActiveCenter | undefined;
  const legacyGym = route.params?.gym as GymPresence | undefined;

  const {activeCenters, refresh, loading, error} = useActiveCentersRealtime();

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const detailCenter = paramCenter
    ? activeCenters.find(c => c.centerId === paramCenter.centerId) ?? paramCenter
    : legacyGym
      ? activeCenters.find(c => c.centerId === legacyGym.gymId)
      : undefined;

  const wantDetail = Boolean(paramCenter || legacyGym);

  const friendIdSet = useMemo(() => {
    if (!detailCenter) {
      return new Set<string>();
    }
    return new Set(detailCenter.activeFriends.map(f => f.userId));
  }, [detailCenter]);

  const visibleSessions = useMemo(() => {
    if (!detailCenter) {
      return [] as ActiveCenterSession[];
    }
    const raw =
      detailCenter.activeSessions?.length > 0
        ? detailCenter.activeSessions
        : detailCenter.activeFriends;
    const unique = Array.from(
      new Map(raw.map(s => [s.userId, s])).values(),
    );
    return sortVisibleSessions(unique, friendIdSet, currentUser?.id);
  }, [detailCenter, friendIdSet, currentUser?.id]);

  const openMessage = useCallback(
    async (friendId: string, friendName: string) => {
      if (!currentUser?.id) {
        return;
      }
      const safeName = safeDisplayName(friendName);
      const participantIds = [currentUser.id, friendId].sort();
      const nameById: Record<string, string> = {
        [currentUser.id]:
          firstUsableDisplayName(currentUser.displayName, currentUser.username) ??
          t('common.you'),
        [friendId]: safeName,
      };
      const participantNames = participantIds.map(id => nameById[id] ?? t('common.friend'));
      const existingChat = getChatByParticipants(participantIds);
      try {
        const threadId = await getOrCreateDmThread(friendId);
        upsertChat({
          id: threadId,
          participantIds,
          participantNames,
          lastActivity: existingChat?.lastActivity ?? new Date(),
          unreadCount: existingChat?.unreadCount ?? 0,
          avatar: existingChat?.avatar,
          avatarInitials: existingChat?.avatarInitials,
        });
        navigation.navigate('Chat', {
          chatId: threadId,
          friendId,
          friendName: safeName,
          participants: [{id: friendId, name: safeName}],
        });
      } catch (e) {
        Alert.alert(t('friendsScreen.messageError'), (e as Error).message);
      }
    },
    [currentUser, getChatByParticipants, navigation, upsertChat, t],
  );

  const [selectedLiveUser, setSelectedLiveUser] = useState<ActiveUser | null>(
    null,
  );
  const [sayHiSheetOpen, setSayHiSheetOpen] = useState(false);
  const [focusSayHiId, setFocusSayHiId] = useState<string | null>(null);

  const openProfile = useCallback(
    (session: ActiveCenterSession) => {
      const name = safeDisplayName(session.displayName);
      setSelectedLiveUser({
        id: session.userId,
        name,
        avatar: session.avatarUrl,
        workoutType: session.workoutType ?? undefined,
        centerName: detailCenter?.displayName,
        startedAt: session.startedAt,
        contactStatus: session.contactStatus ?? null,
        isFriend: friendIdSet.has(session.userId),
      });
    },
    [detailCenter?.displayName, friendIdSet],
  );

  if (wantDetail && !detailCenter) {
    if (loading) {
      return (
        <View style={styles.container}>
          <ScreenHeader
            title={t('gymPresence.center')}
            onBack={() => navigation.goBack()}
          />
          <View style={styles.centeredState}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.stateHint}>{t('common.loading')}</Text>
          </View>
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.container}>
          <ScreenHeader
            title={t('gymPresence.center')}
            onBack={() => navigation.goBack()}
          />
          <View style={styles.centeredState}>
            <EmptyState
              icon="cloud-offline-outline"
              title={t('gymPresence.loadErrorTitle')}
              message={t('gymPresence.loadErrorBody')}
              actionLabel={t('common.retry')}
              onAction={() => void refresh()}
            />
          </View>
        </View>
      );
    }
    return (
      <View style={styles.container}>
        <ScreenHeader
          title={t('gymPresence.center')}
          onBack={() => navigation.goBack()}
        />
        <View style={styles.missingWrap}>
          <Text style={styles.missingText}>
            {t('gymPresence.noActiveSessions')}
          </Text>
        </View>
      </View>
    );
  }

  if (detailCenter) {
    const logo = getLogoSource(
      detailCenter.danishGym?.brand,
      detailCenter.displayName,
    );
    const addressLine = formatCompactAddressForGym(
      detailCenter.danishGym,
      detailCenter.address,
    );
    const totalActive = Math.max(0, detailCenter.totalActiveCount);
    const hiddenCount = Math.max(0, totalActive - visibleSessions.length);
    const liveAvatars = visibleSessions.slice(0, MAX_LIVE_AVATARS);

    return (
      <View style={styles.container}>
        <ScreenHeader
          title={detailCenter.displayName}
          onBack={() => navigation.goBack()}
        />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          <View style={styles.detailHeaderRow}>
            <View style={styles.detailLogoBox}>
              {logo.type === 'local' && logo.localAsset != null ? (
                <Image
                  source={logo.localAsset}
                  style={styles.detailLogo}
                  resizeMode="contain"
                />
              ) : (
                <Image
                  source={getDefaultGymlyLogoAsset()}
                  style={styles.detailLogo}
                  resizeMode="contain"
                />
              )}
            </View>
            <View style={styles.detailTitleCol}>
              {addressLine ? (
                <Text style={styles.address} numberOfLines={2}>
                  {addressLine}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.liveCard}>
            <View style={styles.liveCardTop}>
              <View style={styles.liveTitleRow}>
                <View style={styles.liveDot} />
                <Text style={styles.liveTitle}>{t('phase2ui.liveInCenter')}</Text>
              </View>
              {loading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : null}
            </View>
            <Text style={styles.liveCount} accessibilityRole="text">
              {tp('gymPresence.trainingNow', totalActive)}
            </Text>
            {liveAvatars.length > 0 ? (
              <View style={styles.avatarStack}>
                {liveAvatars.map((s, idx) => (
                  <View
                    key={s.userId}
                    style={[
                      styles.avatarStackItem,
                      {marginLeft: idx === 0 ? 0 : -10, zIndex: MAX_LIVE_AVATARS - idx},
                    ]}>
                    <UserAvatar
                      name={safeDisplayName(s.displayName)}
                      imageUrl={s.avatarUrl}
                      size="sm"
                      showOnlineIndicator
                      isOnline
                    />
                  </View>
                ))}
                {visibleSessions.length > MAX_LIVE_AVATARS ? (
                  <View style={[styles.avatarMore, {marginLeft: -6}]}>
                    <Text style={styles.avatarMoreText}>
                      +{visibleSessions.length - MAX_LIVE_AVATARS}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            {hiddenCount > 0 ? (
              <Text style={styles.privacyHint}>
                {tp('gymPresence.othersTrainingPrivately', hiddenCount)}
              </Text>
            ) : null}
          </View>

          {error ? (
            <TouchableOpacity
              style={styles.errorBanner}
              onPress={() => void refresh()}
              activeOpacity={0.85}>
              <Text style={styles.errorBannerText}>
                {t('gymPresence.loadErrorBody')}
              </Text>
              <Text style={styles.errorBannerAction}>{t('common.retry')}</Text>
            </TouchableOpacity>
          ) : null}

          {totalActive === 0 && !loading ? (
            <View style={styles.emptyActiveCard}>
              <Icon name="barbell-outline" size={28} color={colors.primary} />
              <Text style={styles.emptyActiveTitle}>
                {t('gymPresence.noOneTrainingCalm')}
              </Text>
              <Text style={styles.emptyActiveBody}>
                {t('gymPresence.beFirstFriendly')}
              </Text>
            </View>
          ) : null}

          {visibleSessions.length > 0 ? (
            <>
              <Text style={styles.sectionLabel}>
                {t('gymPresence.activeHere')}
              </Text>
              {visibleSessions.map(session => {
                const name = safeDisplayName(session.displayName);
                const isFriend = friendIdSet.has(session.userId);
                const isSelf = Boolean(
                  currentUser?.id && session.userId === currentUser.id,
                );
                const workout = formatWorkoutTypeDisplay(
                  session.workoutType ?? undefined,
                  getRuntimeLanguage(),
                );
                const duration = formatDurationIgang(session.startedAt);
                const metaParts = [workout, duration].filter(
                  part => part && part.trim().length > 0,
                );
                return (
                  <TouchableOpacity
                    key={`${session.checkInId}_${session.userId}`}
                    style={styles.userCard}
                    onPress={() => openProfile(session)}
                    activeOpacity={0.88}
                    accessibilityRole="button"
                    accessibilityLabel={name}>
                    <UserAvatar
                      name={name}
                      imageUrl={session.avatarUrl}
                      size="md"
                      showOnlineIndicator
                      isOnline
                    />
                    <View style={styles.userCardText}>
                      <View style={styles.userNameRow}>
                        <Text style={styles.userName} numberOfLines={1}>
                          {isSelf ? t('common.you') : name}
                        </Text>
                        {isFriend && !isSelf ? (
                          <View style={styles.friendPill}>
                            <Text style={styles.friendPillText}>
                              {t('common.friend')}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      {metaParts.length > 0 ? (
                        <Text style={styles.userMeta} numberOfLines={2}>
                          {metaParts.join(' · ')}
                        </Text>
                      ) : null}
                    </View>
                    {isFriend && !isSelf ? (
                      <TouchableOpacity
                        style={styles.msgBtn}
                        onPress={() => void openMessage(session.userId, name)}
                        hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                        accessibilityRole="button"
                        accessibilityLabel={t('home.message')}>
                        <Icon
                          name="chatbubble-ellipses-outline"
                          size={18}
                          color={colors.primary}
                        />
                      </TouchableOpacity>
                    ) : (
                      <Icon
                        name="chevron-forward"
                        size={18}
                        color={colors.textMuted}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
              {detailCenter.activeFriendsCount === 0 && totalActive > 0 ? (
                <Text style={styles.secondaryHint}>
                  {t('gymPresence.noFriendsHereShort')}
                </Text>
              ) : null}
            </>
          ) : totalActive > 0 && !loading ? (
            <Text style={styles.secondaryHint}>
              {t('gymPresence.visibleProfilesNone')}
            </Text>
          ) : null}
        </ScrollView>
        <LiveMiniProfileSheet
          user={selectedLiveUser}
          visible={!!selectedLiveUser}
          onClose={() => setSelectedLiveUser(null)}
          viewerUserId={currentUser?.id}
          onOpenIncomingRequest={requestId => {
            setFocusSayHiId(requestId);
            setSayHiSheetOpen(true);
          }}
        />
        <SayHiRequestsSheet
          visible={sayHiSheetOpen}
          onClose={() => {
            setSayHiSheetOpen(false);
            setFocusSayHiId(null);
          }}
          focusRequestId={focusSayHiId}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={t('gymPresence.activeCenters')}
        onBack={() => navigation.goBack()}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {loading && activeCenters.length === 0 ? (
          <View style={styles.centeredState}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error && activeCenters.length === 0 ? (
          <EmptyState
            icon="cloud-offline-outline"
            title={t('gymPresence.loadErrorTitle')}
            message={t('gymPresence.loadErrorBody')}
            actionLabel={t('common.retry')}
            onAction={() => void refresh()}
          />
        ) : activeCenters.length > 0 ? (
          activeCenters.map(c => (
            <ActiveCenterCard
              key={c.centerId}
              center={c}
              onPress={() =>
                navigation.navigate('GymPresence', {activeCenter: c})
              }
            />
          ))
        ) : (
          <EmptyState
            icon="people-outline"
            title={t('gymPresence.noOneTraining')}
            message={t('gymPresence.beFirst')}
            actionLabel={t('gymPresence.checkIn')}
            onAction={() => navigation.navigate('CheckIn')}
          />
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  detailHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  detailLogoBox: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundCard,
    marginRight: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  detailLogo: {width: 48, height: 48},
  detailTitleCol: {flex: 1, minWidth: 0},
  address: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  liveCard: {
    backgroundColor: colors.primary + '12',
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary + '28',
  },
  liveCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  liveTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
    marginRight: spacing.sm,
  },
  liveTitle: {
    ...typography.bodyBold,
    color: colors.text,
  },
  liveCount: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  avatarStackItem: {
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.backgroundLight,
  },
  avatarMore: {
    minWidth: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary + '22',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  avatarMoreText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primary,
  },
  privacyHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  sectionLabel: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  userCardText: {flex: 1, marginLeft: spacing.md, minWidth: 0},
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userName: {
    ...typography.bodyBold,
    color: colors.text,
    flexShrink: 1,
    marginRight: spacing.sm,
  },
  friendPill: {
    backgroundColor: colors.primary + '18',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  friendPillText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.primary,
    fontSize: 11,
  },
  userMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  msgBtn: {
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primary + '14',
  },
  secondaryHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  emptyActiveCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  emptyActiveTitle: {
    ...typography.bodyBold,
    color: colors.text,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  emptyActiveBody: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  stateHint: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  errorBanner: {
    backgroundColor: colors.error + '12',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorBannerText: {
    ...typography.caption,
    color: colors.text,
  },
  errorBannerAction: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primary,
    marginTop: spacing.xs,
  },
  missingWrap: {
    padding: spacing.lg,
  },
  missingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
});

export default GymPresenceScreen;
