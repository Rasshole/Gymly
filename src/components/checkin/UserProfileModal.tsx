/**
 * UserProfileModal – Mini profile when tapping a user in active session
 * Invite to workout, send reactions (🔥 💪)
 */

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Alert,
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
import {sendWorkoutBicepsReaction} from '@/services/supabase/workoutReactionService';

export interface UserProfileModalProps {
  user: ActiveUser | null;
  visible: boolean;
  onClose: () => void;
  viewerUserId?: string;
  viewerName?: string;
}

const ICEBREAKERS = [
  {emoji: '💪', text: 'Respekt 💪'},
  {emoji: '🔥', text: 'Ser stærkt ud 🔥'},
  {emoji: '👀', text: 'Hvad træner du i dag? 👀'},
];

type FriendshipStatus = 'friend' | 'pending_sent' | 'pending_received' | 'none';

const UserProfileModal: React.FC<UserProfileModalProps> = ({
  user,
  visible,
  onClose,
  viewerUserId,
  viewerName,
}) => {
  const navigation = useNavigation<any>();
  const getChatByParticipants = useChatStore(s => s.getChatByParticipants);
  const upsertChat = useChatStore(s => s.upsertChat);
  const [busy, setBusy] = useState(false);
  const [sentBiceps, setSentBiceps] = useState(false);
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

  const isSelf = !!user?.id && (user.id === 'me' || (!!viewerUserId && viewerUserId === user.id));

  const refreshCard = useCallback(async () => {
    if (!user?.id || !viewerUserId) {
      return;
    }
    const [pMap, relation, pending, checkinRes] = await Promise.all([
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
    ]);

    const p = pMap.get(user.id);
    setProfileName(safeDisplayName(p?.displayName, p?.username, user.name, 'Ukendt bruger'));
    setProfileAvatar(p?.avatarUrl ?? user.avatar ?? null);

    if (relation) {
      setFriendship('friend');
    } else if (pending.outgoing) {
      setFriendship('pending_sent');
    } else if (pending.incoming) {
      setFriendship('pending_received');
    } else {
      setFriendship('none');
    }

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
    setLiveState({
      centerName: c?.gym_name ?? null,
      workoutType: c?.workout_type ?? user.workoutType ?? null,
      startedAt: c?.started_at ?? null,
      isActive: !!c?.is_active,
      checkInId: c?.id ?? null,
    });
  }, [user?.id, user?.name, user?.avatar, user?.workoutType, viewerUserId]);

  useEffect(() => {
    if (!visible || !user?.id || !viewerUserId) {
      return;
    }
    setSentBiceps(false);
    void refreshCard();
    const channel = supabase
      .channel(`social_card_${viewerUserId}_${user.id}`)
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}`},
        () => void refreshCard(),
      )
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'check_ins', filter: `user_id=eq.${user.id}`},
        () => void refreshCard(),
      )
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'friendships'},
        () => void refreshCard(),
      )
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'friend_requests'},
        () => void refreshCard(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [visible, user?.id, viewerUserId, refreshCard]);

  if (!user) return null;

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

  const handleInvite = async () => {
    if (!user?.id || isSelf) {
      return;
    }
    if (friendship !== 'friend') {
      return;
    }
    onClose();
    navigation.navigate('InviteToWorkout', {
      friendId: user.id,
      friendName: profileName,
    });
  };

  const handleReaction = async (emoji: string) => {
    if (!user?.id || !viewerUserId || isSelf || busy) {
      return;
    }
    setBusy(true);
    try {
      const line = ICEBREAKERS.find(i => i.emoji === emoji)?.text ?? `${emoji}`;
      const threadId = await ensureThread(user.id, profileName);
      await sendDmMessage(threadId, {
        body: line,
      });
      if (friendship === 'friend' && liveState.checkInId && emoji === '💪') {
        await sendWorkoutBicepsReaction(user.id, liveState.checkInId);
      }
      if (emoji === '💪') {
        setSentBiceps(true);
      }
      onClose();
      navigation.navigate('Chat', {
        chatId: threadId,
        friendId: user.id,
        friendName: profileName,
        participants: [{id: user.id, name: profileName}],
      });
    } catch (e) {
      Alert.alert('Kunne ikke sende', (e as Error).message);
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

  const handleOpenChat = async () => {
    if (!user?.id || !viewerUserId || isSelf || busy) {
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

  const activityLine = useMemo(() => {
    const duration = liveState.startedAt
      ? formatActiveDurationSince(liveState.startedAt)
      : '0 min';
    const type = formatWorkoutTypeDisplay(liveState.workoutType ?? undefined);
    return `Aktiv nu · ${duration} · ${type}`;
  }, [liveState.startedAt, liveState.workoutType]);

  const friendButtonLabel =
    friendship === 'pending_sent'
      ? 'Anmodning sendt'
      : friendship === 'pending_received'
        ? 'Acceptér anmodning'
        : 'Tilføj ven';

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
                {!liveState.isActive ? (
                  <Text style={styles.inactiveText}>{profileName} er ikke aktiv længere</Text>
                ) : null}
                {friendship !== 'friend' ? (
                  <Text style={styles.sameGymHint}>I træner i samme center lige nu</Text>
                ) : null}
              </View>
              {friendship === 'friend' ? (
                <TouchableOpacity
                  style={styles.inviteButton}
                  onPress={() => void handleInvite()}
                  activeOpacity={0.8}
                  disabled={isSelf || !liveState.isActive}>
                  <Icon name="person-add" size={20} color={colors.white} />
                  <Text style={styles.inviteButtonText}>Inviter til træning</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.inviteButton, sentBiceps && styles.sentBtn]}
                  onPress={() => void handleReaction('💪')}
                  activeOpacity={0.8}
                  disabled={isSelf || busy || sentBiceps}>
                  <Text style={styles.inviteButtonText}>
                    {sentBiceps ? 'Sendt 💪' : 'Send biceps'}
                  </Text>
                </TouchableOpacity>
              )}

              <View style={styles.reactionsSection}>
                <Text style={styles.reactionsLabel}>
                  {friendship === 'friend' ? 'Send reaktion' : 'Quick icebreakers'}
                </Text>
                <View style={styles.reactionsRow}>
                  {ICEBREAKERS.map(({emoji}) => (
                    <TouchableOpacity
                      key={emoji}
                      style={styles.reactionButton}
                      onPress={() => void handleReaction(emoji)}
                      activeOpacity={0.8}
                      disabled={isSelf || busy}>
                      <Text style={styles.reactionEmoji}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.secondaryActions}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => {
                    onClose();
                    navigation.navigate('FriendProfile', {
                      friendId: user.id,
                      friendName: profileName,
                    });
                  }}>
                  <Text style={styles.secondaryText}>Se profil</Text>
                </TouchableOpacity>
                {friendship === 'friend' ? (
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => void handleOpenChat()}
                    disabled={isSelf || busy}>
                    <Text style={styles.secondaryText}>Besked</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => void handleFriendAction()}
                    disabled={isSelf || busy || friendship === 'pending_sent'}>
                    <Text style={styles.secondaryText}>{friendButtonLabel}</Text>
                  </TouchableOpacity>
                )}
              </View>

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
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionEmoji: {
    fontSize: 24,
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
});

export default UserProfileModal;
