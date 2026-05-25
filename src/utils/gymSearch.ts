/**
 * Legacy gym search helpers — delegates to shared normalization.
 */
export {
  normalizeGymSearchValue,
  compactGymSearchValue,
  tokenizeGymQuery,
} from '@/services/gymSearch/gymSearchNormalize';

import {normalizeGymSearchValue, compactGymSearchValue} from '@/services/gymSearch/gymSearchNormalize';

export function gymSearchMatchesTokens(haystackRaw: string, queryRaw: string): boolean {
  const query = normalizeGymSearchValue(queryRaw);
  if (!query) {
    return true;
  }

  const haystack = normalizeGymSearchValue(haystackRaw);
  const haystackCompact = compactGymSearchValue(haystackRaw);
  const tokens = query.split(' ').filter(Boolean);

  return tokens.every(token => {
    const compactToken = token.replace(/\s+/g, '');
    return haystack.includes(token) || haystackCompact.includes(compactToken);
  });
}
