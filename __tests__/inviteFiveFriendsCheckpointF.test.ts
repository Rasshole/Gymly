/**
 * Checkpoint F — invite deep links, AASA/assetlinks, store destinations, routing.
 */

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => store.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: jest.fn(async (key: string) => {
        store.delete(key);
      }),
      clear: jest.fn(async () => {
        store.clear();
      }),
    },
  };
});

/** Avoid pulling supabase client via authDeepLink in Jest. */
jest.mock('@/services/auth/authDeepLink', () => ({
  isAuthDeepLinkUrl: (url: string) => {
    const u = String(url).trim().toLowerCase();
    if (!u) {
      return false;
    }
    if (
      u.includes('reset-password-success') ||
      u.includes('password_reset_success') ||
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
      u.includes('token_hash=')
    );
  },
}));

/**
 * Checkpoint F validates the preserved invite deep-link implementation.
 * Production launch surface keeps INVITE_5_FRIENDS_ENABLED=false; force-enable here.
 */
jest.mock('@/config/launchSurfaceConfig', () => {
  const actual = jest.requireActual('@/config/launchSurfaceConfig');
  return {
    ...actual,
    INVITE_5_FRIENDS_ENABLED: true,
  };
});

import fs from 'fs';
import path from 'path';
import {
  GYMLY_APP_STORE_URL,
  GYMLY_PLAY_STORE_URL,
} from '@/config/storeLinks';
import {isAuthDeepLinkUrl} from '@/services/auth/authDeepLink';
import {
  classifyAppDeepLinkUrl,
  handleIncomingInviteIfPresent,
} from '@/services/referral/appDeepLinkRouter';
import {
  handleInviteDeepLink,
  isInviteDeepLinkUrl,
  parseInviteCodeFromUrl,
} from '@/services/referral/inviteDeepLink';
import {
  clearPendingInviteCode,
  getPendingInviteCode,
} from '@/services/referral/pendingInviteCode';

const root = path.join(__dirname, '..');
const PLAY_APP_SIGNING_SHA256 =
  '52:5B:1C:D0:D6:3C:0D:F4:FB:2C:15:7E:D2:11:FD:C4:23:8C:48:E3:3B:5D:69:B6:87:11:D4:8C:3F:59:A3:30';
const UPLOAD_SHA256 =
  '13:5E:51:77:82:CD:9D:21:C7:ED:AF:D9:45:8F:D8:D1:52:54:5F:2C:AD:F1:3A:7D:C0:38:4F:BA:BF:40:28:2F';
const DEBUG_SHA256 =
  'BE:09:CA:6D:AD:0A:71:03:EA:0C:A5:09:FF:7B:E1:43:52:32:5A:E8:05:32:07:79:E8:8B:C8:F3:E7:C3:9D:0B';

describe('Checkpoint F — invite deep link parsing + storage', () => {
  beforeEach(async () => {
    await clearPendingInviteCode();
  });

  it('parses https and custom-scheme invite URLs with normalization', () => {
    expect(parseInviteCodeFromUrl('https://gymlyapp.com/invite/crew-01')).toBe(
      'CREW01',
    );
    expect(parseInviteCodeFromUrl('gymly://invite/CREW01')).toBe('CREW01');
    expect(parseInviteCodeFromUrl('gymlyapp://invite/crew01')).toBe('CREW01');
    expect(
      parseInviteCodeFromUrl('https://gymlyapp.com/invite/CREW01?utm=share'),
    ).toBe('CREW01');
  });

  it('ignores /invite and /invite/ without a code, auth URLs, and malformed codes', () => {
    expect(parseInviteCodeFromUrl('https://gymlyapp.com/invite')).toBeNull();
    expect(parseInviteCodeFromUrl('https://gymlyapp.com/invite/')).toBeNull();
    expect(parseInviteCodeFromUrl('https://gymlyapp.com/auth/callback')).toBeNull();
    expect(parseInviteCodeFromUrl('https://gymlyapp.com/reset-password')).toBeNull();
    expect(parseInviteCodeFromUrl('gymly://auth/callback?code=abc')).toBeNull();
    expect(isInviteDeepLinkUrl('https://gymlyapp.com/invite/AB')).toBe(false);
    expect(parseInviteCodeFromUrl('https://gymlyapp.com/invite/!!')).toBeNull();
  });

  it('saves pending invite before auth and works without a session (logged out)', async () => {
    const cold = await handleIncomingInviteIfPresent(
      'https://gymlyapp.com/invite/FOUND5',
    );
    expect(cold).toEqual({handled: true, code: 'FOUND5'});
    expect(await getPendingInviteCode()).toBe('FOUND5');
  });

  it('warm-state re-open of the same link is idempotent (no harmful duplicate state)', async () => {
    await handleInviteDeepLink('https://gymlyapp.com/invite/FOUND5');
    await handleInviteDeepLink('gymly://invite/FOUND5');
    await handleIncomingInviteIfPresent('https://gymlyapp.com/invite/FOUND5');
    expect(await getPendingInviteCode()).toBe('FOUND5');
  });

  it('still saves when already logged in (storage only; no apply)', async () => {
    const res = await handleIncomingInviteIfPresent(
      'https://gymlyapp.com/invite/LOGIN1',
    );
    expect(res.handled).toBe(true);
    expect(await getPendingInviteCode()).toBe('LOGIN1');
  });
});

