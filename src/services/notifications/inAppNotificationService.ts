import {supabase} from '@/services/supabase/supabaseClient';
import type {BadgeDefinition} from '@/types/badge.types';

export type InAppNotificationType =
  | 'friend_request'
  | 'friend_request_accepted'
  | 'friend_checked_in'
  | 'badge_unlocked'
  | 'streak_milestone'
  | 'badge_progress'
  | 'planned_workout_invite'
  | 'planned_workout_accepted'
  | 'planned_workout_declined'
  | 'planned_workout_reminder'
  | 'dm_message'
  | 'workout_reminder';

export type NotificationRow = {
  id: string;
  user_id: string;
  actor_user_id: string | null;
  type: InAppNotificationType;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
};

const PAGE = 80;

export async function fetchInAppNotifications(
  userId: string,
): Promise<NotificationRow[]> {
  const {data, error} = await supabase
    .from('notifications')
    .select(
      'id, user_id, actor_user_id, type, title, body, data, is_read, created_at',
    )
    .eq('user_id', userId)
    .order('created_at', {ascending: false})
    .limit(PAGE);
  if (error) {
    if (
      (error as {code?: string}).code === '42P01' ||
      error.message?.includes('relation') ||
      error.message?.includes('does not exist')
    ) {
      return [];
    }
    throw error;
  }
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    user_id: r.user_id as string,
    actor_user_id: (r.actor_user_id as string) ?? null,
    type: (r.type as string) as InAppNotificationType,
    title: r.title as string,
    body: r.body as string,
    data: (r.data as Record<string, unknown>) ?? {},
    is_read: Boolean(r.is_read),
    created_at: r.created_at as string,
  }));
}

export async function getUnreadInAppCount(userId: string): Promise<number> {
  const {count, error} = await supabase
    .from('notifications')
    .select('id', {count: 'exact', head: true})
    .eq('user_id', userId)
    .eq('is_read', false);
  if (error) {
    return 0;
  }
  return count ?? 0;
}

export async function markInAppNotificationRead(
  id: string,
  userId: string,
): Promise<void> {
  const {error} = await supabase
    .from('notifications')
    .update({is_read: true})
    .eq('id', id)
    .eq('user_id', userId);
  if (error) {
    throw error;
  }
}

export async function markAllInAppRead(userId: string): Promise<void> {
  const {error} = await supabase
    .from('notifications')
    .update({is_read: true})
    .eq('user_id', userId)
    .eq('is_read', false);
  if (error) {
    throw error;
  }
}

/** Slet én række (RLS: kun egen bruger) */
export async function deleteInAppNotificationById(
  id: string,
  userId: string,
): Promise<void> {
  const {error} = await supabase
    .from('notifications')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) {
    throw error;
  }
}

function safeTier(p: number): 'p80' | 'p90' {
  return p >= 90 ? 'p90' : 'p80';
}

/** Nær badge uden at spamme (unikt indeks pr. badge + tier i DB) */
export async function tryInsertBadgeProgressNotification(
  userId: string,
  def: BadgeDefinition,
  percent: number,
): Promise<void> {
  if (percent < 80 || percent >= 100) {
    return;
  }
  const tier = safeTier(percent);
  const body =
    percent >= 90
      ? `Kun 1 lille skridt tilbage: ${def.name}`
      : `Du er tæt på badge: ${def.name} (${Math.round(percent)}%)`;
  const {error} = await supabase.from('notifications').insert({
    user_id: userId,
    type: 'badge_progress',
    title: 'Næsten der',
    body,
    data: {
      badgeId: def.id,
      badgeName: def.name,
      progress: percent / 100,
      progressTier: String(tier),
    },
  });
  if (error?.code === '23505') {
    return;
  }
}

export async function insertBadgeUnlockedNotification(
  userId: string,
  def: BadgeDefinition,
): Promise<void> {
  const {error} = await supabase.from('notifications').insert({
    user_id: userId,
    type: 'badge_unlocked',
    title: 'Nyt badge',
    body: `Du har låst et nyt badge op: ${def.name}`,
    data: {badgeId: def.id, badgeName: def.name},
  });
  if (error && error.code !== '23505') {
  }
}

export async function insertStreakMilestoneNotification(
  userId: string,
  streakDays: number,
  def: BadgeDefinition,
): Promise<void> {
  const {error} = await supabase.from('notifications').insert({
    user_id: userId,
    type: 'streak_milestone',
    title: 'Streak',
    body: `Du har ramt en streak på ${streakDays} dage 🔥`,
    data: {streakDays, badgeId: def.id, badgeName: def.name},
  });
  if (error && error.code !== '23505') {
  }
}
