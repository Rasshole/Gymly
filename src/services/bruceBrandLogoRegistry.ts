/**
 * Stable brand → bundled logo mappings for Bruce-imported / Nordic chains.
 * Prefer these keys over loose substring matching when brand fields are messy.
 *
 * OAuth/client secrets must never live here — logo assets only.
 */

export type BruceBrandLogoKey =
  | 'energii'
  | 'inzhape'
  | 'power_house'
  | 'stc';

/** Canonical brand keys accepted from centre.brand / name prefixes. */
export const BRUCE_BRAND_ALIASES: Record<BruceBrandLogoKey, readonly string[]> = {
  energii: ['energii'],
  inzhape: ['inzhape'],
  power_house: [
    'power house',
    'powerhouse',
    'power studio by power house',
  ],
  stc: ['stc'],
};

/**
 * Brands that contain "power" but must NOT resolve to Power House.
 */
export const POWER_HOUSE_EXCLUSIONS: readonly RegExp[] = [
  /\bpower\s*yoga\b/i,
  /\bpowerhour\b/i,
  /\bw8\s*power/i,
];

export function normalizeBrandKey(raw?: string | null): string {
  return (raw || '')
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ');
}

export function matchBruceBrandLogoKey(
  brand?: string | null,
  gymName?: string | null,
): BruceBrandLogoKey | null {
  const combined = `${normalizeBrandKey(brand)} ${normalizeBrandKey(gymName)}`.trim();
  if (!combined) {
    return null;
  }
  for (const re of POWER_HOUSE_EXCLUSIONS) {
    if (re.test(combined)) {
      // still allow other brands; just skip power_house
      break;
    }
  }

  const brandNorm = normalizeBrandKey(brand);
  if (brandNorm === 'energii' || brandNorm.startsWith('energii ')) {
    return 'energii';
  }
  if (brandNorm === 'inzhape' || brandNorm.startsWith('inzhape ')) {
    return 'inzhape';
  }
  if (/\bstc\b/.test(combined)) {
    return 'stc';
  }

  const excludePowerHouse = POWER_HOUSE_EXCLUSIONS.some(re => re.test(combined));
  if (!excludePowerHouse) {
    if (
      brandNorm === 'power house' ||
      brandNorm.startsWith('power house ') ||
      brandNorm.includes('power studio by power house') ||
      brandNorm.replace(/\s+/g, '') === 'powerhouse' ||
      /\bpower studio by power house\b/.test(combined) ||
      /\bpower house\b/.test(combined)
    ) {
      return 'power_house';
    }
  }

  if (/\benergii\b/.test(combined)) {
    return 'energii';
  }
  if (/\binzhape\b/.test(combined)) {
    return 'inzhape';
  }
  return null;
}
