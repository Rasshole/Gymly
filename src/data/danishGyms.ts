/**
 * App-model for centre (kort, check-in, lister) — mappes fra centerRegistry.
 */
import {ALL_GYM_CENTERS, getEffectiveLatLng} from '@/data/centerRegistry';
import type {GymCenter} from '@/types/center.types';
import {isDenmarkCountry, isFranceCountry, isFinlandCountry, isGermanyCountry, isBelgiumCountry, isItalyCountry, isNetherlandsCountry, isNorwayCountry, isPolandCountry, isAustriaCountry, isSwitzerlandCountry, isPortugalCountry, isIrelandCountry, isCzechiaCountry, isHungaryCountry, isGreeceCountry, isRomaniaCountry, isSlovakiaCountry, isBulgariaCountry, isCroatiaCountry, isSloveniaCountry, isLithuaniaCountry, isLatviaCountry, isEstoniaCountry, isLuxembourgCountry, isMaltaCountry, isCyprusCountry, isIcelandCountry, isLiechtensteinCountry, isAndorraCountry, isMonacoCountry, isSanMarinoCountry, isVaticanCityCountry, isMoldovaCountry, isMontenegroCountry, isNorthMacedoniaCountry, isBosniaHerzegovinaCountry, isAlbaniaCountry, isKosovoCountry, isSerbiaCountry, isSpainCountry, isSwedenCountry, isUnitedKingdomCountry} from '@/utils/gymCountry';

export type DanishRegion =
  | 'København'
  | 'Sjælland'
  | 'Fyn'
  | 'Jylland'
  | 'Stockholm'
  | 'Göteborg'
  | 'Malmö'
  | 'Sverige'
  | 'Norge'
  | 'Tyskland'
  | 'Storbritannien'
  | 'Suomi'
  | 'Nederland'
  | 'France'
  | 'España'
  | 'Italia'
  | 'België'
  | 'Polska'
  | 'Österreich'
  | 'Schweiz'
  | 'Portugal'
  | 'Ireland'
  | 'Czechia'
  | 'Hungary'
  | 'Greece'
  | 'Romania'
  | 'Slovakia'
  | 'Bulgaria'
  | 'Croatia'
  | 'Slovenia'
  | 'Lithuania'
  | 'Latvia'
  | 'Estonia'
  | 'Luxembourg'
  | 'Malta'
  | 'Cyprus'
  | 'Iceland'
  | 'Liechtenstein'
  | 'Andorra'
  | 'Monaco'
  | 'San Marino'
  | 'Vatican City'
  | 'Moldova'
  | 'Montenegro'
  | 'North Macedonia';

