/**
 * Legacy gym search helpers — delegates to shared normalization.
 */
export {
  normalizeGymSearchValue,
  compactGymSearchValue,
  tokenizeGymQuery,
  foldNordicSearchEquivalents,
} from '@/services/gymSearch/gymSearchNormalize';

import {
  normalizeGymSearchValue,
  compactGymSearchValue,
  foldNordicSearchEquivalents,
} from '@/services/gymSearch/gymSearchNormalize';

export function gymSearchMatchesTokens(haystackRaw: string, queryRaw: string): boolean {
  const query = normalizeGymSearchValue(queryRaw);
  if (!query) {
    return true;
  }

  const haystack = foldNordicSearchEquivalents(normalizeGymSearchValue(haystackRaw));
  const haystackCompact = foldNordicSearchEquivalents(compactGymSearchValue(haystackRaw));
  const tokens = query.split(' ').filter(Boolean);

  return tokens.every(token => {
    if (token.length < 2) {
      return true;
    }
    const compactToken = foldNordicSearchEquivalents(token.replace(/\s+/g, ''));
    const foldedToken = foldNordicSearchEquivalents(token);
    return (
      haystack.includes(foldedToken) || haystackCompact.includes(compactToken)
    );
  });
}
