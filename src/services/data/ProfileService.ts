/**
 * Profile Service – stats, badges og visning fra Firestore + badgeStore
 */

import {BADGE_BY_ID} from '@/config/badgeDefinitions';
import {getUserStats} from '@/services/firestore/UserService';
import {getMyFriendIds} from '@/services/supabase/friendService';
import {useBadgeStore} from '@/store/badgeStore';
import type {
  ProfileStats,
  ProfileBadge,
  ProfileDisplay,
  WeeklyStats,
  Milestone,
} from '@/types/profile.types';

export async function getProfileStats(userId: string): Promise<ProfileStats> {
  const fromDb = await getUserStats(userId);
  let friendsCount = fromDb?.friendsCount ?? 0;
  try {
    const ids = await getMyFriendIds(userId);
    friendsCount = ids.size;
  } catch {
    /* Supabase ikke tilgængelig — behold Firestore */
  }
  if (fromDb) {
    return {
      totalCheckIns: fromDb.totalCheckIns ?? 0,
      currentStreak: fromDb.streak ?? 0,
      longestStreak: fromDb.longestStreak ?? fromDb.streak ?? 0,
      totalTrainingMinutes: fromDb.totalTrainingMinutes ?? 0,
      badgesCount: fromDb.badgesCount ?? 0,
      friendsCount,
      followersCount: fromDb.followersCount ?? 0,
      followingCount: fromDb.followingCount ?? 0,
    };
  }
  return {
    totalCheckIns: 0,
    currentStreak: 0,
    longestStreak: 0,
    totalTrainingMinutes: 0,
    badgesCount: 0,
    friendsCount,
    followersCount: 0,
    followingCount: 0,
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
  const fromDb = await getUserStats(userId);
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
  const fromDb = await getUserStats(userId);
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