export type DanishGym = {
  id: string;
  name: string;
  city?: string;
  address?: string;
  postalCode?: string;
  country: string;
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
    p >= 8000 &&
    p < 10000 &&
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

function inferSwedishRegion(city: string, name: string): DanishRegion {
  const blob = `${city} ${name}`.toLowerCase();
  if (
    blob.includes('stockholm') ||
    blob.includes('solna') ||
    blob.includes('sundbyberg') ||
    blob.includes('nacka') ||
    blob.includes('huddinge') ||
    blob.includes('täby') ||
    blob.includes('taby') ||
    blob.includes('sollentuna') ||
    blob.includes('jakobsberg') ||
    blob.includes('haninge') ||
    blob.includes('danderyd') ||
    blob.includes('ekero') ||
    blob.includes('ekerö') ||
    blob.includes('farsta') ||
    blob.includes('hägersten') ||
    blob.includes('hagersten') ||
    blob.includes('liljeholmen') ||
    blob.includes('södermalm') ||
    blob.includes('sodermalm') ||
    blob.includes('vasastan') ||
    blob.includes('kungsholmen') ||
    blob.includes('östermalm') ||
    blob.includes('ostermalm') ||
    blob.includes('vällingby') ||
    blob.includes('vallingby') ||
    blob.includes('bromma') ||
    blob.includes('enskede') ||
    blob.includes('johanneshov') ||
    blob.includes('bandhagen') ||
    blob.includes('spånga') ||
    blob.includes('spanga') ||
    blob.includes('järfälla') ||
    blob.includes('jarfalla') ||
    blob.includes('upplands väsby') ||
    blob.includes('upplands vasby') ||
    blob.includes('kungsängen') ||
    blob.includes('kungsangen') ||
    blob.includes('rimbo') ||
    blob.includes('knivsta') ||
    blob.includes('årsta') ||
    blob.includes('arsta') ||
    blob.includes('tyresö') ||
    blob.includes('tyreso') ||
    blob.includes('lidingö') ||
    blob.includes('lidingo') ||
    blob.includes('norsborg') ||
    blob.includes('rågsved') ||
    blob.includes('ragsved') ||
    blob.includes('saltsjöbaden') ||
    blob.includes('saltsjobaden') ||
    blob.includes('hammarby') ||
    blob.includes('gröndal') ||
    blob.includes('grondal') ||
    blob.includes('djursholm') ||
    blob.includes('hässelby') ||
    blob.includes('hasselby')
  ) {
    return 'Stockholm';
  }
  if (
    blob.includes('göteborg') ||
    blob.includes('goteborg') ||
    blob.includes('mölndal') ||
    blob.includes('molndal') ||
    blob.includes('partille') ||
    blob.includes('kungsbacka') ||
    blob.includes('hisingen') ||
    blob.includes('frölunda') ||
    blob.includes('frolunda') ||
    blob.includes('torslanda') ||
    blob.includes('landvetter') ||
    blob.includes('biskopsgården') ||
    blob.includes('biskopsgarden') ||
    blob.includes('billdal') ||
    blob.includes('kållered') ||
    blob.includes('kallered') ||
    blob.includes('tuve') ||
    blob.includes('surte') ||
    blob.includes('älvängen') ||
    blob.includes('alvangen') ||
    blob.includes('sävedalen') ||
    blob.includes('savedalen')
  ) {
    return 'Göteborg';
  }
  if (
    blob.includes('malmö') ||
    blob.includes('malmo') ||
    blob.includes('lund') ||
    blob.includes('helsingborg') ||
    blob.includes('hyllie') ||
    blob.includes('limhamn')
  ) {
    return 'Malmö';
  }
  return 'Sverige';
}

function inferGymRegion(c: GymCenter): DanishRegion {
  if (isSwedenCountry(c.country)) {
    return inferSwedishRegion(c.city, c.name);
  }
  if (isNorwayCountry(c.country)) {
    return 'Norge';
  }
  if (isGermanyCountry(c.country)) {
    return 'Tyskland';
  }
  if (isUnitedKingdomCountry(c.country)) {
    return 'Storbritannien';
  }
  if (isFinlandCountry(c.country)) {
    return 'Suomi';
  }
  if (isNetherlandsCountry(c.country)) {
    return 'Nederland';
  }
  if (isFranceCountry(c.country)) {
    return 'France';
  }
  if (isSpainCountry(c.country)) {
    return 'España';
  }
  if (isItalyCountry(c.country)) {
    return 'Italia';
  }
  if (isBelgiumCountry(c.country)) {
    return 'België';
  }
  if (isPolandCountry(c.country)) {
    return 'Polska';
  }
  if (isAustriaCountry(c.country)) {
    return 'Österreich';
  }
  if (isSwitzerlandCountry(c.country)) {
    return 'Schweiz';
  }
  if (isPortugalCountry(c.country)) {
    return 'Portugal';
  }
  if (isIrelandCountry(c.country)) {
    return 'Ireland';
  }
  if (isCzechiaCountry(c.country)) {
    return 'Czechia';
  }
  if (isHungaryCountry(c.country)) {
    return 'Hungary';
  }
  if (isGreeceCountry(c.country)) {
    return 'Greece';
  }
  if (isRomaniaCountry(c.country)) {
    return 'Romania';
  }
  if (isSlovakiaCountry(c.country)) {
    return 'Slovakia';
  }
  if (isBulgariaCountry(c.country)) {
    return 'Bulgaria';
  }
  if (isCroatiaCountry(c.country)) {
    return 'Croatia';
  }
  if (isSloveniaCountry(c.country)) {
    return 'Slovenia';
  }
  if (isLithuaniaCountry(c.country)) {
    return 'Lithuania';
  }
  if (isLatviaCountry(c.country)) {
    return 'Latvia';
  }
  if (isEstoniaCountry(c.country)) {
    return 'Estonia';
  }
  if (isLuxembourgCountry(c.country)) {
    return 'Luxembourg';
  }
  if (isMaltaCountry(c.country)) {
    return 'Malta';
  }
  if (isCyprusCountry(c.country)) {
    return 'Cyprus';
  }
  if (isIcelandCountry(c.country)) {
    return 'Iceland';
  }
  if (isLiechtensteinCountry(c.country)) {
    return 'Liechtenstein';
  }
  if (isAndorraCountry(c.country)) {
    return 'Andorra';
  }
  if (isMonacoCountry(c.country)) {
    return 'Monaco';
  }
  if (isSanMarinoCountry(c.country)) {
    return 'San Marino';
  }
  if (isVaticanCityCountry(c.country)) {
    return 'Vatican City';
  }
  if (isMoldovaCountry(c.country)) {
    return 'Moldova';
  }
  if (isMontenegroCountry(c.country)) {
    return 'Montenegro';
  }
  if (isNorthMacedoniaCountry(c.country)) {
    return 'North Macedonia';
  }
  if (isBosniaHerzegovinaCountry(c.country)) {
    return 'Bosnia and Herzegovina';
  }
  if (isAlbaniaCountry(c.country)) {
    return 'Albania';
  }
  if (isKosovoCountry(c.country)) {
    return 'Kosovo';
  }
  if (isSerbiaCountry(c.country)) {
    return 'Serbia';
  }
  return inferDanishRegion(c.postal_code, c.city);
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
    country: c.country,
    region: inferGymRegion(c),
    latitude: lat,
    longitude: lng,
    brand: c.brand,
    logoKey: logoKey || undefined,
    is_coming_soon: c.is_coming_soon,
    _center: c,
  };
}

