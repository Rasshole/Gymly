import {
  DanishGym,
  findGymRecordById,
  findGymRecordByIdRelaxed,
  type DanishRegion,
} from '@/data/danishGyms';
import type {GymCenter} from '@/types/center.types';

const BRAND_CANONICAL_MAP: Array<{re: RegExp; value: string}> = [
  {re: /^fitness[\s_]*x$/i, value: 'Fitness X'},
  {re: /^sats$/i, value: 'SATS'},
  {re: /^stc$/i, value: 'STC'},
  {re: /^pure[\s_]*gym$/i, value: 'PureGym'},
  {re: /^loop(\s+fitness)?$/i, value: 'LOOP'},
  {re: /^arca$/i, value: 'ARCA'},
  {re: /^(sporting health club|shc)$/i, value: 'Sporting Health Club'},
  {re: /^energii$/i, value: 'Energii'},
  {re: /^inzhape$/i, value: 'InZhape'},
  {re: /^power[\s_]*house$/i, value: 'Power House'},
  {
    re: /^power\s+studio\s+by\s+power\s+house/i,
    value: 'Power House',
  },
];

export function normalizeGymBrand(brand?: string | null): string {
  const raw = (brand ?? '').trim();
  if (!raw) {
    return '';
  }
  for (const row of BRAND_CANONICAL_MAP) {
    if (row.re.test(raw)) {
      return row.value;
    }
  }
  return raw;
}

function stripLeadingBrandPrefix(name: string, brand: string): string {
  const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return name.replace(new RegExp(`^${escaped}\\s*[—\\-:]\\s*`, 'i'), '').trim();
}

export function formatGymNameWithBrand(
  name?: string | null,
  brand?: string | null,
): string {
  const rawName = (name ?? '').trim();
  const canonicalBrand = normalizeGymBrand(brand);
  if (!rawName) {
    return canonicalBrand || 'Ubekendt center';
  }
  if (!canonicalBrand) {
    return rawName;
  }
  if (rawName.toLowerCase().startsWith(canonicalBrand.toLowerCase())) {
    return rawName;
  }
  const cleanedName = stripLeadingBrandPrefix(rawName, canonicalBrand) || rawName;
  return `${canonicalBrand} — ${cleanedName}`;
}

/**
 * True when `city` is already the trailing place segment of the gym display name
 * (e.g. "SATS — Valby" + city "Valby") so UI should not append it again.
 */
export function gymNameAlreadyIncludesCity(
  gymDisplayName: string,
  city?: string | null,
): boolean {
  const c = (city ?? '').trim().toLowerCase();
  if (!c) {
    return false;
  }
  const n = gymDisplayName.trim().toLowerCase();
  if (!n) {
    return false;
  }
  const parts = n.split(/\s*[—–\-]\s*/).map(p => p.trim()).filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  return last === c || n.endsWith(` ${c}`) || n === c;
}

/** Gym line + optional city for “trains often” — skips duplicate city. */
export function formatTrainsOftenGymAndCity(
  name?: string | null,
  brand?: string | null,
  city?: string | null,
): {gym: string; city?: string} {
  const gym = formatGymNameWithBrand(name, brand);
  const tail = (city ?? '').trim();
  if (!tail || gymNameAlreadyIncludesCity(gym, tail)) {
    return {gym};
  }
  return {gym, city: tail};
}

export const formatGymDisplayName = (gym?: DanishGym | null) => {
  if (!gym) {
    return 'Ubekendt center';
  }
  const canonicalBrand = normalizeGymBrand(gym.brand);
  const rawName = (gym.name ?? '').trim() || 'Ubekendt center';
  return formatGymNameWithBrand(rawName, canonicalBrand);
};

export const findGymById = (id?: string | null): DanishGym | null => {
  return findGymRecordById(id);
};

