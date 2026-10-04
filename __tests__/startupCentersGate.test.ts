/**
 * @jest-environment node
 *
 * App startup must not static-import danishGyms / centers.json.
 */

import fs from 'fs';
import path from 'path';

describe('startup centers gate', () => {
  it('chatStore and workoutPlanStore use type-only DanishGym imports', () => {
    const chat = fs.readFileSync(
      path.join(__dirname, '../src/store/chatStore.ts'),
      'utf8',
    );
    const plan = fs.readFileSync(
      path.join(__dirname, '../src/store/workoutPlanStore.ts'),
      'utf8',
    );
    expect(chat).toMatch(/import\s+type\s+\{\s*DanishGym\s*\}/);
    expect(chat).not.toMatch(/import\s+\{\s*DanishGym\s*\}/);
    expect(plan).toMatch(/import\s+type\s+\{\s*DanishGym\s*\}/);
    expect(plan).not.toMatch(/getActiveDanishGyms/);
  });

  it('friendStore and inAppNotificationStore defer buildDemoPayload', () => {
    const friend = fs.readFileSync(
      path.join(__dirname, '../src/store/friendStore.ts'),
      'utf8',
    );
    const inApp = fs.readFileSync(
      path.join(__dirname, '../src/store/inAppNotificationStore.ts'),
      'utf8',
    );
    expect(friend).not.toMatch(/import\s+\{[^}]*buildDemoPayload/);
    expect(inApp).not.toMatch(/import\s+\{[^}]*buildDemoPayload/);
    expect(friend).toMatch(/require\('@\/demo\/buildDemoPayload'\)/);
    expect(inApp).toMatch(/require\('@\/demo\/buildDemoPayload'\)/);
  });

  it('sessionCleanup does not top-level import chat/workout/demo stores', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/services/auth/sessionCleanup.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/import\s+\{[^}]*useChatStore/);
    expect(src).not.toMatch(/import\s+\{[^}]*useWorkoutPlanStore/);
    expect(src).not.toMatch(/from '@\/demo\/seedDemoStores'/);
    expect(src).toMatch(/require\('@\/store\/chatStore'\)/);
  });
});
