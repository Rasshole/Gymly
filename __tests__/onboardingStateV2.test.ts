/**
 * @jest-environment node
 */

import {
  evaluateOnboardingState,
  hasRequiredProfileIdentity,
  hasUsableUsername,
} from '@/services/onboarding/onboardingState';
import type {User} from '@/types/user.types';

function baseUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    email: 'p@gymly.app',
    username: 'patrick',
    displayName: 'Patrick',
    privacySettings: {
      profileVisibility: 'friends',
      locationSharingEnabled: true,
      showWorkoutHistory: true,
      allowFriendRequests: true,
      showOnlineStatus: true,
    },
    gdprConsent: {
      privacyPolicyAccepted: true,
      termsOfServiceAccepted: true,
      dataRetentionConsent: true,
      marketingConsent: false,
      analyticsConsent: false,
      locationTrackingConsent: false,
      consentDate: new Date(),
      privacyPolicyVersion: '1.0.0',
      termsOfServiceVersion: '1.0.0',
      consentHistory: [],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('onboardingState V2', () => {
  it('completes with name + username only (gym optional)', () => {
    const user = baseUser({favoriteGyms: []});
    expect(hasRequiredProfileIdentity(user)).toBe(true);
    expect(evaluateOnboardingState({user}).status).toBe('COMPLETE');
  });

  it('is incomplete without usable username', () => {
    const user = baseUser({username: 'u_abcdef123456', usernameRequiresChange: true});
    expect(hasUsableUsername(user)).toBe(false);
    const state = evaluateOnboardingState({user});
    expect(state.status).toBe('INCOMPLETE');
    if (state.status === 'INCOMPLETE') {
      expect(state.firstMissingStep).toBe('profile');
    }
  });

  it('metadata flag completes even without gym', () => {
    const user = baseUser({
      username: 'temp',
      usernameRequiresChange: true,
      favoriteGyms: [],
    });
    expect(
      evaluateOnboardingState({user, metadataCompleteFlag: true}).status,
    ).toBe('COMPLETE');
  });

  it('existing users with real identity are not forced back', () => {
    const user = baseUser({
      displayName: 'Sofie Hansen',
      username: 'sofie_h',
      favoriteGyms: undefined,
    });
    expect(evaluateOnboardingState({user}).status).toBe('COMPLETE');
  });

  it('email as displayName is not usable and keeps onboarding open', () => {
    const user = baseUser({
      displayName: 'p@gymly.app',
      username: 'patrick',
    });
    expect(hasRequiredProfileIdentity(user)).toBe(false);
    const state = evaluateOnboardingState({user});
    expect(state.status).toBe('INCOMPLETE');
    if (state.status === 'INCOMPLETE') {
      expect(state.firstMissingStep).toBe('profile');
    }
  });
});
