export function isSwedenCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return c === 'sweden' || c === 'se' || c === 'sverige';
}

export function isDenmarkCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return c === 'denmark' || c === 'dk' || c === 'danmark';
}

export function isNorwayCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return c === 'norway' || c === 'no' || c === 'norge';
}

export function isGermanyCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return c === 'germany' || c === 'de' || c === 'deutschland' || c === 'tyskland';
}

export function isFinlandCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return c === 'finland' || c === 'fi' || c === 'suomi' || c === 'finlandia';
}

/** ISO 3166-1 alpha-2 is GB. Accept UK / Great Britain aliases for search and helpers. */
export function isUnitedKingdomCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'united kingdom' ||
    c === 'uk' ||
    c === 'gb' ||
    c === 'great britain' ||
    c === 'storbritannien' ||
    c === 'storbritannia' ||
    c === 'england' ||
    c === 'scotland' ||
    c === 'wales' ||
    c === 'northern ireland'
  );
}

export function isNetherlandsCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return c === 'netherlands' || c === 'nl' || c === 'nederland' || c === 'holland';
}

export function isFranceCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return c === 'france' || c === 'fr' || c === 'frankrig' || c === 'frankrike';
}

export function isSpainCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return c === 'spain' || c === 'es' || c === 'españa' || c === 'spanien' || c === 'spania';
}

export function isItalyCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return c === 'italy' || c === 'it' || c === 'italia' || c === 'italien';
}

export function isBelgiumCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'belgium' ||
    c === 'be' ||
    c === 'belgie' ||
    c === 'belgië' ||
    c === 'belgique' ||
    c === 'belgien' ||
    c === 'belgia'
  );
}

export function isPolandCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return c === 'poland' || c === 'pl' || c === 'polska' || c === 'polen';
}

export function isAustriaCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'austria' ||
    c === 'at' ||
    c === 'österreich' ||
    c === 'oesterreich' ||
    c === 'osterreich'
  );
}

export function isSwitzerlandCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'switzerland' ||
    c === 'ch' ||
    c === 'schweiz' ||
    c === 'suisse' ||
    c === 'svizzera' ||
    c === 'die schweiz' ||
    c === 'la suisse'
  );
}

/** Liechtenstein is a separate country — never bucket as Switzerland. */
export function isLiechtensteinCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'liechtenstein' ||
    c === 'li' ||
    c === 'fürstentum liechtenstein' ||
    c === 'fuerstentum liechtenstein' ||
    c === 'principality of liechtenstein'
  );
}

/** Andorra is a separate country — never bucket as Spain or France. */
export function isAndorraCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'andorra' ||
    c === 'ad' ||
    c === 'principat d’andorra' ||
    c === "principat d'andorra" ||
    c === 'principality of andorra' ||
    c === 'andorre'
  );
}

/** Monaco is a separate country — never bucket as France. */
export function isMonacoCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'monaco' ||
    c === 'mc' ||
    c === 'principauté de monaco' ||
    c === 'principauté de monaco' ||
    c === 'principality of monaco' ||
    c === 'monte-carlo' ||
    c === 'monte carlo'
  );
}

/** San Marino is a separate country — never bucket as Italy. */
export function isSanMarinoCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'san marino' ||
    c === 'sm' ||
    c === 'rsm' ||
    c === 'repubblica di san marino' ||
    c === 'republic of san marino' ||
    c === 'serenissima' ||
    c === 'città di san marino' ||
    c === 'citta di san marino'
  );
}

/**
 * Vatican City State — never bucket as Italy / Holy See extraterritorial properties.
 * Aliases cover English, Italian, and Scandinavian label forms.
 */
export function isVaticanCityCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'vatican city' ||
    c === 'vatican' ||
    c === 'va' ||
    c === 'vat' ||
    c === 'vatican city state' ||
    c === 'state of vatican city' ||
    c === 'città del vaticano' ||
    c === 'citta del vaticano' ||
    c === 'stato della città del vaticano' ||
    c === 'stato della citta del vaticano' ||
    c === 'vatikanstaten'
  );
}

/** Republic of Moldova — never bucket as Romania or Ukraine. */
export function isMoldovaCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'moldova' ||
    c === 'md' ||
    c === 'republic of moldova' ||
    c === 'republica moldova' ||
    c === 'moldavien' ||
    c === 'moldawien' ||
    c === 'молдова' ||
    c === 'республика молдова'
  );
}

/** Montenegro / Crna Gora — never bucket as Serbia, Bosnia, Croatia, Albania, or Kosovo. */
export function isMontenegroCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'montenegro' ||
    c === 'me' ||
    c === 'crna gora' ||
    c === 'crnagora' ||
    c === 'republic of montenegro' ||
    c === 'republika crna gora' ||
    c === 'черногория' ||
    c === 'црна гора'
  );
}

/**
 * North Macedonia / Северна Македонија.
 * Accepts historical "Macedonia" / FYROM labels for catalog country strings.
 * Never treat Greek Macedonia / Greek regional labels as North Macedonia.
 */
export function isNorthMacedoniaCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  if (
    c.includes('greek macedonia') ||
    c.includes('macedonia greece') ||
    c.includes('μακεδονία ελλάδα') ||
    c === 'greece' ||
    c === 'gr' ||
    c === 'hellas'
  ) {
    return false;
  }
  return (
    c === 'north macedonia' ||
    c === 'republic of north macedonia' ||
    c === 'mk' ||
    c === 'mkd' ||
    c === 'северна македонија' ||
    c === 'severna makedonija' ||
    c === 'nordmakedonien' ||
    c === 'macedonia' ||
    c === 'makedonija' ||
    c === 'македонија' ||
    c === 'fyrom' ||
    c === 'former yugoslav republic of macedonia' ||
    c === 'the former yugoslav republic of macedonia' ||
    c === 'macedonia (fyrom)'
  );
}

export function isPortugalCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return c === 'portugal' || c === 'pt' || c === 'república portuguesa' || c === 'republica portuguesa';
}

/**
 * Plausible Portugal geography including mainland, Madeira, and Azores.
 * Not a legal cadastral boundary — Phase 1 / QA geovalidation aid only.
 * Never treat Spain / Morocco / Cape Verde as Portugal.
 */
export function isPlausiblePortugalCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  // Mainland Portugal
  if (lat >= 36.9 && lat <= 42.2 && lng >= -9.6 && lng <= -6.15) {
    return true;
  }
  // Madeira (autonomous region)
  if (lat >= 32.35 && lat <= 33.2 && lng >= -17.35 && lng <= -16.2) {
    return true;
  }
  // Azores / Açores (autonomous region)
  if (lat >= 36.85 && lat <= 39.8 && lng >= -31.35 && lng <= -24.9) {
    return true;
  }
  return false;
}

/** Portuguese postcode NNNN-NNN as string (search may compact to NNNNNNN). */
export const PORTUGAL_POSTAL_RE = /^\d{4}-\d{3}$/;

export function isIrelandCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  // Northern Ireland is United Kingdom — never bucket as Ireland.
  if (c === 'northern ireland' || c === 'ni') {
    return false;
  }
  return (
    c === 'ireland' ||
    c === 'ie' ||
    c === 'éire' ||
    c === 'eire' ||
    c === 'republic of ireland' ||
    c === 'roi'
  );
}

/**
 * Republic of Ireland geography (island of Ireland minus Northern Ireland).
 * QA aid only — not a legal cadastral boundary.
 */
export function isPlausibleIrelandCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  // Broad Republic box including western islands
  if (lat < 51.35 || lat > 55.45 || lng < -10.7 || lng > -5.9) {
    return false;
  }
  // Northern Ireland exclusion (east of Donegal / west of Irish Sea)
  if (lat >= 54.02 && lat <= 55.32 && lng >= -7.05 && lng <= -5.4) {
    return false;
  }
  // Derry / NW NI pocket
  if (lat >= 54.85 && lat <= 55.25 && lng >= -7.45 && lng <= -6.8) {
    return false;
  }
  return true;
}

/**
 * Eircode: Routing Key (A65 / D6W) + Unique Identifier (4 chars).
 * Stored preferably with space ("D02 X285"); search may compact to 7 chars.
 * Character set excludes O/I etc. per Eircode design.
 */
