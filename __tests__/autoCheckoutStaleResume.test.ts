/**
 * Auto-checkout geofence spike / stale-resume regressions.
 */

import {
  ACTIVE_CHECKIN_OUTSIDE_GRACE_MS,
  ACTIVE_CHECKIN_SPIKE_MAX_DELTA_M,
  ACTIVE_CHECKIN_STALE_LOCATION_GAP_MS,
  AUTO_CHECKOUT_DISTANCE_METERS,
} from '@/config/activeCheckinGeofenceConfig';
import {decideGeofenceAutoCheckout} from '@/services/autoCheckout/evaluateAutoCheckout';
import {
  computeStableFlags,
  isGeofenceLocationSampleStale,
  pushDistanceSample,
  seedStaleOutsideResumeState,
} from '@/logic/activeCheckinGeofenceEngine';

describe('auto-checkout stale resume / spike', () => {
  it('rejects a sudden >150m jump while samples are fresh (inside → far)', () => {
    const first = pushDistanceSample([], 40);
    expect(first.rejectedSpike).toBe(false);
    const jump = pushDistanceSample(first.buffer, 40 + ACTIVE_CHECKIN_SPIKE_MAX_DELTA_M + 50, {
      previousMedianForSpikeCheck: first.median,
    });
    expect(jump.rejectedSpike).toBe(true);
    expect(jump.median).toBe(first.median);
  });

  it('does not treat a never-sampled buffer as stale resume', () => {
    expect(isGeofenceLocationSampleStale(0, Date.now())).toBe(false);
  });

  it('accepts the same jump after a stale location gap (background JS pause)', () => {
    const first = pushDistanceSample([], 40);
    const now = Date.now();
    expect(
      isGeofenceLocationSampleStale(now - ACTIVE_CHECKIN_STALE_LOCATION_GAP_MS - 1, now),
    ).toBe(true);
    const jump = pushDistanceSample(
      first.buffer,
      AUTO_CHECKOUT_DISTANCE_METERS + 500,
      {
        previousMedianForSpikeCheck: first.median,
        skipSpikeReject: true,
      },
    );
    expect(jump.rejectedSpike).toBe(false);
    expect(jump.median).toBeGreaterThan(AUTO_CHECKOUT_DISTANCE_METERS);
    expect(jump.zone).toBe(2);
  });

  it('seeds grace + stable-outside so resume can checkout immediately', () => {
    const now = Date.parse('2026-09-09T12:00:00.000Z');
    const seeded = seedStaleOutsideResumeState(now);
    expect(computeStableFlags(seeded.zoneHistory).stableOutside).toBe(true);
    const decision = decideGeofenceAutoCheckout(
      AUTO_CHECKOUT_DISTANCE_METERS + 800,
      seeded.awayStartedAt,
      now,
    );
    expect(decision.action).toBe('checkout_away');
    expect(now - Date.parse(seeded.awayStartedAt)).toBeGreaterThan(
      ACTIVE_CHECKIN_OUTSIDE_GRACE_MS,
    );
  });

  it('keeps 199 allow / 200 allow / 201 set_away invariants', () => {
    const now = Date.now();
    expect(decideGeofenceAutoCheckout(199, null, now).action).toBe('none');
    expect(decideGeofenceAutoCheckout(200, null, now).action).toBe('none');
    expect(decideGeofenceAutoCheckout(201, null, now).action).toBe('set_away');
  });
});
