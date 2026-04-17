/**
 * Primært center fra profil (første favorit-gym) som streng-id til UI.
 */

import {findGymById} from '@/utils/gymDisplay';

/**
 * Første favorit-gyms numeriske id som streng, eller null hvis ingen.
 */
export function getHomeLeaderboardCenterIdForUser(
  favoriteGymIds?: number[] | null,
): string | null {
  const id = favoriteGymIds?.[0];
  if (id == null) {
    return null;
  }
  return String(id);
}

export function resolveGymNameForLeaderboard(gymIdStr: string | null): string {
  if (!gymIdStr) {
    return 'Center';
  }
  const n = parseInt(gymIdStr, 10);
  if (Number.isNaN(n)) {
    return 'Center';
  }
  return findGymById(n)?.name ?? 'Center';
}
