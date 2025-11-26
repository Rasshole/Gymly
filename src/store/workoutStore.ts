/**
 * Workout Store
 * Manages workout history and statistics
 */

import {create} from 'zustand';
import {Workout, WeeklyStats, DailyWorkoutData} from '@/types/workout.types';

interface WorkoutState {
  workouts: Workout[];
  
  // Actions
  addWorkout: (workout: Omit<Workout, 'id'>) => void;
  getWeeklyStats: () => WeeklyStats;
  getDailyData: (days: number) => DailyWorkoutData[];
  getThisWeekData: () => DailyWorkoutData[];
  getTotalWorkoutTime: () => number; // Total workout time in minutes (all time)
  getWorkoutTimeForPeriod: (period: 'week' | 'month' | 'year' | 'all') => number; // Get workout time for specific period
  getCheckInsForPeriod: (period: 'week' | 'month' | 'year' | 'all') => number; // Get check-ins for specific period
  getWorkoutsWithFriendsForPeriod: (period: 'week' | 'month' | 'year' | 'all') => number; // Get workouts with friends for specific period
  getMostTrainedMuscleGroup: () => string | null; // Most frequently trained muscle group
  getWorkoutsWithFriends: () => number; // Number of workouts done with friends (all time)
}

// Helper function to get start of week (Monday)
const getStartOfWeek = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  return new Date(d.setDate(diff));
};

