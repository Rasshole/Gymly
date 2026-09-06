import type {DanishGym} from '@/data/danishGyms';
import {
  compactGymSearchValue,
  levenshtein,
  normalizeGymSearchValue,
  tokenizeGymQuery,
} from './gymSearchNormalize';
import {
  getGymSearchIndex,
  type GymSearchIndexEntry,
} from './gymSearchIndex';

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

  if (
    entry.haystack.includes(t) ||
    entry.haystackCompact.includes(tc) ||
    entry.nameNorm.includes(t) ||
    entry.nameCompact.includes(tc) ||
    entry.brandNorm.includes(t) ||
    entry.brandCompact.includes(tc) ||
    entry.cityNorm.includes(t) ||
    entry.streetNorm.includes(t) ||
    entry.addressNorm.includes(t) ||
    entry.postalNorm.includes(t)
  ) {
    return true;
  }

  const postalCompact = entry.postalNorm.replace(/\s+/g, '');
  if (
    tc.length >= 2 &&
    postalCompact &&
    (postalCompact === tc ||
      postalCompact.startsWith(tc) ||
      (tc.length >= 5 && postalCompact.includes(tc)))
  ) {
    return true;
  }

  if (t.length >= 2 && entry.words.some(w => w.startsWith(t))) {
    return true;
  }

  if (t.length >= 4) {
    if (
      entry.words.some(
        w =>
          Math.abs(w.length - t.length) <= 1 &&
          w.charAt(0) === t.charAt(0) &&
          levenshtein(w, t) <= 1,
      )
    ) {
      return true;
    }
    if (
      tc.length >= 5 &&
      Math.abs(entry.nameCompact.length - tc.length) <= 2 &&
      entry.nameCompact.charAt(0) === tc.charAt(0) &&
      levenshtein(entry.nameCompact, tc) <= 2
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

  if (queryNorm.length >= 2) {
    if (entry.nameNorm === queryNorm) {
      score += 220;
    } else if (entry.nameNorm.startsWith(queryNorm)) {
      score += 150;
    } else if (entry.nameCompact.startsWith(queryCompact)) {
      score += 130;
    } else if (entry.haystack.includes(queryNorm)) {
      score += 90;
    } else if (entry.haystackCompact.includes(queryCompact)) {
      score += 75;
    }

    const postalCompact = entry.postalNorm.replace(/\s+/g, '');
    if (postalCompact && queryCompact.length >= 2) {
      if (postalCompact === queryCompact) {
        score += 110;
      } else if (postalCompact.startsWith(queryCompact)) {
        score += 70;
      }
    }
  }

  for (const token of tokens) {
    if (entry.nameNorm === token) {
      score += 80;
    } else if (entry.nameNorm.startsWith(token)) {
      score += 65;
    } else if (entry.brandNorm === token || entry.brandCompact === token) {
      score += 60;
    } else if (entry.brandNorm.startsWith(token)) {
      score += 55;
    } else if (entry.nameNorm.includes(token)) {
      score += 48;
    } else if (entry.cityNorm.includes(token) || entry.cityNorm.startsWith(token)) {
      score += 42;
    } else if (entry.streetNorm.includes(token)) {
      score += 38;
    } else if (entry.addressNorm.includes(token)) {
      score += 30;
    } else if (
      entry.postalNorm === token ||
      entry.postalNorm.replace(/\s+/g, '') === token.replace(/\s+/g, '')
    ) {
      score += 70;
    } else if (
      token.length >= 2 &&
      (entry.postalNorm.startsWith(token) ||
        entry.postalNorm.replace(/\s+/g, '').startsWith(token.replace(/\s+/g, '')))
    ) {
      score += 50;
    } else if (entry.haystack.includes(token)) {
      score += 22;
    } else if (entry.words.some(w => w.startsWith(token))) {
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

  if (favoriteSet.has(entry.gym.id)) {
    score += 55;
  }

  if (distanceM != null && Number.isFinite(distanceM)) {
    const km = distanceM / 1000;
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
        return da - db;
      })
      .slice(0, limit);
  }

  const tokens = tokenizeGymQuery(trimmed);
  const queryNorm = normalizeGymSearchValue(trimmed);
  const queryCompact = compactGymSearchValue(trimmed);

  const scored: GymSearchHit[] = [];

  for (const entry of index) {
    const matchedTokens = tokens.filter(t => tokenMatches(entry, t));
    const allTokensMatch = tokens.length === 0 || matchedTokens.length === tokens.length;
    const partialMatch = matchedTokens.length > 0;

    if (!allTokensMatch && !partialMatch) {
      const nameSlice = entry.nameCompact.slice(
        0,
        Math.min(entry.nameCompact.length, queryCompact.length + 2),
      );
      const plausibleTypo =
        queryCompact.length >= 3 &&
        Math.abs(nameSlice.length - queryCompact.length) <= 2 &&
        nameSlice.charAt(0) === queryCompact.charAt(0);
      const loose =
        queryNorm.length >= 3 &&
        (entry.haystack.includes(queryNorm) ||
          entry.haystackCompact.includes(queryCompact) ||
          (plausibleTypo && levenshtein(nameSlice, queryCompact) <= 2));
      if (!loose) {
        continue;
      }
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

    if (!allTokensMatch && partialMatch) {
      score *= matchedTokens.length / tokens.length;
      score += matchedTokens.length * 5;
    }

    if (score >= minScore || partialMatch) {
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
    return da - db;
  });

  return scored.slice(0, limit);
}
