import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {SURFACE_SMART_CHECK_IN} from '../src/config/smartCheckInSurface';
import {
  SMART_CHECK_IN_COOLDOWN_MS,
  SMART_CHECK_IN_MAX_ACCURACY_METERS,
  SMART_CHECK_IN_MAX_LOCATION_AGE_MS,
  cooldownMapAfterDismiss,
  isFreshPreciseLocation,
  visibleSmartCheckInGyms,
  type SmartGymCandidate,
  type SmartLocationSample,
} from '../src/services/smartCheckIn/smartCheckInRules';
import {startSmartCheckIn} from '../src/services/smartCheckIn/startSmartCheckIn';
import type {SupabaseCheckInRow} from '../src/types/checkIn.types';

const gymA: SmartGymCandidate = {
  id: 'gym-a',
  name: 'Center A',
  latitude: 56.18809,
  longitude: 10.211548,
};
const gymB: SmartGymCandidate = {
  id: 'gym-b',
  name: 'Center B',
  latitude: 56.201511,
  longitude: 10.244689,
};

function sample(overrides: Partial<SmartLocationSample> = {}): SmartLocationSample {
  return {
    latitude: gymA.latitude,
    longitude: gymA.longitude,
    accuracyMeters: 8,
    timestampMs: 1_000_000,
    ...overrides,
  };
}

describe('smart check-in rules', () => {
  it('keeps the public surface off and reuses the 200 m check-in radius', () => {
    expect(SURFACE_SMART_CHECK_IN).toBe(false);
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(SMART_CHECK_IN_MAX_LOCATION_AGE_MS).toBe(30_000);
    expect(SMART_CHECK_IN_MAX_ACCURACY_METERS).toBe(50);
    expect(SMART_CHECK_IN_COOLDOWN_MS).toBe(2 * 60 * 60 * 1000);
  });

  it('suggests the gym inside the boundary and none outside it', () => {
    const inside = visibleSmartCheckInGyms({
      sample: sample(),
      gyms: [gymA, gymB],
      nowMs: sample().timestampMs,
      cooldownUntilByGymId: {},
      hasActiveSession: false,
    });
    expect(inside.map(hit => hit.gym.id)).toEqual(['gym-a']);

    const outside = visibleSmartCheckInGyms({
      sample: sample({latitude: 56.25, longitude: 10.3}),
      gyms: [gymA, gymB],
      nowMs: sample().timestampMs,
      cooldownUntilByGymId: {},
      hasActiveSession: false,
    });
    expect(outside).toEqual([]);
  });

  it('rejects an old or imprecise fix', () => {
    const now = sample().timestampMs;
    expect(isFreshPreciseLocation(sample({timestampMs: now - 30_001}), now)).toBe(false);
    expect(isFreshPreciseLocation(sample({accuracyMeters: 51}), now)).toBe(false);
    expect(isFreshPreciseLocation(sample({accuracyMeters: null}), now)).toBe(false);
    expect(
      visibleSmartCheckInGyms({
        sample: sample({accuracyMeters: null}),
        gyms: [gymA],
        nowMs: now,
        cooldownUntilByGymId: {},
        hasActiveSession: false,
      }),
    ).toEqual([]);
  });

  it('returns every gym inside the boundary instead of picking one', () => {
    const nearBoth = sample({latitude: 56.20164, longitude: 10.24332});
    const hits = visibleSmartCheckInGyms({
      sample: nearBoth,
      gyms: [gymA, gymB, {...gymB, id: 'gym-c', name: 'Center C', latitude: 56.2017, longitude: 10.2434}],
      nowMs: nearBoth.timestampMs,
      cooldownUntilByGymId: {},
      hasActiveSession: false,
    });
    expect(hits.length).toBeGreaterThan(1);
    expect(hits.some(hit => hit.gym.id === 'gym-a')).toBe(false);
  });

  it('hides suggestions during an active session and during cooldown', () => {
    const now = sample().timestampMs;
    expect(
      visibleSmartCheckInGyms({
        sample: sample(),
        gyms: [gymA],
        nowMs: now,
        cooldownUntilByGymId: {},
        hasActiveSession: true,
      }),
    ).toEqual([]);

    const cooled = cooldownMapAfterDismiss({}, ['gym-a'], now);
    expect(cooled['gym-a']).toBe(now + SMART_CHECK_IN_COOLDOWN_MS);
    const during = now + 60_000;
    expect(
      visibleSmartCheckInGyms({
        sample: sample({timestampMs: during}),
        gyms: [gymA],
        nowMs: during,
        cooldownUntilByGymId: cooled,
        hasActiveSession: false,
      }),
    ).toEqual([]);
    const later = now + SMART_CHECK_IN_COOLDOWN_MS + 1;
    expect(
      visibleSmartCheckInGyms({
        sample: sample({timestampMs: later}),
        gyms: [gymA],
        nowMs: later,
        cooldownUntilByGymId: cooled,
        hasActiveSession: false,
      }).map(hit => hit.gym.id),
    ).toEqual(['gym-a']);
  });
});

describe('smart check-in start', () => {
  const input = {
    userId: 'user-1',
    gymId: 'gym-a',
    gymName: 'Center A',
    displayName: 'QA',
  };

  function row(id: string): SupabaseCheckInRow {
    return {
      id,
      user_id: 'user-1',
      gym_id: 'gym-a',
      gym_name: 'Center A',
      city: null,
      workout_type: null,
      started_at: '2026-10-06T12:00:00.000Z',
      ended_at: null,
      is_active: true,
    };
  }

  it('creates one session when two taps share the attempt', async () => {
    let active: SupabaseCheckInRow | null = null;
    let submits = 0;
    const deps = {
      getActive: async () => active,
      submit: async () => {
        submits += 1;
        await new Promise(resolve => setTimeout(resolve, 20));
        active = row('session-1');
        return {id: 'session-1', startedAt: new Date('2026-10-06T12:00:00.000Z')};
      },
    };
    const [first, second] = await Promise.all([
      startSmartCheckIn(input, deps),
      startSmartCheckIn(input, deps),
    ]);
    expect(submits).toBe(1);
    expect(first.ok && second.ok && first.session.id === second.session.id).toBe(true);
  });

  it('reuses a session created before an unclear failure and does not insert again', async () => {
    let submits = 0;
    const failed = await startSmartCheckIn(input, {
      getActive: async () => null,
      submit: async () => {
        submits += 1;
        throw new Error('timeout');
      },
    });
    expect(failed.ok).toBe(false);
    expect(submits).toBe(1);

    const active = row('session-2');
    const recovered = await startSmartCheckIn(input, {
      getActive: async () => active,
      submit: async () => {
        submits += 1;
        return {id: 'should-not-insert', startedAt: new Date()};
      },
    });
    expect(recovered.ok && recovered.created).toBe(false);
    expect(recovered.ok && recovered.session.id).toBe('session-2');
    expect(submits).toBe(1);
  });

  it('recovers the row when insert reports failure after the session exists', async () => {
    const active = row('session-3');
    const result = await startSmartCheckIn(input, {
      getActive: async () => null,
      submit: async () => {
        throw new Error('network');
      },
    });
    expect(result.ok).toBe(false);

    let lookedUp = false;
    const recovered = await startSmartCheckIn(input, {
      getActive: async () => {
        if (!lookedUp) {
          lookedUp = true;
          return null;
        }
        return active;
      },
      submit: async () => {
        throw new Error('network');
      },
    });
    expect(recovered.ok && recovered.created).toBe(false);
    expect(recovered.ok && recovered.session.workoutType).toBe('');
  });
});
