import {isDemoContentMode} from '@/demo/demoContentGate';
import {buildDemoFriendsScreenList} from '@/demo/demoFriendsList';
import {listFriendsWithProfiles} from '@/services/supabase/friendService';
import {supabase} from '@/services/supabase/supabaseClient';
import {
  buildDemoWeeklyFriendLeaderboard,
  buildWeeklyFriendLeaderboard,
  type WeeklyFriendLeaderboardEntry,
} from '@/utils/weeklySummary';

const USER_ID_CHUNK = 80;

export async function fetchCheckInCountsByUserIdsInRange(
  userIds: string[],
  start: Date,
  end: Date,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const id of userIds) {
    counts.set(id, 0);
  }
  if (userIds.length === 0) {
    return counts;
  }

  const startIso = start.toISOString();
  const endIso = end.toISOString();

  for (let i = 0; i < userIds.length; i += USER_ID_CHUNK) {
    const chunk = userIds.slice(i, i + USER_ID_CHUNK);
    const {data, error} = await supabase
      .from('check_ins')
      .select('user_id')
      .in('user_id', chunk)
      .not('ended_at', 'is', null)
      .not('started_at', 'is', null)
      .gte('ended_at', startIso)
      .lte('ended_at', endIso);

    if (error) {
      throw error;
    }

    for (const row of data ?? []) {
      const uid = row.user_id as string;
      counts.set(uid, (counts.get(uid) ?? 0) + 1);
    }
  }

  return counts;
}

export async function fetchWeeklyFriendLeaderboard(
  userId: string,
  userDisplayName: string,
  range: {start: Date; end: Date},
  limit = 5,
): Promise<WeeklyFriendLeaderboardEntry[]> {
  if (isDemoContentMode()) {
    const demoFriends = buildDemoFriendsScreenList(userId).map(f => ({
      id: f.id,
      name: f.name,
    }));
    return buildDemoWeeklyFriendLeaderboard(userId, userDisplayName, demoFriends);
  }

  const friends = await listFriendsWithProfiles(userId);
  const participantIds = [userId, ...friends.map(f => f.id)];
  const counts = await fetchCheckInCountsByUserIdsInRange(
    participantIds,
    range.start,
    range.end,
  );

  const entries = [
    {userId, name: userDisplayName, checkInCount: counts.get(userId) ?? 0},
    ...friends.map(f => ({
      userId: f.id,
      name: f.displayName,
      checkInCount: counts.get(f.id) ?? 0,
    })),
  ];

  return buildWeeklyFriendLeaderboard(entries, limit);
}
