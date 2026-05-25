/**
 * Text normalization for gym search — case, punctuation, Danish chars, whitespace.
 */

const DANISH_MAP: Record<string, string> = {
  æ: 'ae',
  ø: 'oe',
  å: 'aa',
  Æ: 'ae',
  Ø: 'oe',
  Å: 'aa',
};

export function applyDanishAsciiVariants(value: string): string {
  return value.replace(/[æøåÆØÅ]/g, ch => DANISH_MAP[ch] ?? ch);
}

export function normalizeGymSearchValue(value: string): string {
  return applyDanishAsciiVariants(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\-.,/#()]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function compactGymSearchValue(value: string): string {
  return normalizeGymSearchValue(value).replace(/\s+/g, '');
}

export function tokenizeGymQuery(queryRaw: string): string[] {
  return normalizeGymSearchValue(queryRaw).split(' ').filter(Boolean);
}

/** Levenshtein distance (small strings only). */
export function levenshtein(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (a.length === 0) {
    return b.length;
  }
  if (b.length === 0) {
    return a.length;
  }
  const row = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return row[b.length];
}
