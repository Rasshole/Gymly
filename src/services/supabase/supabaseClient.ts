import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {createClient} from '@supabase/supabase-js';
import {SUPABASE_ANON_KEY, SUPABASE_URL} from '@/config/supabaseConfig';

const supabaseUrl = (SUPABASE_URL || '').trim().replace(/\/+$/, '');
const supabaseAnonKey = (SUPABASE_ANON_KEY || '').trim();

const EXPECT_HOST = 'ykantlsuszpauddasqvz.supabase.co';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase config missing. Set SUPABASE_URL and SUPABASE_ANON_KEY in your environment.',
  );
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
      console.warn('[Supabase] URL host differs from expected project:', host, 'expected', EXPECT_HOST);
    }
  } catch {
    console.error('[Supabase] SUPABASE_URL is not a valid URL:', supabaseUrl);
  }
  if (!supabaseAnonKey.startsWith('eyJ')) {
    console.warn('[Supabase] Anon key does not look like a JWT (check config).');
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
