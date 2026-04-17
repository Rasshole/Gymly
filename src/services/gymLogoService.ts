/**
 * Gym Logo Service
 * Chain detection, logo resolution (local → remote → fallback)
 * DEBUG: Logs resolved chain, URL, and fallback usage
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
  | 'unknown';

export interface LogoSource {
  type: 'local' | 'remote';
  localAsset?: number;
  remoteUrl?: string;
  chain: GymChain;
  chainDisplayName: string;
}

// Domain for favicon/logo (Google favicon is more reliable than Clearbit)
const CHAIN_DOMAINS: Record<GymChain, string> = {
  sats: 'sats.dk',
  puregym: 'puregym.com',
  fitness_world: 'fitnessworld.dk',
  fitnessx: 'fitnessx.dk',
  loop_fitness: 'loopfitness.dk',
  arca: 'arca.dk',
  arcaplanet: 'arca.dk',
  power_house: 'powerhouse.dk',
  fair_fitness: 'fairfitness.dk',
  mimogym: 'mimogym.dk',
  orange_fitness: 'orangefitness.dk',
  evo_fitness: 'evofitness.dk',
  anytime_fitness: 'anytimefitness.dk',
  sporting_health_club: 'sportinghealthclub.dk',
  repeat: 'repeat.dk',
  crossfit: 'crossfit.com',
  barrys: 'barrys.com',
  pwr8: 'pwr8.dk',
  training_for_warriors: 'trainingforwarriors.com',
  local_fitness: '',
  unknown: '',
};

// Local asset mapping – add real PNGs to src/assets/images/logos/ for branded logos.
// Priority: local asset → remote URL (favicon) → fallback initials.
// Replace placeholders with real logos; uncomment when ready:
const LOCAL_LOGO_ASSETS: Partial<Record<GymChain, number>> = {
  // sats: require('@/assets/images/logos/logo_sats.png'),
  // puregym: require('@/assets/images/logos/logo_puregym.png'),
  // fitness_world: require('@/assets/images/logos/logo_fitness_world.png'),
  // fitnessx: require('@/assets/images/logos/logo_fitnessx.png'),
  // loop_fitness: require('@/assets/images/logos/logo_loop_fitness.png'),
  // arca: require('@/assets/images/logos/logo_arca.png'),
  // arcaplanet: require('@/assets/images/logos/logo_arca.png'),
  // evo_fitness: require('@/assets/images/logos/logo_evo_fitness.png'),
  // anytime_fitness: require('@/assets/images/logos/logo_anytime_fitness.png'),
  // sporting_health_club: require('@/assets/images/logos/logo_sporting_health_club.png'),
  // repeat: require('@/assets/images/logos/logo_repeat.png'),
};

/**
 * Detect gym chain from brand or gym name
 */
export function detectGymChain(brand?: string, gymName?: string): {chain: GymChain; displayName: string} {
  const raw = (brand || gymName || '').trim().toLowerCase().replace(/[^\w\sæøå-]/g, '');
  const combined = `${raw} ${(gymName || '').trim().toLowerCase()}`;

  const patterns: Array<{pattern: RegExp | string; chain: GymChain; displayName: string}> = [
    {pattern: /sats/, chain: 'sats', displayName: 'SATS'},
    {pattern: /puregym|pure gym/, chain: 'puregym', displayName: 'PureGym'},
    {pattern: /fitness world|fitnessworld/, chain: 'fitness_world', displayName: 'Fitness World'},
    {pattern: /fitnessx|fitness x/, chain: 'fitnessx', displayName: 'FitnessX'},
    {pattern: /loop fitness|loopfitness/, chain: 'loop_fitness', displayName: 'LOOP Fitness'},
    {pattern: /arcaplanet/, chain: 'arcaplanet', displayName: 'Arcaplanet'},
    {pattern: /arca(?!planet)/, chain: 'arca', displayName: 'Arca'},
    {pattern: /power house|powerhouse/, chain: 'power_house', displayName: 'Power House'},
    {pattern: /fair fitness|fairfitness/, chain: 'fair_fitness', displayName: 'Fair Fitness'},
    {pattern: /mimogym/, chain: 'mimogym', displayName: 'MimoGym'},
    {pattern: /orange fitness|orangefitness/, chain: 'orange_fitness', displayName: 'Orange Fitness'},
    {pattern: /evo fitness|evofitness/, chain: 'evo_fitness', displayName: 'Evo Fitness'},
    {pattern: /anytime fitness|anytimefitness/, chain: 'anytime_fitness', displayName: 'Anytime Fitness'},
    {pattern: /sporting health|sportinghealthclub/, chain: 'sporting_health_club', displayName: 'Sporting Health Club'},
    {pattern: /repeat/, chain: 'repeat', displayName: 'Repeat'},
    {pattern: /crossfit/, chain: 'crossfit', displayName: 'CrossFit'},
    {pattern: /barry'?s|barrys/, chain: 'barrys', displayName: "Barry's"},
    {pattern: /pwr\.?8|pwr8/, chain: 'pwr8', displayName: 'PWR.8'},
    {pattern: /training for warriors/, chain: 'training_for_warriors', displayName: 'Training for Warriors'},
    {pattern: /local fitness|borupgård/, chain: 'local_fitness', displayName: 'Local Fitness'},
  ];

  for (const {pattern, chain, displayName} of patterns) {
    const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
    if (regex.test(combined)) return {chain, displayName};
  }

  return {chain: 'unknown', displayName: gymName?.split(/\s+/)[0] || 'Gym'};
}

/**
 * Get logo source: local asset first, then remote URL
 */
export function getLogoSource(brand?: string, gymName?: string): LogoSource {
  const {chain, displayName} = detectGymChain(brand, gymName);

  if (__DEV__) {
    console.log(`[GymLogo] brand="${brand}" name="${gymName}" -> chain=${chain} display="${displayName}"`);
  }

  const localAsset = LOCAL_LOGO_ASSETS[chain];
  if (localAsset !== undefined) {
    if (__DEV__) console.log(`[GymLogo] Using LOCAL asset for ${chain}`);
    return {type: 'local', localAsset, chain, chainDisplayName: displayName};
  }

  const domain = CHAIN_DOMAINS[chain];
  if (domain) {
    const remoteUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    if (__DEV__) console.log(`[GymLogo] Using REMOTE URL for ${chain}: ${remoteUrl}`);
    return {type: 'remote', remoteUrl, chain, chainDisplayName: displayName};
  }

  if (__DEV__) console.log(`[GymLogo] No logo for ${chain} -> will use FALLBACK`);
  return {type: 'remote', chain, chainDisplayName: displayName};
}

/**
 * Get initials for fallback (first letter of chain or gym name)
 */
export function getLogoFallbackInitials(brand?: string, gymName?: string): string {
  const {chain, displayName} = detectGymChain(brand, gymName);
  if (chain !== 'unknown') {
    const initials = displayName.split(/\s+/).map(w => w[0]).join('').toUpperCase();
    return initials.slice(0, 2) || 'G';
  }
  const name = (gymName || brand || 'G').trim();
  return name.charAt(0).toUpperCase();
}
