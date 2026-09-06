import type {TranslateFn} from '@/i18n/translate';
import {
  isDenmarkCountry,
  isFranceCountry,
  isGermanyCountry,
  isBelgiumCountry,
  isItalyCountry,
  isPolandCountry,
  isAustriaCountry,
  isSwitzerlandCountry,
  isNorwayCountry,
  isSpainCountry,
  isSwedenCountry,
  isFinlandCountry,
  isUnitedKingdomCountry,
  isNetherlandsCountry,
  isPortugalCountry,
  isIrelandCountry,
  isCzechiaCountry,
  isHungaryCountry,
  isGreeceCountry,
  isRomaniaCountry,
  isSlovakiaCountry,
  isBulgariaCountry,
  isCroatiaCountry,
  isSloveniaCountry,
  isLithuaniaCountry,
  isLatviaCountry,
  isEstoniaCountry,
  isLuxembourgCountry,
  isMaltaCountry,
  isCyprusCountry,
  isIcelandCountry,
  isLiechtensteinCountry,
  isAndorraCountry,
  isMonacoCountry,
  isSanMarinoCountry,
  isVaticanCityCountry,
  isMoldovaCountry,
  isMontenegroCountry,
  isNorthMacedoniaCountry,
  isBosniaHerzegovinaCountry,
  isAlbaniaCountry,
  isKosovoCountry,
  isSerbiaCountry,
  isUkraineCountry,
  isBelarusCountry,
  isTurkeyCountry,
  isGeorgiaCountry,
  isArmeniaCountry,
  isAzerbaijanCountry,
  isRussiaCountry,
} from '@/utils/gymCountry';

/** i18n key for a stored center.country value. */
export function gymCountryTranslationKey(country?: string | null): string | null {
  if (isGermanyCountry(country)) {
    return 'countries.germany';
  }
  if (isDenmarkCountry(country)) {
    return 'countries.denmark';
  }
  if (isSwedenCountry(country)) {
    return 'countries.sweden';
  }
  if (isNorwayCountry(country)) {
    return 'countries.norway';
  }
  if (isUnitedKingdomCountry(country)) {
    return 'countries.unitedKingdom';
  }
  if (isFinlandCountry(country)) {
    return 'countries.finland';
  }
  if (isNetherlandsCountry(country)) {
    return 'countries.netherlands';
  }
  if (isFranceCountry(country)) {
    return 'countries.france';
  }
  if (isSpainCountry(country)) {
    return 'countries.spain';
  }
  if (isItalyCountry(country)) {
    return 'countries.italy';
  }
  if (isBelgiumCountry(country)) {
    return 'countries.belgium';
  }
  if (isPolandCountry(country)) {
    return 'countries.poland';
  }
  if (isAustriaCountry(country)) {
    return 'countries.austria';
  }
  if (isSwitzerlandCountry(country)) {
    return 'countries.switzerland';
  }
  if (isPortugalCountry(country)) {
    return 'countries.portugal';
  }
  if (isIrelandCountry(country)) {
    return 'countries.ireland';
  }
  if (isCzechiaCountry(country)) {
    return 'countries.czechia';
  }
  if (isHungaryCountry(country)) {
    return 'countries.hungary';
  }
  if (isGreeceCountry(country)) {
    return 'countries.greece';
  }
  if (isRomaniaCountry(country)) {
    return 'countries.romania';
  }
  if (isSlovakiaCountry(country)) {
    return 'countries.slovakia';
  }
  if (isBulgariaCountry(country)) {
    return 'countries.bulgaria';
  }
  if (isCroatiaCountry(country)) {
    return 'countries.croatia';
  }
  if (isSloveniaCountry(country)) {
    return 'countries.slovenia';
  }
  if (isLithuaniaCountry(country)) {
    return 'countries.lithuania';
  }
  if (isLatviaCountry(country)) {
    return 'countries.latvia';
  }
  if (isEstoniaCountry(country)) {
    return 'countries.estonia';
  }
  if (isLuxembourgCountry(country)) {
    return 'countries.luxembourg';
  }
  if (isMaltaCountry(country)) {
    return 'countries.malta';
  }
  if (isCyprusCountry(country)) {
    return 'countries.cyprus';
  }
  if (isIcelandCountry(country)) {
    return 'countries.iceland';
  }
  if (isLiechtensteinCountry(country)) {
    return 'countries.liechtenstein';
  }
  if (isAndorraCountry(country)) {
    return 'countries.andorra';
  }
  if (isMonacoCountry(country)) {
    return 'countries.monaco';
  }
  if (isSanMarinoCountry(country)) {
    return 'countries.sanMarino';
  }
  if (isVaticanCityCountry(country)) {
    return 'countries.vaticanCity';
  }
  if (isMoldovaCountry(country)) {
    return 'countries.moldova';
  }
  if (isMontenegroCountry(country)) {
    return 'countries.montenegro';
  }
  if (isNorthMacedoniaCountry(country)) {
    return 'countries.northMacedonia';
  }
  if (isBosniaHerzegovinaCountry(country)) {
    return 'countries.bosniaHerzegovina';
  }
  if (isAlbaniaCountry(country)) {
    return 'countries.albania';
  }
  if (isKosovoCountry(country)) {
    return 'countries.kosovo';
  }
  if (isSerbiaCountry(country)) {
    return 'countries.serbia';
  }
  if (isUkraineCountry(country)) {
    return 'countries.ukraine';
  }
  if (isBelarusCountry(country)) {
    return 'countries.belarus';
  }
  if (isTurkeyCountry(country)) {
    return 'countries.turkey';
  }
  if (isGeorgiaCountry(country)) {
    return 'countries.georgia';
  }
  if (isArmeniaCountry(country)) {
    return 'countries.armenia';
  }
  if (isAzerbaijanCountry(country)) {
    return 'countries.azerbaijan';
  }
  if (isRussiaCountry(country)) {
    return 'countries.russia';
  }
  return null;
}

