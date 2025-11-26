/**
 * PR Store
 * Manages personal records and rep tracking
 */

import {create} from 'zustand';
import {PersonalRecord, RepRecord, ExerciseType} from '@/types/pr.types';

interface PRState {
  personalRecords: PersonalRecord[];
  repRecords: RepRecord[];
  
  // Actions
  addPR: (pr: Omit<PersonalRecord, 'id' | 'date'>) => void;
  updatePR: (prId: string, updates: Partial<PersonalRecord>) => void;
  deletePR: (prId: string) => void;
  getPR: (exercise: ExerciseType) => PersonalRecord | undefined;
  getAllPRs: () => PersonalRecord[];
  
  addRepRecord: (rep: Omit<RepRecord, 'id' | 'date'>) => void;
  updateRepRecord: (repId: string, updates: Partial<RepRecord>) => void;
  deleteRepRecord: (repId: string) => void;
  getRepRecord: (exercise: ExerciseType) => RepRecord | undefined;
  getAllRepRecords: () => RepRecord[];
}

export const usePRStore = create<PRState>((set, get) => ({
  personalRecords: [],
  repRecords: [],

  /**
   * Add a new personal record
   */
  addPR: (prData) => {
    const pr: PersonalRecord = {
      ...prData,
      id: `pr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      date: new Date(),
    };
    
    set((state) => {
      // Remove existing PR for this exercise if it exists
      const filtered = state.personalRecords.filter(
        p => p.exercise !== pr.exercise || p.userId !== pr.userId
      );
      return {
        personalRecords: [pr, ...filtered],
      };
    });
  },

  /**
   * Update a personal record
   */
  updatePR: (prId, updates) => {
    set((state) => ({
      personalRecords: state.personalRecords.map((pr) =>
        pr.id === prId ? {...pr, ...updates} : pr
      ),
    }));
  },

  /**
   * Delete a personal record
   */
  deletePR: (prId) => {
    set((state) => ({
      personalRecords: state.personalRecords.filter((pr) => pr.id !== prId),
    }));
  },

  /**
   * Get PR for a specific exercise
   */
  getPR: (exercise) => {
    const state = get();
    return state.personalRecords.find(
      pr => pr.exercise === exercise && pr.userId === 'current_user'
    );
  },

  /**
   * Get all PRs
   */
  getAllPRs: () => {
    const state = get();
    return state.personalRecords.filter(pr => pr.userId === 'current_user');
  },

  /**
   * Add a new rep record
   */
  addRepRecord: (repData) => {
    const rep: RepRecord = {
      ...repData,
      id: `rep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      date: new Date(),
    };
    
    set((state) => {
      // Remove existing rep record for this exercise if it exists
      const filtered = state.repRecords.filter(
        r => r.exercise !== rep.exercise || r.userId !== rep.userId
      );
      return {
        repRecords: [rep, ...filtered],
      };
    });
  },

  /**
   * Update a rep record
   */
  updateRepRecord: (repId, updates) => {
    set((state) => ({
      repRecords: state.repRecords.map((rep) =>
        rep.id === repId ? {...rep, ...updates} : rep
      ),
    }));
  },

  /**
   * Delete a rep record
   */
  deleteRepRecord: (repId) => {
    set((state) => ({
      repRecords: state.repRecords.filter((rep) => rep.id !== repId),
    }));
  },

  /**
   * Get rep record for a specific exercise
   */
  getRepRecord: (exercise) => {
    const state = get();
    return state.repRecords.find(
      rep => rep.exercise === exercise && rep.userId === 'current_user'
    );
  },

  /**
   * Get all rep records
   */
  getAllRepRecords: () => {
    const state = get();
    return state.repRecords.filter(rep => rep.userId === 'current_user');
  },
}));



