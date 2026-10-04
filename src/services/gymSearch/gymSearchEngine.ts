import type {DanishGym} from '@/data/danishGyms';
import {
  compactGymSearchValue,
  foldNordicSearchEquivalents,
  levenshtein,
  normalizeGymSearchValue,
  tokenizeGymQuery,
} from './gymSearchNormalize';
import {
  getGymSearchIndex,
  getGymSearchPrefix4,
  getGymSearchPrefix6,
  getGymSearchWordIndex,
  type GymSearchIndexEntry,
} from './gymSearchIndex';

function includesFolded(haystack: string, needle: string): boolean {
  if (!needle) {
    return true;
  }
  return haystack.includes(needle);
}

function equalsFolded(a: string, b: string): boolean {
  return a === b;
}

function startsWithFolded(value: string, prefix: string): boolean {
  if (!prefix) {
    return true;
  }
  return value.startsWith(prefix);
}

const FUZZY_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Edit-distance 1 variants that keep the same first character. */
function fuzzyEntryIds(
  token: string,
  wordIndex: Map<string, number[]>,
): Set<number> {
  const hits = new Set<number>();
  if (token.length < 4) {
    return hits;
  }
  const variants = new Set<string>();
  const n = token.length;
  const initial = token.charAt(0);
  for (let i = 0; i < n; i++) {
    const deleted = token.slice(0, i) + token.slice(i + 1);
    if (
      deleted.charAt(0) === initial &&
      Math.abs(deleted.length - n) <= 1
    ) {
      variants.add(deleted);
    }
    if (i < n - 1) {
      const transposed =
        token.slice(0, i) +
        token.charAt(i + 1) +
        token.charAt(i) +
        token.slice(i + 2);
      if (transposed.charAt(0) === initial) {
        variants.add(transposed);
      }
    }
    for (let c = 0; c < FUZZY_ALPHABET.length; c++) {
      const ch = FUZZY_ALPHABET.charAt(c);
      if (ch === token.charAt(i)) {
        continue;
      }
      const substituted = token.slice(0, i) + ch + token.slice(i + 1);
      if (substituted.charAt(0) === initial) {
        variants.add(substituted);
      }
    }
  }
  for (let i = 0; i <= n; i++) {
    for (let c = 0; c < FUZZY_ALPHABET.length; c++) {
      const ch = FUZZY_ALPHABET.charAt(c);
      const inserted = token.slice(0, i) + ch + token.slice(i);
      if (inserted.charAt(0) === initial && Math.abs(inserted.length - n) <= 1) {
        variants.add(inserted);
      }
    }
  }
  for (const variant of variants) {
    const ids = wordIndex.get(variant);
    if (!ids) {
      continue;
    }
    for (const id of ids) {
      hits.add(id);
    }
  }
  return hits;
}

/** Brand+place glued queries e.g. fitnessxnorrebro / puregymvalby */
function compactGluedMatch(
  entry: GymSearchIndexEntry,
  queryCompact: string,
): boolean {
  const q = queryCompact;
  if (q.length < 6) {
    return false;
  }
  const hay = entry.haystackCompact;
  if (hay.includes(q)) {
    return true;
  }
  const brand = entry.brandCompact;
  if (brand.length >= 3 && q.startsWith(brand)) {
    const rest = q.slice(brand.length);
    if (rest.length < 3) {
      return false;
    }
    return (
      entry.nameCompact.includes(rest) ||
      entry.cityNorm.replace(/\s+/g, '').includes(rest) ||
      entry.streetNorm.replace(/\s+/g, '').includes(rest) ||
      entry.addressNorm.replace(/\s+/g, '').includes(rest) ||
      hay.includes(rest)
    );
  }
  return false;
}

export type GymSearchHit = {
  gym: DanishGym;
  score: number;
  distanceM: number | null;
};

export type GymSearchOptions = {
  userLat?: number;
  userLng?: number;
  favoriteIds?: string[];
  limit?: number;
  /** Minimum score to include (fuzzy floor) */
  minScore?: number;
  gyms?: DanishGym[];
};

