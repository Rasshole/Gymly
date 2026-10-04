/**
 * INTERN indholds-demo til optagelse (TikTok, App Store, intern promo).
 * Slås KUN til i __DEV__ — release-builds kan ikke aktivere flaget.
 */

import Config from 'react-native-config';
import {SURFACE_DEMO_MODE_IN_SETTINGS} from '@/config/launchSurfaceConfig';
import {useDemoModeStore} from '@/demo/demoModeStore';

export function canUseDemoContentControls(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

/**
 * Patrick's physical QA Debug build sets GYMLY_LOCAL_QA via ENVFILE=.env.qa.local
 * (native react-native-config). Never sufficient alone — still requires __DEV__.
 */
export function isLocalQaDemoSurface(): boolean {
  const raw = (Config as Record<string, string | undefined> | undefined)?.GYMLY_LOCAL_QA;
  if (typeof raw === 'string' && raw.trim()) {
    const v = raw.trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'yes';
  }
  if (typeof process !== 'undefined' && process.env?.GYMLY_LOCAL_QA?.trim()) {
    const v = process.env.GYMLY_LOCAL_QA.trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'yes';
  }
  return false;
}

/**
 * Settings → INTERNAL — DEMO / RECORDING visibility.
 *
 * Hard requirement for store launch: never show in Release.
 * Even in __DEV__, requires SURFACE_DEMO_MODE_IN_SETTINGS === true (launch flag is
 * false for production readiness). Local QA alone is no longer enough to surface
 * the toggle to avoid accidental demo enablement on QA devices.
 */
export function shouldShowDemoSettingsSection(): boolean {
  if (!canUseDemoContentControls()) {
    return false;
  }
  return SURFACE_DEMO_MODE_IN_SETTINGS === true;
}

/** Sand når demo er aktiv og build er dev (sikkerhed mod prod / Release). */
export function isDemoContentMode(): boolean {
  return canUseDemoContentControls() && useDemoModeStore.getState().enabled;
}
