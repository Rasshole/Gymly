import {
  decideGeofenceAutoCheckout,
} from '@/services/autoCheckout/evaluateAutoCheckout';
import {ACTIVE_CHECKIN_OUTSIDE_GRACE_MS} from '@/config/activeCheckinGeofenceConfig';

describe('decideGeofenceAutoCheckout', () => {
  const now = Date.parse('2026-05-26T12:00:00.000Z');

  it('clears away when back within 200m', () => {
    const away = new Date(now - 60_000).toISOString();
    expect(decideGeofenceAutoCheckout(150, away, now).action).toBe('clear_away');
  });

  it('starts away timer when beyond 200m', () => {
    const d = decideGeofenceAutoCheckout(250, null, now);
    expect(d.action).toBe('set_away');
    if (d.action === 'set_away') {
      expect(d.lastDistance).toBe(250);
    }
  });

  it('checks out only after grace period', () => {
    const away = new Date(now - ACTIVE_CHECKIN_OUTSIDE_GRACE_MS - 1000).toISOString();
    expect(decideGeofenceAutoCheckout(300, away, now).action).toBe('checkout_away');
  });

  it('does not checkout before grace period', () => {
    const away = new Date(now - 5_000).toISOString();
    const d = decideGeofenceAutoCheckout(300, away, now);
    expect(d.action).toBe('update_distance_only');
  });
});
