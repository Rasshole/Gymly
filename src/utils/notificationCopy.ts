/**
 * Viewer-language copy for system notification rows (badge progress / streak).
 * Prefer structured dataPayload over author-language title/body.
 */

import type {TranslateFn} from '@/i18n';
import {badgeDisplayName} from '@/i18n';
import {BADGE_BY_ID} from '@/config/badgeDefinitions';
import type {BadgeDefinition} from '@/types/badge.types';
import type {Notification} from '@/types/notification.types';

export function resolveBadgeDefFromNotification(
  item: Notification,
): BadgeDefinition | undefined {
  const id = item.badgeId || (item.dataPayload?.badgeId as string | undefined);
  if (!id) {
    return undefined;
  }
  return BADGE_BY_ID[id];
}

export function badgeNameForNotification(
  item: Notification,
  def: BadgeDefinition | undefined,
  t: TranslateFn,
): string {
  if (def) {
    return badgeDisplayName(t, def);
  }
  return item.badgeName || (item.dataPayload?.badgeName as string) || 'Badge';
}

/** Progress percent 0–100 from payload (fraction or percent). */
export function badgeProgressPercent(item: Notification): number | null {
  const raw = item.dataPayload?.progress;
  if (typeof raw !== 'number' || Number.isNaN(raw)) {
    return null;
  }
  if (raw >= 0 && raw <= 1) {
    return Math.round(raw * 100);
  }
  return Math.round(raw);
}

export function localizedBadgeProgressCopy(
  item: Notification,
  t: TranslateFn,
): {title: string; message: string} {
  const def = resolveBadgeDefFromNotification(item);
  const name = badgeNameForNotification(item, def, t);
  const pct = badgeProgressPercent(item);
  const title = t('badges.almostThere');
  if (pct != null && pct >= 90) {
    return {
      title,
      message: t('notifications.badgeAlmostOneStep', {name}),
    };
  }
  if (pct != null) {
    return {
      title,
      message: t('notifications.badgeCloseTo', {
        name,
        percent: String(pct),
      }),
    };
  }
  return {
    title,
    message: t('notifications.badgeCloseTo', {name, percent: '80'}),
  };
}

export function localizedStreakCopy(
  item: Notification,
  t: TranslateFn,
): {title: string; message: string} {
  const daysRaw =
    item.streakCount ??
    (item.dataPayload?.streakDays as number | undefined) ??
    null;
  const days =
    typeof daysRaw === 'number' && !Number.isNaN(daysRaw) ? daysRaw : null;
  return {
    title: t('notifications.streakTitle'),
    message:
      days != null
        ? t('notifications.streakBody', {count: String(days)})
        : item.message || t('notifications.streakTitle'),
  };
}

export function friendCheckinTitle(name: string, t: TranslateFn): string {
  const n = name.trim() || t('notifications.aFriend');
  return t('notifications.checkedIn', {name: n});
}

export function localizedFriendRequestCopy(
  item: Notification,
  t: TranslateFn,
): {title: string; message: string; statusLabel?: string} {
  const name =
    (item.friendName || '').trim() || t('notifications.aFriend');
  const state = item.friendRequestUiState;

  if (state === 'accepted') {
    return {
      title: t('notifications.friendRequestAcceptedTitle', {name}),
      message: '',
      statusLabel: t('notifications.friendRequestAcceptedStatus'),
    };
  }
  if (state === 'declined') {
    return {
      title: t('notifications.friendRequestDeclinedTitle'),
      message: t('notifications.friendRequestDeclinedBody', {name}),
      statusLabel: t('notifications.friendRequestDeclinedStatus'),
    };
  }
  if (state === 'unavailable') {
    return {
      title: t('notifications.friendRequestUnavailableTitle'),
      message: t('notifications.friendRequestUnavailableBody'),
    };
  }
  if (state === 'unknown') {
    return {
      title: t('notifications.friendRequestPendingTitle'),
      message: t('notifications.friendRequestPendingBody', {name}),
    };
  }
  // pending (and default while confirmed pending)
  return {
    title: t('notifications.friendRequestPendingTitle'),
    message: t('notifications.friendRequestPendingBody', {name}),
  };
}

