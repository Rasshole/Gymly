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

/** Web email-confirm page (user taps "Åbn Gymly" before app opens). */
export const GYMLY_EMAIL_CONFIRM_WEB = 'https://gymlyapp.com/confirm';

/**
 * Optional redirect if you re-enable confirm-email in Supabase (not required for signup).
 * Site URL: https://gymlyapp.com
 */
export const SUPABASE_EMAIL_REDIRECT = GYMLY_EMAIL_CONFIRM_WEB;

/** Signup/login do not require verified email — disable "Confirm email" in Supabase Dashboard. */
export const SUPABASE_REQUIRE_EMAIL_CONFIRMATION = false;

/**
 * Password reset in browser (PKCE verifier is not in the app mail client).
 * Also add https://gymlyapp.com/reset-password to Redirect URLs.
 */
export const SUPABASE_PASSWORD_RESET_REDIRECT = 'https://gymlyapp.com/reset-password';

/** After web reset — opens app (never App Store). */
export const SUPABASE_PASSWORD_RESET_SUCCESS_DEEP_LINK =
  `${GYMLY_DEEP_LINK_SCHEME}://auth/callback?flow=password_reset_success`;

/** @deprecated Use GYMLY_EMAIL_CONFIRM_WEB */
export const SUPABASE_LEGACY_EMAIL_CONFIRM_WEB = GYMLY_EMAIL_CONFIRM_WEB;
