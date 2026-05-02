/**
 * __DEV__ – hurtige scenarier uden at vente. Kald manuelt fra f.eks. en debug-knap.
 */
import {AppState} from 'react-native';
import {
  clearAutoCheckoutDevOverrides,
  setAutoCheckoutDevOverrides,
} from '@/services/autoCheckout/autoCheckoutDevOverrides';
import {runAutoCheckoutEvaluation} from '@/services/autoCheckout/runAutoCheckoutEvaluation';

export async function devSimulateInactivity5hCheckout(userId: string): Promise<void> {
  if (!__DEV__) {
    return;
  }
  setAutoCheckoutDevOverrides({lastSeenHoursAgo: 5, distanceMeters: null});
  await runAutoCheckoutEvaluation({
    userId,
    appState: AppState.currentState,
  });
  clearAutoCheckoutDevOverrides();
}

/** >800m, væk i 8+ min */
export async function devSimulateOutside7mCheckout(
  userId: string,
): Promise<void> {
  if (!__DEV__) {
    return;
  }
  setAutoCheckoutDevOverrides({
    distanceMeters: 900,
    awayStartedMinutesAgo: 8,
  });
  await runAutoCheckoutEvaluation({
    userId,
    appState: 'active',
  });
  clearAutoCheckoutDevOverrides();
}

/** 500m buffer, væk i 16+ min */
export async function devSimulateBuffer16mCheckout(
  userId: string,
): Promise<void> {
  if (!__DEV__) {
    return;
  }
  setAutoCheckoutDevOverrides({
    distanceMeters: 500,
    awayStartedMinutesAgo: 16,
  });
  await runAutoCheckoutEvaluation({
    userId,
    appState: 'active',
  });
  clearAutoCheckoutDevOverrides();
}

/** 300m – skal rydde away og ikke tjekke ud */
export async function devSimulateBackInsideSafe(
  userId: string,
): Promise<void> {
  if (!__DEV__) {
    return;
  }
  setAutoCheckoutDevOverrides({distanceMeters: 300});
  await runAutoCheckoutEvaluation({userId, appState: 'active'});
  clearAutoCheckoutDevOverrides();
}
