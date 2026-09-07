import type {DanishGym} from '@/data/danishGyms';
import {
  compactGymSearchFolded,
  compactGymSearchValue,
  foldNordicSearchEquivalents,
  levenshtein,
  normalizeGymSearchValue,
  tokenizeGymQuery,
} from './gymSearchNormalize';
import {
  getGymSearchIndex,
  type GymSearchIndexEntry,
} from './gymSearchIndex';

function foldedIncludes(haystack: string, needle: string): boolean {
  if (!needle) {
    return true;
  }
  return foldNordicSearchEquivalents(haystack).includes(
    foldNordicSearchEquivalents(needle),
  );
}

function foldedEquals(a: string, b: string): boolean {
  return foldNordicSearchEquivalents(a) === foldNordicSearchEquivalents(b);
}

function foldedStartsWith(value: string, prefix: string): boolean {
  if (!prefix) {
    return true;
  }
  return foldNordicSearchEquivalents(value).startsWith(
    foldNordicSearchEquivalents(prefix),
  );
}

/** Brand+place glued queries e.g. fitnessxnorrebro / puregymvalby */
function compactGluedMatch(
  entry: GymSearchIndexEntry,
  queryCompact: string,
): boolean {
  const q = foldNordicSearchEquivalents(queryCompact);
  if (q.length < 6) {
    return false;
  }
  const hay = foldNordicSearchEquivalents(entry.haystackCompact);
  if (hay.includes(q)) {
    return true;
  }
  const brand = foldNordicSearchEquivalents(entry.brandCompact);
  if (brand.length >= 3 && q.startsWith(brand)) {
    const rest = q.slice(brand.length);
    if (rest.length < 3) {
      return false;
    }
    return (
      foldNordicSearchEquivalents(entry.nameCompact).includes(rest) ||
      foldNordicSearchEquivalents(entry.cityNorm.replace(/\s+/g, '')).includes(
        rest,
      ) ||
      foldNordicSearchEquivalents(entry.streetNorm.replace(/\s+/g, '')).includes(
        rest,
      ) ||
      foldNordicSearchEquivalents(entry.addressNorm.replace(/\s+/g, '')).includes(
        rest,
      ) ||
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

function tokenMatches(entry: GymSearchIndexEntry, token: string): boolean {
  // `token` is already passed through tokenizeGymQuery / normalizeGymSearchValue.
  const t = token;
  const tc = token.replace(/\s+/g, '');
  if (!t) {
    return true;
  }
  // Single-letter tokens (e.g. "x" in "fitness x") are too broad as hard filters.
  if (t.length < 2) {
    return (
      foldedIncludes(entry.brandNorm, t) ||
      foldedIncludes(entry.brandCompact, tc) ||
      foldedIncludes(entry.nameNorm, t)
    );
  }

  if (
    foldedIncludes(entry.haystack, t) ||
    foldedIncludes(entry.haystackCompact, tc) ||
    foldedIncludes(entry.nameNorm, t) ||
    foldedIncludes(entry.nameCompact, tc) ||
    foldedIncludes(entry.brandNorm, t) ||
    foldedIncludes(entry.brandCompact, tc) ||
    foldedIncludes(entry.cityNorm, t) ||
    foldedIncludes(entry.streetNorm, t) ||
    foldedIncludes(entry.addressNorm, t) ||
    foldedIncludes(entry.postalNorm, t)
  ) {
    return true;
  }

  if (compactGluedMatch(entry, tc)) {
    return true;
  }

  const postalCompact = entry.postalNorm.replace(/\s+/g, '');
  if (
    tc.length >= 2 &&
    postalCompact &&
    (foldedEquals(postalCompact, tc) ||
      foldedStartsWith(postalCompact, tc) ||
      (tc.length >= 5 && foldedIncludes(postalCompact, tc)))
  ) {
    return true;
  }

  if (t.length >= 2 && entry.words.some(w => foldedStartsWith(w, t))) {
    return true;
  }

  if (t.length >= 4) {
    const tf = foldNordicSearchEquivalents(t);
    if (
      entry.words.some(w => {
        const wf = foldNordicSearchEquivalents(w);
        return (
          Math.abs(wf.length - tf.length) <= 1 &&
          wf.charAt(0) === tf.charAt(0) &&
          levenshtein(wf, tf) <= 1
        );
      })
    ) {
      return true;
    }
    const nameFold = foldNordicSearchEquivalents(entry.nameCompact);
    const tcFold = foldNordicSearchEquivalents(tc);
    if (
      tcFold.length >= 5 &&
      Math.abs(nameFold.length - tcFold.length) <= 2 &&
      nameFold.charAt(0) === tcFold.charAt(0) &&
      levenshtein(nameFold, tcFold) <= 2
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
  const queryFold = foldNordicSearchEquivalents(queryNorm);
  const queryCompactFold = foldNordicSearchEquivalents(queryCompact);

  if (queryNorm.length >= 2) {
    if (foldedEquals(entry.nameNorm, queryNorm)) {
      score += 220;
    } else if (foldedStartsWith(entry.nameNorm, queryNorm)) {
      score += 150;
    } else if (foldedStartsWith(entry.nameCompact, queryCompact)) {
      score += 130;
    } else if (foldedIncludes(entry.haystack, queryNorm)) {
      score += 90;
    } else if (foldedIncludes(entry.haystackCompact, queryCompact)) {
      score += 75;
    } else if (compactGluedMatch(entry, queryCompact)) {
      score += 95;
    }

    const postalCompact = entry.postalNorm.replace(/\s+/g, '');
    if (postalCompact && queryCompact.length >= 2) {
      if (foldedEquals(postalCompact, queryCompact)) {
        score += 110;
      } else if (foldedStartsWith(postalCompact, queryCompact)) {
        score += 70;
      }
    }
  }

  for (const token of tokens) {
    if (token.length < 2) {
      if (
        foldedIncludes(entry.brandNorm, token) ||
        foldedIncludes(entry.nameNorm, token)
      ) {
        score += 8;
      }
      continue;
    }
    if (foldedEquals(entry.nameNorm, token)) {
      score += 80;
    } else if (foldedStartsWith(entry.nameNorm, token)) {
      score += 65;
    } else if (
      foldedEquals(entry.brandNorm, token) ||
      foldedEquals(entry.brandCompact, token)
    ) {
      score += 60;
    } else if (foldedStartsWith(entry.brandNorm, token)) {
      score += 55;
    } else if (foldedIncludes(entry.nameNorm, token)) {
      score += 48;
    } else if (
      foldedIncludes(entry.cityNorm, token) ||
      foldedStartsWith(entry.cityNorm, token)
    ) {
      score += 42;
    } else if (foldedIncludes(entry.streetNorm, token)) {
      score += 38;
    } else if (foldedIncludes(entry.addressNorm, token)) {
      score += 30;
    } else if (
      foldedEquals(entry.postalNorm, token) ||
      foldedEquals(
        entry.postalNorm.replace(/\s+/g, ''),
        token.replace(/\s+/g, ''),
      )
    ) {
      score += 70;
    } else if (
      token.length >= 2 &&
      (foldedStartsWith(entry.postalNorm, token) ||
        foldedStartsWith(
          entry.postalNorm.replace(/\s+/g, ''),
          token.replace(/\s+/g, ''),
        ))
    ) {
      score += 50;
    } else if (foldedIncludes(entry.haystack, token)) {
      score += 22;
    } else if (entry.words.some(w => foldedStartsWith(w, token))) {
      score += 18;
    } else if (
      token.length >= 4 &&
      entry.words.some(w => {
        const wf = foldNordicSearchEquivalents(w);
        const tf = foldNordicSearchEquivalents(token);
        return (
          Math.abs(wf.length - tf.length) <= 1 &&
          wf.charAt(0) === tf.charAt(0) &&
          levenshtein(wf, tf) <= 1
        );
      })
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
    foldedIncludes(entry.streetNorm, queryFold.split(' ').slice(-1)[0] ?? '')
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

  const tokens = tokenizeGymQuery(trimmed);
  const significantTokens = tokens.filter(t => t.length >= 2);
  const queryNorm = normalizeGymSearchValue(trimmed);
  const queryCompact = compactGymSearchValue(trimmed);
  const queryCompactFold = compactGymSearchFolded(trimmed);

  const scored: GymSearchHit[] = [];

  for (const entry of index) {
    const matchTokens =
      significantTokens.length > 0 ? significantTokens : tokens;
    const matchedTokens = matchTokens.filter(t => tokenMatches(entry, t));
    const allTokensMatch =
      matchTokens.length === 0 || matchedTokens.length === matchTokens.length;
    const glued = compactGluedMatch(entry, queryCompact);

    const nameFold = foldNordicSearchEquivalents(entry.nameCompact);
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
      (foldedIncludes(entry.haystack, queryNorm) ||
        foldedIncludes(entry.haystackCompact, queryCompact) ||
        (plausibleTypo && levenshtein(nameSlice, queryCompactFold) <= 2));

    // Multi-token queries require every significant token (across name/city/address),
    // or a compact/glued/full-query hit — never brand-only partials.
    if (!allTokensMatch && !glued && !looseFullQuery) {
      continue;
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