/** Localized country label. Does not change stored official names. */
export function formatGymCountryLabel(
  country: string | null | undefined,
  t: TranslateFn,
): string {
  const key = gymCountryTranslationKey(country);
  if (key) {
    return t(key);
  }
  return (country ?? '').trim();
}

/**
 * City + region/country line for pickers.
 * Country-bucket regions (Tyskland/Norge/Sverige) use localized country names
 * instead of the hardcoded Danish region string.
 */
export function gymPickerLocationLine(
  gym: {city?: string; region?: string; country?: string},
  t: TranslateFn,
): string {
  const countryLabel = formatGymCountryLabel(gym.country, t);
  const regionIsCountryBucket =
    isGermanyCountry(gym.country) ||
    isNorwayCountry(gym.country) ||
    isUnitedKingdomCountry(gym.country) ||
    isFinlandCountry(gym.country) ||
    isNetherlandsCountry(gym.country) ||
    isFranceCountry(gym.country) ||
    isSpainCountry(gym.country) ||
    isItalyCountry(gym.country) ||
    isBelgiumCountry(gym.country) ||
    isPolandCountry(gym.country) ||
    isAustriaCountry(gym.country) ||
    isSwitzerlandCountry(gym.country) ||
    isPortugalCountry(gym.country) ||
    isIrelandCountry(gym.country) ||
    isCzechiaCountry(gym.country) ||
    isHungaryCountry(gym.country) ||
    isGreeceCountry(gym.country) ||
    isRomaniaCountry(gym.country) ||
    isSlovakiaCountry(gym.country) ||
    isBulgariaCountry(gym.country) ||
    isCroatiaCountry(gym.country) ||
    isSloveniaCountry(gym.country) ||
    isLithuaniaCountry(gym.country) ||
    isLatviaCountry(gym.country) ||
    isEstoniaCountry(gym.country) ||
    isLuxembourgCountry(gym.country) ||
    isMaltaCountry(gym.country) ||
    isUkraineCountry(gym.country) ||
    isBelarusCountry(gym.country) ||
    isTurkeyCountry(gym.country) ||
    isGeorgiaCountry(gym.country) ||
    isArmeniaCountry(gym.country) ||
    isAzerbaijanCountry(gym.country) ||
    isRussiaCountry(gym.country) ||
    isCyprusCountry(gym.country) ||
    isIcelandCountry(gym.country) ||
    isLiechtensteinCountry(gym.country) ||
    isAndorraCountry(gym.country) ||
    isMonacoCountry(gym.country) ||
    isSanMarinoCountry(gym.country) ||
    isVaticanCityCountry(gym.country) ||
    isMoldovaCountry(gym.country) ||
    isMontenegroCountry(gym.country) ||
    isNorthMacedoniaCountry(gym.country) ||
    gym.region === 'Sverige' ||
    gym.region === 'Storbritannien' ||
    gym.region === 'Suomi' ||
    gym.region === 'España' ||
    gym.region === 'Italia' ||
    gym.region === 'België' ||
    gym.region === 'Polska' ||
    gym.region === 'Österreich' ||
    gym.region === 'Schweiz' ||
    gym.region === 'Portugal' ||
    gym.region === 'Ireland' ||
    gym.region === 'Czechia' ||
    gym.region === 'Hungary' ||
    gym.region === 'Greece' ||
    gym.region === 'Romania' ||
    gym.region === 'Slovakia' ||
    gym.region === 'Bulgaria' ||
    gym.region === 'Croatia' ||
    gym.region === 'Slovenia' ||
    gym.region === 'Lithuania' ||
    gym.region === 'Latvia';
  const second = regionIsCountryBucket ? countryLabel : gym.region;
  return [gym.city, second].filter(Boolean).join(' · ');
}