function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function tokenMatches(
  entry: GymSearchIndexEntry,
  token: string,
  fuzzyHit: boolean,
): boolean {
  // `token` is already normalized and Nordic-folded.
  const t = token;
  const tc = token.replace(/\s+/g, '');
  if (!t) {
    return true;
  }
  // Single-letter tokens (e.g. "x" in "fitness x") are too broad as hard filters.
  if (t.length < 2) {
    return (
      includesFolded(entry.brandNorm, t) ||
      includesFolded(entry.brandCompact, tc) ||
      includesFolded(entry.nameNorm, t)
    );
  }

  if (
    includesFolded(entry.haystack, t) ||
    includesFolded(entry.haystackCompact, tc) ||
    includesFolded(entry.nameNorm, t) ||
    includesFolded(entry.nameCompact, tc) ||
    includesFolded(entry.brandNorm, t) ||
    includesFolded(entry.brandCompact, tc) ||
    includesFolded(entry.cityNorm, t) ||
    includesFolded(entry.streetNorm, t) ||
    includesFolded(entry.addressNorm, t) ||
    includesFolded(entry.postalNorm, t)
  ) {
    return true;
  }

  if (compactGluedMatch(entry, tc)) {
    return true;
  }

  const postalCompact = entry.postalCompact;
  if (
    tc.length >= 2 &&
    postalCompact &&
    (equalsFolded(postalCompact, tc) ||
      startsWithFolded(postalCompact, tc) ||
      (tc.length >= 5 && includesFolded(postalCompact, tc)))
  ) {
    return true;
  }

  if (t.length >= 2 && entry.words.some(w => startsWithFolded(w, t))) {
    return true;
  }

  if (fuzzyHit) {
    return true;
  }

  if (t.length >= 4) {
    const nameFold = entry.nameCompact;
    if (
      tc.length >= 5 &&
      Math.abs(nameFold.length - tc.length) <= 2 &&
      nameFold.charAt(0) === tc.charAt(0) &&
      levenshtein(nameFold, tc) <= 2
    ) {
      return true;
    }
  }

  return false;
}

function scoreEntry(
  entry: GymSearchIndexEntry,
  tokens: string[],
  queryNorm: string,
  queryCompact: string,
  favoriteSet: Set<string>,
  distanceM: number | null,
): number {
  let score = 0;
  const queryFold = queryNorm;
  const queryCompactFold = queryCompact;

  if (queryNorm.length >= 2) {
    if (equalsFolded(entry.nameNorm, queryNorm)) {
      score += 220;
    } else if (startsWithFolded(entry.nameNorm, queryNorm)) {
      score += 150;
    } else if (startsWithFolded(entry.nameCompact, queryCompact)) {
      score += 130;
    } else if (includesFolded(entry.haystack, queryNorm)) {
      score += 90;
    } else if (includesFolded(entry.haystackCompact, queryCompact)) {
      score += 75;
    } else if (compactGluedMatch(entry, queryCompact)) {
      score += 95;
    }

    const postalCompact = entry.postalCompact;
    if (postalCompact && queryCompact.length >= 2) {
      if (equalsFolded(postalCompact, queryCompact)) {
        score += 110;
      } else if (startsWithFolded(postalCompact, queryCompact)) {
        score += 70;
      }
    }
  }

  for (const token of tokens) {
    if (token.length < 2) {
      if (
        includesFolded(entry.brandNorm, token) ||
        includesFolded(entry.nameNorm, token)
      ) {
        score += 8;
      }
      continue;
    }
    if (equalsFolded(entry.nameNorm, token)) {
      score += 80;
    } else if (startsWithFolded(entry.nameNorm, token)) {
      score += 65;
    } else if (
      equalsFolded(entry.brandNorm, token) ||
      equalsFolded(entry.brandCompact, token)
    ) {
      score += 60;
    } else if (startsWithFolded(entry.brandNorm, token)) {
      score += 55;
    } else if (includesFolded(entry.nameNorm, token)) {
      score += 48;
    } else if (
      includesFolded(entry.cityNorm, token) ||
      startsWithFolded(entry.cityNorm, token)
    ) {
      score += 42;
    } else if (includesFolded(entry.streetNorm, token)) {
      score += 38;
    } else if (includesFolded(entry.addressNorm, token)) {
      score += 30;
    } else if (
      equalsFolded(entry.postalNorm, token) ||
      equalsFolded(entry.postalCompact, token.replace(/\s+/g, ''))
    ) {
      score += 70;
    } else if (
      token.length >= 2 &&
      (startsWithFolded(entry.postalNorm, token) ||
        startsWithFolded(entry.postalCompact, token.replace(/\s+/g, '')))
    ) {
      score += 50;
    } else if (includesFolded(entry.haystack, token)) {
      score += 22;
    } else if (entry.words.some(w => startsWithFolded(w, token))) {
      score += 18;
    } else if (
      token.length >= 4 &&
      entry.words.some(
        w =>
          Math.abs(w.length - token.length) <= 1 &&
          w.charAt(0) === token.charAt(0) &&
          levenshtein(w, token) <= 1,
      )
    ) {
      score += 12;
    }
  }

  // Prefer stronger full-query compact hits over weak partial brand-only noise.
  if (queryCompactFold.length >= 6 && compactGluedMatch(entry, queryCompact)) {
    score += 40;
  }
  if (
    queryFold.length >= 4 &&
    includesFolded(entry.streetNorm, queryFold.split(' ').slice(-1)[0] ?? '')
  ) {
    score += 10;
  }

  if (favoriteSet.has(entry.gym.id)) {
    score += 55;
  }

  if (distanceM != null && Number.isFinite(distanceM)) {
    const km = distanceM / 1000;
    // Soft nearby bonus only — never a hard radius cutoff.
    score += Math.max(0, 35 - km * 4);
  }

  return score;
}