const danishGyms: DanishGym[] = ALL_GYM_CENTERS.map(toDanishGym);

const GYM_BY_ID = new Map<string, DanishGym>();
const GYM_BY_ID_LOWER = new Map<string, DanishGym>();
for (const g of danishGyms) {
  GYM_BY_ID.set(g.id, g);
  GYM_BY_ID_LOWER.set(g.id.trim().toLowerCase(), g);
}

let activeGymsCache: DanishGym[] | null = null;
const gymsByCountryCache = new Map<string, DanishGym[]>();
const activeGymsByCountryCache = new Map<string, DanishGym[]>();

function countryCacheKey(country: string): string {
  if (isDenmarkCountry(country)) {
    return 'denmark';
  }
  if (isSwedenCountry(country)) {
    return 'sweden';
  }
  if (isNorwayCountry(country)) {
    return 'norway';
  }
  if (isGermanyCountry(country)) {
    return 'germany';
  }
  if (isUnitedKingdomCountry(country)) {
    return 'united_kingdom';
  }
  if (isFinlandCountry(country)) {
    return 'finland';
  }
  if (isNetherlandsCountry(country)) {
    return 'netherlands';
  }
  if (isFranceCountry(country)) {
    return 'france';
  }
  if (isSpainCountry(country)) {
    return 'spain';
  }
  if (isItalyCountry(country)) {
    return 'italy';
  }
  if (isBelgiumCountry(country)) {
    return 'belgium';
  }
  if (isPolandCountry(country)) {
    return 'poland';
  }
  if (isAustriaCountry(country)) {
    return 'austria';
  }
  if (isSwitzerlandCountry(country)) {
    return 'switzerland';
  }
  if (isPortugalCountry(country)) {
    return 'portugal';
  }
  if (isIrelandCountry(country)) {
    return 'ireland';
  }
  if (isCzechiaCountry(country)) {
    return 'czechia';
  }
  if (isHungaryCountry(country)) {
    return 'hungary';
  }
  if (isGreeceCountry(country)) {
    return 'greece';
  }
  if (isRomaniaCountry(country)) {
    return 'romania';
  }
  if (isSlovakiaCountry(country)) {
    return 'slovakia';
  }
  if (isBulgariaCountry(country)) {
    return 'bulgaria';
  }
  if (isCroatiaCountry(country)) {
    return 'croatia';
  }
  if (isSloveniaCountry(country)) {
    return 'slovenia';
  }
  if (isLithuaniaCountry(country)) {
    return 'lithuania';
  }
  if (isLatviaCountry(country)) {
    return 'latvia';
  }
  if (isEstoniaCountry(country)) {
    return 'estonia';
  }
  if (isLuxembourgCountry(country)) {
    return 'luxembourg';
  }
  if (isMaltaCountry(country)) {
    return 'malta';
  }
  if (isCyprusCountry(country)) {
    return 'cyprus';
  }
  if (isIcelandCountry(country)) {
    return 'iceland';
  }
  if (isLiechtensteinCountry(country)) {
    return 'liechtenstein';
  }
  if (isAndorraCountry(country)) {
    return 'andorra';
  }
  if (isMonacoCountry(country)) {
    return 'monaco';
  }
  if (isSanMarinoCountry(country)) {
    return 'san-marino';
  }
  if (isVaticanCityCountry(country)) {
    return 'vatican-city';
  }
  if (isMoldovaCountry(country)) {
    return 'moldova';
  }
  if (isMontenegroCountry(country)) {
    return 'montenegro';
  }
  if (isNorthMacedoniaCountry(country)) {
    return 'north-macedonia';
  }
  if (isBosniaHerzegovinaCountry(country)) {
    return 'bosnia-and-herzegovina';
  }
  if (isAlbaniaCountry(country)) {
    return 'albania';
  }
  if (isKosovoCountry(country)) {
    return 'kosovo';
  }
  if (isSerbiaCountry(country)) {
    return 'serbia';
  }
  return country.trim().toLowerCase() || 'unknown';
}

