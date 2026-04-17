/**
 * Check-in Screen
 * Dit center, træningstyper (2 kolonner × 5 rækker, vandrette kort), solo, swipe-to-check-in
 */

import React, {useState, useMemo, useCallback, useEffect, useRef} from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Image,
  ActivityIndicator,
  Alert,
  Switch,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import Geolocation, {
  type GeolocationError,
  type GeolocationResponse,
} from '@react-native-community/geolocation';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import danishGyms, {DanishGym} from '@/data/danishGyms';
import {useAppStore} from '@/store/appStore';
import {useGymStore} from '@/store/gymStore';
import {SKIP_CHECK_IN_LOCATION_RADIUS} from '@/config/dataConfig';
import {useDashboardStatsStore} from '@/store/dashboardStatsStore';
import {useBadgeStore} from '@/store/badgeStore';
import * as streak from '@/utils/streakUtils';
import {useSessionStore} from '@/store/sessionStore';
import {useWorkoutStore} from '@/store/workoutStore';
import {submitCheckIn} from '@/services/firestore/CheckinService';
import {notifyFriendsOfCheckIn} from '@/services/firestore/FriendCheckInNotificationService';
import {formatGymDisplayName, findGymById} from '@/utils/gymDisplay';
import {calculateDistance, formatDistance} from '@/utils/geoUtils';
import gymLogos from '@/utils/gymLogos';
import muscleImg from '@/utils/muscleGroupImages';
import {
  encodeMuscleGroupsForSession,
  MUSCLE_GROUP_LABELS_DK,
  toggleCheckInMuscleGroup,
  workoutTypeForFirestoreCheckIn,
  formatWorkoutTypeDisplay,
} from '@/utils/muscleGroupLabels';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows} from '@/theme/designTokens';
import {MuscleGroup} from '@/types/workout.types';
import ActiveSessionView from '@/components/checkin/ActiveSessionView';
import WorkoutSummaryModal from '@/components/checkin/WorkoutSummaryModal';
import SwipeCheckIn from '@/components/checkin/SwipeCheckIn';
import CheckInSplashOverlay from '@/components/checkin/CheckInSplashOverlay';
import {
  createWorkoutPost,
  refreshWorkoutFeedFromServer,
} from '@/services/supabase/workoutPostService';

const MOOD_TO_RATING: Record<string, number> = {
  angry: 1,
  neutral: 2,
  ok: 3,
  good: 4,
  amazing: 5,
};

const MUSCLE_GROUPS: {key: MuscleGroup; label: string}[] = [
  {key: 'bryst', label: MUSCLE_GROUP_LABELS_DK.bryst},
  {key: 'triceps', label: MUSCLE_GROUP_LABELS_DK.triceps},
  {key: 'skulder', label: MUSCLE_GROUP_LABELS_DK.skulder},
  {key: 'ben', label: MUSCLE_GROUP_LABELS_DK.ben},
  {key: 'biceps', label: MUSCLE_GROUP_LABELS_DK.biceps},
  {key: 'mave', label: MUSCLE_GROUP_LABELS_DK.mave},
  {key: 'ryg', label: MUSCLE_GROUP_LABELS_DK.ryg},
  {key: 'hele_kroppen', label: MUSCLE_GROUP_LABELS_DK.hele_kroppen},
  {key: 'reformer', label: MUSCLE_GROUP_LABELS_DK.reformer},
  {key: 'pilates', label: MUSCLE_GROUP_LABELS_DK.pilates},
];

/** 2 kolonner × 5 rækker — samme rækkefølge som tidligere Gymly check-in */
const MUSCLE_ROWS: (typeof MUSCLE_GROUPS)[] = [
  MUSCLE_GROUPS.slice(0, 2),
  MUSCLE_GROUPS.slice(2, 4),
  MUSCLE_GROUPS.slice(4, 6),
  MUSCLE_GROUPS.slice(6, 8),
  MUSCLE_GROUPS.slice(8, 10),
];

/**
 * STEP 1 — Original Gymly baseline (før komprimering)
 * STEP 2 — Global lodret komprimering: samme relative proportioner, lidt strammere.
 */
const VERTICAL_SCALE = 0.85; // Strammere lodret: mere plads til ét-skærms-layout (uden scroll)

/** Træningskort — fast højde (lidt højere for bedre fyld på skærmen) */
const MUSCLE_CARD_HEIGHT = 64;
const BASE_MUSCLE_ICON = 30;
const BASE_MUSCLE_ICON_MARGIN_RIGHT = 8;
const BASE_MUSCLE_LABEL_LINE_HEIGHT = 14;

/** Strammere grid — mindre scroll på tjek-ind */
const TRAINING_COL_GAP = spacing.sm;
const TRAINING_ROW_GAP = spacing.sm;
const MUSCLE_ICON_SIZE = Math.round(BASE_MUSCLE_ICON * VERTICAL_SCALE);
const MUSCLE_ICON_MARGIN_RIGHT = Math.round(BASE_MUSCLE_ICON_MARGIN_RIGHT * VERTICAL_SCALE);
const MUSCLE_LABEL_LINE_HEIGHT = Math.round(BASE_MUSCLE_LABEL_LINE_HEIGHT * VERTICAL_SCALE);

