import {create} from 'zustand';
import {MuscleGroup} from '@/types/workout.types';
import {getActiveDanishGyms, DanishGym} from '@/data/danishGyms';

export interface WorkoutPlanEntry {
  id: string;
  gym: DanishGym;
  muscles: MuscleGroup[];
  scheduledAt: Date;
  invitedFriends: string[];
  acceptedFriends: string[]; // Friends who accepted the invitation
}

export interface WorkoutHistoryEntry {
  id: string;
  gym: DanishGym;
  muscles: MuscleGroup[];
  durationMs: number;
  completedAt: Date;
  invitedFriends: string[]; // Friends who were invited
  acceptedFriends: string[]; // Friends who actually joined/accepted
  photoUri?: string;
}

interface WorkoutPlanState {
  plannedWorkouts: WorkoutPlanEntry[];
  completedWorkouts: WorkoutHistoryEntry[];
  /** Server-planer (merge/replace efter id) */
  mergePlannedFromServer: (fromServer: WorkoutPlanEntry[]) => void;
  addPlannedWorkout: (plan: WorkoutPlanEntry) => void;
  addPlanInvites: (planId: string, friendIds: string[]) => void;
  removePlanInvites: (planId: string, friendIds: string[]) => void;
  acceptPlanInvite: (planId: string, friendId: string) => void;
  removePlannedWorkout: (planId: string) => void;
  addCompletedWorkout: (entry: WorkoutHistoryEntry) => void;
}

const findGymByName = (name: string): DanishGym => {
  const list = getActiveDanishGyms();
  return list.find(gym => gym.name === name) || list[0]!;
};

const initialPlanned: WorkoutPlanEntry[] = [];

const initialCompleted: WorkoutHistoryEntry[] = [];

export const useWorkoutPlanStore = create<WorkoutPlanState>(set => ({
  plannedWorkouts: initialPlanned,
  completedWorkouts: initialCompleted,

  mergePlannedFromServer: fromServer =>
    set(s => {
      const m = new Map(s.plannedWorkouts.map(p => [p.id, p]));
      fromServer.forEach(p => m.set(p.id, p));
      return {plannedWorkouts: Array.from(m.values())};
    }),

  addPlannedWorkout: plan =>
    set(state => ({
      plannedWorkouts: [plan, ...state.plannedWorkouts],
    })),

  addPlanInvites: (planId, friendIds) =>
    set(state => ({
      plannedWorkouts: state.plannedWorkouts.map(plan =>
        plan.id === planId
          ? {
              ...plan,
              invitedFriends: [
                ...plan.invitedFriends,
                ...friendIds.filter(id => !plan.invitedFriends.includes(id)),
              ],
            }
          : plan,
      ),
    })),

  removePlanInvites: (planId, friendIds) =>
    set(state => ({
      plannedWorkouts: state.plannedWorkouts.map(plan =>
        plan.id === planId
          ? {
              ...plan,
              invitedFriends: plan.invitedFriends.filter(id => !friendIds.includes(id)),
            }
          : plan,
      ),
    })),

  acceptPlanInvite: (planId, friendId) =>
    set(state => ({
      plannedWorkouts: state.plannedWorkouts.map(plan =>
        plan.id === planId
          ? {
              ...plan,
              acceptedFriends: [
                ...(plan.acceptedFriends || []),
                ...((plan.acceptedFriends || []).includes(friendId) ? [] : [friendId]),
              ],
            }
          : plan,
      ),
    })),

  removePlannedWorkout: planId =>
    set(state => ({
      plannedWorkouts: state.plannedWorkouts.filter(plan => plan.id !== planId),
    })),

  addCompletedWorkout: entry =>
    set(state => ({
      completedWorkouts: [entry, ...state.completedWorkouts],
    })),
}));


