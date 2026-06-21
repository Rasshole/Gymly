import {create} from 'zustand';

export type AutoCheckoutReviewPayload = {
  checkInId: string;
  userId: string;
  gymId: string;
  gymName: string;
  workoutType: string;
  durationMinutes: number;
  startedAt: string;
};

type CheckInUIState = {
  showAwayZoneWarning: boolean;
  setShowAwayZoneWarning: (v: boolean) => void;
  /** Lige afsluttet auto-checkout — vis bekræftelse med det samme. */
  immediateAutoCheckoutReview: AutoCheckoutReviewPayload | null;
  notifyImmediateAutoCheckoutReview: (payload: AutoCheckoutReviewPayload) => void;
  clearImmediateAutoCheckoutReview: () => void;
};

export const useCheckInUIStore = create<CheckInUIState>(set => ({
  showAwayZoneWarning: false,
  setShowAwayZoneWarning: v => set({showAwayZoneWarning: v}),
  immediateAutoCheckoutReview: null,
  notifyImmediateAutoCheckoutReview: payload =>
    set({immediateAutoCheckoutReview: payload, showAwayZoneWarning: false}),
  clearImmediateAutoCheckoutReview: () =>
    set({immediateAutoCheckoutReview: null}),
}));

/** @deprecated use AutoCheckoutReviewPayload */
export type PendingAutoCheckoutSummary = AutoCheckoutReviewPayload;
