import {supabase} from '@/services/supabase/supabaseClient';

export type UserBadgeRow = {
  id: string;
  user_id: string;
  badge_id: string;
  progress: number;
  unlocked_at: string | null;
};

export async function fetchUserBadges(userId: string): Promise<UserBadgeRow[]> {
  const {data, error} = await supabase
    .from('user_badges')
    .select('id, user_id, badge_id, progress, unlocked_at')
    .eq('user_id', userId);
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
    badge_id: r.badge_id as string,
    progress: Number(r.progress ?? 0),
    unlocked_at: (r.unlocked_at as string | null) ?? null,
  }));
}

export type UserBadgeUpsertInput = {
  user_id: string;
  badge_id: string;
  progress: number;
  unlocked_at: string | null;
};

export async function upsertUserBadges(
  rows: UserBadgeUpsertInput[],
): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  const {error} = await supabase.from('user_badges').upsert(rows, {
    onConflict: 'user_id,badge_id',
  });
  if (error) {
    if (
      (error as {code?: string}).code === '42P01' ||
      error.message?.includes('relation') ||
      error.message?.includes('does not exist')
    ) {
      return;
    }
    throw error;
  }
}
