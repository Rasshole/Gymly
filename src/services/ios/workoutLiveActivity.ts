/**
 * iOS Live Activity (ActivityKit). Fejler stille — må aldrig blokere check-in/checkout.
 */

import {NativeModules, Platform} from 'react-native';

type LiveActivityModule = {
  startLiveActivity: (
    workoutType: string,
    centerName: string,
    startedAtMs: number,
  ) => Promise<unknown>;
  endLiveActivity: () => Promise<unknown>;
  cleanupAllLiveActivities?: () => Promise<unknown>;
};

function nativeMod(): LiveActivityModule | undefined {
  if (Platform.OS !== 'ios') {
    return undefined;
  }
  return NativeModules.GymlyLiveActivityModule as LiveActivityModule | undefined;
}

export async function startWorkoutLiveActivity(
  workoutTypeLabel: string,
  centerName: string,
  startedAt: Date,
): Promise<void> {
  const mod = nativeMod();
  if (!mod?.startLiveActivity) {
    return;
  }
  try {
    if (__DEV__) {
      console.log('[LiveActivity] starting');
    }
    await cleanupAllGymlyLiveActivities('start_safety');
    await mod.startLiveActivity(
      workoutTypeLabel,
      centerName,
      startedAt.getTime(),
    );
    if (__DEV__) {
      console.log('[LiveActivity] started');
    }
  } catch {
    /* ignore */
  }
}

export async function endWorkoutLiveActivity(): Promise<void> {
  const mod = nativeMod();
  if (!mod?.endLiveActivity) {
    return;
  }
  try {
    if (__DEV__) {
      console.log('[LiveActivity] ending');
    }
    await mod.endLiveActivity();
    if (__DEV__) {
      console.log('[LiveActivity] ended successfully');
    }
  } catch {
    /* ignore */
  }
}

export async function cleanupAllGymlyLiveActivities(
  reason: 'manual' | 'auto' | 'logout' | 'stale' | 'foreground' | 'launch' | 'start_safety' = 'stale',
): Promise<void> {
  const mod = nativeMod();
  if (!mod) {
    return;
  }
  if (__DEV__) {
    console.log('[LiveActivity] stale cleanup triggered', {reason});
  }
  try {
    if (mod.cleanupAllLiveActivities) {
      await mod.cleanupAllLiveActivities();
    } else if (mod.endLiveActivity) {
      await mod.endLiveActivity();
    }
    if (__DEV__) {
      console.log('[LiveActivity] ended successfully');
    }
  } catch {
    /* ignore */
  }
}