function isActiveMappableGym(g: DanishGym): boolean {
  return (
    g._center.is_active &&
    !g._center.is_coming_soon &&
    Number.isFinite(g.latitude) &&
    Number.isFinite(g.longitude)
  );
}

/** Global live catalog (finite coords). Historical name kept as alias. */
export function getActiveGyms(): DanishGym[] {
  if (!activeGymsCache) {
    activeGymsCache = danishGyms.filter(isActiveMappableGym);
  }
  return activeGymsCache;
}

/** @deprecated Use getActiveGyms — returns the global active catalog, not Denmark only. */
export function getActiveDanishGyms(): DanishGym[] {
  return getActiveGyms();
}

export function getGymsByCountry(country: string): DanishGym[] {
  const key = countryCacheKey(country);
  let list = gymsByCountryCache.get(key);
  if (!list) {
    list = danishGyms.filter(g => countryCacheKey(g.country) === key);
    gymsByCountryCache.set(key, list);
  }
  return list;
}

export function getActiveGymsByCountry(country: string): DanishGym[] {
  const key = countryCacheKey(country);
  let list = activeGymsByCountryCache.get(key);
  if (!list) {
    list = getGymsByCountry(country).filter(isActiveMappableGym);
    activeGymsByCountryCache.set(key, list);
  }
  return list;
}

export function findGymRecordById(id: string | null | undefined): DanishGym | null {
  if (id == null || id === '') {
    return null;
  }
  return GYM_BY_ID.get(id) ?? null;
}

export function findGymRecordByIdRelaxed(id: string | null | undefined): DanishGym | null {
  const exact = findGymRecordById(id);
  if (exact) {
    return exact;
  }
  if (id == null || id === '') {
    return null;
  }
  const t = String(id).trim().toLowerCase();
  if (!t) {
    return null;
  }
  return GYM_BY_ID_LOWER.get(t) ?? null;
}

/** Første center — også når aktiv-listen er tom (demo / edge cases). */
export function getDanishGymDemoFallback(): DanishGym {
  const active = getActiveDanishGyms();
  if (active.length > 0) {
    return active[0]!;
  }
  const raw = ALL_GYM_CENTERS[0];
  if (raw) {
    return toDanishGym(raw);
  }
  const synthetic: GymCenter = {
    id: 'demo_gym_fallback',
    name: 'Demo Center',
    brand: 'Demo',
    address: '',
    postal_code: '1000',
    city: 'København',
    country: 'Denmark',
    lat: 55.6761,
    lng: 12.5683,
    is_active: true,
  };
  return toDanishGym(synthetic);
}

export default danishGyms;
