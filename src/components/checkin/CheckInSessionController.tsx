/**
 * Global: auto-checkout (useAutoCheckoutController).
 * Realtime på egne check_ins (tjek ud) styres i GymlyRealtimeHub.
 */
import {useAutoCheckoutController} from '@/hooks/useAutoCheckoutController';

export function CheckInSessionController() {
  useAutoCheckoutController();
  return null;
}
