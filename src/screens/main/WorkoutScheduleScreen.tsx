import React, {useMemo, useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, View, ScrollView} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useWorkoutPlanStore, WorkoutPlanEntry, WorkoutHistoryEntry} from '@/store/workoutPlanStore';
import {formatGymDisplayName} from '@/utils/gymDisplay';
import {MuscleGroup} from '@/types/workout.types';

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

const WorkoutScheduleScreen = () => {
  const plannedWorkouts = useWorkoutPlanStore(state => state.plannedWorkouts);
  const completedWorkouts = useWorkoutPlanStore(state => state.completedWorkouts);

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
          <TouchableOpacity onPress={() => handleMonthNav(1)} style={styles.calendarNavButton}>
            <Ionicons name="chevron-forward" size={18} color="#0F172A" />
          </TouchableOpacity>
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
                <View key={plan.id} style={styles.detailCard}>
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
                </View>
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
                <View key={entry.id} style={styles.detailCard}>
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
                </View>
              ))
            )}
          </View>
        )}
      </View>
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
});

export default WorkoutScheduleScreen;

