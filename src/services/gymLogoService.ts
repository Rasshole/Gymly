import {normalizeGymBrand} from '@/utils/gymDisplay';
import {matchBruceBrandLogoKey} from '@/services/bruceBrandLogoRegistry';
/**
 * Gym logo service — **kun** bundtede, officielle brand-PNG'er.
 * Ingen recolor, ingen Clearbit/remote for centre i master-datasættet.
 */

export type GymChain =
  | 'sats'
  | 'puregym'
  | 'fitness_world'
  | 'fitnessx'
  | 'loop_fitness'
  | 'arca'
  | 'arcaplanet'
  | 'power_house'
  | 'energii'
  | 'inzhape'
  | 'fair_fitness'
  | 'mimogym'
  | 'orange_fitness'
  | 'evo_fitness'
  | 'anytime_fitness'
  | 'sporting_health_club'
  | 'repeat'
  | 'crossfit'
  | 'barrys'
  | 'pwr8'
  | 'training_for_warriors'
  | 'local_fitness'
  | 'stc'
  | 'unknown';

export interface LogoSource {
  type: 'local' | 'none';
  localAsset?: number;
  chain: GymChain;
  chainDisplayName: string;
}

const LOCAL_LOGO_ASSETS: Partial<Record<GymChain, number>> = {
  sats: require('@/assets/images/brandLogos/sats_logo.png'),
  puregym: require('@/assets/images/brandLogos/puregym_logo.png'),
  fitnessx: require('@/assets/images/brandLogos/fitnessx_logo.png'),
  loop_fitness: require('@/assets/images/brandLogos/loop_logo.png'),
  arca: require('@/assets/images/brandLogos/arca_logo.png'),
  arcaplanet: require('@/assets/images/brandLogos/arca_logo.png'),
  /** Official SHC */
  sporting_health_club: require('@/assets/images/brandLogos/shc_logo.png'),
  stc: require('@/assets/images/brandLogos/stc_logo.png'),
  /** Official Energii mark (energii.dk) */
  energii: require('@/assets/images/brandLogos/energii_logo.png'),
  /** Official InZhape wordmark (inzhape.dk) */
  inzhape: require('@/assets/images/brandLogos/inzhape_logo.png'),
  /** Official Power House wordmark (powerhousedanmark.dk) — also Power Studio */
  power_house: require('@/assets/images/brandLogos/power_house_logo.png'),
};

const DEFAULT_GYMLY = require('@/assets/images/gymly-kettlebell-logo.png');

/**
 * Brugerkontrolleret brand-key (lowercase) → samme require som i LOCAL_LOGO_ASSETS
 */
const BRAND_KEY_TO_CHAIN: Record<string, GymChain> = {
  arca: 'arca',
  fitnessx: 'fitnessx',
  'fitness x': 'fitnessx',
  puregym: 'puregym',
  loop: 'loop_fitness',
  'loop fitness': 'loop_fitness',
  sats: 'sats',
  stc: 'stc',
  shc: 'sporting_health_club',
  'sporting health club': 'sporting_health_club',
  energii: 'energii',
  inzhape: 'inzhape',
  'power house': 'power_house',
  powerhouse: 'power_house',
};

/**
 * Løser officielt logo hvis `brand` matcher en nøgle (f.eks. efter redigering i DB)
 */
function chainFromBrandField(brand?: string): GymChain | null {
  const canonical = normalizeGymBrand(brand);
  if (!canonical) {
    return null;
  }
  const k = canonical.toLowerCase();
  return BRAND_KEY_TO_CHAIN[k] ?? null;
}

/**
 * Brand fields like "Power House Vejle" / "Power Studio by Power House Aarhus"
 * should still resolve to the shared Power House asset.
 */
function chainFromLooseBrandLabel(brand?: string): GymChain | null {
  const k = (brand || '').trim().toLowerCase();
  if (!k) {
    return null;
  }
  if (k === 'energii' || k.startsWith('energii ')) {
    return 'energii';
  }
  if (k === 'inzhape' || k.startsWith('inzhape ')) {
    return 'inzhape';
  }
  if (
    k === 'power house' ||
    k.startsWith('power house ') ||
    k.includes('power studio by power house') ||
    k.replace(/\s+/g, '') === 'powerhouse'
  ) {
    return 'power_house';
  }
  return null;
}

