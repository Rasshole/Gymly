/**
 * Single source of truth for user home / primary gyms (read + write + UI resolve).
 */

import type {ProfileCenterRow} from '@/components/profile/ProfileCentersList';
import {emitProfileCentersChanged} from '@/realtime/profileCentersBridge';
import {useAppStore} from '@/store/appStore';
import type {User} from '@/types/user.types';
import {findGymByIdRelaxed, formatGymDisplayName} from '@/utils/gymDisplay';
import {
  fetchUserCentersOrdered,
  persistUserHomeGyms,
  type UserCenterRow,
} from './userCentersService';
import {fetchFavoriteGymIdsFromProfile} from './userCentersService';

const HOME_GYM_DEBUG = __DEV__;

function logHomeGyms(event: string, payload?: Record<string, unknown>) {
  if (HOME_GYM_DEBUG) {
    console.log(`[homeGyms] ${event}`, payload ?? '');
  }
}

function uniqueIds(ids: (string | null | undefined)[]): string[] {
  return [...new Set(ids.map(x => String(x ?? '').trim()).filter(Boolean))].slice(0, 3);
}

/** Fallback label when center_id is not in the local gym register. */
export function humanizeCenterId(centerId: string): string {
  const trimmed = centerId.trim();
  if (!trimmed) {
    return 'Gym';
  }
  const g = findGymByIdRelaxed(trimmed);
  if (g) {
    return formatGymDisplayName(g);
  }
  const slug = trimmed.replace(/-/g, ' ');
  const words = slug.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return trimmed;
  }
  return words
    .map(w => {
      if (/^\d+$/.test(w)) {
        return w;
      }
      if (w.length <= 3) {
        return w.toUpperCase();
      }
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

export function orderCenterIdsFromRows(rows: UserCenterRow[]): string[] {
  if (rows.length === 0) {
    return [];
  }
  const sorted = [...rows].sort((a, b) => {
    if (a.isPrimary && !b.isPrimary) {
      return -1;
    }
    if (!a.isPrimary && b.isPrimary) {
      return 1;
    }
    return a.sortOrder - b.sortOrder;
  });
  return uniqueIds(sorted.map(r => r.centerId));
}

/**
 * Ordered gym ids: user_centers → profiles.favorite_gym_ids → optional store fallback.
 */
export async function fetchUserHomeGymIds(
  userId: string,
  storeFallback?: string[] | null,
): Promise<string[]> {
  let ids: string[] = [];
  try {
    const rows = await fetchUserCentersOrdered(userId);
    ids = orderCenterIdsFromRows(rows);
    logHomeGyms('fetchUserHomeGymIds.user_centers', {userId, ids, rows: rows.length});
  } catch (e) {
    logHomeGyms('fetchUserHomeGymIds.user_centers_error', {
      userId,
      message: e instanceof Error ? e.message : String(e),
    });
  }

  if (ids.length === 0) {
    try {
      ids = uniqueIds(await fetchFavoriteGymIdsFromProfile(userId));
      logHomeGyms('fetchUserHomeGymIds.profiles', {userId, ids});
    } catch (e) {
      logHomeGyms('fetchUserHomeGymIds.profiles_error', {
        userId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (ids.length === 0 && storeFallback?.length) {
    ids = uniqueIds(storeFallback);
    logHomeGyms('fetchUserHomeGymIds.store_fallback', {userId, ids});
  }

  return ids;
}

/** Map ids → profile rows; never drops unknown ids (placeholder name instead). */
export function resolveHomeGymCenterRows(centerIds: string[]): ProfileCenterRow[] {
  const ids = uniqueIds(centerIds);
  const rows: ProfileCenterRow[] = [];
  const seen = new Set<string>();

  for (const id of ids) {
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const gym = findGymByIdRelaxed(id);
    if (gym) {
      rows.push({
        centerId: gym.id,
        name: gym.name,
        city: gym.city,
        brand: gym.brand,
      });
    } else {
      rows.push({
        centerId: id,
        name: humanizeCenterId(id),
        city: undefined,
        brand: undefined,
      });
    }
  }

  return rows;
}

export async function loadUserHomeGymCentersForProfile(
  userId: string,
  storeFallback?: string[] | null,
): Promise<ProfileCenterRow[]> {
  const ids = await fetchUserHomeGymIds(userId, storeFallback);
  const rows = resolveHomeGymCenterRows(ids);
  logHomeGyms('loadUserHomeGymCentersForProfile', {userId, ids, rowCount: rows.length});
  return rows;
}

export type SyncHomeGymsResult = {
  savedIds: string[];
  user: User;
};

/**
 * Persist gyms, update Zustand + SecureStorage, emit realtime bridge for Home/Profile.
 */
export async function syncUserHomeGymsAfterSave(
  userId: string,
  orderedCenterIds: string[],
  options?: {skipProfileSync?: boolean},
): Promise<SyncHomeGymsResult> {
  const ids = uniqueIds(orderedCenterIds);
  if (ids.length === 0) {
    throw new Error('At least one home gym is required');
  }

  logHomeGyms('sync.save_start', {userId, ids, primaryId: ids[0]});

  let savedIds: string[];
  try {
    savedIds = await persistUserHomeGyms(userId, ids);
  } catch (e) {
    logHomeGyms('sync.save_failed', {
      userId,
      message: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }

  const state = useAppStore.getState();
  const cur = state.user;
  if (!cur || cur.id !== userId) {
    logHomeGyms('sync.no_current_user', {userId});
    return {savedIds, user: cur as User};
  }

  const updatedUser: User = {
    ...cur,
    favoriteGyms: savedIds,
    updatedAt: new Date(),
  };

  useAppStore.getState().setUser(updatedUser, {
    skipProfileSync: options?.skipProfileSync ?? false,
  });
  emitProfileCentersChanged(userId);

  logHomeGyms('sync.save_done', {
    userId,
    savedIds,
    primaryId: savedIds[0],
  });

  return {savedIds, user: updatedUser};
}