export const IRELAND_EIRCODE_RE =
  /^(?:[AC-FHKNPRTV-Y]\d{2}|D6W)\s?[0-9AC-FHKNPRTV-Y]{4}$/i;

export function isCzechiaCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'czechia' ||
    c === 'cz' ||
    c === 'czech republic' ||
    c === 'česko' ||
    c === 'cesko' ||
    c === 'česká republika' ||
    c === 'ceska republika'
  );
}

/** Czechia mainland bbox — rejects DE/PL/AT/SK cores. */
export function isPlausibleCzechiaCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  return lat >= 48.55 && lat <= 51.06 && lng >= 12.09 && lng <= 18.86;
}

/** Czech PSČ NNN NN (first digit historically 1–7 for Czech lands). */
export const CZECHIA_POSTAL_RE = /^[1-7]\d{2} \d{2}$/;

export function isHungaryCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return c === 'hungary' || c === 'hu' || c === 'magyarország' || c === 'magyarorszag';
}

/** Hungary mainland bbox — rejects AT/SK/RO/RS/HR/SI/UA cores. */
export function isPlausibleHungaryCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  // Rough mainland box (westernmost ~Sopron corridor starts ~16.45)
  if (lat < 45.74 || lat > 48.58 || lng < 16.45 || lng > 22.9) {
    return false;
  }
  // NW exclusion: Vienna / Bratislava corridor north of the Danube bend
  if (lat >= 48.02 && lng <= 17.35) {
    return false;
  }
  return true;
}

/** Hungarian postcode NNNN as string. */
export const HUNGARY_POSTAL_RE = /^\d{4}$/;

export function isGreeceCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'greece' ||
    c === 'gr' ||
    c === 'hellas' ||
    c === 'ελλάδα' ||
    c === 'ελλαδα' ||
    c === 'hellenic republic'
  );
}

/**
 * Greece mainland + major islands (Crete, Rhodes, Corfu, Kos, Lesbos, Cyclades, etc.).
 * Rejects obvious Albania / N. Macedonia / Bulgaria / Turkey cores.
 */
export function isPlausibleGreeceCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  // Corfu / Kerkyra first (west of mainland Albania exclusion)
  if (lat >= 39.35 && lat <= 39.85 && lng >= 19.55 && lng <= 20.2) {
    return true;
  }
  // Mainland Greece + near-shore islands (Ionian / Aegean / Cyclades)
  if (lat >= 36.0 && lat <= 41.75 && lng >= 19.3 && lng <= 26.8) {
    // Albania / North Macedonia western exclusion (Tirana corridor)
    if (lng < 20.7 && lat > 39.9) {
      return false;
    }
    return true;
  }
  // Crete
  if (lat >= 34.8 && lat <= 35.75 && lng >= 23.4 && lng <= 26.4) {
    return true;
  }
  // Rhodes + nearby Dodecanese (incl. Kos)
  if (lat >= 35.85 && lat <= 37.0 && lng >= 26.85 && lng <= 28.3) {
    return true;
  }
  // Lesbos / Chios NE Aegean
  if (lat >= 38.1 && lat <= 39.45 && lng >= 25.8 && lng <= 26.7) {
    return true;
  }
  return false;
}

/** Greek postcode NNN NN as string (search may compact to NNNNN). */
export const GREECE_POSTAL_RE = /^\d{3} \d{2}$/;

export function isRomaniaCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'romania' ||
    c === 'ro' ||
    c === 'românia' ||
    c === 'româniei' ||
    c === 'romaniei'
  );
}

/** Romania mainland bbox — rejects HU/BG/MD/UA/RS cores. */
export function isPlausibleRomaniaCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  if (lat < 43.6 || lat > 48.3 || lng < 20.2 || lng > 29.75) {
    return false;
  }
  // NW: Hungary / Ukraine
  if (lat >= 47.85 && lng <= 22.55) {
    return false;
  }
  if (lat >= 48.0 && lng <= 23.0) {
    return false;
  }
  // NE: Moldova / Ukraine
  if (lat >= 46.5 && lng >= 28.55) {
    return false;
  }
  if (lat >= 45.5 && lng >= 29.0) {
    return false;
  }
  // South: Bulgaria / Black Sea
  if (lat <= 44.0 && lng >= 28.0) {
    return false;
  }
  // West: Serbia (Belgrade / Novi Sad corridor)
  if (lat >= 44.5 && lat <= 46.2 && lng <= 21.05) {
    return false;
  }
  return true;
}

/** Romanian postcode NNNNNN as string — leading zeros preserved. */
export const ROMANIA_POSTAL_RE = /^\d{6}$/;

export function isSlovakiaCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'slovakia' ||
    c === 'sk' ||
    c === 'slovensko' ||
    c === 'slovak republic' ||
    c === 'slovenská republika' ||
    c === 'slovenska republika'
  );
}

/**
 * Slovakia mainland bbox — rejects CZ / AT / HU / PL / UA cores.
 * Not a legal cadastral boundary — Phase 1 / QA geovalidation aid only.
 */
export function isPlausibleSlovakiaCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  // Rough mainland box (Bratislava west ~16.8; east near UA ~22.6; south ~47.7; north ~49.65)
  if (lat < 47.7 || lat > 49.65 || lng < 16.8 || lng > 22.6) {
    return false;
  }
  // NW: Czechia (Brno / Ostrava corridor)
  if (lat >= 49.35 && lng <= 18.2) {
    return false;
  }
  // West: Austria (Vienna core)
  if (lng <= 16.95 && lat <= 48.35) {
    return false;
  }
  // South: Hungary (Győr / Budapest corridor)
  if (lat <= 47.85 && lng >= 17.3 && lng <= 19.5) {
    return false;
  }
  // North: Poland (Kraków / Nowy Sącz corridor)
  if (lat >= 49.5 && lng >= 19.0 && lng <= 21.2) {
    return false;
  }
  // East: Ukraine (Uzhhorod corridor)
  if (lng >= 22.25 && lat >= 48.4) {
    return false;
  }
  return true;
}

/**
 * Slovak PSČ NNN NN.
 * First digit is typically 0 / 8 / 9 — deliberately disjoint from Czechia 1–7
 * so CZ/SK postcode collisions cannot share a country-agnostic match.
 * Reject 000 xx (HTML/CSS noise, not a real district).
 */
export const SLOVAKIA_POSTAL_RE = /^(?:[89]\d{2}|0[1-9]\d) \d{2}$/;

export function isBulgariaCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'bulgaria' ||
    c === 'bg' ||
    c === 'българия' ||
    c === 'bulgariya' ||
    c === 'republic of bulgaria'
  );
}

/**
 * Bulgaria mainland bbox — rejects Romania / Serbia / N. Macedonia / Greece / Turkey cores.
 * Black Sea west coast (Varna / Burgas) is included. Not a legal cadastral boundary.
 */
export function isPlausibleBulgariaCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  // Rough mainland box (~lat 41.2–44.25, lng 22.3–28.7)
  if (lat < 41.2 || lat > 44.25 || lng < 22.3 || lng > 28.7) {
    return false;
  }
  // North: Bucharest corridor (Romania)
  if (lat >= 44.0 && lng >= 25.0 && lng <= 27.5) {
    return false;
  }
  // SE: Istanbul / Turkish Thrace
  if (lat <= 41.5 && lng >= 27.8) {
    return false;
  }
  // SW: Thessaloniki / Greek Macedonia
  if (lat <= 41.55 && lng <= 23.6) {
    return false;
  }
  // NW: Belgrade / Serbia corridor
  if (lat >= 43.5 && lng <= 22.55) {
    return false;
  }
  return true;
}

/** Bulgarian postcode NNNN as string. */
export const BULGARIA_POSTAL_RE = /^\d{4}$/;

export function isCroatiaCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'croatia' ||
    c === 'hr' ||
    c === 'hrvatska' ||
    c === 'republic of croatia' ||
    c === 'republika hrvatska'
  );
}

/**
 * Croatia mainland + coast/islands bbox — rejects SI / HU / RS / BA / ME cores.
 * Adriatic coast and major islands included. Not a legal cadastral boundary.
 */