const SECTION_SUB_BELOW_MARGIN_TOP = Math.round(2 * VERTICAL_SCALE);
const GYM_SECTION_HEADER_MARGIN_BOTTOM = spacing.sm;
const GYM_CARD_PADDING_V = spacing.md;
const GYM_ICON_BOX_SIZE = Math.round(46 * VERTICAL_SCALE);
/** Minimal luft mellem hint og swipe-track */
const CTA_HINT_MARGIN_BOTTOM = 0;

/** Afstand center-kort → træningstype */
const CHECKIN_SECTION_GAP = spacing.sm;

/** Check-in kun tilladt når brugerens GPS er inden for denne afstand til valgt centers koordinater */
const CHECK_IN_RADIUS_METERS = 200;

/** Synkroniseret med `SKIP_CHECK_IN_LOCATION_RADIUS` i dataConfig (false i produktion). */
const SKIP_LOCATION_CHECK = SKIP_CHECK_IN_LOCATION_RADIUS;

/** Startværdi før onLayout på bundpanel (hint + swipe, kompakt track) */
const CHECKIN_CTA_RESERVE = 92;

const GEO_PERMISSION_DENIED = 1;

function logCheckInDebug(label: string, payload: Record<string, unknown>) {
  if (__DEV__) {
    console.warn(`[CheckIn] ${label}`, payload);
  }
}

function findNearestGymFromCoords(latitude: number, longitude: number): DanishGym | null {
  let best: DanishGym | null = null;
  let bestDist = Infinity;
  for (const gym of danishGyms) {
    const d = calculateDistance(latitude, longitude, gym.latitude, gym.longitude);
    if (d < bestDist) {
      bestDist = d;
      best = gym;
    }
  }
  return best;
}

