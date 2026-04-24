/**
 * Chat Screen
 * Individual chat conversation with a friend
 */

import React, {useState, useRef, useEffect, useMemo, useCallback} from 'react';
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
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import {launchCamera, launchImageLibrary, CameraOptions, ImagePickerResponse} from 'react-native-image-picker';
import {format} from 'date-fns';
import {da} from 'date-fns/locale';
import DateTimePicker, {DateTimePickerEvent} from '@react-native-community/datetimepicker';
import {getActiveDanishGyms, DanishGym} from '@/data/danishGyms';

const CHAT_GYMS = getActiveDanishGyms();
import {MuscleGroup} from '@/types/workout.types';
import {formatGymDisplayName, findGymById} from '@/utils/gymDisplay';
import {supabase} from '@/services/supabase/supabaseClient';
import {
  createPlannedWorkoutInvite,
  fetchPlannedWorkoutByThread,
  respondPlannedWorkoutInvite,
  type PlannedWorkoutRow,
  type PlannedParticipantRow,
} from '@/services/supabase/plannedWorkoutService';
import {useInAppNotificationStore} from '@/store/inAppNotificationStore';
import {useFocusEffect} from '@react-navigation/native';
import {useChatStore, ChatPlan, ChatMessage} from '@/store/chatStore';
import {useAppStore} from '@/store/appStore';
import {useNotificationStore} from '@/store/notificationStore';
import {navigateToFriendProfile} from '@/navigation/rootNavigation';
import {
  isDmThreadId,
  fetchDmMessages,
  sendDmMessage,
} from '@/services/supabase/dmService';
import {uploadDmChatImage} from '@/services/supabase/dmImageUpload';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
import muscleImg from '@/utils/muscleGroupImages';

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

const MUSCLE_GROUPS: {key: MuscleGroup; label: string}[] = [
  {key: 'bryst', label: 'Bryst'},
  {key: 'triceps', label: 'Triceps'},
  {key: 'skulder', label: 'Skulder'},
  {key: 'ben', label: 'Ben'},
  {key: 'biceps', label: 'Biceps'},
  {key: 'mave', label: 'Mave'},
  {key: 'ryg', label: 'Ryg'},
  {key: 'hele_kroppen', label: 'Hele kroppen'},
  {key: 'reformer', label: 'Reformer'},
  {key: 'pilates', label: 'Pilates'},
];

/** iOS-style media sheet (Ionicons ≈ SF Symbols); icons use system dark, not brand circles */
const CHAT_MEDIA_SHEET = {
  icon: '#1C1C1E',
} as const;