export function isPlausibleCroatiaCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  // Rough box (Istria west ~13.5; east near RS ~19.5; south Dubrovnik ~42.3; north ~46.55)
  if (lat < 42.3 || lat > 46.55 || lng < 13.4 || lng > 19.5) {
    return false;
  }
  // NW: Slovenia (Ljubljana corridor)
  if (lat >= 45.75 && lng <= 14.6) {
    return false;
  }
  // North: Hungary (Pécs / Nagykanizsa corridor)
  if (lat >= 46.35 && lng >= 16.5 && lng <= 17.8) {
    return false;
  }
  // East: Serbia (Novi Sad / Belgrade corridor)
  if (lat >= 45.0 && lat <= 46.2 && lng >= 19.15) {
    return false;
  }
  // SE inland: Bosnia core (Sarajevo corridor) — keep narrow coastal strip
  if (lat >= 43.7 && lat <= 45.0 && lng >= 17.9 && lng <= 18.6) {
    return false;
  }
  // South: Montenegro (Podgorica / Budva)
  if (lat <= 42.55 && lng >= 18.7) {
    return false;
  }
  return true;
}

/** Croatian postcode NNNNN as string. */
export const CROATIA_POSTAL_RE = /^\d{5}$/;

export function isSloveniaCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'slovenia' ||
    c === 'si' ||
    c === 'slovenija' ||
    c === 'republic of slovenia' ||
    c === 'republika slovenija'
  );
}

/**
 * Slovenia mainland bbox — rejects IT / AT / HU / HR cores.
 * Not a legal cadastral boundary.
 */
export function isPlausibleSloveniaCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  if (lat < 45.42 || lat > 46.88 || lng < 13.38 || lng > 16.61) {
    return false;
  }
  // West: Italian Trieste urban core only
  if (lat >= 45.62 && lat <= 45.72 && lng >= 13.76 && lng <= 13.85) {
    return false;
  }
  // NW: Austria (Villach / Klagenfurt corridor)
  if (lat >= 46.55 && lng <= 14.35) {
    return false;
  }
  // North: Austria (Graz direction north of Maribor)
  if (lat >= 46.72 && lng >= 15.55) {
    return false;
  }
  // East: Hungary (Lendava / Murska Sobota east)
  if (lng >= 16.62 && lat >= 46.45) {
    return false;
  }
  // SE: Croatia (Zagreb corridor east of SI)
  if (lat <= 45.95 && lng >= 15.85) {
    return false;
  }
  // SE inland: Croatia
  if (lat <= 45.5 && lng >= 14.8) {
    return false;
  }
  return true;
}

/** Slovenian postcode NNNN as string. */
export const SLOVENIA_POSTAL_RE = /^\d{4}$/;

export function isLithuaniaCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'lithuania' ||
    c === 'lt' ||
    c === 'lietuva' ||
    c === 'republic of lithuania' ||
    c === 'lietuvos respublika'
  );
}

/**
 * Lithuania mainland + Curonian Spit — rejects LV / BY / PL / Kaliningrad cores.
 * Not a legal cadastral boundary.
 */
export function isPlausibleLithuaniaCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  if (lat < 53.88 || lat > 56.45 || lng < 20.9 || lng > 26.88) {
    return false;
  }
  // North: Latvia (Riga / Jelgava corridor)
  if (lat >= 56.35 && lng >= 23.5 && lng <= 25.5) {
    return false;
  }
  // NE: Latvia (Daugavpils corridor)
  if (lat >= 55.95 && lng >= 26.2) {
    return false;
  }
  // West: Kaliningrad (Russia) urban / inland west of Curonian Spit
  if (lng <= 21.0 && lat >= 54.55 && lat <= 55.05) {
    return false;
  }
  // South: Belarus (Grodno corridor)
  if (lat <= 54.0 && lng >= 23.5 && lng <= 25.0) {
    return false;
  }
  // SW: Poland (Suwałki corridor south of Marijampolė / Kalvarija)
  if (lat <= 54.15 && lng >= 22.5 && lng <= 23.4) {
    return false;
  }
  return true;
}

/** Lithuanian postcode NNNNN as string (optional LT- prefix stripped upstream). */
export const LITHUANIA_POSTAL_RE = /^\d{5}$/;

export function isLatviaCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'latvia' ||
    c === 'lv' ||
    c === 'latvija' ||
    c === 'republic of latvia' ||
    c === 'latvijas republika'
  );
}

/**
 * Latvia mainland — rejects LT / EE / RU (Pskov) / BY cores.
 * Not a legal cadastral boundary.
 */
export function isPlausibleLatviaCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  if (lat < 55.55 || lat > 58.15 || lng < 20.9 || lng > 28.35) {
    return false;
  }
  // South: Lithuania (Vilnius / Kaunas / Šiauliai corridor)
  if (lat <= 56.05 && lng >= 23.0 && lng <= 26.0) {
    return false;
  }
  // SW: Lithuania (Klaipėda / Mažeikiai west coast corridor)
  if (lat <= 56.25 && lng <= 22.2) {
    return false;
  }
  // North: Estonia (Tallinn / Pärnu corridor)
  if (lat >= 57.75 && lng >= 23.5 && lng <= 26.5) {
    return false;
  }
  // NE: Estonia / Russia (Narva / Pskov approach)
  if (lat >= 57.7 && lng >= 27.2) {
    return false;
  }
  // SE: Belarus (Vitebsk corridor south of Daugavpils)
  if (lat <= 55.75 && lng >= 26.5) {
    return false;
  }
  return true;
}

/** Latvian postcode NNNN as string (optional LV- prefix stripped upstream). */
export const LATVIA_POSTAL_RE = /^\d{4}$/;

export function isEstoniaCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'estonia' ||
    c === 'ee' ||
    c === 'eesti' ||
    c === 'republic of estonia' ||
    c === 'eesti vabariik'
  );
}

/**
 * Estonia mainland + major islands — rejects LV / RU / FI cores.
 * Not a legal cadastral boundary.
 */
export function isPlausibleEstoniaCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  if (lat < 57.5 || lat > 59.75 || lng < 21.7 || lng > 28.3) {
    return false;
  }
  // South: Latvia (Rīga / Valmiera corridor)
  if (lat <= 57.8 && lng >= 24.0 && lng <= 26.5) {
    return false;
  }
  // SE: Latvia / Russia approach
  if (lat <= 57.7 && lng >= 26.8) {
    return false;
  }
  // East: Russia inland
  if (lng >= 28.0 && lat <= 59.0) {
    return false;
  }
  // North: Finland (Helsinki side)
  if (lat >= 59.7 && lng <= 25.5) {
    return false;
  }
  return true;
}

/** Estonian postcode NNNNN as string. */
export const ESTONIA_POSTAL_RE = /^\d{5}$/;

export function isLuxembourgCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'luxembourg' ||
    c === 'lu' ||
    c === 'luxemburg' ||
    c === 'grand duchy of luxembourg' ||
    c === 'grand-duché de luxembourg' ||
    c === 'grand-duche de luxembourg'
  );
}

/**
 * Luxembourg mainland — rejects BE / FR / DE border cores.
 * Not a legal cadastral boundary; aggressive inward bias for merge safety.
 */
export function isPlausibleLuxembourgCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  // Luxembourg bbox roughly 49.44–50.19 N, 5.73–6.53 E
  if (lat < 49.44 || lat > 50.19 || lng < 5.73 || lng > 6.53) {
    return false;
  }
  // West: Belgium (Arlon / Athus corridor)
  if (lng <= 5.82 && lat <= 49.7) {
    return false;
  }
  // South: France (Thionville / Longwy approach)
  if (lat <= 49.46 && lng >= 5.9 && lng <= 6.2) {
    return false;
  }
  // East: Germany (Trier / Perl corridor)
  if (lng >= 6.48 && lat >= 49.7) {
    return false;
  }
  return true;
}

/** Luxembourg postcode NNNN as string (optional L- prefix stripped upstream). */
export const LUXEMBOURG_POSTAL_RE = /^\d{4}$/;

export function isMaltaCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'malta' ||
    c === 'mt' ||
    c === 'republic of malta' ||
    c === 'maltese islands'
  );
}

/**
 * Malta + Gozo + Comino — rejects Sicily / other Mediterranean cores.
 * Not a legal cadastral boundary; aggressive inward bias for merge safety.
 */
