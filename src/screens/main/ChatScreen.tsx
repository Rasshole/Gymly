/**
 * Chat Screen
 * Individual chat conversation with a friend
 */

import React, {useState, useRef, useEffect, useMemo, useCallback, useId} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Alert,
  ScrollView,
  Image,
  TouchableWithoutFeedback,
  Keyboard,
  ActivityIndicator,
  useWindowDimensions,
  Animated,
  Easing,
  Vibration,
  useColorScheme,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import {launchCamera, launchImageLibrary, CameraOptions, ImagePickerResponse} from 'react-native-image-picker';
import {format} from 'date-fns';
import {useTranslation, rt, getRuntimeLanguage} from '@/i18n';
import {labelForMuscleToken} from '@/utils/muscleGroupLabels';
import DateTimePicker, {DateTimePickerEvent} from '@react-native-community/datetimepicker';
import {getActiveDanishGyms, DanishGym} from '@/data/danishGyms';
import {MuscleGroup} from '@/types/workout.types';
import {formatGymDisplayName, findGymById, findGymByIdRelaxed} from '@/utils/gymDisplay';
import {supabase} from '@/services/supabase/supabaseClient';
import {
  createTrainingInvitation,
  fetchPlannedWorkoutByThread,
  loadWorkoutPlanEntriesForUser,
  respondPlannedWorkoutInvite,
  type PlannedWorkoutRow,
  type PlannedParticipantRow,
} from '@/services/supabase/plannedWorkoutService';
import {useInAppNotificationStore} from '@/store/inAppNotificationStore';
import {useFocusEffect} from '@react-navigation/native';
import {useChatStore, ChatPlan, ChatMessage} from '@/store/chatStore';
import {useAppStore} from '@/store/appStore';
import {useWorkoutPlanStore} from '@/store/workoutPlanStore';
import {isDemoContentMode} from '@/demo/demoContentGate';
import {getDemoPeerLiveTrainingForFriend} from '@/demo/demoDmPeerTraining';
import {getDemoProfileById} from '@/demo/demoPersonas';
import {useSessionStore} from '@/store/sessionStore';
import {useNotificationStore} from '@/store/notificationStore';
import {navigateToFriendProfile} from '@/navigation/rootNavigation';
import {
  isDmThreadId,
  fetchDmMessages,
  sendDmMessage,
  markDmThreadMessagesRead,
  userFacingDmError,
} from '@/services/supabase/dmService';
import {syncDmInboxToStore} from '@/services/supabase/dmInboxSync';
import {getPublicProfilesByIds} from '@/services/supabase/friendService';
import {uploadDmChatImage} from '@/services/supabase/dmImageUpload';
import {getActiveCheckInForUser} from '@/services/supabase/checkInService';
import {formatDurationIgang} from '@/utils/activeSessionFormat';
import {formatWorkoutTypeDisplay} from '@/utils/muscleGroupLabels';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
import TimePickerSheet from '@/components/ui/TimePickerSheet';
import PlannedWorkoutInviteForm, {
  defaultScheduleParts,
  INVITE_FORM_SCREEN_TINT,
} from '@/components/planned/PlannedWorkoutInviteForm';
import {safeDisplayName, isUuidLike} from '@/utils/displayName';
import {UserAvatar} from '@/components/ui/UserAvatar';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';

const FALLBACK_PLAN_INVITE_GYMS = getActiveDanishGyms();

type ChatScreenProps = {
  route: {
    params: {
      chatId?: string;
      friendId: string;
      friendName: string;
      participants?: Array<{id: string; name: string}>;
      initialMessage?: string;
    };
  };
  navigation: any;
};

type RecipientTrainingHeader = {
  gymName: string;
  workoutType: string | null;
  startedAt: string;
};

const MUSCLE_GROUPS: {key: MuscleGroup; label: string}[] = [
  {key: 'bryst', label: 'Bryst'},
  {key: 'triceps', label: 'Triceps'},
  {key: 'skulder', label: 'Skulder'},
  {key: 'ben', label: 'Ben'},
  {key: 'biceps', label: 'Biceps'},
  {key: 'mave', label: 'Mave'},
  {key: 'ryg', label: 'Ryg'},
  {key: 'cardio', label: 'Cardio'},
  {key: 'reformer', label: 'Reformer'},
  {key: 'pilates', label: 'Pilates'},
];

/** iOS-style media sheet (Ionicons ≈ SF Symbols); icons use system dark, not brand circles */
const CHAT_MEDIA_SHEET = {
  icon: '#1C1C1E',
} as const;

const CHAT_IMAGE_MAX_H = 320;

