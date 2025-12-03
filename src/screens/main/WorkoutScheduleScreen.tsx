import React, {useMemo, useState} from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  Modal,
  Image,
  TextInput,
  Alert,
  Platform,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import DateTimePicker, {DateTimePickerEvent} from '@react-native-community/datetimepicker';
import {useWorkoutPlanStore, WorkoutPlanEntry, WorkoutHistoryEntry} from '@/store/workoutPlanStore';
import {formatGymDisplayName, findGymById} from '@/utils/gymDisplay';
import {MuscleGroup} from '@/types/workout.types';
import danishGyms, {DanishGym} from '@/data/danishGyms';

const WEEKDAYS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];

const formatDateKey = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.toISOString();
};

const muscleLabels: Record<MuscleGroup, string> = {
  bryst: 'Bryst',
  triceps: 'Triceps',
  skulder: 'Skulder',
  ben: 'Ben',
  biceps: 'Biceps',
  mave: 'Mave',
  ryg: 'Ryg',
  hele_kroppen: 'Hele kroppen',
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

// Mock friends list for displaying names
const MOCK_FRIENDS: Array<{id: string; name: string}> = [
  {id: '1', name: 'Jeff'},
  {id: '2', name: 'Marie'},
  {id: '3', name: 'Lars'},
  {id: '4', name: 'Sofia'},
  {id: '5', name: 'Patti'},
];

const WorkoutScheduleScreen = () => {
  const plannedWorkouts = useWorkoutPlanStore(state => state.plannedWorkouts);
  const completedWorkouts = useWorkoutPlanStore(state => state.completedWorkouts);
  const addPlannedWorkout = useWorkoutPlanStore(state => state.addPlannedWorkout);

  const [currentMonth, setCurrentMonth] = useState(() => {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return start;
  });

  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  });

  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState<
    | {type: 'planned'; data: WorkoutPlanEntry}
    | {type: 'completed'; data: WorkoutHistoryEntry}
    | null
  >(null);

  // Plan workout modal state
  const [planModalVisible, setPlanModalVisible] = useState(false);
  const [planSelectedGym, setPlanSelectedGym] = useState<DanishGym | null>(null);
  const [planCenterQuery, setPlanCenterQuery] = useState('');
  const [planMuscles, setPlanMuscles] = useState<MuscleGroup[]>([]);
  const [planDateTime, setPlanDateTime] = useState(new Date());
  const [planTimePickerVisible, setPlanTimePickerVisible] = useState(false);
  const [planCalendarMonth, setPlanCalendarMonth] = useState(() => {
    const now = new Date();
    now.setDate(1);
    now.setHours(0, 0, 0, 0);
    return now;
  });

  const upcomingByDay = useMemo(() => {
    const map = new Map<string, WorkoutPlanEntry[]>();
    plannedWorkouts.forEach(plan => {
      const key = formatDateKey(plan.scheduledAt);
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(plan);
    });
    return map;
  }, [plannedWorkouts]);

  const completedByDay = useMemo(() => {
    const map = new Map<string, WorkoutHistoryEntry[]>();
    completedWorkouts.forEach(entry => {
      const key = formatDateKey(entry.completedAt);
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(entry);
    });
    return map;
  }, [completedWorkouts]);

  const calendarDays = useMemo(() => {
    const monthStart = new Date(currentMonth);
    const firstWeekday = (monthStart.getDay() + 6) % 7;
    const firstVisible = new Date(monthStart);
    firstVisible.setDate(firstVisible.getDate() - firstWeekday);
    const days = [];
    for (let i = 0; i < 42; i++) {
      const date = new Date(firstVisible);
      date.setDate(firstVisible.getDate() + i);
      const key = formatDateKey(date);
      days.push({
        date,
        isCurrentMonth: date.getMonth() === currentMonth.getMonth(),
        hasUpcoming: upcomingByDay.has(key),
        hasHistory: completedByDay.has(key),
      });
    }
    return days;
  }, [currentMonth, upcomingByDay, completedByDay]);

  const todayStart = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }, []);

  const selectedKey = formatDateKey(selectedDate);
  const selectedUpcoming = upcomingByDay.get(selectedKey) || [];
  const selectedHistory = completedByDay.get(selectedKey) || [];
  const isPastDay = selectedDate.getTime() < todayStart.getTime();
  const isFutureDay = selectedDate.getTime() > todayStart.getTime();

  const handleMonthNav = (direction: number) => {
    setCurrentMonth(prev => {
      const next = new Date(prev);
      next.setMonth(prev.getMonth() + direction);
      return next;
    });
  };

  const formatTime = (date: Date) =>
    new Date(date).toLocaleTimeString('da-DK', {hour: '2-digit', minute: '2-digit'});

  const formatDateTime = (date: Date) =>
    new Date(date).toLocaleString('da-DK', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });

  const getFriendName = (friendId: string) => {
    return MOCK_FRIENDS.find(f => f.id === friendId)?.name || `Ven ${friendId}`;
  };

  const handleWorkoutPress = (
    workout: WorkoutPlanEntry | WorkoutHistoryEntry,
    type: 'planned' | 'completed',
  ) => {
    setSelectedWorkout({type, data: workout});
    setDetailModalVisible(true);
  };

  const dayKey = (date: Date) => {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy.toISOString();
  };

  const planMarkers = useMemo(() => {
    const map = new Map<string, {hasUpcoming: boolean; hasHistory: boolean}>();
    plannedWorkouts.forEach(plan => {
      const key = dayKey(plan.scheduledAt);
      const entry = map.get(key) || {hasUpcoming: false, hasHistory: false};
      entry.hasUpcoming = true;
      map.set(key, entry);
    });
    completedWorkouts.forEach(entry => {
      const key = dayKey(entry.completedAt);
      const meta = map.get(key) || {hasUpcoming: false, hasHistory: false};
      meta.hasHistory = true;
      map.set(key, meta);
    });
    return map;
  }, [plannedWorkouts, completedWorkouts]);

  const planCalendarDays = useMemo(() => {
    const monthStart = new Date(planCalendarMonth);
    const firstWeekday = (monthStart.getDay() + 6) % 7;
    const firstVisible = new Date(monthStart);
    firstVisible.setDate(firstVisible.getDate() - firstWeekday);
    const days = [];
    for (let i = 0; i < 42; i++) {
      const current = new Date(firstVisible);
      current.setDate(firstVisible.getDate() + i);
      const key = dayKey(current);
      const markers = planMarkers.get(key);
      days.push({
        date: current,
        isCurrentMonth: current.getMonth() === planCalendarMonth.getMonth(),
        hasUpcoming: markers?.hasUpcoming || false,
        hasHistory: markers?.hasHistory || false,
      });
    }
    return days;
  }, [planCalendarMonth, planMarkers]);

  const planSuggestions = useMemo(() => {
    const query = planCenterQuery.trim().toLowerCase();
    if (!query) {
      return [];
    }
    return danishGyms
      .filter(gym => {
        const haystack = `${gym.name} ${gym.city ?? ''} ${gym.brand ?? ''} ${gym.postalCode ?? ''}`
          .toLowerCase()
          .replace(/,/g, ' ');
        return query
          .split(/\s+/)
          .every(token => haystack.includes(token));
      })
      .slice(0, 6);
  }, [planCenterQuery]);

  const formattedPlanTime = useMemo(
    () =>
      planDateTime.toLocaleTimeString('da-DK', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    [planDateTime],
  );

  const handleOpenPlanModal = () => {
    const defaultGym = planSelectedGym || danishGyms[0];
    setPlanSelectedGym(defaultGym);
    setPlanCenterQuery(defaultGym ? formatGymDisplayName(defaultGym) : '');
    setPlanMuscles(planMuscles.length > 0 ? planMuscles : [MUSCLE_GROUPS[0].key]);
    const nextHour = new Date();
    nextHour.setMinutes(0);
    nextHour.setSeconds(0);
    nextHour.setMilliseconds(0);
    nextHour.setHours(nextHour.getHours() + 1);
    setPlanDateTime(nextHour);
    const calendarMonth = new Date(nextHour);
    calendarMonth.setDate(1);
    calendarMonth.setHours(0, 0, 0, 0);
    setPlanCalendarMonth(calendarMonth);
    setPlanModalVisible(true);
  };

  const handlePlanWorkout = () => {
    const resolvedGym = planSelectedGym || findGymByQuery(planCenterQuery);
    if (!resolvedGym) {
      Alert.alert('Vælg center', 'Vælg venligst hvilket center træningen skal foregå i.');
      return;
    }
    if (planMuscles.length === 0) {
      Alert.alert('Vælg muskelgrupper', 'Vælg mindst én muskelgruppe for din planlagte træning.');
      return;
    }

    const planId = `plan_${Date.now()}`;
    addPlannedWorkout({
      id: planId,
      gym: resolvedGym,
      muscles: planMuscles,
      scheduledAt: planDateTime,
      invitedFriends: [],
      acceptedFriends: [],
    });

    setPlanModalVisible(false);
    setPlanSelectedGym(null);
    setPlanCenterQuery('');
    setPlanMuscles([]);
    Alert.alert('Træning planlagt', 'Din træning er blevet planlagt!');
  };

  const findGymByQuery = (query: string): DanishGym | null => {
    const lowerQuery = query.toLowerCase().trim();
    return (
      danishGyms.find(
        gym =>
          gym.name.toLowerCase().includes(lowerQuery) ||
          gym.address?.toLowerCase().includes(lowerQuery),
      ) || null
    );
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

  const handleCalendarNav = (direction: -1 | 1) => {
    setPlanCalendarMonth(prev => {
      const next = new Date(prev);
      next.setMonth(prev.getMonth() + direction);
      return next;
    });
  };

  const isSameDay = (a: Date, b: Date) =>
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear();

  const handleCalendarDayPress = (day: Date) => {
    const updated = new Date(planDateTime);
    updated.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
    updated.setHours(planDateTime.getHours());
    updated.setMinutes(planDateTime.getMinutes());
    updated.setSeconds(0);
    updated.setMilliseconds(0);
    setPlanDateTime(updated);
    setPlanCalendarMonth(new Date(day.getFullYear(), day.getMonth(), 1));
  };

  const openPlanTimePicker = () => {
    setPlanTimePickerVisible(true);
  };

  const handlePlanTimePickerClose = () => {
    setPlanTimePickerVisible(false);
  };

  const roundToQuarterHour = (date: Date) => {
    const rounded = new Date(date);
    const minutes = rounded.getMinutes();
    const remainder = minutes % 15;
    rounded.setMinutes(minutes - remainder + (remainder >= 8 ? 15 : 0));
    return rounded;
  };

  const handlePlanTimeChange = (event: DateTimePickerEvent, date?: Date) => {
    if (event.type === 'dismissed') {
      setPlanTimePickerVisible(false);
      return;
    }
    if (Platform.OS === 'android') {
      setPlanTimePickerVisible(false);
    }
    if (date) {
      const rounded = roundToQuarterHour(date);
      setPlanDateTime(rounded);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.calendarCard}>
        <View style={styles.calendarHeader}>
          <TouchableOpacity onPress={() => handleMonthNav(-1)} style={styles.calendarNavButton}>
            <Ionicons name="chevron-back" size={18} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.calendarHeaderText}>
            {currentMonth.toLocaleDateString('da-DK', {month: 'long', year: 'numeric'})}
          </Text>
          <View style={styles.calendarHeaderRight}>
            <TouchableOpacity onPress={handleOpenPlanModal} style={styles.addButton}>
              <Ionicons name="add" size={24} color="#fff" />
            </TouchableOpacity>
          <TouchableOpacity onPress={() => handleMonthNav(1)} style={styles.calendarNavButton}>
            <Ionicons name="chevron-forward" size={18} color="#0F172A" />
          </TouchableOpacity>
          </View>
        </View>
        <View style={styles.weekRow}>
          {WEEKDAYS.map(day => (
            <Text key={day} style={styles.weekLabel}>
              {day}
            </Text>
          ))}
        </View>
        <View style={styles.daysGrid}>
          {calendarDays.map(day => {
            const isSelected = formatDateKey(day.date) === selectedKey;
            return (
              <TouchableOpacity
                key={day.date.toISOString()}
                style={[
                  styles.dayCell,
                  !day.isCurrentMonth && styles.dayCellMuted,
                  isSelected && styles.dayCellSelected,
                ]}
                onPress={() => setSelectedDate(new Date(day.date))}>
                <Text
                  style={[
                    styles.dayNumber,
                    !day.isCurrentMonth && styles.dayNumberMuted,
                    isSelected && styles.dayNumberSelected,
                  ]}>
                  {day.date.getDate()}
                </Text>
                <View style={styles.dayMarkers}>
                  {day.hasHistory && <Text style={styles.markerFire}>🔥</Text>}
                  {day.hasUpcoming && <Text style={styles.markerStar}>⭐️</Text>}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.detailSection}>
        <Text style={styles.detailTitle}>
          {selectedDate.toLocaleDateString('da-DK', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </Text>

        {!isPastDay && (
          <View style={styles.detailGroup}>
            <Text style={styles.detailGroupTitle}>Kommende træninger</Text>
            {selectedUpcoming.length === 0 ? (
              <Text style={styles.emptyDetail}>Ingen kommende træninger denne dag.</Text>
            ) : (
              selectedUpcoming.map(plan => (
                <TouchableOpacity
                  key={plan.id}
                  style={styles.detailCard}
                  onPress={() => handleWorkoutPress(plan, 'planned')}
                  activeOpacity={0.7}>
                  <View style={styles.detailHeader}>
                    <Text style={styles.detailGym}>{formatGymDisplayName(plan.gym)}</Text>
                    <Text style={styles.detailTime}>{formatTime(plan.scheduledAt)}</Text>
                  </View>
                  <View style={styles.detailMuscles}>
                    {plan.muscles.map(muscle => (
                      <View key={`${plan.id}-${muscle}`} style={styles.muscleChip}>
                        <Text style={styles.muscleChipText}>{muscleLabels[muscle]}</Text>
                      </View>
                    ))}
                  </View>
                  {plan.invitedFriends.length > 0 && (
                    <Text style={styles.inviteStatus}>
                      {`${plan.invitedFriends.length} inviteret ven${
                        plan.invitedFriends.length > 1 ? 'ner' : ''
                      }`}
                    </Text>
                  )}
                  <View style={styles.moreInfoHint}>
                    <Text style={styles.moreInfoText}>Tryk for mere info</Text>
                    <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
                </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {!isFutureDay && (
          <View style={styles.detailGroup}>
            <Text style={styles.detailGroupTitle}>Tidligere træninger</Text>
            {selectedHistory.length === 0 ? (
              <Text style={styles.emptyDetail}>Ingen træninger registreret denne dag.</Text>
            ) : (
              selectedHistory.map(entry => (
                <TouchableOpacity
                  key={entry.id}
                  style={styles.detailCard}
                  onPress={() => handleWorkoutPress(entry, 'completed')}
                  activeOpacity={0.7}>
                  <View style={styles.detailHeader}>
                    <Text style={styles.detailGym}>{formatGymDisplayName(entry.gym)}</Text>
                    <Text style={styles.detailTime}>{`${Math.round(entry.durationMs / 60000)} min`}</Text>
                  </View>
                  <View style={styles.detailMuscles}>
                    {entry.muscles.map(muscle => (
                      <View key={`${entry.id}-${muscle}`} style={[styles.muscleChip, styles.muscleChipHistory]}>
                        <Text style={[styles.muscleChipText, styles.muscleChipHistoryText]}>
                          {muscleLabels[muscle]}
                        </Text>
                      </View>
                    ))}
                  </View>
                  {entry.acceptedFriends?.length ? (
                    <Text style={styles.inviteStatus}>
                      {`Du trænede med ${entry.acceptedFriends.length} ${
                        entry.acceptedFriends.length === 1 ? 'ven' : 'venner'
                      }`}
                    </Text>
                  ) : null}
                  <View style={styles.moreInfoHint}>
                    <Text style={styles.moreInfoText}>Tryk for mere info</Text>
                    <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
                </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}
      </View>

      {/* Workout Detail Modal */}
      <Modal
        visible={detailModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setDetailModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedWorkout?.type === 'planned' ? 'Kommende træning' : 'Tidligere træning'}
              </Text>
              <TouchableOpacity
                onPress={() => setDetailModalVisible(false)}
                style={styles.modalCloseButton}>
                <Ionicons name="close" size={24} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalBody}
              contentContainerStyle={styles.modalBodyContent}
              showsVerticalScrollIndicator={false}>
              {selectedWorkout && (
                <>
                  {/* Gym and Time/Duration */}
                  <View style={styles.modalSection}>
                    <Text style={styles.modalGymName}>
                      {formatGymDisplayName(selectedWorkout.data.gym)}
                    </Text>
                    {selectedWorkout.type === 'planned' ? (
                      <Text style={styles.modalDateTime}>
                        {formatDateTime(selectedWorkout.data.scheduledAt)}
                      </Text>
                    ) : (
                      <Text style={styles.modalDateTime}>
                        {formatDateTime(selectedWorkout.data.completedAt)} •{' '}
                        {Math.round(selectedWorkout.data.durationMs / 60000)} minutter
                      </Text>
                    )}
                  </View>

                  {/* Photo (if completed workout has one) */}
                  {selectedWorkout.type === 'completed' && selectedWorkout.data.photoUri && (
                    <View style={styles.modalPhotoSection}>
                      <Image
                        source={{uri: selectedWorkout.data.photoUri}}
                        style={styles.modalPhoto}
                        resizeMode="cover"
                      />
                    </View>
                  )}

                  {/* Muscle Groups */}
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Muskelgrupper</Text>
                    <View style={styles.modalMuscles}>
                      {selectedWorkout.data.muscles.map(muscle => (
                        <View
                          key={muscle}
                          style={[
                            styles.modalMuscleChip,
                            selectedWorkout.type === 'completed' && styles.modalMuscleChipHistory,
                          ]}>
                          <Text
                            style={[
                              styles.modalMuscleChipText,
                              selectedWorkout.type === 'completed' && styles.modalMuscleChipHistoryText,
                            ]}>
                            {muscleLabels[muscle]}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  {/* Friends Section */}
                  {selectedWorkout.type === 'planned' ? (
                    <>
                      {/* Invited Friends */}
                      {selectedWorkout.data.invitedFriends.length > 0 && (
                        <View style={styles.modalSection}>
                          <Text style={styles.modalSectionTitle}>
                            Inviterede venner ({selectedWorkout.data.invitedFriends.length})
                          </Text>
                          <View style={styles.modalFriendsList}>
                            {selectedWorkout.data.invitedFriends.map(friendId => {
                              const isAccepted = selectedWorkout.data.acceptedFriends?.includes(friendId);
                              return (
                                <View key={friendId} style={styles.modalFriendItem}>
                                  <View style={styles.modalFriendAvatar}>
                                    <Text style={styles.modalFriendAvatarText}>
                                      {getFriendName(friendId).charAt(0)}
                                    </Text>
                                  </View>
                                  <Text style={styles.modalFriendName}>{getFriendName(friendId)}</Text>
                                  {isAccepted ? (
                                    <View style={styles.modalFriendStatusAccepted}>
                                      <Ionicons name="checkmark-circle" size={16} color="#059669" />
                                      <Text style={styles.modalFriendStatusTextAccepted}>Accepteret</Text>
                                    </View>
                                  ) : (
                                    <View style={styles.modalFriendStatusPending}>
                                      <Ionicons name="time-outline" size={16} color="#F59E0B" />
                                      <Text style={styles.modalFriendStatusTextPending}>Venter</Text>
                                    </View>
                                  )}
                                </View>
                              );
                            })}
                          </View>
                        </View>
                      )}

                      {/* Accepted Friends Summary */}
                      {selectedWorkout.data.acceptedFriends &&
                        selectedWorkout.data.acceptedFriends.length > 0 && (
                          <View style={styles.modalSection}>
                            <Text style={styles.modalSectionTitle}>
                              Har accepteret ({selectedWorkout.data.acceptedFriends.length})
                            </Text>
                            <View style={styles.modalFriendsList}>
                              {selectedWorkout.data.acceptedFriends.map(friendId => (
                                <View key={friendId} style={styles.modalFriendItem}>
                                  <View style={styles.modalFriendAvatar}>
                                    <Text style={styles.modalFriendAvatarText}>
                                      {getFriendName(friendId).charAt(0)}
                                    </Text>
                                  </View>
                                  <Text style={styles.modalFriendName}>{getFriendName(friendId)}</Text>
                                  <View style={styles.modalFriendStatusAccepted}>
                                    <Ionicons name="checkmark-circle" size={16} color="#059669" />
                                    <Text style={styles.modalFriendStatusTextAccepted}>Accepteret</Text>
                                  </View>
                                </View>
                              ))}
                            </View>
                          </View>
                        )}
                    </>
                  ) : (
                    /* Completed Workout Friends */
                    <>
                      {selectedWorkout.data.acceptedFriends &&
                        selectedWorkout.data.acceptedFriends.length > 0 && (
                          <View style={styles.modalSection}>
                            <Text style={styles.modalSectionTitle}>
                              Trænede med ({selectedWorkout.data.acceptedFriends.length})
                            </Text>
                            <View style={styles.modalFriendsList}>
                              {selectedWorkout.data.acceptedFriends.map(friendId => (
                                <View key={friendId} style={styles.modalFriendItem}>
                                  <View style={styles.modalFriendAvatar}>
                                    <Text style={styles.modalFriendAvatarText}>
                                      {getFriendName(friendId).charAt(0)}
                                    </Text>
                                  </View>
                                  <Text style={styles.modalFriendName}>{getFriendName(friendId)}</Text>
                                  <View style={styles.modalFriendStatusCompleted}>
                                    <Ionicons name="fitness" size={16} color="#E11D48" />
                                    <Text style={styles.modalFriendStatusTextCompleted}>Trænede med</Text>
                                  </View>
                                </View>
                              ))}
                            </View>
                          </View>
                        )}

                      {selectedWorkout.data.invitedFriends &&
                        selectedWorkout.data.invitedFriends.length > 0 &&
                        (!selectedWorkout.data.acceptedFriends ||
                          selectedWorkout.data.invitedFriends.length >
                            selectedWorkout.data.acceptedFriends.length) && (
                          <View style={styles.modalSection}>
                            <Text style={styles.modalSectionTitle}>
                              Inviteret men deltog ikke (
                              {selectedWorkout.data.invitedFriends.length -
                                (selectedWorkout.data.acceptedFriends?.length || 0)}
                              )
                            </Text>
                            <View style={styles.modalFriendsList}>
                              {selectedWorkout.data.invitedFriends
                                .filter(
                                  friendId =>
                                    !selectedWorkout.data.acceptedFriends?.includes(friendId),
                                )
                                .map(friendId => (
                                  <View key={friendId} style={styles.modalFriendItem}>
                                    <View style={styles.modalFriendAvatar}>
                                      <Text style={styles.modalFriendAvatarText}>
                                        {getFriendName(friendId).charAt(0)}
                                      </Text>
                                    </View>
                                    <Text style={styles.modalFriendName}>{getFriendName(friendId)}</Text>
                                    <View style={styles.modalFriendStatusDeclined}>
                                      <Ionicons name="close-circle" size={16} color="#94A3B8" />
                                      <Text style={styles.modalFriendStatusTextDeclined}>Deltog ikke</Text>
                                    </View>
                                  </View>
                                ))}
                            </View>
                          </View>
                        )}
                    </>
                  )}
                </>
              )}
            </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Plan Workout Modal */}
      <Modal visible={planModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => setPlanModalVisible(false)}>
            <View style={styles.modalBackdrop} />
          </TouchableWithoutFeedback>

          <View style={[styles.modalCard, styles.planModal]}>
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
              {planCenterQuery.trim().length > 0 &&
                planSuggestions.length > 0 &&
                !planSelectedGym && (
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
                        <Ionicons name="location-outline" size={18} color="#007AFF" />
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
                      <Ionicons
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

              <Text style={[styles.sectionLabel, {marginTop: 8}]}>Dato</Text>
              <View style={styles.calendarContainer}>
                <View style={styles.calendarHeader}>
                  <TouchableOpacity
                    onPress={() => handleCalendarNav(-1)}
                    style={styles.calendarNavButton}>
                    <Ionicons name="chevron-back" size={18} color="#0F172A" />
                  </TouchableOpacity>
                  <Text style={styles.calendarHeaderText}>
                    {planCalendarMonth.toLocaleDateString('da-DK', {
                      month: 'long',
                      year: 'numeric',
                    })}
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleCalendarNav(1)}
                    style={styles.calendarNavButton}>
                    <Ionicons name="chevron-forward" size={18} color="#0F172A" />
                  </TouchableOpacity>
                </View>
                <View style={styles.calendarWeekRow}>
                  {WEEKDAYS.map(day => (
                    <Text key={day} style={styles.calendarWeekday}>
                      {day}
                    </Text>
                  ))}
                </View>
                <View style={styles.calendarGrid}>
                  {planCalendarDays.map(day => {
                    const selected = isSameDay(day.date, planDateTime);
                    return (
                      <TouchableOpacity
                        key={day.date.toISOString()}
                        style={[
                          styles.calendarDay,
                          !day.isCurrentMonth && styles.calendarDayFaded,
                          selected && styles.calendarDaySelected,
                        ]}
                        onPress={() => handleCalendarDayPress(day.date)}>
                        <Text
                          style={[
                            styles.calendarDayText,
                            !day.isCurrentMonth && styles.calendarDayTextFaded,
                            selected && styles.calendarDayTextSelected,
                          ]}>
                          {day.date.getDate()}
                        </Text>
                        <View style={styles.calendarDayMarkers}>
                          {day.hasHistory && <Text style={styles.calendarMarkerFire}>🔥</Text>}
                          {day.hasUpcoming && <Text style={styles.calendarMarkerStar}>⭐️</Text>}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <TouchableOpacity
                style={styles.timeButton}
                onPress={openPlanTimePicker}
                activeOpacity={0.85}>
                <Ionicons name="time-outline" size={18} color="#0F172A" />
                <Text style={styles.timeButtonText}>Kl. {formattedPlanTime}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.primaryButton} onPress={handlePlanWorkout}>
                <Text style={styles.primaryButtonText}>Planlæg træning</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalClose, {marginTop: 12}]}
                onPress={() => setPlanModalVisible(false)}>
                <Text style={styles.modalCloseText}>Luk</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

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
                  mode="time"
                  display="spinner"
                  minuteInterval={15}
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
      </Modal>

      {planTimePickerVisible && Platform.OS === 'android' && (
        <DateTimePicker
          value={planDateTime}
          mode="time"
          display="default"
          onChange={handlePlanTimeChange}
        />
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F6FA',
  },
  content: {
    padding: 16,
  },
  calendarCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 8},
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  calendarHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#007AFF',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  calendarNavButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarHeaderText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    textTransform: 'capitalize',
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  weekLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  dayCellMuted: {
    opacity: 0.4,
  },
  dayCellSelected: {
    backgroundColor: '#E0F2FE',
    borderRadius: 12,
  },
  dayNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  dayNumberMuted: {
    color: '#94A3B8',
  },
  dayNumberSelected: {
    color: '#0369A1',
  },
  dayMarkers: {
    flexDirection: 'row',
    marginTop: 2,
    gap: 2,
  },
  markerFire: {
    fontSize: 12,
  },
  markerStar: {
    fontSize: 12,
  },
  detailSection: {
    gap: 24,
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    textTransform: 'capitalize',
  },
  detailGroup: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 6},
  },
  detailGroupTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
  },
  emptyDetail: {
    fontSize: 14,
    color: '#94A3B8',
  },
  detailCard: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailGym: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  detailTime: {
    fontSize: 14,
    color: '#0369A1',
    fontWeight: '600',
  },
  detailMuscles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  muscleChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#ECFDF5',
  },
  muscleChipText: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
  },
  muscleChipHistory: {
    backgroundColor: '#FFF1F2',
  },
  muscleChipHistoryText: {
    color: '#E11D48',
  },
  inviteStatus: {
    fontSize: 13,
    color: '#64748B',
  },
  moreInfoHint: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  moreInfoText: {
    fontSize: 12,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '90%',
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  modalText: {
    fontSize: 16,
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: 6,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalBody: {
    flex: 1,
  },
  modalBodyContent: {
    paddingBottom: 20,
  },
  modalSection: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalGymName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  modalDateTime: {
    fontSize: 15,
    color: '#64748B',
  },
  modalPhotoSection: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalPhoto: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  modalSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
  },
  modalMuscles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modalMuscleChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#ECFDF5',
  },
  modalMuscleChipText: {
    fontSize: 13,
    color: '#059669',
    fontWeight: '600',
  },
  modalMuscleChipHistory: {
    backgroundColor: '#FFF1F2',
  },
  modalMuscleChipHistoryText: {
    color: '#E11D48',
  },
  modalFriendsList: {
    gap: 12,
  },
  modalFriendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalFriendAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalFriendAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  modalFriendName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  modalFriendStatusAccepted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  modalFriendStatusTextAccepted: {
    fontSize: 13,
    color: '#059669',
    fontWeight: '600',
  },
  modalFriendStatusPending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  modalFriendStatusTextPending: {
    fontSize: 13,
    color: '#F59E0B',
    fontWeight: '600',
  },
  modalFriendStatusCompleted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  modalFriendStatusTextCompleted: {
    fontSize: 13,
    color: '#E11D48',
    fontWeight: '600',
  },
  modalFriendStatusDeclined: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  modalFriendStatusTextDeclined: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '600',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    alignItems: 'center',
  },
  planModal: {
    alignItems: 'stretch',
    maxHeight: '85%',
  },
  planModalContent: {
    paddingBottom: 12,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475467',
    marginTop: 12,
    marginBottom: 6,
  },
  planCenterInput: {
    borderWidth: 1,
    borderColor: '#CBD5F5',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
  },
  planSuggestionList: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    marginTop: 8,
  },
  planSuggestionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
  },
  planSuggestionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  planSuggestionSubtitle: {
    fontSize: 13,
    color: '#64748B',
  },
  muscleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  muscleCard: {
    width: '46%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  muscleCardActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
    shadowColor: '#007AFF',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 6},
  },
  muscleLabel: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  muscleLabelActive: {
    color: '#fff',
  },
  calendarContainer: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 18,
    padding: 12,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  calendarHeaderText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    textTransform: 'capitalize',
  },
  calendarWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  calendarWeekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDay: {
    width: `${100 / 7}%`,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  calendarDayFaded: {
    opacity: 0.5,
  },
  calendarDaySelected: {
    backgroundColor: '#007AFF',
  },
  calendarDayText: {
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '600',
  },
  calendarDayTextFaded: {
    color: '#94A3B8',
  },
  calendarDayTextSelected: {
    color: '#fff',
  },
  calendarDayMarkers: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 2,
  },
  calendarMarkerFire: {
    fontSize: 11,
  },
  calendarMarkerStar: {
    fontSize: 11,
  },
  timeButton: {
    marginTop: 12,
    backgroundColor: '#E0F2FE',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  timeButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
    marginLeft: 8,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 16,
    marginRight: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalClose: {
    marginTop: 20,
    backgroundColor: '#E2E8F0',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '600',
  },
  iosTimePickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  iosTimePickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  iosTimePickerCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    width: '100%',
    maxWidth: 360,
    alignItems: 'stretch',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: {width: 0, height: 10},
  },
  iosTimePickerControl: {
    width: '100%',
  },
});

export default WorkoutScheduleScreen;

