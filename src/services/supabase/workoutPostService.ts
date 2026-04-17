import {supabase} from '@/services/supabase/supabaseClient';
import {useFeedStore} from '@/store/feedStore';
import type {FeedItem} from '@/store/feedStore';
import type {WorkoutPostRow} from '@/types/post.types';
import {formatRelativeTime} from '@/utils/formatRelativeTime';
const BUCKET = 'workout-images';

async function readImageForUpload(localUri: string): Promise<ArrayBuffer> {
  const res = await fetch(localUri);
  if (!res.ok) {
    throw new Error('Kunne ikke læse billedet.');
  }
  return res.arrayBuffer();
}

export function mapPostRowToFeedItem(row: WorkoutPostRow): FeedItem {
  const workoutInfo = `${row.center_name} · ${row.workout_duration} min · ${row.workout_type}`;
  return {
    id: row.id,
    type: row.image_url ? 'photo' : 'summary',
    userId: row.user_id,
    user: row.author_display_name?.trim() || 'Bruger',
    description: row.caption || '',
    timestamp: formatRelativeTime(new Date(row.created_at)),
    photoUri: row.image_url || undefined,
    workoutInfo,
    rating:
      row.mood_rating != null && row.mood_rating >= 1 && row.mood_rating <= 5
        ? row.mood_rating
        : undefined,
  };
}

export async function fetchWorkoutPosts(): Promise<WorkoutPostRow[]> {
  const {data, error} = await supabase
    .from('posts')
    .select('*')
    .order('created_at', {ascending: false});

  if (error) {
    throw error;
  }
  return (data ?? []) as WorkoutPostRow[];
}

export async function refreshWorkoutFeedFromServer(): Promise<void> {
  const rows = await fetchWorkoutPosts();
  const items = rows.map(mapPostRowToFeedItem);
  useFeedStore.getState().setFeedItems(items);
}

export async function fetchWorkoutPostsForUser(userId: string): Promise<WorkoutPostRow[]> {
  const {data, error} = await supabase
    .from('posts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', {ascending: false});

  if (error) {
    throw error;
  }
  return (data ?? []) as WorkoutPostRow[];
}

export type CreateWorkoutPostParams = {
  userId: string;
  authorDisplayName: string;
  mediaUri?: string;
  caption: string;
  durationMinutes: number;
  centerName: string;
  workoutTypeLabel: string;
  moodRating: number | null;
};

/**
 * Uploads optional image (JPEG path user_id/timestamp.jpg), inserts row, returns feed item.
 */
export async function createWorkoutPost(
  params: CreateWorkoutPostParams,
): Promise<FeedItem> {
  const {
    userId,
    authorDisplayName,
    mediaUri,
    caption,
    durationMinutes,
    centerName,
    workoutTypeLabel,
    moodRating,
  } = params;

  let imageUrl = '';
  if (mediaUri) {
    const path = `${userId}/${Date.now()}.jpg`;
    const body = await readImageForUpload(mediaUri);
    const {error: uploadError} = await supabase.storage
      .from(BUCKET)
      .upload(path, body, {
        contentType: 'image/jpeg',
        upsert: false,
      });
    if (uploadError) {
      throw uploadError;
    }
    const {data: pub} = supabase.storage.from(BUCKET).getPublicUrl(path);
    imageUrl = pub.publicUrl;
  }

  const {data: inserted, error: insertError} = await supabase
    .from('posts')
    .insert({
      user_id: userId,
      image_url: imageUrl,
      caption,
      workout_duration: durationMinutes,
      center_name: centerName,
      workout_type: workoutTypeLabel,
      mood_rating: moodRating,
      author_display_name: authorDisplayName,
    })
    .select()
    .single();

  if (insertError) {
    throw insertError;
  }

  return mapPostRowToFeedItem(inserted as WorkoutPostRow);
}