/** Matcher center_id fra DB (trim/case) når streng ikke er identisk med register */
export const findGymByIdRelaxed = (id?: string | null): DanishGym | null => {
  return findGymRecordByIdRelaxed(id);
};

function unresolvedRegion(centerId: string): DanishRegion {
  if (centerId.startsWith('gr_')) {
    return 'Greece';
  }
  if (centerId.startsWith('ro_')) {
    return 'Romania';
  }
  if (centerId.startsWith('sk_')) {
    return 'Slovakia';
  }
  if (centerId.startsWith('bg_')) {
    return 'Bulgaria';
  }
  if (centerId.startsWith('hr_')) {
    return 'Croatia';
  }
  if (centerId.startsWith('si_')) {
    return 'Slovenia';
  }
  if (centerId.startsWith('lt_')) {
    return 'Lithuania';
  }
  if (centerId.startsWith('lv_')) {
    return 'Latvia';
  }
  if (centerId.startsWith('ee_')) {
    return 'Estonia';
  }
  if (centerId.startsWith('lu_')) {
    return 'Luxembourg';
  }
  if (centerId.startsWith('mt_')) {
    return 'Malta';
  }
  if (centerId.startsWith('ua_')) {
    return 'Ukraine';
  }
  if (centerId.startsWith('by_')) {
    return 'Belarus';
  }
  if (centerId.startsWith('cy_')) {
    return 'Cyprus';
  }
  if (centerId.startsWith('is_')) {
    return 'Iceland';
  }
  if (centerId.startsWith('li_')) {
    return 'Liechtenstein';
  }
  if (centerId.startsWith('ad_')) {
    return 'Andorra';
  }
  if (centerId.startsWith('mc_')) {
    return 'Monaco';
  }
  if (centerId.startsWith('sm_')) {
    return 'San Marino';
  }
  if (centerId.startsWith('va_')) {
    return 'Vatican City';
  }
  if (centerId.startsWith('md_')) {
    return 'Moldova';
  }
  if (centerId.startsWith('me_')) {
    return 'Montenegro';
  }
  if (centerId.startsWith('mk_')) {
    return 'North Macedonia';
  }
  if (centerId.startsWith('ba_')) {
    return 'Bosnia and Herzegovina';
  }
  if (centerId.startsWith('al_')) {
    return 'Albania';
  }
  if (centerId.startsWith('xk_')) {
    return 'Kosovo';
  }
  if (centerId.startsWith('rs_')) {
    return 'Serbia';
  }
  if (centerId.startsWith('hu_')) {
    return 'Hungary';
  }
  if (centerId.startsWith('cz_')) {
    return 'Czechia';
  }
  if (centerId.startsWith('ie_')) {
    return 'Ireland';
  }
  if (centerId.startsWith('pt_')) {
    return 'Portugal';
  }
  if (centerId.startsWith('ch_')) {
    return 'Schweiz';
  }
  if (centerId.startsWith('at_')) {
    return 'Österreich';
  }
  if (centerId.startsWith('pl_')) {
    return 'Polska';
  }
  if (centerId.startsWith('be_')) {
    return 'België';
  }
  if (centerId.startsWith('it_')) {
    return 'Italia';
  }
  if (centerId.startsWith('es_')) {
    return 'España';
  }
  if (centerId.startsWith('fr_')) {
    return 'France';
  }
  if (centerId.startsWith('nl_')) {
    return 'Nederland';
  }
  if (centerId.startsWith('fi_')) {
    return 'Suomi';
  }
  if (centerId.startsWith('gb_')) {
    return 'Storbritannien';
  }
  if (centerId.startsWith('de_')) {
    return 'Tyskland';
  }
  if (centerId.startsWith('no_')) {
    return 'Norge';
  }
  if (centerId.startsWith('se_')) {
    return 'Sverige';
  }
  return 'Sjælland';
}

