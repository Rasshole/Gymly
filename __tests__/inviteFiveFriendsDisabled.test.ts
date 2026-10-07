/**
 * Release gate: Invite 5 Friends must stay hidden while INVITE_5_FRIENDS_ENABLED=false.
 * Does not delete the feature — only proves launch-surface disable contracts.
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

jest.mock('@/services/auth/authDeepLink', () => ({
  isAuthDeepLinkUrl: (url: string) => {
    const u = String(url).trim().toLowerCase();
    return (
      u.includes('/auth/callback') ||
      u.includes('auth/callback') ||
      u.includes('reset-password') ||
      u.includes('access_token=') ||
      u.includes('code=')
    );
  },
}));

import fs from 'fs';
import path from 'path';
import {INVITE_5_FRIENDS_ENABLED} from '@/config/launchSurfaceConfig';
import {
  classifyAppDeepLinkUrl,
  handleIncomingInviteIfPresent,
} from '@/services/referral/appDeepLinkRouter';
import {
  clearPendingInviteCode,
  getPendingInviteCode,
  savePendingInviteCode,
} from '@/services/referral/pendingInviteCode';
import {REFERRAL_FOUNDER_BADGE_ID} from '@/services/referral/referralCodeUtils';

const ROOT = path.join(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('Invite 5 Friends — temporarily disabled for release', () => {
  it('INVITE_5_FRIENDS_ENABLED = false', () => {
    expect(INVITE_5_FRIENDS_ENABLED).toBe(false);
  });

  it('user-visible Invite 5 Friends entry points are gated (Friends + Settings)', () => {
    const friends = read('src/screens/main/FriendsScreen.tsx');
    const settings = read('src/screens/main/SettingsScreen.tsx');
    const register = read('src/screens/auth/RegisterScreen.tsx');
    const badges = read('src/screens/main/BadgesScreen.tsx');

    expect(friends).toMatch(/isInviteFiveFriendsSurfaceEnabled\(\) && !isSearching/);
    expect(friends).toMatch(/inviteFive\.friendsEntry/);
    expect(settings).toMatch(/isInviteFiveFriendsSurfaceEnabled\(\) \? \(/);
    expect(settings).toMatch(/inviteFive\.settingsEntry/);
    // Onboarding V2 no longer collects invite codes during signup; hub/Settings stay gated.
    expect(register).not.toMatch(/inviteCodeLabel/);
    expect(badges).toMatch(/INVITE_5_FRIENDS_ENABLED/);
    expect(badges).toMatch(/filter\(c => c !== 'referral'\)/);
  });

  it('automatic Invite 5 Friends triggers are gated', () => {
    const qualify = read('src/services/supabase/referralService.ts');
    const celebration = read('src/services/referral/serverBadgeUnlockModal.ts');
    const hub = read('src/screens/main/InviteFiveFriendsScreen.tsx');
    const router = read('src/services/referral/appDeepLinkRouter.ts');

    expect(qualify).toMatch(/if \(!isInviteFiveFriendsSurfaceEnabled\(\)\)/);
    expect(qualify).toMatch(/scheduleReferralQualifyAfterActivity/);
    expect(celebration).toMatch(/!INVITE_5_FRIENDS_ENABLED/);
    expect(celebration).toMatch(/REFERRAL_FOUNDER_BADGE_ID/);
    expect(hub).toMatch(/if \(!isInviteFiveFriendsSurfaceEnabled\(\)\)/);
    expect(hub).toMatch(/navigation\.goBack\(\)/);
    expect(hub).toMatch(/navigate\('Friends'\)/);
    expect(hub).toMatch(/return null;/);
    expect(router).toMatch(
      /isInviteFiveFriendsSurfaceEnabled\(\) \? 'invite' : 'ignored'/,
    );
  });

  it('disabled invite deep links do not persist pending codes', async () => {
    await clearPendingInviteCode();
    expect(classifyAppDeepLinkUrl('https://gymlyapp.com/invite/CREW01')).toBe(
      'ignored',
    );
    expect(classifyAppDeepLinkUrl('gymly://invite/CREW01')).toBe('ignored');

    const res = await handleIncomingInviteIfPresent(
      'https://gymlyapp.com/invite/CREW01',
    );
    expect(res).toEqual({handled: false, code: null});
    expect(await getPendingInviteCode()).toBeNull();

    await savePendingInviteCode('STALE1');
    expect(await getPendingInviteCode()).toBe('STALE1');
    await clearPendingInviteCode();
    expect(await getPendingInviteCode()).toBeNull();
  });

  it('normal friend functionality remains wired', () => {
    const friends = read('src/screens/main/FriendsScreen.tsx');
    const mainNav = read('src/navigation/MainNavigator.tsx');
    expect(friends).toMatch(/sendFriendRequest/);
    expect(friends).toMatch(/friendsScreen\.requested/);
    expect(mainNav).toMatch(/name="AddFriend"/);
    expect(mainNav).toMatch(/name="InviteFiveFriends"/); // preserved, gated
  });

  it('location prominent disclosure remains intact', () => {
    expect(read('App.tsx')).toMatch(/LocationProminentDisclosureHost/);
    expect(
      read('src/components/location/LocationProminentDisclosureHost.tsx'),
    ).toMatch(/location-prominent-disclosure/);
    expect(read('src/i18n/translations/en.ts')).toMatch(/locationDisclosure:/);
  });

  it('global gym visibility modules remain intact', () => {
    expect(fs.existsSync(path.join(ROOT, '__tests__/globalGymVisibility.test.ts'))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(ROOT, 'src/config/dataConfig.ts'))).toBe(true);
  });

  it('Founding Crew push open is redirected away from invite campaign UI', () => {
    const push = read('src/services/push/handleNotificationOpen.ts');
    expect(push).toMatch(/INVITE_5_FRIENDS_ENABLED/);
    expect(push).toMatch(/REFERRAL_FOUNDER_BADGE_ID/);
    expect(push).toMatch(/navigate\('Notifications'/);
    expect(REFERRAL_FOUNDER_BADGE_ID).toBe('referral_founder_5');
  });
});
