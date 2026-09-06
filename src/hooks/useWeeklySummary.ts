import {useCallback, useEffect, useMemo, useState} from 'react';
import type {ProfileCompletedSession} from '@/services/supabase/profileCheckInHistory';
import {fetchWeeklyFriendLeaderboard} from '@/services/supabase/weeklySummaryService';
import {
  computePersonalWeeklySummary,
  getWeeklySummaryRange,
  type PersonalWeeklySummary,
  type WeeklyFriendLeaderboardEntry,
} from '@/utils/weeklySummary';

type WeeklySummaryState = {
  range: {start: Date; end: Date};
  personal: PersonalWeeklySummary;
  friends: WeeklyFriendLeaderboardEntry[];
  friendsLoading: boolean;
  friendsError: string | null;
  refreshFriends: () => Promise<void>;
};

export function useWeeklySummary(
  userId: string | undefined,
  userDisplayName: string,
  sessions: ProfileCompletedSession[],
  currentStreak: number,
  enabled: boolean,
): WeeklySummaryState {
  const range = useMemo(() => getWeeklySummaryRange(), []);

  const personal = useMemo(
    () => computePersonalWeeklySummary(sessions, range, currentStreak),
    [sessions, range, currentStreak],
  );

  const [friends, setFriends] = useState<WeeklyFriendLeaderboardEntry[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsError, setFriendsError] = useState<string | null>(null);

  const refreshFriends = useCallback(async () => {
    if (!userId || !enabled) {
      setFriends([]);
      setFriendsError(null);
      setFriendsLoading(false);
      return;
    }
    setFriendsLoading(true);
    setFriendsError(null);
    try {
      const rows = await fetchWeeklyFriendLeaderboard(
        userId,
        userDisplayName,
        range,
      );
      setFriends(rows);
    } catch (e) {
      setFriends([]);
      setFriendsError(e instanceof Error ? e.message : String(e));
    } finally {
      setFriendsLoading(false);
    }
  }, [userId, userDisplayName, range, enabled]);

  useEffect(() => {
    void refreshFriends();
  }, [refreshFriends]);

  return {
    range,
    personal,
    friends,
    friendsLoading,
    friendsError,
    refreshFriends,
  };
}
