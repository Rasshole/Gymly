/**
 * Workout Invitation Store
 * Manages workout invitations and group workouts
 */

import {create} from 'zustand';
import {WorkoutInvitation, GroupWorkout, MuscleGroup} from '@/types/workout.types';

// Helper function to create a group workout from an accepted invitation
const createGroupWorkout = (invitation: WorkoutInvitation): GroupWorkout => {
  return {
    id: `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    participants: [invitation.fromUserId, invitation.toUserId],
    scheduledTime: invitation.scheduledTime,
    muscleGroups: invitation.muscleGroups,
    status: 'scheduled',
    createdAt: new Date(),
  };
};

interface WorkoutInvitationState {
  invitations: WorkoutInvitation[];
  groupWorkouts: GroupWorkout[];
  
  // Actions
  sendInvitation: (invitation: Omit<WorkoutInvitation, 'id' | 'status' | 'createdAt'>) => void;
  acceptInvitation: (invitationId: string) => void;
  declineInvitation: (invitationId: string) => void;
  cancelInvitation: (invitationId: string) => void;
  getPendingInvitations: (userId: string) => WorkoutInvitation[];
  getSentInvitations: (userId: string) => WorkoutInvitation[];
}

export const useWorkoutInvitationStore = create<WorkoutInvitationState>((set, get) => ({
  invitations: [],
  groupWorkouts: [],

  /**
   * Send a workout invitation
   */
  sendInvitation: (invitationData) => {
    const invitation: WorkoutInvitation = {
      ...invitationData,
      id: `invitation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: 'pending',
      createdAt: new Date(),
    };

    set((state) => ({
      invitations: [invitation, ...state.invitations],
    }));
  },

  /**
   * Accept an invitation and create a group workout
   */
  acceptInvitation: (invitationId) => {
    const state = get();
    const invitation = state.invitations.find((inv) => inv.id === invitationId);
    
    if (!invitation || invitation.status !== 'pending') {
      return;
    }

    // Create group workout
    const groupWorkout = createGroupWorkout(invitation);

    // Update invitation
    const updatedInvitations = state.invitations.map((inv) =>
      inv.id === invitationId
        ? {...inv, status: 'accepted', groupWorkoutId: groupWorkout.id}
        : inv
    );

    set({
      invitations: updatedInvitations,
      groupWorkouts: [groupWorkout, ...state.groupWorkouts],
    });
  },

  /**
   * Decline an invitation
   */
  declineInvitation: (invitationId) => {
    set((state) => ({
      invitations: state.invitations.map((inv) =>
        inv.id === invitationId ? {...inv, status: 'declined'} : inv
      ),
    }));
  },

  /**
   * Cancel an invitation (by sender)
   */
  cancelInvitation: (invitationId) => {
    set((state) => ({
      invitations: state.invitations.map((inv) =>
        inv.id === invitationId ? {...inv, status: 'cancelled'} : inv
      ),
    }));
  },

  /**
   * Get pending invitations for a user
   */
  getPendingInvitations: (userId) => {
    const state = get();
    return state.invitations.filter(
      (inv) => inv.toUserId === userId && inv.status === 'pending'
    );
  },

  /**
   * Get sent invitations by a user
   */
  getSentInvitations: (userId) => {
    const state = get();
    return state.invitations.filter(
      (inv) => inv.fromUserId === userId && inv.status === 'pending'
    );
  },

}));

