import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useFocusEffect, useNavigation, useRoute} from '@react-navigation/native';
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
  TouchableWithoutFeedback,
  ActivityIndicator,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useWorkoutPlanStore, WorkoutPlanEntry, WorkoutHistoryEntry} from '@/store/workoutPlanStore';
import {formatGymDisplayName} from '@/utils/gymDisplay';
import {
  createPlannedSession,
  fetchPlannedWorkoutEntryById,
  loadWorkoutPlanEntriesForUser,
  respondPlannedWorkoutInvite,
} from '@/services/supabase/plannedWorkoutService';
import {markPlannedWorkoutInviteNotificationsRead} from '@/services/notifications/inAppNotificationService';
import {
  isPendingInviteeSession,
  isWorkoutOnUserCalendar,
} from '@/utils/plannedCalendarFilter';
import {
  getPublicProfilesByIds,
  listFriendsWithProfiles,
  type PublicProfile,
} from '@/services/supabase/friendService';
import {
  PlannedParticipantRow,
} from '@/components/planned/PlannedParticipantRow';
import {UserAvatar} from '@/components/ui/UserAvatar';
import {getPlanInviteeResponseStatus} from '@/utils/plannedInviteeStatus';
import {MuscleGroup} from '@/types/workout.types';
import {getActiveDanishGyms, DanishGym} from '@/data/danishGyms';

const SCHEDULE_GYMS = getActiveDanishGyms();
import colors from '@/theme/colors';
import NotificationService from '@/services/notifications/NotificationService';
import {useAppStore} from '@/store/appStore';
import TrainingCenterPicker from '@/components/planned/TrainingCenterPicker';
import PlanSessionCenterPickerSheet from '@/components/planned/PlanSessionCenterPickerSheet';
import TrainingTypeMuscleGrid from '@/components/planned/TrainingTypeMuscleGrid';
import TimePickerSheet from '@/components/ui/TimePickerSheet';
import {useTranslation, useAppFormat} from '@/i18n';

const formatDateKey = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.toISOString();
};