const PREFIX_CANDIDATE_CAP = 2500;

/**
 * For a long token, scan gyms whose words share its first 6 characters.
 * Short tokens stay on the full catalog so mid-word matches are not dropped.
 */
function narrowCandidateIndexes(
  tokens: string[],
  prefix4: Map<string, number[]>,
  prefix6: Map<string, number[]>,
  fuzzyByToken: Map<string, Set<number>>,
): number[] | null {
  let best: number[] | null = null;
  for (const token of tokens) {
    if (token.length < 4) {
      continue;
    }
    const table = token.length >= 6 ? prefix6 : prefix4;
    const width = token.length >= 6 ? 6 : 4;
    const bucket = table.get(token.slice(0, width));
    if (!bucket || bucket.length === 0 || bucket.length > PREFIX_CANDIDATE_CAP) {
      continue;
    }
    if (!best || bucket.length < best.length) {
      best = bucket;
    }
  }
  if (!best) {
    return null;
  }
  let extraCount = 0;
  for (const ids of fuzzyByToken.values()) {
    extraCount += ids.size;
  }
  if (extraCount === 0) {
    return best;
  }
  const merged = best.slice();
  const seen = new Set(best);
  for (const ids of fuzzyByToken.values()) {
    for (const id of ids) {
      if (!seen.has(id)) {
        seen.add(id);
        merged.push(id);
      }
    }
  }
  return merged;
}

/**
 * Rank gyms by relevance. Empty query → distance + favorites, no scoring filter.
 */
