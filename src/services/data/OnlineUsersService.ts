/**
 * "Aktive nu" = venner (eller alle) med **igangværende** træningssession i
 * `workout_live_sessions` (synlige rækker med frisk heartbeat), ikke gammel check_in.
 */

import {getMyFriendIds} from '@/services/supabase/friendService';
import {fetchVisibleLiveSessions} from '@/services/supabase/liveWorkoutSessionService';
import type {OnlineUser} from '@/types/online.types';

export interface GetOnlineUsersOptions {
  filter?: 'alle' | 'venner';
}

export async function getOnlineUsers(
  userId: string,
  options: GetOnlineUsersOptions = {},
): Promise<OnlineUser[]> {
  const filter = options.filter ?? 'venner';
  const friendIds = await getMyFriendIds(userId);
  let liveRows: Awaited<ReturnType<typeof fetchVisibleLiveSessions>> = [];
  try {
    liveRows = await fetchVisibleLiveSessions();
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (msg.toLowerCase().includes('workout_live_sessions') || msg.includes('relation')) {
      return [];
    }
    throw e;
  }
  const out: OnlineUser[] = [];

  for (const r of liveRows) {
    if (r.user_id === userId) {
      continue;
    }
    if (filter === 'venner' && !friendIds.has(r.user_id)) {
      continue;
    }
    const gid = r.gym_id != null && String(r.gym_id) !== '' ? String(r.gym_id) : undefined;
    const start = new Date(r.started_at).getTime();
    const minutesSinceStart = Math.max(0, Math.floor((Date.now() - start) / 60_000));
    out.push({
      userId: r.user_id,
      displayName: r.user_display_name?.trim() || 'Bruger',
      gymName: r.gym_name,
      gymId: gid,
      city: r.city ?? undefined,
      lastActive: new Date(r.started_at),
      status: 'training_now',
      activeMinutesAgo: minutesSinceStart,
      muscleGroup: r.workout_type ?? undefined,
      isFriend: friendIds.has(r.user_id),
    });
  }

  out.sort(
    (a, b) =>
      b.lastActive.getTime() - a.lastActive.getTime() ||
      a.displayName.localeCompare(b.displayName, 'da'),
  );
  return out;
}
