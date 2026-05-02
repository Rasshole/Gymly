export function normalizeGymSearchValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\-.,/]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function compactGymSearchValue(value: string): string {
  return normalizeGymSearchValue(value).replace(/\s+/g, '');
}

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
