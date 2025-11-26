/**
 * Goal Store
 * Manages workout goals and targets
 */

import {create} from 'zustand';
import {Goal, GoalType, GoalPeriod} from '@/types/goal.types';

interface GoalState {
  goals: Goal[];
  
  // Actions
  addGoal: (goal: Omit<Goal, 'id' | 'createdAt' | 'isCompleted' | 'progress'>) => void;
  updateGoalProgress: (goalId: string) => void;
  completeGoal: (goalId: string) => void;
  deleteGoal: (goalId: string) => void;
  getActiveGoals: () => Goal[];
}

export const useGoalStore = create<GoalState>((set, get) => ({
  goals: [],

  /**
   * Add a new goal
   */
  addGoal: (goalData) => {
    const goal: Goal = {
      ...goalData,
      id: `goal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
      isCompleted: false,
      progress: 0,
    };
    
    set((state) => ({
      goals: [goal, ...state.goals],
    }));
    
    // Update progress immediately
    get().updateGoalProgress(goal.id);
  },

  /**
   * Update goal progress based on current workout data
   */
  updateGoalProgress: (goalId: string) => {
    // TODO: Implement actual progress calculation based on workout data
    // For now, this is a placeholder
    set((state) => ({
      goals: state.goals.map((goal) => {
        if (goal.id === goalId) {
          // Mock progress calculation
          const progress = Math.min(goal.progress + Math.random() * 20, 100);
          return {
            ...goal,
            progress: Math.round(progress),
            isCompleted: progress >= 100,
          };
        }
        return goal;
      }),
    }));
  },

  /**
   * Mark goal as completed
   */
  completeGoal: (goalId: string) => {
    set((state) => ({
      goals: state.goals.map((goal) =>
        goal.id === goalId
          ? {...goal, isCompleted: true, completedAt: new Date(), progress: 100}
          : goal
      ),
    }));
  },

  /**
   * Delete a goal
   */
  deleteGoal: (goalId: string) => {
    set((state) => ({
      goals: state.goals.filter((goal) => goal.id !== goalId),
    }));
  },

  /**
   * Get active (non-completed) goals
   */
  getActiveGoals: () => {
    const state = get();
    return state.goals.filter((goal) => !goal.isCompleted);
  },
}));



