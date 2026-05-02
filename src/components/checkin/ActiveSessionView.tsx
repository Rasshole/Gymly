/**
 * ActiveSessionView – Gammel design
 * Card: Du er nu tjekket ind, timer, Inviter/Sæt PR/Tag billede, Aktive i centret
 */

import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation} from '@react-navigation/native';
import {useSessionStore} from '@/store/sessionStore';
import {useCheckInUIStore} from '@/store/checkInUIStore';
import {useGymPresence} from '@/hooks/useGymPresence';
import {useAppStore} from '@/store/appStore';
import {useFriendStore} from '@/store/friendStore';
import ActiveUsersList, {type ActiveUser} from './ActiveUsersList';
import UserProfileModal from './UserProfileModal';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
import {ExerciseType} from '@/types/pr.types';
import {formatWorkoutTypeDisplay} from '@/utils/muscleGroupLabels';

const LEGACY_WORKOUT_LABELS: Record<string, string> = {
  fri: 'Fri træning',
  styrke: 'Styrke',
  kondi: 'Kondition',
  ben: 'Ben',
  overkrop: 'Overkrop',
};

const PR_EXERCISES: {key: ExerciseType; label: string}[] = [
  {key: 'Bænkpres', label: 'Bænk'},
  {key: 'Bicepcurl', label: 'Bicepcurl'},
  {key: 'Benpres', label: 'Benpres'},
  {key: 'Dødløft', label: 'Dødløft'},
  {key: 'Squads', label: 'Squat'},
];

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export interface ActiveSessionViewProps {
  onEndSession: () => void;
}