export function isPlausibleMaltaCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  if (lat < 35.78 || lat > 36.1 || lng < 14.18 || lng > 14.58) {
    return false;
  }
  // North-east: Sicily approaches
  if (lat >= 36.095 && lng >= 14.4) {
    return false;
  }
  return true;
}

/** Malta postcode AAA NNNN (3 letters + 4 digits). */
export const MALTA_POSTAL_RE = /^[A-Z]{3} \d{4}$/;

export function isUkraineCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'ukraine' ||
    c === 'ua' ||
    c === 'ukr' ||
    c === 'україна' ||
    c === 'украина' ||
    c === 'republic of ukraine'
  );
}

/**
 * Ukraine mainland footprint — rejects PL / BY / RO / MD / HU / SK / RU cores.
 * Not a legal cadastral boundary; aggressive inward bias for merge safety.
 */
export function isPlausibleUkraineCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  if (lat < 44.18 || lat > 52.38 || lng < 22.1 || lng > 40.23) {
    return false;
  }
  if (lng <= 23.5 && lat >= 49.5) {
    return false;
  }
  if (lng <= 23.0 && 49.0 <= lat && lat <= 50.5) {
    return false;
  }
  if (lng <= 22.6 && lat <= 49.0) {
    return false;
  }
  if (lat <= 45.55 && lng >= 28.05) {
    return false;
  }
  if (lat <= 46.0 && lng >= 29.5) {
    return false;
  }
  if (lat <= 45.3 && lng >= 29.0) {
    return false;
  }
  if (lng >= 40.0 && lat <= 49.0) {
    return false;
  }
  if (lng >= 39.8 && lat >= 50.0) {
    return false;
  }
  if (lat >= 51.5 && lng <= 30.5) {
    return false;
  }
  if (lat >= 52.0) {
    return false;
  }
  if (lng <= 22.15 && 48.0 <= lat && lat <= 48.7) {
    return false;
  }
  return true;
}

/** Ukrainian postcode NNNNN (5 digits). */
export const UKRAINE_POSTAL_RE = /^\d{5}$/;

export function isBelarusCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'belarus' ||
    c === 'by' ||
    c === 'blr' ||
    c === 'беларусь' ||
    c === 'беларусь' ||
    c === 'republic of belarus'
  );
}

/**
 * Belarus footprint — rejects PL / LT / LV / UA / RU cores.
 * Not a legal cadastral boundary; aggressive inward bias for merge safety.
 */
export function isPlausibleBelarusCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  if (lat < 51.15 || lat > 56.2 || lng < 23.0 || lng > 32.85) {
    return false;
  }
  if (lng <= 23.6 && lat <= 52.0) {
    return false;
  }
  if (lat >= 54.5 && lng <= 25.0) {
    return false;
  }
  if (lat <= 52.0 && lng >= 31.0) {
    return false;
  }
  if (lng >= 32.5) {
    return false;
  }
  return true;
}

/** Belarus postcode NNNNNN (6 digits). */
export const BELARUS_POSTAL_RE = /^\d{6}$/;

export function isTurkeyCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'turkey' ||
    c === 'tr' ||
    c === 'tur' ||
    c === 'türkiye' ||
    c === 'turkiye' ||
    c === 'türkei' ||
    c === 'turkei' ||
    c === 'republic of turkey' ||
    c === 'türkiye cumhuriyeti' ||
    c === 'turkiye cumhuriyeti'
  );
}

/**
 * Turkey / Türkiye mainland footprint — rejects GR / BG / GE / AM / AZ / IR / IQ / SY cores
 * and Northern Cyprus. Not a legal cadastral boundary; aggressive inward bias for merge safety.
 */
export function isPlausibleTurkeyCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  if (lat < 35.95 || lat > 42.12 || lng < 25.98 || lng > 44.82) {
    return false;
  }
  // Cyprus island (Republic + Northern Cyprus)
  if (lat <= 35.75 && lng >= 32.2 && lng <= 34.7) {
    return false;
  }
  // Northern Cyprus: Kyrenia / Morphou / north Nicosia (lat band only)
  if (lat >= 35.19 && lat <= 35.75 && lng <= 33.55) {
    return false;
  }
  // Gazimağusa / Famagusta north coast
  if (lat >= 35.08 && lng >= 33.85 && lng <= 34.15) {
    return false;
  }
  // West: Greece (Thrace / Evros west of Meriç)
  if (lng <= 26.02) {
    return false;
  }
  if (lat <= 40.25 && lng <= 26.35) {
    return false;
  }
  // Northwest: Bulgaria (Sofia / Ruse corridor)
  if (lat >= 42.02 && lng <= 27.45) {
    return false;
  }
  if (lat >= 41.95 && lng <= 26.9) {
    return false;
  }
  // Northeast: Georgia (Batumi / Tbilisi approach)
  if (lng >= 41.85 && lat >= 41.35) {
    return false;
  }
  if (lng >= 42.15 && lat >= 40.75) {
    return false;
  }
  // East: Armenia (Yerevan / Gyumri corridor)
  if (lng >= 43.85 && lat >= 40.1 && lat <= 41.05) {
    return false;
  }
  if (lng >= 44.15 && lat >= 39.55 && lat <= 40.45) {
    return false;
  }
  // East: Azerbaijan (Nakhchivan + northeast border)
  if (lng >= 44.85 && lat <= 39.55) {
    return false;
  }
  if (lng >= 44.95 && lat >= 41.0) {
    return false;
  }
  // Southeast: Iran (Tabriz / Urmia corridor)
  if (lng >= 44.55 && lat <= 38.15) {
    return false;
  }
  if (lng >= 43.5 && lat <= 36.85) {
    return false;
  }
  // Southeast: Iraq (Zakho / Mosul approach)
  if (lng >= 43.15 && lat <= 36.95) {
    return false;
  }
  if (lng >= 42.55 && lat <= 36.75) {
    return false;
  }
  // South: Syria (Aleppo / Idlib corridor)
  if (lat <= 36.18 && lng >= 36.85) {
    return false;
  }
  if (lat <= 36.05 && lng >= 35.8) {
    return false;
  }
  if (lat <= 36.25 && lng >= 38.0) {
    return false;
  }
  return true;
}

/** Turkish postcode NNNNN (5 digits). */
export const TURKEY_POSTAL_RE = /^\d{5}$/;

export function isGeorgiaCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'georgia' ||
    c === 'ge' ||
    c === 'geo' ||
    c === 'sakartvelo' ||
    c === 'საქართველო' ||
    c === 'republic of georgia'
  );
}

/**
 * Georgia mainland footprint — rejects RU/TR/AM/AZ cores.
 * Abkhazia / South Ossetia remain inside bbox; conflict handling is operational.
 */
export function isPlausibleGeorgiaCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  if (lat < 41.05 || lat > 43.65 || lng < 39.95 || lng > 46.75) {
    return false;
  }
  if (lat <= 41.18 && lng <= 42.85) {
    return false;
  }
  if (lat <= 41.28 && lng <= 41.55) {
    return false;
  }
  if (lat <= 41.18 && lng >= 43.85) {
    return false;
  }
  if (lat <= 41.35 && lng >= 45.05) {
    return false;
  }
  if (lng >= 46.45 && lat >= 41.45) {
    return false;
  }
  if (lng >= 46.15 && lat <= 41.25) {
    return false;
  }
  if (lat >= 43.45 && lng <= 40.25) {
    return false;
  }
  if (lat >= 43.25 && lng <= 40.55) {
    return false;
  }
  if (lat >= 42.95 && lng <= 40.05) {
    return false;
  }
  return true;
}

/** Georgian postcode NNNN (4 digits). */
export const GEORGIA_POSTAL_RE = /^\d{4}$/;

export function isArmeniaCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'armenia' ||
    c === 'am' ||
    c === 'arm' ||
    c === 'hayastan' ||
    c === 'հայաստան' ||
    c === 'republic of armenia'
  );
}

/**
 * Armenia mainland footprint — rejects GE/TR/AZ/IR cores.
 * Artsakh / Nagorno-Karabakh remains inside eastern bbox; conflict handling is operational.
 */
