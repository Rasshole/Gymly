/**
 * Venneliste til Friends-fanen i demo-tilstand.
 */

import {buildDemoPayload} from '@/demo/buildDemoPayload';

export type DemoFriendRow = {
  id: string;
  name: string;
  avatar?: string;
  isOnline: boolean;
  activeTime?: string;
  gymName?: string;
  muscleGroup?: string;
  checkInTime?: Date;
  checkOutTime?: Date;
};

export function buildDemoFriendsScreenList(userId: string): DemoFriendRow[] {
  const d = buildDemoPayload(userId);
  const gymNames = d.localCenters.map(c => c.displayName);
  const muscleRot = ['bryst', 'ben', 'cardio', 'ryg', 'skulder', 'triceps', 'reformer'] as const;
  return d.friends.map((prof, i) => {
    const gym = gymNames[i % gymNames.length] ?? 'SATS';
    const m = i % 5;
    if (m <= 2) {
      const mins = 4 + (i % 9) * 2;
      return {
        id: prof.id,
        name: prof.displayName,
        avatar: prof.avatarUrl ?? undefined,
        isOnline: true,
        gymName: gym,
        activeTime: `${mins} min`,
        muscleGroup: muscleRot[i % muscleRot.length],
        checkInTime: new Date(Date.now() - mins * 60_000),
      };
    }
    const minsAgo = 35 + (i % 200) * 3;
    return {
      id: prof.id,
      name: prof.displayName,
      avatar: prof.avatarUrl ?? undefined,
      isOnline: false,
      checkOutTime: new Date(Date.now() - minsAgo * 60_000),
    };
  });
}