const ActiveSessionView: React.FC<ActiveSessionViewProps> = ({onEndSession}) => {
  const navigation = useNavigation<any>();
  const {activeSession, getElapsedSeconds} = useSessionStore();
  const showAwayZoneWarning = useCheckInUIStore(s => s.showAwayZoneWarning);
  const {gyms} = useGymPresence();
  const {user} = useAppStore();
  const friendIds = useFriendStore(s => s.friendIds);
  const loadFriendStore = useFriendStore(s => s.load);
  const [elapsed, setElapsed] = useState(0);
  const [selectedUser, setSelectedUser] = useState<ActiveUser | null>(null);
  const [showPRModal, setShowPRModal] = useState(false);

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

  const gymPresence = gyms.find(
    (g) =>
      g.gymId === String(activeSession?.gymId) ||
      g.gymName === activeSession?.gymName
  );

  const currentUserName = user?.displayName ?? 'Dig';
  const rawType = activeSession?.workoutType || '';
  const workoutLabel = rawType.includes(',')
    ? formatWorkoutTypeDisplay(rawType)
    : LEGACY_WORKOUT_LABELS[rawType] ?? formatWorkoutTypeDisplay(rawType);

  const activeUsers: ActiveUser[] =
    gymPresence?.userList?.length && gymPresence.userList.length > 0
      ? gymPresence.userList.map((u) => ({
          id: u.id,
          name: u.name,
          avatar: u.avatar,
          isFriend: friendIds.has(u.id),
          workoutType: activeSession?.workoutType,
        }))
      : [
          {
            id: 'me',
            name: currentUserName,
            isFriend: false,
            workoutType: activeSession?.workoutType,
          },
        ];

  const totalActive = gymPresence?.activeUsers ?? (activeUsers.length || 1);

  const handleInviteFriends = () => {
    navigation.navigate('Friends');
  };

  const handleSetPR = (exercise: ExerciseType) => {
    setShowPRModal(false);
    navigation.navigate('AddPR', {exercise});
  };

  const handleTakePhoto = () => {
    // TODO: Open camera / image picker
  };

  if (!activeSession) return null;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Main card – gammel design */}
        <View style={styles.card}>
          {showAwayZoneWarning ? (
            <View style={styles.awayWarningBanner} accessibilityRole="alert">
              <Text style={styles.awayWarningText}>
                Det ser ud til, at du har forladt centeret. Du bliver snart automatisk
                tjekket ud.
              </Text>
            </View>
          ) : null}
          <Text style={styles.cardTitle}>Du er nu tjekket ind</Text>
          <Text style={styles.cardSubtitle}>
            I {activeSession.gymName} • {workoutLabel}
          </Text>

          <View style={styles.timerPill}>
            <Icon name="time-outline" size={16} color={colors.primary} />
            <Text style={styles.timerText}>{formatElapsed(elapsed)}</Text>
          </View>

          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleInviteFriends}
              activeOpacity={0.8}>
              <Icon name="paper-plane-outline" size={20} color={colors.primary} />
              <Text style={styles.actionButtonText}>Inviter venner</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => setShowPRModal(true)}
              activeOpacity={0.8}>
              <Icon name="trophy-outline" size={20} color={colors.primary} />
              <Text style={styles.actionButtonText}>Sæt PR</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleTakePhoto}
              activeOpacity={0.8}>
              <Icon name="camera-outline" size={20} color={colors.primary} />
              <Text style={styles.actionButtonText}>Tag billede fra træning</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.activeLabel}>Aktive i centret</Text>
          <ActiveUsersList
            users={activeUsers}
            totalActive={Math.max(totalActive, 1)}
            friendsActive={activeUsers.filter((u) => u.isFriend).length}
            onUserPress={setSelectedUser}
          />
        </View>

        {/* Afslut træning – dark navy */}
        <TouchableOpacity
          style={styles.endButton}
          onPress={onEndSession}
          activeOpacity={0.8}>
          <Text style={styles.endButtonText}>Afslut træning</Text>
        </TouchableOpacity>
      </ScrollView>

      <UserProfileModal
        user={selectedUser}
        visible={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        viewerUserId={user?.id}
        viewerName={currentUserName}
      />

      {/* PR exercise selection modal */}
      <Modal
        visible={showPRModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPRModal(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowPRModal(false)}>
          <View
            style={styles.prModalContent}
            onStartShouldSetResponder={() => true}>
            <Text style={styles.prModalTitle}>Hvilken PR vil du sætte?</Text>
            <Text style={styles.prModalSubtitle}>Vælg øvelsen herunder</Text>
            {PR_EXERCISES.map(({key, label}) => (
              <TouchableOpacity
                key={key}
                style={styles.prExerciseRow}
                onPress={() => handleSetPR(key)}
                activeOpacity={0.8}>
                <Text style={styles.prExerciseText}>{label}</Text>
                <Icon name="chevron-forward" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.prLukButton}
              onPress={() => setShowPRModal(false)}
              activeOpacity={0.8}>
              <Text style={styles.prLukText}>Luk</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
  scroll: {flex: 1},
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  card: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    padding: spacing.xl,
    marginBottom: spacing.xl,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  awayWarningBanner: {
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.45)',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  awayWarningText: {
    ...typography.small,
    color: colors.text,
    lineHeight: 20,
  },
  cardTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  cardSubtitle: {
    ...typography.small,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.primary + '15',
    borderRadius: radius.full,
    marginBottom: spacing.xl,
  },
  timerText: {
    ...typography.bodyBold,
    fontVariant: ['tabular-nums'],
    color: colors.primary,
  },
  actionButtons: {gap: spacing.sm, marginBottom: spacing.xl},
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  actionButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.primary,
  },
  activeLabel: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  endButton: {
    paddingVertical: spacing.lg,
    backgroundColor: colors.text,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  endButtonText: {...typography.bodyBold, color: colors.white},
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  prModalContent: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    padding: spacing.xl,
    maxHeight: '70%',
  },
  prModalTitle: {
    ...typography.h4,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  prModalSubtitle: {
    ...typography.small,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  prExerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginBottom: 4,
  },
  prExerciseText: {...typography.body, fontWeight: '600', color: colors.text},
  prLukButton: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  prLukText: {...typography.body, fontWeight: '600', color: colors.text},
});

export default ActiveSessionView;
