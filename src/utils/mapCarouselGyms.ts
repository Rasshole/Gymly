import type {DanishGym} from '@/data/danishGyms';

export const MAP_CAROUSEL_MAX_GYMS = 5;

export type MapCarouselGymInput = {
  gym: DanishGym;
  activeUsersCount: number;
  distanceKm: number;
};

/**
 * Carousel priority: active gyms first (count desc, distance asc), then nearest inactive.
 */
export function selectMapCarouselGyms(
  items: MapCarouselGymInput[],
  maxCount: number = MAP_CAROUSEL_MAX_GYMS,
): DanishGym[] {
  if (maxCount <= 0 || items.length === 0) {
    return [];
  }

  const active = items
    .filter(item => item.activeUsersCount > 0)
    .sort((a, b) => {
      if (b.activeUsersCount !== a.activeUsersCount) {
        return b.activeUsersCount - a.activeUsersCount;
      }
      return a.distanceKm - b.distanceKm;
    });

  const inactive = items
    .filter(item => item.activeUsersCount === 0)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const selected: DanishGym[] = [];
  const seen = new Set<string>();

  const push = (gym: DanishGym) => {
    if (seen.has(gym.id) || selected.length >= maxCount) {
      return;
    }
    seen.add(gym.id);
    selected.push(gym);
  };

  for (const item of active) {
    push(item.gym);
  }
  for (const item of inactive) {
    push(item.gym);
  }

  return selected;
}
