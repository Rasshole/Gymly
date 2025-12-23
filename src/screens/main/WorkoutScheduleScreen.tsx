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
import {colors} from '@/theme/colors';
import NotificationService from '@/services/notifications/NotificationService';
import {useAppStore} from '@/store/appStore';
import {getMuscleGroupImage} from '@/utils/muscleGroupImages';

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

const MUSCLE_GROUPS: {key: MuscleGroup; label: string}[] = [
  {key: 'bryst', label: 'Bryst'},
  {key: 'triceps', label: 'Triceps'},
  {key: 'skulder', label: 'Skulder'},
  {key: 'ben', label: 'Ben'},
  {key: 'biceps', label: 'Biceps'},
  {key: 'mave', label: 'Mave'},
  {key: 'ryg', label: 'Ryg'},
  {key: 'hele_kroppen', label: 'Hele kroppen'},
];

// Mock friends list for displaying names
const MOCK_FRIENDS: Array<{id: string; name: string}> = [
  {id: '1', name: 'Jeff'},
  {id: '2', name: 'Marie'},
  {id: '3', name: 'Lars'},
  {id: '4', name: 'Sofia'},
  {id: '5', name: 'Patti'},
];

// Friends list for inviting
const FRIENDS: Array<{id: string; name: string; initials: string}> = [
  {id: '1', name: 'Jeff', initials: 'J'},
  {id: '2', name: 'Marie', initials: 'M'},
  {id: '3', name: 'Lars', initials: 'L'},
  {id: '4', name: 'Sofia', initials: 'S'},
  {id: '5', name: 'Patti', initials: 'P'},
];

