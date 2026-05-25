import {Platform, Vibration} from 'react-native';

export type HapticKind = 'light' | 'medium' | 'success' | 'selection';

/** Lightweight haptic feedback (no extra native deps). */
export function triggerHaptic(kind: HapticKind = 'light'): void {
  if (Platform.OS === 'web') {
    return;
  }
  const ms =
    kind === 'success'
      ? 50
      : kind === 'medium'
        ? 35
        : kind === 'selection'
          ? 12
          : 18;
  try {
    Vibration.vibrate(Platform.OS === 'ios' ? ms : Math.max(10, ms - 8));
  } catch {
    /* ignore */
  }
}
