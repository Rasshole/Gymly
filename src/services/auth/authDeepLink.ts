/**
 * Supabase auth deep links — gymly://auth/callback, https://gymlyapp.com/auth/callback,
 * and legacy gymlyapp:// paths.
 */

import {supabase} from '@/services/supabase/supabaseClient';
import AuthService from '@/services/auth/AuthService';
import type {AuthTokens} from '@/types/auth.types';
import type {User} from '@/types/user.types';
import type {Session} from '@supabase/supabase-js';
import {
  GYMLY_AUTH_CALLBACK_DEEP_LINK,
  GYMLY_AUTH_CALLBACK_WEB,
} from '@/config/supabaseConfig';

/** When true, `initialize()` must not auto-login (password recovery in progress). */
let passwordRecoveryActive = false;

export function setPasswordRecoveryActive(active: boolean): void {
  passwordRecoveryActive = active;
  logAuthDeepLinkEvent('password recovery active', active);
}

export function isPasswordRecoveryActive(): boolean {
  return passwordRecoveryActive;
}

export const AUTH_LINK_PREFIXES = [
  'gymly://',
  'gymlyapp://',
  'https://gymlyapp.com',
  'http://gymlyapp.com',
] as const;

export type AuthDeepLinkFlow =
  | 'recovery'
  | 'signup'
  | 'magiclink'
  | 'password_reset_success'
  | 'session_restore'
  | 'unknown';

export type AuthDeepLinkResult =
  | {kind: 'recovery'; session: Session}
  | {kind: 'signed_in'; user: User; tokens: AuthTokens}
  | {kind: 'password_reset_success'}
  | {kind: 'session_restore'}
  | {kind: 'ignored'}
  | {kind: 'error'; message: string};

export type ParsedAuthParams = {
  accessToken: string | null;
  refreshToken: string | null;
  code: string | null;
  tokenHash: string | null;
  type: string | null;
  flow: string | null;
  error: string | null;
  errorDescription: string | null;
};

const logVerbose = (...args: unknown[]) => {
  if (__DEV__) {
    console.log('[AuthDeepLink]', ...args);
  }
};

/** Safe for production — no tokens. */
export const logAuthDeepLinkEvent = (...args: unknown[]) => {
  console.warn('[AuthDeepLink]', ...args);
};

export function isAuthDeepLinkUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  if (!u) {
    return false;
  }
  if (
    u.includes('reset-password-success') ||
    u.includes('password_reset_success') ||
    u.includes('flow=password_reset_success')
  ) {
    return true;
  }
  if (u.includes('gymlyapp://home') || u.includes('gymly://home')) {
    return true;
  }
  if (u.includes('gymly://confirmed') || u.includes('gymlyapp://confirmed')) {
    return true;
  }
  if (
    u.includes('/auth/callback') ||
    u.includes('auth/callback') ||
    u.includes('reset-password')
  ) {
    return true;
  }
  return (
    u.includes('access_token=') ||
    u.includes('refresh_token=') ||
    u.includes('code=') ||
    u.includes('token_hash=') ||
    u.includes('error=') ||
    u.includes('error_code=')
  );
}

