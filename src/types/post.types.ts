/**
 * Supabase `public.posts` row (workout feed)
 */

import type {SharedWorkoutSnapshot} from '@/types/personalRecord.types';

export type WorkoutPostRow = {
  id: string;
  user_id: string;
  image_url: string;
  caption: string;
  workout_duration: number;
  center_name: string;
  workout_type: string;
  mood_rating: number | null;
  author_display_name: string;
  author_avatar_url?: string | null;
  created_at: string;
  check_in_id?: string | null;
  workout_snapshot?: SharedWorkoutSnapshot | null;
};
