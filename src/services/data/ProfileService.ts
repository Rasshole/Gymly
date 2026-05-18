/**
 * Profile Service – stats, badges og visning fra Firestore + badgeStore
 */

import {BADGE_BY_ID} from '@/config/badgeDefinitions';
import {isFirebaseNativeAvailable} from '@/services/firebase/nativeAvailability';
import {getUserStats as getFirestoreUserStats} from '@/services/firestore/UserService';
import {getMyFriendIds} from '@/services/supabase/friendService';
import {fetchUserBadges} from '@/services/supabase/userBadgesService';
import {getUserStats as getSupabaseUserStats} from '@/services/supabase/userStatsService';
import {useBadgeStore} from '@/store/badgeStore';
import type {
  ProfileStats,
  ProfileBadge,
  ProfileDisplay,
  WeeklyStats,
  Milestone,
} from '@/types/profile.types';

export async function getProfileStats(userId: string): Promise<ProfileStats> {
  let friendsCount = 0;
  try {
    const ids = await getMyFriendIds(userId);
    friendsCount = ids.size;
  } catch {
    /* ignore */
  }

  let trainingFromSupabase: Awaited<ReturnType<typeof getSupabaseUserStats>> | null =
    null;
  try {
    trainingFromSupabase = await getSupabaseUserStats(userId);
  } catch {
    trainingFromSupabase = null;
  }

  let fromFirestore: Awaited<ReturnType<typeof getFirestoreUserStats>> | null = null;
  if (isFirebaseNativeAvailable()) {
    try {
      fromFirestore = await getFirestoreUserStats(userId);
    } catch {
      fromFirestore = null;
    }
  }

  let badgesCount = 0;
  try {
    const badges = await fetchUserBadges(userId);
    badgesCount = badges.filter(b => Boolean(b.unlocked_at)).length;
  } catch {
    badgesCount = fromFirestore?.badgesCount ?? 0;
  }

  const training =
    trainingFromSupabase ??
    {
      totalCheckIns: fromFirestore?.totalCheckIns ?? 0,
      currentStreak: fromFirestore?.streak ?? 0,
      longestStreak: fromFirestore?.longestStreak ?? fromFirestore?.streak ?? 0,
      totalTrainingMinutes: fromFirestore?.totalTrainingMinutes ?? 0,
    };

  return {
    totalCheckIns: training.totalCheckIns,
    currentStreak: training.currentStreak,
    longestStreak: training.longestStreak,
    totalTrainingMinutes: training.totalTrainingMinutes,
    badgesCount: badgesCount || fromFirestore?.badgesCount || 0,
    friendsCount,
    followersCount: fromFirestore?.followersCount ?? 0,
    followingCount: fromFirestore?.followingCount ?? 0,
  };
}

export async function getProfileBadges(userId: string): Promise<ProfileBadge[]> {
  const records = useBadgeStore.getState().getUnlockedRecords(userId);
  const out: ProfileBadge[] = [];
  for (const r of records) {
    const def = BADGE_BY_ID[r.badgeId];
    if (!def) {
      continue;
    }
    out.push({
      id: def.id,
      name: def.name,
      description: def.description,
      icon: def.emoji ?? '🏅',
      category: def.category,
      unlockedAt: new Date(r.unlockedAt),
    });
  }
  return out;
}

export async function getProfileDisplay(userId: string): Promise<ProfileDisplay> {
  const fromDb = isFirebaseNativeAvailable()
    ? await getFirestoreUserStats(userId).catch(() => null)
    : null;
  if (!fromDb) {
    return {};
  }
  return {
    bio: fromDb.bio,
    primaryGym: fromDb.homeGym,
    city: fromDb.city,
  };
}

export async function getWeeklyStats(userId: string): Promise<WeeklyStats> {
  const fromDb = isFirebaseNativeAvailable()
    ? await getFirestoreUserStats(userId).catch(() => null)
    : null;
  return {
    checkInsThisWeek: fromDb?.weeklyCheckins ?? 0,
    trainingMinutesThisWeek: fromDb?.weeklyMinutes ?? 0,
    rankThisWeek: 0,
    rankAboveUser: 0,
    checkInsToTop10: 0,
    checkInsToOvertake: 0,
  };
}

/** @deprecated Brug getWeeklyStats — milestones kommer fra backend senere */
export async function getMilestones(_userId: string): Promise<Milestone[]> {
  return [];
}
