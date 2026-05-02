/**
 * App-model for centre (kort, check-in, lister) — mappes fra centerRegistry.
 */
import {ALL_GYM_CENTERS, getEffectiveLatLng} from '@/data/centerRegistry';
import type {GymCenter} from '@/types/center.types';

export type DanishRegion = 'København' | 'Sjælland' | 'Fyn' | 'Jylland';

export type DanishGym = {
  id: string;
  name: string;
  city?: string;
  address?: string;
  postalCode?: string;
  region: DanishRegion;
  latitude: number;
  longitude: number;
  brand?: string;
  logoKey?: string;
  website?: string;
  is_coming_soon?: boolean;
  /** Faktisk række (koordinater kan være postområde-fallback) */
  _center: GymCenter;
};

function inferDanishRegion(postal: string, city: string): DanishRegion {
  const p = parseInt(postal, 10) || 0;
  const c = city.toLowerCase();
  if (p >= 5000 && p < 6000) {
    return 'Fyn';
  }
  if (c.includes('odense') || c.includes('svendborg') || c.includes('nyborg')) {
    return 'Fyn';
  }
  if (
    p >= 8000 && p < 10000 &&
    (c.includes('aalborg') || c.includes('aarhus') || c.includes('aarus'))
  ) {
    return 'Jylland';
  }
  if (p >= 6000 && p < 10000) {
    return 'Jylland';
  }
  if (p >= 1000 && p < 3000) {
    return 'København';
  }
  if (c.includes('københavn') || c.includes('frederiksberg') || c.includes('gentofte')) {
    return 'København';
  }
  return 'Sjælland';
}

function toDanishGym(c: GymCenter): DanishGym {
  const {lat, lng} = getEffectiveLatLng(c);
  const logoKey = (c.brand || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return {
    id: c.id,
    name: c.name,
    city: c.city,
    address: c.address,
    postalCode: c.postal_code,
    region: inferDanishRegion(c.postal_code, c.city),
    latitude: lat,
    longitude: lng,
    brand: c.brand,
    logoKey: logoKey || undefined,
    is_coming_soon: c.is_coming_soon,
    _center: c,
  };
}

const danishGyms: DanishGym[] = ALL_GYM_CENTERS.map(toDanishGym);

/** Kort, check-in, favoritter (ikke "kommer snart") */
export function getActiveDanishGyms(): DanishGym[] {
  return danishGyms.filter(
    g => g._center.is_active && !g._center.is_coming_soon,
  );
}

export default danishGyms;
