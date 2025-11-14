/**
 * Danish fitness centre dataset generated from OpenStreetMap (ODbL).
 * Source: https://overpass-api.de/api/interpreter
 */
import rawGyms from '../../data/gymsDK.json';

export type DanishRegion = 'København' | 'Sjælland' | 'Fyn' | 'Jylland';

export type DanishGym = {
  id: number;
  name: string;
  city?: string;
  address?: string;
  region: DanishRegion;
  latitude: number;
  longitude: number;
  brand?: string;
  website?: string;
};

const danishGyms: DanishGym[] = (rawGyms as DanishGym[]).map(gym => ({
  ...gym,
  city: gym.city || undefined,
  address: gym.address || undefined,
  brand: gym.brand || undefined,
  website: gym.website || undefined,
}));

export default danishGyms;