const TypingDotsInline = () => {
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
    <View style={styles.typingInline}>
      <Text style={styles.typingInlineLabel}>Skriver</Text>
      {[0, 1, 2].map(i => (
        <Animated.Text
          key={i}
          style={[
            styles.typingInlineDot,
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

const AnimatedMessageWrap = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 7,
        tension: 160,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, scale]);
  return (
    <Animated.View style={{opacity, transform: [{scale}]}}>
      {children}
    </Animated.View>
  );
};

type DmChatMessageImageProps = {
  uri: string;
  maxWidth: number;
  onPress: () => void;
};

const DmChatMessageImage = ({uri, maxWidth, onPress}: DmChatMessageImageProps) => {
  const [natural, setNatural] = useState<{w: number; h: number} | null>(null);

  useEffect(() => {
    let cancelled = false;
    Image.getSize(
      uri,
      (w, h) => {
        if (!cancelled && w > 0 && h > 0) {
          setNatural({w, h});
        }
      },
      () => {
        if (!cancelled) {
          setNatural(null);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [uri]);

  const {w, h} = useMemo(() => {
    if (!natural) {
      const w0 = maxWidth;
      return {w: w0, h: Math.min(w0 * 0.75, CHAT_IMAGE_MAX_H)};
    }
    const r = natural.h / natural.w;
    let w1 = Math.min(maxWidth, 280, natural.w);
    let h1 = w1 * r;
    if (h1 > CHAT_IMAGE_MAX_H) {
      h1 = CHAT_IMAGE_MAX_H;
      w1 = h1 / r;
    }
    if (w1 > maxWidth) {
      w1 = maxWidth;
      h1 = w1 * r;
    }
    if (h1 > CHAT_IMAGE_MAX_H) {
      h1 = CHAT_IMAGE_MAX_H;
    }
    return {w: w1, h: h1};
  }, [maxWidth, natural]);

  return (
    <Pressable onPress={onPress} style={({pressed}) => (pressed ? {opacity: 0.92} : null)}>
      <Image
        source={{uri}}
        style={[styles.messageImageContent, {width: w, height: h}]}
        resizeMode="cover"
        accessibilityLabel="Billede"
        accessibilityRole="image"
      />
    </Pressable>
  );
};

const formatMuscleSelection = (groups: MuscleGroup[]) => {
  const lang = getRuntimeLanguage();
  if (groups.length === 0) {
    return labelForMuscleToken('fri', lang);
  }
  return groups.map(group => labelForMuscleToken(group, lang)).join(', ');
};

function mapServerPlanToChatPlan(r: {
  workout: PlannedWorkoutRow;
  participants: PlannedParticipantRow[];
}): ChatPlan {
  const w = r.workout;
  const gym = findGymById(w.center_id) ?? getActiveDanishGyms()[0]!;
  const invitee = r.participants.find(p => p.role === 'invitee');
  const muscles = (w.training_types || []) as MuscleGroup[];
  const inviteeId = invitee?.user_id;
  const accepted = invitee?.response_status === 'accepted' && inviteeId;
  const ir: 'pending' | 'accepted' | 'declined' =
    invitee?.response_status === 'declined'
      ? 'declined'
      : invitee?.response_status === 'accepted'
        ? 'accepted'
        : 'pending';
  return {
    id: w.id,
    serverPlannedWorkoutId: w.id,
    gym,
    muscles,
    scheduledAt: new Date(w.scheduled_at),
    createdBy: w.creator_user_id,
    joinedIds: accepted ? [w.creator_user_id, inviteeId!] : [w.creator_user_id],
    invitedIds: inviteeId ? [inviteeId] : [],
    inviteeResponse: ir,
  };
}

const ChatScreen = ({route, navigation}: ChatScreenProps) => {
  const {t, dateFnsLocale} = useTranslation();
  const {chatId, friendId, friendName, initialMessage, participants: routeParticipants} = route.params;
  const updateChatLastMessage = useChatStore(state => state.updateChatLastMessage);
  const initializeChatMessages = useChatStore(state => state.initializeChatMessages);
  const setMessagesForChat = useChatStore(state => state.setMessagesForChat);
  const markChatAsRead = useChatStore(state => state.markChatAsRead);
  const markMessageNotificationsForChatRead = useNotificationStore(
    state => state.markMessageNotificationsForChatRead,
  );
  const setForegroundOpenChatId = useChatStore(state => state.setForegroundOpenChatId);
  const addMessageToChat = useChatStore(state => state.addMessageToChat);
  const resolvePendingDmMessage = useChatStore(state => state.resolvePendingDmMessage);
  const abortPendingDmMessage = useChatStore(state => state.abortPendingDmMessage);
  const upsertDmPresence = useChatStore(state => state.upsertDmPresence);
  const dmPresenceByUser = useChatStore(state => state.dmPresenceByUser);
  const setThreadSeenAtByUser = useChatStore(state => state.setThreadSeenAtByUser);
  const threadSeenAtByUser = useChatStore(
    useCallback(state => (chatId ? state.threadSeenAtByUser[chatId] ?? {} : {}), [chatId]),
  );
  const setActivePlanForChat = useChatStore(state => state.setActivePlanForChat);
  const updateActivePlanForChat = useChatStore(state => state.updateActivePlanForChat);
  const messages: ChatMessage[] = useChatStore(
    useCallback(state => (chatId ? state.messagesByChat[chatId] ?? [] : []), [chatId]),
  );
  const activePlan: ChatPlan | null = useChatStore(
    useCallback(state => (chatId ? state.activePlansByChat[chatId] ?? null : null), [chatId]),
  );
  const currentUserId = useAppStore(s => s.user?.id) ?? 'current_user';
  const activeSession = useSessionStore(s => s.activeSession);
  const isDm = useMemo(
    () =>
      (!!chatId && isDmThreadId(chatId)) ||
      (!!chatId && isDemoContentMode() && chatId.startsWith('demo-thread-')),
    [chatId],
  );
  const dmMessagesForList = useMemo(() => {
    if (!isDm) {
      return messages;
    }
    return messages.filter(m => m.plannedWorkoutEmbed?.kind !== 'invite');
  }, [messages, isDm]);
  const planInviteBannerSurfaceId = activePlan?.serverPlannedWorkoutId ?? activePlan?.id ?? null;
  const dismissedPlanInviteBannerSurfaceId = useChatStore(
    useCallback(
      s => (chatId ? s.dismissedPlanInviteBannerByChat[chatId] ?? null : null),
      [chatId],
    ),
  );
  const setDismissedPlanInviteBanner = useChatStore(s => s.setDismissedPlanInviteBanner);
  const planInviteSurfaceTransitionRef = useRef<string | null>(null);
  const showPlanInviteBanner = useMemo(() => {
    if (!activePlan || !planInviteBannerSurfaceId) {
      return false;
    }
    if (dismissedPlanInviteBannerSurfaceId === planInviteBannerSurfaceId) {
      return false;
    }
    if (activePlan.inviteeResponse && activePlan.inviteeResponse !== 'pending') {
      return false;
    }
    return true;
  }, [
    activePlan,
    dismissedPlanInviteBannerSurfaceId,
    planInviteBannerSurfaceId,
  ]);

  const demoDmPlanInviteUi = useMemo(
    () =>
      isDemoContentMode() &&
      !!chatId &&
      chatId.startsWith('demo-thread-') &&
      !!activePlan &&
      !activePlan.serverPlannedWorkoutId &&
      activePlan.inviteeResponse === 'pending',
    [chatId, activePlan],
  );

  useEffect(() => {
    if (!chatId || !planInviteBannerSurfaceId) {
      planInviteSurfaceTransitionRef.current = planInviteBannerSurfaceId;
      return;
    }
    const prev = planInviteSurfaceTransitionRef.current;
    if (prev && prev !== planInviteBannerSurfaceId) {
      setDismissedPlanInviteBanner(chatId, null);
    }
    planInviteSurfaceTransitionRef.current = planInviteBannerSurfaceId;
  }, [chatId, planInviteBannerSurfaceId, setDismissedPlanInviteBanner]);
  const chatParticipants =
    routeParticipants && routeParticipants.length > 0
      ? routeParticipants
      : [{id: friendId, name: friendName}];
  const participantList = [
    {id: currentUserId, name: 'Dig'},
    ...chatParticipants.filter(participant => participant.id !== currentUserId),
  ];
  const otherParticipantId = useMemo(
    () => chatParticipants.find(p => p.id !== currentUserId)?.id ?? friendId,
    [chatParticipants, currentUserId, friendId],
  );
  const remotePresence = dmPresenceByUser[otherParticipantId];
  const remoteTyping = !!(chatId && remotePresence?.typingByThread?.[chatId]);
  const remoteSeenAt = threadSeenAtByUser[otherParticipantId] ?? 0;
  const [recipientTraining, setRecipientTraining] = useState<RecipientTrainingHeader | null>(null);
  const [recipientDurationClockMs, setRecipientDurationClockMs] = useState(() => Date.now());
  const [message, setMessage] = useState('');
  const [planModalVisible, setPlanModalVisible] = useState(false);
  const [planDetailVisible, setPlanDetailVisible] = useState(false);
  const [planSelectedGym, setPlanSelectedGym] = useState<DanishGym | null>(null);
  const [planInviteDate, setPlanInviteDate] = useState(() => defaultScheduleParts().date);
  const [planInviteTime, setPlanInviteTime] = useState(() => defaultScheduleParts().time);
  const [planInviteMuscle, setPlanInviteMuscle] = useState<MuscleGroup>('bryst');
  const [showPlanInviteDatePicker, setShowPlanInviteDatePicker] = useState(false);
  const [showPlanInviteTimeSheet, setShowPlanInviteTimeSheet] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [selectedImageMime, setSelectedImageMime] = useState<string | null>(null);
  const [isSendingImage, setIsSendingImage] = useState(false);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [showImagePickerOptions, setShowImagePickerOptions] = useState(false);
  const [planActionBusy, setPlanActionBusy] = useState(false);
  const [planBannerSurfaceSize, setPlanBannerSurfaceSize] = useState({w: 1, h: 1});
  const planBannerGradId = useId().replace(/:/g, '');
  const [headerDisplayName, setHeaderDisplayName] = useState<string>(
    safeDisplayName(friendName, 'Ukendt bruger'),
  );
  const [headerAvatarUrl, setHeaderAvatarUrl] = useState<string | null>(null);
  const {width: windowWidth} = useWindowDimensions();
  const refreshInAppNotifications = useInAppNotificationStore(s => s.refresh);
  const mergePlannedFromServer = useWorkoutPlanStore(s => s.mergePlannedFromServer);
  const maxDmImageWidth = useMemo(
    () => Math.min(windowWidth * 0.7, 280),
    [windowWidth],
  );
  const trainingPulse = useRef(new Animated.Value(1)).current;
  const flatListRef = useRef<FlatList>(null);
  const initialMessageHandledRef = useRef(false);
  const presenceChannelRef = useRef<any>(null);
  const insets = useSafeAreaInsets();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [localTyping, setLocalTyping] = useState(false);
  const showLiveTrainingHeader = !!recipientTraining && !remoteTyping;
  const headerLiveContextText = useMemo(() => {
    if (!recipientTraining) {
      return null;
    }
    const center = recipientTraining.gymName.trim();
    const dur = formatDurationIgang(recipientTraining.startedAt, recipientDurationClockMs);
    const type = formatWorkoutTypeDisplay(recipientTraining.workoutType);
    return `${center} · ${dur} · ${type}`;
  }, [recipientTraining, recipientDurationClockMs]);

  const loadRecipientTraining = useCallback(async () => {
    if (!isDm || !otherParticipantId) {
      setRecipientTraining(null);
      return;
    }
    if (isDemoContentMode()) {
      const demo = getDemoPeerLiveTrainingForFriend(otherParticipantId);
      if (!demo) {
        setRecipientTraining(null);
        return;
      }
      setRecipientTraining({
        gymName: demo.gymName,
        workoutType: demo.workoutType,
        startedAt: demo.startedAt,
      });
      return;
    }
    try {
      const row = await getActiveCheckInForUser(otherParticipantId);
      if (!row?.is_active || row.ended_at) {
        setRecipientTraining(null);
        return;
      }
      setRecipientTraining({
        gymName: row.gym_name,
        workoutType: row.workout_type,
        startedAt: row.started_at,
      });
    } catch {
      setRecipientTraining(null);
    }
  }, [isDm, otherParticipantId]);

  useEffect(() => {
    if (!recipientTraining) {
      return;
    }
    setRecipientDurationClockMs(Date.now());
  }, [
    recipientTraining?.startedAt,
    recipientTraining?.gymName,
    recipientTraining?.workoutType,
  ]);

  useEffect(() => {
    if (!recipientTraining) {
      return;
    }
    const id = setInterval(() => {
      setRecipientDurationClockMs(Date.now());
    }, 60_000);
    return () => clearInterval(id);
  }, [recipientTraining]);

  useEffect(() => {
    if (!isDm || !otherParticipantId) {
      return;
    }
    void loadRecipientTraining();
    if (isDemoContentMode()) {
      return;
    }
    const ch = supabase
      .channel(`dm_peer_checkin_${otherParticipantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'check_ins',
          filter: `user_id=eq.${otherParticipantId}`,
        },
        () => {
          void loadRecipientTraining();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [isDm, otherParticipantId, loadRecipientTraining]);

  const headerStatusText = useMemo(() => {
    if (remoteTyping) {
      return t('chat.typing');
    }
    if (showLiveTrainingHeader) {
      return t('chat.activeNow');
    }
    if (remotePresence?.isActive) {
      return t('chat.activeNow');
    }
    if (remotePresence?.lastSeenAt) {
      const mins = Math.max(1, Math.floor((Date.now() - remotePresence.lastSeenAt) / 60000));
      if (mins < 60) {
        return t('chat.lastOnlineMinutes', {mins});
      }
      const hours = Math.floor(mins / 60);
      return t('chat.lastOnlineHours', {hours});
    }
    return t('chat.lastActiveRecent');
  }, [remotePresence, remoteTyping, showLiveTrainingHeader, t]);
  const headerShowsActive = showLiveTrainingHeader || !!remotePresence?.isActive;

  useEffect(() => {
    if (!showLiveTrainingHeader) {
      trainingPulse.stopAnimation();
      trainingPulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(trainingPulse, {
          toValue: 1.06,
          duration: 700,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
        Animated.timing(trainingPulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [showLiveTrainingHeader, trainingPulse]);

  useEffect(() => {
    if (!isDm) {
      return;
    }
    setLocalTyping(message.trim().length > 0);
  }, [isDm, message]);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardOpen(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardOpen(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (!isDm || !chatId || !currentUserId) {
      return;
    }
    const channel = supabase.channel(`dm_presence_${chatId}`, {
      config: {presence: {key: currentUserId}},
    });
    presenceChannelRef.current = channel;

    const trackSelf = (typing: boolean) => {
      void channel.track({
        userId: currentUserId,
        active: true,
        typing,
        lastSeenAt: Date.now(),
        trainingNow: !!activeSession,
        trainingGymName: activeSession?.gymName ?? null,
      });
    };

    channel
      .on('presence', {event: 'sync'}, () => {
        const state = channel.presenceState() as Record<string, Array<Record<string, unknown>>>;
        const remoteMeta = Object.values(state)
          .flat()
          .find(meta => meta.userId === otherParticipantId) as
          | {
              typing?: boolean;
              active?: boolean;
              lastSeenAt?: number;
              trainingNow?: boolean;
              trainingGymName?: string;
            }
          | undefined;
        if (otherParticipantId) {
          upsertDmPresence(otherParticipantId, {
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
            typingForThread: {threadId: chatId, typing: !!remoteMeta?.typing},
          });
          if (typeof remoteMeta?.lastSeenAt === 'number') {
            setThreadSeenAtByUser(chatId, otherParticipantId, remoteMeta.lastSeenAt);
          }
        }
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          trackSelf(false);
        }
      });

    return () => {
      presenceChannelRef.current = null;
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [
    chatId,
    currentUserId,
    isDm,
    otherParticipantId,
    setThreadSeenAtByUser,
    upsertDmPresence,
  ]);

  useEffect(() => {
    if (!isDm || !chatId || !currentUserId) {
      return;
    }
    const ch = presenceChannelRef.current;
    if (!ch) {
      return;
    }
    const seenAt = Date.now();
    setThreadSeenAtByUser(chatId, currentUserId, seenAt);
    void ch.track({
      userId: currentUserId,
      active: true,
      typing: localTyping,
      lastSeenAt: seenAt,
      trainingNow: !!activeSession,
      trainingGymName: activeSession?.gymName ?? null,
    });
  }, [
    activeSession,
    chatId,
    currentUserId,
    isDm,
    localTyping,
    messages.length,
    setThreadSeenAtByUser,
  ]);

  useEffect(() => {
    if (!isDm || !chatId) {
      return;
    }
    if (isDemoContentMode() && chatId.startsWith('demo-thread-')) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetchPlannedWorkoutByThread(chatId);
        if (cancelled || !r) {
          return;
        }
        if (r.workout.status === 'active') {
          setActivePlanForChat(chatId, mapServerPlanToChatPlan(r));
        }
      } catch {
        // offline / tabel findes ikke endnu
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isDm, chatId, setActivePlanForChat]);

  const serverPwId = activePlan?.serverPlannedWorkoutId;
  useEffect(() => {
    if (!serverPwId || !chatId) {
      return;
    }
    const ch = supabase
      .channel(`chat_pw_${serverPwId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'planned_workout_participants',
          filter: `planned_workout_id=eq.${serverPwId}`,
        },
        () => {
          void (async () => {
            const r = await fetchPlannedWorkoutByThread(chatId);
            if (r?.workout.status === 'active') {
              setActivePlanForChat(chatId, mapServerPlanToChatPlan(r));
            }
          })();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [serverPwId, chatId, setActivePlanForChat]);

  useEffect(() => {
    initialMessageHandledRef.current = false;
  }, [chatId]);

  const planInviteColorScheme = useColorScheme();
  const planInviteUser = useAppStore(s => s.user);

  const combinePlanInviteDateTime = useCallback(() => {
    const scheduled = new Date(planInviteDate);
    scheduled.setHours(planInviteTime.getHours(), planInviteTime.getMinutes(), 0, 0);
    return scheduled;
  }, [planInviteDate, planInviteTime]);

  const scheduledPlanInvitePreview = useMemo(
    () => combinePlanInviteDateTime(),
    [combinePlanInviteDateTime],
  );

  useFocusEffect(
    useCallback(() => {
      if (!chatId) {
        return;
      }
      setForegroundOpenChatId(chatId);
      if (isDm) {
        markChatAsRead(chatId);
        markMessageNotificationsForChatRead(chatId);
        setThreadSeenAtByUser(chatId, currentUserId, Date.now());
        void loadRecipientTraining();
        if (chatId && isDmThreadId(chatId) && !(isDemoContentMode() && chatId.startsWith('demo-thread-'))) {
          void markDmThreadMessagesRead(chatId).then(() => {
            const me = useAppStore.getState().user;
            if (me?.id) {
              void syncDmInboxToStore(me.id, (me.displayName || 'Dig').trim());
            }
          });
        }
      } else {
        initializeChatMessages(chatId, []);
        markChatAsRead(chatId);
        markMessageNotificationsForChatRead(chatId);
      }
      return () => {
        setForegroundOpenChatId(null);
      };
    }, [
      chatId,
      isDm,
      currentUserId,
      loadRecipientTraining,
      initializeChatMessages,
      markChatAsRead,
      markMessageNotificationsForChatRead,
      setThreadSeenAtByUser,
      setForegroundOpenChatId,
    ]),
  );

  useEffect(() => {
    if (!chatId || !isDm) {
      return;
    }
    if (isDemoContentMode() && chatId.startsWith('demo-thread-')) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchDmMessages(chatId, {limit: 100});
        if (cancelled) {
          return;
        }
        setMessagesForChat(chatId, list);
        if (
          chatId &&
          isDmThreadId(chatId) &&
          !(isDemoContentMode() && chatId.startsWith('demo-thread-'))
        ) {
          void markDmThreadMessagesRead(chatId).then(() => {
            const me = useAppStore.getState().user;
            if (me?.id) {
              void syncDmInboxToStore(me.id, (me.displayName || 'Dig').trim());
            }
          });
        }
        if (initialMessage?.trim() && !initialMessageHandledRef.current) {
          const {message: sent} = await sendDmMessage(chatId, {
            body: initialMessage.trim(),
          });
          initialMessageHandledRef.current = true;
          addMessageToChat(chatId, sent);
          updateChatLastMessage(chatId, sent, {fromCurrentUser: true});
        }
      } catch (e) {
        if (!cancelled) {
          console.warn('[ChatScreen] Kunne ikke hente DM-beskeder:', e);
          setMessagesForChat(chatId, []);
        }
      } finally {
        if (!cancelled) {
          markChatAsRead(chatId);
          markMessageNotificationsForChatRead(chatId);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chatId, isDm, setMessagesForChat, addMessageToChat, updateChatLastMessage, markChatAsRead, markMessageNotificationsForChatRead]);

  useEffect(() => {
    if (isDm) {
      return;
    }
    if (!chatId || !initialMessage || initialMessageHandledRef.current) {
      return;
    }
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      text: initialMessage,
      senderId: currentUserId,
      timestamp: new Date(),
      isRead: false,
    };
    addMessageToChat(chatId, newMessage);
    updateChatLastMessage(chatId, newMessage, {fromCurrentUser: true});
    initialMessageHandledRef.current = true;
  }, [
    isDm,
    addMessageToChat,
    updateChatLastMessage,
    chatId,
    currentUserId,
    initialMessage,
  ]);

  useEffect(() => {
    setHeaderDisplayName(safeDisplayName(friendName, 'Ukendt bruger'));
  }, [friendName]);

  useEffect(() => {
    if (!friendId) {
      setHeaderAvatarUrl(null);
      return;
    }
    let cancelled = false;
    const loadProfile = async () => {
      try {
        if (friendId && isDemoContentMode()) {
          const demo = getDemoProfileById(friendId);
          if (demo) {
            if (!cancelled) {
              setHeaderDisplayName(safeDisplayName(demo.displayName, demo.username, friendName, 'Ukendt bruger'));
              setHeaderAvatarUrl(demo.avatarUrl ?? null);
            }
            return;
          }
        }
        const m = await getPublicProfilesByIds([friendId]);
        if (cancelled) {
          return;
        }
        const p = m.get(friendId);
        setHeaderDisplayName(safeDisplayName(p?.displayName, p?.username, friendName, 'Ukendt bruger'));
        setHeaderAvatarUrl(p?.avatarUrl ?? null);
      } catch {
        if (!cancelled) {
          setHeaderDisplayName(safeDisplayName(friendName, 'Ukendt bruger'));
          setHeaderAvatarUrl(null);
        }
      }
    };
    void loadProfile();

    const ch = supabase
      .channel(`chat_profile_${friendId}`)
      .on(
        'postgres_changes',
        {event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${friendId}`},
        payload => {
          const next = payload.new as {
            display_name?: string | null;
            username?: string | null;
            avatar_url?: string | null;
          };
          setHeaderDisplayName(
            safeDisplayName(next.display_name, next.username, friendName, 'Ukendt bruger'),
          );
          setHeaderAvatarUrl(next.avatar_url ?? null);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(ch);
    };
  }, [friendId, friendName]);

  useEffect(() => {
    // Scroll to bottom when messages change
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({animated: true});
    }, 100);
  }, [messages]);

  const handleSend = async () => {
    if (isSendingImage) {
      return;
    }
    if (!message.trim() && !selectedImageUri) {
      return;
    }

    if (isDm && chatId) {
      if (selectedImageUri) {
        setIsSendingImage(true);
        try {
          const imageUrl = await uploadDmChatImage(
            selectedImageUri,
            chatId,
            selectedImageMime,
          );
          const {message: sent} = await sendDmMessage(chatId, {
            body: message.trim(),
            imageUrl,
          });
          addMessageToChat(chatId, sent);
          updateChatLastMessage(chatId, sent, {fromCurrentUser: true});
          setMessage('');
          setLocalTyping(false);
          setSelectedImageUri(null);
          setSelectedImageMime(null);
        } catch (e) {
          Alert.alert(
            t('chat.couldNotSend'),
            userFacingDmError(e, rt('errors.tryAgainSoon')),
          );
        } finally {
          setIsSendingImage(false);
        }
        return;
      }
      if (!message.trim()) {
        return;
      }
      const textToSend = message.trim();
      const useOptimistic = !!(chatId && isDmThreadId(chatId));
      const tempId = useOptimistic ? `pending-${Date.now()}` : '';
      if (useOptimistic && chatId) {
        const optimisticMessage = {
          id: tempId,
          text: textToSend,
          senderId: currentUserId,
          timestamp: new Date(),
          isRead: false,
          sendState: 'sending' as const,
        };
        addMessageToChat(chatId, optimisticMessage);
        updateChatLastMessage(chatId, optimisticMessage, {fromCurrentUser: true});
      }
      setMessage('');
      setLocalTyping(false);
      try {
        const {message: sent} = await sendDmMessage(chatId, {
          body: textToSend,
        });
        if (useOptimistic && chatId) {
          resolvePendingDmMessage(chatId, tempId, sent);
        } else if (chatId) {
          addMessageToChat(chatId, sent);
        }
        updateChatLastMessage(chatId, sent, {fromCurrentUser: true});
      } catch (e) {
        if (useOptimistic && chatId) {
          abortPendingDmMessage(chatId, tempId);
        }
        Alert.alert(t('chat.couldNotSend'), userFacingDmError(e));
      }
      return;
    }

    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      text: message.trim(),
      senderId: currentUserId,
      timestamp: new Date(),
      isRead: false,
      imageUri: selectedImageUri || undefined,
    };

    if (chatId) {
      addMessageToChat(chatId, newMessage);
      updateChatLastMessage(chatId, newMessage, {fromCurrentUser: true});
    }
    setMessage('');
    setLocalTyping(false);
    setSelectedImageUri(null);
    setSelectedImageMime(null);
  };

  const handleImagePickerToggle = () => {
    setShowImagePickerOptions(prev => !prev);
  };

  const handleCameraPress = () => {
    Vibration.vibrate(10);
    setShowImagePickerOptions(false);
    openCamera();
  };

  const handleGalleryPress = () => {
    Vibration.vibrate(10);
    setShowImagePickerOptions(false);
    openImageLibrary();
  };

  const openCamera = () => {
    const cameraOptions: CameraOptions = {
      mediaType: 'photo',
      cameraType: 'back',
      saveToPhotos: true,
      quality: 0.8,
    };

    launchCamera(cameraOptions, (response: ImagePickerResponse) => {
      if (response.didCancel) {
        return;
      }
      if (response.errorCode) {
        Alert.alert(t('chat.cameraError'), response.errorMessage || t('chat.couldNotOpenCamera'));
        return;
      }
      const asset = response.assets && response.assets[0];
      if (asset?.uri) {
        setSelectedImageUri(asset.uri);
        setSelectedImageMime(asset.type ?? null);
      }
    });
  };

  const openImageLibrary = () => {
    const libraryOptions: CameraOptions = {
      mediaType: 'photo',
      quality: 0.8,
    };

    launchImageLibrary(libraryOptions, (response: ImagePickerResponse) => {
      if (response.didCancel) {
        return;
      }
      if (response.errorCode) {
        Alert.alert(t('chat.photosError'), response.errorMessage || t('chat.couldNotOpenPhotos'));
        return;
      }
      const asset = response.assets && response.assets[0];
      if (asset?.uri) {
        setSelectedImageUri(asset.uri);
        setSelectedImageMime(asset.type ?? null);
      }
    });
  };

  const formatTime = (date: Date) => {
    return format(date, 'HH:mm', {locale: dateFnsLocale});
  };

  const formatDate = (date: Date) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')) {
      return t('chat.today');
    }
    if (format(date, 'yyyy-MM-dd') === format(yesterday, 'yyyy-MM-dd')) {
      return t('chat.yesterday');
    }
    return format(date, 'P', {locale: dateFnsLocale});
  };

  const formatPlanDateTime = (date: Date) =>
    format(date, 'PPPPp', {locale: dateFnsLocale});

  const handleOpenPlanModal = () => {
    const {date, time} = defaultScheduleParts();
    setPlanInviteDate(date);
    setPlanInviteTime(time);
    setPlanInviteMuscle('bryst');
    const primaryId = planInviteUser?.favoriteGyms?.[0];
    const fromProfile = primaryId ? findGymByIdRelaxed(primaryId) : null;
    setPlanSelectedGym(fromProfile ?? FALLBACK_PLAN_INVITE_GYMS[0] ?? null);
    setShowPlanInviteDatePicker(false);
    setShowPlanInviteTimeSheet(false);
    setPlanModalVisible(true);
  };

  const handlePlanInviteDateChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') {
      setShowPlanInviteDatePicker(false);
    }
    if (date) {
      setPlanInviteDate(date);
    }
    if (Platform.OS === 'ios' && event.type === 'dismissed') {
      setShowPlanInviteDatePicker(false);
    }
  };

  const handleCreatePlan = () => {
    if (!planSelectedGym) {
      Alert.alert(t('chat.missingCenter'), t('chat.selectCenterForWorkout'));
      return;
    }
    if (!chatId) {
      return;
    }

    const scheduledAt = combinePlanInviteDateTime();
    const now = new Date();
    if (scheduledAt.getTime() <= now.getTime()) {
      Alert.alert(t('chat.invalidTime'), t('chat.selectFutureTime'));
      return;
    }

    const resetPlanModal = () => {
      setPlanModalVisible(false);
      setPlanSelectedGym(null);
      setShowPlanInviteDatePicker(false);
      setShowPlanInviteTimeSheet(false);
    };

    const canUseServerPlannedInvite =
      !!chatId &&
      isDmThreadId(chatId) &&
      !(isDemoContentMode() && chatId.startsWith('demo-thread-'));

    if (!canUseServerPlannedInvite) {
      Alert.alert(
        t('chat.couldNotCreate'),
        t('chat.planNeedsThread'),
      );
      return;
    }

    const inviteeIds = chatParticipants
      .map(p => p.id)
      .filter(id => id !== currentUserId && isUuidLike(id));

    if (inviteeIds.length === 0) {
      Alert.alert(
        t('chat.noOneToInvite'),
        t('chat.needOtherParticipant'),
      );
      return;
    }

    setPlanActionBusy(true);
    void (async () => {
      try {
        await createTrainingInvitation({
          centerId: planSelectedGym.id,
          centerName: formatGymDisplayName(planSelectedGym),
          scheduledAt,
          trainingTypes: [String(planInviteMuscle)],
          note: null,
          inviteeIds,
          threadId: chatId,
        });
        const r = await fetchPlannedWorkoutByThread(chatId);
        if (r) {
          setActivePlanForChat(chatId, mapServerPlanToChatPlan(r));
        }
        const plannerId = planInviteUser?.id;
        if (plannerId && isUuidLike(plannerId)) {
          try {
            const entries = await loadWorkoutPlanEntriesForUser(plannerId, true);
            mergePlannedFromServer(entries);
          } catch {
            // Plan opdateres ved næste åbning af Planlagte sessions
          }
        }
        if (currentUserId && isUuidLike(currentUserId)) {
          void refreshInAppNotifications(currentUserId);
        }
      } catch (e) {
        Alert.alert(t('chat.couldNotCreate'), (e as Error).message);
      } finally {
        setPlanActionBusy(false);
        resetPlanModal();
      }
    })();
  };

  const isPlanCreator = activePlan?.createdBy === currentUserId;

  const handleDeclineServerPlan = () => {
    if (!chatId || !activePlan || isPlanCreator) {
      return;
    }
    if (activePlan.inviteeResponse !== 'pending') {
      return;
    }
    if (
      isDemoContentMode() &&
      chatId.startsWith('demo-thread-') &&
      !activePlan.serverPlannedWorkoutId
    ) {
      setPlanActionBusy(true);
      try {
        const pwId = activePlan.id;
        setActivePlanForChat(chatId, {
          ...activePlan,
          inviteeResponse: 'declined',
        });
        const statusMsg: ChatMessage = {
          id: `demo-plan-status-${Date.now()}`,
          text: '',
          senderId: currentUserId,
          timestamp: new Date(),
          isRead: true,
          plannedWorkoutEmbed: {
            kind: 'status',
            plannedWorkoutId: pwId,
            status: 'declined',
          },
        };
        addMessageToChat(chatId, statusMsg);
        updateChatLastMessage(chatId, statusMsg, {fromCurrentUser: true});
      } finally {
        setPlanActionBusy(false);
      }
      return;
    }
    if (!activePlan.serverPlannedWorkoutId) {
      return;
    }
    setPlanActionBusy(true);
    void (async () => {
      try {
        await respondPlannedWorkoutInvite(activePlan.serverPlannedWorkoutId!, false);
        const r = await fetchPlannedWorkoutByThread(chatId);
        if (r) {
          setActivePlanForChat(chatId, mapServerPlanToChatPlan(r));
        }
        if (currentUserId) {
          void refreshInAppNotifications(currentUserId);
        }
      } catch (e) {
        Alert.alert(t('chat.couldNotDecline'), (e as Error).message);
      } finally {
        setPlanActionBusy(false);
      }
    })();
  };

  const handleJoinPlan = () => {
    if (!chatId || !activePlan) {
      return;
    }

    if (activePlan.serverPlannedWorkoutId) {
      if (isPlanCreator) {
        setPlanDetailVisible(true);
        return;
      }
      if (activePlan.inviteeResponse === 'pending') {
        setPlanActionBusy(true);
        void (async () => {
          try {
            await respondPlannedWorkoutInvite(activePlan.serverPlannedWorkoutId!, true);
            const r = await fetchPlannedWorkoutByThread(chatId);
            if (r) {
              setActivePlanForChat(chatId, mapServerPlanToChatPlan(r));
            }
            if (isUuidLike(currentUserId)) {
              try {
                const entries = await loadWorkoutPlanEntriesForUser(currentUserId, true);
                mergePlannedFromServer(entries);
              } catch {
                /* kalender opdateres ved næste åbning */
              }
            }
            if (currentUserId) {
              void refreshInAppNotifications(currentUserId);
            }
            Alert.alert(t('chat.workoutAdded'), t('chat.workoutAddedBody'));
          } catch (e) {
            Alert.alert(t('friendProfile.couldNotAccept'), (e as Error).message);
          } finally {
            setPlanActionBusy(false);
          }
        })();
        return;
      }
      setPlanDetailVisible(true);
      return;
    }

    if (
      isDemoContentMode() &&
      chatId.startsWith('demo-thread-') &&
      !activePlan.serverPlannedWorkoutId &&
      activePlan.inviteeResponse === 'pending'
    ) {
      if (isPlanCreator) {
        setPlanDetailVisible(true);
        return;
      }
      const pwId = activePlan.id;
      setActivePlanForChat(chatId, {
        ...activePlan,
        inviteeResponse: 'accepted',
        joinedIds: [...new Set([...activePlan.joinedIds, currentUserId])],
      });
      const statusMsg: ChatMessage = {
        id: `demo-plan-status-${Date.now()}`,
        text: '',
        senderId: currentUserId,
        timestamp: new Date(),
        isRead: true,
        plannedWorkoutEmbed: {
          kind: 'status',
          plannedWorkoutId: pwId,
          status: 'accepted',
        },
      };
      addMessageToChat(chatId, statusMsg);
      updateChatLastMessage(chatId, statusMsg, {fromCurrentUser: true});
      useWorkoutPlanStore.getState().addPlannedWorkout({
        id: `demo-accepted-${pwId}-${Date.now()}`,
        creatorUserId: activePlan.createdBy,
        gym: activePlan.gym,
        muscles: activePlan.muscles,
        scheduledAt: activePlan.scheduledAt,
        invitedFriends: activePlan.invitedIds,
        acceptedFriends: [...new Set([currentUserId, activePlan.createdBy])],
        inviteStatusByUserId: {[currentUserId]: 'accepted'},
      });
      Alert.alert(t('chat.workoutAdded'), t('chat.workoutAddedBody'));
      return;
    }

    updateActivePlanForChat(chatId, prev => {
      if (!prev) {
        return prev;
      }
      const hasJoined = prev.joinedIds.includes(currentUserId);
      if (hasJoined) {
        return {
          ...prev,
          joinedIds: prev.joinedIds.filter(id => id !== currentUserId),
        };
      }
      return {
        ...prev,
        joinedIds: [...prev.joinedIds, currentUserId],
      };
    });
  };

  const planParticipants = participantList.map(participant => ({
    ...participant,
    hasJoined: activePlan?.joinedIds.includes(participant.id) ?? false,
  }));

  const latestMyMessageId = useMemo(() => {
    for (let i = dmMessagesForList.length - 1; i >= 0; i--) {
      const msg = dmMessagesForList[i];
      if (msg.senderId === currentUserId) {
        return msg.id;
      }
    }
    return null;
  }, [dmMessagesForList, currentUserId]);

  const renderMessage = ({item, index}: {item: ChatMessage; index: number}) => {
    const isMe = item.senderId === currentUserId;
    const isLatestOutgoing = isMe && item.id === latestMyMessageId;
    const showDmReceipt =
      isDm && !!chatId && isDmThreadId(chatId) && isLatestOutgoing;
    let dmReceiptLabel: string | null = null;
    if (showDmReceipt) {
      if (item.sendState === 'sending' || item.id.startsWith('pending-')) {
        dmReceiptLabel = t('chat.sending');
      } else if (item.readAt) {
        dmReceiptLabel = t('chat.readAt', {
          time: format(item.readAt, 'HH:mm', {locale: dateFnsLocale}),
        });
      } else {
        dmReceiptLabel = t('chat.delivered');
      }
    }
    const showSeenLegacy =
      !isDm &&
      isLatestOutgoing &&
      typeof remoteSeenAt === 'number' &&
      remoteSeenAt >= item.timestamp.getTime();
    const showDate =
      index === 0 ||
      formatDate(item.timestamp) !== formatDate(dmMessagesForList[index - 1].timestamp);

    return (
      <View>
        {showDate && (
          <View style={styles.dateContainer}>
            <Text style={styles.dateText}>{formatDate(item.timestamp)}</Text>
          </View>
        )}
        <View
          style={[
            styles.messageContainer,
            isMe ? styles.messageRight : styles.messageLeft,
          ]}>
          <AnimatedMessageWrap>
            <View
              style={[
                styles.messageBubble,
                isMe ? styles.messageBubbleMe : styles.messageBubbleOther,
                item.imageUri &&
                  (item.text?.trim()
                    ? styles.messageBubbleWithImage
                    : styles.messageBubbleImageOnly),
              ]}>
            {item.imageUri && (
              <DmChatMessageImage
                uri={item.imageUri}
                maxWidth={maxDmImageWidth}
                onPress={() => setLightboxUri(item.imageUri!)}
              />
            )}
            {item.plannedWorkoutEmbed?.kind === 'status' ? (
              <View style={styles.planMessageStatusBubble}>
                <Text
                  style={
                    item.plannedWorkoutEmbed.status === 'accepted'
                      ? styles.planMessageCardStatusOk
                      : styles.planMessageCardStatusNo
                  }>
                  {item.plannedWorkoutEmbed.status === 'accepted'
                    ? t('chat.accepted')
                    : t('chat.declined')}
                </Text>
              </View>
            ) : null}
            {item.text?.trim() ? (
            <Text
              style={[
                styles.messageText,
                isMe ? styles.messageTextMe : styles.messageTextOther,
                item.imageUri && styles.messageTextWithImage,
              ]}>
              {item.text}
            </Text>
            ) : null}
            <Text
              style={[
                styles.messageTime,
                isMe ? styles.messageTimeMe : styles.messageTimeOther,
                item.imageUri && !item.text?.trim() && styles.messageTimeImageOnly,
              ]}>
              {formatTime(item.timestamp)}
            </Text>
            </View>
          </AnimatedMessageWrap>
          {dmReceiptLabel ? (
            <View style={styles.readReceiptRow}>
              <Text style={styles.readReceiptText}>{dmReceiptLabel}</Text>
            </View>
          ) : showSeenLegacy ? (
            <Animated.View style={styles.seenRow}>
              <Text style={styles.seenText}>Set</Text>
            </Animated.View>
          ) : null}
        </View>
      </View>
    );
  };

  const inputBarBottomPad = keyboardOpen ? 0 : Math.max(insets.bottom, spacing.xs);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            activeOpacity={0.8}>
            <Icon name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerInfo}
            onPress={() => {
              if (friendId) {
                navigateToFriendProfile(navigation, {
                  friendId,
                  friendName: headerDisplayName,
                  friendAvatarUrl: headerAvatarUrl ?? undefined,
                });
              }
            }}
            activeOpacity={0.7}
            disabled={!friendId}
            accessibilityRole="button"
            accessibilityLabel={t('chat.openProfile', {name: headerDisplayName})}>
            <UserAvatar name={headerDisplayName} imageUrl={headerAvatarUrl} size="md" />
            <View style={styles.headerTextWrap}>
              <Text style={styles.headerName} numberOfLines={1} ellipsizeMode="tail">
                {headerDisplayName}
              </Text>
              <View style={styles.headerStatusRow}>
                {showLiveTrainingHeader ? (
                  <Animated.View style={{transform: [{scale: trainingPulse}]}}>
                    <Icon name="barbell-outline" size={12} color={colors.success} />
                  </Animated.View>
                ) : null}
                <Text
                  style={[
                    styles.headerHint,
                    headerShowsActive && styles.headerHintActive,
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail">
                  {headerStatusText}
                </Text>
              </View>
              {showLiveTrainingHeader && headerLiveContextText ? (
                <Text
                  style={styles.headerLiveContext}
                  numberOfLines={1}
                  ellipsizeMode="tail">
                  {headerLiveContextText}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Messages List */}
      <View style={styles.chatBody}>
        {showPlanInviteBanner && activePlan ? (
          <View style={styles.planBannerOuter}>
            <View
              style={styles.planBannerGradientHost}
              onLayout={e => {
                const {width, height} = e.nativeEvent.layout;
                if (width > 0 && height > 0) {
                  setPlanBannerSurfaceSize({w: width, h: height});
                }
              }}>
              <Svg
                pointerEvents="none"
                width={planBannerSurfaceSize.w}
                height={planBannerSurfaceSize.h}
                style={StyleSheet.absoluteFill}>
                <Defs>
                  <LinearGradient
                    id={planBannerGradId}
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="100%">
                    <Stop offset="0%" stopColor={colors.primaryLight} />
                    <Stop offset="48%" stopColor={colors.primary} />
                    <Stop offset="100%" stopColor={colors.primaryDark} />
                  </LinearGradient>
                </Defs>
                <Rect
                  x={0}
                  y={0}
                  width={planBannerSurfaceSize.w}
                  height={planBannerSurfaceSize.h}
                  rx={16}
                  ry={16}
                  fill={`url(#${planBannerGradId})`}
                />
              </Svg>
              <TouchableOpacity
                style={styles.planBannerCloseBtn}
                onPress={() => {
                  if (chatId && planInviteBannerSurfaceId) {
                    setDismissedPlanInviteBanner(chatId, planInviteBannerSurfaceId);
                  }
                }}
                hitSlop={{top: 10, right: 10, bottom: 10, left: 10}}
                accessibilityRole="button"
                accessibilityLabel="Skjul invitation">
                <View style={styles.planBannerCloseCircle}>
                  <Icon name="close" size={18} color={colors.white} />
                </View>
              </TouchableOpacity>
              <View style={styles.planBannerMainRow}>
                <Pressable
                  style={({pressed}) => [
                    styles.planBannerTapCol,
                    pressed && styles.planBannerTapPressed,
                  ]}
                  onPress={() => setPlanDetailVisible(true)}
                  onLongPress={() => {
                    if (activePlan.serverPlannedWorkoutId) {
                      navigation.navigate('WorkoutSchedule', {
                        openPlannedId: activePlan.serverPlannedWorkoutId,
                      });
                    } else {
                      navigation.navigate('WorkoutSchedule', {initialTab: 'upcoming'});
                    }
                  }}>
                  {(() => {
                    const joinedNames = planParticipants
                      .filter(participant => participant.hasJoined)
                      .map(participant => participant.name);
                    const pendingNames = planParticipants
                      .filter(participant => !participant.hasJoined)
                      .map(participant => participant.name);
                    const useServer = !!activePlan.serverPlannedWorkoutId || demoDmPlanInviteUi;
                    const isCreator = activePlan.createdBy === currentUserId;
                    const serverStatusLine = useServer
                      ? isCreator
                        ? activePlan.inviteeResponse === 'pending'
                          ? `Afventer svar · ${friendName}`
                          : activePlan.inviteeResponse === 'accepted'
                            ? t('chat.trainingTogetherAccepted')
                            : `${friendName} har afvist`
                        : activePlan.inviteeResponse === 'pending'
                          ? 'Du er inviteret'
                          : activePlan.inviteeResponse === 'accepted'
                            ? 'Du deltager'
                            : 'Du har afvist'
                      : null;
                    const infoText = useServer
                      ? serverStatusLine
                      : joinedNames.length > 0
                        ? `${joinedNames.join(', ')} har joinet`
                        : t('chat.noOneJoinedYet');
                    const pendingText = useServer
                      ? null
                      : pendingNames.length > 0
                        ? t('chat.waitingFor', {names: pendingNames.join(', ')})
                        : '';
                    return (
                      <View style={styles.planBannerTextBlock}>
                        <Text style={styles.planBannerTitle}>{t('chat.plannedWorkout')}</Text>
                        <Text style={styles.planBannerSubtitle}>
                          {formatGymDisplayName(activePlan.gym)} •{' '}
                          {formatPlanDateTime(activePlan.scheduledAt)}
                        </Text>
                        <Text style={styles.planBannerSubtitle}>
                          {formatMuscleSelection(activePlan.muscles)}
                        </Text>
                        <Text style={styles.planBannerInfo}>{infoText}</Text>
                        {pendingText ? (
                          <Text style={styles.planBannerPending}>{pendingText}</Text>
                        ) : null}
                        {useServer ? (
                          <Text style={styles.planBannerHint}>Langt tryk → kalender</Text>
                        ) : null}
                      </View>
                    );
                  })()}
                </Pressable>
                <View style={styles.planBannerSideCol}>
                  {(() => {
                    const useServer = !!activePlan.serverPlannedWorkoutId || demoDmPlanInviteUi;
                    const isCreator = activePlan.createdBy === currentUserId;
                    if (useServer && !isCreator && activePlan.inviteeResponse === 'pending') {
                      return (
                        <View style={styles.planBannerActionRow}>
                          <TouchableOpacity
                            style={styles.planBannerDecline}
                            onPress={handleDeclineServerPlan}
                            disabled={planActionBusy}
                            activeOpacity={0.9}>
                            <Text style={styles.planBannerDeclineText}>Afvis</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.planBannerJoin}
                            onPress={handleJoinPlan}
                            disabled={planActionBusy}
                            activeOpacity={0.9}>
                            {planActionBusy ? (
                              <ActivityIndicator color={colors.primary} size="small" />
                            ) : (
                              <Text style={styles.planBannerJoinText}>Accepter</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      );
                    }
                    if (useServer && isCreator) {
                      return (
                        <View style={styles.planBannerCreatorBadge}>
                          <Text style={styles.planBannerJoinTextAnmodet}>Inviteret</Text>
                        </View>
                      );
                    }
                    if (!useServer) {
                      return (
                        <TouchableOpacity
                          style={[
                            styles.planBannerJoin,
                            activePlan.joinedIds.includes(currentUserId) &&
                              styles.planBannerJoinAnmodet,
                          ]}
                          onPress={handleJoinPlan}
                          activeOpacity={0.9}>
                          <Text
                            style={[
                              styles.planBannerJoinText,
                              activePlan.joinedIds.includes(currentUserId) &&
                                styles.planBannerJoinTextAnmodet,
                            ]}>
                            {activePlan.joinedIds.includes(currentUserId)
                              ? 'Anmodet'
                              : 'Deltag'}
                          </Text>
                        </TouchableOpacity>
                      );
                    }
                    return (
                      <TouchableOpacity
                        style={[styles.planBannerJoin, styles.planBannerJoinAnmodet]}
                        onPress={() => setPlanDetailVisible(true)}
                        activeOpacity={0.9}>
                        <Text style={styles.planBannerJoinTextAnmodet}>{t('chat.details')}</Text>
                      </TouchableOpacity>
                    );
                  })()}
                </View>
              </View>
            </View>
          </View>
        ) : null}
        <FlatList
          ref={flatListRef}
          data={dmMessagesForList}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messagesList}
          ListFooterComponent={
            remoteTyping ? (
              <View style={styles.typingBubbleWrap}>
                <View style={styles.typingBubble}>
                  <TypingDotsInline />
                </View>
              </View>
            ) : null
          }
          inverted={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({animated: true})}
        />
      </View>

      {/* Plan Modal — samme UI som Inviter til træning (PlannedWorkoutInviteForm) */}
      <Modal
        visible={planModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!planActionBusy) {
            setPlanModalVisible(false);
          }
        }}>
        <View style={styles.planInviteModalRoot}>
          <Pressable
            style={styles.planInviteModalBackdrop}
            onPress={() => {
              if (
                planActionBusy ||
                showPlanInviteDatePicker ||
                showPlanInviteTimeSheet
              ) {
                return;
              }
              setPlanModalVisible(false);
            }}
          />
          <View
            style={[
              styles.planInviteSheet,
              styles.planModal,
              {paddingBottom: Math.max(insets.bottom, spacing.md)},
            ]}>
            <View style={styles.planInviteSheetHeader}>
              <Pressable
                onPress={() => {
                  if (!planActionBusy) {
                    setPlanModalVisible(false);
                  }
                }}
                hitSlop={12}
                style={({pressed}) => [
                  styles.planInviteClosePill,
                  pressed && styles.planInviteClosePillPressed,
                ]}>
                <Icon name="close" size={22} color={colors.text} />
              </Pressable>
            </View>
            <PlannedWorkoutInviteForm
              variant="compact"
              title={t('chat.planWorkout')}
              subtitle={t('chat.planWorkoutSubtitle')}
              peerDisplayName={headerDisplayName}
              selectedDate={planInviteDate}
              selectedTime={planInviteTime}
              onPressSelectDate={() => setShowPlanInviteDatePicker(true)}
              onPressSelectTime={() => setShowPlanInviteTimeSheet(true)}
              scheduledPreview={scheduledPlanInvitePreview}
              planSelectedGym={planSelectedGym}
              onGymChange={setPlanSelectedGym}
              planMuscle={planInviteMuscle}
              onMuscleChange={setPlanInviteMuscle}
              onSubmit={handleCreatePlan}
              submitLabel="Send invitation"
              saving={planActionBusy}
              submitDisabled={planActionBusy || !planSelectedGym}
              scrollBottomPadding={spacing.lg}
            />
            <TimePickerSheet
              visible={showPlanInviteTimeSheet}
              value={planInviteTime}
              onClose={() => setShowPlanInviteTimeSheet(false)}
              onConfirm={d => setPlanInviteTime(d)}
              minuteInterval={15}
            />
          </View>
          {showPlanInviteDatePicker && Platform.OS === 'ios' && (
            <View style={styles.planInvitePickerModal} pointerEvents="box-none">
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={() => setShowPlanInviteDatePicker(false)}
              />
              <View style={styles.planInvitePickerModalContent}>
                <View style={styles.planInvitePickerHeader}>
                  <Pressable
                    onPress={() => setShowPlanInviteDatePicker(false)}
                    style={styles.planInvitePickerHeaderBtn}>
                    <Text style={styles.planInvitePickerCancel}>Annuller</Text>
                  </Pressable>
                  <Text style={styles.planInvitePickerTitle}>Dato</Text>
                  <Pressable
                    onPress={() => setShowPlanInviteDatePicker(false)}
                    style={styles.planInvitePickerHeaderBtn}>
                    <Text style={styles.planInvitePickerOk}>OK</Text>
                  </Pressable>
                </View>
                <DateTimePicker
                  value={planInviteDate}
                  mode="date"
                  display="spinner"
                  onChange={handlePlanInviteDateChange}
                  minimumDate={new Date()}
                  locale="da_DK"
                  themeVariant={planInviteColorScheme === 'dark' ? 'dark' : 'light'}
                  textColor={planInviteColorScheme === 'dark' ? '#F9FAFB' : '#111827'}
                  style={styles.planInvitePicker}
                />
              </View>
            </View>
          )}
          {showPlanInviteDatePicker && Platform.OS === 'android' && (
            <DateTimePicker
              value={planInviteDate}
              mode="date"
              display="default"
              onChange={handlePlanInviteDateChange}
              minimumDate={new Date()}
            />
          )}
        </View>
      </Modal>

      {/* Plan Detail Modal */}
      <Modal visible={planDetailVisible && !!activePlan} transparent animationType="fade">
        <View style={styles.planDetailOverlay}>
          <View style={styles.planDetailCard}>
            <Text style={styles.planModalTitle}>{t('plannedSessions.title')}</Text>
            {activePlan && (
              <>
                <Text style={styles.planDetailTitle}>{formatGymDisplayName(activePlan.gym)}</Text>
                <Text style={styles.planDetailSubtitle}>
                  {formatPlanDateTime(activePlan.scheduledAt)}
                </Text>
                <Text style={styles.planDetailSubtitle}>
                  {formatMuscleSelection(activePlan.muscles)}
                </Text>
                <View style={styles.planDetailParticipants}>
                  {planParticipants.map(participant => (
                    <View key={participant.id} style={styles.planParticipantRow}>
                      <Text style={styles.planParticipantName}>{participant.name}</Text>
                      <Text
                        style={[
                          styles.planParticipantStatus,
                          participant.hasJoined
                            ? styles.planParticipantStatusJoined
                            : styles.planParticipantStatusPending,
                        ]}>
                        {participant.hasJoined ? 'Joinet' : 'Venter'}
                      </Text>
                    </View>
                  ))}
                </View>
                  <TouchableOpacity
                  style={[
                    styles.detailJoinButton,
                    activePlan.joinedIds.includes(currentUserId) && styles.detailJoinButtonAnmodet,
                  ]}
                    onPress={() => {
                      handleJoinPlan();
                      setPlanDetailVisible(false);
                    }}>
                  <Text
                    style={[
                      styles.detailJoinButtonText,
                      activePlan.joinedIds.includes(currentUserId) && styles.detailJoinButtonTextAnmodet,
                    ]}>
                    {activePlan.joinedIds.includes(currentUserId) ? 'Anmodet' : 'Deltag'}
                  </Text>
                  </TouchableOpacity>
              </>
            )}
            <TouchableOpacity
              style={[styles.planModalButton, styles.planModalCancel, {marginTop: 16}]}
              onPress={() => setPlanDetailVisible(false)}>
              <Text style={styles.planModalCancelText}>Luk</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* No extra bottom padding while keyboard is open (avoids grey gap above keyboard) */}
      <View
        style={[
          styles.inputContainer,
          {paddingBottom: inputBarBottomPad},
        ]}>
        {showImagePickerOptions && (
          <TouchableWithoutFeedback onPress={() => setShowImagePickerOptions(false)}>
            <View style={styles.imagePickerBackdrop} />
          </TouchableWithoutFeedback>
        )}
        <View style={styles.inputWrapper}>
          <View style={styles.inputLeadingCluster}>
            {showImagePickerOptions ? (
              <View style={styles.imagePickerOptions}>
                <Pressable
                  style={({pressed}) => [
                    styles.imagePickerCard,
                    pressed && styles.imagePickerCardPressed,
                  ]}
                  onPress={handleCameraPress}
                  android_ripple={{color: 'rgba(0,0,0,0.06)'}}>
                  <Icon
                    name="camera"
                    size={26}
                    color={CHAT_MEDIA_SHEET.icon}
                    style={styles.imagePickerIcon}
                  />
                  <Text style={styles.imagePickerLabel}>Kamera</Text>
                </Pressable>
                <Pressable
                  style={({pressed}) => [
                    styles.imagePickerCard,
                    pressed && styles.imagePickerCardPressed,
                  ]}
                  onPress={handleGalleryPress}
                  android_ripple={{color: 'rgba(0,0,0,0.06)'}}>
                  <Icon
                    name="images"
                    size={26}
                    color={CHAT_MEDIA_SHEET.icon}
                    style={styles.imagePickerIcon}
                  />
                  <Text style={styles.imagePickerLabel}>Fotos</Text>
                </Pressable>
              </View>
            ) : null}
            <TouchableOpacity
              style={styles.inputCircleBtn}
              onPress={handleImagePickerToggle}
              activeOpacity={0.75}
              accessibilityLabel={t('chat.attachPhoto')}>
              <Icon name="add" size={22} color={colors.primary} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.inputCircleBtn}
            onPress={handleOpenPlanModal}
            activeOpacity={0.75}
            accessibilityLabel={t('chat.planWorkout')}>
            <Icon name="calendar-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
          <View style={styles.inputFieldColumn}>
            {selectedImageUri ? (
              <View style={styles.selectedImageContainer}>
                <Image source={{uri: selectedImageUri}} style={styles.selectedImage} />
                {isSendingImage ? (
                  <View style={styles.selectedImageSending}>
                    <ActivityIndicator color={colors.white} size="small" />
                  </View>
                ) : null}
                <TouchableOpacity
                  onPress={() => {
                    if (isSendingImage) {
                      return;
                    }
                    setSelectedImageUri(null);
                    setSelectedImageMime(null);
                  }}
                  style={styles.removeImageButton}
                  disabled={isSendingImage}
                  accessibilityLabel="Fjern billede">
                  <Icon name="close-circle" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            ) : null}
            <TextInput
              style={styles.input}
              placeholder={t('chat.writeMessage')}
              placeholderTextColor={colors.textMuted}
              value={message}
              onChangeText={setMessage}
              multiline
              maxLength={1000}
              {...(Platform.OS === 'android' ? {includeFontPadding: false} : {})}
            />
          </View>
          {(message.trim().length > 0 || selectedImageUri) && (
            <TouchableOpacity
              onPress={handleSend}
              style={[styles.sendButton, isSendingImage && styles.sendButtonDisabled]}
              activeOpacity={0.8}
              disabled={isSendingImage}
              accessibilityLabel="Send besked">
              {isSendingImage ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Icon name="send" size={20} color={colors.white} />
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      <Modal
        visible={!!lightboxUri}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setLightboxUri(null)}>
        <View style={styles.lightboxRoot}>
          <View style={[styles.lightboxTop, {paddingTop: insets.top + 8}]}>
            <TouchableOpacity
              onPress={() => setLightboxUri(null)}
              style={styles.lightboxClose}
              hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}
              accessibilityLabel="Luk">
              <Icon name="close" size={28} color={colors.white} />
            </TouchableOpacity>
          </View>
          <View style={styles.lightboxImageWrap}>
            {lightboxUri ? (
              <Image
                source={{uri: lightboxUri}}
                style={styles.lightboxImage}
                resizeMode="contain"
              />
            ) : null}
          </View>
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
  header: {
    backgroundColor: colors.backgroundCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop: 50,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginLeft: spacing.sm,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary + '30',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  headerAvatarText: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  headerName: {
    ...typography.h4,
    color: colors.text,
  },
  headerHint: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
    flexShrink: 1,
  },
  headerHintActive: {
    color: colors.success,
    fontWeight: '600',
  },
  headerLiveContext: {
    ...typography.caption,
    fontSize: 11,
    lineHeight: 14,
    color: colors.textMuted,
    marginTop: 2,
  },
  headerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerIconButton: {
    padding: 4,
  },
  chatBody: {
    flex: 1,
  },
  messagesList: {
    padding: spacing.lg,
    paddingBottom: spacing.lg,
  },
  planBannerOuter: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  planBannerGradientHost: {
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 5,
  },
  planBannerCloseBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 4,
  },
  planBannerCloseCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  planBannerMainRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingRight: 44,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    paddingLeft: spacing.lg,
    minHeight: 100,
  },
  planBannerTapCol: {
    flex: 1,
    paddingRight: spacing.md,
    justifyContent: 'center',
  },
  planBannerTapPressed: {
    opacity: 0.92,
  },
  planBannerTextBlock: {
    flexShrink: 1,
  },
  planBannerSideCol: {
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  planBannerTitle: {
    fontSize: 11,
    letterSpacing: 0.8,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  planBannerSubtitle: {
    fontSize: 15,
    color: colors.white,
    fontWeight: '700',
    marginTop: 4,
  },
  planBannerInfo: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.88)',
    marginTop: 6,
  },
  planBannerPending: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.78)',
    marginTop: 2,
  },
  planBannerJoin: {
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  planBannerJoinAnmodet: {
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  planBannerJoinText: {
    color: colors.primaryDark,
    fontWeight: '700',
  },
  planBannerJoinTextAnmodet: {
    color: colors.white,
    fontWeight: '600',
  },
  planBannerHint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.72)',
    marginTop: 6,
  },
  planBannerActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planBannerDecline: {
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  planBannerDeclineText: {
    color: colors.white,
    fontWeight: '600',
  },
  planBannerCreatorBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  planMessageCardStatusOk: {
    fontSize: 14,
    color: colors.success,
    fontWeight: '600',
    marginTop: 8,
  },
  planMessageCardStatusNo: {
    fontSize: 14,
    color: colors.textTertiary,
    fontWeight: '600',
    marginTop: 8,
  },
  planMessageStatusBubble: {
    marginBottom: 4,
  },
  dateContainer: {
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dateText: {
    ...typography.caption,
    color: colors.textMuted,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  messageContainer: {
    marginBottom: spacing.sm,
  },
  messageLeft: {
    alignItems: 'flex-start',
  },
  messageRight: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    borderRadius: radius.xl,
  },
  messageBubbleWithImage: {
    paddingTop: 8,
    paddingHorizontal: 10,
  },
  messageBubbleImageOnly: {
    padding: 4,
    paddingBottom: 6,
  },
  messageBubbleMe: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: radius.xs,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 2,
  },
  messageBubbleOther: {
    backgroundColor: colors.backgroundCard,
    borderBottomLeftRadius: radius.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: {width: 0, height: 1},
        shadowOpacity: 0.04,
        shadowRadius: 4,
      },
      android: {elevation: 1},
    }),
  },
  messageText: {
    ...typography.body,
    lineHeight: 22,
  },
  messageTextMe: {
    color: colors.white,
  },
  messageTextOther: {
    color: colors.text,
  },
  messageTextWithImage: {
    marginTop: 8,
  },
  messageImageContent: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  messageTime: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  messageTimeImageOnly: {
    marginTop: 4,
  },
  messageTimeMe: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  messageTimeOther: {
    color: colors.textMuted,
  },
  seenRow: {
    alignSelf: 'flex-end',
    marginTop: 2,
    marginRight: 2,
  },
  readReceiptRow: {
    alignSelf: 'flex-end',
    marginTop: 3,
    marginRight: 4,
    maxWidth: '88%',
  },
  readReceiptText: {
    fontSize: 11,
    lineHeight: 14,
    color: colors.textMuted,
    fontWeight: '500',
  },
  seenText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
  },
  typingBubbleWrap: {
    alignItems: 'flex-start',
    marginTop: spacing.xs,
  },
  typingBubble: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  typingInline: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  typingInlineLabel: {
    ...typography.small,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  typingInlineDot: {
    ...typography.small,
    color: colors.textSecondary,
    marginLeft: 1,
    fontWeight: '700',
  },
  inputContainer: {
    backgroundColor: colors.backgroundCard,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputLeadingCluster: {
    position: 'relative',
    marginRight: 4,
    zIndex: 4,
  },
  inputCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.backgroundCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  inputFieldColumn: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  inputIconButton: {
    marginRight: 8,
    padding: 4,
  },
  input: {
    flexGrow: 1,
    flexShrink: 1,
    fontSize: 16,
    lineHeight: 20,
    color: colors.text,
    maxHeight: 100,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
    paddingHorizontal: 4,
    margin: 0,
    minHeight: 40,
    textAlignVertical: 'center',
  },
  sendButton: {
    marginLeft: spacing.sm,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.85,
  },
  selectedImageContainer: {
    position: 'relative',
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  selectedImage: {
    width: 68,
    height: 68,
    borderRadius: 12,
    resizeMode: 'cover',
    backgroundColor: colors.surface,
  },
  selectedImageSending: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeImageButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
  },
  lightboxRoot: {
    flex: 1,
    backgroundColor: '#000',
  },
  lightboxTop: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  lightboxClose: {
    padding: 4,
  },
  lightboxImageWrap: {
    flex: 1,
    paddingHorizontal: 8,
    paddingBottom: 24,
  },
  lightboxImage: {
    flex: 1,
    width: '100%',
  },
  imagePickerBackdrop: {
    position: 'absolute',
    top: -1000,
    left: -1000,
    right: -1000,
    bottom: -1000,
    zIndex: 999,
  },
  imagePickerContainer: {
    position: 'relative',
    marginRight: 8,
    zIndex: 1001,
  },
  imagePickerOptions: {
    position: 'absolute',
    bottom: 44,
    left: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: 16,
    width: 260,
    zIndex: 1000,
    backgroundColor: 'transparent',
  },
  imagePickerCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#F2F2F7',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePickerCardPressed: {
    opacity: 0.7,
  },
  imagePickerIcon: {
    marginBottom: 8,
  },
  imagePickerLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1C1C1E',
    textAlign: 'center',
  },
  planInviteModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  planInviteModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  planInviteSheet: {
    width: '100%',
    backgroundColor: INVITE_FORM_SCREEN_TINT,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    overflow: 'hidden',
  },
  planInviteSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  planInviteClosePill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.backgroundCardLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planInviteClosePillPressed: {
    opacity: 0.75,
    transform: [{scale: 0.96}],
  },
  planInvitePickerModal: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
  },
  planInvitePickerModalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: spacing.lg,
  },
  planInvitePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  planInvitePickerHeaderBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    minWidth: 64,
  },
  planInvitePickerCancel: {
    ...typography.body,
    color: colors.textMuted,
  },
  planInvitePickerTitle: {
    ...typography.bodyBold,
    fontSize: 16,
    color: colors.text,
  },
  planInvitePickerOk: {
    ...typography.bodyBold,
    fontSize: 16,
    color: colors.primary,
    textAlign: 'right',
  },
  planInvitePicker: {
    height: 216,
  },
  planModal: {
    maxHeight: '90%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  planModalCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 20,
    width: '100%',
    padding: 20,
  },
  planModalContent: {
    paddingBottom: 20,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  modalText: {
    fontSize: 15,
    color: colors.textTertiary,
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  planCenterInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    marginBottom: 8,
  },
  planSuggestionList: {
    marginTop: 8,
    marginBottom: 12,
  },
  planSuggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.background,
    borderRadius: 10,
    marginBottom: 8,
  },
  planSuggestionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  planSuggestionSubtitle: {
    fontSize: 13,
    color: colors.textTertiary,
    marginTop: 2,
  },
  muscleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  muscleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    gap: 6,
  },
  muscleCardActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  muscleImage: {
    width: 40,
    height: 40,
  },
  muscleImageActive: {
    tintColor: '#fff',
  },
  muscleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.secondary,
  },
  muscleLabelActive: {
    color: '#fff',
  },
  timeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.background,
    borderRadius: 12,
    marginBottom: 12,
    gap: 8,
  },
  timeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  primaryButton: {
    backgroundColor: colors.secondary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  modalClose: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCloseText: {
    color: colors.secondary,
    fontSize: 16,
    fontWeight: '600',
  },
  iosTimePickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  iosTimePickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  iosTimePickerCard: {
    backgroundColor: colors.backgroundCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  iosTimePickerControl: {
    height: 200,
  },
  planModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  planInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 16,
    color: colors.text,
  },
  planNotesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  planPicker: {
    marginBottom: 16,
  },
  planModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  planModalButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  planModalCancel: {
    backgroundColor: colors.surface,
  },
  planModalConfirm: {
    backgroundColor: colors.primary,
  },
  planModalCancelText: {
    color: colors.text,
    fontWeight: '600',
  },
  planModalConfirmText: {
    color: '#fff',
    fontWeight: '600',
  },
  planDetailOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  planDetailCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 20,
    padding: 20,
    width: '100%',
  },
  planDetailTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginTop: 8,
  },
  planDetailSubtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: 12,
    textTransform: 'capitalize',
  },
  planDetailNotes: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 12,
  },
  planDetailParticipants: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 12,
    marginTop: 8,
    gap: 8,
  },
  planParticipantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planParticipantName: {
    fontSize: 15,
    color: colors.text,
  },
  planParticipantStatus: {
    fontSize: 13,
    fontWeight: '600',
  },
  planParticipantStatusJoined: {
    color: colors.successLight,
  },
  planParticipantStatusPending: {
    color: '#F97316',
  },
  detailJoinButton: {
    marginTop: 16,
    backgroundColor: colors.success,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  detailJoinButtonAnmodet: {
    backgroundColor: colors.surface,
  },
  detailJoinButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  detailJoinButtonTextAnmodet: {
    color: colors.textTertiary,
    fontWeight: '600',
  },
});

export default ChatScreen;

