import {supabase} from '@/services/supabase/supabaseClient';
import {
  logRealtimeEvent,
  logRealtimeStore,
  logRealtimeSubscribed,
} from '@/realtime/realtimeDebug';
import {useFeedStore} from '@/store/feedStore';
import type {FeedItem} from '@/store/feedStore';
import type {WorkoutPostRow} from '@/types/post.types';
import {formatRelativeTime} from '@/utils/formatRelativeTime';
import {withAvatarCacheBust} from '../../utils/avatar';
import {formatGymNameWithBrand} from '@/utils/gymDisplay';
import {detectGymChain} from '@/services/gymLogoService';
const BUCKET = 'workout-images';

async function readImageForUpload(localUri: string): Promise<ArrayBuffer> {
  const res = await fetch(localUri);
  if (!res.ok) {
    throw new Error('Kunne ikke læse billedet.');
  }
  return res.arrayBuffer();
}

export function mapPostRowToFeedItem(row: WorkoutPostRow): FeedItem {
  const centerRaw = (row.center_name ?? '').trim();
  const centerBrand = centerRaw ? detectGymChain(undefined, centerRaw).displayName : '';
  const centerLabel = centerRaw
    ? formatGymNameWithBrand(centerRaw, centerBrand)
    : 'Center';
  const workoutInfo = `${centerLabel} · ${row.workout_duration} min · ${row.workout_type}`;
  return {
    id: row.id,
    type: row.image_url ? 'photo' : 'summary',
    userId: row.user_id,
    user: row.author_display_name?.trim() || 'Bruger',
    userAvatarUrl: row.author_avatar_url || undefined,
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
  const rows = (data ?? []) as WorkoutPostRow[];
  const ids = Array.from(new Set(rows.map(r => r.user_id).filter(Boolean)));
  if (!ids.length) {
    return rows;
  }
  const {data: profiles} = await supabase
    .from('profiles')
    .select('id, avatar_url, updated_at')
    .in('id', ids);
  const byId = new Map(
    ((profiles ?? []) as Array<{id: string; avatar_url: string | null; updated_at: string | null}>).map(
      p => [p.id, withAvatarCacheBust(p.avatar_url, p.updated_at)],
    ),
  );
  return rows.map(r => ({
    ...r,
    author_avatar_url: byId.get(r.user_id) ?? null,
  }));
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

// --- Realtime: én delt kanal, refcount når Home m.fl. lytter ---

const feedChannelListeners = new Set<() => void>();
let postsFeedChannel: ReturnType<typeof supabase.channel> | null = null;
let postsFeedRefCount = 0;

function notifyPostsFeedSideEffects() {
  for (const fn of feedChannelListeners) {
    try {
      fn();
    } catch (e) {
      console.warn('[workout feed realtime]', e);
    }
  }
}

function ensurePostsFeedChannel() {
  if (postsFeedChannel) {
    return;
  }
  postsFeedChannel = supabase
    .channel('workout_posts_shared')
    .on(
      'postgres_changes',
      {event: '*', schema: 'public', table: 'posts'},
      () => {
        logRealtimeEvent('workout_posts_shared', 'posts', '*', undefined);
        void (async () => {
          try {
            await refreshWorkoutFeedFromServer();
          } finally {
            notifyPostsFeedSideEffects();
            logRealtimeStore('posts', 'feed_refresh');
          }
        })();
      },
    )
    .subscribe(status => {
      if (status === 'SUBSCRIBED') {
        logRealtimeSubscribed('workout_posts_shared', 'posts');
      }
    });
}

/**
 * Nyt/ændret/slettet indlæg i `posts` → genindlæs feed (Zustand).
 * @param onUpdate valgfri ekstra callback efter refresh (fx animation).
 */
export function subscribeWorkoutFeedRealtime(onUpdate?: () => void): () => void {
  postsFeedRefCount += 1;
  if (onUpdate) {
    feedChannelListeners.add(onUpdate);
  }
  ensurePostsFeedChannel();
  return () => {
    postsFeedRefCount -= 1;
    if (onUpdate) {
      feedChannelListeners.delete(onUpdate);
    }
    if (postsFeedRefCount <= 0 && postsFeedChannel) {
      void supabase.removeChannel(postsFeedChannel);
      postsFeedChannel = null;
    }
  };
}
