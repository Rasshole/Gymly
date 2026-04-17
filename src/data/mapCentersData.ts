/**
 * Map Centers Data
 * Unified data model for map markers with activity counts
 * TODO: Replace with real API when backend is ready
 */

import danishGyms, {DanishGym} from '@/data/danishGyms';
import {getLogoSource} from '@/services/gymLogoService';

export interface MapCenter {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  logoUrl: string | null;
  friendsActiveCount: number;
  totalActiveCount: number;
  address?: string;
  city?: string;
  brand?: string;
}

// Mock activity: totalActiveCount per gym (real friends come from useOnlineUsers)
const MOCK_TOTAL_ACTIVE: Record<number, number> = {
  1112453804: 14,
  1141433639: 6,
  497381657: 14,
  898936694: 18,
  1779005080: 3,
  1489323572: 12,
  13063997054: 4,
  13063997055: 0,
  13063997056: 7,
  13063997057: 2,
  13063997058: 9,
  13063997059: 6,
  13063997060: 11,
  13063997061: 4,
  13063997062: 8,
  13063997063: 3,
  13063997064: 5,
  13063997065: 6,
};

function getMockTotal(gymId: number): number {
  return MOCK_TOTAL_ACTIVE[gymId] ?? ((gymId % 13) % 10) + 1;
}

/**
 * Build map centers array with logoUrl, friendsActiveCount, totalActiveCount
 */
export function getMapCenters(
  gyms: DanishGym[],
  friendsByGymId: Map<number, number>
): MapCenter[] {
  return gyms.map(gym => {
    const friendsActiveCount = friendsByGymId.get(gym.id) ?? 0;
    const totalActiveCount = Math.max(
      getMockTotal(gym.id),
      friendsActiveCount
    );
    const logoSource = getLogoSource(gym.brand, gym.name);
    const logoUrl =
      logoSource.type === 'remote' && logoSource.remoteUrl ? logoSource.remoteUrl : null;

    return {
      id: gym.id,
      name: gym.name,
      latitude: gym.latitude,
      longitude: gym.longitude,
      logoUrl,
      friendsActiveCount,
      totalActiveCount,
      address: gym.address,
      city: gym.city,
      brand: gym.brand,
    };
  });
}
