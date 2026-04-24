import {supabase} from '@/services/supabase/supabaseClient';

export type NotificationPreferences = {
  user_id: string;
  push_enabled: boolean;
  messages_enabled: boolean;
  friend_requests_enabled: boolean;
  check_ins_enabled: boolean;
  badges_streaks_enabled: boolean;
  planned_workouts_enabled: boolean;
  workout_reminders_enabled: boolean;
  updated_at: string;
};

const defaults: Omit<NotificationPreferences, 'user_id' | 'updated_at'> = {
  push_enabled: true,
  messages_enabled: true,
  friend_requests_enabled: true,
  check_ins_enabled: true,
  badges_streaks_enabled: true,
  planned_workouts_enabled: true,
  workout_reminders_enabled: true,
};

export async function fetchNotificationPreferences(
  userId: string,
): Promise<NotificationPreferences> {
  const {data, error} = await supabase
    .from('notification_preferences')
    .select(
      'user_id, push_enabled, messages_enabled, friend_requests_enabled, check_ins_enabled, badges_streaks_enabled, planned_workouts_enabled, workout_reminders_enabled, updated_at',
    )
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    return {
      user_id: userId,
      ...defaults,
      updated_at: new Date().toISOString(),
    };
  }
  return data as NotificationPreferences;
}

export async function upsertNotificationPreferences(
  userId: string,
  patch: Partial<
    Pick<
      NotificationPreferences,
      | 'push_enabled'
      | 'messages_enabled'
      | 'friend_requests_enabled'
      | 'check_ins_enabled'
      | 'badges_streaks_enabled'
      | 'planned_workouts_enabled'
      | 'workout_reminders_enabled'
    >
  >,
): Promise<void> {
  const {error} = await supabase.from('notification_preferences').upsert(
    {
      user_id: userId,
      ...defaults,
      ...patch,
      updated_at: new Date().toISOString(),
    },
    {onConflict: 'user_id'},
  );
  if (error) {
    throw error;
  }
}

export async function ensureDefaultNotificationPreferences(
  userId: string,
): Promise<void> {
  const {data} = await supabase
    .from('notification_preferences')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (data) {
    return;
  }
  await upsertNotificationPreferences(userId, {});
}
