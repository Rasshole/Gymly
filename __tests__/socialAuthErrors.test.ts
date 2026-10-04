import {
  humanizeSocialAuthError,
  isSocialAuthCancelled,
  SocialAuthCancelledError,
} from '@/services/auth/socialAuthErrors';

describe('socialAuthErrors', () => {
  it('treats cancellation as silent (empty humanized message)', () => {
    expect(isSocialAuthCancelled(new SocialAuthCancelledError('google'))).toBe(
      true,
    );
    expect(
      humanizeSocialAuthError(new SocialAuthCancelledError('google'), 'google'),
    ).toBe('');
  });

  it('never exposes GOOGLE_WEB_CLIENT_ID or config key names', () => {
    const msg = humanizeSocialAuthError(
      new Error(
        'Google-login er ikke konfigureret endnu (mangler GOOGLE_WEB_CLIENT_ID).',
      ),
      'google',
    );
    expect(msg.toLowerCase()).not.toContain('google_web_client_id');
    expect(msg.toLowerCase()).not.toContain('client_id');
    expect(msg.length).toBeGreaterThan(10);
  });

  it('maps GOOGLE_SIGN_IN_NOT_CONFIGURED to a friendly google message', () => {
    const msg = humanizeSocialAuthError(
      new Error('GOOGLE_SIGN_IN_NOT_CONFIGURED'),
      'google',
    );
    expect(msg.toLowerCase()).toContain('google');
    expect(msg.toLowerCase()).not.toContain('google_sign_in_not_configured');
  });
});