const CHAT_IMAGE_MAX_H = 320;

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
  if (groups.length === 0) {
    return 'Fri træning';
  }
  return groups
    .map(group => MUSCLE_GROUPS.find(item => item.key === group)?.label || group)
    .join(', ');
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
  const getMessagesForChat = useChatStore(state => state.getMessagesForChat);
  const setActivePlanForChat = useChatStore(state => state.setActivePlanForChat);
  const updateActivePlanForChat = useChatStore(state => state.updateActivePlanForChat);
  const messages: ChatMessage[] = useChatStore(
    useCallback(state => (chatId ? state.messagesByChat[chatId] ?? [] : []), [chatId]),
  );
  const activePlan: ChatPlan | null = useChatStore(
    useCallback(state => (chatId ? state.activePlansByChat[chatId] ?? null : null), [chatId]),
  );
  const currentUserId = useAppStore(s => s.user?.id) ?? 'current_user';
  const isDm = useMemo(() => isDmThreadId(chatId), [chatId]);
  const chatParticipants =
    routeParticipants && routeParticipants.length > 0
      ? routeParticipants
      : [{id: friendId, name: friendName}];
  const participantList = [
    {id: currentUserId, name: 'Dig'},
    ...chatParticipants.filter(participant => participant.id !== currentUserId),
  ];
  const [message, setMessage] = useState('');
  const [planModalVisible, setPlanModalVisible] = useState(false);
  const [planDetailVisible, setPlanDetailVisible] = useState(false);
  const [planSelectedGym, setPlanSelectedGym] = useState<DanishGym | null>(null);
  const [planCenterQuery, setPlanCenterQuery] = useState('');
  const [planMuscles, setPlanMuscles] = useState<MuscleGroup[]>([]);
  const [planDateTime, setPlanDateTime] = useState(new Date());
  const [planTimePickerVisible, setPlanTimePickerVisible] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [selectedImageMime, setSelectedImageMime] = useState<string | null>(null);
  const [isSendingImage, setIsSendingImage] = useState(false);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [showImagePickerOptions, setShowImagePickerOptions] = useState(false);
  const [planActionBusy, setPlanActionBusy] = useState(false);
  const {width: windowWidth} = useWindowDimensions();
  const refreshInAppNotifications = useInAppNotificationStore(s => s.refresh);
  const maxDmImageWidth = useMemo(
    () => Math.min(windowWidth * 0.7, 280),
    [windowWidth],
  );
  const flatListRef = useRef<FlatList>(null);
  const initialMessageHandledRef = useRef(false);
  const insets = useSafeAreaInsets();
  const [keyboardOpen, setKeyboardOpen] = useState(false);

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
    if (!isDm || !chatId) {
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

  const planSuggestions = useMemo(() => {
    if (!planCenterQuery.trim()) return [];
    const query = planCenterQuery.toLowerCase();
    return CHAT_GYMS
      .filter(gym => 
        formatGymDisplayName(gym).toLowerCase().includes(query) ||
        gym.city?.toLowerCase().includes(query)
      )
      .slice(0, 5);
  }, [planCenterQuery]);

  const formattedPlanTime = useMemo(
    () =>
      planDateTime.toLocaleTimeString('da-DK', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    [planDateTime],
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
      initializeChatMessages,
      markChatAsRead,
      markMessageNotificationsForChatRead,
      setForegroundOpenChatId,
    ]),
  );

  useEffect(() => {
    if (!chatId || !isDm) {
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
          Alert.alert('Chat', (e as Error).message);
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
          setSelectedImageUri(null);
          setSelectedImageMime(null);
        } catch (e) {
          Alert.alert(
            'Billedet kunne ikke sendes. Prøv igen.',
            (e as Error).message,
          );
        } finally {
          setIsSendingImage(false);
        }
        return;
      }
      if (!message.trim()) {
        return;
      }
      try {
        const {message: sent} = await sendDmMessage(chatId, {
          body: message.trim(),
        });
        addMessageToChat(chatId, sent);
        updateChatLastMessage(chatId, sent, {fromCurrentUser: true});
      } catch (e) {
        Alert.alert('Kunne ikke sende', (e as Error).message);
      }
      setMessage('');
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
    setSelectedImageUri(null);
    setSelectedImageMime(null);
  };

  const handleImagePickerToggle = () => {
    setShowImagePickerOptions(prev => !prev);
  };

  const handleCameraPress = () => {
    setShowImagePickerOptions(false);
    openCamera();
  };

  const handleGalleryPress = () => {
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
        Alert.alert('Kamera fejl', response.errorMessage || 'Kunne ikke åbne kameraet.');
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
        Alert.alert('Fotos', response.errorMessage || 'Kunne ikke åbne fotos.');
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
    return format(date, 'HH:mm', {locale: da});
  };

  const formatDate = (date: Date) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')) {
      return 'I dag';
    } else if (format(date, 'yyyy-MM-dd') === format(yesterday, 'yyyy-MM-dd')) {
      return 'I går';
    } else {
      return format(date, 'dd/MM/yyyy', {locale: da});
    }
  };

  const formatPlanDateTime = (date: Date) =>
    format(date, "EEEE d. MMM 'kl.' HH:mm", {locale: da});

  const handleOpenPlanModal = () => {
    setPlanSelectedGym(null);
    setPlanCenterQuery('');
    setPlanMuscles([]);
    const nextHour = new Date();
    nextHour.setMinutes(0);
    nextHour.setSeconds(0);
    nextHour.setMilliseconds(0);
    nextHour.setHours(nextHour.getHours() + 1);
    setPlanDateTime(nextHour);
    setPlanModalVisible(true);
  };

  const handlePlanCenterInput = (value: string) => {
    setPlanCenterQuery(value);
    setPlanSelectedGym(null);
  };

  const handleSelectPlanGym = (gym: DanishGym) => {
    setPlanSelectedGym(gym);
    setPlanCenterQuery(formatGymDisplayName(gym));
  };

  const togglePlanMuscle = (group: MuscleGroup) => {
    setPlanMuscles(prev => {
      if (prev.includes(group)) {
        return prev.filter(item => item !== group);
      }
      return [...prev, group];
    });
  };

  const openPlanTimePicker = () => {
    setPlanTimePickerVisible(true);
  };

  const handlePlanTimeChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') {
      setPlanTimePickerVisible(false);
    }
    if (date) {
      setPlanDateTime(date);
    }
  };

  const handlePlanTimePickerClose = () => {
    setPlanTimePickerVisible(false);
  };

  const handleCreatePlan = () => {
    if (!planSelectedGym) {
      Alert.alert('Manglende center', 'Vælg venligst hvilket center træningen skal foregå i.');
      return;
    }
    if (planMuscles.length === 0) {
      Alert.alert('Vælg muskelgrupper', 'Vælg mindst én muskelgruppe for din planlagte træning.');
      return;
    }
    if (!chatId) {
      return;
    }

    const resetPlanModal = () => {
      setPlanModalVisible(false);
      setPlanSelectedGym(null);
      setPlanCenterQuery('');
      setPlanMuscles([]);
    };

    if (isDm && friendId) {
      setPlanActionBusy(true);
      void (async () => {
        try {
          await createPlannedWorkoutInvite({
            inviteeId: friendId,
            centerId: planSelectedGym.id,
            centerName: formatGymDisplayName(planSelectedGym),
            scheduledAt: planDateTime,
            trainingTypes: planMuscles,
            note: null,
            threadId: chatId,
          });
          const r = await fetchPlannedWorkoutByThread(chatId);
          if (r) {
            setActivePlanForChat(chatId, mapServerPlanToChatPlan(r));
          }
          if (currentUserId) {
            void refreshInAppNotifications(currentUserId);
          }
        } catch (e) {
          Alert.alert('Kunne ikke oprette', (e as Error).message);
        } finally {
          setPlanActionBusy(false);
          resetPlanModal();
        }
      })();
      return;
    }

    const newPlan: ChatPlan = {
      id: `plan_${Date.now()}`,
      gym: planSelectedGym,
      muscles: planMuscles,
      scheduledAt: planDateTime,
      createdBy: currentUserId,
      joinedIds: [currentUserId],
      invitedIds: participantList.map(participant => participant.id),
    };
    setActivePlanForChat(chatId, newPlan);
    resetPlanModal();
  };

  const isPlanCreator = activePlan?.createdBy === currentUserId;

  const handleDeclineServerPlan = () => {
    if (!chatId || !activePlan?.serverPlannedWorkoutId || isPlanCreator) {
      return;
    }
    if (activePlan.inviteeResponse !== 'pending') {
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
        Alert.alert('Kunne ikke afvise', (e as Error).message);
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
            if (currentUserId) {
              void refreshInAppNotifications(currentUserId);
            }
          } catch (e) {
            Alert.alert('Kunne ikke acceptere', (e as Error).message);
          } finally {
            setPlanActionBusy(false);
          }
        })();
        return;
      }
      setPlanDetailVisible(true);
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

  const renderMessage = ({item, index}: {item: ChatMessage; index: number}) => {
    const isMe = item.senderId === currentUserId;
    const showDate =
      index === 0 ||
      formatDate(item.timestamp) !== formatDate(messages[index - 1].timestamp);

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
                navigateToFriendProfile(navigation, {friendId, friendName});
              }
            }}
            activeOpacity={0.7}
            disabled={!friendId}
            accessibilityRole="button"
            accessibilityLabel={`Åbn profil: ${friendName}`}>
            <View style={styles.headerAvatar}>
              <Text style={styles.headerAvatarText}>
                {friendName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.headerTextWrap}>
              <Text style={styles.headerName}>{friendName}</Text>
              <Text style={styles.headerHint}>Aktiv nu</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Messages List */}
      <View style={styles.chatBody}>
        {activePlan && (
          <Pressable
            onPress={() => setPlanDetailVisible(true)}
            onLongPress={() => {
              if (activePlan.serverPlannedWorkoutId) {
                navigation.navigate('WorkoutSchedule', {
                  openPlannedId: activePlan.serverPlannedWorkoutId,
                });
              } else {
                navigation.navigate('WorkoutSchedule', {initialTab: 'upcoming'});
              }
            }}
            style={({pressed}) => [styles.planBanner, pressed && {opacity: 0.92}]}>
            {(() => {
              const joinedNames = planParticipants
                .filter(participant => participant.hasJoined)
                .map(participant => participant.name);
              const pendingNames = planParticipants
                .filter(participant => !participant.hasJoined)
                .map(participant => participant.name);
              const useServer = !!activePlan.serverPlannedWorkoutId;
              const isCreator = activePlan.createdBy === currentUserId;
              const serverStatusLine = useServer
                ? isCreator
                  ? activePlan.inviteeResponse === 'pending'
                    ? `Afventer svar · ${friendName}`
                    : activePlan.inviteeResponse === 'accepted'
                      ? 'Træner sammen – accepteret'
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
                  : 'Ingen har joinet endnu';
              const pendingText = useServer
                ? null
                : pendingNames.length > 0
                  ? `Venter: ${pendingNames.join(', ')}`
                  : '';
              return (
                <>
                  <View style={{flex: 1}}>
                    <Text style={styles.planBannerTitle}>Planlagt træning</Text>
                    <Text style={styles.planBannerSubtitle}>
                      {formatGymDisplayName(activePlan.gym)} • {formatPlanDateTime(activePlan.scheduledAt)}
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
                  {useServer && !isCreator && activePlan.inviteeResponse === 'pending' ? (
                    <View style={styles.planBannerActionRow}>
                      <TouchableOpacity
                        style={styles.planBannerDecline}
                        onPress={e => {
                          e.stopPropagation();
                          handleDeclineServerPlan();
                        }}
                        disabled={planActionBusy}
                        activeOpacity={0.9}>
                        <Text style={styles.planBannerDeclineText}>Afvis</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.planBannerJoin}
                        onPress={e => {
                          e.stopPropagation();
                          handleJoinPlan();
                        }}
                        disabled={planActionBusy}
                        activeOpacity={0.9}>
                        {planActionBusy ? (
                          <ActivityIndicator color={colors.successLight} size="small" />
                        ) : (
                          <Text style={styles.planBannerJoinText}>Accepter</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  ) : useServer && isCreator ? (
                    <View style={styles.planBannerCreatorBadge}>
                      <Text style={styles.planBannerJoinTextAnmodet}>Inviteret</Text>
                    </View>
                  ) : !useServer ? (
                    <TouchableOpacity
                      style={[
                        styles.planBannerJoin,
                        activePlan.joinedIds.includes(currentUserId) && styles.planBannerJoinAnmodet,
                      ]}
                      onPress={event => {
                        event.stopPropagation();
                        handleJoinPlan();
                      }}
                      activeOpacity={0.9}>
                      <Text
                        style={[
                          styles.planBannerJoinText,
                          activePlan.joinedIds.includes(currentUserId) && styles.planBannerJoinTextAnmodet,
                        ]}>
                        {activePlan.joinedIds.includes(currentUserId) ? 'Anmodet' : 'Deltag'}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.planBannerJoin, styles.planBannerJoinAnmodet]}
                      onPress={e => {
                        e.stopPropagation();
                        setPlanDetailVisible(true);
                      }}
                      activeOpacity={0.9}>
                      <Text style={styles.planBannerJoinTextAnmodet}>Detaljer</Text>
                    </TouchableOpacity>
                  )}
                </>
              );
            })()}
          </Pressable>
        )}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messagesList}
          inverted={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({animated: true})}
        />
      </View>

      {/* Plan Modal */}
      <Modal visible={planModalVisible} transparent animationType="slide">
        <View style={styles.planModalOverlay}>
          <View style={[styles.planModalCard, styles.planModal]}>
            <ScrollView
              style={{width: '100%'}}
              contentContainerStyle={styles.planModalContent}
              keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>Planlæg træning</Text>
              <Text style={styles.modalText}>
                Vælg center, muskelgrupper og tidspunkt for din næste session.
              </Text>

              <Text style={styles.sectionLabel}>Center</Text>
              <TextInput
                style={styles.planCenterInput}
                placeholder="Fx PureGym Vanløse Torv"
                value={planCenterQuery}
                onChangeText={handlePlanCenterInput}
                autoCapitalize="words"
                autoCorrect={false}
              />
              {planCenterQuery.trim().length > 0 && planSuggestions.length > 0 && !planSelectedGym && (
                <View style={styles.planSuggestionList}>
                  {planSuggestions.map(option => (
                    <TouchableOpacity
                      key={option.id}
                      style={styles.planSuggestionItem}
                      onPress={() => handleSelectPlanGym(option)}>
                      <View>
                        <Text style={styles.planSuggestionTitle}>
                          {formatGymDisplayName(option)}
                        </Text>
                        <Text style={styles.planSuggestionSubtitle}>
                          {[option.city, option.region].filter(Boolean).join(' • ')}
                        </Text>
                      </View>
                      <Icon name="location-outline" size={18} color={colors.primary} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={[styles.sectionLabel, {marginTop: 20}]}>Muskelgrupper</Text>
              <View style={styles.muscleGrid}>
                {MUSCLE_GROUPS.map(item => {
                  const isActive = planMuscles.includes(item.key);
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[styles.muscleCard, isActive && styles.muscleCardActive]}
                      onPress={() => togglePlanMuscle(item.key)}
                      activeOpacity={0.85}>
                      <Image
                        source={muscleImg.getMuscleGroupImage(item.key)}
                        style={[styles.muscleImage, isActive && styles.muscleImageActive]}
                        resizeMode="contain"
                      />
                      <Text style={[styles.muscleLabel, isActive && styles.muscleLabelActive]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.sectionLabel, {marginTop: 8}]}>Dato og tid</Text>
              <TouchableOpacity
                style={styles.timeButton}
                onPress={openPlanTimePicker}
                activeOpacity={0.85}>
                <Icon name="time-outline" size={18} color={colors.text} />
                <Text style={styles.timeButtonText}>
                  {planDateTime.toLocaleDateString('da-DK', {
                    day: 'numeric',
                    month: 'short',
                  })}{' '}
                  kl. {formattedPlanTime}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.primaryButton} onPress={handleCreatePlan}>
                <Text style={styles.primaryButtonText}>Planlæg træning</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalClose, {marginTop: 12}]}
                onPress={() => setPlanModalVisible(false)}>
                <Text style={styles.modalCloseText}>Luk</Text>
              </TouchableOpacity>
            </ScrollView>
            {Platform.OS === 'ios' && planTimePickerVisible && (
          <View style={styles.iosTimePickerOverlay} pointerEvents="box-none">
            <TouchableOpacity
              style={styles.iosTimePickerBackdrop}
              activeOpacity={1}
              onPress={handlePlanTimePickerClose}
            />
            <View style={styles.iosTimePickerCard}>
              <DateTimePicker
                value={planDateTime}
                mode="datetime"
                display="spinner"
                minuteInterval={15}
                preferredDatePickerStyle="wheels"
                locale="da-DK"
                onChange={handlePlanTimeChange}
                style={styles.iosTimePickerControl}
              />
              <TouchableOpacity style={styles.modalClose} onPress={handlePlanTimePickerClose}>
                <Text style={styles.modalCloseText}>Færdig</Text>
              </TouchableOpacity>
                </View>
              </View>
            )}
            </View>
          </View>
        </Modal>

      {planTimePickerVisible && Platform.OS === 'android' && (
        <DateTimePicker
          value={planDateTime}
          mode="datetime"
          display="default"
          onChange={handlePlanTimeChange}
        />
      )}

      {/* Plan Detail Modal */}
      <Modal visible={planDetailVisible && !!activePlan} transparent animationType="fade">
        <View style={styles.planDetailOverlay}>
          <View style={styles.planDetailCard}>
            <Text style={styles.planModalTitle}>Træningsplan</Text>
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
          <View style={styles.imagePickerContainer}>
            {showImagePickerOptions && (
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
            )}
          <TouchableOpacity
            style={styles.inputIconButton}
              onPress={handleImagePickerToggle}
            activeOpacity={0.7}>
            <Icon name="add-circle-outline" size={26} color={colors.primary} />
          </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.inputIconButton}
            onPress={handleOpenPlanModal}
            activeOpacity={0.7}>
            <Icon name="calendar-outline" size={26} color={colors.primary} />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder="Skriv en besked..."
            placeholderTextColor={colors.textMuted}
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={1000}
          />
          {selectedImageUri && (
            <View style={styles.selectedImageContainer}>
              <Image source={{uri: selectedImageUri}} style={styles.selectedImage} />
              {isSendingImage && (
                <View style={styles.selectedImageSending}>
                  <ActivityIndicator color={colors.white} size="small" />
                </View>
              )}
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
          )}
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
    color: colors.success,
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
  planBanner: {
    backgroundColor: colors.success,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  planBannerTitle: {
    fontSize: 14,
    color: '#DCFCE7',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  planBannerSubtitle: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '700',
  },
  planBannerInfo: {
    fontSize: 13,
    color: '#DCFCE7',
    marginTop: 4,
  },
  planBannerPending: {
    fontSize: 12,
    color: '#BBF7D0',
  },
  planBannerJoin: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  planBannerJoinAnmodet: {
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  planBannerJoinText: {
    color: colors.successLight,
    fontWeight: '700',
  },
  planBannerJoinTextAnmodet: {
    color: colors.textTertiary,
    fontWeight: '600',
  },
  planBannerHint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 4,
  },
  planBannerActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planBannerDecline: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  planBannerDeclineText: {
    color: '#fff',
    fontWeight: '600',
  },
  planBannerCreatorBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
    maxWidth: '78%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 18,
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
    borderBottomRightRadius: radius.sm,
  },
  messageBubbleOther: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
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
  inputContainer: {
    backgroundColor: colors.backgroundCard,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputIconButton: {
    marginRight: 8,
    padding: 4,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    maxHeight: 100,
    padding: 0,
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
    marginRight: 8,
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
    bottom: 50,
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
  planModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
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

