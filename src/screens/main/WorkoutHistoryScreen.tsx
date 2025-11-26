import React from 'react';
import {FlatList, StyleSheet, Text, View} from 'react-native';
import {useWorkoutPlanStore} from '@/store/workoutPlanStore';
import {MuscleGroup} from '@/types/workout.types';
import {formatGymDisplayName} from '@/utils/gymDisplay';

const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  bryst: 'Bryst',
  triceps: 'Triceps',
  skulder: 'Skulder',
  ben: 'Ben',
  biceps: 'Biceps',
  mave: 'Mave',
  ryg: 'Ryg',
  hele_kroppen: 'Hele kroppen',
};

const formatDateTime = (date: Date) =>
  new Date(date).toLocaleString('da-DK', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatDuration = (durationMs: number) => {
  const minutes = Math.round(durationMs / 60000);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} t` : `${hours} t ${rest} min`;
};

const WorkoutHistoryScreen = () => {
  const completedWorkouts = useWorkoutPlanStore(state => state.completedWorkouts);

  return (
    <View style={styles.container}>
      <FlatList
        data={completedWorkouts}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({item}) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.gymName}>{formatGymDisplayName(item.gym)}</Text>
              <Text style={styles.duration}>{formatDuration(item.durationMs)}</Text>
            </View>
            <Text style={styles.timestamp}>{formatDateTime(item.completedAt)}</Text>
            <View style={styles.muscleRow}>
              {item.muscles.map(group => (
                <View key={group} style={styles.muscleChip}>
                  <Text style={styles.muscleChipText}>{MUSCLE_LABELS[group]}</Text>
                </View>
              ))}
            </View>
            {item.acceptedFriends && item.acceptedFriends.length > 0 && (
              <Text style={styles.friendText}>
                {`Du trænede med ${item.acceptedFriends.length} ${
                  item.acceptedFriends.length === 1 ? 'ven' : 'venner'
                }`}
              </Text>
            )}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>💪</Text>
            <Text style={styles.emptyTitle}>Ingen træninger endnu</Text>
            <Text style={styles.emptySubtitle}>
              Når du afslutter en træning, dukker den op her.
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
    backgroundColor: '#F8F9FA',
  },
  listContent: {
    padding: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  gymName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  duration: {
    fontSize: 15,
    color: '#2563EB',
    fontWeight: '600',
  },
  timestamp: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 12,
  },
  muscleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  muscleChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#EFF6FF',
    borderRadius: 999,
  },
  muscleChipText: {
    fontSize: 13,
    color: '#1D4ED8',
    fontWeight: '600',
  },
  friendText: {
    marginTop: 12,
    fontSize: 13,
    color: '#334155',
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
    color: '#0F172A',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
  },
});

export default WorkoutHistoryScreen;


