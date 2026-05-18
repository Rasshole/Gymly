/**
 * INTERN indholds-demo til optagelse (TikTok, App Store, intern promo).
 * Slås KUN til i __DEV__ — release-builds kan ikke aktivere flaget.
 */

import {useDemoModeStore} from '@/demo/demoModeStore';

export function canUseDemoContentControls(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

/** Sand når demo er aktiv og build er dev (sikkerhed mod prod). */
export function isDemoContentMode(): boolean {
  return canUseDemoContentControls() && useDemoModeStore.getState().enabled;
}
