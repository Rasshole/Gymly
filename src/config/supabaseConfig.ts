export const SUPABASE_URL = 'https://ykantlsuszpauddasqvz.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrYW50bHN1c3pwYXVkZGFzcXZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NzI4MzEsImV4cCI6MjA4ODQ0ODgzMX0.vungVzubJCR68aSSusjtmoGNQgLaIOkdQN8ipo9bt-I';

/** Custom URL scheme (iOS Info.plist + Android intent-filter). */
export const GYMLY_DEEP_LINK_SCHEME = 'gymly';

/** Legacy scheme — still accepted by the app. */
export const GYMLY_LEGACY_DEEP_LINK_SCHEME = 'gymlyapp';

/**
 * Universal / web auth callback (email verify, magic link, PKCE).
 * Dashboard → Authentication → URL Configuration → Redirect URLs.
 */
export const GYMLY_AUTH_CALLBACK_WEB = 'https://gymlyapp.com/auth/callback';

/** Opens the app with the same hash/query as the web callback. */
export const GYMLY_AUTH_CALLBACK_DEEP_LINK = `${GYMLY_DEEP_LINK_SCHEME}://auth/callback`;

/**
 * After email confirm / magic link — redirects via web bridge → gymly://auth/callback.
 * Site URL: https://gymlyapp.com
 */
export const SUPABASE_EMAIL_REDIRECT = GYMLY_AUTH_CALLBACK_WEB;

/**
 * Password reset in browser (PKCE verifier is not in the app mail client).
 * Also add https://gymlyapp.com/reset-password to Redirect URLs.
 */
export const SUPABASE_PASSWORD_RESET_REDIRECT = 'https://gymlyapp.com/reset-password';

/** After web reset — opens app (never App Store). */
export const SUPABASE_PASSWORD_RESET_SUCCESS_DEEP_LINK =
  `${GYMLY_DEEP_LINK_SCHEME}://auth/callback?flow=password_reset_success`;

/** @deprecated Use GYMLY_AUTH_CALLBACK_WEB */
export const SUPABASE_LEGACY_EMAIL_CONFIRM_WEB = 'https://gymlyapp.com/confirm';
export const SUPABASE_ALLOW_UNVERIFIED_LOGIN = false;
