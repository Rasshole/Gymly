/**
 * App language → catalog country for suggestion lists when GPS is missing.
 * English and other languages that are not one country stay unmapped, so the
 * caller keeps the global sample.
 */
const LANGUAGE_BROWSE_COUNTRY: Record<string, string> = {
  da: 'Denmark',
  sv: 'Sweden',
  nb: 'Norway',
  de: 'Germany',
  fr: 'France',
  es: 'Spain',
  it: 'Italy',
  nl: 'Netherlands',
  pt: 'Portugal',
  pl: 'Poland',
  fi: 'Finland',
  tr: 'Turkey',
  uk: 'Ukraine',
  cs: 'Czechia',
  ro: 'Romania',
  hu: 'Hungary',
  el: 'Greece',
};

export function browseCountryForLanguage(language: string): string | null {
  return LANGUAGE_BROWSE_COUNTRY[language] ?? null;
}
