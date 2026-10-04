/**
 * Password rules used by signup. UI and AuthService must share this.
 * Do not add or remove requirements here without updating signup.
 */

export type PasswordIssue = 'minLength' | 'upper' | 'lower' | 'digit';

export class PasswordPolicyError extends Error {
  readonly issue: PasswordIssue;

  constructor(issue: PasswordIssue, message: string) {
    super(message);
    this.name = 'PasswordPolicyError';
    this.issue = issue;
  }
}

/** First unmet rule, or null when the password satisfies signup policy. */
export function getPasswordIssue(password: string): PasswordIssue | null {
  if (password.length < 8) {
    return 'minLength';
  }
  if (!/[A-Z]/.test(password)) {
    return 'upper';
  }
  if (!/[a-z]/.test(password)) {
    return 'lower';
  }
  if (!/[0-9]/.test(password)) {
    return 'digit';
  }
  return null;
}

export function isPasswordValid(password: string): boolean {
  return getPasswordIssue(password) === null;
}

/** Danish messages kept for AuthService throws (existing signup copy). */
export function passwordIssueMessageDa(issue: PasswordIssue): string {
  switch (issue) {
    case 'minLength':
      return 'Adgangskoden skal være mindst 8 tegn';
    case 'upper':
      return 'Adgangskoden skal indeholde mindst ét stort bogstav';
    case 'lower':
      return 'Adgangskoden skal indeholde mindst ét lille bogstav';
    case 'digit':
      return 'Adgangskoden skal indeholde mindst ét tal';
  }
}

export function assertPasswordPolicy(password: string): void {
  const issue = getPasswordIssue(password);
  if (issue) {
    throw new PasswordPolicyError(issue, passwordIssueMessageDa(issue));
  }
}

export function isPasswordPolicyError(error: unknown): error is PasswordPolicyError {
  return error instanceof PasswordPolicyError;
}
