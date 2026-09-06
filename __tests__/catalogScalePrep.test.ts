import {ALL_GYM_CENTERS, findCenterById, getEffectiveLatLng} from '../src/data/centerRegistry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {
  getActiveDanishGyms,
  getActiveGyms,
  getActiveGymsByCountry,
  getGymsByCountry,
} from '../src/data/danishGyms';
import {
  allowsInventedCoordinates,
  isDenmarkCountry,
  isGermanyCountry,
  isNorwayCountry,
  isSwedenCountry,
  isUnitedKingdomCountry,
  isAustriaCountry,
  isSwitzerlandCountry,
} from '../src/utils/gymCountry';
import {findGymById, findGymByIdRelaxed} from '../src/utils/gymDisplay';
import {findNearestGym} from '../src/utils/nearestGym';
import {getGymLatLngForCheckIn} from '../src/utils/gymCoordinatesForCheckIn';
import type {GymCenter} from '../src/types/center.types';

describe('catalog scale prep', () => {
  const gyms = getActiveGyms();

  it('does not change production catalog counts', () => {
    expect(ALL_GYM_CENTERS.length).toBe(10050);
    expect(ALL_GYM_CENTERS.filter(c => isDenmarkCountry(c.country)).length).toBe(354);
    expect(ALL_GYM_CENTERS.filter(c => isSwedenCountry(c.country)).length).toBe(639);
    expect(ALL_GYM_CENTERS.filter(c => isNorwayCountry(c.country)).length).toBe(535);
    expect(ALL_GYM_CENTERS.filter(c => isGermanyCountry(c.country)).length).toBe(1424);
    expect(ALL_GYM_CENTERS.filter(c => isUnitedKingdomCountry(c.country)).length).toBe(1474);
    expect(ALL_GYM_CENTERS.filter(c => isAustriaCountry(c.country)).length).toBe(335);
    expect(ALL_GYM_CENTERS.filter(c => isSwitzerlandCountry(c.country)).length).toBe(0);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ch_')).length).toBe(0);
    expect(gyms.length).toBe(getActiveDanishGyms().length);
    expect(getActiveGyms()).toBe(getActiveDanishGyms());
  });

  it('partitions gyms by country without copying production data', () => {
    expect(getGymsByCountry('Germany').length).toBe(1424);
    expect(getActiveGymsByCountry('de').length).toBe(1424);
    expect(getGymsByCountry('Denmark').length).toBe(354);
    expect(getGymsByCountry('United Kingdom').length).toBe(1474);
    expect(getActiveGymsByCountry('UK').length).toBe(1474);
    expect(getGymsByCountry('Austria').length).toBe(335);
    expect(getActiveGymsByCountry('at').length).toBe(335);
  });

  it('resolves IDs in O(1) including de_* / no_* / se_* / gb_* / at_*', () => {
    const sample = gyms.find(g => g.id.startsWith('de_'))!;
    expect(findGymById(sample.id)?.id).toBe(sample.id);
    expect(findGymByIdRelaxed(sample.id.toUpperCase())?.id).toBe(sample.id);
    expect(findCenterById(sample.id)?.id).toBe(sample.id);
    const uk = gyms.find(g => g.id.startsWith('gb_'))!;
    expect(findGymById(uk.id)?.id).toBe(uk.id);
    expect(findGymByIdRelaxed(uk.id.toUpperCase())?.id).toBe(uk.id);
    const at = gyms.find(g => g.id.startsWith('at_'))!;
    expect(findGymById(at.id)?.id).toBe(at.id);
  });

  it('uses gb_ for United Kingdom and does not allow uk_* ids', () => {
    expect(GYM_ID_PREFIX.unitedKingdom).toBe('gb_');
    expect(GYM_ID_PREFIX.switzerland).toBe('ch_');
    expect(ALL_GYM_CENTERS.some(c => c.id.startsWith('gb_'))).toBe(true);
    expect(ALL_GYM_CENTERS.some(c => c.id.startsWith('uk_'))).toBe(false);
  });

  it('never invents UK / unknown-country coordinates', () => {
    expect(isUnitedKingdomCountry('United Kingdom')).toBe(true);
    expect(isUnitedKingdomCountry('GB')).toBe(true);
    expect(isUnitedKingdomCountry('UK')).toBe(true);
    expect(allowsInventedCoordinates('United Kingdom')).toBe(false);
    expect(allowsInventedCoordinates('Germany')).toBe(false);
    expect(allowsInventedCoordinates('Denmark')).toBe(true);
    expect(allowsInventedCoordinates('Sweden')).toBe(true);

    const ukMissing: GymCenter = {
      id: 'gb_scale_prep_probe',
      name: 'Probe',
      brand: 'Probe',
      address: '1 Test Street',
      postal_code: 'SW1A 1AA',
      city: 'London',
      country: 'United Kingdom',
      lat: null,
      lng: null,
      is_active: true,
    };
    const uk = getEffectiveLatLng(ukMissing);
    expect(Number.isNaN(uk.lat)).toBe(true);
    expect(Number.isNaN(uk.lng)).toBe(true);
    expect(uk.lat).not.toBe(51.5074);
    expect(uk.lng).not.toBe(-0.1278);

    const other: GymCenter = {
      ...ukMissing,
      id: 'xx_scale_prep_probe',
      country: 'France',
      postal_code: '75001',
    };
    const fr = getEffectiveLatLng(other);
    expect(Number.isNaN(fr.lat)).toBe(true);
    expect(getGymLatLngForCheckIn('gb_scale_prep_probe')).toBeNull();
  });

  it('nearest-gym helper picks the origin gym', () => {
    const origin = gyms[0]!;
    const nearest = findNearestGym(origin.latitude, origin.longitude, gyms);
    expect(nearest?.id).toBe(origin.id);
  });
});
