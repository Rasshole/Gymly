/**
 * Supabase `public.posts` row (workout feed)
 */

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
  created_at: string;
};