const CheckInScreen = () => {
  const navigation = useNavigation<any>();
  const {user} = useAppStore();

  const onStatsCheckIn = useDashboardStatsStore(s => s.onCheckIn);
  const dashboardStreak = useDashboardStatsStore(s => s.streak);
  const {activeSession, startSession, endSession, getElapsedSeconds} = useSessionStore();
  const addWorkout = useWorkoutStore(s => s.addWorkout);
  const [selectedGym, setSelectedGym] = useState<DanishGym | null>(null);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [selectedMuscleGroups, setSelectedMuscleGroups] = useState<MuscleGroup[]>([
    'hele_kroppen',
  ]);
  const [soloTraining, setSoloTraining] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** Splash (Gymly-logo) ved swipe check-in og ved afslut/del træning */
  const [showGymlySplash, setShowGymlySplash] = useState(false);
  const [gymSearchQuery, setGymSearchQuery] = useState('');
  const [showGymModal, setShowGymModal] = useState(false);
  const [locationPermissionStatus, setLocationPermissionStatus] = useState<
    'unknown' | 'granted' | 'denied' | 'unavailable'
  >('unknown');

  const [ctaFooterHeight, setCtaFooterHeight] = useState(CHECKIN_CTA_RESERVE);

  const currentUserId = user?.id || 'current_user';
  const favoriteGym = useMemo(
    () => findGymById(user?.favoriteGyms?.[0] ?? null),
    [user?.favoriteGyms]
  );

  const filteredGyms = useMemo(() => {
    const q = gymSearchQuery.trim().toLowerCase();
    if (!q) return danishGyms.slice(0, 20);
    return danishGyms
      .filter(
        g =>
          g.name.toLowerCase().includes(q) ||
          (g.city?.toLowerCase().includes(q)) ||
          (g.brand?.toLowerCase().includes(q))
      )
      .slice(0, 15);
  }, [gymSearchQuery]);

  // Nærmeste center baseret på brugerens lokation
  const nearestGym = useMemo(() => {
    if (!userLocation) return null;
    return findNearestGymFromCoords(userLocation.latitude, userLocation.longitude);
  }, [userLocation]);

  // Afstand til valgt center (for visning / tjek ind)
  const distanceToSelectedGym = useMemo(() => {
    if (!userLocation || !selectedGym) return null;
    return calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      selectedGym.latitude,
      selectedGym.longitude,
    );
  }, [userLocation, selectedGym]);

  /** Afstand til nærmeste center (til "Dit center"-kortet) */
  const distanceToNearestGym = useMemo(() => {
    if (!userLocation || !nearestGym) return null;
    return calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      nearestGym.latitude,
      nearestGym.longitude,
    );
  }, [userLocation, nearestGym]);

  const isWithinCheckInRadius = useMemo(() => {
    if (SKIP_LOCATION_CHECK && selectedGym) {
      return true;
    }
    if (!userLocation || !selectedGym || distanceToSelectedGym == null) {
      return false;
    }
    return distanceToSelectedGym <= CHECK_IN_RADIUS_METERS;
  }, [userLocation, selectedGym, distanceToSelectedGym]);

  /** Manuelt center-valg (modal) — blokerer auto-nærmeste indtil Lokalitet nulstiller */
  const hasManuallySelectedGym = useRef(false);

  const GEO_OPTIONS = useMemo(
    () => ({
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 60000,
    }),
    []
  );

  /** Ved fokus: hent ny position så nærmeste center matcher hvor brugeren er nu */
  const GEO_OPTIONS_FRESH = useMemo(
    () => ({
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0,
    }),
    []
  );

  const applyGeolocationSuccess = useCallback((position: GeolocationResponse) => {
    const {latitude, longitude} = position.coords;
    setUserLocation({latitude, longitude});
    setLocationPermissionStatus('granted');
    const nearest = findNearestGymFromCoords(latitude, longitude);
    logCheckInDebug('locationSuccess', {
      currentLocation: {latitude, longitude},
      nearestCenterFound: nearest ? {id: nearest.id, name: nearest.name} : null,
      nearestGymId: nearest?.id ?? null,
      nearestGymName: nearest?.name ?? null,
      autoSelectNearest: !hasManuallySelectedGym.current,
    });
    if (nearest && !hasManuallySelectedGym.current) {
      setSelectedGym(nearest);
    }
  }, []);

  /**
   * Når vi har koordinater og brugeren ikke har valgt center manuelt, skal "Dit center"
   * altid være det geografisk nærmeste — også ved fokus/opdateret GPS eller når valget nulstilles.
   */
  useEffect(() => {
    if (hasManuallySelectedGym.current) {
      return;
    }
    if (!userLocation) {
      return;
    }
    const nearest = findNearestGymFromCoords(
      userLocation.latitude,
      userLocation.longitude,
    );
    if (nearest) {
      setSelectedGym(nearest);
    }
  }, [userLocation, selectedGym]);

  /**
   * Kun når placering ikke kan bruges (afvist/utilgængelig): brug favorit-center som fallback.
   * Undgår at favoritten vises som "Dit center" mens GPS stadig indlæses.
   */
  useEffect(() => {
    if (hasManuallySelectedGym.current) {
      return;
    }
    if (selectedGym != null) {
      return;
    }
    if (userLocation) {
      return;
    }
    const noLocation =
      locationPermissionStatus === 'denied' ||
      locationPermissionStatus === 'unavailable';
    if (noLocation && favoriteGym) {
      setSelectedGym(favoriteGym);
    }
  }, [favoriteGym, userLocation, selectedGym, locationPermissionStatus]);

  // Første load: tilladelse + position
  useEffect(() => {
    let cancelled = false;

    const onPositionSuccess = (position: GeolocationResponse) => {
      if (cancelled) {
        return;
      }
      applyGeolocationSuccess(position);
    };

    const onPositionError = (error: GeolocationError) => {
      if (cancelled) {
        return;
      }
      const denied = error?.code === GEO_PERMISSION_DENIED;
      setLocationPermissionStatus(denied ? 'denied' : 'unavailable');
      logCheckInDebug('locationError', {
        code: error?.code,
        message: error?.message,
        permissionDenied: denied,
      });
    };

    const fetchPosition = () => {
      Geolocation.getCurrentPosition(onPositionSuccess, onPositionError, GEO_OPTIONS);
    };

    const requestLocation = async () => {
      if (Platform.OS === 'android') {
        try {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            {
              title: 'Placeringsadgang',
              message: 'Gymly bruger din placering til at vise det nærmeste center',
              buttonNeutral: 'Spørg senere',
              buttonNegative: 'Annuller',
              buttonPositive: 'OK',
            },
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            setLocationPermissionStatus('denied');
            logCheckInDebug('androidPermissionDenied', {granted});
            return;
          }
        } catch (e) {
          setLocationPermissionStatus('unavailable');
          logCheckInDebug('androidPermissionException', {message: String(e)});
          return;
        }
        fetchPosition();
        return;
      }

      Geolocation.requestAuthorization(
        () => {
          fetchPosition();
        },
        err => {
          logCheckInDebug('iosRequestAuthorizationError', {
            message: err?.message,
          });
          setLocationPermissionStatus('denied');
          fetchPosition();
        },
      );
    };

    requestLocation();
    return () => {
      cancelled = true;
    };
  }, [GEO_OPTIONS, applyGeolocationSuccess]);

  /** Genindlæs frisk position når skærmen vises — nærmeste center opdateres hvis ikke manuelt valgt */
  useFocusEffect(
    useCallback(() => {
      Geolocation.getCurrentPosition(
        position => {
          applyGeolocationSuccess(position);
        },
        () => {},
        GEO_OPTIONS_FRESH,
      );
    }, [GEO_OPTIONS_FRESH, applyGeolocationSuccess]),
  );

  useEffect(() => {
    logCheckInDebug('stateSnapshot', {
      locationPermission: locationPermissionStatus,
      currentLocation: userLocation,
      nearestCenterFound: nearestGym
        ? {id: nearestGym.id, name: nearestGym.name}
        : null,
      selectedCenter: selectedGym
        ? {id: selectedGym.id, name: selectedGym.name}
        : null,
      nearestGymId: nearestGym?.id ?? null,
      selectedGymId: selectedGym?.id ?? null,
      selectedGymName: selectedGym?.name ?? null,
    });
  }, [locationPermissionStatus, userLocation, nearestGym, selectedGym]);

  const doCheckInAndStartSession = useCallback(
    async (gym: DanishGym, groups: MuscleGroup[]) => {
      const encoded = encodeMuscleGroupsForSession(groups);
      try {
        await submitCheckIn({
          userId: currentUserId,
          gymId: gym.id,
          gymName: gym.name,
          city: gym.city,
          workoutType: workoutTypeForFirestoreCheckIn(encoded),
          displayName: user?.displayName ?? 'Bruger',
          userInitials: user?.displayName?.charAt(0)?.toUpperCase(),
        });
        onStatsCheckIn();
        useBadgeStore
          .getState()
          .syncBadgesForUser(
            currentUserId,
            user?.displayName ?? 'Bruger',
          );
        startSession({gymId: gym.id, gymName: gym.name, workoutType: encoded});
        void notifyFriendsOfCheckIn({
          actorUserId: currentUserId,
          displayName: user?.displayName ?? 'Bruger',
          gymId: gym.id,
          gymName: gym.name,
          city: gym.city,
          workoutEncoded: encoded,
        });
        return true;
      } catch (err) {
        Alert.alert(
          'Fejl',
          'Kunne ikke registrere check-in. Tjek din forbindelse og prøv igen.',
          [{text: 'OK'}]
        );
        return false;
      }
    },
    [currentUserId, user, onStatsCheckIn, startSession]
  );

  const handleCheckIn = async () => {
    if (!selectedGym) {
      Alert.alert(
        'Vælg et center',
        'Vælg et center før du tjekker ind.',
        [{text: 'OK'}]
      );
      return;
    }
    if (!SKIP_LOCATION_CHECK) {
      if (!userLocation) {
        Alert.alert(
          'Placering påkrævet',
          'Vi skal bruge din placering for at bekræfte at du er ved centret. Tillad placering eller tryk Lokalitet.',
          [{text: 'OK'}]
        );
        return;
      }
      const metersAway = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        selectedGym.latitude,
        selectedGym.longitude
      );
      if (metersAway > CHECK_IN_RADIUS_METERS) {
        Alert.alert(
          'For langt væk',
          `Du er ${formatDistance(metersAway)} fra ${formatGymDisplayName(selectedGym)}. Du skal være inden for ${CHECK_IN_RADIUS_METERS} m for at tjekke ind.`,
          [{text: 'OK'}]
        );
        return;
      }
    }
    if (selectedMuscleGroups.length === 0) {
      Alert.alert(
        'Træningstype',
        'Vælg mindst én træningstype.',
        [{text: 'OK'}]
      );
      return;
    }
    setShowGymlySplash(true);
    setIsSubmitting(true);
    await doCheckInAndStartSession(selectedGym, selectedMuscleGroups);
    setIsSubmitting(false);
  };

  const handleEndSession = () => {
    setShowSummaryModal(true);
  };

  /** Efter del/kassér træning: tilbage til normal tjek-ind-skærm (ingen ekstra succes-side) */
  const returnToCheckInMain = useCallback(() => {
    setShowGymlySplash(false);
    hasManuallySelectedGym.current = false;
    setSelectedGym(null);
    setSelectedMuscleGroups(['hele_kroppen']);
    const tabNav = navigation.getParent();
    if (tabNav) {
      tabNav.navigate('CheckIn' as never, {screen: 'CheckInMain'} as never);
    }
  }, [navigation]);

  const handleSummaryComplete = useCallback(
    async (data: {
      mediaUri?: string;
      caption: string;
      mood: string;
      shareToFeed: boolean;
    }) => {
      setShowSummaryModal(false);
      setShowGymlySplash(true);
      const elapsed = getElapsedSeconds();
      const durationMinutes = Math.floor(elapsed / 60) || 1;
      if (activeSession) {
        addWorkout({
          userId: currentUserId,
          gymId: activeSession.gymId,
          gymName: activeSession.gymName,
          startTime: new Date(Date.now() - elapsed * 1000),
          duration: durationMinutes,
          workoutType: activeSession.workoutType,
          notes: data.caption || undefined,
        });
        useBadgeStore
          .getState()
          .syncBadgesForUser(
            currentUserId,
            user?.displayName ?? 'Bruger',
          );
        if (data.shareToFeed) {
          if (!user?.id) {
            Alert.alert(
              'Log ind',
              'Du skal være logget ind for at dele dit opslag på feed.',
            );
          } else {
            try {
              await createWorkoutPost({
                userId: user.id,
                authorDisplayName: user.displayName?.trim() || 'Bruger',
                mediaUri: data.mediaUri,
                caption: data.caption.trim(),
                durationMinutes,
                centerName: activeSession.gymName,
                workoutTypeLabel: formatWorkoutTypeDisplay(activeSession.workoutType),
                moodRating: MOOD_TO_RATING[data.mood] ?? null,
              });
              await refreshWorkoutFeedFromServer();
            } catch {
              Alert.alert(
                'Kunne ikke dele',
                'Træningen er gemt, men opslaget blev ikke oprettet. Tjek forbindelsen og prøv igen senere.',
              );
            }
          }
        }
      }
      endSession();
      returnToCheckInMain();
    },
    [
      activeSession,
      getElapsedSeconds,
      addWorkout,
      currentUserId,
      endSession,
      user?.displayName,
      user?.id,
      returnToCheckInMain,
    ]
  );

  const selectGymManually = useCallback((gym: DanishGym) => {
    hasManuallySelectedGym.current = true;
    setSelectedGym(gym);
  }, []);

  const openGymModal = () => setShowGymModal(true);
  const closeGymModal = () => {
    setShowGymModal(false);
    setGymSearchQuery('');
  };

  const goToWorkoutSchedule = () => {
    navigation.navigate('WorkoutSchedule', {initialTab: 'upcoming'});
  };

  const ensureAndroidLocationPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Placeringsadgang',
          message: 'Gymly bruger din placering til at vise det nærmeste center',
          buttonNeutral: 'Spørg senere',
          buttonNegative: 'Annuller',
          buttonPositive: 'OK',
        },
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  }, []);

  const handleLokalitetPress = useCallback(async () => {
    const ok = await ensureAndroidLocationPermission();
    if (!ok) {
      Alert.alert('Placering', 'Tillad placering for at finde det nærmeste center.', [
        {text: 'OK'},
      ]);
      return;
    }
    Geolocation.getCurrentPosition(
      position => {
        hasManuallySelectedGym.current = false;
        applyGeolocationSuccess(position);
        const {latitude, longitude} = position.coords;
        const best = findNearestGymFromCoords(latitude, longitude);
        logCheckInDebug('lokalitetPressSuccess', {
          latitude,
          longitude,
          nearestGymId: best?.id ?? null,
        });
      },
      (err: GeolocationError) => {
        const denied = err?.code === GEO_PERMISSION_DENIED;
        setLocationPermissionStatus(denied ? 'denied' : 'unavailable');
        logCheckInDebug('lokalitetPressError', {
          code: err?.code,
          message: err?.message,
        });
        Alert.alert(
          'Kunne ikke finde placering',
          'Tjek at GPS er slået til og at Gymly må bruge placering (Indstillinger → Gymly).',
          [{text: 'OK'}],
        );
      },
      {enableHighAccuracy: true, timeout: 20000, maximumAge: 0},
    );
  }, [ensureAndroidLocationPermission, applyGeolocationSuccess]);

  const insets = useSafeAreaInsets();

  const hideGymlySplash = useCallback(() => {
    setShowGymlySplash(false);
  }, []);

  const gymlySplashOverlay = (
    <CheckInSplashOverlay visible={showGymlySplash} onHidden={hideGymlySplash} />
  );

  const ctaHintText = useMemo(() => {
    if (SKIP_LOCATION_CHECK) {
      if (!selectedGym) {
        return 'Vælg et center ovenfor – derefter swipe for at tjekke ind.';
      }
      return 'Vælg træningstype, og swipe for at starte din træning.';
    }
    if (!selectedGym) {
      return 'Vælg et center ovenfor – derefter swipe for at tjekke ind.';
    }
    if (!userLocation) {
      return 'Tillad placering eller tryk Lokalitet — max 200 m fra center.';
    }
    if (!isWithinCheckInRadius && distanceToSelectedGym != null) {
      return `Du er ${formatDistance(distanceToSelectedGym)} fra centret. Kom inden for ${CHECK_IN_RADIUS_METERS} m for at tjekke ind.`;
    }
    if (isWithinCheckInRadius) {
      return `Du er inden for ${CHECK_IN_RADIUS_METERS} m — swipe for at tjekke ind.`;
    }
    return 'Kunne ikke måle afstand til centret.';
  }, [
    selectedGym,
    userLocation,
    isWithinCheckInRadius,
    distanceToSelectedGym,
  ]);

  const streakBanner = useMemo(() => {
    const icon = streak.getStreakIcon(dashboardStreak);
    const streakLabel =
      dashboardStreak === 1 ? '1 dags streak' : `${dashboardStreak} dages streak`;
    const next = streak.getNextMilestone(dashboardStreak);
    const milestoneLine =
      next == null
        ? null
        : next.daysRemaining === 1
          ? `1 dag til ${next.emoji}`
          : `${next.daysRemaining} dage til ${next.emoji}`;
    return {icon, streakLabel, milestoneLine};
  }, [dashboardStreak]);

  // Active session – live workout view
  if (activeSession) {
    return (
      <View style={styles.container}>
        {gymlySplashOverlay}
        <ActiveSessionView onEndSession={handleEndSession} />
        <WorkoutSummaryModal
          visible={showSummaryModal}
          summary={{
            gymName: activeSession.gymName,
            durationMinutes: Math.max(1, Math.floor(getElapsedSeconds() / 60)),
            workoutType: activeSession.workoutType,
          }}
          onClose={() => setShowSummaryModal(false)}
          onComplete={handleSummaryComplete}
        />
      </View>
    );
  }

  return (
    <View style={styles.container} collapsable={false}>
      {gymlySplashOverlay}
      <ScrollView
        style={styles.scrollFill}
        contentContainerStyle={[
          styles.scrollContent,
          {paddingBottom: ctaFooterHeight + spacing.sm},
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
        bounces>
        <View style={styles.checkInScrollInner}>
        <View style={styles.centerSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Dit center</Text>
            <TouchableOpacity onPress={goToWorkoutSchedule} activeOpacity={0.8}>
              <Text style={styles.planLink}>Planlæg træning</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.gymCard}>
            <TouchableOpacity
              style={styles.gymCardLeft}
              onPress={openGymModal}
              activeOpacity={0.8}>
              <View style={styles.gymIconBox}>
                <Icon name="location" size={Math.round(26 * VERTICAL_SCALE)} color={colors.primary} />
              </View>
              <View style={styles.gymCardText}>
                {userLocation && nearestGym ? (
                  <>
                    <Text style={styles.gymNearestLabel} numberOfLines={1}>
                      Nærmeste center
                    </Text>
                    <Text style={styles.gymName} numberOfLines={1} ellipsizeMode="tail">
                      {formatGymDisplayName(nearestGym)}
                    </Text>
                    {distanceToNearestGym != null ? (
                      <Text style={styles.gymDistance} numberOfLines={1}>
                        {formatDistance(distanceToNearestGym)} væk
                      </Text>
                    ) : null}
                    {selectedGym && selectedGym.id !== nearestGym.id ? (
                      <Text style={styles.gymHint} numberOfLines={2}>
                        Tjek ind ved: {formatGymDisplayName(selectedGym)}
                      </Text>
                    ) : (
                      <Text style={styles.gymHint} numberOfLines={1}>
                        Tryk for at vælge et andet center
                      </Text>
                    )}
                  </>
                ) : selectedGym ? (
                  <>
                    <Text style={styles.gymName} numberOfLines={1} ellipsizeMode="tail">
                      {formatGymDisplayName(selectedGym)}
                    </Text>
                    {distanceToSelectedGym != null ? (
                      <Text style={styles.gymDistance} numberOfLines={1}>
                        {formatDistance(distanceToSelectedGym)} væk
                      </Text>
                    ) : null}
                    <Text style={styles.gymHint} numberOfLines={1}>
                      Tryk for at vælge et andet center
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.gymNamePlaceholder}>Vælg center</Text>
                    <Text style={styles.gymHint}>
                      Tillad lokalitet for nærmeste center — eller tryk for at søge
                    </Text>
                  </>
                )}
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.lokalitetButton}
              onPress={handleLokalitetPress}
              activeOpacity={0.8}>
              <Icon name="locate" size={18} color={colors.primary} />
              <Text style={styles.lokalitetText}>Lokalitet</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.trainingSection}>
          <View style={styles.trainingTypeHeader}>
            <Text style={styles.sectionLabel}>Træningstype</Text>
            <Text style={styles.sectionSubBelow}>Vælg én eller flere.</Text>
          </View>
          <View style={styles.muscleGridTwoCol}>
            {MUSCLE_ROWS.map((row, rowIdx) => (
              <View key={rowIdx} style={styles.muscleRow2col}>
                {row.map(({key, label}) => {
                  const isSelected = selectedMuscleGroups.includes(key);
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[
                        styles.muscleCardHorizontal,
                        isSelected && styles.muscleCardHorizontalSelected,
                      ]}
                      onPress={() =>
                        setSelectedMuscleGroups(prev => toggleCheckInMuscleGroup(prev, key))
                      }
                      activeOpacity={0.8}>
                      <Image
                        source={muscleImg.getMuscleGroupImage(key)}
                        style={[styles.muscleIconLeft, isSelected && styles.muscleImageSelected]}
                        resizeMode="contain"
                      />
                      <Text
                        style={[
                          styles.muscleLabelHorizontal,
                          isSelected && styles.muscleLabelHorizontalSelected,
                        ]}
                        numberOfLines={2}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </View>

        <View style={styles.soloAboveCta}>
          <View style={styles.soloCard}>
            <View style={styles.soloRow}>
              <Text style={styles.soloLabel}>Solo træning</Text>
              <Switch
                value={soloTraining}
                onValueChange={setSoloTraining}
                trackColor={{false: colors.border, true: colors.primary + '80'}}
                thumbColor={soloTraining ? colors.primary : colors.textMuted}
              />
            </View>
            <Text style={styles.soloHint} numberOfLines={1}>
              Skjul for venner
            </Text>
          </View>
        </View>
        </View>
      </ScrollView>

      {/* Sticky bund: hint + swipe — tab bar under; scroll har padding så indhold ikke skjules */}
      <View
        pointerEvents="box-none"
        onLayout={e => {
          const h = Math.round(e.nativeEvent.layout.height);
          setCtaFooterHeight(prev => (prev === h ? prev : h));
        }}
        style={styles.ctaFooterBarAbsolute}>
        <View style={styles.ctaFooterAccent} />
        <View style={[styles.ctaFooterInner, {paddingBottom: Math.max(insets.bottom, 4)}]}>
          {isSubmitting ? (
            <View style={[styles.ctaButton, styles.ctaButtonDisabled]}>
              <ActivityIndicator size="small" color={colors.white} />
              <Text style={[styles.ctaButtonText, {marginLeft: spacing.sm}]}>
                Tjekker ind...
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.streakBannerRow}>
                <View style={styles.streakBannerTextCol}>
                  <Text
                    style={[
                      styles.streakBannerTitle,
                      streak.getStreakEmphasisLevel(dashboardStreak) === 1 &&
                        styles.streakBannerTitleEmphasis,
                      streak.getStreakEmphasisLevel(dashboardStreak) === 2 &&
                        styles.streakBannerTitleStrong,
                    ]}
                    numberOfLines={1}>
                    {streakBanner.icon
                      ? `${streakBanner.icon} ${streakBanner.streakLabel}`
                      : streakBanner.streakLabel}
                  </Text>
                  {streakBanner.milestoneLine ? (
                    <Text style={styles.streakBannerSub} numberOfLines={1}>
                      {streakBanner.milestoneLine}
                    </Text>
                  ) : null}
                </View>
              </View>
              <Text style={styles.ctaHint} numberOfLines={3}>
                {ctaHintText}
              </Text>
              <SwipeCheckIn
                compact
                onSuccess={handleCheckIn}
                disabled={
                  !selectedGym ||
                  (!SKIP_LOCATION_CHECK &&
                    (!userLocation || !isWithinCheckInRadius))
                }
                label="Tjek ind"
              />
            </>
          )}
        </View>
      </View>

      {/* Gym picker modal */}
      <Modal
        visible={showGymModal}
        animationType="slide"
        presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Vælg center</Text>
            <TouchableOpacity onPress={closeGymModal} style={styles.modalClose}>
              <Icon name="close" size={28} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.modalSearch}>
            <Icon name="search" size={20} color={colors.textMuted} />
            <TextInput
              style={styles.modalSearchInput}
              placeholder="Søg efter center, by eller kæde..."
              placeholderTextColor={colors.textMuted}
              value={gymSearchQuery}
              onChangeText={setGymSearchQuery}
              autoCapitalize="none"
            />
          </View>
          <ScrollView style={styles.modalList}>
            {favoriteGym && !gymSearchQuery.trim() && (
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionLabel}>Dit center</Text>
                <TouchableOpacity
                  style={styles.modalGymRow}
                  onPress={() => {
                    selectGymManually(favoriteGym);
                    closeGymModal();
                  }}
                  activeOpacity={0.8}>
                  {gymLogos.hasGymLogo(favoriteGym.brand) &&
                  gymLogos.getGymLogo(favoriteGym.brand) ? (
                    <Image
                      source={{uri: gymLogos.getGymLogo(favoriteGym.brand)!}}
                      style={styles.modalGymLogo}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={styles.modalGymIcon}>
                      <Icon name="business" size={24} color={colors.primary} />
                    </View>
                  )}
                  <View style={styles.modalGymInfo}>
                    <Text style={styles.modalGymName}>
                      {formatGymDisplayName(favoriteGym)}
                    </Text>
                    {favoriteGym.city && (
                      <Text style={styles.modalGymCity}>{favoriteGym.city}</Text>
                    )}
                  </View>
                  <Icon name="chevron-forward" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.modalSection}>
              <Text style={styles.modalSectionLabel}>
                {gymSearchQuery.trim() ? 'Søgeresultater' : 'Alle centre'}
              </Text>
              {filteredGyms.length === 0 ? (
                <View style={styles.modalEmpty}>
                  <Icon name="search-outline" size={48} color={colors.textMuted} />
                  <Text style={styles.modalEmptyText}>Ingen centre fundet</Text>
                </View>
              ) : (
                filteredGyms.map(gym => (
                  <TouchableOpacity
                    key={gym.id}
                    style={styles.modalGymRow}
                    onPress={() => {
                      selectGymManually(gym);
                      closeGymModal();
                    }}
                    activeOpacity={0.8}>
                    {gymLogos.hasGymLogo(gym.brand) &&
                    gymLogos.getGymLogo(gym.brand) ? (
                      <Image
                        source={{uri: gymLogos.getGymLogo(gym.brand)!}}
                        style={styles.modalGymLogo}
                        resizeMode="contain"
                      />
                    ) : (
                      <View style={styles.modalGymIcon}>
                        <Icon name="business" size={24} color={colors.primary} />
                      </View>
                    )}
                    <View style={styles.modalGymInfo}>
                      <Text style={styles.modalGymName}>
                        {formatGymDisplayName(gym)}
                      </Text>
                      {gym.city && (
                        <Text style={styles.modalGymCity}>{gym.city}</Text>
                      )}
                    </View>
                    <Icon name="chevron-forward" size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                ))
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    overflow: 'hidden',
    justifyContent: 'flex-start',
  },
  scrollFill: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    flexGrow: 1,
    flexShrink: 0,
    justifyContent: 'flex-start',
    alignItems: 'stretch',
  },
  /** Én kolonne — undgår at ScrollView fordeler lodret mellem flere direkte børn */
  checkInScrollInner: {
    width: '100%',
    flexGrow: 0,
    flexShrink: 0,
  },
  centerSection: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    flexShrink: 0,
    alignSelf: 'stretch',
    width: '100%',
  },
  trainingSection: {
    marginTop: CHECKIN_SECTION_GAP,
    paddingHorizontal: spacing.md,
    alignSelf: 'stretch',
    width: '100%',
  },
  soloAboveCta: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    width: '100%',
  },
  section: {paddingHorizontal: spacing.md, marginBottom: 2},
  sectionCompact: {marginBottom: 2},
  sectionSubInline: {
    ...typography.caption,
    fontWeight: '400',
    color: colors.textMuted,
  },
  trainingTypeHeader: {
    flexShrink: 0,
    marginBottom: spacing.xs,
  },
  sectionSubBelow: {
    ...typography.caption,
    fontWeight: '400',
    color: colors.textMuted,
    marginTop: SECTION_SUB_BELOW_MARGIN_TOP,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: Platform.OS === 'ios' ? 'baseline' : 'center',
    marginBottom: GYM_SECTION_HEADER_MARGIN_BOTTOM,
  },
  sectionLabel: {
    ...typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  sectionLabelTight: {
    marginBottom: 3,
  },
  planLink: {...typography.small, fontWeight: '600', color: colors.primary},
  gymCard: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    flexShrink: 0,
    justifyContent: 'space-between',
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.md,
    paddingVertical: GYM_CARD_PADDING_V,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...(Platform.OS === 'ios' ? {...shadows.card} : {elevation: 6}),
  },
  gymCardLeft: {flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0},
  gymIconBox: {
    width: GYM_ICON_BOX_SIZE,
    height: GYM_ICON_BOX_SIZE,
    borderRadius: radius.sm + 2,
    backgroundColor: colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gymCardText: {marginLeft: spacing.sm + 2, flex: 1, minWidth: 0},
  gymNearestLabel: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  gymName: {
    ...typography.bodyBold,
    fontSize: 17,
    lineHeight: 22,
    color: colors.text,
  },
  gymDistance: {
    fontSize: 12,
    color: colors.secondary,
    marginTop: 0,
    fontWeight: '600',
  },
  gymNamePlaceholder: {
    ...typography.body,
    fontSize: 17,
    lineHeight: 22,
    color: colors.textMuted,
  },
  gymHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
    fontSize: 11,
    lineHeight: 14,
  },
  lokalitetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm + 2,
    backgroundColor: colors.primary + '0D',
  },
  lokalitetText: {fontSize: 11, fontWeight: '600', color: colors.primary},
  muscleGridTwoCol: {
    width: '100%',
    flexGrow: 0,
    gap: TRAINING_ROW_GAP,
  },
  muscleRow2col: {
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
    flexGrow: 0,
    gap: TRAINING_COL_GAP,
  },
  muscleCardHorizontal: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    height: MUSCLE_CARD_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: 0,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
    ...(Platform.OS === 'ios' ? shadows.sm : {elevation: 2}),
  },
  muscleCardHorizontalSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryDark,
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: colors.primary,
          shadowOffset: {width: 0, height: 2},
          shadowOpacity: 0.28,
          shadowRadius: 5,
        }
      : {elevation: 4}),
  },
  muscleIconLeft: {
    width: MUSCLE_ICON_SIZE,
    height: MUSCLE_ICON_SIZE,
    marginRight: MUSCLE_ICON_MARGIN_RIGHT,
  },
  muscleImageSelected: {tintColor: colors.white},
  muscleLabelHorizontal: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: MUSCLE_LABEL_LINE_HEIGHT,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'left',
  },
  muscleLabelHorizontalSelected: {color: colors.white},
  soloCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignSelf: 'stretch',
    ...(Platform.OS === 'ios' ? shadows.sm : {elevation: 2}),
  },
  soloRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  soloLabel: {fontSize: 12, fontWeight: '600', color: colors.text},
  soloHint: {
    fontSize: 10,
    lineHeight: 11,
    color: colors.textMuted,
    opacity: 0.7,
    marginTop: spacing.xs,
  },
  ctaFooterBarAbsolute: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    overflow: 'hidden',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.backgroundCard,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: {width: 0, height: -4},
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: {elevation: 14},
    }),
  },
  ctaFooterAccent: {
    height: 2,
    backgroundColor: colors.primary,
    opacity: 0.9,
  },
  streakBannerRow: {
    width: '100%',
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.xs,
    alignItems: 'center',
  },
  streakBannerTextCol: {
    alignItems: 'center',
    maxWidth: '100%',
  },
  streakBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  streakBannerTitleEmphasis: {
    textShadowColor: colors.primary + '55',
    textShadowOffset: {width: 0, height: 0},
    textShadowRadius: 6,
  },
  streakBannerTitleStrong: {
    textShadowColor: colors.primary + '99',
    textShadowOffset: {width: 0, height: 0},
    textShadowRadius: 10,
    color: colors.primaryDark,
  },
  streakBannerSub: {
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 2,
  },
  ctaFooterInner: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: 0,
    backgroundColor: colors.surfaceLight,
  },
  ctaHint: {
    fontSize: 10,
    lineHeight: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: CTA_HINT_MARGIN_BOTTOM,
    paddingHorizontal: 2,
    marginTop: 0,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md + 2,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    ...(Platform.OS === 'ios' ? shadows.glow : {elevation: 4}),
  },
  ctaButtonDisabled: {opacity: 0.65},
  kettlebellIcon: {width: 26, height: 26, marginRight: spacing.sm, tintColor: colors.white},
  ctaButtonText: {...typography.bodyBold, color: colors.white},
  ctaSpinner: {marginLeft: spacing.sm},
  modalContainer: {flex: 1, backgroundColor: colors.background, paddingTop: 60},
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {...typography.h4, color: colors.text},
  modalClose: {padding: 4},
  modalSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    margin: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalSearchInput: {flex: 1, ...typography.body, color: colors.text, padding: 0},
  modalList: {flex: 1},
  modalSection: {marginBottom: spacing.xl, paddingHorizontal: spacing.lg},
  modalSectionLabel: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  modalGymRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    gap: spacing.md,
    backgroundColor: colors.backgroundCard,
    marginBottom: 4,
    borderRadius: radius.md,
  },
  modalGymLogo: {width: 44, height: 44, borderRadius: 8},
  modalGymIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalGymInfo: {flex: 1},
  modalGymName: {...typography.bodyBold, color: colors.text},
  modalGymCity: {...typography.caption, color: colors.textSecondary, marginTop: 2},
  modalEmpty: {alignItems: 'center', paddingVertical: spacing.xxl},
  modalEmptyText: {...typography.body, color: colors.text, marginTop: spacing.md},
});

export default CheckInScreen;
