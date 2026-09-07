/**
 * Text normalization for gym search — case, punctuation, Nordic/German chars, whitespace.
 * Official stored names are unchanged; this only affects query/index matching.
 */

const DANISH_MAP: Record<string, string> = {
  æ: 'ae',
  ø: 'oe',
  å: 'aa',
  Æ: 'ae',
  Ø: 'oe',
  Å: 'aa',
};

const SWEDISH_MAP: Record<string, string> = {
  ä: 'a',
  ö: 'o',
  å: 'a',
  Ä: 'a',
  Ö: 'o',
  Å: 'a',
};

/** Strip umlauts to ASCII; ß → ss (NFD does not decompose ß). */
const GERMAN_MAP: Record<string, string> = {
  ä: 'a',
  ö: 'o',
  ü: 'u',
  ß: 'ss',
  Ä: 'a',
  Ö: 'o',
  Ü: 'u',
  ẞ: 'ss',
};

const FRENCH_MAP: Record<string, string> = {
  œ: 'oe',
  Œ: 'oe',
};

/**
 * Polish ł/Ł do not NFD-decompose (unlike ą ć ę ń ó ś ź ż).
 * Search-only folding — stored official spellings stay unchanged.
 */
const POLISH_MAP: Record<string, string> = {
  ł: 'l',
  Ł: 'l',
};

/**
 * Croatian đ/Đ do not NFD-decompose (čćšž do).
 * Search-only folding — stored official spellings stay unchanged.
 */
const CROATIAN_MAP: Record<string, string> = {
  đ: 'd',
  Đ: 'd',
};

/**
 * Modern Greek → Latin (search-only). Does not alter stored/display Greek names.
 * Digraphs applied before single letters. Prefer explicit city aliases for
 * Athens/Thessaloniki-style pairs where multiple Latin forms exist.
 */
const GREEK_DIGRAPHS: Array<[RegExp, string]> = [
  [/ου|ού|Ου|ΟΥ/g, 'ou'],
  [/αι|αί|Αι|ΑΙ/g, 'ai'],
  [/ει|εί|Ει|ΕΙ/g, 'ei'],
  [/οι|οί|Οι|ΟΙ/g, 'oi'],
  [/υι|υί|Υι|ΥΙ/g, 'yi'],
  [/αυ|αύ|Αυ|ΑΥ/g, 'av'],
  [/ευ|εύ|Ευ|ΕΥ/g, 'ev'],
  [/μπ|Μπ|ΜΠ/g, 'b'],
  [/ντ|Ντ|ΝΤ/g, 'd'],
  [/γκ|Γκ|ΓΚ/g, 'g'],
  [/τσ|Τσ|ΤΣ/g, 'ts'],
  [/τζ|Τζ|ΤΖ/g, 'tz'],
];

const GREEK_MAP: Record<string, string> = {
  α: 'a',
  ά: 'a',
  Α: 'a',
  Ά: 'a',
  β: 'v',
  Β: 'v',
  γ: 'g',
  Γ: 'g',
  δ: 'd',
  Δ: 'd',
  ε: 'e',
  έ: 'e',
  Ε: 'e',
  Έ: 'e',
  ζ: 'z',
  Ζ: 'z',
  η: 'i',
  ή: 'i',
  Η: 'i',
  Ή: 'i',
  θ: 'th',
  Θ: 'th',
  ι: 'i',
  ί: 'i',
  ϊ: 'i',
  ΐ: 'i',
  Ι: 'i',
  Ί: 'i',
  Ϊ: 'i',
  κ: 'k',
  Κ: 'k',
  λ: 'l',
  Λ: 'l',
  μ: 'm',
  Μ: 'm',
  ν: 'n',
  Ν: 'n',
  ξ: 'x',
  Ξ: 'x',
  ο: 'o',
  ό: 'o',
  Ο: 'o',
  Ό: 'o',
  π: 'p',
  Π: 'p',
  ρ: 'r',
  Ρ: 'r',
  σ: 's',
  ς: 's',
  Σ: 's',
  τ: 't',
  Τ: 't',
  υ: 'y',
  ύ: 'y',
  ϋ: 'y',
  ΰ: 'y',
  Υ: 'y',
  Ύ: 'y',
  Ϋ: 'y',
  φ: 'f',
  Φ: 'f',
  χ: 'ch',
  Χ: 'ch',
  ψ: 'ps',
  Ψ: 'ps',
  ω: 'o',
  ώ: 'o',
  Ω: 'o',
  Ώ: 'o',
};

function applyGreekLatinTransliteration(value: string): string {
  // Fast path: skip if no Greek characters
  if (!/[\u0370-\u03FF\u1F00-\u1FFF]/.test(value)) {
    return value;
  }
  let out = value;
  for (const [re, repl] of GREEK_DIGRAPHS) {
    out = out.replace(re, repl);
  }
  return out.replace(/[\u0370-\u03FF\u1F00-\u1FFF]/g, ch => GREEK_MAP[ch] ?? ch);
}

export function applyDanishAsciiVariants(value: string): string {
  return applyGreekLatinTransliteration(value).replace(
    /[æøåÆØÅäöÄÖüÜßẞœŒłŁđĐ]/g,
    ch =>
      DANISH_MAP[ch] ??
      SWEDISH_MAP[ch] ??
      GERMAN_MAP[ch] ??
      FRENCH_MAP[ch] ??
      POLISH_MAP[ch] ??
      CROATIAN_MAP[ch] ??
      ch,
  );
}

export function normalizeGymSearchValue(value: string): string {
  return applyDanishAsciiVariants(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00AD/g, '')
    // Apostrophes (Italian Sant'Agata, French L'*, etc.) — search-only; stored names unchanged
    .replace(/[_\-.,/#()'’`]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function compactGymSearchValue(value: string): string {
  return normalizeGymSearchValue(value).replace(/\s+/g, '');
}

/**
 * Collapse Nordic digraphs so user ASCII forms match indexed æ/ø/å expansions.
 * Example: noerrebro (ø→oe) and norrebro (typed) both fold to norrebro.
 * æ↔ae↔a, ø↔oe↔o, å↔aa↔a. Search-only — display names unchanged.
 */
export function foldNordicSearchEquivalents(value: string): string {
  return value
    .replace(/oe/g, 'o')
    .replace(/ae/g, 'a')
    .replace(/aa/g, 'a');
}

export function normalizeGymSearchFolded(value: string): string {
  return foldNordicSearchEquivalents(normalizeGymSearchValue(value));
}

export function compactGymSearchFolded(value: string): string {
  return foldNordicSearchEquivalents(compactGymSearchValue(value));
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
