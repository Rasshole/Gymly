import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {processLock} from '@supabase/auth-js';
import {createClient} from '@supabase/supabase-js';
import {
  isLocalQaSupabaseBackend,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
} from '@/config/supabaseConfig';
import {perfPhase} from '@/utils/perfMark';

/**
 * React Native can leave GoTrue's startup lock pending forever:
 * navigator.locks never runs the callback, and fetch/AsyncStorage promises
 * sometimes never settle (AbortSignal is ignored). Bound both so
 * getSession() always returns and the app can leave the splash.
 */
const AUTH_FETCH_TIMEOUT_MS = 8000;
const AUTH_STORAGE_TIMEOUT_MS = 4000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function hostAndPath(raw: string): {host: string; path: string} {
  try {
    const url = new URL(raw);
    return {host: url.host, path: url.pathname};
  } catch {
    return {host: 'invalid', path: raw.slice(0, 80)};
  }
}

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const raw = requestUrl(input);
  const {host, path} = hostAndPath(raw);
  const liveCall = /\/(friendships|gym_active_checkin_rollup|check_ins)(\/|$)/.test(path);
  return withTimeout(fetch(input, init), AUTH_FETCH_TIMEOUT_MS, 'supabase fetch').then(
    async response => {
      if (liveCall) {
        let message = '';
        if (!response.ok) {
          try {
            const body = (await response.clone().json()) as {message?: string; error?: string};
            message = String(body?.message || body?.error || '').slice(0, 160);
          } catch {
            message = '';
          }
        }
        perfPhase(
          'backend',
          'fetch',
          `host=${host} path=${path} status=${response.status}${message ? ` message=${message}` : ''}`,
        );
      }
      return response;
    },
    error => {
      const message = error instanceof Error ? error.message : String(error);
      perfPhase(
        'backend',
        'fetch_error',
        `host=${host} path=${path} message=${message.slice(0, 140)}`,
      );
      throw error;
    },
  );
}

const authStorage = {
  getItem: (key: string) =>
    withTimeout(AsyncStorage.getItem(key), AUTH_STORAGE_TIMEOUT_MS, 'auth storage get'),
  setItem: (key: string, value: string) =>
    withTimeout(AsyncStorage.setItem(key, value), AUTH_STORAGE_TIMEOUT_MS, 'auth storage set'),
  removeItem: (key: string) =>
    withTimeout(AsyncStorage.removeItem(key), AUTH_STORAGE_TIMEOUT_MS, 'auth storage remove'),
};

const supabaseUrl = (SUPABASE_URL || '').trim().replace(/\/+$/, '');
const supabaseAnonKey = (SUPABASE_ANON_KEY || '').trim();
const localQa = isLocalQaSupabaseBackend();

const EXPECT_HOST = 'ykantlsuszpauddasqvz.supabase.co';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase config missing. Set SUPABASE_URL and SUPABASE_ANON_KEY in your environment.',
  );
} else if (localQa) {
  console.log('[Supabase] LOCAL QA backend:', supabaseUrl);
  perfPhase('backend', 'url', `url=${supabaseUrl}`);
  if (/localhost|127\.0\.0\.1/i.test(supabaseUrl)) {
    console.warn(
      '[Supabase] LOCAL QA should use LAN IP (e.g. http://10.0.0.80:54321) for the simulator, not localhost',
    );
  }
} else {
  if (!supabaseUrl.startsWith('https://')) {
    console.error('[Supabase] SUPABASE_URL must use https://');
  }
  if (/localhost|127\.0\.0\.1/i.test(supabaseUrl)) {
    console.error('[Supabase] SUPABASE_URL must not use localhost');
  }
  try {
    const host = new URL(supabaseUrl).host;
    if (host !== EXPECT_HOST) {
      console.warn(
        '[Supabase] URL host differs from expected project:',
        host,
        'expected',
        EXPECT_HOST,
      );
    }
  } catch {
    console.error('[Supabase] SUPABASE_URL is not a valid URL:', supabaseUrl);
  }
  if (!supabaseAnonKey.startsWith('eyJ')) {
    console.warn('[Supabase] Anon key does not look like a JWT (check config).');
  }
}

if (__DEV__ && supabaseUrl) {
  const healthStarted = Date.now();
  void fetch(`${supabaseUrl}/auth/v1/health`)
    .then(res => {
      perfPhase(
        'backend',
        'health',
        `status=${res.status} fetchMs=${Date.now() - healthStarted} url=${supabaseUrl}`,
      );
    })
    .catch(err => {
      const message = err instanceof Error ? err.message : String(err);
      perfPhase(
        'backend',
        'health',
        `status=error fetchMs=${Date.now() - healthStarted} url=${supabaseUrl} message=${message}`,
      );
    });
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: fetchWithTimeout,
  },
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: processLock,
  },
});
