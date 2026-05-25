/**
 * Navigation helpers after auth deep link handling.
 */

import {navigationRef} from '@/navigation/navigationRef';
import {useAppStore} from '@/store/appStore';
import type {AuthTokens} from '@/types/auth.types';
import type {User} from '@/types/user.types';
import {
  logAuthDeepLinkEvent,
  setPasswordRecoveryActive,
} from '@/services/auth/authDeepLink';

export function navigateToResetPassword(): void {
  setPasswordRecoveryActive(true);
  useAppStore.getState().setLoading(false);
  if (!navigationRef.isReady()) {
    logAuthDeepLinkEvent('navigation not ready for ResetPassword');
    return;
  }
  navigationRef.reset({
    index: 0,
    routes: [{name: 'ResetPassword'}],
  });
  logAuthDeepLinkEvent('navigated to ResetPassword');
}

export function navigateToLogin(): void {
  useAppStore.getState().setLoading(false);
  if (!navigationRef.isReady()) {
    return;
  }
  navigationRef.reset({
    index: 0,
    routes: [
      {
        name: 'Auth',
        state: {routes: [{name: 'Login'}], index: 0},
      },
    ],
  });
}

export async function applySignedInFromDeepLink(
  user: User,
  tokens: AuthTokens,
): Promise<void> {
  useAppStore.getState().login(user, tokens);
  useAppStore.getState().setLoading(false);
  logAuthDeepLinkEvent('app session restored — Main');
}