describe('Checkpoint F — invite vs auth routing', () => {
  it('classifies invite before auth even when URL contains code=', () => {
    const inviteWithPkceLookingQuery =
      'https://gymlyapp.com/invite/CREW01?code=oauthstyle';
    expect(classifyAppDeepLinkUrl(inviteWithPkceLookingQuery)).toBe('invite');
    expect(isAuthDeepLinkUrl(inviteWithPkceLookingQuery)).toBe(true);
  });

  it('leaves auth callback / reset-password as auth (unchanged)', () => {
    expect(classifyAppDeepLinkUrl('https://gymlyapp.com/auth/callback')).toBe(
      'auth',
    );
    expect(classifyAppDeepLinkUrl('gymly://auth/callback?code=abc')).toBe('auth');
    expect(classifyAppDeepLinkUrl('https://gymlyapp.com/reset-password')).toBe(
      'auth',
    );
    expect(classifyAppDeepLinkUrl('https://gymlyapp.com/invite')).toBe('ignored');
    expect(classifyAppDeepLinkUrl('https://gymlyapp.com/')).toBe('ignored');
  });

  it('does not handle auth URLs via invite helper', async () => {
    await clearPendingInviteCode();
    const res = await handleIncomingInviteIfPresent(
      'https://gymlyapp.com/auth/callback?code=abc',
    );
    expect(res).toEqual({handled: false, code: null});
    expect(await getPendingInviteCode()).toBeNull();
  });
});

describe('Checkpoint F — AASA / assetlinks / landing / store', () => {
  it('AASA appIDs are TEAM_ID.BUNDLE_ID from Xcode (CDVFBW66X4.com.test1.Gymly)', () => {
    const pbx = fs.readFileSync(
      path.join(root, 'ios/Gymly.xcodeproj/project.pbxproj'),
      'utf8',
    );
    expect(pbx).toContain('DEVELOPMENT_TEAM = CDVFBW66X4');
    expect(pbx).toMatch(/PRODUCT_BUNDLE_IDENTIFIER = com\.test1\.Gymly;/);

    for (const rel of [
      'website/.well-known/apple-app-site-association',
      'web/.well-known/apple-app-site-association',
    ]) {
      const raw = fs.readFileSync(path.join(root, rel), 'utf8');
      const json = JSON.parse(raw) as {
        applinks: {
          details: Array<{
            appIDs: string[];
            components: Array<{[key: string]: unknown}>;
          }>;
        };
      };
      expect(json.applinks.details[0].appIDs).toEqual([
        'CDVFBW66X4.com.test1.Gymly',
      ]);
      const paths = json.applinks.details[0].components.map(c => c['/']);
      expect(paths).toContain('/invite');
      expect(paths).toContain('/invite/*');
      expect(paths).toContain('/reset-password');
    }
  });

  it('preserves web vs website auth AASA policies while adding invite', () => {
    const website = JSON.parse(
      fs.readFileSync(
        path.join(root, 'website/.well-known/apple-app-site-association'),
        'utf8',
      ),
    );
    const web = JSON.parse(
      fs.readFileSync(
        path.join(root, 'web/.well-known/apple-app-site-association'),
        'utf8',
      ),
    );
    const websiteAuth = website.applinks.details[0].components.find(
      (c: {[k: string]: unknown}) => c['/'] === '/auth/callback',
    );
    const webAuth = web.applinks.details[0].components.find(
      (c: {[k: string]: unknown}) => c['/'] === '/auth/callback',
    );
    expect(websiteAuth.exclude).toBeUndefined();
    expect(webAuth.exclude).toBe(true);
  });

  it('assetlinks package is com.gymly with Play App Signing + upload (+ optional debug)', () => {
    const gradle = fs.readFileSync(
      path.join(root, 'android/app/build.gradle'),
      'utf8',
    );
    expect(gradle).toMatch(/applicationId\s+"com\.gymly"/);

    for (const rel of [
      'website/.well-known/assetlinks.json',
      'web/.well-known/assetlinks.json',
    ]) {
      const json = JSON.parse(
        fs.readFileSync(path.join(root, rel), 'utf8'),
      ) as Array<{
        target: {package_name: string; sha256_cert_fingerprints: string[]};
      }>;
      expect(json[0].target.package_name).toBe('com.gymly');
      expect(json[0].target.sha256_cert_fingerprints).toEqual(
        expect.arrayContaining([
          PLAY_APP_SIGNING_SHA256,
          UPLOAD_SHA256,
          DEBUG_SHA256,
        ]),
      );
      expect(json[0].target.sha256_cert_fingerprints[0]).toBe(
        PLAY_APP_SIGNING_SHA256,
      );
    }
  });

  it('landing covers /invite rewrites, verified App Store URL, no Play invent, no HTTPS redirect loop', () => {
    const html = fs.readFileSync(
      path.join(root, 'website/invite/index.html'),
      'utf8',
    );
    expect(html).toContain(GYMLY_APP_STORE_URL);
    expect(html).not.toContain('https://apps.apple.com/app/gymly"');
    expect(html).not.toContain(
      'https://play.google.com/store/apps/details?id=com.gymly',
    );
    expect(GYMLY_PLAY_STORE_URL).toBeNull();
    expect(html).not.toMatch(/meta[^>]+http-equiv=["']refresh/i);
    expect(html).not.toMatch(
      /location\.(replace|href)\s*=\s*['"]https:\/\/gymlyapp\.com\/invite/i,
    );
    expect(html).toContain("gymly://invite/'");

    const redirects = fs.readFileSync(
      path.join(root, 'website/_redirects'),
      'utf8',
    );
    expect(redirects).toMatch(/\/invite\s+\/invite\/index\.html/);
    expect(redirects).toMatch(/\/invite\/\s+\/invite\/index\.html/);
    expect(redirects).toMatch(/\/invite\/\*\s+\/invite\/index\.html/);

    const manifest = fs.readFileSync(
      path.join(root, 'android/app/src/main/AndroidManifest.xml'),
      'utf8',
    );
    expect(manifest).toContain('pathPrefix="/invite"');
  });
});