const WorkoutScheduleScreen = () => {
  const route = useRoute<{params?: {openPlannedId?: string; initialTab?: string}}>();
  const navigation = useNavigation();
  const {t, intlLocale} = useTranslation();
  const {weekdayShort, formatMonthYear, formatDateMedium} = useAppFormat();
  const {user} = useAppStore();
  // Brug brugerens valgte biceps; hvis ingen er valgt, brug samme hvide standard som i Profil (💪🏻)
  const rawBicepsEmoji = user?.bicepsEmoji || '💪🏻';
  // Fjern evt. ekstra symboler som hjerter, men bevar hudtone på selve biceps-emoji'en
  const userBicepsEmoji = rawBicepsEmoji.replace(/💛|❤️|♥️/g, '');
  const plannedWorkouts = useWorkoutPlanStore(state => state.plannedWorkouts);
  const completedWorkouts = useWorkoutPlanStore(state => state.completedWorkouts);
  const mergePlannedFromServer = useWorkoutPlanStore(
    state => state.mergePlannedFromServer,
  );
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
  /** Center-sheet uden for ScrollView (undgår nested Modal under scroll på iOS). */
  const [planCenterSheetOpen, setPlanCenterSheetOpen] = useState(false);
  const [planSelectedGym, setPlanSelectedGym] = useState<DanishGym | null>(null);
  const [planCenterQuery, setPlanCenterQuery] = useState('');
  /** Én træningstype pr. session — enkelt og socialt (array bevares for bagudkompatibilitet). */
  const [planMuscle, setPlanMuscle] = useState<MuscleGroup>('bryst');
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

  const [participantProfiles, setParticipantProfiles] = useState<
    Map<string, PublicProfile>
  >(() => new Map());
  const [loadedFriends, setLoadedFriends] = useState<PublicProfile[]>([]);
  const [sessionFriendNames, setSessionFriendNames] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [sessionProfilesById, setSessionProfilesById] = useState<
    Map<string, PublicProfile>
  >(() => new Map());
  const [planSaving, setPlanSaving] = useState(false);
  const [inviteRespondPlanId, setInviteRespondPlanId] = useState<string | null>(
    null,
  );

  const muscleGroupLabel = useCallback(
    (key: MuscleGroup): string => {
      const labels: Record<MuscleGroup, string> = {
        bryst: t('checkIn.muscleChest'),
        triceps: t('checkIn.muscleTriceps'),
        skulder: t('checkIn.muscleShoulder'),
        ben: t('checkIn.muscleLegs'),
        biceps: t('checkIn.muscleBiceps'),
        mave: t('checkIn.muscleAbs'),
        ryg: t('checkIn.muscleBack'),
        cardio: t('checkIn.muscleCardio'),
        reformer: t('checkIn.muscleReformer'),
        pilates: t('checkIn.musclePilates'),
      };
      return labels[key];
    },
    [t],
  );

  const calendarPlans = useMemo(
    () => plannedWorkouts.filter(p => isWorkoutOnUserCalendar(p, user?.id)),
    [plannedWorkouts, user?.id],
  );

  const pendingInvitePlans = useMemo(() => {
    const list = plannedWorkouts.filter(p =>
      isPendingInviteeSession(p, user?.id),
    );
    list.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
    return list;
  }, [plannedWorkouts, user?.id]);

  const refetchPlansFromServer = useCallback(async () => {
    if (!user?.id) {
      return;
    }
    const entries = await loadWorkoutPlanEntriesForUser(user.id, true);
    mergePlannedFromServer(entries);
  }, [user?.id, mergePlannedFromServer]);

  const handleInviteAccept = async (planId: string) => {
    if (!user?.id) {
      return;
    }
    setInviteRespondPlanId(planId);
    try {
      await respondPlannedWorkoutInvite(planId, true);
      await markPlannedWorkoutInviteNotificationsRead(user.id, planId);
      await refetchPlansFromServer();
    } catch (e) {
      Alert.alert(
        t('plannedSessions.couldNotRespond'),
        e instanceof Error ? e.message : t('plannedSessions.tryAgainSoon'),
      );
    } finally {
      setInviteRespondPlanId(null);
    }
  };

  const handleInviteDecline = async (planId: string) => {
    if (!user?.id) {
      return;
    }
    setInviteRespondPlanId(planId);
    try {
      await respondPlannedWorkoutInvite(planId, false);
      await markPlannedWorkoutInviteNotificationsRead(user.id, planId);
      await refetchPlansFromServer();
      if (
        detailModalVisible &&
        selectedWorkout?.type === 'planned' &&
        selectedWorkout.data.id === planId
      ) {
        setDetailModalVisible(false);
        setSelectedWorkout(null);
      }
    } catch (e) {
      Alert.alert(
        t('plannedSessions.couldNotDecline'),
        e instanceof Error ? e.message : t('plannedSessions.tryAgainSoon'),
      );
    } finally {
      setInviteRespondPlanId(null);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) {
        return;
      }
      let alive = true;
      (async () => {
        try {
          const friends = await listFriendsWithProfiles(user.id);
          if (alive) {
            setLoadedFriends(friends);
          }
        } catch {
          if (alive) {
            setLoadedFriends([]);
          }
        }
        try {
          const entries = await loadWorkoutPlanEntriesForUser(user.id, true);
          if (!alive) {
            return;
          }
          mergePlannedFromServer(entries);
        } catch {
          // table/migration
        }
      })();
      return () => {
        alive = false;
      };
    }, [user?.id, mergePlannedFromServer]),
  );

  useEffect(() => {
    if (!planModalVisible) {
      setPlanCenterSheetOpen(false);
    }
  }, [planModalVisible]);

  useEffect(() => {
    const ids = new Set<string>();
    plannedWorkouts.forEach(p => {
      (p.acceptedFriends ?? []).forEach(i => ids.add(i));
      (p.invitedFriends ?? []).forEach(i => ids.add(i));
      if (user?.id && isPendingInviteeSession(p, user.id) && p.creatorUserId) {
        ids.add(p.creatorUserId);
      }
    });
    if (ids.size === 0) {
      setSessionFriendNames(new Map());
      setSessionProfilesById(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const m = await getPublicProfilesByIds([...ids]);
        if (cancelled) {
          return;
        }
        const names = new Map<string, string>();
        m.forEach((profile, id) => {
          names.set(id, profile.displayName || profile.username || 'Ven');
        });
        setSessionFriendNames(names);
        setSessionProfilesById(m);
      } catch {
        if (!cancelled) {
          setSessionFriendNames(new Map());
          setSessionProfilesById(new Map());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plannedWorkouts, user?.id]);

  useEffect(() => {
    if (!detailModalVisible || !selectedWorkout) {
      return;
    }
    const d = selectedWorkout.data;
    const ids = new Set<string>();
    (d.invitedFriends ?? []).forEach(i => ids.add(i));
    (d.acceptedFriends ?? []).forEach(i => ids.add(i));
    if (
      selectedWorkout.type === 'planned' &&
      user?.id &&
      isPendingInviteeSession(d as WorkoutPlanEntry, user.id) &&
      (d as WorkoutPlanEntry).creatorUserId
    ) {
      ids.add((d as WorkoutPlanEntry).creatorUserId!);
    }
    if (ids.size === 0) {
      setParticipantProfiles(new Map());
      return;
    }
    let cancelled = false;
    const loadProfiles = async () => {
      try {
        const m = await getPublicProfilesByIds([...ids]);
        if (!cancelled) {
          setParticipantProfiles(m);
        }
      } catch {
        if (!cancelled) {
          setParticipantProfiles(new Map());
        }
      }
    };
    loadProfiles();
    return () => {
      cancelled = true;
    };
  }, [detailModalVisible, selectedWorkout, user?.id]);

  const openPlannedId = route.params?.openPlannedId;
  const openPlannedHandledRef = useRef<string | null>(null);
  const openPlannedFetchInFlightRef = useRef<string | null>(null);
  const openPlannedFetchFailedRef = useRef<string | null>(null);

  const openPlannedDetailForEntry = useCallback((p: WorkoutPlanEntry, id: string) => {
    const d = new Date(p.scheduledAt);
    d.setHours(0, 0, 0, 0);
    setSelectedDate(d);
    setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    setSelectedWorkout({type: 'planned', data: p});
    setDetailModalVisible(true);
    openPlannedHandledRef.current = id;
  }, []);

  useEffect(() => {
    if (!openPlannedId) {
      openPlannedHandledRef.current = null;
      openPlannedFetchInFlightRef.current = null;
      openPlannedFetchFailedRef.current = null;
      return;
    }
    if (openPlannedFetchFailedRef.current === openPlannedId) {
      return;
    }
    const p = useWorkoutPlanStore.getState().plannedWorkouts.find(w => w.id === openPlannedId);
    if (p) {
      if (openPlannedHandledRef.current !== openPlannedId) {
        openPlannedDetailForEntry(p, openPlannedId);
      }
      return;
    }
    if (openPlannedFetchInFlightRef.current === openPlannedId) {
      return;
    }
    openPlannedFetchInFlightRef.current = openPlannedId;
    let cancelled = false;
    void (async () => {
      try {
        const entry = await fetchPlannedWorkoutEntryById(openPlannedId);
        if (cancelled) {
          return;
        }
        openPlannedFetchInFlightRef.current = null;
        if (entry) {
          mergePlannedFromServer([entry]);
        } else {
          openPlannedFetchFailedRef.current = openPlannedId;
          Alert.alert(
            t('plannedSessions.workoutNotFound'),
            t('plannedSessions.workoutNotFoundBody'),
            [
              {
                text: t('common.ok'),
                onPress: () => {
                  openPlannedFetchFailedRef.current = null;
                  navigation.setParams({openPlannedId: undefined} as never);
                },
              },
            ],
          );
        }
      } catch {
        if (!cancelled) {
          openPlannedFetchInFlightRef.current = null;
          openPlannedFetchFailedRef.current = openPlannedId;
          Alert.alert(
            t('plannedSessions.couldNotOpen'),
            t('plannedSessions.couldNotOpenBody'),
            [
              {
                text: t('common.ok'),
                onPress: () => {
                  openPlannedFetchFailedRef.current = null;
                  navigation.setParams({openPlannedId: undefined} as never);
                },
              },
            ],
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openPlannedId, plannedWorkouts, mergePlannedFromServer, navigation, openPlannedDetailForEntry]);

  const upcomingByDay = useMemo(() => {
    const map = new Map<string, WorkoutPlanEntry[]>();
    calendarPlans.forEach(plan => {
      const key = formatDateKey(plan.scheduledAt);
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(plan);
    });
    return map;
  }, [calendarPlans]);

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

  const formatClockKl = (date: Date) => {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) {
      return null;
    }
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return t('plannedSessions.timeAt', {time: `${h}:${m}`});
  };

  const formatDateTime = (date: Date) =>
    new Date(date).toLocaleString(intlLocale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });

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
    calendarPlans.forEach(plan => {
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
  }, [calendarPlans, completedWorkouts]);

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

  const formattedPlanTime = useMemo(
    () =>
      planDateTime.toLocaleTimeString(intlLocale, {
        hour: '2-digit',
        minute: '2-digit',
      }),
    [planDateTime, intlLocale],
  );

  const handleOpenPlanModal = () => {
    const defaultGym = planSelectedGym || SCHEDULE_GYMS[0];
    setPlanSelectedGym(defaultGym);
    setPlanCenterQuery(defaultGym ? formatGymDisplayName(defaultGym) : '');
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
    setPlanCenterSheetOpen(false);
    setPlanModalVisible(true);
  };

  const planMuscles = useMemo(() => [planMuscle], [planMuscle]);

  const applyPlanQuickDate = (addDays: number) => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    base.setDate(base.getDate() + addDays);
    base.setHours(planDateTime.getHours(), planDateTime.getMinutes(), 0, 0);
    setPlanDateTime(base);
    setPlanCalendarMonth(new Date(base.getFullYear(), base.getMonth(), 1));
  };

  const handlePlanWorkout = async () => {
    const resolvedGym = planSelectedGym || findGymByQuery(planCenterQuery);
    if (!resolvedGym) {
      Alert.alert(t('plannedSessions.selectCenterAlert'), t('plannedSessions.selectCenterWhere'));
      return;
    }

    if (!user?.id) {
      Alert.alert(t('plannedSessions.loginRequired'), t('plannedSessions.loginRequiredBody'));
      return;
    }

    const trainingTypes = planMuscles.map(m => String(m));
    const centerLabel = formatGymDisplayName(resolvedGym);
    const inviteeCount = planInvitedFriends.length;

    setPlanSaving(true);
    try {
      await createPlannedSession({
        centerId: resolvedGym.id,
        centerName: centerLabel,
        scheduledAt: planDateTime,
        trainingTypes,
        note: null,
        inviteeIds: planInvitedFriends,
        threadId: null,
      });
      const entries = await loadWorkoutPlanEntriesForUser(user.id, true);
      mergePlannedFromServer(entries);
      setPlanModalVisible(false);
      setPlanSelectedGym(null);
      setPlanCenterQuery('');
      setPlanMuscle('bryst');
      setPlanInvitedFriends([]);
      setPlanInviteSectionVisible(false);
      setPlanInviteSearchQuery('');
      const inviteMsg =
        inviteeCount === 0
          ? t('plannedSessions.reminderSolo')
          : inviteeCount === 1
            ? t('plannedSessions.reminderOneFriend')
            : t('plannedSessions.reminderManyFriends');
      Alert.alert(t('plannedSessions.sessionCreated'), inviteMsg);
    } catch (e) {
      Alert.alert(
        t('plannedSessions.createFailed'),
        e instanceof Error ? e.message : t('plannedSessions.tryAgainSoon'),
      );
    } finally {
      setPlanSaving(false);
    }
  };

  const findGymByQuery = (query: string): DanishGym | null => {
    const lowerQuery = query.toLowerCase().trim();
    return (
      SCHEDULE_GYMS.find(
        gym =>
          gym.name.toLowerCase().includes(lowerQuery) ||
          gym.address?.toLowerCase().includes(lowerQuery),
      ) || null
    );
  };

  const formatMuscleSelection = useCallback(
    (muscles: MuscleGroup[]): string => {
      if (muscles.length === 0) {
        return '';
      }
      if (muscles.length === 1) {
        return muscleGroupLabel(muscles[0]);
      }
      if (muscles.length === 2) {
        return `${muscleGroupLabel(muscles[0])} & ${muscleGroupLabel(muscles[1])}`;
      }
      return `${muscleGroupLabel(muscles[0])} + ${muscles.length - 1} flere`;
    },
    [muscleGroupLabel],
  );

  const getCurrentInvitedIds = () => {
    if (!selectedWorkout || selectedWorkout.type !== 'planned') {
      return [];
    }
    return selectedWorkout.data.invitedFriends || [];
  };

  const handleInviteFriends = () => {
    if (!selectedWorkout || selectedWorkout.type !== 'planned') {
      Alert.alert(t('common.error'), t('plannedSessions.noSessionSelected'));
      return;
    }
    if (!selectedWorkout.data.id.startsWith('plan_')) {
      Alert.alert(
        t('plannedSessions.inviteFromChat'),
        t('plannedSessions.inviteFromChatBody'),
      );
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
        inviteStatusByUserId: {
          ...(plan.inviteStatusByUserId ?? {}),
          ...Object.fromEntries(friendIds.map(id => [id, 'pending' as const])),
        },
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

    const rm = new Set(friendIds);
    const nextStatus = {...(plan.inviteStatusByUserId ?? {})};
    friendIds.forEach(id => {
      delete nextStatus[id];
    });
    // Update selected workout
    setSelectedWorkout({
      type: 'planned',
      data: {
        ...plan,
        invitedFriends: plan.invitedFriends.filter(id => !rm.has(id)),
        acceptedFriends: (plan.acceptedFriends ?? []).filter(id => !rm.has(id)),
        inviteStatusByUserId: nextStatus,
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
    const list = loadedFriends;
    if (!inviteSearchQuery.trim()) {
      return list;
    }
    const query = inviteSearchQuery.trim().toLowerCase();
    return list.filter(
      f =>
        f.displayName.toLowerCase().includes(query) ||
        f.username.toLowerCase().includes(query),
    );
  }, [loadedFriends, inviteSearchQuery]);

  // Filter friends for plan invite popup
  const filteredPlanInviteFriends = useMemo(() => {
    const list = loadedFriends;
    if (!planInviteSearchQuery.trim()) {
      return list;
    }
    const query = planInviteSearchQuery.trim().toLowerCase();
    return list.filter(
      f =>
        f.displayName.toLowerCase().includes(query) ||
        f.username.toLowerCase().includes(query),
    );
  }, [loadedFriends, planInviteSearchQuery]);

  const currentInvitedIds = inviteModalVisible ? getCurrentInvitedIds() : [];
  const remainingInviteCount = inviteModalVisible
    ? filteredInviteFriends.filter(friend => !currentInvitedIds.includes(friend.id)).length
    : 0;

  const handleSelectPlanGym = (gym: DanishGym) => {
    setPlanSelectedGym(gym);
    setPlanCenterQuery(formatGymDisplayName(gym));
  };

  const selectPlanMuscle = (group: MuscleGroup) => {
    setPlanMuscle(group);
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

  return (
    <>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.screenIntro}>{t('plannedSessions.screenIntro')}</Text>

      {user?.id ? (
        <View style={styles.inviteSection}>
          <Text style={styles.inviteSectionTitle}>{t('plannedSessions.invitationsTitle')}</Text>
          {pendingInvitePlans.length === 0 ? (
            <Text style={styles.inviteSectionEmpty}>
              {t('plannedSessions.noPendingInvites')}
            </Text>
          ) : (
            pendingInvitePlans.map(plan => {
              const creatorId = plan.creatorUserId;
              const inviterName = creatorId
                ? sessionFriendNames.get(creatorId) ||
                  t('plannedSessions.yourFriend')
                : t('plannedSessions.yourFriend');
              const clockKl = formatClockKl(plan.scheduledAt);
              const dateLine = plan.scheduledAt.toLocaleDateString(intlLocale, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              });
              const busy = inviteRespondPlanId === plan.id;
              return (
                <View key={plan.id} style={styles.inviteCard}>
                  <View style={styles.inviteCardTop}>
                    {creatorId ? (
                      <UserAvatar
                        name={inviterName}
                        imageUrl={
                          sessionProfilesById.get(creatorId)?.avatarUrl ?? undefined
                        }
                        size="md"
                        style={styles.inviteAvatar}
                      />
                    ) : (
                      <View style={styles.inviteAvatarFallback}>
                        <Ionicons name="person" size={20} color={colors.textTertiary} />
                      </View>
                    )}
                    <View style={styles.inviteCardBody}>
                      <Text style={styles.inviteInviterName} numberOfLines={1}>
                        {inviterName}
                      </Text>
                      <Text style={styles.inviteMetaLine} numberOfLines={1}>
                        💪 {formatMuscleSelection(plan.muscles)}
                      </Text>
                      <Text style={styles.inviteMetaLine} numberOfLines={2}>
                        📍 {formatGymDisplayName(plan.gym)}
                      </Text>
                      <Text style={styles.inviteMetaLineMuted} numberOfLines={1}>
                        📅 {dateLine}
                        {clockKl ? ` · 🕒 ${clockKl}` : ''}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.inviteActionsRow}>
                    {busy ? (
                      <ActivityIndicator
                        size="small"
                        color={colors.primary}
                        style={styles.inviteActionsSpinner}
                      />
                    ) : (
                      <>
                        <TouchableOpacity
                          style={styles.inviteBtnDecline}
                          onPress={() => handleInviteDecline(plan.id)}
                          activeOpacity={0.75}>
                          <Text style={styles.inviteBtnDeclineText}>Afvis</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.inviteBtnAccept}
                          onPress={() => handleInviteAccept(plan.id)}
                          activeOpacity={0.75}>
                          <Text style={styles.inviteBtnAcceptText}>Deltag</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>
      ) : null}

      <View style={styles.calendarCard}>
        <View style={styles.calendarHeader}>
          <TouchableOpacity onPress={() => handleMonthNav(-1)} style={styles.calendarNavButton}>
            <Ionicons name="chevron-back" size={18} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.calendarHeaderText}>
            {formatMonthYear(currentMonth)}
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
          {weekdayShort.map(day => (
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
          {formatDateMedium(selectedDate)}
        </Text>

        {!isPastDay && (
          <View style={styles.detailGroup}>
            <Text style={styles.detailGroupTitle}>{t('plannedSessions.upcoming')}</Text>
            {selectedUpcoming.length === 0 ? (
              <Text style={styles.emptyDetail}>
                {t('plannedSessions.noSessionsDay')}
              </Text>
            ) : (
              selectedUpcoming.map(plan => {
                const clockKl = formatClockKl(plan.scheduledAt);
                const typeLine = formatMuscleSelection(plan.muscles);
                const acceptedNames = (plan.acceptedFriends ?? [])
                  .map(id => sessionFriendNames.get(id))
                  .filter((n): n is string => Boolean(n));
                const socialLine =
                  acceptedNames.length > 0
                    ? `👥 ${acceptedNames.join(', ')} deltager`
                    : plan.invitedFriends.length > 0
                      ? '👥 Afventer svar'
                      : null;
                return (
                <TouchableOpacity
                  key={plan.id}
                  style={styles.sessionCard}
                  onPress={() => handleWorkoutPress(plan, 'planned')}
                  activeOpacity={0.72}>
                  <Text style={styles.sessionCardType}>
                    💪 {typeLine}
                  </Text>
                  <Text style={styles.sessionCardMeta}>
                    📍 {formatGymDisplayName(plan.gym)}
                  </Text>
                  {clockKl ? (
                    <Text style={styles.sessionCardMeta}>🕒 {clockKl}</Text>
                  ) : null}
                  {socialLine ? (
                    <Text style={styles.sessionCardSocial}>{socialLine}</Text>
                  ) : null}
                  <View style={styles.moreInfoHint}>
                    <Text style={styles.moreInfoText}>{t('plannedSessions.details')}</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </View>
                </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        {!isFutureDay && (
          <View style={styles.detailGroup}>
            <Text style={styles.detailGroupTitle}>{t('plannedSessions.previous')}</Text>
            {selectedHistory.length === 0 ? (
              <Text style={styles.emptyDetail}>
                {t('plannedSessions.noCompletedDay')}
              </Text>
            ) : (
              selectedHistory.map(entry => (
                <TouchableOpacity
                  key={entry.id}
                  style={[styles.sessionCard, styles.sessionCardHistory]}
                  onPress={() => handleWorkoutPress(entry, 'completed')}
                  activeOpacity={0.72}>
                  <Text style={styles.sessionCardType}>
                    💪 {formatMuscleSelection(entry.muscles)}
                  </Text>
                  <Text style={styles.sessionCardMeta}>
                    📍 {formatGymDisplayName(entry.gym)}
                  </Text>
                  {entry.durationMs > 0 ? (
                    <Text style={styles.sessionCardMeta}>
                      ⏱ {Math.round(entry.durationMs / 60000)} min
                    </Text>
                  ) : null}
                  {entry.acceptedFriends?.length ? (
                    <Text style={styles.sessionCardSocial}>
                      {`👥 ${t('plannedSessions.trainedWith', {
                        count: String(entry.acceptedFriends.length),
                        friends:
                          entry.acceptedFriends.length === 1
                            ? t('plannedSessions.friendOne')
                            : t('plannedSessions.friendMany'),
                      })}`}
                    </Text>
                  ) : null}
                  <View style={styles.moreInfoHint}>
                    <Text style={styles.moreInfoText}>{t('plannedSessions.details')}</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}
      </View>
    </ScrollView>

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
                {selectedWorkout?.type === 'planned'
                  ? t('plannedSessions.upcomingOne')
                  : t('plannedSessions.previousOne')}
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

                  {selectedWorkout.type === 'planned' &&
                    user?.id &&
                    isPendingInviteeSession(selectedWorkout.data, user.id) && (
                      <View style={styles.modalPendingInviteStrip}>
                        <Text style={styles.modalPendingInviteHint}>
                          Du er inviteret — svar her eller i listen øverst.
                        </Text>
                        <View style={styles.modalPendingInviteActions}>
                          {inviteRespondPlanId === selectedWorkout.data.id ? (
                            <ActivityIndicator color={colors.primary} />
                          ) : (
                            <>
                              <TouchableOpacity
                                style={styles.modalPendingBtnDecline}
                                onPress={() =>
                                  handleInviteDecline(selectedWorkout.data.id)
                                }
                                activeOpacity={0.75}>
                                <Text style={styles.modalPendingBtnDeclineText}>
                                  Afvis
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.modalPendingBtnAccept}
                                onPress={() =>
                                  handleInviteAccept(selectedWorkout.data.id)
                                }
                                activeOpacity={0.75}>
                                <Text style={styles.modalPendingBtnAcceptText}>
                                  Deltag
                                </Text>
                              </TouchableOpacity>
                            </>
                          )}
                        </View>
                      </View>
                    )}

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
                            {muscleGroupLabel(muscle)}
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
                            {t('plannedSessions.invitedFriends', {
                              count: String(selectedWorkout.data.invitedFriends.length),
                            })}
                          </Text>
                          {user?.id &&
                          !isPendingInviteeSession(selectedWorkout.data, user.id) ? (
                            <TouchableOpacity
                              style={styles.inviteAddButton}
                              onPress={handleInviteFriends}
                              activeOpacity={0.7}>
                              <Ionicons name="add-circle" size={24} color={colors.primary} />
                            </TouchableOpacity>
                          ) : null}
                        </View>
                        {selectedWorkout.data.invitedFriends.length > 0 ? (
                          <View style={styles.modalFriendsList}>
                            {selectedWorkout.data.invitedFriends.map(friendId => {
                              const plan = selectedWorkout.data;
                              const res = getPlanInviteeResponseStatus(plan, friendId);
                              return (
                                <PlannedParticipantRow
                                  key={friendId}
                                  profile={participantProfiles.get(friendId)}
                                  right={{mode: 'plan_status', status: res}}
                                />
                              );
                            })}
                          </View>
                        ) : (
                          <Text style={styles.emptyInvitesText}>
                            {t('plannedSessions.noInvitesYet')}
                          </Text>
                        )}
                      </View>

                    </>
                  ) : (
                    /* Completed Workout Friends */
                    <>
                      {selectedWorkout.data.acceptedFriends &&
                        selectedWorkout.data.acceptedFriends.length > 0 && (
                          <View style={styles.modalSection}>
                            <Text style={styles.modalSectionTitle}>
                              {t('plannedSessions.trainedWithSection', {
                                count: String(selectedWorkout.data.acceptedFriends.length),
                              })}
                            </Text>
                            <View style={styles.modalFriendsList}>
                              {selectedWorkout.data.acceptedFriends.map(friendId => (
                                <PlannedParticipantRow
                                  key={friendId}
                                  profile={participantProfiles.get(friendId)}
                                  right={{mode: 'completed_joined'}}
                                />
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
                              {t('plannedSessions.invitedNotAttended', {
                                count: String(
                                  selectedWorkout.data.invitedFriends.length -
                                    (selectedWorkout.data.acceptedFriends?.length || 0),
                                ),
                              })}
                            </Text>
                            <View style={styles.modalFriendsList}>
                              {selectedWorkout.data.invitedFriends
                                .filter(
                                  friendId =>
                                    !selectedWorkout.data.acceptedFriends?.includes(friendId),
                                )
                                .map(friendId => (
                                  <PlannedParticipantRow
                                    key={friendId}
                                    profile={participantProfiles.get(friendId)}
                                    right={{mode: 'completed_no_show'}}
                                  />
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
      <Modal
        visible={planModalVisible}
        transparent
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
        onRequestClose={() => setPlanModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => setPlanModalVisible(false)}>
            <View style={styles.modalBackdrop} />
          </TouchableWithoutFeedback>

          <View style={[styles.modalCard, styles.planModal]}>
            <ScrollView
              style={styles.planModalScroll}
              contentContainerStyle={styles.planModalContent}
              keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>{t('plannedSessions.newSession')}</Text>
              <Text style={styles.modalText}>{t('plannedSessions.newSessionSub')}</Text>

              <TrainingCenterPicker
                variant="scheduleRow"
                value={planSelectedGym}
                onChange={handleSelectPlanGym}
                sheetMode="detached"
                onSheetOpenChange={setPlanCenterSheetOpen}
              />

              <Text style={[styles.sectionLabel, styles.sectionLabelSpacingTop20]}>
                {t('plannedSessions.trainingType')}
              </Text>
              <TrainingTypeMuscleGrid value={planMuscle} onChange={selectPlanMuscle} />

              {/* Inviter venner knap */}
              <TouchableOpacity
                style={styles.planInviteButton}
                onPress={() => {
                  const resolvedGym = planSelectedGym || findGymByQuery(planCenterQuery);
                  if (!resolvedGym) {
                    Alert.alert(
                      t('plannedSessions.selectCenterAlert'),
                      t('plannedSessions.selectCenterFirst'),
                    );
                    return;
                  }
                  setPlanInviteSectionVisible(!planInviteSectionVisible);
                }}
                activeOpacity={0.85}>
                <Ionicons
                  name={planInviteSectionVisible ? 'chevron-up' : 'people-outline'}
                  size={18}
                  color={colors.secondary}
                />
                <Text style={styles.planInviteButtonText}>
                  {t('plannedSessions.inviteFriendsOptional')}
                  {planInvitedFriends.length > 0 ? ` · ${planInvitedFriends.length}` : ''}
                </Text>
              </TouchableOpacity>

              <Text style={[styles.sectionLabel, styles.sectionLabelSpacingTop8]}>
                {t('plannedSessions.day')}
              </Text>
              <View style={styles.planQuickDates}>
                <TouchableOpacity
                  style={styles.planQuickDateChip}
                  onPress={() => applyPlanQuickDate(0)}
                  activeOpacity={0.85}>
                  <Text style={styles.planQuickDateChipText}>{t('plannedSessions.today')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.planQuickDateChip}
                  onPress={() => applyPlanQuickDate(1)}
                  activeOpacity={0.85}>
                  <Text style={styles.planQuickDateChipText}>{t('plannedSessions.tomorrow')}</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.sectionLabel, styles.sectionLabelSpacingTop12]}>
                {t('plannedSessions.dateInCalendar')}
              </Text>
              <View style={styles.calendarContainer}>
                <View style={styles.planInlineCalendarHeader}>
                  <TouchableOpacity
                    onPress={() => handleCalendarNav(-1)}
                    style={styles.calendarNavButton}>
                    <Ionicons name="chevron-back" size={18} color="#0F172A" />
                  </TouchableOpacity>
                  <Text style={styles.planInlineCalendarHeaderText}>
                    {formatMonthYear(planCalendarMonth)}
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleCalendarNav(1)}
                    style={styles.calendarNavButton}>
                    <Ionicons name="chevron-forward" size={18} color="#0F172A" />
                  </TouchableOpacity>
                </View>
                <View style={styles.calendarWeekRow}>
                  {weekdayShort.map(day => (
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
                <Text style={styles.timeButtonText}>
                  {t('plannedSessions.timeAt', {time: formattedPlanTime})}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryButton, planSaving && styles.primaryButtonDisabled]}
                onPress={() => {
                  handlePlanWorkout();
                }}
                disabled={planSaving}>
                <Text style={styles.primaryButtonText}>
                  {planSaving ? t('plannedSessions.creating') : t('plannedSessions.createSession')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalClose, styles.modalCloseAfterPrimary]}
                onPress={() => {
                  setPlanCenterSheetOpen(false);
                  setPlanModalVisible(false);
                  setPlanInvitedFriends([]);
                  setPlanInviteSectionVisible(false);
                  setPlanInviteSearchQuery('');
                  setPlanMuscle('bryst');
                }}>
                <Text style={styles.modalCloseText}>{t('plannedSessions.close')}</Text>
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
                      <Text style={styles.planInvitePopupTitle}>{t('plannedSessions.inviteFriends')}</Text>
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
                        placeholder={t('plannedSessions.searchFriendsGroups')}
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
                        if (notInvited.length === 0) {return;}
                        setPlanInvitedFriends(prev => [...prev, ...notInvited.map(f => f.id)]);
                      }}
                      disabled={filteredPlanInviteFriends.filter(f => !planInvitedFriends.includes(f.id)).length === 0}>
                      <Text
                        style={[
                          styles.inviteAllText,
                          filteredPlanInviteFriends.filter(f => !planInvitedFriends.includes(f.id)).length === 0 &&
                            styles.inviteAllTextDisabled,
                        ]}>
                        {t('plannedSessions.inviteAllFriends')}
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
                            const lineName = friend.displayName || friend.username || 'Ukendt bruger';
                            return (
                              <View key={friend.id} style={styles.friendRow}>
                                <View style={styles.friendInfoWrapper}>
                                  <UserAvatar
                                    name={friend.displayName || friend.username || 'Ukendt bruger'}
                                    imageUrl={friend.avatarUrl}
                                    size="md"
                                    style={styles.friendAvatarImage}
                                  />
                                  <View style={styles.friendDetails}>
                                    <Text style={styles.friendName}>{lineName}</Text>
                                    {friend.username ? (
                                      <Text style={styles.friendUsernameLine}>@{friend.username}</Text>
                                    ) : null}
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
                                    {hasBeenInvited
                                      ? t('plannedSessions.invited')
                                      : t('plannedSessions.invite')}
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
                          <Text style={styles.planInviteEmptyText}>
                            {t('newMessage.noResults')}
                          </Text>
                        </View>
                      )}
                    </ScrollView>
                  </View>
                </TouchableWithoutFeedback>
              </View>
            </TouchableWithoutFeedback>
          )}

          <PlanSessionCenterPickerSheet
            visible={planCenterSheetOpen}
            onClose={() => setPlanCenterSheetOpen(false)}
            onSelect={gym => {
              handleSelectPlanGym(gym);
              setPlanCenterSheetOpen(false);
            }}
          />
        </View>
      </Modal>

      <TimePickerSheet
        visible={planTimePickerVisible}
        value={planDateTime}
        onClose={handlePlanTimePickerClose}
        onConfirm={d => setPlanDateTime(roundToQuarterHour(d))}
        minuteInterval={15}
      />

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
          <Text style={styles.modalTitle}>{t('plannedSessions.inviteFriends')}</Text>

          {/* Search Bar */}
          <View style={styles.inviteSearchContainer}>
            <Ionicons name="search" size={20} color={colors.textTertiary} style={styles.inviteSearchIcon} />
            <TextInput
              style={styles.inviteSearchInput}
              placeholder={t('newMessage.searchFriends')}
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
              {t('plannedSessions.inviteAll')}
            </Text>
          </TouchableOpacity>
          <ScrollView style={styles.friendList} showsVerticalScrollIndicator={false}>
            {filteredInviteFriends.length === 0 ? (
              <Text style={styles.emptySearchText}>{t('plannedSessions.noFriendsFound')}</Text>
            ) : (
              filteredInviteFriends.map(friend => {
                const hasBeenInvited = currentInvitedIds.includes(friend.id);
                const lineName = friend.displayName || friend.username || 'Ukendt bruger';
                return (
                  <View key={friend.id} style={styles.friendRow}>
                    <View style={styles.friendInfoWrapper}>
                      <UserAvatar
                        name={friend.displayName || friend.username || 'Ukendt bruger'}
                        imageUrl={friend.avatarUrl}
                        size="md"
                        style={styles.friendAvatarImage}
                      />
                      <View style={styles.friendDetails}>
                        <Text style={styles.friendName}>{lineName}</Text>
                        {friend.username ? (
                          <Text style={styles.friendUsernameLine}>@{friend.username}</Text>
                        ) : null}
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
                        {hasBeenInvited
                          ? t('plannedSessions.invited')
                          : t('plannedSessions.invite')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </ScrollView>
          <TouchableOpacity style={styles.modalClose} onPress={handleInviteModalDone}>
            <Text style={styles.modalCloseText}>{t('plannedSessions.done')}</Text>
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
    paddingBottom: 32,
  },
  screenIntro: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    marginBottom: 14,
    maxWidth: 520,
  },
  inviteSection: {
    marginBottom: 16,
  },
  inviteSectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 10,
  },
  inviteSectionEmpty: {
    fontSize: 14,
    color: colors.textTertiary,
    lineHeight: 20,
    paddingVertical: 4,
  },
  inviteCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  inviteCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  inviteAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  inviteAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteCardBody: {
    flex: 1,
    minWidth: 0,
  },
  inviteInviterName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  inviteMetaLine: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  inviteMetaLineMuted: {
    fontSize: 13,
    color: colors.textTertiary,
    marginTop: 4,
  },
  inviteActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  inviteActionsSpinner: {
    paddingVertical: 10,
  },
  inviteBtnDecline: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  inviteBtnDeclineText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  inviteBtnAccept: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  inviteBtnAcceptText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  modalPendingInviteStrip: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceLight,
  },
  modalPendingInviteHint: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 12,
    textAlign: 'center',
  },
  modalPendingInviteActions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 44,
  },
  modalPendingBtnDecline: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  modalPendingBtnDeclineText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  modalPendingBtnAccept: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  modalPendingBtnAcceptText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
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
    backgroundColor: colors.primary,
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
    minHeight: 50,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 6,
    paddingBottom: 8,
    position: 'relative',
  },
  dayCellMuted: {
    opacity: 0.4,
  },
  dayCellSelected: {
    backgroundColor: colors.primary + '22',
    borderRadius: 12,
  },
  dayNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  dayNumberMuted: {
    color: colors.textTertiary,
  },
  dayNumberSelected: {
    color: colors.primaryDark,
  },
  dayMarkers: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 2,
    marginTop: 2,
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
    borderRadius: 20,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: colors.primary,
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: {width: 0, height: 8},
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
  detailGymLine: {
    marginBottom: 8,
  },
  detailGym: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    width: '100%',
  },
  /** @deprecated for plan cards — brug detailTimeSecondary ved siden af type */
  detailTime: {
    fontSize: 14,
    color: '#0369A1',
    fontWeight: '600',
  },
  detailTimeSecondary: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  muscleTimeSeparator: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: '500',
  },
  detailMuscles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
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
  friendAvatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.border,
  },
  friendName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  friendUsernameLine: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
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
    zIndex: 2,
    elevation: 8,
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
  sectionLabelSpacingTop8: {
    marginTop: 8,
  },
  sectionLabelSpacingTop12: {
    marginTop: 12,
  },
  sectionLabelSpacingTop20: {
    marginTop: 20,
  },
  planModalScroll: {
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
  planInlineCalendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  planInlineCalendarHeaderText: {
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
    minHeight: 50,
    paddingTop: 8,
    paddingBottom: 10,
    alignItems: 'center',
    justifyContent: 'flex-start',
    borderRadius: 10,
    position: 'relative',
  },
  calendarDayFaded: {
    opacity: 0.5,
  },
  calendarDaySelected: {
    backgroundColor: colors.primary,
  },
  calendarDayText: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '600',
    marginBottom: 2,
  },
  calendarDayTextFaded: {
    color: colors.textTertiary,
  },
  calendarDayTextSelected: {
    color: '#fff',
  },
  calendarDayMarkers: {
    flexDirection: 'row',
    justifyContent: 'center',
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
    backgroundColor: colors.primary + '14',
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
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 16,
    marginRight: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  planQuickDates: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  planQuickDateChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  planQuickDateChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
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
  modalCloseAfterPrimary: {
    marginTop: 12,
  },
  modalCloseText: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '600',
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