export function isPlausibleArmeniaCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  if (lat < 38.84 || lat > 41.32 || lng < 43.42 || lng > 46.58) {
    return false;
  }
  if (lat >= 41.15 && lng <= 44.35) {
    return false;
  }
  if (lat >= 41.05 && lng <= 43.75) {
    return false;
  }
  if (lng <= 43.52 && lat <= 40.85) {
    return false;
  }
  if (lng <= 43.68 && lat <= 40.35) {
    return false;
  }
  if (lng >= 46.35 && lat >= 39.45) {
    return false;
  }
  if (lng >= 46.55) {
    return false;
  }
  if (lat <= 38.92 && lng >= 44.85) {
    return false;
  }
  if (lat <= 39.05 && lng >= 45.5) {
    return false;
  }
  return true;
}

/** Armenian postcode NNNN (4 digits). */
export const ARMENIA_POSTAL_RE = /^\d{4}$/;

export function isAzerbaijanCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'azerbaijan' ||
    c === 'az' ||
    c === 'aze' ||
    c === 'azərbaycan' ||
    c === 'azerbaycan' ||
    c === 'republic of azerbaijan'
  );
}

/**
 * Azerbaijan footprint — mainland + Nakhchivan exclave; rejects GE/AM/IR/TR/RU cores.
 * Karabakh conflict areas remain inside bbox; conflict handling is operational.
 */
export function isPlausibleAzerbaijanCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  if (38.78 <= lat && lat <= 39.62 && 44.72 <= lng && lng <= 46.25) {
    if (lng <= 44.78 && lat <= 39.35) {
      return false;
    }
    if (lng >= 46.05 && lat >= 39.15) {
      return false;
    }
    if (lat <= 38.85 && lng >= 45.0) {
      return false;
    }
    return true;
  }
  if (lat < 38.39 || lat > 41.92 || lng < 44.77 || lng > 50.65) {
    return false;
  }
  if (lng <= 45.0 && lat >= 41.5) {
    return false;
  }
  if (lng <= 44.85 && lat >= 41.0) {
    return false;
  }
  if (lng <= 45.5 && lat >= 41.75) {
    return false;
  }
  if (lng <= 45.05 && lat >= 40.5 && lat <= 41.2) {
    return false;
  }
  if (lng <= 45.8 && lat <= 39.5) {
    return false;
  }
  if (lat <= 39.0 && lng <= 46.8) {
    return false;
  }
  if (lat <= 39.35 && lng <= 47.5) {
    return false;
  }
  if (lat <= 38.45 && lng >= 48.5) {
    return false;
  }
  if (lat <= 38.55 && lng >= 47.0) {
    return false;
  }
  if (lat >= 41.85 && lng <= 48.5) {
    return false;
  }
  if (lat >= 41.75 && lng <= 47.5) {
    return false;
  }
  return true;
}

/** Azerbaijani postcode NNNN (4 digits). */
export const AZERBAIJAN_POSTAL_RE = /^\d{4}$/;

export function isRussiaCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'russia' ||
    c === 'ru' ||
    c === 'rus' ||
    c === 'rossiya' ||
    c === 'россия' ||
    c === 'russian federation' ||
    c === 'российская федерация'
  );
}

/** Crimea + Donetsk/Luhansk occupied areas — geographic hold; not Russia catalog territory. */
export function isDisputedUkraineTerritory(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  if (lat >= 44.0 && lat <= 46.35 && lng >= 32.2 && lng <= 36.8) {
    return true;
  }
  if (lat >= 47.0 && lat <= 49.85 && lng >= 36.5 && lng <= 40.25) {
    return true;
  }
  return false;
}

/**
 * Russia footprint incl. Kaliningrad + Far East — rejects FI/EE/LV/LT/BY/UA/GE/AZ/KZ/CN/MN/KP/NO/PL cores.
 * Disputed Ukraine territories excluded. Not a legal cadastral boundary.
 */
export function isPlausibleRussiaCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  if (isDisputedUkraineTerritory(lat, lng)) {
    return false;
  }
  if (lat >= 54.3 && lat <= 54.95 && lng >= 19.55 && lng <= 22.75) {
    if (lng <= 19.65 && lat <= 54.45) {
      return false;
    }
    if (lng >= 22.55 && lat >= 54.75) {
      return false;
    }
    return true;
  }
  if (lat < 41.18 || lat > 77.5 || lng < 27.0 || lng > 169.5) {
    return false;
  }
  if (lat >= 69.5 && lng <= 30.5) {
    return false;
  }
  if (lat >= 60.0 && lng <= 28.5) {
    return false;
  }
  if (lat >= 57.8 && lng <= 28.0) {
    return false;
  }
  if (lat >= 56.0 && lng <= 27.8) {
    return false;
  }
  if (lat >= 54.4 && lng <= 26.5) {
    return false;
  }
  if (lat >= 51.25 && lat <= 56.17 && lng <= 32.8) {
    return false;
  }
  if (lat >= 44.18 && lat <= 52.38 && lng <= 40.23) {
    return false;
  }
  if (lat <= 43.5 && lng <= 46.8) {
    return false;
  }
  if (lat <= 42.5 && lng <= 47.5) {
    return false;
  }
  if (lat <= 42.0 && lng >= 46.0 && lng <= 50.65) {
    return false;
  }
  if (lat <= 51.0 && lng >= 48.0 && lng <= 87.0) {
    return false;
  }
  if (lat <= 55.0 && lng >= 60.0 && lng <= 75.0) {
    return false;
  }
  if (lat <= 50.5 && lng >= 87.0) {
    return false;
  }
  if (lat >= 50.0 && lat <= 52.0 && lng >= 85.0) {
    return false;
  }
  if (lat <= 43.5 && lng >= 130.5) {
    return false;
  }
  return true;
}

/** Russian postcode NNNNNN (6 digits). */
export const RUSSIA_POSTAL_RE = /^\d{6}$/;

export function isCyprusCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'cyprus' ||
    c === 'cy' ||
    c === 'republic of cyprus' ||
    c === 'kýpros' ||
    c === 'kypros' ||
    c === 'κύπρος'
  );
}

/**
 * Republic of Cyprus (government-controlled) — rejects Northern Cyprus /
 * TRNC cores (Kyrenia, Morphou, northern Nicosia, Gazimağusa).
 * Not a legal cadastral boundary; aggressive inward bias for merge safety.
 */
export function isPlausibleCyprusCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  // Island bbox (includes both sides; carve-outs below remove north)
  if (lat < 34.55 || lat > 35.22 || lng < 32.25 || lng > 34.65) {
    return false;
  }
  // Northern Cyprus: Kyrenia / Morphou / north-of-Green-Line Nicosia
  // Keep Republic suburbs (Pallouriotissa ~35.178, Engomi ~35.17) inside.
  if (lat >= 35.19 && lng <= 33.55) {
    return false;
  }
  // Gazimağusa / Famagusta north of Paralimni–Protaras tourist coast
  if (lat >= 35.08 && lng >= 33.85 && lng <= 34.15) {
    return false;
  }
  return true;
}

/** Cyprus (RoC) postcode NNNN as string — reject TRNC 99xxx styles upstream. */
export const CYPRUS_POSTAL_RE = /^\d{4}$/;

export function isIcelandCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'iceland' ||
    c === 'is' ||
    c === 'ísland' ||
    c === 'island'
  );
}

/**
 * Iceland inhabited territory — includes capital region, Reykjanes, West/East/South/North,
 * Westfjords, and offshore municipalities (Vestmannaeyjar). Rejects Greenland / Faroe / UK cores.
 */
export function isPlausibleIcelandCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  if (lat < 63.0 || lat > 66.65 || lng < -25.0 || lng > -12.4) {
    return false;
  }
  // Greenland (east of Denmark Strait)
  if (lat >= 66.0 && lng <= -18.5) {
    return false;
  }
  // Faroe Islands
  if (lat >= 61.0 && lat <= 62.5 && lng >= -8.5 && lng <= -6.0) {
    return false;
  }
  // Scotland / Shetland east of Iceland envelope
  if (lat < 66.0 && lng >= -8.0) {
    return false;
  }
  // Mid-Atlantic (no land between Iceland and Europe)
  if (lat < 62.5 && lng >= -12.5) {
    return false;
  }
  return true;
}

