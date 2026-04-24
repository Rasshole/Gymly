/**
 * @deprecated Brug `GymLogoView` + `gymLogoService` — ingen remote URL'er længere.
 * Bevares så kald til `gymLogos` ikke knækker; returnerer null / false.
 */
import {getLogoSource} from '@/services/gymLogoService';

export const getGymLogo = (_brand?: string): null => {
  return null;
};

export const hasGymLogo = (brand?: string, gymName?: string): boolean => {
  return getLogoSource(brand, gymName).type === 'local';
};

const gymLogosApi = {
  getGymLogo,
  hasGymLogo,
};

export default gymLogosApi;
