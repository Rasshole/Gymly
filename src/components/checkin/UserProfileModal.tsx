/**
 * UserProfileModal – Mini profile when tapping a user in active session
 * Invite to workout, send reactions (🔥 💪)
 */

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Alert,
  Pressable,
  Animated,
  ActivityIndicator,
  Vibration,
  Platform,
  Easing,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {UserAvatar} from '@/components/ui/UserAvatar';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
import type {ActiveUser} from './ActiveUsersList';
import {supabase} from '@/services/supabase/supabaseClient';
import {
  acceptFriendRequest,
  getPendingRequestBetween,
  isFriendWith,
  sendFriendRequest,
  getPublicProfilesByIds,
} from '@/services/supabase/friendService';
import {getOrCreateDmThread, sendDmMessage} from '@/services/supabase/dmService';
import {useNavigation} from '@react-navigation/native';
import {useChatStore} from '@/store/chatStore';
import {safeDisplayName} from '@/utils/displayName';
import {formatWorkoutTypeDisplay} from '@/utils/muscleGroupLabels';
import {formatActiveDurationSince} from '@/utils/activeSessionFormat';
import {getUserStatsMap, type UserStats} from '@/services/supabase/userStatsService';
import {
  fetchSentWorkoutVibeEmojis,
  sendWorkoutVibeRpc,
} from '@/services/supabase/workoutVibeService';
import {loadProfileCentersForUser} from '@/services/supabase/profileCentersPublicService';
import {formatGymNameWithBrand} from '@/utils/gymDisplay';

export interface UserProfileModalProps {
  user: ActiveUser | null;
  visible: boolean;
  onClose: () => void;
  viewerUserId?: string;
  viewerName?: string;
  activitySubtitle?: string;
}

const FRIEND_VIBES = [
  {emoji: '💪', label: 'Stærkt'},
  {emoji: '🔥', label: 'On fire'},
  {emoji: '👀', label: 'Ser dig'},
] as const;

const NON_FRIEND_VIBES = [
  {emoji: '💪', label: 'Respekt'},
  {emoji: '🔥', label: 'On fire'},
  {emoji: '👋', label: 'Hey'},
] as const;

type FriendshipStatus = 'friend' | 'pending_sent' | 'pending_received' | 'none';

type CardLoadSnapshot = {
  checkInId: string | null;
  friendship: FriendshipStatus;
};

