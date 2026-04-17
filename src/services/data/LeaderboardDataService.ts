/**
 * Leaderboard Data Service — forhåndsvisning (fx Hjem) fra Firestore
 */

import {fetchGlobalLeaderboard} from '@/services/leaderboard/leaderboardService';
import type {LeaderboardCategory, LeaderboardPeriod} from '@/types/leaderboard.types';

export interface LeaderboardEntrySimple {
  userId: string;
  displayName: string;
  profileImageUrl?: string;
  rank: number;
  value: number;
  valueLabel: string;
  gymName?: string;
  city?: string;
  streak?: number;
  isCurrentUser?: boolean;
  isFriend?: boolean;
  isWeeklyChampion?: boolean;
}

export async function getLeaderboardEntriesPreview(
  userId: string,
  limit = 3,
): Promise<LeaderboardEntrySimple[]> {
  if (!userId) {
    return [];
  }
  const {entries} = await fetchGlobalLeaderboard(
    'checkIns',
    'week' as LeaderboardPeriod,
    userId,
    limit,
  );
  return entries.map(e => ({
    userId: e.userId,
    displayName: e.displayName,
    profileImageUrl: e.profileImageUrl,
    rank: e.rank,
    value: e.value,
    valueLabel: e.valueLabel,
    gymName: e.gymName,
    isCurrentUser: e.isCurrentUser,
    isFriend: e.isFriend,
    isWeeklyChampion: e.isWeeklyChampion,
  }));
}