/** Iceland postcode NNN (101–999); validate format upstream, locality cross-check in staging. */
export const ICELAND_POSTAL_RE = /^[1-9]\d{2}$/;

/**
 * Liechtenstein mainland — rejects CH (Buchs/Rheintal) and AT (Feldkirch) border cores.
 * Not a legal cadastral boundary; aggressive inward bias for merge safety.
 */
export function isPlausibleLiechtensteinCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  // Liechtenstein bbox ~47.05–47.27 N, 9.47–9.63 E
  if (lat < 47.04 || lat > 47.28 || lng < 9.46 || lng > 9.64) {
    return false;
  }
  // West: Switzerland (Buchs SG urban core west of Rhine bridge corridor)
  if (lng <= 9.48 && lat >= 47.14 && lat <= 47.2) {
    return false;
  }
  // North-east: Austria (Feldkirch / Rankweil corridor)
  if (lat >= 47.22 && lng >= 9.58) {
    return false;
  }
  // East: Austria (Frastanz / Nenzing approach)
  if (lng >= 9.62 && lat >= 47.08) {
    return false;
  }
  // South-west: Switzerland (Sargans / Trübbach across Rhine)
  if (lat <= 47.08 && lng <= 9.49) {
    return false;
  }
  return true;
}

/** Liechtenstein postcode NNNN (9485–9498 range). */
export const LIECHTENSTEIN_POSTAL_RE = /^94(?:8[5-9]|9[0-8])$/;

/**
 * Andorra mainland — rejects Spanish (La Seu d'Urgell) and French (L'Hospitalet) border cores.
 * Not a legal cadastral boundary; aggressive inward bias for merge safety.
 */
export function isPlausibleAndorraCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  // Andorra bbox ~42.43–42.66 N, 1.41–1.79 E (includes Pas de la Casa)
  if (lat < 42.43 || lat > 42.66 || lng < 1.41 || lng > 1.79) {
    return false;
  }
  // South: Spain (La Seu d'Urgell / Alt Urgell approach)
  if (lat <= 42.45 && lng <= 1.5) {
    return false;
  }
  // East-northeast: France (L'Hospitalet-près-l'Andorre / Ariège)
  if (lng >= 1.76 && lat >= 42.55) {
    return false;
  }
  return true;
}

/** Andorra postcode AD100–AD700. */
export const ANDORRA_POSTAL_RE = /^AD[1-7]00$/i;

/**
 * Monaco mainland — rejects Cap-d'Ail / Beausoleil / Roquebrune / Menton cores.
 * Not a legal cadastral boundary; aggressive inward bias for merge safety.
 */
export function isPlausibleMonacoCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  // Monaco bbox ~43.7245–43.7518 N, 7.409–7.4398 E
  if (lat < 43.7245 || lat > 43.7518 || lng < 7.409 || lng > 7.4398) {
    return false;
  }
  // West/southwest: Cap-d'Ail approach (World Class Avenue Marquet)
  if (lng <= 7.411 && lat <= 43.73) {
    return false;
  }
  // North: Beausoleil ridge
  if (lat >= 43.7505 && lng <= 7.428) {
    return false;
  }
  return true;
}

/** Monaco postcode 98000 (Principality). */
export const MONACO_POSTAL_RE = /^98000$/;

/**
 * San Marino mainland — rejects Rimini / Verucchio / Coriano / San Leo cores.
 * Not a legal cadastral boundary; aggressive inward bias for merge safety.
 * Postcode 4789x alone is NOT sufficient (Italian Rimini province also uses 478xx).
 */
export function isPlausibleSanMarinoCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  // San Marino bbox ~43.893–43.992 N, 12.416–12.512 E
  if (lat < 43.893 || lat > 43.992 || lng < 12.416 || lng > 12.512) {
    return false;
  }
  // East-northeast: Coriano / Cerasolo Ausa fringe
  if (lng >= 12.508 && lat >= 43.98) {
    return false;
  }
  // Southwest: San Leo / Montefeltro approach
  if (lng <= 12.422 && lat <= 43.91) {
    return false;
  }
  return true;
}

/** San Marino postcodes 47890–47899 (never Italian 478xx outside this decade). */
export const SAN_MARINO_POSTAL_RE = /^4789[0-9]$/;

/**
 * Inward-biased simplified Leonine Walls + St Peter's Square polygon (lat, lng).
 * Not a cadastral survey — aggressive inward bias for merge/QA safety.
 * Holy See extraterritorial properties elsewhere in Rome are intentionally outside.
 */
const VATICAN_CITY_POLYGON: ReadonlyArray<readonly [number, number]> = [
  [41.90735, 12.4472],
  [41.90742, 12.4554],
  [41.9068, 12.4572],
  [41.9048, 12.4582],
  [41.9032, 12.45835],
  [41.90227, 12.4583],
  [41.9014, 12.4575],
  [41.9004, 12.4558],
  [41.90025, 12.4545],
  [41.9005, 12.451],
  [41.9015, 12.4462],
  [41.90197, 12.4458],
  [41.904, 12.4459],
  [41.906, 12.4465],
];

function pointInPolygon(
  lat: number,
  lng: number,
  ring: ReadonlyArray<readonly [number, number]>,
): boolean {
  // Ray casting along +lng; vertices are [lat, lng].
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][0];
    const xi = ring[i][1];
    const yj = ring[j][0];
    const xj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Vatican City sovereign territory only.
 * Rejects Borgo / Prati / Via della Conciliazione / Piazza Pio XII / Porta Angelica
 * Italian fringes and all Holy See extraterritorial properties.
 * Postcode 00120 alone is NOT sufficient.
 */
export function isPlausibleVaticanCityCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  // Coarse envelope around the city-state (~49 ha)
  if (lat < 41.9001 || lat > 41.90755 || lng < 12.4456 || lng > 12.45845) {
    return false;
  }
  // East of St Peter's Square / Conciliazione / Pio XII / Porta Angelica Italy
  if (lng >= 12.4584) {
    return false;
  }
  // South of Porta Cavalleggeri Italian fringe
  if (lat <= 41.9002 && lng >= 12.453) {
    return false;
  }
  return pointInPolygon(lat, lng, VATICAN_CITY_POLYGON);
}

/**
 * Vatican City State postcode 00120.
 * Italian Rome 001xx (e.g. 00193 Borgo/Prati) must never pass as Vatican proof.
 */
export const VATICAN_CITY_POSTAL_RE = /^00120$/;

/**
 * Moldova mainland including Transnistria geographic footprint.
 * Rejects Romania (Iași / Galați / Huși) and Ukraine (Chernivtsi / Mohyliv / Odesa) cores.
 * Not a cadastral boundary; aggressive inward bias for merge safety.
 * Postcode alone is NOT sufficient.
 */
export function isPlausibleMoldovaCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  // Broad Moldova envelope (~Prut to east of Transnistria)
  if (lat < 45.45 || lat > 48.5 || lng < 26.6 || lng > 30.15) {
    return false;
  }
  // West / northwest: Romania Iași corridor (Ungheni MD ~27.80 stays inside)
  if (lng <= 27.72 && lat >= 46.95 && lat <= 47.4) {
    return false;
  }
  // Southwest: Romania Galați approach (west of Cahul)
  if (lat <= 45.55 && lng >= 27.85 && lng <= 28.15 && lng < 28.05) {
    return false;
  }
  // West: Romania Huși / Vaslui fringe
  if (lng <= 28.05 && lat >= 46.55 && lat <= 46.8 && lng < 27.9) {
    return false;
  }
  // North: Ukraine Chernivtsi / Mohyliv approaches
  if (lat >= 48.35 && lng <= 27.0) {
    return false;
  }
  if (lat >= 48.35 && lng >= 27.6 && lng <= 28.0) {
    return false;
  }
  // Southeast: Ukraine Odesa coastal
  if (lng >= 30.05 && lat <= 46.7) {
    return false;
  }
  return true;
}

/**
 * Moldova postcodes: MD-NNNN (canonical) or bare 4 digits 2xxx–7xxx.
 * Romanian RO-NNNN / Ukrainian indexes must not pass.
 */
export const MOLDOVA_POSTAL_RE = /^(MD-)?[2-7]\d{3}$/i;