const WorkoutScheduleScreen = () => {
  const {user} = useAppStore();
  // Brug brugerens valgte biceps; hvis ingen er valgt, brug samme hvide standard som i Profil (💪🏻)
  const rawBicepsEmoji = user?.bicepsEmoji || '💪🏻';
  // Fjern evt. ekstra symboler som hjerter, men bevar hudtone på selve biceps-emoji'en
  const userBicepsEmoji = rawBicepsEmoji.replace(/💛|❤️|♥️/g, '');
  const plannedWorkouts = useWorkoutPlanStore(state => state.plannedWorkouts);
  const completedWorkouts = useWorkoutPlanStore(state => state.completedWorkouts);
  const addPlannedWorkout = useWorkoutPlanStore(state => state.addPlannedWorkout);
  const addPlanInvites = useWorkoutPlanStore(state => state.addPlanInvites);
  const removePlanInvites = useWorkoutPlanStore(state => state.removePlanInvites);

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

  // Invite friends modal state
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [inviteSearchQuery, setInviteSearchQuery] = useState('');
  
  // Plan invite friends state
  const [planInvitedFriends, setPlanInvitedFriends] = useState<string[]>([]);
  const [planInviteSectionVisible, setPlanInviteSectionVisible] = useState(false);
  const [planInviteSearchQuery, setPlanInviteSearchQuery] = useState('');

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
      invitedFriends: planInvitedFriends,
      acceptedFriends: [],
    });

    // Send notifications to invited friends
    if (planInvitedFriends.length > 0) {
      const musclesDescription = formatMuscleSelection(planMuscles);
      NotificationService.sendWorkoutInvite(
        user?.displayName || user?.username || 'Nogen',
        resolvedGym,
        musclesDescription,
        planInvitedFriends,
        planId,
        planDateTime,
        planMuscles,
      );
    }

    setPlanModalVisible(false);
    setPlanSelectedGym(null);
    setPlanCenterQuery('');
    setPlanMuscles([]);
    setPlanInvitedFriends([]);
    setPlanInviteSectionVisible(false);
    setPlanInviteSearchQuery('');
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

  const formatMuscleSelection = (muscles: MuscleGroup[]): string => {
    if (muscles.length === 0) return '';
    if (muscles.length === 1) return muscleLabels[muscles[0]];
    if (muscles.length === 2) return `${muscleLabels[muscles[0]]} & ${muscleLabels[muscles[1]]}`;
    return `${muscleLabels[muscles[0]]} + ${muscles.length - 1} flere`;
  };

  const getCurrentInvitedIds = () => {
    if (!selectedWorkout || selectedWorkout.type !== 'planned') {
      return [];
    }
    return selectedWorkout.data.invitedFriends || [];
  };

  const handleInviteFriends = () => {
    if (!selectedWorkout || selectedWorkout.type !== 'planned') {
      Alert.alert('Fejl', 'Ingen planlagt træning valgt');
      return;
    }
    // Close detail modal first, then open invite modal
    setDetailModalVisible(false);
    // Small delay to ensure detail modal closes first
    setTimeout(() => {
      setInviteModalVisible(true);
    }, 100);
  };

  const inviteFriendsByIds = (friendIds: string[]) => {
    if (friendIds.length === 0 || !selectedWorkout || selectedWorkout.type !== 'planned') {
      return;
    }

    const plan = selectedWorkout.data;
    
    // Send notifications
    NotificationService.sendWorkoutInvite(
      user?.displayName || 'Din ven',
      plan.gym,
      formatMuscleSelection(plan.muscles),
      friendIds,
      plan.id,
      plan.scheduledAt,
      plan.muscles,
    );

    // Add to invited friends
    addPlanInvites(plan.id, friendIds);

    // Update selected workout
    setSelectedWorkout({
      type: 'planned',
      data: {
        ...plan,
        invitedFriends: [
          ...plan.invitedFriends,
          ...friendIds.filter(id => !plan.invitedFriends.includes(id)),
        ],
      },
    });
  };

  const uninviteFriendsByIds = (friendIds: string[]) => {
    if (friendIds.length === 0 || !selectedWorkout || selectedWorkout.type !== 'planned') {
      return;
    }

    const plan = selectedWorkout.data;
    
    // Remove from invited friends
    removePlanInvites(plan.id, friendIds);

    // Update selected workout
    setSelectedWorkout({
      type: 'planned',
      data: {
        ...plan,
        invitedFriends: plan.invitedFriends.filter(id => !friendIds.includes(id)),
      },
    });
  };

  const handleInviteFriendPress = (friendId: string) => {
    const alreadyInvited = getCurrentInvitedIds();
    if (alreadyInvited.includes(friendId)) {
      // Remove invitation
      uninviteFriendsByIds([friendId]);
    } else {
      // Add invitation
      inviteFriendsByIds([friendId]);
    }
  };

  const handleInviteAll = () => {
    const currentInvited = getCurrentInvitedIds();
    const notInvited = filteredInviteFriends.filter(friend => !currentInvited.includes(friend.id));
    if (notInvited.length === 0) {
      return;
    }
    inviteFriendsByIds(notInvited.map(f => f.id));
  };

  const handleInviteModalDone = () => {
    setInviteModalVisible(false);
    setInviteSearchQuery('');
  };

  // Filter friends based on search query
  const filteredInviteFriends = useMemo(() => {
    if (!inviteSearchQuery.trim()) {
      return FRIENDS;
    }
    const query = inviteSearchQuery.trim().toLowerCase();
    return FRIENDS.filter(friend =>
      friend.name.toLowerCase().includes(query),
    );
  }, [inviteSearchQuery]);

  // Filter friends for plan invite popup
  const filteredPlanInviteFriends = useMemo(() => {
    if (!planInviteSearchQuery.trim()) {
      return FRIENDS;
    }
    const query = planInviteSearchQuery.trim().toLowerCase();
    return FRIENDS.filter(friend =>
      friend.name.toLowerCase().includes(query),
    );
  }, [planInviteSearchQuery]);

  const currentInvitedIds = inviteModalVisible ? getCurrentInvitedIds() : [];
  const remainingInviteCount = inviteModalVisible
    ? filteredInviteFriends.filter(friend => !currentInvitedIds.includes(friend.id)).length
    : 0;

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
    <>
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
                  {day.hasHistory && (
                    <Text style={styles.markerFire}>{userBicepsEmoji}</Text>
                  )}
                  {day.hasUpcoming && <Text style={styles.markerStar}>💪</Text>}
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
                      <View style={styles.modalSection}>
                        <View style={styles.modalSectionHeader}>
                          <Text style={styles.modalSectionTitle}>
                            Inviterede venner ({selectedWorkout.data.invitedFriends.length})
                          </Text>
                          <TouchableOpacity
                            style={styles.inviteAddButton}
                            onPress={handleInviteFriends}
                            activeOpacity={0.7}>
                            <Ionicons name="add-circle" size={24} color={colors.primary} />
                          </TouchableOpacity>
                        </View>
                        {selectedWorkout.data.invitedFriends.length > 0 ? (
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
                                      <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                                      <Text style={styles.modalFriendStatusTextAccepted}>Accepteret</Text>
                                    </View>
                                  ) : (
                                    <View style={styles.modalFriendStatusPending}>
                                      <Ionicons name="time-outline" size={16} color={colors.warning} />
                                      <Text style={styles.modalFriendStatusTextPending}>Venter</Text>
                                    </View>
                                  )}
                                </View>
                              );
                            })}
                          </View>
                        ) : (
                          <Text style={styles.emptyInvitesText}>
                            Ingen venner inviteret endnu. Tryk på + for at invitere.
                          </Text>
                        )}
                      </View>

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
                                    <Ionicons name="checkmark-circle" size={16} color={colors.success} />
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
                                    <Ionicons name="fitness" size={16} color={colors.error} />
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
                      <Image
                        source={getMuscleGroupImage(item.key)}
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

              {/* Inviter venner knap */}
              <TouchableOpacity
                style={styles.planInviteButton}
                onPress={() => {
                  const resolvedGym = planSelectedGym || findGymByQuery(planCenterQuery);
                  if (!resolvedGym) {
                    Alert.alert('Vælg center', 'Vælg venligst hvilket center træningen skal foregå i først.');
                    return;
                  }
                  if (planMuscles.length === 0) {
                    Alert.alert('Vælg muskelgrupper', 'Vælg mindst én muskelgruppe først.');
                    return;
                  }
                  setPlanInviteSectionVisible(!planInviteSectionVisible);
                }}
                activeOpacity={0.85}>
                <Ionicons 
                  name={planInviteSectionVisible ? "chevron-up" : "people-outline"} 
                  size={18} 
                  color={colors.secondary} 
                />
                <Text style={styles.planInviteButtonText}>
                  Inviter venner{planInvitedFriends.length > 0 ? ` (${planInvitedFriends.length})` : ''}
                </Text>
              </TouchableOpacity>

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
                          {day.hasHistory && (
                            <Text style={styles.calendarMarkerFire}>{userBicepsEmoji}</Text>
                          )}
                          {day.hasUpcoming && (
                            <Text style={styles.calendarMarkerStar}>💪</Text>
                          )}
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
                onPress={() => {
                  setPlanModalVisible(false);
                  setPlanInvitedFriends([]);
                  setPlanInviteSectionVisible(false);
                  setPlanInviteSearchQuery('');
                }}>
                <Text style={styles.modalCloseText}>Luk</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* Inviter venner popup - vises inde i plan modal */}
          {planInviteSectionVisible && (
            <TouchableWithoutFeedback
              onPress={() => {
                setPlanInviteSectionVisible(false);
                setPlanInviteSearchQuery('');
              }}>
              <View style={styles.planInvitePopup}>
                <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                  <View style={styles.planInvitePopupContent}>
                    {/* Header */}
                    <View style={styles.planInvitePopupHeader}>
                      <Text style={styles.planInvitePopupTitle}>Inviter venner og grupper</Text>
                      <TouchableOpacity
                        onPress={() => {
                          setPlanInviteSectionVisible(false);
                          setPlanInviteSearchQuery('');
                        }}
                        style={styles.planInvitePopupClose}>
                        <Ionicons name="close" size={24} color={colors.text} />
                      </TouchableOpacity>
                    </View>

                    {/* Search Bar */}
                    <View style={styles.planInviteSearchContainer}>
                      <Ionicons name="search" size={20} color={colors.textTertiary} style={styles.planInviteSearchIcon} />
                      <TextInput
                        style={styles.planInviteSearchInput}
                        placeholder="Søg efter venner eller grupper..."
                        placeholderTextColor={colors.textTertiary}
                        value={planInviteSearchQuery}
                        onChangeText={setPlanInviteSearchQuery}
                        autoFocus={true}
                      />
                      {planInviteSearchQuery.length > 0 && (
                        <TouchableOpacity
                          onPress={() => setPlanInviteSearchQuery('')}
                          style={styles.planInviteSearchClear}>
                          <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Inviter alle knap */}
                    <TouchableOpacity
                      style={[
                        styles.inviteAllButton,
                        filteredPlanInviteFriends.filter(f => !planInvitedFriends.includes(f.id)).length === 0 &&
                          styles.inviteAllButtonDisabled,
                      ]}
                      onPress={() => {
                        const notInvited = filteredPlanInviteFriends.filter(f => !planInvitedFriends.includes(f.id));
                        if (notInvited.length === 0) return;
                        setPlanInvitedFriends(prev => [...prev, ...notInvited.map(f => f.id)]);
                      }}
                      disabled={filteredPlanInviteFriends.filter(f => !planInvitedFriends.includes(f.id)).length === 0}>
                      <Text
                        style={[
                          styles.inviteAllText,
                          filteredPlanInviteFriends.filter(f => !planInvitedFriends.includes(f.id)).length === 0 &&
                            styles.inviteAllTextDisabled,
                        ]}>
                        Inviter alle venner
                      </Text>
                    </TouchableOpacity>

                    {/* Scrollable content */}
                    <ScrollView 
                      style={styles.planInviteScrollContent}
                      contentContainerStyle={styles.planInviteScrollContentContainer}
                      showsVerticalScrollIndicator={true}
                      nestedScrollEnabled={true}
                      scrollEnabled={true}
                      bounces={true}
                      keyboardShouldPersistTaps="handled">
                      {/* Friends List */}
                      {filteredPlanInviteFriends.length > 0 && (
                        <View style={styles.planInviteSection}>
                          <Text style={styles.planInviteSectionTitle}>Venner</Text>
                          {filteredPlanInviteFriends.map(friend => {
                            const hasBeenInvited = planInvitedFriends.includes(friend.id);
                            return (
                              <View key={friend.id} style={styles.friendRow}>
                                <View style={styles.friendInfoWrapper}>
                                  <View style={styles.friendAvatar}>
                                    <Text style={styles.friendAvatarText}>{friend.initials}</Text>
                                  </View>
                                  <View style={styles.friendDetails}>
                                    <Text style={styles.friendName}>{friend.name}</Text>
                                  </View>
                                </View>
                                <TouchableOpacity
                                  style={[
                                    styles.invitePill,
                                    hasBeenInvited && styles.invitePillDisabled,
                                  ]}
                                  onPress={() => {
                                    if (hasBeenInvited) {
                                      setPlanInvitedFriends(prev => prev.filter(id => id !== friend.id));
                                    } else {
                                      setPlanInvitedFriends(prev => [...prev, friend.id]);
                                    }
                                  }}>
                                  <Text
                                    style={[
                                      styles.invitePillText,
                                      hasBeenInvited && styles.invitePillTextDisabled,
                                    ]}>
                                    {hasBeenInvited ? 'Inviteret' : 'Inviter'}
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            );
                          })}
                        </View>
                      )}

                      {/* Empty state */}
                      {planInviteSearchQuery.trim().length > 0 && filteredPlanInviteFriends.length === 0 && (
                        <View style={styles.planInviteEmpty}>
                          <Text style={styles.planInviteEmptyText}>Ingen resultater fundet</Text>
                        </View>
                      )}
                    </ScrollView>
                  </View>
                </TouchableWithoutFeedback>
              </View>
            </TouchableWithoutFeedback>
          )}

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

    {/* Invite Friends Modal - Copied from CheckInScreen */}
    <Modal 
      visible={inviteModalVisible} 
      transparent 
      animationType="fade"
      onRequestClose={() => {
        setInviteModalVisible(false);
        setInviteSearchQuery('');
      }}
      presentationStyle="overFullScreen">
      <View style={styles.inviteModalOverlay}>
        <View style={[styles.modalCard, styles.friendModal]}>
          <Text style={styles.modalTitle}>Inviter venner</Text>
          
          {/* Search Bar */}
          <View style={styles.inviteSearchContainer}>
            <Ionicons name="search" size={20} color={colors.textTertiary} style={styles.inviteSearchIcon} />
            <TextInput
              style={styles.inviteSearchInput}
              placeholder="Søg efter venner..."
              placeholderTextColor={colors.textTertiary}
              value={inviteSearchQuery}
              onChangeText={setInviteSearchQuery}
              autoFocus={false}
            />
            {inviteSearchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setInviteSearchQuery('')}
                style={styles.inviteSearchClear}>
                <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[
              styles.inviteAllButton,
              remainingInviteCount === 0 && styles.inviteAllButtonDisabled,
            ]}
            onPress={handleInviteAll}
            disabled={remainingInviteCount === 0}>
            <Text
              style={[
                styles.inviteAllText,
                remainingInviteCount === 0 && styles.inviteAllTextDisabled,
              ]}>
              Inviter alle
            </Text>
          </TouchableOpacity>
          <ScrollView style={styles.friendList} showsVerticalScrollIndicator={false}>
            {filteredInviteFriends.length === 0 ? (
              <Text style={styles.emptySearchText}>Ingen venner fundet</Text>
            ) : (
              filteredInviteFriends.map(friend => {
                const hasBeenInvited = currentInvitedIds.includes(friend.id);
                return (
                  <View key={friend.id} style={styles.friendRow}>
                    <View style={styles.friendInfoWrapper}>
                      <View style={styles.friendAvatar}>
                        <Text style={styles.friendAvatarText}>{friend.initials}</Text>
                      </View>
                      <View style={styles.friendDetails}>
                        <Text style={styles.friendName}>{friend.name}</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.invitePill,
                        hasBeenInvited && styles.invitePillDisabled,
                      ]}
                      onPress={() => handleInviteFriendPress(friend.id)}>
                      <Text
                        style={[
                          styles.invitePillText,
                          hasBeenInvited && styles.invitePillTextDisabled,
                        ]}>
                        {hasBeenInvited ? 'Inviteret' : 'Inviter'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </ScrollView>
          <TouchableOpacity style={styles.modalClose} onPress={handleInviteModalDone}>
            <Text style={styles.modalCloseText}>Færdig</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
  },
  calendarCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    shadowColor: colors.primary,
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
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  calendarNavButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarHeaderText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
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
    color: colors.textTertiary,
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
    color: colors.text,
  },
  dayNumberMuted: {
    color: colors.textTertiary,
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
    color: colors.text,
    textTransform: 'capitalize',
  },
  detailGroup: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 18,
    padding: 16,
    shadowColor: colors.primary,
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 6},
  },
  detailGroupTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  emptyDetail: {
    fontSize: 14,
    color: colors.textTertiary,
  },
  detailCard: {
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.text,
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
    backgroundColor: colors.surfaceLight,
  },
  muscleChipText: {
    fontSize: 12,
    color: colors.success,
    fontWeight: '600',
  },
  muscleChipHistory: {
    backgroundColor: colors.surfaceLight,
  },
  muscleChipHistoryText: {
    color: colors.error,
  },
  inviteStatus: {
    fontSize: 13,
    color: colors.textTertiary,
  },
  moreInfoHint: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  moreInfoText: {
    fontSize: 12,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  inviteModalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 9999,
  },
  modalContent: {
    backgroundColor: colors.backgroundCard,
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
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  modalText: {
    fontSize: 16,
    color: colors.textSecondary,
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
    borderBottomColor: colors.border,
  },
  modalGymName: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  modalDateTime: {
    fontSize: 15,
    color: colors.textTertiary,
  },
  modalPhotoSection: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalPhoto: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  modalSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  modalSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  inviteAddButton: {
    padding: 4,
  },
  emptyInvitesText: {
    fontSize: 14,
    color: colors.textTertiary,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 12,
  },
  friendModal: {
    alignItems: 'stretch',
    maxHeight: '80%',
  },
  inviteAllButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  inviteAllButtonDisabled: {
    opacity: 0.4,
  },
  inviteAllText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  inviteAllTextDisabled: {
    color: colors.textTertiary,
  },
  inviteSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inviteSearchIcon: {
    marginRight: 8,
  },
  inviteSearchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 12,
  },
  inviteSearchClear: {
    padding: 4,
  },
  emptySearchText: {
    textAlign: 'center',
    color: colors.textTertiary,
    fontSize: 14,
    paddingVertical: 20,
  },
  friendList: {
    flexGrow: 0,
    marginBottom: 12,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  friendInfoWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  friendDetails: {
    marginLeft: 12,
  },
  friendAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  friendName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  invitePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.secondary,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  invitePillDisabled: {
    borderColor: colors.textTertiary,
    backgroundColor: colors.surface,
  },
  invitePillText: {
    color: colors.secondary,
    fontWeight: '600',
  },
  invitePillTextDisabled: {
    color: colors.textTertiary,
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
    backgroundColor: colors.surfaceLight,
  },
  modalMuscleChipText: {
    fontSize: 13,
    color: colors.success,
    fontWeight: '600',
  },
  modalMuscleChipHistory: {
    backgroundColor: colors.surfaceLight,
  },
  modalMuscleChipHistoryText: {
    color: colors.error,
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
    backgroundColor: colors.secondary,
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
    color: colors.text,
  },
  modalFriendStatusAccepted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  modalFriendStatusTextAccepted: {
    fontSize: 13,
    color: colors.success,
    fontWeight: '600',
  },
  modalFriendStatusPending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  modalFriendStatusTextPending: {
    fontSize: 13,
    color: colors.warning,
    fontWeight: '600',
  },
  modalFriendStatusCompleted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  modalFriendStatusTextCompleted: {
    fontSize: 13,
    color: colors.error,
    fontWeight: '600',
  },
  modalFriendStatusDeclined: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  modalFriendStatusTextDeclined: {
    fontSize: 13,
    color: colors.textTertiary,
    fontWeight: '600',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalCard: {
    backgroundColor: colors.backgroundCard,
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
    color: colors.textSecondary,
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
    borderColor: colors.border,
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
    borderColor: colors.border,
  },
  planSuggestionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  planSuggestionSubtitle: {
    fontSize: 13,
    color: colors.textTertiary,
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
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundCard,
  },
  muscleCardActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 6},
  },
  muscleImage: {
    width: 40,
    height: 40,
  },
  muscleImageActive: {
    tintColor: '#fff',
  },
  muscleLabel: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  muscleLabelActive: {
    color: '#fff',
  },
  calendarContainer: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 12,
    marginBottom: 8,
    backgroundColor: colors.backgroundCard,
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
    color: colors.text,
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
    color: colors.textTertiary,
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
    backgroundColor: colors.secondary,
  },
  calendarDayText: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '600',
  },
  calendarDayTextFaded: {
    color: colors.textTertiary,
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
    color: colors.text,
    marginLeft: 8,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: colors.secondary,
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
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 15,
    color: colors.text,
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
    backgroundColor: colors.backgroundCard,
    borderRadius: 20,
    padding: 16,
    width: '100%',
    maxWidth: 360,
    alignItems: 'stretch',
    shadowColor: colors.primary,
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: {width: 0, height: 10},
  },
  iosTimePickerControl: {
    width: '100%',
  },
  planInviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 20,
    gap: 8,
  },
  planInviteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.secondary,
  },
  planInvitePopup: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    elevation: 1000,
  },
  planInvitePopupContent: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 20,
    width: '95%',
    maxWidth: 500,
    maxHeight: '80%',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  planInvitePopupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  planInvitePopupTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  planInvitePopupClose: {
    padding: 4,
  },
  planInviteSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  planInviteSearchIcon: {
    marginRight: 8,
  },
  planInviteSearchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 12,
  },
  planInviteSearchClear: {
    padding: 4,
  },
  planInviteScrollContent: {
    maxHeight: 400,
  },
  planInviteScrollContentContainer: {
    paddingBottom: 10,
  },
  planInviteSection: {
    marginBottom: 20,
  },
  planInviteSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  planInviteEmpty: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  planInviteEmptyText: {
    fontSize: 14,
    color: colors.textTertiary,
  },
});

export default WorkoutScheduleScreen;