function unresolvedCountry(centerId: string): string {
  if (centerId.startsWith('tr_')) {
    return 'Turkey';
  }
  if (centerId.startsWith('ge_')) {
    return 'Georgia';
  }
  if (centerId.startsWith('am_')) {
    return 'Armenia';
  }
  if (centerId.startsWith('az_')) {
    return 'Azerbaijan';
  }
  if (centerId.startsWith('ru_')) {
    return 'Russia';
  }
  if (centerId.startsWith('by_')) {
    return 'Belarus';
  }
  if (centerId.startsWith('ua_')) {
    return 'Ukraine';
  }
  if (centerId.startsWith('mt_')) {
    return 'Malta';
  }
  if (centerId.startsWith('lt_')) {
    return 'Lithuania';
  }
  if (centerId.startsWith('lv_')) {
    return 'Latvia';
  }
  if (centerId.startsWith('ee_')) {
    return 'Estonia';
  }
  return '';
}

/**
 * Display-only stub when a stored center_id cannot be resolved.
 * Must never substitute another live gym (e.g. getActiveGyms()[0]).
 */
export function unresolvedGymStub(
  centerId?: string | null,
  storedName?: string | null,
): DanishGym {
  const id = (centerId ?? '').trim() || 'unresolved';
  const name = (storedName ?? '').trim() || 'Unknown gym';
  const country = unresolvedCountry(id);
  const center: GymCenter = {
    id,
    name,
    brand: '',
    address: '',
    postal_code: '',
    city: '',
    country,
    lat: null,
    lng: null,
    is_active: false,
  };
  return {
    id,
    name,
    country,
    region: unresolvedRegion(id),
    latitude: Number.NaN,
    longitude: Number.NaN,
    _center: center,
  };
}

export function resolveGymOrStub(
  centerId?: string | null,
  storedName?: string | null,
): DanishGym {
  return (
    findGymById(centerId) ??
    findGymByIdRelaxed(centerId) ??
    unresolvedGymStub(centerId, storedName)
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compact gym address: street + "postal city", without repeating postal/city
 * when they are already embedded in the street line.
 */
export function formatCompactGymAddress(input: {
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  fallback?: string | null;
}): string {
  const postal = (input.postalCode ?? '').trim();
  const city = (input.city ?? '').trim();
  let street = (input.street ?? '').trim();

  if (street && postal && city) {
    const patterns = [
      new RegExp(
        `,\\s*${escapeRegExp(postal)}\\s*,\\s*${escapeRegExp(city)}\\s*$`,
        'i',
      ),
      new RegExp(
        `,\\s*${escapeRegExp(postal)}\\s+${escapeRegExp(city)}\\s*$`,
        'i',
      ),
      new RegExp(
        `\\s+${escapeRegExp(postal)}\\s*,\\s*${escapeRegExp(city)}\\s*$`,
        'i',
      ),
      new RegExp(
        `\\s+${escapeRegExp(postal)}\\s+${escapeRegExp(city)}\\s*$`,
        'i',
      ),
    ];
    for (const re of patterns) {
      street = street.replace(re, '').trim();
    }
  }
  if (street && city) {
    street = street
      .replace(new RegExp(`,\\s*${escapeRegExp(city)}\\s*$`, 'i'), '')
      .trim();
  }

  const locality = [postal, city].filter(Boolean).join(' ');
  const parts = [street, locality].filter(Boolean);
  if (parts.length > 0) {
    return parts.join(', ');
  }
  return (input.fallback ?? '').trim();
}

/** Prefer structured DanishGym / _center fields for a compact one-line address. */
export function formatCompactAddressForGym(
  gym: DanishGym | null | undefined,
  fallback?: string | null,
): string {
  if (!gym) {
    return (fallback ?? '').trim();
  }
  return formatCompactGymAddress({
    street: gym.address ?? gym._center?.address,
    postalCode: gym.postalCode ?? gym._center?.postal_code,
    city: gym.city ?? gym._center?.city,
    fallback,
  });
}
