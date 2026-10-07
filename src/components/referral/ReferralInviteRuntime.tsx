/**
 * Applies a saved invite code when an account exists, including after
 * onboarding is left and resumed. Renders nothing.
 */

import {useEffect} from 'react';
import {applyPendingInviteCode} from '@/services/referral/applyPendingInvite';
import {isInviteFiveFriendsSurfaceEnabled} from '@/services/referral/inviteSurface';
import {useAppStore} from '@/store/appStore';

export default function ReferralInviteRuntime() {
  const userId = useAppStore(s => s.user?.id);
  const onboardingComplete = useAppStore(s => s.onboardingComplete);

  useEffect(() => {
    if (!userId || !isInviteFiveFriendsSurfaceEnabled()) {
      return;
    }
    void applyPendingInviteCode();
  }, [userId, onboardingComplete]);

  return null;
}
