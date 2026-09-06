import {
  countWeeklyCheckIns,
  getStreakStatusKind,
  getStreakStatusMessage,
  WEEKLY_STREAK_CHECKINS_TARGET,
} from '@/utils/streakStatusCopy';

const t = (key: string, params?: Record<string, string>) => {
  const map: Record<string, string> = {
    'streak.statusStart':
      'Start din streak — tjek ind 3 gange om ugen for at tænde 🔥',
    'streak.statusBuildingOne': '1 check-in til din streak 🔥',
    'streak.statusBuildingMany': '{{count}} check-ins til din streak 🔥',
    'streak.statusActive': '🔥 {{count}} dages streak — fortsæt den gode vane!',
  };
  let out = map[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      out = out.replace(`{{${k}}}`, v);
    }
  }
  return out;
};

describe('streakStatusCopy', () => {
  it('targets three weekly check-ins for building state', () => {
    expect(WEEKLY_STREAK_CHECKINS_TARGET).toBe(3);
  });

  it('classifies streak states', () => {
    expect(getStreakStatusKind(0, 0)).toBe('none');
    expect(getStreakStatusKind(0, 2)).toBe('building');
    expect(getStreakStatusKind(4, 1)).toBe('active');
  });

  it('returns clear copy for each state', () => {
    expect(getStreakStatusMessage({currentStreak: 0, weekCheckIns: 0, t})).toContain(
      'Start din streak',
    );
    expect(getStreakStatusMessage({currentStreak: 0, weekCheckIns: 2, t})).toBe(
      '1 check-in til din streak 🔥',
    );
    expect(getStreakStatusMessage({currentStreak: 5, weekCheckIns: 2, t})).toContain(
      '5 dages streak',
    );
  });

  it('counts weekly check-ins from sessions', () => {
    const now = new Date('2026-06-24T12:00:00');
    const sessions = [
      {
        id: '1',
        gymName: 'Gym',
        startedAt: new Date('2026-06-23T10:00:00'),
        endedAt: new Date('2026-06-23T11:00:00'),
        durationMinutes: 60,
        workoutType: 'ben',
        partnerDisplayName: null,
      },
    ];
    expect(countWeeklyCheckIns(sessions, now)).toBe(1);
  });
});
