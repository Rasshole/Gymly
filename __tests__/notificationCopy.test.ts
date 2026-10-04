jest.mock('@/i18n', () => ({
  badgeDisplayName: (_t: unknown, def: {name: string}) => def.name,
}));

jest.mock('@/config/badgeDefinitions', () => ({
  BADGE_BY_ID: {},
}));

import {
  badgeProgressPercent,
  friendCheckinTitle,
  localizedBadgeProgressCopy,
  localizedStreakCopy,
} from '../src/utils/notificationCopy';
import type {Notification} from '../src/types/notification.types';

const tEn = (key: string, params?: Record<string, string>) => {
  const map: Record<string, string> = {
    'badges.almostThere': 'Almost there',
    'notifications.badgeCloseTo': `You are close to badge: ${params?.name} (${params?.percent}%)`,
    'notifications.badgeAlmostOneStep': `Just one small step left: ${params?.name}`,
    'notifications.streakTitle': 'Streak',
    'notifications.streakBody': `You hit a ${params?.count}-day streak 🔥`,
    'notifications.checkedIn': `${params?.name} checked in`,
    'notifications.aFriend': 'A friend',
  };
  return map[key] ?? key;
};

describe('notificationCopy', () => {
  it('localizes badge progress for English viewer', () => {
    const item = {
      id: '1',
      type: 'badge_progress',
      title: 'Næsten der',
      message: 'Du er tæt på badge: Regular (80%)',
      timestamp: new Date(),
      read: false,
      dataPayload: {badgeName: 'Regular', progress: 0.8},
    } as Notification;
    const copy = localizedBadgeProgressCopy(item, tEn as any);
    expect(copy.title).toBe('Almost there');
    expect(copy.message).toContain('Regular');
    expect(copy.message).toContain('80');
    expect(copy.message).not.toContain('tæt på');
  });

  it('uses near-complete copy at 90%+', () => {
    const item = {
      id: '2',
      type: 'badge_progress',
      title: 'Næsten der',
      message: 'x',
      timestamp: new Date(),
      read: false,
      dataPayload: {badgeName: 'Regular', progress: 0.92},
    } as Notification;
    const copy = localizedBadgeProgressCopy(item, tEn as any);
    expect(copy.message).toContain('small step');
  });

  it('localizes streak from payload days', () => {
    const item = {
      id: '3',
      type: 'streak_milestone',
      title: 'Streak',
      message: 'Du har ramt en streak på 7 dage',
      timestamp: new Date(),
      read: false,
      dataPayload: {streakDays: 7},
    } as Notification;
    expect(localizedStreakCopy(item, tEn as any).message).toContain('7');
  });

  it('check-in title omits center', () => {
    expect(friendCheckinTitle('Mubarek Guleed', tEn as any)).toBe(
      'Mubarek Guleed checked in',
    );
  });

  it('reads fraction progress as percent', () => {
    expect(
      badgeProgressPercent({
        dataPayload: {progress: 0.8},
      } as Notification),
    ).toBe(80);
  });
});
