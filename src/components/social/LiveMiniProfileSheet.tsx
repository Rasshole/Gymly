/**
 * Compact live mini-profile bottom sheet (replaces large Send-vibe popup).
 * Primary CTA depends on relation + contact status; vibes are not used here.
 */

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  Animated,
  Dimensions,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {UserAvatar} from '@/components/ui/UserAvatar';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows} from '@/theme/designTokens';
import type {ActiveUser} from '@/components/checkin/ActiveUsersList';
import {safeDisplayName, firstUsableDisplayName} from '@/utils/displayName';
import {formatWorkoutTypeDisplay} from '@/utils/muscleGroupLabels';
import {formatDurationIgang} from '@/utils/activeSessionFormat';
import {useTranslation, getRuntimeLanguage} from '@/i18n';
import {useAppStore} from '@/store/appStore';
import {useChatStore} from '@/store/chatStore';
import {getOrCreateDmThread, findDmThreadWith} from '@/services/supabase/dmService';
import {
  getSayHiRelation,
  sayHiErrorMessage,
  type SayHiRelation,
} from '@/services/supabase/sayHiService';
import {blockUserAndSync} from '@/store/blockStore';
import {reportUser} from '@/services/supabase/sayHiService';
import {
  isOpenToSayHi,
  sharedMuscleGroups,
  type ContactStatus,
} from '@/utils/contactStatus';
import {getPublicProfilesByIds} from '@/services/supabase/friendService';
import SayHiComposerSheet from '@/components/social/SayHiComposerSheet';
import {useSessionStore} from '@/store/sessionStore';

const SCREEN_H = Dimensions.get('window').height;

export type LiveMiniProfileSheetProps = {
  user: ActiveUser | null;
  visible: boolean;
  onClose: () => void;
  viewerUserId?: string;
  viewerName?: string;
  activitySubtitle?: string;
  /** When true, open composer immediately after load if say-hi is available */
  preferSayHi?: boolean;
  onOpenIncomingRequest?: (requestId: string) => void;
};

type PrimaryKind =
  | 'say_hi'
  | 'request_sent'
  | 'view_request'
  | 'message'
  | 'own_profile'
  | 'focused'
  | 'blocked'
  | 'unavailable'
  | 'none';

function isSynthetic(u: ActiveUser | null | undefined): boolean {
  return !!u?.liveDemoSeed?.synthetic;
}

