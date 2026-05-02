import danishGyms, {DanishGym} from '@/data/danishGyms';

const BRAND_CANONICAL_MAP: Array<{re: RegExp; value: string}> = [
  {re: /^fitness[\s_]*x$/i, value: 'Fitness X'},
  {re: /^sats$/i, value: 'SATS'},
  {re: /^pure[\s_]*gym$/i, value: 'PureGym'},
  {re: /^loop(\s+fitness)?$/i, value: 'LOOP'},
  {re: /^arca$/i, value: 'ARCA'},
  {re: /^(sporting health club|shc)$/i, value: 'Sporting Health Club'},
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

export const formatGymDisplayName = (gym?: DanishGym | null) => {
  if (!gym) {
    return 'Ubekendt center';
  }
  const canonicalBrand = normalizeGymBrand(gym.brand);
  const rawName = (gym.name ?? '').trim() || 'Ubekendt center';
  return formatGymNameWithBrand(rawName, canonicalBrand);
};

export const findGymById = (id?: string | null): DanishGym | null => {
  if (id == null || id === '') {
    return null;
  }
  return danishGyms.find(gym => gym.id === id) || null;
};


