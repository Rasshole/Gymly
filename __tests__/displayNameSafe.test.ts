/**
 * @jest-environment node
 */

import {
  avatarInitialsFromDisplayName,
  displayNameFromAuthMetadata,
  firstUsableDisplayName,
  getNeutralDisplayNameFallback,
  isEmailLike,
  isUsablePublicDisplayName,
  resolveLiveDisplayName,
  safeDisplayName,
} from '@/utils/displayName';
import {hasUsableDisplayName} from '@/services/onboarding/onboardingState';
import type {User} from '@/types/user.types';
import {setRuntimeLanguage} from '@/i18n/runtimeLanguage';

function baseUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    email: 'member@example.com',
    username: 'sofie_h',
    displayName: 'Sofie Hansen',
    privacySettings: {
      profileVisibility: 'friends',
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

describe('displayName public validation', () => {
  beforeAll(() => {
    setRuntimeLanguage('da');
  });

  it('rejects empty, UUID, email and Apple relay', () => {
    expect(isUsablePublicDisplayName('')).toBe(false);
    expect(isUsablePublicDisplayName('  ')).toBe(false);
    expect(
      isUsablePublicDisplayName('550e8400-e29b-41d4-a716-446655440000'),
    ).toBe(false);
    expect(isEmailLike('member@example.com')).toBe(true);
    expect(isUsablePublicDisplayName('member@example.com')).toBe(false);
    expect(
      isUsablePublicDisplayName('abc123@privaterelay.appleid.com'),
    ).toBe(false);
    expect(isUsablePublicDisplayName('Gymly-bruger')).toBe(false);
    expect(isUsablePublicDisplayName('Gymly member')).toBe(false);
  });

  it('accepts ordinary names with spaces, accents, hyphens, non-Latin', () => {
    expect(isUsablePublicDisplayName('Sofie Hansen')).toBe(true);
    expect(isUsablePublicDisplayName('José-María')).toBe(true);
    expect(isUsablePublicDisplayName('Ægir Ørsted')).toBe(true);
    expect(isUsablePublicDisplayName('田中太郎')).toBe(true);
  });

  it('never uses email local-part as a name or initials', () => {
    expect(firstUsableDisplayName('member@example.com')).toBeUndefined();
    expect(safeDisplayName('member@example.com')).toBe(
      getNeutralDisplayNameFallback(),
    );
    expect(avatarInitialsFromDisplayName('member@example.com')).toBe('G');
    expect(avatarInitialsFromDisplayName('Sofie Hansen')).toBe('SH');
  });

  it('keeps safeDisplayName and hasUsableDisplayName aligned', () => {
    const withEmail = baseUser({displayName: 'member@example.com'});
    expect(hasUsableDisplayName(withEmail)).toBe(false);
    expect(isUsablePublicDisplayName(withEmail.displayName)).toBe(false);

    const withName = baseUser({displayName: 'Sofie Hansen'});
    expect(hasUsableDisplayName(withName)).toBe(true);
    expect(isUsablePublicDisplayName(withName.displayName)).toBe(true);

    const withNeutral = baseUser({displayName: getNeutralDisplayNameFallback()});
    expect(hasUsableDisplayName(withNeutral)).toBe(false);
  });

  it('live list: valid profile name wins over email in check-in', () => {
    expect(
      resolveLiveDisplayName({
        profileDisplayName: 'Sofie Hansen',
        profileUsername: 'sofie_h',
        checkInDisplayName: 'member@example.com',
      }),
    ).toBe('Sofie Hansen');
  });

  it('live list: missing profile + email check-in → neutral fallback', () => {
    expect(
      resolveLiveDisplayName({
        profileDisplayName: '',
        profileUsername: 'u_abcdef12345678',
        checkInDisplayName: 'member@example.com',
      }),
    ).toBe(getNeutralDisplayNameFallback());
  });

  it('auth metadata email is not accepted as a name', () => {
    expect(
      displayNameFromAuthMetadata({
        display_name: 'member@example.com',
        full_name: 'abc@privaterelay.appleid.com',
        name: 'member@example.com',
      }),
    ).toBeUndefined();
    expect(
      displayNameFromAuthMetadata({
        full_name: 'Alex Example',
        email: 'member@example.com',
      }),
    ).toBe('Alex Example');
  });

  it('preserves a valid user-edited name over provider/email candidates', () => {
    expect(
      firstUsableDisplayName(
        'Sofie Hansen',
        'member@example.com',
        'Google Name',
      ),
    ).toBe('Sofie Hansen');
  });

  it('own and other card initials stay safe when name is email', () => {
    expect(avatarInitialsFromDisplayName(undefined, undefined)).toBe('G');
    expect(
      avatarInitialsFromDisplayName('member@example.com', 'u_abcdef12345678'),
    ).toBe('G');
  });
});
