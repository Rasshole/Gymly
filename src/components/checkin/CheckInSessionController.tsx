/**
 * Global: genopret aktiv session, auto-checkout (kun afstand), recovery-dialog.
 */
import {useAutoCheckoutController} from '@/hooks/useAutoCheckoutController';
import {useRestoreActiveCheckInSession} from '@/hooks/useRestoreActiveCheckInSession';
import {useStaleSessionRecovery} from '@/hooks/useStaleSessionRecovery';
import {AutoCheckoutCompletionHost} from '@/components/checkin/AutoCheckoutCompletionHost';

export function CheckInSessionController() {
  useRestoreActiveCheckInSession();
  useAutoCheckoutController();
  useStaleSessionRecovery();
  return <AutoCheckoutCompletionHost />;
}
