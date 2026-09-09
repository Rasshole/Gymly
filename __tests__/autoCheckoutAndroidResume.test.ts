/**
 * Source contracts: resume re-reads permission / restarts watcher;
 * stale-gap spike exemption wired into evaluation.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('auto-checkout Android resume contracts', () => {
  it('re-reads permission and restarts watcher when AppState returns to active', () => {
    const hook = read('src/hooks/useAutoCheckoutController.ts');
    expect(hook).toMatch(/next === 'active' && prev !== 'active'/);
    expect(hook).toMatch(/ensureWatchIfAuthorized/);
    expect(hook).toMatch(/getLocationPermissionStatus/);
    expect(hook).toMatch(/configureGeolocationForActiveWorkoutTracking\(true\)/);
  });

  it('skips spike reject on stale location gap in evaluation', () => {
    const evalSrc = read('src/services/autoCheckout/runAutoCheckoutEvaluation.ts');
    expect(evalSrc).toMatch(/isGeofenceLocationSampleStale/);
    expect(evalSrc).toMatch(/skipSpikeReject:\s*sampleGapStale/);
    expect(evalSrc).toMatch(/seedStaleOutsideResumeState/);
  });

  it('does not declare FOREGROUND_SERVICE_LOCATION in app manifest', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    expect(manifest).toMatch(/ACCESS_BACKGROUND_LOCATION/);
    expect(manifest).not.toMatch(/FOREGROUND_SERVICE_LOCATION/);
  });
});
