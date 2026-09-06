import {
  decideGeofenceAutoCheckout,
} from '@/services/autoCheckout/evaluateAutoCheckout';
import {
  ACTIVE_CHECKIN_OUTSIDE_GRACE_MS,
  AUTO_CHECKOUT_DISTANCE_METERS,
} from '@/config/activeCheckinGeofenceConfig';

describe('decideGeofenceAutoCheckout', () => {
  const now = Date.parse('2026-05-26T12:00:00.000Z');
  const within = AUTO_CHECKOUT_DISTANCE_METERS - 50;
  const outside = AUTO_CHECKOUT_DISTANCE_METERS + 50;

  it('clears away when back within radius', () => {
    const away = new Date(now - 60_000).toISOString();
    expect(decideGeofenceAutoCheckout(within, away, now).action).toBe('clear_away');
  });

  it('starts away timer when beyond radius', () => {
    const d = decideGeofenceAutoCheckout(outside, null, now);
    expect(d.action).toBe('set_away');
    if (d.action === 'set_away') {
      expect(d.lastDistance).toBe(outside);
    }
  });

  it('checks out only after grace period', () => {
    const away = new Date(now - ACTIVE_CHECKIN_OUTSIDE_GRACE_MS - 1000).toISOString();
    expect(decideGeofenceAutoCheckout(outside + 50, away, now).action).toBe('checkout_away');
  });

  it('does not checkout before grace period', () => {
    const away = new Date(now - 5_000).toISOString();
    const d = decideGeofenceAutoCheckout(outside + 50, away, now);
    expect(d.action).toBe('update_distance_only');
  });
});
