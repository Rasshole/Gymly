/**
 * ActiveSessionView – Gammel design
 * Card: Du er nu tjekket ind, timer, Inviter/Sæt PR/Tag billede, Aktive i centret
 */

import React, {useState, useEffect, useRef, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import {useSessionStore} from '@/store/sessionStore';
import {useCheckInUIStore} from '@/store/checkInUIStore';
import {useGymPresence} from '@/hooks/useGymPresence';
import {useAppStore} from '@/store/appStore';
import {useFriendStore} from '@/store/friendStore';
import {useNavigation} from '@react-navigation/native';
import ActiveUsersList, {type ActiveUser} from './ActiveUsersList';
import UserProfileModal from './UserProfileModal';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows} from '@/theme/designTokens';
import {formatWorkoutTypeDisplay} from '@/utils/muscleGroupLabels';
import {getRuntimeLanguage, useTranslation} from '@/i18n';
import {sortActiveUsersForDisplay} from '@/utils/sortActiveUsersForDisplay';
import {useDemoModeStore} from '@/demo/demoModeStore';

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Kun __DEV__ + demo: ekstra “live” profiler til optagelse (IDs bruges også til venne-sortering). */
function makeDemoCenterCrowd(centerName: string | undefined): ActiveUser[] {
  const agoMin = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
  const primary = centerName ?? 'SATS — Valby';
  const rows: Array<{
    id: string;
    name: string;
    isFriend: boolean;
    workout: string;
    ago: number;
    rel: 'friend' | 'none' | 'pending_sent' | 'pending_received';
    streak: number;
  }> = [
    {id: 'demo-live-sofie', name: 'Sofie Hansen', isFriend: true, workout: 'ben,skulder', ago: 8, rel: 'friend', streak: 14},
    {id: 'demo-live-lucas', name: 'Lucas Berg', isFriend: true, workout: 'bryst,triceps', ago: 22, rel: 'friend', streak: 21},
    {id: 'demo-live-emma', name: 'Emma N.', isFriend: true, workout: 'ryg,biceps', ago: 41, rel: 'friend', streak: 7},
    {id: 'demo-live-oliver', name: 'Oliver K.', isFriend: true, workout: 'cardio', ago: 28, rel: 'friend', streak: 30},
    {id: 'demo-live-ida', name: 'Ida Møller', isFriend: false, workout: 'mave,ben', ago: 12, rel: 'none', streak: 5},
    {id: 'demo-live-magnus', name: 'Magnus T.', isFriend: false, workout: 'skulder,triceps', ago: 55, rel: 'none', streak: 0},
    {id: 'demo-live-freja', name: 'Freja L.', isFriend: false, workout: 'pilates', ago: 18, rel: 'pending_sent', streak: 3},
    {id: 'demo-live-noah', name: 'Noah S.', isFriend: false, workout: 'bryst,biceps', ago: 33, rel: 'none', streak: 11},
    {id: 'demo-live-clara', name: 'Clara V.', isFriend: false, workout: 'reformer', ago: 67, rel: 'none', streak: 9},
    {id: 'demo-live-viktor', name: 'Viktor A.', isFriend: false, workout: 'ben,cardio', ago: 6, rel: 'none', streak: 0},
    {id: 'demo-live-julie', name: 'Julie F.', isFriend: false, workout: 'ryg,mave', ago: 44, rel: 'pending_received', streak: 18},
    {id: 'demo-live-mathias', name: 'Mathias P.', isFriend: false, workout: 'ben,ryg', ago: 19, rel: 'none', streak: 4},
    {id: 'demo-live-amalie', name: 'Amalie K.', isFriend: false, workout: 'skulder,bryst', ago: 15, rel: 'none', streak: 0},
    {id: 'demo-live-tobias', name: 'Tobias R.', isFriend: false, workout: 'triceps,biceps', ago: 52, rel: 'none', streak: 26},
  ];
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    avatar: null,
    isFriend: r.isFriend,
    workoutType: r.workout,
    centerName,
    startedAt: agoMin(r.ago),
    liveDemoSeed: {
      synthetic: true,
      friendship: r.rel,
      streakDays: r.streak,
      primaryCenterLabel: primary,
    },
  }));
}

