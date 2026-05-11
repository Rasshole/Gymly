import {create} from 'zustand';
import {MuscleGroup} from '@/types/workout.types';
import {getActiveDanishGyms, DanishGym} from '@/data/danishGyms';

export interface WorkoutPlanEntry {
  id: string;
  /** Opretter (Supabase); valgfri for ældre lokale plan_* poster */
  creatorUserId?: string;
  gym: DanishGym;
  muscles: MuscleGroup[];
  scheduledAt: Date;
  invitedFriends: string[];
  acceptedFriends: string[]; // Friends who accepted the invitation
  /** Per invitee: from Supabase or local pending; used for Venter/Accepteret/Afvist */
  inviteStatusByUserId?: Partial<Record<string, 'pending' | 'accepted' | 'declined'>>;
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
      plannedWorkouts: state.plannedWorkouts.map(plan => {
        if (plan.id !== planId) {
          return plan;
        }
        const newIds = friendIds.filter(id => !plan.invitedFriends.includes(id));
        if (newIds.length === 0) {
          return plan;
        }
        const nextStatus = {...(plan.inviteStatusByUserId ?? {})};
        newIds.forEach(id => {
          nextStatus[id] = 'pending';
        });
        return {
          ...plan,
          invitedFriends: [...plan.invitedFriends, ...newIds],
          inviteStatusByUserId: nextStatus,
        };
      }),
    })),

  removePlanInvites: (planId, friendIds) =>
    set(state => ({
      plannedWorkouts: state.plannedWorkouts.map(plan => {
        if (plan.id !== planId) {
          return plan;
        }
        const setRm = new Set(friendIds);
        const nextStatus = {...(plan.inviteStatusByUserId ?? {})};
        friendIds.forEach(id => {
          delete nextStatus[id];
        });
        return {
          ...plan,
          invitedFriends: plan.invitedFriends.filter(id => !setRm.has(id)),
          acceptedFriends: (plan.acceptedFriends ?? []).filter(id => !setRm.has(id)),
          inviteStatusByUserId: nextStatus,
        };
      }),
    })),

  acceptPlanInvite: (planId, friendId) =>
    set(state => ({
      plannedWorkouts: state.plannedWorkouts.map(plan => {
        if (plan.id !== planId) {
          return plan;
        }
        const has = (plan.acceptedFriends || []).includes(friendId);
        return {
          ...plan,
          acceptedFriends: has ? plan.acceptedFriends! : [...(plan.acceptedFriends || []), friendId],
          inviteStatusByUserId: {
            ...(plan.inviteStatusByUserId ?? {}),
            [friendId]: 'accepted',
          },
        };
      }),
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


