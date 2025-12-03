import {create} from 'zustand';
import {MuscleGroup} from '@/types/workout.types';
import danishGyms, {DanishGym} from '@/data/danishGyms';

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
  addPlannedWorkout: (plan: WorkoutPlanEntry) => void;
  addPlanInvites: (planId: string, friendIds: string[]) => void;
  acceptPlanInvite: (planId: string, friendId: string) => void;
  removePlannedWorkout: (planId: string) => void;
  addCompletedWorkout: (entry: WorkoutHistoryEntry) => void;
}

const findGymByName = (name: string): DanishGym =>
  danishGyms.find(gym => gym.name === name) || danishGyms[0];

const initialPlanned: WorkoutPlanEntry[] = [
  {
    id: 'plan_seed_1',
    gym: findGymByName('Repeat Fitness Frederiksberg'),
    muscles: ['bryst', 'triceps'],
    scheduledAt: new Date(Date.now() + 1000 * 60 * 60 * 5),
    invitedFriends: ['2'],
    acceptedFriends: [],
  },
  {
    id: 'plan_seed_2',
    gym: findGymByName('PureGym'),
    muscles: ['ben', 'ryg'],
    scheduledAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    invitedFriends: [],
    acceptedFriends: [],
  },
];

const initialCompleted: WorkoutHistoryEntry[] = [
  {
    id: 'history_seed_1',
    gym: findGymByName('PureGym'),
    muscles: ['bryst', 'mave'],
    durationMs: 52 * 60 * 1000,
    completedAt: new Date(Date.now() - 1000 * 60 * 60 * 20),
    invitedFriends: ['1', '3'],
    acceptedFriends: ['1'], // Only friend 1 accepted
  },
  {
    id: 'history_seed_2',
    gym: findGymByName('Repeat Fitness Frederiksberg'),
    muscles: ['ben'],
    durationMs: 70 * 60 * 1000,
    completedAt: new Date(Date.now() - 1000 * 60 * 60 * 48),
    invitedFriends: [],
    acceptedFriends: [],
  },
];

export const useWorkoutPlanStore = create<WorkoutPlanState>(set => ({
  plannedWorkouts: initialPlanned,
  completedWorkouts: initialCompleted,

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


