/**
 * Unified Gymly onboarding completion contract (V2).
 * Auth creates a session; Gymly requires name + username only.
 * Gym selection is optional (skippable). Location/notifications are not required.
 */

import type {User} from '@/types/user.types';
import {isUsablePublicDisplayName} from '@/utils/displayName';
import {isUsernameFormatValid, normalizeUsernameForStorage} from '@/utils/usernameRules';

/** Ordered Gymly steps after authentication (gym is optional UX, not a hard gate). */
export type OnboardingStepId = 'profile' | 'gym';

export type OnboardingState =
  | {status: 'COMPLETE'}
  | {status: 'INCOMPLETE'; firstMissingStep: OnboardingStepId};

export const ONBOARDING_STEP_ORDER: OnboardingStepId[] = ['profile', 'gym'];

/** Metadata flag written when Gymly onboarding is finished (profile done; gym optional). */
export const GYMLY_ONBOARDING_COMPLETE_KEY = 'gymlyOnboardingComplete';

const PLACEHOLDER_USERNAMES = new Set(['gymly_user', 'appleuser', 'googleuser']);

export type OnboardingStateInput = {
  user: User;
  /** From auth user_metadata when available */
  metadataCompleteFlag?: boolean;
};

export function hasUsableDisplayName(user: User): boolean {
  return isUsablePublicDisplayName(user.displayName);
}

export function hasUsableUsername(user: User): boolean {
  const u = normalizeUsernameForStorage(user.username || '');
  if (!isUsernameFormatValid(u)) {
    return false;
  }
  if (PLACEHOLDER_USERNAMES.has(u)) {
    return false;
  }
  if (user.usernameRequiresChange === true) {
    return false;
  }
  // Temporary bootstrap usernames from ensureGymlyProfile
  if (/^u_[a-f0-9]{8,}$/i.test(u)) {
    return false;
  }
  return true;
}

/** V2: name + username only. */
export function hasRequiredProfileIdentity(user: User): boolean {
  return hasUsableDisplayName(user) && hasUsableUsername(user);
}

/**
 * Pure evaluation of onboarding completeness from persisted inputs.
 * Existing users with a real name+username pass without the metadata flag.
 */
export function evaluateOnboardingState(
  input: OnboardingStateInput,
): OnboardingState {
  const {user, metadataCompleteFlag} = input;

  if (metadataCompleteFlag === true) {
    return {status: 'COMPLETE'};
  }

  if (!hasRequiredProfileIdentity(user)) {
    return {status: 'INCOMPLETE', firstMissingStep: 'profile'};
  }

  // Gym is optional — usable profile is enough to enter Gymly.
  return {status: 'COMPLETE'};
}

export async function getOnboardingState(user: User): Promise<OnboardingState> {
  const meta = (user as User & {_rawOnboardingComplete?: boolean})
    ._rawOnboardingComplete;
  return evaluateOnboardingState({
    user,
    metadataCompleteFlag: meta === true,
  });
}

export async function getOnboardingStateFromMetadata(
  user: User,
  userMetadata: Record<string, unknown> | null | undefined,
): Promise<OnboardingState> {
  const flag = userMetadata?.[GYMLY_ONBOARDING_COMPLETE_KEY] === true;
  return evaluateOnboardingState({
    user,
    metadataCompleteFlag: flag,
  });
}
