/**
 * GymPresenceScreen – alle aktive centre, eller detalje for ét center (venner her nu).
 */
import React, {useCallback} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image} from 'react-native';
import {useNavigation, useRoute, useFocusEffect} from '@react-navigation/native';
import ScreenHeader from '@/components/ui/ScreenHeader';
import {EmptyState} from '@/components/ui/EmptyState';
import {useActiveCentersRealtime} from '@/hooks/useActiveCentersRealtime';
import {ActiveCenterCard} from '@/components/ui/ActiveCenterCard';
import type {ActiveCenter} from '@/types/activeCenter.types';
import type {GymPresence} from '@/types/gymPresence.types';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
import {UserAvatar} from '@/components/ui/UserAvatar';
import {formatWorkoutTypeDisplay} from '@/utils/muscleGroupLabels';
import {formatActiveDurationSince} from '@/utils/activeSessionFormat';
import {getLogoSource, getDefaultGymlyLogoAsset} from '@/services/gymLogoService';
import {useAppStore} from '@/store/appStore';
import {useChatStore} from '@/store/chatStore';
import {getOrCreateDmThread} from '@/services/supabase/dmService';

const GymPresenceScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const currentUser = useAppStore(s => s.user);
  const getChatByParticipants = useChatStore(s => s.getChatByParticipants);
  const upsertChat = useChatStore(s => s.upsertChat);
  const paramCenter = route.params?.activeCenter as ActiveCenter | undefined;
  const legacyGym = route.params?.gym as GymPresence | undefined;

  const {activeCenters, refresh} = useActiveCentersRealtime();

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

  const openMessage = useCallback(
    async (friendId: string, friendName: string) => {
      if (!currentUser?.id) {
        return;
      }
      const participantIds = [currentUser.id, friendId].sort();
      const nameById: Record<string, string> = {
        [currentUser.id]: currentUser.displayName || 'Dig',
        [friendId]: friendName,
      };
      const participantNames = participantIds.map(id => nameById[id] ?? 'Ven');
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
          friendName,
          participants: [{id: friendId, name: friendName}],
        });
      } catch (e) {
        Alert.alert('Besked', (e as Error).message);
      }
    },
    [currentUser, getChatByParticipants, navigation, upsertChat],
  );

  if (wantDetail && !detailCenter) {
    return (
      <View style={styles.container}>
        <ScreenHeader
          title="Center"
          onBack={() => navigation.goBack()}
        />
        <View style={styles.missingWrap}>
          <Text style={styles.missingText}>
            Dette center har ingen aktive træninger lige nu.
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
    return (
      <View style={styles.container}>
        <ScreenHeader
          title={detailCenter.displayName}
          onBack={() => navigation.goBack()}
        />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}>
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
              {detailCenter.address ? (
                <Text style={styles.address}>{detailCenter.address}</Text>
              ) : null}
              <Text style={styles.userCount}>
                {detailCenter.totalActiveCount} aktive
                {detailCenter.activeFriendsCount > 0
                  ? ` · ${detailCenter.activeFriendsCount} venner`
                  : ''}
              </Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>Dine venner her lige nu</Text>
          {detailCenter.activeFriends.length > 0 ? (
            detailCenter.activeFriends.map(f => {
              const w = formatWorkoutTypeDisplay(f.workoutType ?? undefined);
              const duration = formatActiveDurationSince(f.startedAt);
              return (
                <View key={f.checkInId} style={styles.friendRow}>
                  <UserAvatar
                    name={f.displayName}
                    imageUrl={f.avatarUrl ?? undefined}
                    size="md"
                  />
                  <View style={styles.friendText}>
                    <Text style={styles.friendName}>{f.displayName}</Text>
                    <Text style={styles.friendMeta}>
                      {w} · {duration} i gang
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.msgBtn}
                    onPress={() => void openMessage(f.userId, f.displayName)}
                    activeOpacity={0.85}>
                    <Text style={styles.msgBtnText}>Besked</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          ) : (
            <Text style={styles.emptyFriends}>
              Ingen af dine venner træner her lige nu
            </Text>
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Aktive centre" onBack={() => navigation.goBack()} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {activeCenters.length > 0 ? (
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
            title="Ingen træner lige nu"
            message="Vær den første til at tjekke ind"
            actionLabel="Tjek ind"
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
  },
  detailLogo: {width: 48, height: 48},
  detailTitleCol: {flex: 1, minWidth: 0},
  address: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  userCount: {
    ...typography.body,
    color: colors.text,
    marginTop: 6,
  },
  sectionLabel: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  friendText: {flex: 1, marginLeft: spacing.md, minWidth: 0},
  friendName: {
    ...typography.bodyBold,
    color: colors.text,
  },
  friendMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  msgBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primary + '18',
  },
  msgBtnText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.primary,
  },
  emptyFriends: {
    ...typography.caption,
    color: colors.textSecondary,
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
