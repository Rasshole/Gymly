/**
 * Leaderboard Stats Updater
 * Kaldes når check-in, workout, PR eller social workout sker.
 * I produktion: Cloud Functions opdaterer Firestore.
 * Lokalt: Kan bruges til at invalidere cache eller trigge client-side opdatering.
 */

import {USE_FIRESTORE_LEADERBOARD} from '@/config/leaderboardConfig';

export type LeaderboardEvent =
  | {type: 'checkIn'; userId: string; gymId: string}
  | {type: 'workout'; userId: string; durationMinutes: number; gymId?: string; muscleGroup?: string; friendIds?: string[]}
  | {type: 'pr'; userId: string; exercise: string; weightKg: number}
  | {type: 'checkOut'; userId: string; gymId: string; durationMinutes: number};

/**
 * Kald efter check-in
 * Cloud Function: onCheckIn -> increment checkIns.weekly/monthly/allTime, update gym leaderboard
 */
export function onCheckIn(userId: string, gymId: string): void {
  if (USE_FIRESTORE_LEADERBOARD) {
    // TODO: Cloud Function eller client write
    // await updateUserLeaderboardStats(userId, { checkIns: increment(1) })
    // await updateGymLeaderboard(gymId, userId, { checkIns: increment(1) })
  }
  // Mock: ingen opdatering – data kommer fra store
}

/**
 * Kald efter workout afsluttes
 * Cloud Function: onWorkoutComplete -> increment trainingMinutes, socialWorkouts (hvis med venner),
 *                update muscleGroupsTrained, recalc streak
 */
export function onWorkoutComplete(
  userId: string,
  durationMinutes: number,
  options?: {gymId?: string; muscleGroup?: string; friendIds?: string[]}
): void {
  if (USE_FIRESTORE_LEADERBOARD) {
    // TODO: Cloud Function
    // - trainingMinutes.weekly += duration, osv.
    // - hvis friendIds.length > 0: socialWorkouts += 1
    // - muscleGroupsTrained: add muscleGroup til set
    // - streak: recalc baseret på seneste check-ins
  }
}

/**
 * Kald efter PR slået
 * Cloud Function: onPRSet -> increment prs, update strengthPRs.bench/squat/deadlift
 */
export function onPRSet(
  userId: string,
  exercise: string,
  weightKg: number
): void {
  if (USE_FIRESTORE_LEADERBOARD) {
    // TODO: Map exercise til bench/squat/deadlift
    // - prs.weekly += 1, osv.
    // - strengthPRs[exercise] = max(strengthPRs[exercise], weightKg)
  }
}

/**
 * Kald efter check-out (for gym activity score og Weekly Champion)
 * Cloud Function: onCheckOut -> update gym leaderboard med session duration
 */
export function onCheckOut(
  userId: string,
  gymId: string,
  durationMinutes: number
): void {
  if (USE_FIRESTORE_LEADERBOARD) {
    // TODO: Opdater gym leaderboard med activity score for ugen
    // Weekly Champion = bruger med højeste weekly activityScore i gymmet
  }
}
