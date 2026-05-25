import type {DanishGym} from '@/data/danishGyms';
import {getActiveDanishGyms} from '@/data/danishGyms';
import {formatGymDisplayName, normalizeGymBrand} from '@/utils/gymDisplay';
import {
  compactGymSearchValue,
  normalizeGymSearchValue,
} from './gymSearchNormalize';

export type GymSearchIndexEntry = {
  gym: DanishGym;
  nameNorm: string;
  nameCompact: string;
  brandNorm: string;
  brandCompact: string;
  cityNorm: string;
  streetNorm: string;
  addressNorm: string;
  regionNorm: string;
  postalNorm: string;
  /** Combined searchable blob + aliases */
  haystack: string;
  haystackCompact: string;
  words: string[];
};

const CHAIN_ALIASES: Record<string, string[]> = {
  puregym: ['pure gym', 'pure'],
  sats: ['sat'],
  'fitness x': ['fitnessx', 'fx', 'fitness'],
  arca: ['arca fitness'],
  'loop fitness': ['loop'],
  'sporting health club': ['shc', 'sporting'],
  shc: ['sporting health club', 'sporting'],
};

function extractStreet(address?: string): string {
  if (!address?.trim()) {
    return '';
  }
  const first = address.split(',')[0]?.trim() ?? '';
  return first.replace(/^\d+\s*/, '').trim();
}

function extractArea(city?: string, address?: string): string[] {
  const areas: string[] = [];
  const c = (city ?? '').toLowerCase();
  if (c.includes('københavn') || c.includes('kobenhavn')) {
    areas.push('københavn', 'kobenhavn', 'copenhagen', 'kbh');
  }
  if (c.includes('nørre') || c.includes('norre')) {
    areas.push('nørrebro', 'norrebro');
  }
  if (c.includes('øster') || c.includes('oster')) {
    areas.push('østerbro', 'osterbro');
  }
  if (c.includes('amager')) {
    areas.push('amager');
  }
  if (c.includes('valby')) {
    areas.push('valby');
  }
  if (c.includes('frederiksberg')) {
    areas.push('frederiksberg', 'frb');
  }
  const addr = (address ?? '').toLowerCase();
  for (const token of ['nørrelund', 'norrelund', 'fasanvej', 'gothersgade', 'portugalsgade']) {
    if (addr.includes(token.replace('ø', 'o')) || addr.includes(token)) {
      areas.push(token);
    }
  }
  return areas;
}

function buildKeywords(gym: DanishGym): string[] {
  const parts: string[] = [];
  const display = formatGymDisplayName(gym);
  const rawBrand = (gym.brand ?? '').trim();
  const brandNorm = normalizeGymBrand(gym.brand);
  parts.push(gym.name, display, rawBrand, brandNorm);
  if (gym.city) {
    parts.push(gym.city);
  }
  if (gym.address) {
    parts.push(gym.address);
  }
  if (gym.postalCode) {
    parts.push(gym.postalCode);
  }
  parts.push(gym.region);

  const street = extractStreet(gym.address);
  if (street) {
    parts.push(street);
  }

  const brandKey = normalizeGymSearchValue(rawBrand || brandNorm);
  const aliases = CHAIN_ALIASES[brandKey] ?? CHAIN_ALIASES[brandKey.replace(/\s+/g, '')] ?? [];
  parts.push(...aliases);
  parts.push(...extractArea(gym.city, gym.address));

  const nameParts = gym.name.split(/[—–\-|]/).map(s => s.trim()).filter(Boolean);
  parts.push(...nameParts);

  return parts;
}

export function buildGymSearchEntry(gym: DanishGym): GymSearchIndexEntry {
  const keywords = buildKeywords(gym);
  const haystackRaw = keywords.join(' ');
  const nameNorm = normalizeGymSearchValue(gym.name);
  const brandNorm = normalizeGymSearchValue(gym.brand ?? '');
  const cityNorm = normalizeGymSearchValue(gym.city ?? '');
  const streetNorm = normalizeGymSearchValue(extractStreet(gym.address));
  const addressNorm = normalizeGymSearchValue(gym.address ?? '');
  const regionNorm = normalizeGymSearchValue(gym.region ?? '');
  const postalNorm = normalizeGymSearchValue(gym.postalCode ?? '');

  return {
    gym,
    nameNorm,
    nameCompact: compactGymSearchValue(gym.name),
    brandNorm,
    brandCompact: compactGymSearchValue(gym.brand ?? ''),
    cityNorm,
    streetNorm,
    addressNorm,
    regionNorm,
    postalNorm,
    haystack: normalizeGymSearchValue(haystackRaw),
    haystackCompact: compactGymSearchValue(haystackRaw),
    words: normalizeGymSearchValue(haystackRaw).split(' ').filter(w => w.length >= 2),
  };
}

let cachedIndex: GymSearchIndexEntry[] | null = null;

export function getGymSearchIndex(gyms?: DanishGym[]): GymSearchIndexEntry[] {
  if (!gyms && cachedIndex) {
    return cachedIndex;
  }
  const source = gyms ?? getActiveDanishGyms();
  const index = source.map(buildGymSearchEntry);
  if (!gyms) {
    cachedIndex = index;
  }
  return index;
}