export function detectGymChain(
  brand?: string,
  gymName?: string,
): {chain: GymChain; displayName: string} {
  const fromField = chainFromBrandField(brand);
  if (fromField) {
    const canonical = normalizeGymBrand(brand);
    return {chain: fromField, displayName: canonical || brand!.trim()};
  }
  const fromRegistry = matchBruceBrandLogoKey(brand, gymName);
  if (fromRegistry) {
    const display =
      fromRegistry === 'energii'
        ? 'Energii'
        : fromRegistry === 'inzhape'
          ? 'InZhape'
          : fromRegistry === 'power_house'
            ? 'Power House'
            : 'STC';
    return {chain: fromRegistry, displayName: display};
  }
  const fromLoose = chainFromLooseBrandLabel(brand);
  if (fromLoose) {
    const display =
      fromLoose === 'energii'
        ? 'Energii'
        : fromLoose === 'inzhape'
          ? 'InZhape'
          : 'Power House';
    return {chain: fromLoose, displayName: display};
  }
  const raw = (brand || gymName || '').trim().toLowerCase().replace(/[^\w\sæøå-]/g, '');
  const combined = `${raw} ${(gymName || '').trim().toLowerCase()}`;

  const patterns: Array<{pattern: RegExp; chain: GymChain; displayName: string}> = [
    {pattern: /sats/, chain: 'sats', displayName: 'SATS'},
    {pattern: /\bstc\b/, chain: 'stc', displayName: 'STC'},
    {pattern: /nordic wellness/, chain: 'unknown', displayName: 'Nordic Wellness'},
    {pattern: /fitness24seven|fitness 24 seven|fitness 24/, chain: 'unknown', displayName: 'Fitness24Seven'},
    {pattern: /friskis|svettis/, chain: 'unknown', displayName: 'Friskis & Svettis'},
    {pattern: /actic/, chain: 'unknown', displayName: 'Actic'},
    {pattern: /puregym|pure gym/, chain: 'puregym', displayName: 'PureGym'},
    {pattern: /fitness world|fitnessworld/, chain: 'fitness_world', displayName: 'Fitness World'},
    {pattern: /fitnessx|fitness x/, chain: 'fitnessx', displayName: 'Fitness X'},
    {pattern: /loop fitness|loopfitness/i, chain: 'loop_fitness', displayName: 'LOOP'},
    {pattern: /arcaplanet/, chain: 'arcaplanet', displayName: 'ARCA'},
    {pattern: /arca(?!planet)/, chain: 'arca', displayName: 'ARCA'},
    {pattern: /energii/, chain: 'energii', displayName: 'Energii'},
    {pattern: /inzhape/, chain: 'inzhape', displayName: 'InZhape'},
    {
      pattern: /power studio by power house|power house|powerhouse/,
      chain: 'power_house',
      displayName: 'Power House',
    },
    {pattern: /fair fitness|fairfitness/, chain: 'fair_fitness', displayName: 'Fair Fitness'},
    {pattern: /mimogym/, chain: 'mimogym', displayName: 'MimoGym'},
    {pattern: /orange fitness|orangefitness/, chain: 'orange_fitness', displayName: 'Orange Fitness'},
    {pattern: /evo fitness|evofitness/, chain: 'evo_fitness', displayName: 'Evo Fitness'},
    {pattern: /anytime fitness|anytimefitness/, chain: 'anytime_fitness', displayName: 'Anytime Fitness'},
    {
      pattern: /sporting health|sportinghealthclub|(^|\s)shc(\s|$)/,
      chain: 'sporting_health_club',
      displayName: 'Sporting Health Club',
    },
    {pattern: /repeat/, chain: 'repeat', displayName: 'Repeat'},
    {pattern: /crossfit/, chain: 'crossfit', displayName: 'CrossFit'},
    {pattern: /barry'?s|barrys/, chain: 'barrys', displayName: "Barry's"},
    {pattern: /pwr\.?8|pwr8/, chain: 'pwr8', displayName: 'PWR.8'},
    {pattern: /training for warriors/, chain: 'training_for_warriors', displayName: 'Training for Warriors'},
    {pattern: /local fitness|borupgård/, chain: 'local_fitness', displayName: 'Local Fitness'},
  ];

  for (const {pattern, chain, displayName} of patterns) {
    if (pattern.test(combined)) {
      return {chain, displayName};
    }
  }

  return {chain: 'unknown', displayName: gymName?.split(/\s+/)[0] || 'Gymly'};
}

export function getLogoSource(brand?: string, gymName?: string): LogoSource {
  const {chain, displayName} = detectGymChain(brand, gymName);
  const localAsset = LOCAL_LOGO_ASSETS[chain];
  if (localAsset !== undefined) {
    return {type: 'local', localAsset, chain, chainDisplayName: displayName};
  }
  return {type: 'none', chain, chainDisplayName: displayName};
}

/** Ikon når mærket ikke har officielt logo (ikke lilla, ikke hjerte) */
export function getDefaultGymlyLogoAsset(): number {
  return DEFAULT_GYMLY;
}

/**
 * Returnerer initiales til fallback-tekst (fx "GX" for ukendt center)
 */
export function getLogoFallbackInitials(brand?: string, gymName?: string): string {
  const {chain, displayName} = detectGymChain(brand, gymName);
  if (chain === 'sporting_health_club') {
    return 'SHC';
  }
  if (chain === 'fitnessx') {
    return 'FX';
  }
  if (chain === 'sats') {
    return 'S';
  }
  if (chain === 'stc') {
    return 'STC';
  }
  if (displayName.toLowerCase().includes('stc')) {
    return 'STC';
  }
  if (displayName.toLowerCase().includes('nordic')) {
    return 'NW';
  }
  if (displayName.toLowerCase().includes('fitness24') || displayName.toLowerCase().includes('fitness 24')) {
    return 'F24';
  }
  if (displayName.toLowerCase().includes('friskis')) {
    return 'F&S';
  }
  if (displayName.toLowerCase().includes('actic')) {
    return 'AC';
  }
  if (chain === 'puregym') {
    return 'P';
  }
  if (chain === 'loop_fitness') {
    return 'L';
  }
  if (chain === 'arca' || chain === 'arcaplanet') {
    return 'A';
  }
  if (chain === 'energii') {
    return 'EN';
  }
  if (chain === 'inzhape') {
    return 'IN';
  }
  if (chain === 'power_house') {
    return 'PH';
  }
  if (chain !== 'unknown' && displayName) {
    const initials = displayName
      .split(/\s+/)
      .map(w => w[0])
      .join('')
      .toUpperCase();
    if (initials) {
      return initials.slice(0, 2);
    }
  }
  const name = (gymName || brand || 'G').trim();
  if (name.length >= 2) {
    return `${name[0]!}${name[1]!}`.toUpperCase();
  }
  return (name[0] || 'G').toUpperCase();
}