const LiveMiniProfileSheet: React.FC<LiveMiniProfileSheetProps> = ({
  user,
  visible,
  onClose,
  viewerUserId,
  onOpenIncomingRequest,
}) => {
  const {t} = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const currentUser = useAppStore(s => s.user);
  const mySession = useSessionStore(s => s.activeSession);
  const getChatByParticipants = useChatStore(s => s.getChatByParticipants);
  const upsertChat = useChatStore(s => s.upsertChat);
  const sheetY = useRef(new Animated.Value(SCREEN_H)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [relation, setRelation] = useState<SayHiRelation | null>(null);
  const [bio, setBio] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [liveStale, setLiveStale] = useState(false);

  const uid = viewerUserId ?? currentUser?.id;
  const isSelf = Boolean(user && uid && user.id === uid);
  const displayName = safeDisplayName(user?.name);

  const contactStatus: ContactStatus | null = useMemo(() => {
    if (relation?.otherLive?.contactStatus != null) {
      return relation.otherLive.contactStatus;
    }
    return user?.contactStatus ?? null;
  }, [relation, user?.contactStatus]);

  const liveGym =
    !liveStale && relation?.otherLive?.gymName
      ? relation.otherLive.gymName
      : !liveStale
        ? user?.centerName
        : null;
  const liveWorkout =
    !liveStale && relation?.otherLive?.workoutType
      ? relation.otherLive.workoutType
      : !liveStale
        ? user?.workoutType
        : null;
  const liveStarted =
    !liveStale && relation?.otherLive?.startedAt
      ? relation.otherLive.startedAt
      : !liveStale
        ? user?.startedAt
        : null;

  const shared = useMemo(() => {
    if (!mySession?.workoutType || !liveWorkout) {
      return [];
    }
    return sharedMuscleGroups(mySession.workoutType, liveWorkout);
  }, [mySession?.workoutType, liveWorkout]);

  const primary: {kind: PrimaryKind; label: string} = useMemo(() => {
    if (!user) {
      return {kind: 'none', label: ''};
    }
    if (isSelf) {
      return {kind: 'own_profile', label: t('sayHi.viewOwnProfile')};
    }
    if (relation?.relation === 'blocked') {
      return {kind: 'blocked', label: t('sayHi.blocked')};
    }
    if (relation?.backendUnavailable) {
      return {kind: 'unavailable', label: t('sayHi.backendUnavailable')};
    }
    if (relation?.isFriend || relation?.threadId) {
      return {kind: 'message', label: t('sayHi.writeMessage')};
    }
    if (relation?.outgoingRequestId) {
      return {kind: 'request_sent', label: t('sayHi.requestSent')};
    }
    if (relation?.incomingRequestId) {
      return {kind: 'view_request', label: t('sayHi.viewRequest')};
    }
    if (isOpenToSayHi(contactStatus)) {
      return {kind: 'say_hi', label: t('sayHi.sayHi')};
    }
    if (contactStatus === 'focused') {
      return {kind: 'focused', label: t('sayHi.focusedNoHi')};
    }
    return {kind: 'none', label: t('sayHi.viewProfile')};
  }, [user, isSelf, relation, contactStatus, t]);

  const load = useCallback(async () => {
    if (!user || !visible) {
      return;
    }
    setLoading(true);
    setLiveStale(false);
    setBio(null);
    try {
      if (isSynthetic(user)) {
        const seed = user.liveDemoSeed!;
        setRelation({
          ok: true,
          isFriend: seed.friendship === 'friend',
          threadId: null,
          outgoingRequestId:
            seed.friendship === 'pending_sent' ? 'demo-out' : null,
          incomingRequestId:
            seed.friendship === 'pending_received' ? 'demo-in' : null,
          otherContactStatus: user.contactStatus ?? 'open',
          otherLive: {
            checkInId: 'demo',
            gymId: 'demo',
            gymName: user.centerName ?? null,
            workoutType: user.workoutType ?? null,
            startedAt: user.startedAt ?? null,
            contactStatus: user.contactStatus ?? 'open',
          },
        });
        setLoading(false);
        return;
      }
      if (isSelf) {
        setRelation({
          ok: true,
          relation: 'self',
          isFriend: false,
          threadId: null,
          outgoingRequestId: null,
          incomingRequestId: null,
          otherContactStatus: null,
          otherLive: null,
        });
        setLoading(false);
        return;
      }
      const [rel, profiles] = await Promise.all([
        getSayHiRelation(user.id),
        getPublicProfilesByIds([user.id]).catch(() => new Map()),
      ]);
      setRelation(rel);
      if (!rel.otherLive && user.centerName) {
        setLiveStale(true);
      }
      const p = profiles.get(user.id) as
        | {bio?: string; displayName?: string}
        | undefined;
      if (p && typeof (p as {bio?: string}).bio === 'string') {
        const b = (p as {bio?: string}).bio?.trim();
        setBio(b && b.length > 0 ? b : null);
      }
    } finally {
      setLoading(false);
    }
  }, [user, visible, isSelf]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    Animated.parallel([
      Animated.timing(backdrop, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(sheetY, {
        toValue: 0,
        stiffness: 420,
        damping: 36,
        mass: 0.85,
        useNativeDriver: true,
      }),
    ]).start();
    void load();
  }, [visible, backdrop, sheetY, load]);

  useEffect(() => {
    if (visible) {
      return;
    }
    Animated.parallel([
      Animated.timing(backdrop, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.spring(sheetY, {
        toValue: SCREEN_H,
        stiffness: 520,
        damping: 40,
        mass: 0.9,
        useNativeDriver: true,
      }),
    ]).start();
    setComposerOpen(false);
  }, [visible, backdrop, sheetY]);

  const openProfile = useCallback(() => {
    if (!user) {
      return;
    }
    onClose();
    if (isSelf) {
      navigation.navigate('Profile');
      return;
    }
    navigation.navigate('FriendProfile', {
      friendId: user.id,
      friendName: displayName,
      mutualFriends: 0,
      gyms: [],
    });
  }, [user, onClose, isSelf, navigation, displayName]);

  const openMessage = useCallback(async () => {
    if (!user || !uid) {
      return;
    }
    if (isSynthetic(user)) {
      Alert.alert(t('sayHi.demoTitle'), t('sayHi.demoBody'));
      return;
    }
    setBusy(true);
    try {
      let threadId = relation?.threadId ?? null;
      if (!threadId) {
        threadId = await findDmThreadWith(user.id);
      }
      if (!threadId) {
        threadId = await getOrCreateDmThread(user.id);
      }
      const participantIds = [uid, user.id].sort();
      const nameById: Record<string, string> = {
        [uid]:
          firstUsableDisplayName(
            currentUser?.displayName,
            currentUser?.username,
          ) ?? t('common.you'),
        [user.id]: displayName,
      };
      const existing = getChatByParticipants(participantIds);
      upsertChat({
        id: threadId,
        participantIds,
        participantNames: participantIds.map(
          id => nameById[id] ?? t('common.friend'),
        ),
        lastActivity: existing?.lastActivity ?? new Date(),
        unreadCount: existing?.unreadCount ?? 0,
        avatar: existing?.avatar,
        avatarInitials: existing?.avatarInitials,
      });
      onClose();
      navigation.navigate('Chat', {
        chatId: threadId,
        friendId: user.id,
        friendName: displayName,
        participants: [{id: user.id, name: displayName}],
      });
    } catch (e) {
      Alert.alert(
        t('sayHi.errGeneric'),
        sayHiErrorMessage(
          /not_friends/i.test(String((e as Error).message))
            ? 'already_chatting'
            : undefined,
          t,
        ),
      );
    } finally {
      setBusy(false);
    }
  }, [
    user,
    uid,
    relation?.threadId,
    currentUser,
    displayName,
    getChatByParticipants,
    upsertChat,
    onClose,
    navigation,
    t,
  ]);

  const onPrimary = useCallback(() => {
    switch (primary.kind) {
      case 'say_hi':
        setComposerOpen(true);
        break;
      case 'message':
      case 'own_profile':
        if (primary.kind === 'own_profile') {
          openProfile();
        } else {
          void openMessage();
        }
        break;
      case 'view_request':
        if (relation?.incomingRequestId) {
          onClose();
          onOpenIncomingRequest?.(relation.incomingRequestId);
        }
        break;
      case 'request_sent':
      case 'focused':
      case 'blocked':
      case 'unavailable':
        break;
      default:
        openProfile();
    }
  }, [
    primary.kind,
    openProfile,
    openMessage,
    relation?.incomingRequestId,
    onClose,
    onOpenIncomingRequest,
  ]);

  const onBlock = useCallback(() => {
    if (!user || isSynthetic(user)) {
      return;
    }
    Alert.alert(t('sayHi.blockTitle'), t('sayHi.blockBody', {name: displayName}), [
      {text: t('common.cancel'), style: 'cancel'},
      {
        text: t('sayHi.blockConfirm'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await blockUserAndSync(user.id);
              onClose();
            } catch {
              Alert.alert(t('sayHi.errGeneric'));
            }
          })();
        },
      },
    ]);
  }, [user, displayName, onClose, t]);

  const onReport = useCallback(() => {
    if (!user || isSynthetic(user)) {
      return;
    }
    Alert.alert(t('sayHi.reportTitle'), t('sayHi.reportBody'), [
      {text: t('common.cancel'), style: 'cancel'},
      {
        text: t('sayHi.reportConfirm'),
        onPress: () => {
          void (async () => {
            const res = await reportUser({
              otherUserId: user.id,
              reason: 'say_hi_flow',
              context: {screen: 'LiveMiniProfileSheet'},
            });
            if (res.backendUnavailable) {
              Alert.alert(t('sayHi.backendUnavailable'));
              return;
            }
            if (!res.ok) {
              Alert.alert(t('sayHi.errGeneric'));
              return;
            }
            Alert.alert(t('sayHi.reportThanks'));
          })();
        },
      },
    ]);
  }, [user, t]);

  const contactLabel =
    contactStatus === 'open'
      ? t('sayHi.contactOpen')
      : contactStatus === 'focused'
        ? t('sayHi.contactFocused')
        : null;

  const workoutLabel = liveWorkout
    ? formatWorkoutTypeDisplay(liveWorkout, getRuntimeLanguage())
    : null;
  const durationLabel = liveStarted ? formatDurationIgang(liveStarted) : null;

  if (!user) {
    return null;
  }

  return (
      <Modal
        visible={visible}
        transparent
        animationType="none"
        presentationStyle={
          Platform.OS === 'ios' ? 'overFullScreen' : undefined
        }
        onRequestClose={() => {
          if (composerOpen) {
            setComposerOpen(false);
            return;
          }
          onClose();
        }}
        statusBarTranslucent>
        <View style={styles.flex}>
          <Animated.View style={[styles.backdrop, {opacity: backdrop}]}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => {
                if (composerOpen) {
                  setComposerOpen(false);
                  return;
                }
                onClose();
              }}
            />
          </Animated.View>
          <Animated.View
            style={[
              styles.sheet,
              {
                paddingBottom: Math.max(insets.bottom, spacing.md),
                transform: [{translateY: sheetY}],
              },
            ]}>
            <View style={styles.handle} />
            <ScrollView
              bounces={false}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sheetPad}>
              <View style={styles.headerBlock}>
                <UserAvatar
                  name={displayName}
                  imageUrl={user.avatar}
                  size="lg"
                  showOnlineIndicator={Boolean(liveGym)}
                  isOnline={Boolean(liveGym)}
                />
                <Text style={styles.name} numberOfLines={2}>
                  {isSelf ? t('common.you') : displayName}
                </Text>
                {liveGym ? (
                  <Text style={styles.liveLine} numberOfLines={2}>
                    {t('sayHi.trainingHereNow')}
                    {workoutLabel ? ` · ${workoutLabel}` : ''}
                    {durationLabel ? ` · ${durationLabel}` : ''}
                  </Text>
                ) : (
                  <Text style={styles.metaMuted}>{t('sayHi.notLiveNow')}</Text>
                )}
                {liveGym ? (
                  <Text style={styles.gymLine} numberOfLines={2}>
                    {liveGym}
                  </Text>
                ) : null}
                {contactLabel ? (
                  <View style={styles.contactPill}>
                    <Text style={styles.contactPillText}>{contactLabel}</Text>
                  </View>
                ) : null}
              </View>

              {bio ? (
                <Text style={styles.bio} numberOfLines={4}>
                  {bio}
                </Text>
              ) : null}

              {shared.length > 0 && liveGym ? (
                <Text style={styles.shared}>
                  {t('sayHi.sharedMuscles', {
                    muscles: shared
                      .map(m =>
                        formatWorkoutTypeDisplay(m, getRuntimeLanguage()),
                      )
                      .join(', '),
                  })}
                </Text>
              ) : liveGym && mySession ? (
                <Text style={styles.shared}>{t('sayHi.sameGymNow')}</Text>
              ) : null}

              {loading ? (
                <ActivityIndicator
                  color={colors.primary}
                  style={{marginVertical: spacing.md}}
                />
              ) : (
                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    (primary.kind === 'request_sent' ||
                      primary.kind === 'focused' ||
                      primary.kind === 'blocked' ||
                      primary.kind === 'unavailable') &&
                      styles.primaryBtnDisabled,
                  ]}
                  onPress={onPrimary}
                  disabled={
                    busy ||
                    primary.kind === 'request_sent' ||
                    primary.kind === 'focused' ||
                    primary.kind === 'blocked' ||
                    primary.kind === 'unavailable'
                  }
                  accessibilityRole="button"
                  accessibilityLabel={primary.label}
                  activeOpacity={0.88}>
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>{primary.label}</Text>
                  )}
                </TouchableOpacity>
              )}

              {isSelf ? null : (
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={openProfile}
                  accessibilityRole="button"
                  accessibilityLabel={t('sayHi.viewProfile')}>
                  <Text style={styles.secondaryBtnText}>
                    {t('sayHi.viewProfile')}
                  </Text>
                </TouchableOpacity>
              )}

              {!isSelf && !isSynthetic(user) ? (
                <View style={styles.dangerRow}>
                  <TouchableOpacity onPress={onBlock} hitSlop={8}>
                    <Text style={styles.dangerText}>{t('sayHi.block')}</Text>
                  </TouchableOpacity>
                  <Text style={styles.dangerDot}>·</Text>
                  <TouchableOpacity onPress={onReport} hitSlop={8}>
                    <Text style={styles.dangerText}>{t('sayHi.report')}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <TouchableOpacity onPress={onClose} style={styles.closeLink}>
                <Text style={styles.closeLinkText}>{t('common.close')}</Text>
              </TouchableOpacity>
            </ScrollView>
          </Animated.View>

          {/* Same Modal host — nested RN Modal is a no-op on iOS */}
          <SayHiComposerSheet
            embedded
            visible={composerOpen}
            recipientName={displayName}
            recipientId={user.id}
            onClose={() => setComposerOpen(false)}
            onSent={() => {
              setComposerOpen(false);
              void load();
              Alert.alert(t('sayHi.sentTitle'), t('sayHi.sentBody'));
            }}
          />
        </View>
      </Modal>
  );
};

const styles = StyleSheet.create({
  flex: {flex: 1, justifyContent: 'flex-end'},
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  sheet: {
    backgroundColor: colors.backgroundCard,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    maxHeight: SCREEN_H * 0.78,
    ...shadows.sheet,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  sheetPad: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerBlock: {alignItems: 'center', marginBottom: spacing.md},
  name: {
    ...typography.h4,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  liveLine: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  gymLine: {
    ...typography.bodyBold,
    color: colors.text,
    marginTop: 4,
    textAlign: 'center',
  },
  metaMuted: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4,
  },
  contactPill: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary + '14',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  contactPillText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  bio: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  shared: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  primaryBtnDisabled: {
    backgroundColor: colors.surface,
  },
  primaryBtnText: {
    ...typography.bodyBold,
    color: '#fff',
  },
  secondaryBtn: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  secondaryBtnText: {
    ...typography.bodyBold,
    color: colors.text,
  },
  dangerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.sm,
  },
  dangerText: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '600',
  },
  dangerDot: {color: colors.textMuted},
  closeLink: {alignItems: 'center', paddingVertical: spacing.md},
  closeLinkText: {
    ...typography.body,
    color: colors.textMuted,
  },
});

export default LiveMiniProfileSheet;
