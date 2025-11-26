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
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Alert,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {format} from 'date-fns';
import {da} from 'date-fns/locale';
import DateTimePicker, {DateTimePickerEvent} from '@react-native-community/datetimepicker';
import danishGyms, {DanishGym} from '@/data/danishGyms';
import {MuscleGroup} from '@/types/workout.types';
import {formatGymDisplayName} from '@/utils/gymDisplay';
import {useChatStore, ChatPlan, ChatMessage} from '@/store/chatStore';

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

const MUSCLE_GROUPS: {key: MuscleGroup; label: string; icon: string}[] = [
  {key: 'bryst', label: 'Bryst', icon: 'body-outline'},
  {key: 'triceps', label: 'Triceps', icon: 'pulse-outline'},
  {key: 'skulder', label: 'Skulder', icon: 'accessibility-outline'},
  {key: 'ben', label: 'Ben', icon: 'walk-outline'},
  {key: 'biceps', label: 'Biceps', icon: 'barbell-outline'},
  {key: 'mave', label: 'Mave', icon: 'fitness-outline'},
  {key: 'ryg', label: 'Ryg', icon: 'body-outline'},
  {key: 'hele_kroppen', label: 'Hele kroppen', icon: 'body'},
];

const formatMuscleSelection = (groups: MuscleGroup[]) => {
  if (groups.length === 0) {
    return 'Fri træning';
  }
  return groups
    .map(group => MUSCLE_GROUPS.find(item => item.key === group)?.label || group)
    .join(', ');
};

