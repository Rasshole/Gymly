import {
  isPrivateQaSupabaseUrl,
  selectSupabaseBackend,
} from '@/config/supabaseConfig';

const hostedUrl = 'https://example.supabase.co';
const hostedKey = 'hosted-anon';
const localUrl = 'http://192.168.1.20:54321';
const localKey = 'local-anon';

describe('selectSupabaseBackend', () => {
  it('keeps the hosted project in a release bundle', () => {
    expect(
      selectSupabaseBackend({
        dev: false,
        hostedUrl,
        hostedAnonKey: hostedKey,
        localUrl,
        localAnonKey: localKey,
      }),
    ).toEqual({url: hostedUrl, anonKey: hostedKey});
  });

  it('uses a private local URL only while developing', () => {
    expect(
      selectSupabaseBackend({
        dev: true,
        hostedUrl,
        hostedAnonKey: hostedKey,
        localUrl,
        localAnonKey: localKey,
      }),
    ).toEqual({url: localUrl, anonKey: localKey});
  });

  it('ignores a non-local override and an empty one', () => {
    expect(
      selectSupabaseBackend({
        dev: true,
        hostedUrl,
        hostedAnonKey: hostedKey,
        localUrl: 'https://example.supabase.co',
        localAnonKey: localKey,
      }),
    ).toEqual({url: hostedUrl, anonKey: hostedKey});
    expect(
      selectSupabaseBackend({
        dev: true,
        hostedUrl,
        hostedAnonKey: hostedKey,
        localUrl: '',
        localAnonKey: '',
      }),
    ).toEqual({url: hostedUrl, anonKey: hostedKey});
  });
});

describe('isPrivateQaSupabaseUrl', () => {
  it('accepts loopback and private LAN hosts only', () => {
    expect(isPrivateQaSupabaseUrl('http://127.0.0.1:54321')).toBe(true);
    expect(isPrivateQaSupabaseUrl('http://10.0.0.8:54321')).toBe(true);
    expect(isPrivateQaSupabaseUrl('https://example.supabase.co')).toBe(false);
  });
});
