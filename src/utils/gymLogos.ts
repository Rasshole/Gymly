/**
 * Gym Logo Mapping
 * Maps gym brands to their official logos
 */

// Logo URLs from official sources or CDN
// Using logo.clearbit.com for reliable brand logos
const GYM_LOGOS: Record<string, string> = {
  // PureGym variants - using official logo
  'PureGym': 'https://logo.clearbit.com/puregym.com',
  'PureGym Danmark': 'https://logo.clearbit.com/puregym.com',
  'Puregym': 'https://logo.clearbit.com/puregym.com',
  'PureGym Hvidovre Stationscenter': 'https://logo.clearbit.com/puregym.com',
  
  // SATS - using official logo
  'Sats': 'https://logo.clearbit.com/sats.dk',
  'SATS': 'https://logo.clearbit.com/sats.dk',
  
  // FitnessX - using official logo
  'FitnessX': 'https://logo.clearbit.com/fitnessx.dk',
  'Fitness X': 'https://logo.clearbit.com/fitnessx.dk',
  
  // CrossFit - using official logo
  'CrossFit': 'https://logo.clearbit.com/crossfit.com',
  
  // Barry's - using official logo
  'Barry\'s': 'https://logo.clearbit.com/barrys.com',
  'Barrys': 'https://logo.clearbit.com/barrys.com',
  
  // LOOP Fitness
  'LOOP Fitness': 'https://logo.clearbit.com/loopfitness.dk',
  'Loop Fitness': 'https://logo.clearbit.com/loopfitness.dk',
  
  // Power House
  'Power House': 'https://logo.clearbit.com/powerhouse.dk',
  
  // Fair Fitness
  'Fair Fitness': 'https://logo.clearbit.com/fairfitness.dk',
  
  // MimoGym
  'MimoGym': 'https://logo.clearbit.com/mimogym.dk',
  
  // Arca
  'Arca': 'https://logo.clearbit.com/arca.dk',
  'Arcaplanet': 'https://logo.clearbit.com/arca.dk',
  
  // PWR.8
  'PWR.8': 'https://logo.clearbit.com/pwr8.dk',
  
  // Training for Warriors
  'Training for Warriors': 'https://logo.clearbit.com/trainingforwarriors.com',
};

/**
 * Get logo URL for a gym brand
 * Returns null if no logo is available
 */
export const getGymLogo = (brand?: string): string | null => {
  if (!brand) return null;
  
  // Normalize brand name (case-insensitive, trim)
  const normalizedBrand = brand.trim();
  
  // Direct match
  if (GYM_LOGOS[normalizedBrand]) {
    return GYM_LOGOS[normalizedBrand];
  }
  
  // Case-insensitive match
  const lowerBrand = normalizedBrand.toLowerCase();
  for (const [key, value] of Object.entries(GYM_LOGOS)) {
    if (key.toLowerCase() === lowerBrand) {
      return value;
    }
  }
  
  // Partial match for variants
  if (lowerBrand.includes('puregym')) {
    return GYM_LOGOS['PureGym'];
  }
  if (lowerBrand.includes('sats')) {
    return GYM_LOGOS['Sats'];
  }
  if (lowerBrand.includes('fitnessx') || lowerBrand.includes('fitness x')) {
    return GYM_LOGOS['FitnessX'];
  }
  if (lowerBrand.includes('crossfit')) {
    return GYM_LOGOS['CrossFit'];
  }
  if (lowerBrand.includes('barry')) {
    return GYM_LOGOS['Barry\'s'];
  }
  if (lowerBrand.includes('loop')) {
    return GYM_LOGOS['LOOP Fitness'];
  }
  if (lowerBrand.includes('power house')) {
    return GYM_LOGOS['Power House'];
  }
  if (lowerBrand.includes('fair fitness')) {
    return GYM_LOGOS['Fair Fitness'];
  }
  
  return null;
};

/**
 * Check if a gym has a logo available
 */
export const hasGymLogo = (brand?: string): boolean => {
  return getGymLogo(brand) !== null;
};