const ChatScreen = ({route, navigation}: ChatScreenProps) => {
  const {chatId, friendId, friendName, initialMessage, participants: routeParticipants} = route.params;
  const updateChatLastMessage = useChatStore(state => state.updateChatLastMessage);
  const initializeChatMessages = useChatStore(state => state.initializeChatMessages);
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
  const currentUserId = 'current_user'; // In a real app, this would come from auth
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
  const flatListRef = useRef<FlatList>(null);
  const initialMessageHandledRef = useRef(false);

  const planSuggestions = useMemo(() => {
    if (!planCenterQuery.trim()) return [];
    const query = planCenterQuery.toLowerCase();
    return danishGyms
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

  // Mock initial messages - in a real app, this would come from API
  useEffect(() => {
    if (!chatId) {
      return;
    }
    const baseMessages: Message[] = [
      {
        id: `${chatId}_welcome`,
        text: 'Hej! Hvordan går det?',
        senderId: friendId,
        timestamp: new Date(Date.now() - 3600000),
        isRead: true,
      },
    ];
    initializeChatMessages(chatId, baseMessages);
  }, [chatId, friendId, initializeChatMessages]);

  useEffect(() => {
    if (!chatId || !initialMessage || initialMessageHandledRef.current) {
      return;
    }
    const newMessage: Message = {
      id: Date.now().toString(),
      text: initialMessage,
      senderId: currentUserId,
      timestamp: new Date(),
      isRead: false,
    };
    addMessageToChat(chatId, newMessage);
    initialMessageHandledRef.current = true;
  }, [addMessageToChat, chatId, currentUserId, initialMessage]);

  useEffect(() => {
    // Scroll to bottom when messages change
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({animated: true});
    }, 100);
  }, [messages]);

  const handleSend = () => {
    if (!message.trim()) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      text: message.trim(),
      senderId: currentUserId,
      timestamp: new Date(),
      isRead: false,
    };

    if (chatId) {
      addMessageToChat(chatId, newMessage);
      updateChatLastMessage(chatId, newMessage);
    }
    setMessage('');
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
    setPlanModalVisible(false);
    setPlanSelectedGym(null);
    setPlanCenterQuery('');
    setPlanMuscles([]);
  };

  const handleJoinPlan = () => {
    if (!chatId) {
      return;
    }
    updateActivePlanForChat(chatId, prev => {
      if (!prev || prev.joinedIds.includes(currentUserId)) {
        return prev;
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
            ]}>
            <Text
              style={[
                styles.messageText,
                isMe ? styles.messageTextMe : styles.messageTextOther,
              ]}>
              {item.text}
            </Text>
            <Text
              style={[
                styles.messageTime,
                isMe ? styles.messageTimeMe : styles.messageTimeOther,
              ]}>
              {formatTime(item.timestamp)}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}>
            <Icon name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <View style={styles.headerAvatar}>
              <Text style={styles.headerAvatarText}>
                {friendName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.headerName}>{friendName}</Text>
          </View>
          <TouchableOpacity style={styles.moreButton}>
            <Icon name="ellipsis-vertical" size={24} color="#000" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Messages List */}
      <View style={styles.chatBody}>
        {activePlan && (
          <TouchableOpacity
            style={styles.planBanner}
            onPress={() => setPlanDetailVisible(true)}
            activeOpacity={0.85}>
            {(() => {
              const joinedNames = planParticipants
                .filter(participant => participant.hasJoined)
                .map(participant => participant.name);
              const pendingNames = planParticipants
                .filter(participant => !participant.hasJoined)
                .map(participant => participant.name);
              const infoText =
                joinedNames.length > 0
                  ? `${joinedNames.join(', ')} har joinet`
                  : 'Ingen har joinet endnu';
              const pendingText =
                pendingNames.length > 0 ? `Venter: ${pendingNames.join(', ')}` : '';
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
                  </View>
                  {!activePlan.joinedIds.includes(currentUserId) && (
                    <TouchableOpacity
                      style={styles.planBannerJoin}
                      onPress={event => {
                        event.stopPropagation();
                        handleJoinPlan();
                      }}
                      activeOpacity={0.9}>
                      <Text style={styles.planBannerJoinText}>Join</Text>
                    </TouchableOpacity>
                  )}
                </>
              );
            })()}
          </TouchableOpacity>
        )}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messagesList}
          inverted={false}
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
                      <Icon name="location-outline" size={18} color="#007AFF" />
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
                      <Icon
                        name={item.icon as any}
                        size={20}
                        color={isActive ? '#fff' : '#007AFF'}
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
                <Icon name="time-outline" size={18} color="#0F172A" />
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
                {!activePlan.joinedIds.includes(currentUserId) && (
                  <TouchableOpacity
                    style={styles.detailJoinButton}
                    onPress={() => {
                      handleJoinPlan();
                      setPlanDetailVisible(false);
                    }}>
                    <Text style={styles.detailJoinButtonText}>Join</Text>
                  </TouchableOpacity>
                )}
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

      {/* Input Bar */}
      <View style={styles.inputContainer}>
        <View style={styles.inputWrapper}>
          <TouchableOpacity
            style={styles.inputIconButton}
            onPress={() => Alert.alert('Snart klar', 'Flere funktioner tilføjes her.')}
            activeOpacity={0.7}>
            <Icon name="add-circle-outline" size={28} color="#007AFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.inputIconButton}
            onPress={handleOpenPlanModal}
            activeOpacity={0.7}>
            <Icon name="calendar-outline" size={28} color="#007AFF" />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder="Besked..."
            placeholderTextColor="#8E8E93"
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={1000}
          />
          {message.trim().length > 0 && (
            <TouchableOpacity
              onPress={handleSend}
              style={styles.sendButton}
              activeOpacity={0.7}>
              <Icon name="send" size={24} color="#007AFF" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFF4',
    paddingTop: 50, // Space for status bar
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 4,
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginLeft: 8,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerAvatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
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
    padding: 16,
    paddingBottom: 8,
  },
  planBanner: {
    backgroundColor: '#16A34A',
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
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  planBannerJoinText: {
    color: '#16A34A',
    fontWeight: '700',
  },
  dateContainer: {
    alignItems: 'center',
    marginVertical: 16,
  },
  dateText: {
    fontSize: 12,
    color: '#8E8E93',
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  messageContainer: {
    marginBottom: 8,
  },
  messageLeft: {
    alignItems: 'flex-start',
  },
  messageRight: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
  },
  messageBubbleMe: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  messageBubbleOther: {
    backgroundColor: '#E5E5EA',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  messageTextMe: {
    color: '#fff',
  },
  messageTextOther: {
    color: '#000',
  },
  messageTime: {
    fontSize: 11,
    marginTop: 4,
  },
  messageTimeMe: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  messageTimeOther: {
    color: '#8E8E93',
  },
  inputContainer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#EFEFF4',
    paddingHorizontal: 16,
    paddingVertical: 8,
    paddingBottom: Platform.OS === 'ios' ? 20 : 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#F8F9FA',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
  },
  inputIconButton: {
    marginRight: 8,
    padding: 4,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#000',
    maxHeight: 100,
    padding: 0,
  },
  sendButton: {
    marginLeft: 8,
    padding: 4,
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
    backgroundColor: '#fff',
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
    color: '#0F172A',
    marginBottom: 8,
  },
  modalText: {
    fontSize: 15,
    color: '#64748B',
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  planCenterInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0F172A',
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
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    marginBottom: 8,
  },
  planSuggestionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  planSuggestionSubtitle: {
    fontSize: 13,
    color: '#64748B',
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
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  muscleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  muscleLabelActive: {
    color: '#fff',
  },
  timeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    marginBottom: 12,
    gap: 8,
  },
  timeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  primaryButton: {
    backgroundColor: '#007AFF',
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
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  iosTimePickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  iosTimePickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  iosTimePickerCard: {
    backgroundColor: '#fff',
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
    color: '#0F172A',
    marginBottom: 16,
  },
  planInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 16,
    color: '#0F172A',
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
    backgroundColor: '#F1F5F9',
  },
  planModalConfirm: {
    backgroundColor: '#0F172A',
  },
  planModalCancelText: {
    color: '#0F172A',
    fontWeight: '600',
  },
  planModalConfirmText: {
    color: '#fff',
    fontWeight: '600',
  },
  planDetailOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  planDetailCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    width: '100%',
  },
  planDetailTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 8,
  },
  planDetailSubtitle: {
    fontSize: 15,
    color: '#475569',
    marginBottom: 12,
    textTransform: 'capitalize',
  },
  planDetailNotes: {
    fontSize: 14,
    color: '#0F172A',
    marginBottom: 12,
  },
  planDetailParticipants: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    color: '#0F172A',
  },
  planParticipantStatus: {
    fontSize: 13,
    fontWeight: '600',
  },
  planParticipantStatusJoined: {
    color: '#16A34A',
  },
  planParticipantStatusPending: {
    color: '#F97316',
  },
  detailJoinButton: {
    marginTop: 16,
    backgroundColor: '#16A34A',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  detailJoinButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});

export default ChatScreen;

