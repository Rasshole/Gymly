/**
 * @jest-environment node
 *
 * Groups minimal UI — no premium gradient CTAs; name-only create gate;
 * zero-friends omits dead search control.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('Groups minimal UI contracts', () => {
  const groupsScreen = read('src/screens/main/GroupsScreen.tsx');
  const createScreen = read('src/screens/main/CreateGroupScreen.tsx');
  const en = read('src/i18n/translations/en.ts');

  it('Groups empty state does not use premium gradient CTA', () => {
    expect(groupsScreen).not.toMatch(/variant=["']premium["']/);
    expect(groupsScreen).toMatch(/emptyTitle/);
    expect(groupsScreen).toMatch(/emptyCreateBtn|createBanner/);
    expect(en).toMatch(/emptyTitle:\s*'No groups yet'/);
  });

  it('Create group uses flat SocialPrimaryButton (no premium)', () => {
    expect(createScreen).not.toMatch(/variant=["']premium["']/);
    expect(createScreen).toMatch(/SocialPrimaryButton/);
    expect(createScreen).toMatch(/canSubmit = name\.trim\(\)\.length > 0/);
  });

  it('photo / description / friends remain optional; name required', () => {
    expect(createScreen).toMatch(/groups\.optional/);
    expect(createScreen).toMatch(/groups\.addPhoto/);
    expect(createScreen).toMatch(/if \(!name\.trim\(\)\)/);
    expect(createScreen).toMatch(/createGymlyGroupRpc/);
    expect(createScreen).toMatch(/uploadGymlyGroupImage/);
    expect(createScreen).toMatch(/inviteManyToGymlyGroup/);
  });

  it('zero-friends path skips search + noFriends dead control', () => {
    expect(createScreen).toMatch(/hasFriends/);
    expect(createScreen).toMatch(/groups\.inviteLater/);
    expect(createScreen).toMatch(/You can invite people later|inviteLater/);
    // Search only when friends exist
    expect(createScreen).toMatch(/hasFriends \? \(/);
  });

  it('double-submit guarded via creating flag', () => {
    expect(createScreen).toMatch(/if \(!user\?\.id \|\| creating\)/);
    expect(createScreen).toMatch(/setCreating\(true\)/);
  });
});
