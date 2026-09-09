/**
 * Google Play prominent location disclosure contracts + geofence regression.
 */

import fs from 'fs';
import path from 'path';
import {CHECK_IN_RADIUS_METERS} from '@/config/dataConfig';
import {decideGeofenceAutoCheckout} from '@/services/autoCheckout/evaluateAutoCheckout';
import en from '@/i18n/translations/en';
import da from '@/i18n/translations/da';
import nb from '@/i18n/translations/nb';
import sv from '@/i18n/translations/sv';

const ROOT = path.join(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('Google Play location prominent disclosure', () => {
  const disclosure = en.locationDisclosure;

  it('PROMINENT_DISCLOSURE_EXISTS', () => {
    expect(disclosure.title.length).toBeGreaterThan(0);
    expect(disclosure.body.length).toBeGreaterThan(0);
    expect(read('src/components/location/LocationProminentDisclosureHost.tsx')).toMatch(
      /location-prominent-disclosure/,
    );
    expect(read('App.tsx')).toMatch(/LocationProminentDisclosureHost/);
  });

  it('DISCLOSURE_MENTIONS_LOCATION', () => {
    expect(disclosure.body.toLowerCase()).toMatch(/location/);
    expect(disclosure.title.toLowerCase()).toMatch(/location/);
  });

  it('DISCLOSURE_EXPLAINS_PURPOSE', () => {
    const body = disclosure.body.toLowerCase();
    expect(body).toMatch(/check in|check-in/);
    expect(body).toMatch(/check-out|check out|automatic/);
    expect(body).toMatch(/gym/);
  });

  it('DISCLOSURE_EXPLAINS_BACKGROUND_USE and CLOSED_NOT_IN_USE', () => {
    const body = disclosure.body.toLowerCase();
    expect(body).toMatch(/closed or not in use/);
    expect(body).toMatch(/automatic check-out|leave the gym/);
  });

  it('AFFIRMATIVE_CONSENT_REQUIRED Agree / Not now', () => {
    expect(disclosure.agree.toLowerCase()).toBe('agree');
    expect(disclosure.notNow.toLowerCase()).toBe('not now');
    const host = read('src/components/location/LocationProminentDisclosureHost.tsx');
    expect(host).toMatch(/location-prominent-disclosure-agree/);
    expect(host).toMatch(/location-prominent-disclosure-not-now/);
    expect(host).toMatch(/resolveLocationProminentDisclosure\(true\)/);
    expect(host).toMatch(/resolveLocationProminentDisclosure\(false\)/);
  });

  it('localized disclosure present in da/nb/sv', () => {
    for (const locale of [da, nb, sv]) {
      expect(locale.locationDisclosure.title.length).toBeGreaterThan(0);
      expect(locale.locationDisclosure.body.length).toBeGreaterThan(40);
      expect(locale.locationDisclosure.agree.length).toBeGreaterThan(0);
      expect(locale.locationDisclosure.notNow.length).toBeGreaterThan(0);
    }
    expect(da.locationDisclosure.body.toLowerCase()).toMatch(/lukket|ikke er i brug/);
    expect(nb.locationDisclosure.body.toLowerCase()).toMatch(/lukket|ikke i bruk/);
    expect(sv.locationDisclosure.body.toLowerCase()).toMatch(/stängd|inte används/);
  });

  it('not used for advertising claim present', () => {
    expect(disclosure.notForAds.toLowerCase()).toMatch(/not used for advertising/);
  });
});

describe('Disclosure gate wiring (no bypass)', () => {
  it('requestLocationPermissionIfNeeded routes through disclosure module', () => {
    const src = read('src/services/location/locationPermission.ts');
    expect(src).toMatch(/requestLocationPermissionWithDisclosureIfNeeded/);
    expect(src).toMatch(/requestBackgroundLocationWithDisclosureIfNeeded/);
  });

  it('disclosure must be accepted before OS request in gate', () => {
    const gate = read('src/services/location/requestLocationWithDisclosure.ts');
    expect(gate).toMatch(/ensureProminentDisclosureAccepted/);
    expect(gate).toMatch(/presentLocationProminentDisclosure|hasAcceptedLocationProminentDisclosure/);
    // Order: accept check before requestLocationPermission
    const acceptIdx = gate.indexOf('ensureProminentDisclosureAccepted');
    const requestIdx = gate.indexOf('requestLocationPermission()');
    expect(acceptIdx).toBeGreaterThan(-1);
    expect(requestIdx).toBeGreaterThan(acceptIdx);
  });

  it('App mounts disclosure host', () => {
    expect(read('App.tsx')).toMatch(/<LocationProminentDisclosureHost/);
  });

  it('DISCLOSURE_BYPASS_PATHS = 0 for known entry points', () => {
    const files = [
      'src/screens/main/CheckInScreen.tsx',
      'src/screens/main/MapScreen.tsx',
      'src/screens/auth/RegisterScreen.tsx',
      'src/hooks/useAutoCheckoutController.ts',
    ];
    for (const f of files) {
      const src = read(f);
      // Must not call OS-only requestLocationPermission( directly
      expect(src).not.toMatch(/requestLocationPermission\(/);
      expect(src).not.toMatch(/requestBackgroundLocationOsPermission/);
    }
  });
});

describe('Check-in / auto-checkout radius regression', () => {
  it('CHECKIN_199M ALLOW, 200M ALLOW, 201M BLOCK; AUTO_CHECKOUT = 200M', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(decideGeofenceAutoCheckout(199, null, Date.now()).action).toBe('none');
    expect(decideGeofenceAutoCheckout(200, null, Date.now()).action).toBe('none');
    expect(decideGeofenceAutoCheckout(201, null, Date.now()).action).toBe('set_away');
  });
});

describe('Privacy policy location accuracy', () => {
  it('in-app privacy policy mentions background / closed use', () => {
    const privacy = read('src/content/legal/privacyPolicyContent.ts');
    expect(privacy.toLowerCase()).toMatch(/closed or not in use/);
    expect(privacy.toLowerCase()).toMatch(/not used for advertising|location is not used for advertising/);
    expect(privacy.toLowerCase()).toMatch(/distance to the gym/);
  });
});