/** Hold synk med `isFriend: true` i `makeDemoCenterCrowd` (bruges til sortering som “venner”). */
const DEMO_LIVE_FRIEND_IDS = new Set([
  'demo-live-sofie',
  'demo-live-lucas',
  'demo-live-emma',
  'demo-live-oliver',
]);

export interface ActiveSessionViewProps {
  onEndSession: () => void;
}

const ActiveSessionView: React.FC<ActiveSessionViewProps> = ({onEndSession}) => {
  const {t} = useTranslation();
  const navigation = useNavigation<any>();
  const {activeSession, getElapsedSeconds} = useSessionStore();
  const showAwayZoneWarning = useCheckInUIStore(s => s.showAwayZoneWarning);
  const {gyms} = useGymPresence();
  const {user} = useAppStore();
  const friendIds = useFriendStore(s => s.friendIds);
  const loadFriendStore = useFriendStore(s => s.load);
  const demoCenterCrowdActive =
    typeof __DEV__ !== 'undefined' && __DEV__ && useDemoModeStore(s => s.enabled);
  const effectiveFriendIds = useMemo(() => {
    const next = new Set(friendIds);
    if (demoCenterCrowdActive) {
      DEMO_LIVE_FRIEND_IDS.forEach(id => next.add(id));
    }
    return next;
  }, [friendIds, demoCenterCrowdActive]);
  const [elapsed, setElapsed] = useState(0);
  const [selectedUser, setSelectedUser] = useState<ActiveUser | null>(null);
  const fadeIn = useRef(new Animated.Value(0)).current;
  const timerPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(getElapsedSeconds());
    }, 1000);
    return () => clearInterval(interval);
  }, [getElapsedSeconds]);

  useEffect(() => {
    if (user?.id) {
      void loadFriendStore(user.id);
    }
  }, [user?.id, loadFriendStore]);

  useEffect(() => {
    Animated.timing(fadeIn, {
      toValue: 1,
      duration: 360,
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic),
    }).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(timerPulse, {
          toValue: 1.02,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(timerPulse, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [fadeIn, timerPulse]);

  const activeGymId = activeSession?.gymId ? String(activeSession.gymId) : '';
  const gymPresence = activeGymId
    ? gyms.find(g => g.gymId === activeGymId)
    : gyms.find(g => g.gymName === activeSession?.gymName);

  const currentUserName = user?.displayName ?? t('common.you');
  const rawType = activeSession?.workoutType || '';
  const workoutLabel = formatWorkoutTypeDisplay(rawType, getRuntimeLanguage());

  const activeUsersRaw: ActiveUser[] =
    gymPresence?.userList?.length && gymPresence.userList.length > 0
      ? gymPresence.userList.map((u) => ({
          id: u.id,
          name: u.name,
          avatar: u.avatar,
          isFriend: friendIds.has(u.id),
          workoutType: u.workoutType ?? activeSession?.workoutType ?? undefined,
          centerName: activeSession?.gymName,
          startedAt: u.lastActivity?.toISOString?.() ?? undefined,
        }))
      : [];

  const crowdExtras = demoCenterCrowdActive
    ? makeDemoCenterCrowd(activeSession?.gymName)
    : [];

  const activeUsers: ActiveUser[] = sortActiveUsersForDisplay(
    Array.from(
      new Map(
        [
          ...activeUsersRaw,
          ...crowdExtras,
          {
            id: user?.id || 'current_user',
            name: currentUserName,
            avatar: user?.profileImageUrl || null,
            isFriend: false,
            workoutType: activeSession?.workoutType,
            centerName: activeSession?.gymName,
            startedAt: activeSession?.startTime?.toISOString?.(),
          },
        ].map(activeUser => [activeUser.id, activeUser]),
      ).values(),
    ),
    user?.id,
    effectiveFriendIds,
  );

  if (__DEV__) {
    console.log('[LiveICentret] center users', {
      centerId: activeGymId || null,
      rawCenterUsers: activeUsersRaw.length,
      uniqueCenterUsers: activeUsers.length,
    });
  }

  const totalActive = activeUsers.length;
  const friendsActive = activeUsers.filter(activeUser => activeUser.isFriend).length;

  const centerNameShort = (activeSession?.gymName ?? '').replace(/\s*-\s*Falkoner$/i, '');
  const handleActiveUserPress = (pressedUser: ActiveUser) => {
    setSelectedUser(pressedUser);
  };

  if (!activeSession) return null;

  return (
    <Animated.View style={[styles.container, {opacity: fadeIn}]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.heroHeader}>
          <Text style={styles.heroTitle}>Tjekket ind 🔥</Text>
          <Text style={styles.heroCenter} numberOfLines={1}>
            {centerNameShort}
          </Text>
          <Text style={styles.heroWorkout} numberOfLines={1}>
            {workoutLabel}
          </Text>
        </View>

        <Animated.View style={[styles.timerHeroCard, {transform: [{scale: timerPulse}]}]}>
          <View style={styles.timerGlowOrbTop} />
          <View style={styles.timerGlowOrbBottom} />
          {showAwayZoneWarning && !demoCenterCrowdActive ? (
            <View style={styles.awayWarningBanner} accessibilityRole="alert">
              <Text style={styles.awayWarningText}>
                {t('checkIn.awayWarning')}
              </Text>
            </View>
          ) : null}
          <View style={styles.timerMain}>
            <Text style={styles.timerMainValue}>{formatElapsed(elapsed)}</Text>
            <Text style={styles.timerMainSub}>Session i gang</Text>
          </View>
        </Animated.View>

        <TouchableOpacity
          style={styles.endButton}
          onPress={onEndSession}
          activeOpacity={0.86}>
          <Text style={styles.endButtonText}>{t('checkIn.endWorkout')}</Text>
        </TouchableOpacity>

        <ActiveUsersList
          users={activeUsers}
          totalActive={totalActive}
          friendsActive={friendsActive}
          onUserPress={handleActiveUserPress}
        />

      </ScrollView>

      <UserProfileModal
        user={selectedUser}
        visible={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        viewerUserId={user?.id}
        viewerName={currentUserName}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
  scroll: {flex: 1},
  scrollContent: {
    paddingHorizontal: spacing.lg + 2,
    paddingTop: spacing.xl + 2,
    paddingBottom: spacing.xxxl,
  },
  heroHeader: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  heroTitle: {
    ...typography.h2,
    color: '#0F172A',
    marginBottom: 6,
    fontWeight: '800',
  },
  heroCenter: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: 2,
  },
  heroWorkout: {
    ...typography.small,
    color: colors.primaryDark,
    fontWeight: '700',
  },
  timerHeroCard: {
    borderRadius: 28,
    backgroundColor: colors.primaryDark,
    minHeight: 184,
    marginBottom: spacing.md,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.glow,
  },
  timerGlowOrbTop: {
    position: 'absolute',
    top: -34,
    right: -26,
    width: 138,
    height: 138,
    borderRadius: 69,
    backgroundColor: colors.primaryLight + '55',
  },
  timerGlowOrbBottom: {
    position: 'absolute',
    bottom: -42,
    left: -26,
    width: 118,
    height: 118,
    borderRadius: 59,
    backgroundColor: '#C4B5FD30',
  },
  timerMain: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: spacing.lg + 2,
  },
  timerMainValue: {
    fontSize: 52,
    lineHeight: 58,
    fontWeight: '900',
    color: colors.white,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
  },
  timerMainSub: {
    marginTop: 6,
    ...typography.small,
    color: '#F3E8FF',
    fontWeight: '700',
  },
  awayWarningBanner: {
    margin: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  awayWarningText: {
    ...typography.caption,
    color: colors.white,
    lineHeight: 18,
  },
  endButton: {
    height: 64,
    marginBottom: spacing.md,
    backgroundColor: '#0F172A',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
    shadowColor: '#020617',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 6},
    elevation: 5,
  },
  endButtonText: {...typography.bodyBold, color: colors.white},
});

export default ActiveSessionView;