// Helper function to get end of week (Sunday)
const getEndOfWeek = (date: Date): Date => {
  const start = getStartOfWeek(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
};

// Helper function to check if date is in current week
const isInCurrentWeek = (date: Date): boolean => {
  const now = new Date();
  const weekStart = getStartOfWeek(now);
  const weekEnd = getEndOfWeek(now);
  return date >= weekStart && date <= weekEnd;
};

// Helper function to format date to YYYY-MM-DD (for grouping)
const formatDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  // Initialize with some mock data for demonstration
  workouts: (() => {
    const now = new Date();
    const mockWorkouts: Workout[] = [];
    
    // Generate some mock workouts for the past week
    for (let i = 0; i < 7; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      
      // Randomly add workouts (60% chance per day)
      if (Math.random() > 0.4) {
        const duration = Math.floor(Math.random() * 90) + 30; // 30-120 minutes
        const startTime = new Date(date);
        startTime.setHours(8 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60), 0);
        
        const muscleGroups = [
          'Bryst & Triceps',
          'Ben & Ryg',
          'Skulder & Biceps',
          'Mave & Cardio',
          'Hele kroppen',
        ];
        
        mockWorkouts.push({
          id: `workout_${Date.now()}_${i}`,
          userId: 'current_user',
          gymId: Math.floor(Math.random() * 478) + 1,
          startTime,
          duration,
          workoutType: ['cardio', 'strength', 'mixed'][Math.floor(Math.random() * 3)],
          muscleGroup: muscleGroups[Math.floor(Math.random() * muscleGroups.length)],
        });
      }
    }
    
    return mockWorkouts;
  })(),

  /**
   * Add a new workout
   */
  addWorkout: (workoutData) => {
    const workout: Workout = {
      ...workoutData,
      id: `workout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
    
    set((state) => ({
      workouts: [workout, ...state.workouts],
    }));
  },

  /**
   * Get weekly statistics
   */
  getWeeklyStats: () => {
    const state = get();
    const now = new Date();
    const weekStart = getStartOfWeek(now);
    const weekEnd = getEndOfWeek(now);
    
    const weekWorkouts = state.workouts.filter(
      (w) => w.startTime >= weekStart && w.startTime <= weekEnd
    );
    
    const totalDuration = weekWorkouts.reduce((sum, w) => sum + w.duration, 0);
    const workouts = weekWorkouts.length;
    const averageDuration = workouts > 0 ? Math.round(totalDuration / workouts) : 0;
    const totalHours = Math.round((totalDuration / 60) * 10) / 10; // Round to 1 decimal
    
    return {
      workouts,
      totalDuration,
      totalHours,
      averageDuration,
    };
  },

  /**
   * Get daily workout data for the last N days
   */
  getDailyData: (days: number) => {
    const state = get();
    const now = new Date();
    const data: DailyWorkoutData[] = [];
    
    // Group workouts by date
    const workoutsByDate: Record<string, Workout[]> = {};
    
    state.workouts.forEach((workout) => {
      const dateKey = formatDateKey(workout.startTime);
      if (!workoutsByDate[dateKey]) {
        workoutsByDate[dateKey] = [];
      }
      workoutsByDate[dateKey].push(workout);
    });
    
    // Generate data for the last N days
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const dateKey = formatDateKey(date);
      const dayWorkouts = workoutsByDate[dateKey] || [];
      const duration = dayWorkouts.reduce((sum, w) => sum + w.duration, 0);
      
      data.push({
        date,
        duration,
        workouts: dayWorkouts.length,
      });
    }
    
    return data;
  },

  /**
   * Get this week's daily data (7 days, Monday to Sunday)
   */
  getThisWeekData: () => {
    const state = get();
    const now = new Date();
    const weekStart = getStartOfWeek(now);
    const data: DailyWorkoutData[] = [];
    
    // Group workouts by date
    const workoutsByDate: Record<string, Workout[]> = {};
    
    state.workouts.forEach((workout) => {
      if (isInCurrentWeek(workout.startTime)) {
        const dateKey = formatDateKey(workout.startTime);
        if (!workoutsByDate[dateKey]) {
          workoutsByDate[dateKey] = [];
        }
        workoutsByDate[dateKey].push(workout);
      }
    });
    
    // Generate data for each day of the week
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      date.setHours(0, 0, 0, 0);
      
      const dateKey = formatDateKey(date);
      const dayWorkouts = workoutsByDate[dateKey] || [];
      const duration = dayWorkouts.reduce((sum, w) => sum + w.duration, 0);
      
      data.push({
        date,
        duration,
        workouts: dayWorkouts.length,
      });
    }
    
    return data;
  },

  /**
   * Get total workout time (all time, in minutes)
   */
  getTotalWorkoutTime: () => {
    const state = get();
    return state.workouts.reduce((sum, w) => sum + w.duration, 0);
  },

  /**
   * Get workout time for a specific period
   */
  getWorkoutTimeForPeriod: (period: 'week' | 'month' | 'year' | 'all') => {
    const state = get();
    const now = new Date();
    
    let startDate: Date;
    
    switch (period) {
      case 'week': {
        startDate = getStartOfWeek(now);
        break;
      }
      case 'month': {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        startDate.setHours(0, 0, 0, 0);
        break;
      }
      case 'year': {
        startDate = new Date(now.getFullYear(), 0, 1);
        startDate.setHours(0, 0, 0, 0);
        break;
      }
      case 'all':
      default:
        return state.workouts.reduce((sum, w) => sum + w.duration, 0);
    }
    
    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);
    
    return state.workouts
      .filter(w => w.startTime >= startDate && w.startTime <= endDate)
      .reduce((sum, w) => sum + w.duration, 0);
  },

  /**
   * Get most frequently trained muscle group
   */
  getMostTrainedMuscleGroup: () => {
    const state = get();
    const muscleGroupCounts: Record<string, number> = {};
    
    state.workouts.forEach((workout) => {
      if (workout.muscleGroup) {
        muscleGroupCounts[workout.muscleGroup] = 
          (muscleGroupCounts[workout.muscleGroup] || 0) + 1;
      }
    });
    
    if (Object.keys(muscleGroupCounts).length === 0) {
      return null;
    }
    
    const mostTrained = Object.entries(muscleGroupCounts).reduce((a, b) =>
      a[1] > b[1] ? a : b
    );
    
    return mostTrained[0];
  },

  /**
   * Get number of workouts done with friends
   * For now, we'll use a mock calculation - in real app this would check for group workouts
   */
  getWorkoutsWithFriends: () => {
    const state = get();
    // Mock: Assume 30% of workouts are with friends
    return Math.floor(state.workouts.length * 0.3);
  },

  /**
   * Get check-ins for a specific period
   */
  getCheckInsForPeriod: (period: 'week' | 'month' | 'year' | 'all') => {
    const state = get();
    const now = new Date();
    
    let startDate: Date;
    
    switch (period) {
      case 'week': {
        startDate = getStartOfWeek(now);
        break;
      }
      case 'month': {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        startDate.setHours(0, 0, 0, 0);
        break;
      }
      case 'year': {
        startDate = new Date(now.getFullYear(), 0, 1);
        startDate.setHours(0, 0, 0, 0);
        break;
      }
      case 'all':
      default:
        return state.workouts.length;
    }
    
    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);
    
    return state.workouts.filter(
      w => w.startTime >= startDate && w.startTime <= endDate
    ).length;
  },

  /**
   * Get workouts with friends for a specific period
   */
  getWorkoutsWithFriendsForPeriod: (period: 'week' | 'month' | 'year' | 'all') => {
    const state = get();
    const now = new Date();
    
    let startDate: Date;
    
    switch (period) {
      case 'week': {
        startDate = getStartOfWeek(now);
        break;
      }
      case 'month': {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        startDate.setHours(0, 0, 0, 0);
        break;
      }
      case 'year': {
        startDate = new Date(now.getFullYear(), 0, 1);
        startDate.setHours(0, 0, 0, 0);
        break;
      }
      case 'all':
      default:
        return Math.floor(state.workouts.length * 0.3);
    }
    
    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);
    
    const periodWorkouts = state.workouts.filter(
      w => w.startTime >= startDate && w.startTime <= endDate
    );
    
    // Mock: Assume 30% of workouts are with friends
    return Math.floor(periodWorkouts.length * 0.3);
  },
}));

