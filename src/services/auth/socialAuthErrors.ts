/**
 * Social auth cancel / failure classification (no token logging).
 */

export class SocialAuthCancelledError extends Error {
  readonly code = 'SOCIAL_AUTH_CANCELLED';
  constructor(provider: 'apple' | 'google') {
    super(`${provider}_cancelled`);
    this.name = 'SocialAuthCancelledError';
  }
}

export function isSocialAuthCancelled(error: unknown): boolean {
  if (error instanceof SocialAuthCancelledError) {
    return true;
  }
  if (!error || typeof error !== 'object') {
    return false;
  }
  const e = error as {code?: string; message?: string; name?: string};
  if (e.name === 'SocialAuthCancelledError' || e.code === 'SOCIAL_AUTH_CANCELLED') {
    return true;
  }
  if (e.code === 'ERR_REQUEST_CANCELED' || e.code === 'SIGN_IN_CANCELLED') {
    return true;
  }
  const msg = (e.message || '').toLowerCase();
  return (
    msg.includes('cancel') ||
    msg.includes('annulleret') ||
    msg.includes('cancelled')
  );
}

export function humanizeSocialAuthError(
  error: unknown,
  provider: 'apple' | 'google',
): string {
  if (isSocialAuthCancelled(error)) {
    return '';
  }
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  const lower = msg.toLowerCase();
  if (
    lower.includes('google_sign_in_not_configured') ||
    lower.includes('google_web_client_id') ||
    lower.includes('google_ios_client_id') ||
    (lower.includes('ikke konfigureret') && lower.includes('google'))
  ) {
    return provider === 'google'
      ? 'Google-login er midlertidigt utilgængelig. Prøv igen senere, eller log ind med e-mail.'
      : 'Login er midlertidigt utilgængelig. Prøv igen senere.';
  }
  if (
    lower.includes('network') ||
    lower.includes('fetch') ||
    lower.includes('timeout')
  ) {
    return 'Netværksfejl. Tjek forbindelsen og prøv igen.';
  }
  if (
    lower.includes('identity') ||
    lower.includes('already registered') ||
    lower.includes('already been registered') ||
    lower.includes('email')
  ) {
    return 'Denne e-mail er allerede knyttet til en Gymly-konto. Log ind med den oprindelige metode, eller brug den samme udbyder.';
  }
  // Never surface internal env/config identifiers to the user.
  if (/GOOGLE_[A-Z0-9_]+|CLIENT_ID|ENVFILE|SUPABASE_/i.test(msg)) {
    return provider === 'apple'
      ? 'Apple-login mislykkedes. Prøv igen.'
      : 'Google-login mislykkedes. Prøv igen.';
  }
  if (msg.trim()) {
    return msg;
  }
  return provider === 'apple'
    ? 'Apple-login mislykkedes. Prøv igen.'
    : 'Google-login mislykkedes. Prøv igen.';
}
