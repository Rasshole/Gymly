import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  GestureResponderEvent,
} from 'react-native';
import {launchCamera, CameraOptions} from 'react-native-image-picker';
import Ionicons from 'react-native-vector-icons/Ionicons';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';

import danishGyms, {DanishGym} from '@/data/danishGyms';
import {MuscleGroup} from '@/types/workout.types';
import {useAppStore} from '@/store/appStore';
import NotificationService from '@/services/notifications/NotificationService';
import {useWorkoutPlanStore, WorkoutPlanEntry} from '@/store/workoutPlanStore';
import {formatGymDisplayName, findGymById} from '@/utils/gymDisplay';
import {useFeedStore} from '@/store/feedStore';
import {useGroupStore, GymlyGroup} from '@/store/groupStore';
import {usePRStore} from '@/store/prStore';
import {colors} from '@/theme/colors';
import {getMuscleGroupImage} from '@/utils/muscleGroupImages';
import GymlyLogo from '@/components/GymlyLogo';
import {getGymLogo, hasGymLogo} from '@/utils/gymLogos';

const SIMULATED_LOCATION = {
  latitude: 55.6875008,
  longitude: 12.4928911,
};

const DETECTION_RADIUS_METERS = 100;
const SLIDER_KNOB_SIZE = 50;

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
  // Brug brugerens valgte biceps; hvis ingen er valgt, brug samme hvide standard som i Profil (💪🏻)
  const rawBicepsEmoji = user?.bicepsEmoji || '💪🏻';
  // Fjern evt. ekstra symboler som hjerter, men bevar hudtone på selve biceps-emoji'en
  const userBicepsEmoji = rawBicepsEmoji.replace(/💛|❤️|♥️/g, '');
  const {
    plannedWorkouts,
    completedWorkouts,
    addPlannedWorkout,
    addPlanInvites,
    removePlanInvites,
    removePlannedWorkout,
    addCompletedWorkout,
  } = useWorkoutPlanStore();
  const addFeedItem = useFeedStore(state => state.addFeedItem);
  const addPR = usePRStore(state => state.addPR);
  const [detectionStatus, setDetectionStatus] = useState<DetectionStatus>('searching');
  const [detectedGym, setDetectedGym] = useState<DanishGym | null>(null);
  const [detectedDistance, setDetectedDistance] = useState<number | null>(null);
  const [selectedMuscles, setSelectedMuscles] = useState<MuscleGroup[]>([]);
  const [soloTraining, setSoloTraining] = useState(false);
  const [sliderWidth, setSliderWidth] = useState(0);
  const [checkInToast, setCheckInToast] = useState<{visible: boolean; message: string}>({
    visible: false,
    message: '',
  });
  const [gymPickerVisible, setGymPickerVisible] = useState(false);
  const [manualGymQuery, setManualGymQuery] = useState('');
  const [pendingSession, setPendingSession] = useState<PendingSession | null>(null);
  const [pendingInviteIds, setPendingInviteIds] = useState<string[]>([]);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [sessionPhotoUri, setSessionPhotoUri] = useState<string | null>(null);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [inviteContext, setInviteContext] = useState<'pending' | 'active' | 'plan' | null>(null);
  const [invitePlanId, setInvitePlanId] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [planModalVisible, setPlanModalVisible] = useState(false);
  const [planSelectedGym, setPlanSelectedGym] = useState<DanishGym | null>(null);
  const [planCenterQuery, setPlanCenterQuery] = useState('');
  const [planMuscles, setPlanMuscles] = useState<MuscleGroup[]>([]);
  const [planSoloTraining, setPlanSoloTraining] = useState(false);
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
  const [planInvitedFriends, setPlanInvitedFriends] = useState<string[]>([]);
  const [planInviteSectionVisible, setPlanInviteSectionVisible] = useState(false);
  const [planInviteSearchQuery, setPlanInviteSearchQuery] = useState('');
  const {groups} = useGroupStore();
  const [prModalVisible, setPrModalVisible] = useState(false);
  const [prStep, setPrStep] = useState<'select' | 'details'>('select');
  const [selectedPr, setSelectedPr] = useState<PrOption | null>(null);
  const [prWeight, setPrWeight] = useState('');
  const [prVideoAttached, setPrVideoAttached] = useState(false);
  const [shareComposerVisible, setShareComposerVisible] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const [shareVisibility, setShareVisibility] = useState<'everyone' | 'friends' | 'private'>('everyone');
  const [shareRating, setShareRating] = useState<number | null>(null);
  const [sharePrivateNotes, setSharePrivateNotes] = useState('');
  const [shareContext, setShareContext] = useState<{
    session: ActiveSession;
    summary: string;
    durationMs: number;
    photoUri?: string | null;
  } | null>(null);
  const [gymlyPopupVisible, setGymlyPopupVisible] = useState(false);
  const gymlyPopupScale = useRef(new Animated.Value(0)).current;
  const gymlyPopupOpacity = useRef(new Animated.Value(0)).current;
  const gymlyTextOpacity = useRef(new Animated.Value(0)).current;
  const gymlyLogoScale = useRef(new Animated.Value(0)).current;
  const gymlyLogoOpacity = useRef(new Animated.Value(0)).current;

  // Debug: log when shareComposerVisible changes
  useEffect(() => {
    console.log('shareComposerVisible changed to:', shareComposerVisible);
    if (shareComposerVisible) {
      console.log('Share composer should be visible now!');
    }
  }, [shareComposerVisible]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionPosition, setMentionPosition] = useState(0);

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

  // Filter friends and groups for invite popup
  const filteredInviteFriends = useMemo(() => {
    if (!planInviteSearchQuery.trim()) {
      return FRIENDS;
    }
    const query = planInviteSearchQuery.trim().toLowerCase();
    return FRIENDS.filter(friend =>
      friend.name.toLowerCase().includes(query),
    );
  }, [planInviteSearchQuery]);

  const filteredInviteGroups = useMemo(() => {
    // Only show groups when search query matches a group name
    if (!planInviteSearchQuery.trim()) {
      return [];
    }
    const query = planInviteSearchQuery.trim().toLowerCase();
    return groups.filter(
      group =>
        group.name.toLowerCase().includes(query) ||
        group.members.some(member => member.name.toLowerCase().includes(query)),
    );
  }, [planInviteSearchQuery, groups]);

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
        const haystack = `${gym.name} ${gym.city ?? ''} ${gym.brand ?? ''} ${gym.address ?? ''}`
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
        const haystack = `${gym.name} ${gym.city ?? ''} ${gym.brand ?? ''} ${gym.address ?? ''}`
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
    
    // Save PR to profile
    const weight = parseFloat(prWeight.trim());
    if (isNaN(weight) || weight <= 0) {
      Alert.alert('Ugyldig vægt', 'Indtast venligst en gyldig vægt.');
      return;
    }
    
    // Map PR option to ExerciseType
    const exerciseMap: Record<PrOption, string> = {
      'Bænk': 'Bænkpres',
      'Bicepcurl': 'Bicepcurl',
      'Benpres': 'Benpres',
      'Dødløft': 'Dødløft',
      'Squat': 'Squads',
    };
    
    const exerciseType = exerciseMap[selectedPr] as any;
    
    addPR({
      exercise: exerciseType,
      weight: weight,
      videoUrl: prVideoAttached ? 'video_placeholder_url' : undefined,
      userId: 'current_user',
    });
    
    Alert.alert('Stærkt!', `${prWeight.trim()} kg i ${selectedPr} sat!`);
    setPrModalVisible(false);
    setPrStep('select');
    setSelectedPr(null);
    setPrWeight('');
    setPrVideoAttached(false);
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
    setPlanInvitedFriends([]); // Reset invited friends when opening modal
    setPlanInviteSectionVisible(false); // Reset invite section visibility
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
      invitedFriends: planInvitedFriends,
      acceptedFriends: [],
    });

    // If friends were invited, send notifications
    if (planInvitedFriends.length > 0) {
      NotificationService.sendWorkoutInvite(
        user?.displayName || 'Din ven',
        resolvedGym,
        formatMuscleSelection(planMuscles),
        planInvitedFriends,
        planId,
        planDateTime,
        planMuscles,
      );
      addPlanInvites(planId, planInvitedFriends);
    }

    // Remove temporary plan if it exists
    const tempPlan = plannedWorkouts.find(p => p.id.startsWith('temp_plan_'));
    if (tempPlan) {
      removePlannedWorkout(tempPlan.id);
    }

    setPlanModalVisible(false);
    setPlanInvitedFriends([]);
    setPlanInviteSectionVisible(false);
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
      return;
    }
    setActiveSession({
      ...pendingSession,
      startTime: Date.now(),
      invitedFriendIds: pendingInviteIds,
    });
    setPendingSession(null);
    setPendingInviteIds([]);
    setInviteModalVisible(false);
    setInviteContext(null);
    setSessionPhotoUri(null);
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
      const plan = getPlanForInvites();
      // If it's a temp plan (from plan modal), use planInvitedFriends state
      if (plan && plan.id.startsWith('temp_plan_')) {
        return planInvitedFriends;
      }
      return plan?.invitedFriends ?? [];
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
      
      // If it's a temp plan (from plan modal), update planInvitedFriends state
      if (plan.id.startsWith('temp_plan_')) {
        setPlanInvitedFriends(prev => [
          ...prev,
          ...friendIds.filter(id => !prev.includes(id)),
        ]);
      } else {
        // Regular plan - send notifications and update store
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
    }
  };

  const uninviteFriendsByIds = (friendIds: string[]) => {
    if (friendIds.length === 0) {
      return;
    }
    if (inviteContext === 'pending') {
      setPendingInviteIds(prev => prev.filter(id => !friendIds.includes(id)));
    } else if (inviteContext === 'active') {
      setActiveSession(prev =>
        prev
          ? {
              ...prev,
              invitedFriendIds: prev.invitedFriendIds.filter(id => !friendIds.includes(id)),
            }
          : prev,
      );
    } else if (inviteContext === 'plan') {
      const plan = getPlanForInvites();
      if (!plan) {
        return;
      }
      
      // If it's a temp plan (from plan modal), update planInvitedFriends state
      if (plan.id.startsWith('temp_plan_')) {
        setPlanInvitedFriends(prev => prev.filter(id => !friendIds.includes(id)));
      } else {
        // Regular plan - update store
        removePlanInvites(plan.id, friendIds);
      }
    }
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

  const captureWorkoutPhoto = useCallback(
    async (options?: {onSuccess?: (uri: string) => void; silent?: boolean}) => {
      try {
        const cameraOptions: CameraOptions = {
          mediaType: 'photo',
          cameraType: 'back',
          saveToPhotos: true,
          quality: 0.8,
        };
        const response = await launchCamera(cameraOptions);
        if (response.didCancel) {
      return;
    }
        if (response.errorCode) {
          Alert.alert('Kamera fejl', response.errorMessage || 'Kunne ikke åbne kameraet.');
          return;
        }
        const asset = response.assets && response.assets[0];
        if (asset?.uri) {
          setSessionPhotoUri(asset.uri);
          if (!options?.silent) {
            Alert.alert('Foto gemt', 'Billedet er gemt til denne træning.');
          }
          options?.onSuccess?.(asset.uri);
        }
      } catch (error) {
        Alert.alert('Kamera fejl', 'Kunne ikke åbne kameraet. Tjek tilladelser og prøv igen.');
      }
    },
    [setSessionPhotoUri],
  );

  const handleCaptureWorkoutPhoto = () => {
    captureWorkoutPhoto();
  };

  const buildWorkoutSummary = (session: ActiveSession, durationMs: number) => {
    const muscleText = formatMuscleSelection(session.muscles);
    const friendCount = session.invitedFriendIds.length;
    const friendText =
      friendCount > 0
        ? ` med ${friendCount} ${friendCount === 1 ? 'ven' : 'venner'}, hvis de accepterer invitationen`
        : '';
    return `Godt gået, du trænede ${muscleText} i ${formatGymDisplayName(
      session.gym,
    )} i ${formatDuration(durationMs)}${friendText}. Godt klaret! 💪`;
  };

  const resetAfterCompletion = () => {
          setActiveSession(null);
          setInviteModalVisible(false);
          setInviteContext(null);
          setPendingInviteIds([]);
          setPendingSession(null);
    setSessionPhotoUri(null);
  };

  const finalizeWorkout = (
    session: ActiveSession,
    summary: string,
    durationMs: number,
    photoUri?: string | null,
  ) => {
    addCompletedWorkout({
      id: `history_${Date.now()}`,
      gym: session.gym,
      muscles: session.muscles,
      durationMs,
      completedAt: new Date(),
      invitedFriends: session.invitedFriendIds,
      acceptedFriends: [],
      photoUri: photoUri ?? undefined,
    });
    setActiveSession(null);
    resetAfterCompletion();
  };

  const publishWorkoutToFeed = (
    summary: string,
    photoUri?: string | null,
    workoutInfo?: string,
    rating?: number | null,
    mentionedUsers?: string[],
    muscles?: MuscleGroup[],
  ) => {
    const feedUserName = user?.displayName || user?.username || 'Du';
    const validRating = rating && rating >= 1 && rating <= 5 ? rating : undefined;
    console.log('Adding feed item with rating:', validRating, 'mentionedUsers:', mentionedUsers);
    
    // Send notifications to mentioned users
    if (mentionedUsers && mentionedUsers.length > 0) {
      mentionedUsers.forEach(friendId => {
        const friend = FRIENDS.find(f => f.id === friendId);
        if (friend) {
          NotificationService.sendMentionNotification(
            feedUserName,
            friend.name,
            summary || workoutInfo || 'en træning'
          );
        }
      });
    }
    
    addFeedItem({
      id: `feed_${Date.now()}`,
      type: photoUri ? 'photo' : 'summary',
      user: feedUserName,
      description: summary,
      timestamp: 'Lige nu',
      photoUri: photoUri ?? undefined,
      workoutInfo: workoutInfo,
      rating: validRating,
      mentionedUsers: mentionedUsers,
      muscles,
    });
  };

  const openShareComposer = (
    session: ActiveSession,
    summary: string,
    durationMs: number,
    photoUri?: string | null,
  ) => {
    console.log('openShareComposer called', {session, summary, durationMs, photoUri});
    // Build default message with: Location, who participated, muscle groups & time
    const location = formatGymDisplayName(session.gym);
    const muscleGroups = formatMuscleSelection(session.muscles);
    const time = formatDuration(durationMs);
    
    // Get names of friends who participated (invited friends)
    const participantNames = session.invitedFriendIds
      .map(id => FRIENDS.find(f => f.id === id)?.name)
      .filter((name): name is string => name !== undefined);
    
    let participantsText = '';
    if (participantNames.length > 0) {
      if (participantNames.length === 1) {
        participantsText = ` med ${participantNames[0]}`;
      } else if (participantNames.length === 2) {
        participantsText = ` med ${participantNames[0]} og ${participantNames[1]}`;
      } else {
        participantsText = ` med ${participantNames.slice(0, -1).join(', ')} og ${participantNames[participantNames.length - 1]}`;
      }
    }
    
    const defaultMessage = `${location}${participantsText} • ${muscleGroups} • ${time}`;
    
    // Set shareMessage to empty and use defaultMessage as fallback in submitShareComposer
    setShareMessage('');
    setShareContext({session, summary: defaultMessage, durationMs, photoUri});
    console.log('Setting shareComposerVisible to true');
    setShareComposerVisible(true);
    console.log('shareComposerVisible set to true');
  };

  const submitShareComposer = () => {
    if (!shareContext) {
      return;
    }
    // User's text goes in description, workout info goes separately
    const userText = shareMessage.trim();
    const feedMessage = userText.length > 0 ? userText : undefined; // Only include if user wrote something
    
    // Extract mentioned users from shareMessage
    const mentionedUserIds: string[] = [];
    if (shareMessage) {
      const mentionRegex = /@(\w+)/g;
      let match;
      const processedNames = new Set<string>();
      while ((match = mentionRegex.exec(shareMessage)) !== null) {
        const mentionedName = match[1];
        if (!processedNames.has(mentionedName)) {
          processedNames.add(mentionedName);
          const friend = FRIENDS.find(f => f.name === mentionedName);
          if (friend) {
            mentionedUserIds.push(friend.id);
          }
        }
      }
    }
    
    // Workout info (location, participants, muscle groups, time) goes in workoutInfo field
    console.log('Publishing workout with rating:', shareRating, 'mentionedUsers:', mentionedUserIds);
    publishWorkoutToFeed(
      feedMessage || '',
      shareContext.photoUri,
      shareContext.summary,
      shareRating,
      mentionedUserIds,
      shareContext.session.muscles,
    );
    finalizeWorkout(shareContext.session, shareContext.summary, shareContext.durationMs, shareContext.photoUri);
    setShareComposerVisible(false);
    setShareContext(null);
    setShareMessage('');
    setShareVisibility('everyone');
    setShareRating(null);
    setSharePrivateNotes('');
    
    // Show Gymly popup with splash effect after modal is closed
    setTimeout(() => {
      setGymlyPopupVisible(true);
      gymlyPopupOpacity.setValue(0);
      gymlyTextOpacity.setValue(0);
      gymlyLogoScale.setValue(0);
      gymlyLogoOpacity.setValue(0);
      
      // Animate text first
      Animated.timing(gymlyTextOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
      
      // Animate logo after delay
      setTimeout(() => {
        Animated.parallel([
          Animated.spring(gymlyLogoScale, {
            toValue: 1,
            tension: 40,
            friction: 6,
            useNativeDriver: true,
          }),
          Animated.timing(gymlyLogoOpacity, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ]).start();
      }, 200);
      
      // Fade out after delay
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(gymlyTextOpacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(gymlyLogoOpacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(gymlyLogoScale, {
            toValue: 0.8,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start(() => {
          setGymlyPopupVisible(false);
        });
      }, 2000);
    }, 300); // Small delay to ensure modal is fully closed
  };

  const cancelShareComposer = () => {
    setShareComposerVisible(false);
    setShareContext(null);
    setShareMessage('');
    setShareVisibility('everyone');
    setShareRating(null);
    setSharePrivateNotes('');
  };

  const promptShareOptions = (session: ActiveSession, summary: string, durationMs: number) => {
    // Open share composer directly with sessionPhotoUri if it exists
    openShareComposer(session, summary, durationMs, sessionPhotoUri || undefined);
  };

  const handleFinishWorkout = () => {
    console.log('handleFinishWorkout called', {activeSession, elapsedTime});
    if (!activeSession) {
      Alert.alert('Fejl', 'Ingen aktiv session fundet');
      return;
    }
    
    const session = activeSession;
    const durationMs = elapsedTime || (Date.now() - session.startTime);
    const summary = buildWorkoutSummary(session, durationMs);
    console.log('Opening share composer', {session, summary, durationMs, sessionPhotoUri});
    
    // Build context first - this MUST be set before showing modal
    const location = formatGymDisplayName(session.gym);
    const muscleGroups = formatMuscleSelection(session.muscles);
    const time = formatDuration(durationMs);
    
    // Get names of friends who participated (invited friends)
    const participantNames = session.invitedFriendIds
      .map(id => FRIENDS.find(f => f.id === id)?.name)
      .filter((name): name is string => name !== undefined);
    
    let participantsText = '';
    if (participantNames.length > 0) {
      if (participantNames.length === 1) {
        participantsText = ` med ${participantNames[0]}`;
      } else if (participantNames.length === 2) {
        participantsText = ` med ${participantNames[0]} og ${participantNames[1]}`;
      } else {
        participantsText = ` med ${participantNames.slice(0, -1).join(', ')} og ${participantNames[participantNames.length - 1]}`;
      }
    }
    
    const defaultMessage = `${location}${participantsText} • ${muscleGroups} • ${time}`;
    
    // Set all state - MUST set shareContext BEFORE shareComposerVisible
    setShareMessage('');
    setShareContext({
      session, 
      summary: defaultMessage, 
      durationMs, 
      photoUri: sessionPhotoUri || undefined
    });
    
    // Use requestAnimationFrame to ensure state is set before showing modal
    requestAnimationFrame(() => {
      setShareComposerVisible(true);
      console.log('Modal should now be visible');
    });
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

    // If already checking in or already active, don't do anything
    if (pendingSession || activeSession) {
      return true;
    }

    // Show Gymly popup with splash effect
    setGymlyPopupVisible(true);
    gymlyPopupOpacity.setValue(0);
    gymlyTextOpacity.setValue(0);
    gymlyLogoScale.setValue(0);
    gymlyLogoOpacity.setValue(0);
    
    // Animate text first
    Animated.timing(gymlyTextOpacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
    
    // Animate logo immediately after text starts (shorter delay)
    setTimeout(() => {
      Animated.parallel([
        Animated.spring(gymlyLogoScale, {
          toValue: 1,
          tension: 50,
          friction: 5,
          useNativeDriver: true,
        }),
        Animated.timing(gymlyLogoOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    }, 100);
    
    // Fade out after delay
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(gymlyTextOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(gymlyLogoOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(gymlyLogoScale, {
          toValue: 0.8,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setGymlyPopupVisible(false);
      });
    }, 2000);

    const newPendingSession = {
      gym: detectedGym,
      muscles: selectedMuscles,
    };
    
    setPendingSession(newPendingSession);
    setPendingInviteIds([]);
    
    // Show toast message
    // Auto-activate session after 1 second
    setTimeout(() => {
      // Use the latest pendingSession state
      setActiveSession({
        ...newPendingSession,
        startTime: Date.now(),
        invitedFriendIds: [],
      });
      setPendingSession(null);
    setPendingInviteIds([]);
      setInviteModalVisible(false);
      setInviteContext(null);
      setSessionPhotoUri(null);
    }, 1000);
    
    return true;
  }, [detectedGym, selectedMuscles, pendingSession, activeSession]);

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
      <View 
        style={styles.content}>
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
              style={styles.photoButton}
              onPress={handleCaptureWorkoutPhoto}
              activeOpacity={0.9}>
              <Ionicons name="camera-outline" size={20} color="#0F172A" style={{marginRight: 8}} />
              <Text style={styles.photoButtonText}>
                {sessionPhotoUri ? 'Tag nyt billede fra træning' : 'Tag billede fra træning'}
              </Text>
            </TouchableOpacity>
            {sessionPhotoUri && (
              <Text style={styles.photoSavedHint}>Foto gemt – bliver foreslået når du deler.</Text>
            )}
          </>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.card, styles.smallerCard, styles.topCardSpacing]}
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
                <View style={[
                  styles.detectionIcon,
                  ((detectedGym && hasGymLogo(detectedGym.brand)) || 
                   (primaryGym && !detectedGym && hasGymLogo(primaryGym.brand))) && styles.detectionIconWithLogo
                ]}>
                  {(detectedGym && hasGymLogo(detectedGym.brand) && getGymLogo(detectedGym.brand)) ||
                   (primaryGym && !detectedGym && hasGymLogo(primaryGym.brand) && getGymLogo(primaryGym.brand)) ? (
                    <Image
                      source={{uri: (detectedGym && getGymLogo(detectedGym.brand)) || 
                                (primaryGym && getGymLogo(primaryGym.brand)) || ''}}
                      style={styles.detectionGymLogo}
                      resizeMode="contain"
                    />
                  ) : (
                    <Ionicons name="location-outline" size={22} color={colors.primary} />
                  )}
                </View>
                <View style={styles.detectionInfo}>
                  <Text style={styles.detectionTitle}>{detectionMessage()}</Text>
                  {detectionStatus === 'searching' && (
                    <ActivityIndicator size="small" color={colors.primary} style={{marginTop: 6}} />
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

            <View style={[styles.card, styles.flexCard, styles.muscleCardSection]}>
              <View style={styles.muscleGrid}>
                {MUSCLE_GROUPS.map(item => {
                  const isActive = selectedMuscles.includes(item.key);
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[styles.muscleCard, isActive && styles.muscleCardActive]}
                      onPress={() => toggleMuscleGroup(item.key)}
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
              <View style={styles.soloSection}>
                <View style={styles.soloToggleRow}>
                  <Text style={styles.soloToggleLabel}>Solo træning</Text>
                  <TouchableOpacity
                    style={[styles.soloToggle, soloTraining && styles.soloToggleActive]}
                    onPress={() => setSoloTraining(prev => !prev)}
                    activeOpacity={0.8}>
                    <Animated.View
                      style={[
                        styles.soloToggleThumb,
                        soloTraining && styles.soloToggleThumbActive,
                      ]}
                    />
                  </TouchableOpacity>
                </View>
                <Text style={styles.soloToggleHint}>Skjul venneforslag for denne session.</Text>
              </View>
            </View>

            <View style={[styles.card, styles.smallerCard, styles.sliderCardSpacing]}>
              <View style={[styles.sliderTrack, styles.sliderTrackCompact]} onLayout={handleLayout}>
                <Animated.Text style={[styles.sliderText, {opacity: sliderTextOpacity}]}>
                  Tjek ind
                </Animated.Text>
                <Animated.View
                  style={[
                    styles.sliderKnob,
                    soloTraining && styles.sliderKnobActive,
                    {
                      transform: [{translateX: sliderAnim}],
                    },
                  ]}
                  {...panResponder.panHandlers}>
                  <Ionicons name="arrow-forward" size={20} color="#fff" />
                </Animated.View>
              </View>
            </View>
          </>
        )}
      </View>

      {/* Finish button absolutely positioned at bottom to avoid touch issues */}
      {activeSession && (
        <View style={styles.finishButtonContainer} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.finishButton}
            onPress={() => {
              console.log('Finish button onPress triggered!');
              if (!activeSession) {
                Alert.alert('Debug', 'Ingen activeSession');
                return;
              }
              handleFinishWorkout();
            }}
            activeOpacity={0.9}
            hitSlop={{top: 15, bottom: 15, left: 15, right: 15}}>
            <Text style={styles.finishButtonText}>Afslut træning</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Gymly Popup Modal */}
      <Modal visible={gymlyPopupVisible} transparent animationType="fade">
        <View style={styles.gymlyPopupOverlay}>
          <View style={styles.gymlyPopupContent}>
            <Animated.Text style={[styles.gymlyPopupText, {opacity: gymlyTextOpacity}]}>
              Gymly
            </Animated.Text>
            <Animated.View
              style={{
                transform: [{scale: gymlyLogoScale}],
                opacity: gymlyLogoOpacity,
              }}>
              <GymlyLogo size={300} />
            </Animated.View>
          </View>
        </View>
      </Modal>

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
          <TouchableWithoutFeedback
            onPress={() => {
              // Remove temp plan if it exists
              const tempPlan = plannedWorkouts.find(p => p.id.startsWith('temp_plan_'));
              if (tempPlan) {
                removePlannedWorkout(tempPlan.id);
              }
              setPlanInvitedFriends([]);
              setPlanInviteSectionVisible(false);
              setPlanModalVisible(false);
            }}>
            <View style={styles.modalBackdrop} />
          </TouchableWithoutFeedback>

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
                            filteredInviteFriends.filter(f => !planInvitedFriends.includes(f.id)).length === 0 &&
                              styles.inviteAllButtonDisabled,
                          ]}
                          onPress={() => {
                            const notInvited = filteredInviteFriends.filter(f => !planInvitedFriends.includes(f.id));
                            if (notInvited.length === 0) return;
                            setPlanInvitedFriends(prev => [...prev, ...notInvited.map(f => f.id)]);
                          }}
                          disabled={filteredInviteFriends.filter(f => !planInvitedFriends.includes(f.id)).length === 0}>
                          <Text
                            style={[
                              styles.inviteAllText,
                              filteredInviteFriends.filter(f => !planInvitedFriends.includes(f.id)).length === 0 &&
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
                          {filteredInviteFriends.length > 0 && (
                            <View style={styles.planInviteSection}>
                              <Text style={styles.planInviteSectionTitle}>Venner</Text>
                              {filteredInviteFriends.map(friend => {
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

                          {/* Groups List */}
                          {filteredInviteGroups.length > 0 && (
                            <View style={styles.planInviteSection}>
                              <Text style={styles.planInviteSectionTitle}>Grupper</Text>
                              {filteredInviteGroups.map(group => {
                                const groupMemberIds = group.members
                                  .filter(m => m.id !== 'current_user')
                                  .map(m => m.id);
                                const allInvited = groupMemberIds.every(id => planInvitedFriends.includes(id));
                                const someInvited = groupMemberIds.some(id => planInvitedFriends.includes(id));
                                
                                return (
                                  <View key={group.id} style={styles.friendRow}>
                                    <View style={styles.friendInfoWrapper}>
                                      {group.image ? (
                                        <Image source={{uri: group.image}} style={styles.groupAvatar} />
                                      ) : (
                                        <View style={styles.groupAvatarPlaceholder}>
                                          <Ionicons name="people" size={20} color={colors.textTertiary} />
                                        </View>
                                      )}
                                      <View style={styles.friendDetails}>
                                        <Text style={styles.friendName}>{group.name}</Text>
                                        <Text style={styles.groupMembersText}>
                                          {group.members.filter(m => m.id !== 'current_user').length} medlemmer
                                        </Text>
                                      </View>
                                    </View>
                                    <TouchableOpacity
                                      style={[
                                        styles.invitePill,
                                        allInvited && styles.invitePillDisabled,
                                      ]}
                                      onPress={() => {
                                        if (allInvited) {
                                          // Remove all group members
                                          setPlanInvitedFriends(prev => prev.filter(id => !groupMemberIds.includes(id)));
                                        } else {
                                          // Add all group members
                                          setPlanInvitedFriends(prev => {
                                            const newIds = groupMemberIds.filter(id => !prev.includes(id));
                                            return [...prev, ...newIds];
                                          });
                                        }
                                      }}>
                                      <Text
                                        style={[
                                          styles.invitePillText,
                                          allInvited && styles.invitePillTextDisabled,
                                        ]}>
                                        {allInvited ? 'Inviteret' : someInvited ? 'Delvist' : 'Inviter'}
                                      </Text>
                                    </TouchableOpacity>
                                  </View>
                                );
                              })}
                            </View>
                          )}

                          {/* Empty state */}
                          {planInviteSearchQuery.trim().length > 0 && filteredInviteFriends.length === 0 && filteredInviteGroups.length === 0 && (
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
                  <View style={styles.soloToggleRow}>
                    <Text style={styles.soloToggleLabel}>Solo træning</Text>
                    <TouchableOpacity
                      style={[styles.soloToggle, planSoloTraining && styles.soloToggleActive]}
                      onPress={() => setPlanSoloTraining(prev => !prev)}
                      activeOpacity={0.8}>
                      <Animated.View
                        style={[
                          styles.soloToggleThumb,
                          planSoloTraining && styles.soloToggleThumbActive,
                        ]}
                      />
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.soloToggleHint, {marginBottom: 16}]}>
                    Planlæg som privat session.
                  </Text>

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
                  // Remove temp plan if it exists
                  const tempPlan = plannedWorkouts.find(p => p.id.startsWith('temp_plan_'));
                  if (tempPlan) {
                    removePlannedWorkout(tempPlan.id);
                  }
                  setPlanInvitedFriends([]);
                  setPlanInviteSectionVisible(false);
                  setPlanModalVisible(false);
                }}>
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

      <Modal 
        visible={shareComposerVisible} 
        transparent 
        animationType="fade" 
        onRequestClose={cancelShareComposer}
        statusBarTranslucent
        onShow={() => {
          console.log('Modal onShow triggered!');
        }}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={cancelShareComposer}>
            <View style={[StyleSheet.absoluteFill, {backgroundColor: 'rgba(0,0,0,0.5)'}]} />
          </TouchableWithoutFeedback>
          <View 
            style={[styles.shareModalCard, {
              backgroundColor: '#231B3D', 
              width: '90%', 
              minHeight: 400, 
              maxWidth: 500, 
              alignSelf: 'center',
            }]} 
            pointerEvents="box-none"
            onStartShouldSetResponder={() => true}>
            <ScrollView 
                  style={{flex: 1, width: '100%'}}
                  contentContainerStyle={[
                    {
                      padding: 24,
                      alignItems: 'stretch',
                      flexGrow: 1,
                    },
                    styles.shareModalContent,
                  ]}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={true}
                  bounces={true}
                  nestedScrollEnabled={true}
                  scrollEnabled={true}
                  alwaysBounceVertical={false}>
                <Text style={styles.modalTitle}>Del træning</Text>
                
                {/* Description */}
                <Text style={[styles.shareSectionLabel, {color: '#FFFFFF'}]}>Beskrivelse</Text>
                <View style={styles.shareInputContainer}>
                  <TextInput
                    style={styles.shareInput}
                    multiline
                    numberOfLines={4}
                    value={shareMessage}
                    placeholderTextColor={colors.textTertiary}
                    onChangeText={(text) => {
                      setShareMessage(text);
                      // Check for @ mentions
                      const lastAtIndex = text.lastIndexOf('@');
                      if (lastAtIndex !== -1) {
                        const afterAt = text.substring(lastAtIndex + 1);
                        const spaceIndex = afterAt.indexOf(' ');
                        const newlineIndex = afterAt.indexOf('\n');
                        const endIndex = spaceIndex !== -1 && newlineIndex !== -1 
                          ? Math.min(spaceIndex, newlineIndex)
                          : spaceIndex !== -1 
                            ? spaceIndex 
                            : newlineIndex !== -1 
                              ? newlineIndex 
                              : -1;
                        if (endIndex === -1) {
                          // Still typing the mention
                          setMentionQuery(afterAt.toLowerCase());
                          setShowMentions(true);
                          setMentionPosition(lastAtIndex);
                        } else {
                          setShowMentions(false);
                          setMentionQuery('');
                        }
                      } else {
                        setShowMentions(false);
                        setMentionQuery('');
                      }
                    }}
                    placeholder="Hvordan gik træningen? Brug @ for at tagge dine træningsbuddies"
                    textAlignVertical="top"
                  />
                  {showMentions && mentionQuery.length > 0 && (
                    <View style={styles.mentionDropdown}>
                      {FRIENDS.filter(friend => 
                        friend.name.toLowerCase().includes(mentionQuery)
                      )
                      .slice(0, 3)
                      .map(friend => (
                        <TouchableOpacity
                          key={friend.id}
                          style={styles.mentionItem}
                          onPress={() => {
                            const beforeAt = shareMessage.substring(0, mentionPosition);
                            const afterMention = shareMessage.substring(mentionPosition + 1 + mentionQuery.length);
                            const newText = `${beforeAt}@${friend.name} ${afterMention}`;
                            setShareMessage(newText);
                            setShowMentions(false);
                            setMentionQuery('');
                          }}>
                          <View style={styles.mentionAvatar}>
                            <Text style={styles.mentionAvatarText}>{friend.initials}</Text>
            </View>
                          <Text style={styles.mentionName}>{friend.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
                
                {/* Photo Section */}
                <Text style={styles.shareSectionLabel}>Billeder</Text>
                <View style={styles.sharePhotoSection}>
                  {shareContext?.photoUri ? (
                    <View style={styles.sharePhotoPreviewContainer}>
                      <Image source={{uri: shareContext.photoUri}} style={styles.sharePhotoPreview} />
                      <TouchableOpacity
                        style={styles.sharePhotoRemoveButton}
                        onPress={() => {
                          if (shareContext) {
                            setShareContext({...shareContext, photoUri: null});
                          }
                        }}>
                        <Ionicons name="close-circle" size={24} color="#fff" />
              </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.sharePhotoAddButton}
                      onPress={() => {
                        if (shareContext) {
                          captureWorkoutPhoto({
                            onSuccess: uri => {
                              setShareContext({...shareContext, photoUri: uri});
                            },
                          });
                        }
                      }}>
                      <Ionicons name="camera-outline" size={32} color={colors.secondary} />
                      <Text style={styles.sharePhotoAddText}>Tilføj billede</Text>
              </TouchableOpacity>
                  )}
                  {shareContext?.photoUri && (
                    <TouchableOpacity
                      style={styles.sharePhotoChangeButton}
                      onPress={() => {
                        if (shareContext) {
                          captureWorkoutPhoto({
                            onSuccess: uri => {
                              setShareContext({...shareContext, photoUri: uri});
                            },
                          });
                        }
                      }}>
                      <Ionicons name="camera-outline" size={20} color={colors.text} />
                      <Text style={styles.sharePhotoChangeText}>Tag nyt billede</Text>
                    </TouchableOpacity>
                  )}
            </View>
                
                {/* Visibility */}
                <Text style={styles.shareSectionLabel}>Synlighed</Text>
                <TouchableOpacity
                  style={styles.shareVisibilityButton}
                  onPress={() => {
                    Alert.alert(
                      'Vælg synlighed',
                      '',
                      [
                        {text: 'Alle', onPress: () => setShareVisibility('everyone')},
                        {text: 'Kun venner og følgere', onPress: () => setShareVisibility('friends')},
                        {text: 'Privat', onPress: () => setShareVisibility('private')},
                        {text: 'Annuller', style: 'cancel'},
                      ],
                    );
                  }}>
                  <Ionicons 
                    name={shareVisibility === 'everyone' ? 'globe-outline' : shareVisibility === 'friends' ? 'people-outline' : 'lock-closed-outline'} 
                    size={20} 
                    color={colors.text} 
                    style={{marginRight: 8}} 
                  />
                  <Text style={styles.shareVisibilityText}>
                    {shareVisibility === 'everyone' ? 'Alle' : shareVisibility === 'friends' ? 'Kun venner og følgere' : 'Privat'}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color={colors.textTertiary} style={{marginLeft: 'auto'}} />
                </TouchableOpacity>
                
                {/* Rating */}
                <Text style={styles.shareSectionLabel}>Hvordan var din træning?</Text>
                <View style={styles.shareRatingContainer}>
                  {[1, 2, 3, 4, 5].map((rating) => {
                    const emojis = ['☹️', '🙁', '😐', '😁', '🤩'];
                    return (
                      <TouchableOpacity
                        key={rating}
                        style={[
                          styles.shareRatingButton,
                          shareRating === rating && styles.shareRatingButtonSelected,
                        ]}
                        onPress={() => setShareRating(shareRating === rating ? null : rating)}>
                        <Text style={styles.shareRatingEmoji}>{emojis[rating - 1]}</Text>
                      </TouchableOpacity>
                    );
                  })}
          </View>
                
                {/* Private Notes */}
                <Text style={styles.shareSectionLabel}>Private noter</Text>
                <View style={styles.sharePrivateNotesContainer}>
                  <Ionicons name="lock-closed-outline" size={18} color={colors.textTertiary} style={{marginRight: 8}} />
                  <TextInput
                    style={styles.sharePrivateNotesInput}
                    multiline
                    numberOfLines={3}
                    value={sharePrivateNotes}
                    onChangeText={setSharePrivateNotes}
                    placeholder="Skriv private noter her. Kun du kan se disse."
                    placeholderTextColor={colors.textTertiary}
                    textAlignVertical="top"
                  />
                </View>
                
                <View style={styles.shareButtonRow}>
                  <TouchableOpacity style={styles.secondaryButton} onPress={cancelShareComposer}>
                    <Text style={styles.secondaryButtonText}>Annuller</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.primaryButton} onPress={submitShareComposer}>
                    <Text style={styles.primaryButtonText}>Del træning</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Check-in toast notification */}
      {checkInToast.visible && (
        <View style={styles.checkInToast}>
          <Text style={styles.checkInToastText}>{checkInToast.message}</Text>
        </View>
      )}

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
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    padding: 12,
    paddingBottom: 12,
    justifyContent: 'space-between',
  },
  card: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 2,
  },
  smallerCard: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  topCardSpacing: {
    marginBottom: 6,
  },
  flexCard: {
    flex: 1,
    paddingBottom: 12,
  },
  muscleCardSection: {
    // Lille mellemrum ned til "Tjek ind"-slideren
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  detectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  detectionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detectionIconWithLogo: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detectionGymLogo: {
    width: 32,
    height: 32,
  },
  detectionInfo: {
    flex: 1,
  },
  detectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  detectionHint: {
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: 4,
  },
  detectionDistance: {
    fontSize: 12,
    color: colors.secondary,
    marginTop: 2,
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
  soloToggleRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  soloToggleLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  soloToggle: {
    width: 48,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surface,
    padding: 3,
    justifyContent: 'center',
  },
  soloToggleActive: {
    backgroundColor: colors.primaryLight,
  },
  soloToggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.backgroundCard,
    alignSelf: 'flex-start',
  },
  soloToggleThumbActive: {
    backgroundColor: colors.primary,
    alignSelf: 'flex-end',
  },
  soloToggleHint: {
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: 2,
  },
  soloSection: {
    marginTop: 4,
    paddingTop: 8,
  },
  sliderCardSpacing: {
    marginTop: 0,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardSmallTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  planButton: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  planButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  sliderTrack: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 30,
    paddingVertical: 10,
    position: 'relative',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sliderTrackCompact: {
    paddingVertical: 6,
  },
  sliderText: {
    position: 'absolute',
    alignSelf: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: '#4C4F6B',
  },
  sliderKnob: {
    width: SLIDER_KNOB_SIZE,
    height: SLIDER_KNOB_SIZE,
    borderRadius: SLIDER_KNOB_SIZE / 2,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  sliderKnobActive: {
    backgroundColor: colors.primary,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 9999,
    elevation: 9999,
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
    color: colors.text,
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
    backgroundColor: colors.background,
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
    borderColor: colors.border,
  },
  manualItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  manualItemSubtitle: {
    fontSize: 13,
    color: colors.textTertiary,
    marginTop: 2,
  },
  emptyState: {
    padding: 16,
    fontSize: 14,
    textAlign: 'center',
    color: colors.textTertiary,
  },
  modalClose: {
    marginTop: 20,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  modalCloseText: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '600',
  },
  prOptionButton: {
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  prOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  prInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
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
    color: colors.text,
  },
  videoButtonTextAttached: {
    color: '#15803D',
  },
  prSubmitButton: {
    width: '100%',
    backgroundColor: colors.secondary,
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
    backgroundColor: colors.secondary,
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
    backgroundColor: colors.backgroundCard,
  },
  secondaryButtonText: {
    color: colors.secondary,
    fontSize: 16,
    fontWeight: '600',
  },
  activeTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  activeSubtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  activeInfo: {
    marginTop: 12,
    fontSize: 14,
    color: colors.secondary,
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
    color: colors.text,
    marginLeft: 6,
  },
  inviteFriendsButton: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  inviteFriendsText: {
    fontSize: 16,
    color: colors.secondary,
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
  photoButton: {
    marginTop: 12,
    backgroundColor: '#DBEAFE',
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  photoButtonText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
    marginLeft: 8,
  },
  photoSavedHint: {
    marginTop: 6,
    fontSize: 13,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  finishButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 12,
    backgroundColor: colors.background,
    zIndex: 9999,
    elevation: 9999,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: -2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  finishButton: {
    backgroundColor: '#0F172A',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    zIndex: 10000,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    minHeight: 50,
    width: '100%',
  },
  finishButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  gymlyPopupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gymlyPopupContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  gymlyPopupText: {
    marginBottom: 20,
    fontSize: 52,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 6,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-condensed',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: {width: 0, height: 3},
    textShadowRadius: 10,
    textTransform: 'uppercase',
  },
  friendModal: {
    alignItems: 'stretch',
    maxHeight: '80%',
  },
  prModalCard: {
    alignItems: 'stretch',
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
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
  },
  inviteAllTextDisabled: {
    color: colors.textTertiary,
  },
  friendList: {
    flexGrow: 0,
    marginBottom: 12,
  },
  shareModalCard: {
    maxHeight: '90%',
    width: '90%',
    backgroundColor: colors.backgroundCard,
    borderRadius: 24,
    overflow: 'hidden',
    zIndex: 10000,
    elevation: 10000,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  shareModalContent: {
    paddingBottom: 24,
    alignItems: 'stretch',
  },
  shareSectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginTop: 20,
    marginBottom: 8,
  },
  sharePhotoSection: {
    marginTop: 8,
    marginBottom: 8,
  },
  sharePhotoPreviewContainer: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
  },
  sharePhotoPreview: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  sharePhotoRemoveButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
  },
  sharePhotoAddButton: {
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  sharePhotoAddText: {
    marginTop: 8,
    fontSize: 14,
    color: colors.secondary,
    fontWeight: '600',
  },
  sharePhotoChangeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginTop: 4,
  },
  sharePhotoChangeText: {
    marginLeft: 6,
    fontSize: 14,
    color: colors.text,
  },
  shareVisibilityButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    backgroundColor: colors.background,
  },
  shareVisibilityText: {
    fontSize: 15,
    color: colors.text,
    flex: 1,
  },
  shareRatingContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 8,
  },
  shareRatingButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: colors.border,
  },
  shareRatingButtonSelected: {
    borderColor: colors.secondary,
    backgroundColor: colors.surfaceLight || '#E0E7FF',
  },
  shareRatingEmoji: {
    fontSize: 28,
  },
  sharePrivateNotesContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    backgroundColor: colors.background,
    marginTop: 8,
  },
  sharePrivateNotesInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  shareImagePreview: {
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  shareImagePreviewImage: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  shareInputContainer: {
    position: 'relative',
    marginTop: 8,
  },
  shareInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    minHeight: 100,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.background,
  },
  mentionDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: colors.backgroundCard,
    borderRadius: 12,
    marginTop: 4,
    maxHeight: 200,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  mentionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  mentionAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  mentionAvatarText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  mentionName: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
  },
  shareButtonRow: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
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
  friendAvatarOnline: {
    borderWidth: 2,
    borderColor: '#34D399',
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
  friendStatus: {
    fontSize: 13,
  },
  friendStatusOnline: {
    color: colors.success,
  },
  friendStatusOffline: {
    color: colors.textTertiary,
  },
  invitePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.secondary,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  invitePillDisabled: {
    borderColor: '#94A3B8',
    backgroundColor: colors.surface,
  },
  invitePillText: {
    color: colors.secondary,
    fontWeight: '600',
  },
  invitePillTextDisabled: {
    color: colors.textTertiary,
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
  planInviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
    gap: 8,
  },
  planInviteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.secondary,
  },
  planInviteSection: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: 16,
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
    maxHeight: '75%',
    padding: 20,
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: {width: 0, height: 10},
    elevation: 10,
    flexDirection: 'column',
  },
  planInviteScrollContent: {
    maxHeight: 400,
  },
  planInviteScrollContentContainer: {
    paddingBottom: 8,
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
  planInviteSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
    marginTop: 8,
  },
  planInviteEmpty: {
    padding: 40,
    alignItems: 'center',
  },
  planInviteEmptyText: {
    fontSize: 15,
    color: colors.textTertiary,
  },
  groupAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  groupAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupMembersText: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 2,
  },
  planCenterInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
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
    color: colors.text,
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
  calendarNavButton: {
    padding: 4,
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
    shadowColor: colors.primary,
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
  checkInToast: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    shadowColor: colors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
    elevation: 5,
    zIndex: 1000,
  },
  checkInToastText: {
    color: '#fff',
    fontSize: 15,
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