/**
 * Montenegro mainland footprint (incl. coast and north).
 * Rejects Croatia (Dubrovnik/Konavle), Bosnia (Trebinje), Albania (Shkodër),
 * Serbia (Novi Pazar corridor), and Kosovo (Pejë) cores.
 * Not a cadastral boundary; aggressive inward bias for merge safety.
 * Postcode alone is NOT sufficient.
 */
export function isPlausibleMontenegroCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  // Broad Montenegro envelope
  if (lat < 41.85 || lat > 43.56 || lng < 18.43 || lng > 20.36) {
    return false;
  }
  // West: Croatia Dubrovnik / Konavle
  if (lng < 18.48 && lat >= 42.35) {
    return false;
  }
  // Northwest: Bosnia Trebinje corridor
  if (lng < 18.48 && lat >= 42.65) {
    return false;
  }
  if (lat >= 42.68 && lng <= 18.52) {
    return false;
  }
  // South: Albania Shkodër core (Ulcinj / Bar stay inside)
  if (lat <= 42.12 && lng >= 19.4 && lng <= 19.65) {
    return false;
  }
  // Northeast: Serbia Novi Pazar corridor (east of Rožaje)
  if (lng >= 20.28 && lat >= 43.05) {
    return false;
  }
  // East: Kosovo Pejë approach
  if (lng >= 20.2 && lat >= 42.55 && lat <= 42.8) {
    return false;
  }
  return true;
}

/**
 * Montenegro postcodes: 5 digits 81xxx–85xxx (Pošta Crne Gore).
 * Serbian 11xxx–38xxx, Croatian 2xxxx, Albanian, Kosovo indexes must not pass.
 */
export const MONTENEGRO_POSTAL_RE = /^8[1-5]\d{3}$/;

/**
 * North Macedonia mainland footprint.
 * Rejects Greece (Thessaloniki/Florina/Edessa/Kilkis), Kosovo (Pristina/Ferizaj/Gjilan),
 * Serbia (Vranje/Preševo), Bulgaria (Kyustendil/Blagoevgrad), Albania (Korçë/Pogradec).
 * Not a cadastral boundary; aggressive inward bias for merge safety.
 * Postcode / "Macedonia" keyword alone is NOT sufficient.
 */
export function isPlausibleNorthMacedoniaCoordinate(
  lat: number,
  lng: number,
): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  // Broad North Macedonia envelope
  if (lat < 40.85 || lat > 42.38 || lng < 20.45 || lng > 23.04) {
    return false;
  }
  // South: Greece — Thessaloniki / Kilkis approach
  if (lat <= 41.12 && lng >= 22.35) {
    return false;
  }
  // Southwest: Greece Florina / Edessa corridor
  if (lat <= 41.0 && lng >= 20.9 && lng <= 22.2) {
    return false;
  }
  // Northwest: Albania Korçë / Pogradec
  if (lng <= 20.72 && lat <= 41.15) {
    return false;
  }
  if (lng <= 20.78 && lat >= 40.85 && lat <= 41.05) {
    return false;
  }
  // North: Kosovo Ferizaj / Gjilan / Pristina approach
  if (lat >= 42.28 && lng >= 21.0 && lng <= 21.6) {
    return false;
  }
  // Northeast: Serbia Vranje / Preševo
  if (lat >= 42.2 && lng >= 21.55 && lng <= 22.1) {
    return false;
  }
  // East: Bulgaria Kyustendil / Blagoevgrad (Kyustendil ~42.28, 22.69)
  if (lng >= 22.55 && lat >= 42.15) {
    return false;
  }
  if (lng >= 22.85 && lat >= 41.9) {
    return false;
  }
  if (lng >= 22.95 && lat >= 41.7) {
    return false;
  }
  return true;
}

/**
 * North Macedonia postcodes: 4 digits (Pošta na Severna Makedonija).
 * Greek 5-digit, Serbian/Bulgarian 5-digit, Kosovo indexes must not pass.
 */
export const NORTH_MACEDONIA_POSTAL_RE = /^\d{4}$/;

/**
 * Bosnia and Herzegovina / Bosna i Hercegovina / BiH.
 * Federation, Republika Srpska, and Brčko District resolve to one country.
 * Never bucket as Croatia, Serbia, or Montenegro.
 */
export function isBosniaHerzegovinaCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'bosnia and herzegovina' ||
    c === 'bosnia & herzegovina' ||
    c === 'bosnia-herzegovina' ||
    c === 'bosnia' ||
    c === 'ba' ||
    c === 'bih' ||
    c === 'biha' ||
    c === 'bosna i hercegovina' ||
    c === 'bosna i hercegovine' ||
    c === 'bosna' ||
    c === 'bosna hercegovina' ||
    c === 'federation of bosnia and herzegovina' ||
    c === 'republika srpska' ||
    c === 'republic of srpska' ||
    c === 'brčko district' ||
    c === 'brcko district' ||
    c === 'босна и херцеговина' ||
    c === 'босна' ||
    c === 'бих' ||
    c === 'bih' ||
    c === 'bih.'
  );
}

/**
 * Bosnia & Herzegovina mainland footprint.
 * Rejects Croatia (Dubrovnik/Metković/Slavonski Brod), Serbia (Drina east),
 * Montenegro (Trebinje/Herceg Novi approach). Neum exclave retained.
 * Not a cadastral boundary; aggressive inward bias for merge safety.
 */
export function isPlausibleBosniaHerzegovinaCoordinate(
  lat: number,
  lng: number,
): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  if (lat < 42.55 || lat > 45.28 || lng < 15.75 || lng > 19.58) {
    return false;
  }
  // NW Federation corridor (Bihać, Cazin, Velika Kladuša) — west of general HR guards
  if (lat >= 44.0 && lat <= 45.05 && lng >= 15.75 && lng <= 16.15) {
    return true;
  }
  // West: Croatia — Dubrovnik / Konavle (keep Neum BiH exclave 42.9–43.08, 17.5–17.68)
  if (lng <= 17.42 && lat >= 42.95 && !(lat >= 42.9 && lat <= 43.08 && lng >= 17.5)) {
    return false;
  }
  // Far-west Croatia north of NW FBiH — keep Bihać / Cazin corridor (lng ~15.8–16.0)
  if (lng <= 15.72) {
    return false;
  }
  if (lng <= 16.55 && lat >= 45.05) {
    return false;
  }
  // North: Croatia Slavonski Brod / Gradiška corridor
  if (lat >= 45.05 && lng <= 18.12) {
    return false;
  }
  if (lat >= 44.95 && lng <= 17.05) {
    return false;
  }
  // Northeast: Serbia (Bijeljina east / Šabac noise)
  if (lat >= 44.85 && lng >= 19.22) {
    return false;
  }
  if (lat >= 44.55 && lng >= 19.42) {
    return false;
  }
  // East: Serbia Drina corridor (Zvornik / Višegrad approach)
  if (lng >= 19.52) {
    return false;
  }
  // South: Montenegro coast / Herceg Novi
  if (lat <= 42.58 && lng >= 18.68) {
    return false;
  }
  if (lat <= 42.62 && lng >= 19.05) {
    return false;
  }
  return true;
}

/**
 * Bosnia & Herzegovina postcodes: 5 digits (Pošta BH Pošte).
 * Croatian 2xxxx / Serbian 1xxxx / Montenegrin 81xxx must not pass alone.
 */
export const BOSNIA_HERZEGOVINA_POSTAL_RE = /^\d{5}$/;

/**
 * Albania / Shqipëri / Republika e Shqipërisë.
 * Never bucket as Montenegro, Kosovo, North Macedonia, or Greece.
 */
export function isAlbaniaCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'albania' ||
    c === 'al' ||
    c === 'alb' ||
    c === 'shqipëri' ||
    c === 'shqiperia' ||
    c === 'shqipëria' ||
    c === 'republika e shqipërisë' ||
    c === 'republika e shqiperise' ||
    c === 'shqipni' ||
    c === 'albanien' ||
    c === 'republic of albania'
  );
}

/**
 * Albania mainland footprint.
 * Rejects Montenegro (Ulcinj/Podgorica), Kosovo (Prizren/Gjakovë/Pejë/Prishtina),
 * North Macedonia (Debar/Ohrid/Struga/Tetovo), Greece (Ioannina/Kastoria/Corfu).
 * Dibër/Peshkopi retained vs Debar MK; Pogradec retained vs Ohrid MK.
 */
export function isPlausibleAlbaniaCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  if (lat < 39.62 || lat > 42.66 || lng < 19.25 || lng > 21.06) {
    return false;
  }
  // West: Montenegro — Ulcinj coast
  if (lat >= 41.88 && lng <= 19.38) {
    return false;
  }
  // Northwest: Montenegro — Podgorica corridor
  if (lat >= 42.3 && lng <= 19.42) {
    return false;
  }
  // North: Kosovo — Pejë
  if (lat >= 42.58 && lng <= 20.42) {
    return false;
  }
  // North: Kosovo — Gjakovë
  if (lat >= 42.32 && lng >= 20.38 && lng <= 20.52) {
    return false;
  }
  // Northeast: Kosovo — Prizren
  if (lat >= 42.12 && lng >= 20.68 && lng <= 20.82) {
    return false;
  }
  // Northeast: Kosovo — Prishtina
  if (lat >= 42.6 && lng >= 20.95) {
    return false;
  }
  // East: North Macedonia — Tetovo
  if (lat >= 41.95 && lat <= 42.1 && lng >= 20.9) {
    return false;
  }
  // East: North Macedonia — Debar (keep Peshkopi/Dibër north at ~41.69)
  if (lat <= 41.58 && lng >= 20.52) {
    return false;
  }
  // East: North Macedonia — Struga
  if (lat <= 41.28 && lng >= 20.64 && lng <= 20.82) {
    return false;
  }
  // East: North Macedonia — Ohrid
  if (lat <= 41.22 && lng >= 20.74) {
    return false;
  }
  // South: Greece — Florina
  if (lat <= 40.88 && lng >= 21.28) {
    return false;
  }
  // South: Greece — Kastoria
  if (lat <= 40.6 && lng >= 21.12) {
    return false;
  }
  // South: Greece — Konitsa
  if (lat <= 40.15 && lng >= 20.72) {
    return false;
  }
  // South: Greece — Ioannina
  if (lat <= 39.75 && lng >= 20.78) {
    return false;
  }
  // Southwest: Greece — Igoumenitsa
  if (lat <= 39.62 && lng >= 20.12 && lng <= 20.38) {
    return false;
  }
  // West: Greece — Corfu
  if (lat <= 39.72 && lng <= 20.08) {
    return false;
  }
  return true;
}

/**
 * Albania postcodes: 4 digits (Posta Shqiptare Kod Postar).
 * Postcode alone must never establish Albanian territory.
 */
export const ALBANIA_POSTAL_RE = /^[1-9]\d{3}$/;

/**
 * Kosovo / Kosova / Republika e Kosovës.
 * Never bucket as Albania, Montenegro, North Macedonia, or Serbia.
 */
export function isKosovoCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'kosovo' ||
    c === 'xk' ||
    c === 'xkx' ||
    c === 'kosova' ||
    c === 'kosovë' ||
    c === 'kosove' ||
    c === 'republika e kosovës' ||
    c === 'republika e kosoves' ||
    c === 'republic of kosovo' ||
    c === 'косово' ||
    c === 'kosovo i metohija'
  );
}

/**
 * Kosovo mainland footprint.
 * Rejects Albania (Kukës/Bajram Curri/Tropojë), Montenegro (Rožaje/Berane),
 * North Macedonia (Skopje/Tetovo/Kumanovo/Debar), Serbia (Novi Pazar/Vranje/Preševo).
 */
export function isPlausibleKosovoCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  if (lat < 41.85 || lat > 43.27 || lng < 20.05 || lng > 21.85) {
    return false;
  }
  // West: Albania — Bajram Curri / Tropojë
  if (lat >= 42.35 && lng <= 20.18) {
    return false;
  }
  // West: Albania — Kukës corridor (keep Dragash south)
  if (lat >= 42.05 && lat <= 42.35 && lng <= 20.32) {
    return false;
  }
  // Northwest: Montenegro — Rožaje
  if (lat >= 42.78 && lng <= 20.22) {
    return false;
  }
  // Northwest: Montenegro — Berane / Plav
  if (lat >= 42.82 && lng <= 19.98) {
    return false;
  }
  // North: Serbia — Novi Pazar
  if (lat >= 43.12 && lng >= 20.48) {
    return false;
  }
  // Northeast: Serbia — Raška / Kuršumlija approach
  if (lat >= 43.0 && lng >= 20.72) {
    return false;
  }
  // East: North Macedonia — Kumanovo
  if (lat >= 42.08 && lng >= 21.68) {
    return false;
  }
  // East: North Macedonia — Skopje
  if (lat <= 42.05 && lng >= 21.38) {
    return false;
  }
  // Southeast: North Macedonia — Tetovo
  if (lat >= 41.95 && lat <= 42.08 && lng >= 20.88) {
    return false;
  }
  // South: North Macedonia — Debar (keep Kaçanik/Dragash north)
  if (lat <= 41.92 && lng >= 20.55) {
    return false;
  }
  // South: Serbia — Preševo / Bujanovac
  if (lat <= 42.28 && lng >= 21.68) {
    return false;
  }
  // South: Serbia — Vranje
  if (lat <= 42.55 && lng >= 21.82) {
    return false;
  }
  // South: Serbia — Leskovac approach
  if (lat <= 42.45 && lng >= 21.85) {
    return false;
  }
  return true;
}

/**
 * Kosovo postcodes: 5 digits (Posta e Kosovës), 10000–79999.
 * Postcode alone must never establish Kosovo territory.
 */
export const KOSOVO_POSTAL_RE = /^[1-7]\d{4}$/;

/**
 * Serbia / Srbija / Republika Srbija.
 * Never bucket Kosovo (xk_*), Bosnia, Montenegro, or North Macedonia premises as Serbia.
 */
export function isSerbiaCountry(country?: string | null): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return (
    c === 'serbia' ||
    c === 'rs' ||
    c === 'srb' ||
    c === 'srbija' ||
    c === 'republika srbija' ||
    c === 'republic of serbia' ||
    c === 'србија' ||
    c === 'република србија'
  );
}

/**
 * Serbia mainland footprint excluding Kosovo (separate Gymly country).
 * Rejects HU, RO, BG, MK, ME, BA, HR, and Kosovo border cores.
 */
export function isPlausibleSerbiaCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  if (lat < 42.23 || lat > 46.19 || lng < 18.81 || lng > 23.01) {
    return false;
  }
  if (isPlausibleKosovoCoordinate(lat, lng)) {
    return false;
  }
  // West: Bosnia — Bijeljina / Drina corridor
  if (lng <= 18.88 && lat >= 44.0) {
    return false;
  }
  if (lng <= 19.05 && lat >= 43.4) {
    return false;
  }
  // West: Croatia — Vukovar / Osijek approach
  if (lng <= 18.95 && lat >= 45.05) {
    return false;
  }
  // Southwest: Montenegro — Prijepolje / Rožaje approach
  if (lat <= 43.05 && lng <= 19.38) {
    return false;
  }
  // South: North Macedonia — Kumanovo / Skopje
  if (lat <= 42.28 && lng >= 21.88) {
    return false;
  }
  if (lat <= 42.05 && lng >= 21.45) {
    return false;
  }
  // Southeast: Bulgaria — Pirot / Dimitrovgrad approach
  if (lat <= 43.05 && lng >= 22.58) {
    return false;
  }
  // East: Romania — Timișoara / Vršac east
  if (lng >= 22.45 && lat >= 44.85) {
    return false;
  }
  // North: Hungary — Subotica north / Szeged
  if (lat >= 46.05 && lng <= 20.5) {
    return false;
  }
  return true;
}

/**
 * Serbia postcodes: 5 digits (Pošta Srbije). Postcode alone must never establish territory.
 */
export const SERBIA_POSTAL_RE = /^\d{5}$/;

/**
 * Legacy DK postal approx + SE Stockholm fallback only.
 * Norway, Germany, United Kingdom, Finland, and any future country must not invent coords.
 */
export function allowsInventedCoordinates(country?: string | null): boolean {
  return isDenmarkCountry(country) || isSwedenCountry(country);
}