function parseParamString(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const s = raw.replace(/^[?#]/, '').trim();
  if (!s) {
    return out;
  }
  for (const pair of s.split('&')) {
    if (!pair) {
      continue;
    }
    const idx = pair.indexOf('=');
    const key = idx >= 0 ? pair.slice(0, idx) : pair;
    const val = idx >= 0 ? pair.slice(idx + 1) : '';
    try {
      out[decodeURIComponent(key)] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

export function parseAuthParamsFromUrl(url: string): ParsedAuthParams {
  const hash = url.split('#')[1] ?? '';
  const queryPart = url.includes('?') ? url.split('?')[1]?.split('#')[0] ?? '' : '';
  const merged = {...parseParamString(queryPart), ...parseParamString(hash)};
  return {
    accessToken: merged.access_token ?? null,
    refreshToken: merged.refresh_token ?? null,
    code: merged.code ?? null,
    tokenHash: merged.token_hash ?? merged.token ?? null,
    type: merged.type ?? null,
    flow: merged.flow ?? null,
    error: merged.error ?? null,
    errorDescription: merged.error_description ?? null,
  };
}

function classifyFlow(url: string, params: ParsedAuthParams): AuthDeepLinkFlow {
  const lower = url.toLowerCase();
  if (
    lower.includes('reset-password-success') ||
    params.flow === 'password_reset_success' ||
    params.flow === 'password-reset-success'
  ) {
    return 'password_reset_success';
  }
  if (lower.includes('gymlyapp://home') || lower.includes('gymly://home')) {
    return 'session_restore';
  }
  if (lower.includes('gymly://confirmed') || lower.includes('gymlyapp://confirmed')) {
    return 'session_restore';
  }
  const type = (params.type ?? '').toLowerCase();
  if (type === 'recovery' || lower.includes('reset-password')) {
    return 'recovery';
  }
  if (type === 'signup' || type === 'invite' || type === 'email_change') {
    return 'signup';
  }
  if (type === 'magiclink') {
    return 'magiclink';
  }
  if (params.accessToken && params.refreshToken) {
    return 'signup';
  }
  if (params.code) {
    return 'signup';
  }
  return 'unknown';
}

export function sessionToAuthTokens(session: Session): AuthTokens {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: (session.expires_at ?? Math.floor(Date.now() / 1000) + 3600) * 1000,
  };
}

async function establishSessionFromParams(
  params: ParsedAuthParams,
): Promise<Session | null> {
  if (params.accessToken && params.refreshToken) {
    logVerbose('setSession from tokens');
    const {data, error} = await supabase.auth.setSession({
      access_token: params.accessToken,
      refresh_token: params.refreshToken,
    });
    if (error) {
      logAuthDeepLinkEvent('setSession failed', error.message);
      return null;
    }
    return data.session ?? (await supabase.auth.getSession()).data.session;
  }

  if (params.code) {
    logVerbose('exchangeCodeForSession');
    const {data, error} = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) {
      logAuthDeepLinkEvent('exchangeCodeForSession failed', error.message);
      return null;
    }
    return data.session ?? (await supabase.auth.getSession()).data.session;
  }

  if (params.tokenHash && (params.type === 'recovery' || params.type === 'signup')) {
    logVerbose('verifyOtp', params.type);
    const {data, error} = await supabase.auth.verifyOtp({
      type: params.type as 'recovery' | 'signup',
      token_hash: params.tokenHash,
    });
    if (error) {
      logAuthDeepLinkEvent('verifyOtp failed', error.message);
      return null;
    }
    return data.session ?? (await supabase.auth.getSession()).data.session;
  }

  const {
    data: {session},
  } = await supabase.auth.getSession();
  return session;
}

/**
 * Handle an incoming auth-related URL (cold start or warm).
 */
export async function handleAuthDeepLink(url: string): Promise<AuthDeepLinkResult> {
  const sanitized = url.trim();
  logAuthDeepLinkEvent('incoming url', summarizeUrlForLog(sanitized));

  if (!isAuthDeepLinkUrl(sanitized)) {
    logVerbose('ignored — not auth-related');
    return {kind: 'ignored'};
  }

  const params = parseAuthParamsFromUrl(sanitized);
  const flow = classifyFlow(sanitized, params);

  if (params.error) {
    const msg = params.errorDescription || params.error;
    logAuthDeepLinkEvent('callback error', params.error, msg);
    return {kind: 'error', message: msg};
  }

  if (flow === 'password_reset_success') {
    logAuthDeepLinkEvent('password reset success');
    return {kind: 'password_reset_success'};
  }

  if (flow === 'session_restore') {
    logAuthDeepLinkEvent('session restore (home link)');
    return {kind: 'session_restore'};
  }

  const session = await establishSessionFromParams(params);
  if (!session?.user) {
    logAuthDeepLinkEvent('no session after callback', flow);
    return {kind: 'error', message: 'Could not restore session from link'};
  }

  const effectiveFlow =
    flow === 'recovery' || params.type === 'recovery' ? 'recovery' : flow;

  if (effectiveFlow === 'recovery') {
    logAuthDeepLinkEvent('recovery session', session.user.id);
    return {kind: 'recovery', session};
  }

  const user = AuthService.getMappedUser(session.user);
  const tokens = sessionToAuthTokens(session);
  logAuthDeepLinkEvent('signed in', effectiveFlow, session.user.id);
  return {kind: 'signed_in', user, tokens};
}

export function summarizeUrlForLog(url: string): string {
  try {
    const u = new URL(url.replace(/^gymly:\/\//i, 'https://gymly.local/').replace(/^gymlyapp:\/\//i, 'https://gymlyapp.local/'));
    return `${u.protocol}//${u.host}${u.pathname}${u.search ? '?…' : ''}${u.hash ? '#…' : ''}`;
  } catch {
    const noHash = url.split('#')[0];
    return noHash.length > 120 ? `${noHash.slice(0, 120)}…` : noHash;
  }
}

export const AUTH_CALLBACK_PATHS = {
  web: GYMLY_AUTH_CALLBACK_WEB,
  deepLink: GYMLY_AUTH_CALLBACK_DEEP_LINK,
} as const;
