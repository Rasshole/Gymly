/**
 * @jest-environment node
 */

import {
  assertPasswordPolicy,
  getPasswordIssue,
  isPasswordPolicyError,
  isPasswordValid,
  PasswordPolicyError,
} from '../src/services/auth/passwordPolicy';

describe('password policy', () => {
  it('requires length, upper, lower, and a digit — same order as signup', () => {
    expect(getPasswordIssue('short')).toBe('minLength');
    expect(getPasswordIssue('longpass')).toBe('upper');
    expect(getPasswordIssue('LONGPASS')).toBe('lower');
    expect(getPasswordIssue('Longpass')).toBe('digit');
    expect(getPasswordIssue('Longpass1')).toBeNull();
    expect(isPasswordValid('Longpass1')).toBe(true);
  });

  it('throws PasswordPolicyError with the existing Danish uppercase message', () => {
    expect(() => assertPasswordPolicy('longpass1')).toThrow(PasswordPolicyError);
    try {
      assertPasswordPolicy('longpass1');
    } catch (e) {
      expect(isPasswordPolicyError(e)).toBe(true);
      expect((e as PasswordPolicyError).issue).toBe('upper');
      expect((e as Error).message).toBe(
        'Adgangskoden skal indeholde mindst ét stort bogstav',
      );
    }
  });
});
