/**
 * Stable gym / center ID conventions.
 *
 * Do not change existing IDs. New countries use ISO 3166-1 alpha-2 prefixes.
 * Denmark keeps legacy slug IDs (no required prefix).
 *
 * United Kingdom uses `gb_` (ISO code GB). Do not use `uk_`.
 */
export const GYM_ID_PREFIX = {
  sweden: 'se_',
  norway: 'no_',
  germany: 'de_',
  unitedKingdom: 'gb_',
  finland: 'fi_',
  netherlands: 'nl_',
  france: 'fr_',
  spain: 'es_',
  italy: 'it_',
  belgium: 'be_',
  poland: 'pl_',
  austria: 'at_',
  switzerland: 'ch_',
  portugal: 'pt_',
  ireland: 'ie_',
  czechia: 'cz_',
  hungary: 'hu_',
  greece: 'gr_',
  romania: 'ro_',
  slovakia: 'sk_',
  bulgaria: 'bg_',
  croatia: 'hr_',
  slovenia: 'si_',
  lithuania: 'lt_',
  latvia: 'lv_',
  estonia: 'ee_',
  luxembourg: 'lu_',
  malta: 'mt_',
  cyprus: 'cy_',
  iceland: 'is_',
  liechtenstein: 'li_',
  andorra: 'ad_',
  monaco: 'mc_',
  sanMarino: 'sm_',
  vaticanCity: 'va_',
  moldova: 'md_',
  montenegro: 'me_',
  northMacedonia: 'mk_',
  bosniaHerzegovina: 'ba_',
  albania: 'al_',
  kosovo: 'xk_',
  serbia: 'rs_',
  ukraine: 'ua_',
  belarus: 'by_',
  turkey: 'tr_',
  georgia: 'ge_',
  armenia: 'am_',
  azerbaijan: 'az_',
  russia: 'ru_',
} as const;

export type PrefixedGymCountry = keyof typeof GYM_ID_PREFIX;

export function gymIdPrefixForCountry(country: PrefixedGymCountry): string {
  return GYM_ID_PREFIX[country];
}

export function hasGymIdPrefix(id: string, prefix: string): boolean {
  return id.startsWith(prefix);
}
