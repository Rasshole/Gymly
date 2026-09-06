import type {DanishGym} from '@/data/danishGyms';
import {centerSocialRankScore} from '@/utils/centerSocialRank';

/** Max rows shown in Centres “nearby” list — full catalog stays searchable. */
export const NEARBY_CENTRES_LIST_CAP = 200;

export type LiveStats = {total: number; friends: number};

export type RankNearbyCentresInput = {
  gyms: readonly DanishGym[];
  excludeIds: ReadonlySet<string>;
  userLocation: {latitude: number; longitude: number} | null;
  getGymStatus: (id: string) => {isOpen: boolean};
  liveByGymId: ReadonlyMap<string, LiveStats>;
  getActiveUsersCount: (id: string) => number;
  calculateDistanceMeters: (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ) => number;
  cap?: number;
};

/**
 * Rank nearby centres for the Gyms list. Caps output so we never FlatList-render 12k+ rows.
 * Intended to run deferred (InteractionManager) — not on the critical tab-press path.
 */
export function rankNearbyCentres(input: RankNearbyCentresInput): DanishGym[] {
  const cap = input.cap ?? NEARBY_CENTRES_LIST_CAP;
  const scored: Array<{
    gym: DanishGym;
    isOpen: boolean;
    distance: number;
    score: number;
  }> = [];

  for (const gym of input.gyms) {
    if (input.excludeIds.has(gym.id)) {
      continue;
    }
    if (input.userLocation) {
      const dLat = Math.abs(gym.latitude - input.userLocation.latitude);
      const dLng = Math.abs(gym.longitude - input.userLocation.longitude);
      // Cheap bbox skip (~800 km) — nearby cap 200 never needs farther rows.
      if (dLat > 8 || dLng > 8) {
        continue;
      }
    }
    const status = input.getGymStatus(gym.id);
    let distance = Number.POSITIVE_INFINITY;
    if (input.userLocation) {
      distance = input.calculateDistanceMeters(
        input.userLocation.latitude,
        input.userLocation.longitude,
        gym.latitude,
        gym.longitude,
      );
    }
    const liveHit = input.liveByGymId.get(gym.id);
    const live = liveHit ?? {
      total: input.getActiveUsersCount(gym.id),
      friends: 0,
    };
    const score = centerSocialRankScore(live, distance);
    scored.push({gym, isOpen: status.isOpen, distance, score});
  }

  scored.sort((a, b) => {
    if (a.isOpen && !b.isOpen) {
      return -1;
    }
    if (!a.isOpen && b.isOpen) {
      return 1;
    }
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.distance - b.distance;
  });

  return scored.slice(0, cap).map(item => item.gym);
}
