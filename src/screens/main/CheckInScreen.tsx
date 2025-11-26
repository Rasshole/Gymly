import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  GestureResponderEvent,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';

import danishGyms, {DanishGym} from '@/data/danishGyms';
import {MuscleGroup} from '@/types/workout.types';
import {useAppStore} from '@/store/appStore';
import NotificationService from '@/services/notifications/NotificationService';
import {useWorkoutPlanStore} from '@/store/workoutPlanStore';
import {formatGymDisplayName, findGymById} from '@/utils/gymDisplay';

const SIMULATED_LOCATION = {
  latitude: 55.6875008,
  longitude: 12.4928911,
};

const DETECTION_RADIUS_METERS = 100;
const SLIDER_KNOB_SIZE = 60;

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
const WEEKDAYS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
const PR_OPTIONS = ['Bænk', 'Bicepcurl', 'Benpres', 'Dødløft', 'Squat'] as const;
type PrOption = (typeof PR_OPTIONS)[number];

type Friend = {
  id: string;
  name: string;
  initials: string;
  isOnline: boolean;
};

const FRIENDS: Friend[] = [
  {id: '1', name: 'Jeff', initials: 'J', isOnline: true},
  {id: '2', name: 'Marie', initials: 'M', isOnline: false},
  {id: '3', name: 'Lars', initials: 'L', isOnline: true},
  {id: '4', name: 'Sofia', initials: 'S', isOnline: true},
  {id: '5', name: 'Patti', initials: 'P', isOnline: false},
];

type DetectionStatus = 'searching' | 'found' | 'missing';
type PendingSession = {gym: DanishGym; muscles: MuscleGroup[]};
type ActiveSession = PendingSession & {
  startTime: number;
  invitedFriendIds: string[];
};

const formatMuscleSelection = (groups: MuscleGroup[]) => {
  if (groups.length === 0) {
    return 'Fri træning';
  }
  return groups
    .map(group => MUSCLE_GROUPS.find(item => item.key === group)?.label || group)
    .join(', ');
};

const formatDuration = (milliseconds: number) => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

const getDistanceMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const CheckInScreen = () => {
  const {user} = useAppStore();
  const {
    plannedWorkouts,
    completedWorkouts,
    addPlannedWorkout,
    addPlanInvites,
    addCompletedWorkout,
  } = useWorkoutPlanStore();
  const [detectionStatus, setDetectionStatus] = useState<DetectionStatus>('searching');
  const [detectedGym, setDetectedGym] = useState<DanishGym | null>(null);
  const [detectedDistance, setDetectedDistance] = useState<number | null>(null);
  const [selectedMuscles, setSelectedMuscles] = useState<MuscleGroup[]>([]);
  const [sliderWidth, setSliderWidth] = useState(0);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [gymPickerVisible, setGymPickerVisible] = useState(false);
  const [manualGymQuery, setManualGymQuery] = useState('');
  const [pendingSession, setPendingSession] = useState<PendingSession | null>(null);
  const [pendingInviteIds, setPendingInviteIds] = useState<string[]>([]);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [inviteContext, setInviteContext] = useState<'pending' | 'active' | 'plan' | null>(null);
  const [invitePlanId, setInvitePlanId] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
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
  const [planToast, setPlanToast] = useState<{visible: boolean; message: string}>({
    visible: false,
    message: '',
  });
  const [prModalVisible, setPrModalVisible] = useState(false);
  const [prStep, setPrStep] = useState<'select' | 'details'>('select');
  const [selectedPr, setSelectedPr] = useState<PrOption | null>(null);
  const [prWeight, setPrWeight] = useState('');
  const [prVideoAttached, setPrVideoAttached] = useState(false);

  const sliderAnim = useRef(new Animated.Value(0)).current;
  const sliderValueRef = useRef(0);
  const sliderStartValue = useRef(0);

  const primaryGym = useMemo(
    () => findGymById(user?.favoriteGyms?.[0] ?? null),
    [user],
  );
  const formattedPlanTime = useMemo(
    () =>
      planDateTime.toLocaleTimeString('da-DK', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    [planDateTime],
  );
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

  useEffect(() => {
    const listenerId = sliderAnim.addListener(({value}) => {
      sliderValueRef.current = value;
    });
    return () => sliderAnim.removeListener(listenerId);
  }, [sliderAnim]);

  useEffect(() => {
    setDetectionStatus('searching');
    const finder = setTimeout(() => {
      const closest = danishGyms
        .map(gym => {
          const distance = getDistanceMeters(
            SIMULATED_LOCATION.latitude,
            SIMULATED_LOCATION.longitude,
            gym.latitude,
            gym.longitude,
          );
          return {...gym, distance};
        })
        .filter(gym => gym.distance <= DETECTION_RADIUS_METERS)
        .sort((a, b) => a.distance - b.distance)[0];

      if (closest) {
        setDetectedGym(closest);
        setDetectedDistance(closest.distance);
        setDetectionStatus('found');
      } else {
        setDetectedGym(null);
        setDetectedDistance(null);
        setDetectionStatus('missing');
      }
    }, 600);

    return () => clearTimeout(finder);
  }, []);

  const manualSuggestions = useMemo(() => {
    const query = manualGymQuery.trim().toLowerCase();
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
  }, [manualGymQuery]);

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

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (activeSession) {
      const tick = () => {
        setElapsedTime(Date.now() - activeSession.startTime);
      };
      tick();
      interval = setInterval(tick, 1000);
    } else {
      setElapsedTime(0);
    }
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [activeSession]);

  useEffect(() => {
    if (!planModalVisible) {
      setPlanTimePickerVisible(false);
    }
  }, [planModalVisible]);

  const showPlanToast = (message: string) => {
    setPlanToast({visible: true, message});
    setTimeout(() => {
      setPlanToast({visible: false, message: ''});
    }, 1200);
  };

  const maxTranslate = Math.max(sliderWidth - SLIDER_KNOB_SIZE, 0);

  const sliderTextOpacity = useMemo(() => {
    const endRange = maxTranslate > 0 ? maxTranslate : 1;
    return sliderAnim.interpolate({
      inputRange: [0, endRange],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });
  }, [maxTranslate, sliderAnim]);

  const handleLayout = (event: any) => {
    setSliderWidth(event.nativeEvent.layout.width);
  };

  const toggleMuscleGroup = (group: MuscleGroup) => {
    setSelectedMuscles(prev => {
      if (prev.includes(group)) {
        return prev.filter(item => item !== group);
      }
      return [...prev, group];
    });
  };

  const togglePlanMuscle = (group: MuscleGroup) => {
    setPlanMuscles(prev => {
      if (prev.includes(group)) {
        return prev.filter(item => item !== group);
      }
      return [...prev, group];
    });
  };

  const handlePrWeightChange = (value: string) => {
    const numeric = value.replace(/[^0-9]/g, '');
    setPrWeight(numeric);
  };

  const handleOpenPrModal = () => {
    setPrModalVisible(true);
    setPrStep('select');
    setSelectedPr(null);
    setPrWeight('');
    setPrVideoAttached(false);
  };

  const handleSelectPrOption = (option: PrOption) => {
    setSelectedPr(option);
    setPrStep('details');
  };

  const handleAttachPrVideo = () => {
    setPrVideoAttached(true);
    Alert.alert('Video tilføjet', 'Din video er markeret som uploadet (maks 30 sek).');
  };

  const handleSubmitPr = () => {
    if (!selectedPr) {
      return;
    }
    if (!prWeight.trim()) {
      Alert.alert('Angiv vægt', 'Indtast vægten for din nye PR.');
      return;
    }
    if (!prVideoAttached) {
      Alert.alert('Tilføj video', 'Upload en video som bevis (maks 30 sek).');
      return;
    }
    Alert.alert('Stærkt!', `${prWeight.trim()} kg i ${selectedPr} sat!`);
    setPrModalVisible(false);
  };

  const findGymByQuery = (query: string): DanishGym | null => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    return (
      danishGyms.find(gym => formatGymDisplayName(gym).toLowerCase() === normalized) ||
      danishGyms.find(gym => formatGymDisplayName(gym).toLowerCase().includes(normalized)) ||
      null
    );
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

  const handleOpenPlanModal = () => {
    const defaultGym = primaryGym || detectedGym || planSelectedGym || danishGyms[0];
    setPlanSelectedGym(defaultGym);
    setPlanCenterQuery(defaultGym ? formatGymDisplayName(defaultGym) : '');
    const defaultMuscles =
      selectedMuscles.length > 0
        ? selectedMuscles
        : planMuscles.length > 0
        ? planMuscles
        : [MUSCLE_GROUPS[0].key];
    setPlanMuscles(defaultMuscles);
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
    setPlanSelectedGym(resolvedGym);
    setPlanCenterQuery(formatGymDisplayName(resolvedGym));

    const planId = `plan_${Date.now()}`;
    addPlannedWorkout({
      id: planId,
      gym: resolvedGym,
      muscles: planMuscles,
      scheduledAt: planDateTime,
      invitedFriends: [],
    });

    setPlanModalVisible(false);
    openInviteModal('plan', {planId});
    setTimeout(() => {
      showPlanToast(
        `Træning planlagt: ${planDateTime.toLocaleDateString('da-DK', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        })} kl. ${formattedPlanTime}`,
      );
    }, 50);
  };

  const handlePlanCenterInput = (value: string) => {
    setPlanCenterQuery(value);
    setPlanSelectedGym(null);
  };

  const handleSelectPlanGym = (gym: DanishGym) => {
    setPlanSelectedGym(gym);
    setPlanCenterQuery(formatGymDisplayName(gym));
  };

  const openPlanTimePicker = () => {
    setPlanTimePickerVisible(true);
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
    if (!date) {
      setPlanTimePickerVisible(false);
      return;
    }
    const rounded = roundToQuarterHour(date);
    const updated = new Date(planDateTime);
    updated.setHours(rounded.getHours());
    updated.setMinutes(rounded.getMinutes());
    updated.setSeconds(0);
    updated.setMilliseconds(0);
    setPlanDateTime(updated);
    // Don't close on iOS - let user close manually with "Færdig" button
    if (Platform.OS === 'android') {
      setPlanTimePickerVisible(false);
    }
  };

  const handlePlanTimePickerClose = () => {
    setPlanTimePickerVisible(false);
  };

  const activateSession = useCallback(() => {
    if (!pendingSession) {
      setShowConfirmation(false);
      return;
    }
    setActiveSession({
      ...pendingSession,
      startTime: Date.now(),
      invitedFriendIds: pendingInviteIds,
    });
    setPendingSession(null);
    setPendingInviteIds([]);
    setShowConfirmation(false);
    setInviteModalVisible(false);
    setInviteContext(null);
  }, [pendingInviteIds, pendingSession]);

  const openInviteModal = (context: 'pending' | 'active' | 'plan', options?: {planId?: string}) => {
    if (context === 'pending' && !pendingSession) {
      return;
    }
    if (context === 'active' && !activeSession) {
      return;
    }
    if (context === 'plan') {
      const targetPlanId = options?.planId ?? invitePlanId;
      if (!targetPlanId) {
        return;
      }
      setInvitePlanId(targetPlanId);
    }
    setInviteContext(context);
    setInviteModalVisible(true);
    setShowConfirmation(false);
  };

  const getPlanForInvites = () => {
    if (inviteContext !== 'plan' || !invitePlanId) {
      return null;
    }
    return plannedWorkouts.find(plan => plan.id === invitePlanId) || null;
  };

  const getCurrentInvitedIds = () => {
    if (inviteContext === 'pending') {
      return pendingInviteIds;
    }
    if (inviteContext === 'active') {
      return activeSession?.invitedFriendIds ?? [];
    }
    if (inviteContext === 'plan') {
      return getPlanForInvites()?.invitedFriends ?? [];
    }
    return [];
  };

  const inviteFriendsByIds = (friendIds: string[]) => {
    if (friendIds.length === 0) {
      return;
    }
    if (inviteContext === 'pending') {
      if (!pendingSession) {
        return;
      }
      NotificationService.sendWorkoutInvite(
        user?.displayName || 'Din ven',
        pendingSession.gym,
        formatMuscleSelection(pendingSession.muscles),
        friendIds,
      );
      setPendingInviteIds(prev => [...prev, ...friendIds.filter(id => !prev.includes(id))]);
    } else if (inviteContext === 'active') {
      if (!activeSession) {
        return;
      }
      NotificationService.sendWorkoutInvite(
        user?.displayName || 'Din ven',
        activeSession.gym,
        formatMuscleSelection(activeSession.muscles),
        friendIds,
      );
      setActiveSession(prev =>
        prev
          ? {
              ...prev,
              invitedFriendIds: [
                ...prev.invitedFriendIds,
                ...friendIds.filter(id => !prev.invitedFriendIds.includes(id)),
              ],
            }
          : prev,
      );
    } else if (inviteContext === 'plan') {
      const plan = getPlanForInvites();
      if (!plan) {
        Alert.alert('Plan ikke fundet', 'Kunne ikke finde den planlagte træning.');
        return;
      }
      NotificationService.sendWorkoutInvite(
        user?.displayName || 'Din ven',
        plan.gym,
        formatMuscleSelection(plan.muscles),
        friendIds,
        plan.id,
        plan.scheduledAt,
        plan.muscles,
      );
      addPlanInvites(plan.id, friendIds);
    }
  };

  const handleInviteFriendPress = (friendId: string) => {
    const alreadyInvited = getCurrentInvitedIds();
    if (alreadyInvited.includes(friendId)) {
      return;
    }
    inviteFriendsByIds([friendId]);
  };

  const handleInviteAll = () => {
    const alreadyInvited = getCurrentInvitedIds();
    const remaining = FRIENDS.map(friend => friend.id).filter(
      id => !alreadyInvited.includes(id),
    );
    if (remaining.length === 0) {
      return;
    }
    inviteFriendsByIds(remaining);
  };

  const handleInviteModalDone = () => {
    if (inviteContext === 'pending') {
      activateSession();
    } else {
      setInviteModalVisible(false);
      setInviteContext(null);
      if (inviteContext === 'plan') {
        setInvitePlanId(null);
      }
    }
  };

  const handleFinishWorkout = () => {
    if (!activeSession) {
      return;
    }
    const durationText = formatDuration(elapsedTime);
    const muscleText = formatMuscleSelection(activeSession.muscles);
    const friendCount = activeSession.invitedFriendIds.length;
    const friendText =
      friendCount > 0
        ? ` med ${friendCount} ${friendCount === 1 ? 'ven' : 'venner'}, hvis de accepterer invitationen`
        : '';
    const message = `Godt gået, du trænede ${muscleText} i ${formatGymDisplayName(
      activeSession.gym,
    )} i ${durationText}${friendText}. Godt klaret! 💪`;
    Alert.alert('Godt gået!', message, [
      {
        text: 'Tak!',
        onPress: () => {
          addCompletedWorkout({
            id: `history_${Date.now()}`,
            gym: activeSession.gym,
            muscles: activeSession.muscles,
            durationMs: elapsedTime,
            completedAt: new Date(),
            invitedFriends: activeSession.invitedFriendIds,
            acceptedFriends: [], // Will be populated when friends accept invitations
          });
          setActiveSession(null);
          setInviteModalVisible(false);
          setInviteContext(null);
          setPendingInviteIds([]);
          setPendingSession(null);
          setShowConfirmation(false);
        },
      },
    ]);
  };

  const attemptCheckIn = useCallback(() => {
    if (!detectedGym) {
      Alert.alert(
        'Ingen center fundet',
        'Vi kunne ikke finde et center i nærheden. Prøv igen om lidt.',
      );
      return false;
    }

    if (selectedMuscles.length === 0) {
      Alert.alert('Vælg muskelgrupper', 'Vælg mindst én muskelgruppe for denne workout.');
      return false;
    }

    setPendingSession({
      gym: detectedGym,
      muscles: selectedMuscles,
    });
    setPendingInviteIds([]);
    setShowConfirmation(true);
    return true;
  }, [detectedGym, selectedMuscles]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          sliderStartValue.current = sliderValueRef.current;
          sliderAnim.stopAnimation();
        },
        onPanResponderMove: (_, gestureState) => {
          if (maxTranslate === 0) {
            return;
          }
          const nextValue = Math.min(
            Math.max(sliderStartValue.current + gestureState.dx, 0),
            maxTranslate,
          );
          sliderAnim.setValue(nextValue);
        },
        onPanResponderRelease: (_, gestureState) => {
          if (maxTranslate === 0) {
            return;
          }
          const releasePoint = Math.min(
            Math.max(sliderStartValue.current + gestureState.dx, 0),
            maxTranslate,
          );
          const completed = releasePoint >= maxTranslate * 0.85;
          if (completed) {
            const success = attemptCheckIn();
            if (success) {
              Animated.timing(sliderAnim, {
                toValue: maxTranslate,
                duration: 120,
                useNativeDriver: false,
              }).start(() => {
                setTimeout(() => {
                  Animated.timing(sliderAnim, {
                    toValue: 0,
                    duration: 220,
                    useNativeDriver: false,
                  }).start();
                }, 350);
              });
            } else {
              Animated.spring(sliderAnim, {
                toValue: 0,
                useNativeDriver: false,
              }).start();
            }
          } else {
            Animated.spring(sliderAnim, {
              toValue: 0,
              useNativeDriver: false,
            }).start();
          }
        },
      }),
    [attemptCheckIn, maxTranslate, sliderAnim],
  );

  const handleLetsGo = () => {
    activateSession();
  };

  const handleInviteFriends = () => {
    openInviteModal('pending');
  };

  const detectionMessage = () => {
    switch (detectionStatus) {
      case 'searching':
        return 'Finder dit center...';
      case 'found':
        return detectedGym
          ? formatGymDisplayName(detectedGym)
          : primaryGym
          ? formatGymDisplayName(primaryGym)
          : 'Center fundet';
      case 'missing':
        return primaryGym
          ? formatGymDisplayName(primaryGym)
          : 'Intet center fundet i nærheden';
      default:
        return '';
    }
  };

  const currentInvitedIds = inviteModalVisible ? getCurrentInvitedIds() : [];
  const remainingInviteCount = inviteModalVisible
    ? FRIENDS.filter(friend => !currentInvitedIds.includes(friend.id)).length
    : 0;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.content}>
        {activeSession ? (
          <>
            <View style={styles.card}>
              <Text style={styles.activeTitle}>Du er nu tjekket ind</Text>
              <Text style={styles.activeSubtitle}>
                {`I ${formatGymDisplayName(activeSession.gym)} • ${formatMuscleSelection(
                  activeSession.muscles,
                )}`}
              </Text>
              <View style={styles.timerPill}>
                <Ionicons name="time-outline" size={18} color="#0F172A" />
                <Text style={styles.timerText}>{formatDuration(elapsedTime)}</Text>
              </View>
              {activeSession.invitedFriendIds.length > 0 && (
                <Text style={styles.activeInfo}>
                  {`${activeSession.invitedFriendIds.length} ${
                    activeSession.invitedFriendIds.length === 1 ? 'ven' : 'venner'
                  } inviteret (venter på svar)`}
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.inviteFriendsButton}
              onPress={() => openInviteModal('active')}
              activeOpacity={0.9}>
              <Ionicons name="send-outline" size={20} color="#007AFF" style={{marginRight: 8}} />
              <Text style={styles.inviteFriendsText}>Inviter venner</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.prButton} onPress={handleOpenPrModal} activeOpacity={0.9}>
              <Ionicons name="trophy-outline" size={20} color="#C026D3" style={{marginRight: 8}} />
              <Text style={styles.prButtonText}>Sæt PR</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.finishButton}
              onPress={handleFinishWorkout}
              activeOpacity={0.9}>
              <Text style={styles.finishButtonText}>Afslut træning</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.9}
              onPress={() => setGymPickerVisible(true)}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardSmallTitle}>Dit center</Text>
                <TouchableOpacity
                  style={styles.planButton}
                  onPress={(e: GestureResponderEvent) => {
                    e.stopPropagation();
                    handleOpenPlanModal();
                  }}>
                  <Text style={styles.planButtonText}>Planlæg træning</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.detectionRow}>
                <View style={styles.detectionIcon}>
                  <Ionicons name="location-outline" size={28} color="#007AFF" />
                </View>
                <View style={styles.detectionInfo}>
                  <Text style={styles.detectionTitle}>{detectionMessage()}</Text>
                  {detectionStatus === 'searching' && (
                    <ActivityIndicator size="small" color="#007AFF" style={{marginTop: 6}} />
                  )}
                  {detectionStatus === 'found' && detectedDistance !== null && (
                    <Text style={styles.detectionDistance}>{`${Math.round(
                      detectedDistance,
                    )} m væk`}</Text>
                  )}
                  <Text style={styles.detectionHint}>Tryk for at vælge et andet center</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
              </View>
            </TouchableOpacity>

            <View style={[styles.card, styles.flexCard]}>
              <View style={styles.muscleGrid}>
                {MUSCLE_GROUPS.map(item => {
                  const isActive = selectedMuscles.includes(item.key);
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[styles.muscleCard, isActive && styles.muscleCardActive]}
                      onPress={() => toggleMuscleGroup(item.key)}
                      activeOpacity={0.85}>
                      <Ionicons
                        name={item.icon as any}
                        size={24}
                        color={isActive ? '#fff' : '#007AFF'}
                      />
                      <Text style={[styles.muscleLabel, isActive && styles.muscleLabelActive]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.sliderTrack} onLayout={handleLayout}>
                <Animated.Text style={[styles.sliderText, {opacity: sliderTextOpacity}]}>
                  Tjek ind
                </Animated.Text>
                <Animated.View
                  style={[
                    styles.sliderKnob,
                    {
                      transform: [{translateX: sliderAnim}],
                    },
                  ]}
                  {...panResponder.panHandlers}>
                  <Ionicons name="arrow-forward" size={24} color="#fff" />
                </Animated.View>
              </View>
            </View>
          </>
        )}
      </View>

      <Modal visible={gymPickerVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            style={styles.modalCard}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Text style={styles.modalTitle}>Vælg center</Text>
            <Text style={styles.modalText}>
              Skriv navnet på dit center, hvis positionen ikke passer.
            </Text>
            <TextInput
              style={styles.manualInput}
              placeholder="Fx PureGym Vanløse Torv"
              value={manualGymQuery}
              onChangeText={setManualGymQuery}
              autoCapitalize="words"
              autoCorrect={false}
            />
            <View style={styles.manualList}>
              {manualSuggestions.length === 0 && manualGymQuery.trim().length > 0 ? (
                <Text style={styles.emptyState}>Ingen resultater – prøv en anden søgning.</Text>
              ) : (
                manualSuggestions.map(option => (
                  <TouchableOpacity
                    key={option.id}
                    style={styles.manualItem}
                    onPress={() => {
                      setDetectedGym(option);
                      setDetectionStatus('found');
                      setDetectedDistance(null);
                      setGymPickerVisible(false);
                      setManualGymQuery('');
                    }}>
                    <View>
                      <Text style={styles.manualItemTitle}>
                        {formatGymDisplayName(option)}
                      </Text>
                      <Text style={styles.manualItemSubtitle}>
                        {[option.city, option.region].filter(Boolean).join(' • ')}
                      </Text>
                    </View>
                    <Ionicons name="checkmark-circle" size={22} color="#007AFF" />
                  </TouchableOpacity>
                ))
              )}
            </View>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => {
                setGymPickerVisible(false);
                setManualGymQuery('');
              }}>
              <Text style={styles.modalCloseText}>Luk</Text>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={planModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
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
                        size={24}
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

      <Modal visible={showConfirmation} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Ionicons name="checkmark-circle" size={48} color="#34C759" />
            </View>
            <Text style={styles.modalTitle}>Du er tjekket ind! 👏</Text>
            {pendingSession && (
              <>
                <Text style={styles.modalText}>
                  Du har tjekket ind i {formatGymDisplayName(pendingSession.gym)}
                </Text>
                <Text style={styles.modalText}>
                  Træning: {formatMuscleSelection(pendingSession.muscles)}
                </Text>
              </>
            )}
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.primaryButton} onPress={handleLetsGo}>
                <Text style={styles.primaryButtonText}>Let&apos;s go 💪</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={handleInviteFriends}>
                <Text style={styles.secondaryButtonText}>Inviter venner</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={inviteModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.friendModal]}>
            <Text style={styles.modalTitle}>Inviter venner</Text>
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
              {FRIENDS.map(friend => {
                const hasBeenInvited = currentInvitedIds.includes(friend.id);
                return (
                  <View key={friend.id} style={styles.friendRow}>
                    <View style={styles.friendInfoWrapper}>
                      <View
                        style={[
                          styles.friendAvatar,
                          friend.isOnline && styles.friendAvatarOnline,
                        ]}>
                        <Text style={styles.friendAvatarText}>{friend.initials}</Text>
                      </View>
                      <View style={styles.friendDetails}>
                        <Text style={styles.friendName}>{friend.name}</Text>
                        <Text
                          style={[
                            styles.friendStatus,
                            friend.isOnline ? styles.friendStatusOnline : styles.friendStatusOffline,
                          ]}>
                          {friend.isOnline ? 'Online' : 'Offline'}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.invitePill,
                        hasBeenInvited && styles.invitePillDisabled,
                      ]}
                      onPress={() => handleInviteFriendPress(friend.id)}
                      disabled={hasBeenInvited}>
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
            </ScrollView>
            <TouchableOpacity style={styles.modalClose} onPress={handleInviteModalDone}>
              <Text style={styles.modalCloseText}>
                {inviteContext === 'pending' ? 'Færdig & start træning' : 'Færdig'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={prModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.prModalCard]}>
            {prStep === 'select' && (
              <>
                <Text style={styles.modalTitle}>Hvilken PR vil du sætte?</Text>
                <Text style={styles.modalText}>Vælg øvelsen herunder</Text>
                {PR_OPTIONS.map(option => (
                  <TouchableOpacity
                    key={option}
                    style={styles.prOptionButton}
                    onPress={() => handleSelectPrOption(option)}
                    activeOpacity={0.85}>
                    <Text style={styles.prOptionText}>{option}</Text>
                    <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.modalClose} onPress={() => setPrModalVisible(false)}>
                  <Text style={styles.modalCloseText}>Luk</Text>
                </TouchableOpacity>
              </>
            )}
            {prStep === 'details' && selectedPr && (
              <>
                <Text style={styles.modalTitle}>{selectedPr}</Text>
                <Text style={styles.modalText}>Angiv vægt og upload en video (maks 30 sek)</Text>
                <Text style={styles.sectionLabel}>Vægt (kg)</Text>
                <TextInput
                  style={styles.prInput}
                  keyboardType="numeric"
                  placeholder="Fx 120"
                  placeholderTextColor="#94A3B8"
                  value={prWeight}
                  onChangeText={handlePrWeightChange}
                />
                <Text style={styles.sectionLabel}>Bevis</Text>
                <TouchableOpacity
                  style={[
                    styles.videoButton,
                    prVideoAttached && styles.videoButtonAttached,
                  ]}
                  onPress={handleAttachPrVideo}
                  activeOpacity={0.85}>
                  <Ionicons
                    name={prVideoAttached ? 'checkmark-circle' : 'cloud-upload-outline'}
                    size={20}
                    color={prVideoAttached ? '#22C55E' : '#0F172A'}
                    style={{marginRight: 8}}
                  />
                  <Text
                    style={[
                      styles.videoButtonText,
                      prVideoAttached && styles.videoButtonTextAttached,
                    ]}>
                    {prVideoAttached ? 'Video tilføjet (maks 30 sek)' : 'Upload video'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.prSubmitButton,
                    (!prWeight.trim() || !prVideoAttached) && styles.prSubmitButtonDisabled,
                  ]}
                  onPress={handleSubmitPr}
                  disabled={!prWeight.trim() || !prVideoAttached}>
                  <Text style={styles.prSubmitButtonText}>Del PR</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalClose}
                  onPress={() => setPrModalVisible(false)}>
                  <Text style={styles.modalCloseText}>Fortryd</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
      {planToast.visible && (
        <Modal transparent animationType="fade">
          <View style={styles.toastOverlay} pointerEvents="none">
            <View style={styles.planToast}>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.planToastText}>{planToast.message}</Text>
            </View>
          </View>
        </Modal>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  content: {
    flex: 1,
    padding: 16,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  flexCard: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
  },
  detectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  detectionIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#E0F2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  detectionInfo: {
    flex: 1,
  },
  detectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  detectionHint: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 6,
  },
  detectionDistance: {
    fontSize: 14,
    color: '#007AFF',
    marginTop: 4,
  },
  muscleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  muscleCard: {
    width: '47%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginBottom: 10,
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
    marginTop: 8,
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  muscleLabelActive: {
    color: '#fff',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardSmallTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#475467',
  },
  planButton: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  planButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4338CA',
  },
  sliderTrack: {
    backgroundColor: '#EEF2FF',
    borderRadius: 30,
    paddingVertical: 12,
    position: 'relative',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sliderText: {
    position: 'absolute',
    alignSelf: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#4C4F6B',
  },
  sliderKnob: {
    width: SLIDER_KNOB_SIZE,
    height: SLIDER_KNOB_SIZE,
    borderRadius: SLIDER_KNOB_SIZE / 2,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#007AFF',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    alignItems: 'center',
  },
  modalIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#E6F9EE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
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
  manualInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#CBD5F5',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    marginTop: 16,
  },
  manualList: {
    width: '100%',
    marginTop: 16,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingVertical: 4,
  },
  manualItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
  },
  manualItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  manualItemSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  emptyState: {
    padding: 16,
    fontSize: 14,
    textAlign: 'center',
    color: '#94A3B8',
  },
  modalClose: {
    marginTop: 20,
    backgroundColor: '#E2E8F0',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  modalCloseText: {
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '600',
  },
  prOptionButton: {
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  prOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  prInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0F172A',
    marginBottom: 16,
  },
  videoButton: {
    borderWidth: 1,
    borderColor: '#CBD5F5',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  videoButtonAttached: {
    borderColor: '#22C55E',
    backgroundColor: '#ECFDF5',
  },
  videoButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  videoButtonTextAttached: {
    color: '#15803D',
  },
  prSubmitButton: {
    width: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  prSubmitButtonDisabled: {
    backgroundColor: '#93C5FD',
  },
  prSubmitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    marginTop: 16,
    width: '100%',
    justifyContent: 'space-between',
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 16,
    marginRight: 8,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: '#93C5FD',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CBD5F5',
    paddingVertical: 14,
    marginLeft: 8,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  activeTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  activeSubtitle: {
    fontSize: 15,
    color: '#475467',
    marginBottom: 16,
  },
  activeInfo: {
    marginTop: 12,
    fontSize: 14,
    color: '#2563EB',
    fontWeight: '600',
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  timerText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginLeft: 6,
  },
  inviteFriendsButton: {
    backgroundColor: '#E0F2FF',
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  inviteFriendsText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
    marginLeft: 8,
  },
  prButton: {
    marginTop: 12,
    backgroundColor: '#F5D0FE',
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  prButtonText: {
    fontSize: 16,
    color: '#C026D3',
    fontWeight: '600',
    marginLeft: 8,
  },
  finishButton: {
    marginTop: 12,
    backgroundColor: '#0F172A',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  finishButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  friendModal: {
    alignItems: 'stretch',
    maxHeight: '80%',
  },
  prModalCard: {
    alignItems: 'stretch',
  },
  inviteAllButton: {
    backgroundColor: '#E0E7FF',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  inviteAllButtonDisabled: {
    opacity: 0.4,
  },
  inviteAllText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3730A3',
  },
  inviteAllTextDisabled: {
    color: '#94A3B8',
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
    borderColor: '#E2E8F0',
  },
  friendInfoWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  friendDetails: {
    marginLeft: 12,
  },
  friendDetails: {
    marginLeft: 12,
  },
  friendAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#CBD5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendAvatarOnline: {
    borderWidth: 2,
    borderColor: '#34D399',
  },
  friendAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  friendName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  friendStatus: {
    fontSize: 13,
  },
  friendStatusOnline: {
    color: '#10B981',
  },
  friendStatusOffline: {
    color: '#94A3B8',
  },
  invitePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#007AFF',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  invitePillDisabled: {
    borderColor: '#94A3B8',
    backgroundColor: '#F1F5F9',
  },
  invitePillText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  invitePillTextDisabled: {
    color: '#94A3B8',
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
  planPickerColumn: {
    width: '100%',
    marginTop: 12,
  },
  datePicker: {
    marginTop: -10,
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
  calendarNavButton: {
    padding: 4,
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
  planToast: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
    elevation: 5,
  },
  planToastText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  toastOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 40,
  },
});

export default CheckInScreen;

