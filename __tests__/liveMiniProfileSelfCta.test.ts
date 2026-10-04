/**
 * @jest-environment node
 *
 * Self live-sheet shows one profile CTA. Other people keep the second action.
 */

import fs from 'fs';
import path from 'path';

const sheet = fs.readFileSync(
  path.join(__dirname, '../src/components/social/LiveMiniProfileSheet.tsx'),
  'utf8',
);

describe('LiveMiniProfileSheet self profile CTA', () => {
  it('keeps own-profile on the existing Profile route', () => {
    expect(sheet).toMatch(/kind:\s*'own_profile'/);
    expect(sheet).toMatch(/t\('sayHi\.viewOwnProfile'\)/);
    expect(sheet).toMatch(/navigation\.navigate\('Profile'\)/);
    expect(sheet).not.toMatch(/navigate\('OwnProfile'/);
  });

  it('hides the second profile button when the member is the current user', () => {
    expect(sheet).toMatch(/\{isSelf \? null : \([\s\S]*sayHi\.viewProfile/);
  });

  it('still offers view profile, message, and say hi for other people', () => {
    expect(sheet).toMatch(/t\('sayHi\.viewProfile'\)/);
    expect(sheet).toMatch(/t\('sayHi\.writeMessage'\)/);
    expect(sheet).toMatch(/t\('sayHi\.sayHi'\)/);
    expect(sheet).toMatch(/!isSelf && !isSynthetic\(user\)/);
  });
});
