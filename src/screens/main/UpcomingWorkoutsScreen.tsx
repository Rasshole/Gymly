import React, {useMemo} from 'react';
import {FlatList, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useWorkoutPlanStore} from '@/store/workoutPlanStore';
import {MuscleGroup} from '@/types/workout.types';
import {formatGymDisplayName} from '@/utils/gymDisplay';
import colors from '@/theme/colors';
import {useAppStore} from '@/store/appStore';
import {isWorkoutOnUserCalendar} from '@/utils/plannedCalendarFilter';

const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  bryst: 'Bryst',
  triceps: 'Triceps',
  skulder: 'Skulder',
  ben: 'Ben',
  biceps: 'Biceps',
  mave: 'Mave',
  ryg: 'Ryg',
  cardio: 'Cardio',
  reformer: 'Reformer',
  pilates: 'Pilates',
};

const formatDateTime = (date: Date) =>
  new Date(date).toLocaleString('da-DK', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

const UpcomingWorkoutsScreen = () => {
  const {user} = useAppStore();
  const plannedWorkouts = useWorkoutPlanStore(state => state.plannedWorkouts);
  const removePlannedWorkout = useWorkoutPlanStore(state => state.removePlannedWorkout);

  const calendarList = useMemo(
    () => plannedWorkouts.filter(p => isWorkoutOnUserCalendar(p, user?.id)),
    [plannedWorkouts, user?.id],
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={calendarList}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({item}) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.gymName}>{formatGymDisplayName(item.gym)}</Text>
                <Text style={styles.timestamp}>{formatDateTime(item.scheduledAt)}</Text>
              </View>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => removePlannedWorkout(item.id)}>
                <Text style={styles.cancelButtonText}>Annuller</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.muscleRow}>
              {item.muscles.map(group => (
                <View key={group} style={styles.muscleChip}>
                  <Text style={styles.muscleChipText}>{MUSCLE_LABELS[group]}</Text>
                </View>
              ))}
            </View>
            {item.invitedFriends.length > 0 && (
              <Text style={styles.friendText}>
                {item.acceptedFriends && item.acceptedFriends.length > 0
                  ? `${item.acceptedFriends.length} ${
                      item.acceptedFriends.length === 1 ? 'ven' : 'venner'
                    } deltager`
                  : `${item.invitedFriends.length} ${
                      item.invitedFriends.length === 1 ? 'ven' : 'venner'
                    } har ikke svaret endnu`}
              </Text>
            )}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📅</Text>
            <Text style={styles.emptyTitle}>Ingen planlagte sessions</Text>
            <Text style={styles.emptySubtitle}>
              Åbn “Planlagte sessions” fra tjek ind og aftal næste træning med venner.
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    padding: 16,
  },
  card: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    shadowColor: colors.primary,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  gymName: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  timestamp: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  cancelButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F87171',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  cancelButtonText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '600',
  },
  muscleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  muscleChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#F0FDF4',
    borderRadius: 999,
  },
  muscleChipText: {
    fontSize: 13,
    color: '#15803D',
    fontWeight: '600',
  },
  friendText: {
    marginTop: 12,
    fontSize: 13,
    color: colors.secondary,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 80,
    paddingHorizontal: 24,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textTertiary,
    textAlign: 'center',
  },
});

export default UpcomingWorkoutsScreen;