const UserProfileModal: React.FC<UserProfileModalProps> = ({
  user,
  visible,
  onClose,
  viewerUserId,
  viewerName,
  activitySubtitle,
}) => {
  const navigation = useNavigation<any>();
  const getChatByParticipants = useChatStore(s => s.getChatByParticipants);
  const upsertChat = useChatStore(s => s.upsertChat);
  const [busy, setBusy] = useState(false);
  const [deliveredEmojis, setDeliveredEmojis] = useState<Set<string>>(() => new Set());
  const deliveredEmojisRef = useRef(deliveredEmojis);
  deliveredEmojisRef.current = deliveredEmojis;
  const [sendPhase, setSendPhase] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [vibeHint, setVibeHint] = useState<string | null>(null);
  const [vibeError, setVibeError] = useState<string | null>(null);
  const [friendship, setFriendship] = useState<FriendshipStatus>(
    user?.isFriend ? 'friend' : 'none',
  );
  const [liveState, setLiveState] = useState<{
    centerName: string | null;
    workoutType: string | null;
    startedAt: string | null;
    isActive: boolean;
    checkInId: string | null;
  }>({
    centerName: null,
    workoutType: null,
    startedAt: null,
    isActive: true,
    checkInId: null,
  });
  const [profileName, setProfileName] = useState<string>('Ukendt bruger');
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [selectedVibe, setSelectedVibe] = useState<string>('💪');
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [primaryCenterSummary, setPrimaryCenterSummary] = useState<string | null>(
    null,
  );
  const primaryPress = useMemo(() => new Animated.Value(1), []);
  const emojiAnimScale = useMemo(() => new Animated.Value(1), []);

  const runEmojiSuccessAnim = useCallback(() => {
    emojiAnimScale.setValue(1);
    Animated.sequence([
      Animated.timing(emojiAnimScale, {
        toValue: 1.18,
        duration: 140,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(emojiAnimScale, {
        toValue: 1,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [emojiAnimScale]);

  const pulsePrimaryWhileSending = useCallback(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(primaryPress, {
          toValue: 0.97,
          duration: 520,
          useNativeDriver: true,
        }),
        Animated.timing(primaryPress, {
          toValue: 1,
          duration: 520,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [primaryPress]);

  const isSelf = !!user?.id && (user.id === 'me' || (!!viewerUserId && viewerUserId === user.id));

  const refreshCard = useCallback(async (): Promise<CardLoadSnapshot | null> => {
    if (!user?.id || !viewerUserId) {
      return null;
    }
    const [pMap, relation, pending, checkinRes, centerRows] = await Promise.all([
      getPublicProfilesByIds([user.id]),
      isFriendWith(viewerUserId, user.id),
      getPendingRequestBetween(viewerUserId, user.id),
      supabase
        .from('check_ins')
        .select('id, gym_name, workout_type, started_at, is_active, ended_at')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .is('ended_at', null)
        .order('started_at', {ascending: false})
        .limit(1)
        .maybeSingle(),
      loadProfileCentersForUser(user.id).catch(() => []),
    ]);

    const firstCenter = centerRows[0];
    setPrimaryCenterSummary(
      firstCenter
        ? `${formatGymNameWithBrand(firstCenter.name, firstCenter.brand)}${
            firstCenter.city?.trim() ? ` · ${firstCenter.city.trim()}` : ''
          }`
        : null,
    );

    const p = pMap.get(user.id);
    setProfileName(safeDisplayName(p?.displayName, p?.username, user.name, 'Ukendt bruger'));
    setProfileAvatar(p?.avatarUrl ?? user.avatar ?? null);

    let nextFriendship: FriendshipStatus = 'none';
    if (relation) {
      nextFriendship = 'friend';
    } else if (pending.outgoing) {
      nextFriendship = 'pending_sent';
    } else if (pending.incoming) {
      nextFriendship = 'pending_received';
    }
    setFriendship(nextFriendship);

    const c = checkinRes.data as
      | {
          id: string;
          gym_name: string | null;
          workout_type: string | null;
          started_at: string | null;
          is_active: boolean;
          ended_at: string | null;
        }
      | null;
    const checkInId = c?.id ?? null;
    setLiveState({
      centerName: c?.gym_name ?? null,
      workoutType: c?.workout_type ?? user.workoutType ?? null,
      startedAt: c?.started_at ?? null,
      isActive: !!c?.is_active,
      checkInId,
    });
    return {checkInId, friendship: nextFriendship};
  }, [user?.id, user?.name, user?.avatar, user?.workoutType, viewerUserId]);

  const loadDeliveredEmojis = useCallback(
    async (recipientId: string, checkInId: string | null, fr: FriendshipStatus) => {
      const allowed = new Set(
        (fr === 'friend' ? FRIEND_VIBES : NON_FRIEND_VIBES).map(v => v.emoji),
      );
      try {
        const list = await fetchSentWorkoutVibeEmojis(recipientId, checkInId);
        const filtered = list.filter(e => allowed.has(e));
        setDeliveredEmojis(new Set(filtered));
        console.log('[UserProfileModal] delivered emojis loaded', {
          recipientId,
          checkInId,
          filtered,
        });
      } catch (e) {
        console.warn('[UserProfileModal] loadDeliveredEmojis failed', e);
        setDeliveredEmojis(new Set());
      }
    },
    [],
  );

  useEffect(() => {
    if (!visible) {
      setPrimaryCenterSummary(null);
    }
    if (!visible || !user?.id || !viewerUserId) {
      return;
    }
    setSendPhase('idle');
    setVibeError(null);
    setVibeHint(null);
    setSelectedVibe('💪');
    setLiveState({
      centerName: null,
      workoutType: null,
      startedAt: null,
      isActive: true,
      checkInId: null,
    });
    setDeliveredEmojis(new Set());

    let cancelled = false;
    void (async () => {
      const snap = await refreshCard();
      if (cancelled || !snap || !user?.id) {
        return;
      }
      await loadDeliveredEmojis(user.id, snap.checkInId, snap.friendship);
    })();

    const channel = supabase
      .channel(`social_card_${viewerUserId}_${user.id}`)
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}`},
        () =>
          void refreshCard().then(s => {
            if (s && user?.id && !cancelled) {
              void loadDeliveredEmojis(user.id, s.checkInId, s.friendship);
            }
          }),
      )
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'check_ins', filter: `user_id=eq.${user.id}`},
        () =>
          void refreshCard().then(s => {
            if (s && user?.id && !cancelled) {
              void loadDeliveredEmojis(user.id, s.checkInId, s.friendship);
            }
          }),
      )
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'friendships'},
        () =>
          void refreshCard().then(s => {
            if (s && user?.id && !cancelled) {
              void loadDeliveredEmojis(user.id, s.checkInId, s.friendship);
            }
          }),
      )
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'friend_requests'},
        () =>
          void refreshCard().then(s => {
            if (s && user?.id && !cancelled) {
              void loadDeliveredEmojis(user.id, s.checkInId, s.friendship);
            }
          }),
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [visible, user?.id, viewerUserId, refreshCard, loadDeliveredEmojis]);

  useEffect(() => {
    if (sendPhase !== 'sending') {
      return;
    }
    const stop = pulsePrimaryWhileSending();
    return () => {
      stop();
      primaryPress.setValue(1);
    };
  }, [sendPhase, pulsePrimaryWhileSending, primaryPress]);

  const ensureThread = useCallback(
    async (otherUserId: string, otherName: string) => {
      if (!viewerUserId) {
        throw new Error('Du skal være logget ind.');
      }
      const participantIds = [viewerUserId, otherUserId].sort();
      const nameById: Record<string, string> = {
        [viewerUserId]: viewerName || 'Dig',
        [otherUserId]: otherName,
      };
      const participantNames = participantIds.map(id => nameById[id] ?? 'Ukendt bruger');
      const existingChat = getChatByParticipants(participantIds);
      const threadId = await getOrCreateDmThread(otherUserId);
      upsertChat({
        id: threadId,
        participantIds,
        participantNames,
        lastActivity: existingChat?.lastActivity ?? new Date(),
        unreadCount: existingChat?.unreadCount ?? 0,
        avatar: existingChat?.avatar,
        avatarInitials: existingChat?.avatarInitials,
      });
      return threadId;
    },
    [getChatByParticipants, upsertChat, viewerName, viewerUserId],
  );

  const sendVibe = useCallback(
    async (emoji: string) => {
      if (!user?.id || !viewerUserId || isSelf || busy) {
        return;
      }
      if (deliveredEmojisRef.current.has(emoji)) {
        setVibeHint('Du har allerede sendt den vibe');
        return;
      }
      if (sendPhase === 'sending' || sendPhase === 'success') {
        return;
      }

      const sessionId = liveState.checkInId ?? null;
      const isFriend = friendship === 'friend';

      console.log('[UserProfileModal] sendVibe start', {
        sender_id: viewerUserId,
        recipient_id: user.id,
        emoji,
        session_id: sessionId,
        isFriend,
      });

      setBusy(true);
      setSendPhase('sending');
      setVibeError(null);
      setVibeHint(null);

      let threadId: string | null = null;

      try {
        const center = liveState.centerName || user?.centerName || 'centeret';
        const workoutType = formatWorkoutTypeDisplay(
          liveState.workoutType ?? user?.workoutType ?? 'cardio',
        );

        if (isFriend) {
          threadId = await ensureThread(user.id, profileName);
          console.log('[UserProfileModal] ensureThread ok', {chat_id: threadId});
        }

        const rpc = await sendWorkoutVibeRpc({
          recipientId: user.id,
          emoji,
          recipientCheckInId: sessionId,
          centerName: center,
          workoutType,
          threadId,
          routeChat: isFriend && !!threadId,
        });

        if (rpc.duplicate) {
          console.log('[UserProfileModal] vibe already_sent (duplicate)', {emoji});
          setDeliveredEmojis(prev => new Set(prev).add(emoji));
          setSendPhase('idle');
          setVibeHint('Du har allerede sendt den vibe');
          return;
        }

        if (!rpc.ok) {
          console.log('[UserProfileModal] vibe insert / rpc not ok', rpc);
          throw new Error(rpc.error || 'send_workout_vibe failed');
        }

        console.log('[UserProfileModal] notification insert ok', {
          notification_id: rpc.notificationId,
        });

        if (isFriend && threadId) {
          let lastDmErr: unknown;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const dmRes = await sendDmMessage(threadId, {body: emoji});
              console.log('[UserProfileModal] chat message insert ok', {
                message_id: dmRes.row.id,
                thread_id: threadId,
                attempt,
              });
              lastDmErr = null;
              break;
            } catch (dmErr) {
              lastDmErr = dmErr;
              console.warn('[UserProfileModal] chat message insert error', {
                attempt,
                error: dmErr,
              });
            }
          }
          if (lastDmErr != null) {
            throw new Error(
              'Viben blev gemt, men beskeden kom ikke i chat. Prøv igen om et øjeblik.',
            );
          }
        }

        setDeliveredEmojis(prev => new Set(prev).add(emoji));
        runEmojiSuccessAnim();
        try {
          if (Platform.OS === 'ios') {
            Vibration.vibrate(10);
          } else {
            Vibration.vibrate(40);
          }
        } catch {
          /* ignore */
        }

        setSendPhase('success');
        setTimeout(() => {
          onClose();
          setSendPhase('idle');
        }, 900);
      } catch (e) {
        primaryPress.setValue(1);
        setSendPhase('error');
        const msg = e instanceof Error ? e.message : String(e);
        const short =
          msg.length > 160 ? `${msg.slice(0, 157)}…` : msg;
        setVibeError(short || 'Kunne ikke sende vibe');
        console.warn('[UserProfileModal] sendVibe failed', e);
      } finally {
        setBusy(false);
      }
    },
    [
      user?.id,
      user?.centerName,
      viewerUserId,
      isSelf,
      busy,
      sendPhase,
      liveState.checkInId,
      liveState.centerName,
      liveState.workoutType,
      friendship,
      ensureThread,
      profileName,
      runEmojiSuccessAnim,
      onClose,
      primaryPress,
    ],
  );

  const handleOpenChat = async () => {
    if (
      !user?.id ||
      !viewerUserId ||
      isSelf ||
      busy ||
      sendPhase === 'sending' ||
      sendPhase === 'success'
    ) {
      return;
    }
    setBusy(true);
    try {
      const threadId = await ensureThread(user.id, profileName);
      onClose();
      navigation.navigate('Chat', {
        chatId: threadId,
        friendId: user.id,
        friendName: profileName,
        participants: [{id: user.id, name: profileName}],
      });
    } catch (e) {
      Alert.alert('Besked', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleFriendAction = async () => {
    if (!user?.id || !viewerUserId || isSelf || busy) {
      return;
    }
    setBusy(true);
    try {
      if (friendship === 'none') {
        await sendFriendRequest(viewerUserId, user.id);
        setFriendship('pending_sent');
      } else if (friendship === 'pending_received') {
        const pending = await getPendingRequestBetween(viewerUserId, user.id);
        if (pending.incoming?.id) {
          await acceptFriendRequest(pending.incoming.id);
          setFriendship('friend');
        }
      }
    } catch (e) {
      Alert.alert('Venner', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const activityLine = useMemo(() => {
    const startedAt = liveState.startedAt ?? user?.startedAt ?? null;
    const duration = startedAt
      ? formatActiveDurationSince(startedAt)
      : '0 min';
    const type = formatWorkoutTypeDisplay(liveState.workoutType ?? user?.workoutType ?? undefined);
    return `Aktiv nu · ${duration} · ${type}`;
  }, [liveState.startedAt, liveState.workoutType, user?.startedAt, user?.workoutType]);

  useEffect(() => {
    if (!visible || !user?.id) {
      return;
    }
    let mounted = true;
    void getUserStatsMap([user.id])
      .then(map => {
        if (mounted) {
          setUserStats(map[user.id] ?? null);
        }
      })
      .catch(() => {
        if (mounted) {
          setUserStats(null);
        }
      });
    return () => {
      mounted = false;
    };
  }, [visible, user?.id]);

  const friendButtonLabel =
    friendship === 'friend'
      ? 'Venner ✓'
      : friendship === 'pending_sent'
        ? 'Anmodning sendt'
        : friendship === 'pending_received'
          ? 'Acceptér anmodning'
          : 'Tilføj ven';
  const friendButtonDisabled =
    isSelf || busy || friendship === 'pending_sent' || friendship === 'friend';
  const modalTitle = isSelf
    ? 'Din aktive session'
    : friendship === 'friend'
      ? 'Send vibe'
      : 'Sig hey';
  const vibes = friendship === 'friend' ? FRIEND_VIBES : NON_FRIEND_VIBES;
  const streakText =
    (userStats?.currentStreak ?? 0) > 0
      ? `🔥 ${userStats?.currentStreak} dages streak`
      : 'Ingen aktiv streak';

  const sendButtonDisabled =
    isSelf ||
    busy ||
    sendPhase === 'sending' ||
    sendPhase === 'success' ||
    deliveredEmojis.has(selectedVibe);

  const sendButtonLabel =
    sendPhase === 'sending'
      ? 'Sender…'
      : sendPhase === 'success'
        ? 'Vibe sendt'
        : 'Send vibe';

  if (!user) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableOpacity
            style={styles.modalContent}
            activeOpacity={1}
            onPress={() => {}}>
              <View style={styles.avatarSection}>
                <UserAvatar
                  name={profileName}
                  imageUrl={profileAvatar}
                  size="lg"
                  showOnlineIndicator
                  isOnline={liveState.isActive}
                />
                <Text style={styles.userName}>{profileName}</Text>
                <Text style={styles.modalTitle}>{modalTitle}</Text>
                {friendship === 'friend' && (
                  <View style={styles.friendLabel}>
                    <Icon name="people" size={12} color={colors.secondary} />
                    <Text style={styles.friendText}>Ven</Text>
                  </View>
                )}
                <Text style={styles.activityText}>{activityLine}</Text>
                <Text style={styles.centerText}>
                  {liveState.centerName ?? 'Samme center lige nu'}
                </Text>
                <Text style={styles.streakMetaText}>{streakText}</Text>
                {!isSelf && primaryCenterSummary ? (
                  <View style={styles.primaryCenterPill}>
                    <Text style={styles.primaryCenterPillLabel}>Primært center</Text>
                    <Text style={styles.primaryCenterPillValue} numberOfLines={2}>
                      {primaryCenterSummary}
                    </Text>
                  </View>
                ) : null}
                {!liveState.isActive ? (
                  <Text style={styles.inactiveText}>{profileName} er ikke aktiv længere</Text>
                ) : null}
                {!isSelf ? (
                  <Text style={styles.sameGymHint}>
                    {activitySubtitle || 'I træner i samme center lige nu'}
                  </Text>
                ) : null}
              </View>
              {isSelf ? (
                <Pressable
                  style={styles.inviteButton}
                  onPress={() => {
                    onClose();
                    navigation.navigate('Profile');
                  }}>
                  <Text style={styles.inviteButtonText}>Se min profil</Text>
                </Pressable>
              ) : (
                <>
                  <Pressable
                    style={[
                      styles.inviteButton,
                      sendPhase === 'success' && styles.sentBtn,
                    ]}
                    onPress={() => void sendVibe(selectedVibe)}
                    onPressIn={() => {
                      if (sendPhase === 'sending' || sendPhase === 'success') {
                        return;
                      }
                      Animated.spring(primaryPress, {
                        toValue: 0.98,
                        useNativeDriver: true,
                      }).start();
                    }}
                    onPressOut={() => {
                      if (sendPhase === 'sending' || sendPhase === 'success') {
                        return;
                      }
                      Animated.spring(primaryPress, {
                        toValue: 1,
                        useNativeDriver: true,
                      }).start();
                    }}
                    disabled={sendButtonDisabled}>
                    <Animated.View
                      style={[
                        styles.buttonInnerAnimated,
                        {transform: [{scale: primaryPress}]},
                      ]}>
                      {sendPhase === 'sending' ? (
                        <ActivityIndicator color={colors.white} size="small" />
                      ) : sendPhase === 'success' ? (
                        <Icon name="checkmark-circle" size={20} color={colors.white} />
                      ) : friendship === 'friend' ? (
                        <Icon name="chatbubble-ellipses" size={18} color={colors.white} />
                      ) : null}
                      <Text style={styles.inviteButtonText}>{sendButtonLabel}</Text>
                    </Animated.View>
                  </Pressable>
                  {vibeError ? (
                    <Text style={styles.vibeErrorText}>{vibeError}</Text>
                  ) : null}
                </>
              )}

              <View style={styles.reactionsSection}>
                {!isSelf ? (
                  <Text style={styles.reactionsLabel}>
                    {friendship === 'friend' ? 'Vælg vibe' : 'Vælg hey-vibe'}
                  </Text>
                ) : null}
                {!isSelf ? (
                <View style={styles.reactionsRow}>
                  {vibes.map(({emoji, label}) => {
                    const delivered = deliveredEmojis.has(emoji);
                    return (
                      <Pressable
                        key={emoji}
                        style={({pressed}) => [
                          styles.reactionButton,
                          selectedVibe === emoji && styles.reactionButtonSelected,
                          delivered && styles.reactionButtonDelivered,
                          pressed && styles.reactionButtonPressed,
                        ]}
                        onPress={() => {
                          if (delivered) {
                            setSelectedVibe(emoji);
                            setVibeHint('Du har allerede sendt den vibe');
                            return;
                          }
                          setSelectedVibe(emoji);
                          setVibeHint(null);
                        }}
                        disabled={
                          isSelf ||
                          busy ||
                          sendPhase === 'sending' ||
                          sendPhase === 'success'
                        }>
                        {delivered ? (
                          <View style={styles.reactionSentBadge} accessibilityLabel="Sendt">
                            <Icon name="checkmark" size={10} color={colors.white} />
                          </View>
                        ) : null}
                        {emoji === selectedVibe ? (
                          <Animated.View
                            style={{transform: [{scale: emojiAnimScale}]}}>
                            <Text style={styles.reactionEmoji}>{emoji}</Text>
                          </Animated.View>
                        ) : (
                          <Text style={styles.reactionEmoji}>{emoji}</Text>
                        )}
                        <Text style={styles.reactionLabel}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                ) : null}
                {!isSelf && vibeHint ? (
                  <Text style={styles.vibeHintText}>{vibeHint}</Text>
                ) : null}
              </View>

              {!isSelf ? <View style={styles.secondaryActions}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => {
                    onClose();
                    navigation.navigate('FriendProfile', {
                      friendId: user.id,
                      friendName: profileName,
                      friendAvatarUrl: profileAvatar ?? undefined,
                      activeCenterName:
                        liveState.centerName ||
                        user?.centerName ||
                        undefined,
                    });
                  }}>
                  <Text style={styles.secondaryText}>Se profil</Text>
                </TouchableOpacity>
                {friendship !== 'friend' ? (
                  <Pressable
                    style={({pressed}) => [
                      styles.secondaryButton,
                      (friendButtonDisabled || pressed) && styles.secondaryButtonPressed,
                    ]}
                    onPress={() => void handleFriendAction()}
                    disabled={friendButtonDisabled}>
                    <Text style={styles.secondaryText}>{friendButtonLabel}</Text>
                  </Pressable>
                ) : null}
                {friendship === 'friend' && !isSelf ? (
                  <Pressable
                    style={({pressed}) => [
                      styles.secondaryButton,
                      pressed && styles.secondaryButtonPressed,
                    ]}
                    onPress={() => void handleOpenChat()}
                    disabled={
                      busy || sendPhase === 'sending' || sendPhase === 'success'
                    }>
                    <Text style={styles.secondaryText}>Skriv besked</Text>
                  </Pressable>
                ) : null}
              </View> : null}

              <TouchableOpacity
                style={styles.closeButton}
                onPress={onClose}
                activeOpacity={0.8}>
                <Text style={styles.closeButtonText}>Luk</Text>
              </TouchableOpacity>
          </TouchableOpacity>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  userName: {
    ...typography.h4,
    color: colors.text,
    marginTop: spacing.sm,
  },
  modalTitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    fontWeight: '700',
  },
  friendLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  friendText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.secondary,
  },
  activityText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  centerText: {
    ...typography.body,
    color: colors.text,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  streakMetaText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  primaryCenterPill: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary + '14',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary + '30',
    maxWidth: '100%',
    alignItems: 'center',
  },
  primaryCenterPillLabel: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
    marginBottom: 4,
  },
  primaryCenterPillValue: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
    textAlign: 'center',
  },
  sameGymHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  inactiveText: {
    ...typography.caption,
    color: '#DC2626',
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    width: '100%',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
  },
  inviteButtonText: {
    ...typography.bodyBold,
    color: colors.white,
  },
  buttonInnerAnimated: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    transform: [{scale: 1}],
  },
  sentBtn: {
    backgroundColor: colors.secondary,
  },
  reactionsSection: {
    width: '100%',
    marginBottom: spacing.lg,
  },
  reactionsLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  reactionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  reactionButton: {
    position: 'relative',
    width: 76,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'visible',
  },
  reactionButtonDelivered: {
    opacity: 0.72,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  reactionSentBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    zIndex: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.backgroundCard,
  },
  reactionButtonSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '18',
  },
  reactionButtonPressed: {
    transform: [{scale: 0.94}],
    opacity: 0.9,
  },
  reactionEmoji: {
    fontSize: 22,
  },
  reactionLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '600',
  },
  secondaryActions: {
    width: '100%',
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  secondaryButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  secondaryButtonPressed: {
    opacity: 0.6,
    transform: [{scale: 0.98}],
  },
  secondaryText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
  },
  closeButton: {
    paddingVertical: spacing.sm,
  },
  closeButtonText: {
    ...typography.body,
    color: colors.textMuted,
  },
  vibeErrorText: {
    ...typography.caption,
    color: '#DC2626',
    textAlign: 'center',
    marginTop: -spacing.md,
    marginBottom: spacing.sm,
  },
  vibeHintText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});

export default UserProfileModal;
