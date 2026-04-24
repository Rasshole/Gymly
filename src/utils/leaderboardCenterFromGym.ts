/**
 * Primært center fra profil (første favorit-gym) som streng-id til UI.
 */

import {findGymById} from '@/utils/gymDisplay';

/**
 * Første favorit-gyms numeriske id som streng, eller null hvis ingen.
 */
export function getHomeLeaderboardCenterIdForUser(
  favoriteGymIds?: string[] | null,
): string | null {
  const id = favoriteGymIds?.[0];
  if (id == null) {
    return null;
  }
  return id;
}

export function resolveGymNameForLeaderboard(gymIdStr: string | null): string {
  if (!gymIdStr) {
    return 'Center';
  }
  return findGymById(gymIdStr)?.name ?? 'Center';
}
