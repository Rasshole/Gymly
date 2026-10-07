import {
  LOCAL_QA_SUPABASE_ANON_KEY,
  LOCAL_QA_SUPABASE_URL,
} from '@/config/supabaseLocalQa';

const HOSTED_SUPABASE_URL = 'https://ykantlsuszpauddasqvz.supabase.co';
const HOSTED_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrYW50bHN1c3pwYXVkZGFzcXZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NzI4MzEsImV4cCI6MjA4ODQ0ODgzMX0.vungVzubJCR68aSSusjtmoGNQgLaIOkdQN8ipo9bt-I';

/** Host only. Avoid `new URL` here: this module loads before the URL polyfill. */
export function hostnameFromUrl(raw: string): string {
  const match = raw.trim().match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i);
  if (!match) {
    return '';
  }
  let host = match[1];
  const at = host.lastIndexOf('@');
  if (at >= 0) {
    host = host.slice(at + 1);
  }
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    return end >= 0 ? host.slice(1, end).toLowerCase() : '';
  }
  return host.split(':')[0].toLowerCase();
}

export function isPrivateQaSupabaseUrl(raw: string): boolean {
  const host = hostnameFromUrl(raw);
  if (!host) {
    return false;
  }
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) {
    return true;
  }
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
}

/**
 * Debug may opt into local QA. Release always keeps the hosted project,
 * even if a local override is present on the machine that built the bundle.
 */
export function selectSupabaseBackend(input: {
  dev: boolean;
  hostedUrl: string;
  hostedAnonKey: string;
  localUrl: string;
  localAnonKey: string;
}): {url: string; anonKey: string} {
  if (!input.dev) {
    return {url: input.hostedUrl, anonKey: input.hostedAnonKey};
  }
  const url = input.localUrl.trim();
  const anonKey = input.localAnonKey.trim();
  if (url && anonKey && isPrivateQaSupabaseUrl(url)) {
    return {url, anonKey};
  }
  return {url: input.hostedUrl, anonKey: input.hostedAnonKey};
}

const resolvedSupabase = selectSupabaseBackend({
  dev: typeof __DEV__ !== 'undefined' && __DEV__,
  hostedUrl: HOSTED_SUPABASE_URL,
  hostedAnonKey: HOSTED_SUPABASE_ANON_KEY,
  localUrl: LOCAL_QA_SUPABASE_URL,
  localAnonKey: LOCAL_QA_SUPABASE_ANON_KEY,
});

export const SUPABASE_URL = resolvedSupabase.url;
export const SUPABASE_ANON_KEY = resolvedSupabase.anonKey;

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

/**
 * Local Supabase QA (localhost or a private LAN host). Production https hosts are not QA.
 */
export function isLocalQaSupabaseBackend(): boolean {
  return isPrivateQaSupabaseUrl(SUPABASE_URL);
}