export function searchGyms(
  queryRaw: string,
  options: GymSearchOptions = {},
): GymSearchHit[] {
  const {
    userLat,
    userLng,
    favoriteIds = [],
    limit = 40,
    minScore = 8,
    gyms,
  } = options;

  const index = getGymSearchIndex(gyms);
  const favoriteSet = new Set(favoriteIds);
  const hasLocation =
    userLat != null && userLng != null && Number.isFinite(userLat) && Number.isFinite(userLng);

  const trimmed = queryRaw.trim();
  if (!trimmed) {
    return index
      .map(entry => {
        const distanceM =
          hasLocation
            ? distanceMeters(userLat!, userLng!, entry.gym.latitude, entry.gym.longitude)
            : null;
        const score =
          (favoriteSet.has(entry.gym.id) ? 100 : 0) +
          (distanceM != null ? Math.max(0, 50 - distanceM / 2000) : 0);
        return {gym: entry.gym, score, distanceM};
      })
      .sort((a, b) => {
        const favA = favoriteSet.has(a.gym.id) ? 1 : 0;
        const favB = favoriteSet.has(b.gym.id) ? 1 : 0;
        if (favB !== favA) {
          return favB - favA;
        }
        const da = a.distanceM ?? Number.POSITIVE_INFINITY;
        const db = b.distanceM ?? Number.POSITIVE_INFINITY;
        if (da !== db) {
          return da - db;
        }
        return a.gym.id.localeCompare(b.gym.id);
      })
      .slice(0, limit);
  }

  const tokens = tokenizeGymQuery(trimmed).map(foldNordicSearchEquivalents);
  const significantTokens = tokens.filter(t => t.length >= 2);
  const queryNorm = foldNordicSearchEquivalents(normalizeGymSearchValue(trimmed));
  const queryCompact = foldNordicSearchEquivalents(compactGymSearchValue(trimmed));
  const queryCompactFold = queryCompact;
  const wordIndex = getGymSearchWordIndex(gyms);
  const prefix6 = getGymSearchPrefix6(gyms);
  const prefix4 = getGymSearchPrefix4(gyms);
  const fuzzyByToken = new Map<string, Set<number>>();
  for (const token of tokens) {
    if (token.length >= 4 && !fuzzyByToken.has(token)) {
      fuzzyByToken.set(token, fuzzyEntryIds(token, wordIndex));
    }
  }

  const matchTokens = significantTokens.length > 0 ? significantTokens : tokens;
  const candidates = narrowCandidateIndexes(
    matchTokens,
    prefix4,
    prefix6,
    fuzzyByToken,
  );
  const scored: GymSearchHit[] = [];

  const consider = (i: number) => {
    const entry = index[i];
    const matchedTokens = matchTokens.filter(t =>
      tokenMatches(entry, t, fuzzyByToken.get(t)?.has(i) ?? false),
    );
    const allTokensMatch =
      matchTokens.length === 0 || matchedTokens.length === matchTokens.length;
    const glued = compactGluedMatch(entry, queryCompact);

    const nameFold = entry.nameCompact;
    const nameSlice = nameFold.slice(
      0,
      Math.min(nameFold.length, queryCompactFold.length + 2),
    );
    const plausibleTypo =
      queryCompactFold.length >= 4 &&
      Math.abs(nameSlice.length - queryCompactFold.length) <= 2 &&
      nameSlice.charAt(0) === queryCompactFold.charAt(0);
    const looseFullQuery =
      queryNorm.length >= 3 &&
      (includesFolded(entry.haystack, queryNorm) ||
        includesFolded(entry.haystackCompact, queryCompact) ||
        (plausibleTypo && levenshtein(nameSlice, queryCompactFold) <= 2));

    // Multi-token queries require every significant token (across name/city/address),
    // or a compact/glued/full-query hit — never brand-only partials.
    if (!allTokensMatch && !glued && !looseFullQuery) {
      return;
    }

    const distanceM = hasLocation
      ? distanceMeters(userLat!, userLng!, entry.gym.latitude, entry.gym.longitude)
      : null;

    let score = scoreEntry(
      entry,
      tokens.length > 0 ? tokens : [queryNorm],
      queryNorm,
      queryCompact,
      favoriteSet,
      distanceM,
    );

    if (glued && !allTokensMatch) {
      score += 25;
    }
    if (looseFullQuery && !allTokensMatch && !glued) {
      score += 20;
    }

    if (score >= minScore || glued || allTokensMatch || looseFullQuery) {
      scored.push({gym: entry.gym, score, distanceM});
    }
  };

  if (candidates) {
    for (const i of candidates) {
      consider(i);
    }
  } else {
    for (let i = 0; i < index.length; i++) {
      consider(i);
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    const favA = favoriteSet.has(a.gym.id) ? 1 : 0;
    const favB = favoriteSet.has(b.gym.id) ? 1 : 0;
    if (favB !== favA) {
      return favB - favA;
    }
    const da = a.distanceM ?? Number.POSITIVE_INFINITY;
    const db = b.distanceM ?? Number.POSITIVE_INFINITY;
    if (da !== db) {
      return da - db;
    }
    // Deterministic tie-break (no catalogue-order dependency).
    return a.gym.id.localeCompare(b.gym.id);
  });

  return scored.slice(0, limit);
}
