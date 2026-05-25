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
import {getRuntimeLanguage} from '@/i18n/runtimeLanguage';
import {withAvatarCacheBust} from '../../utils/avatar';
import {formatGymNameWithBrand} from '@/utils/gymDisplay';
import {detectGymChain} from '@/services/gymLogoService';
import {isLikelyServerPostUuid, isLocalDemoPostId} from '@/utils/postIds';
const BUCKET = 'workout-images';

function workoutImageStoragePathFromPublicUrl(publicUrl: string): string | null {
  const marker = '/workout-images/';
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) {
    return null;
  }
  return decodeURIComponent(publicUrl.slice(idx + marker.length).split('?')[0]);
}

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
    timestamp: formatRelativeTime(new Date(row.created_at), getRuntimeLanguage()),
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

async function fetchAcceptedFriendIds(currentUserId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  const {data, error} = await supabase
    .from('friendships')
    .select('user_a, user_b')
    .or(`user_a.eq.${currentUserId},user_b.eq.${currentUserId}`);
  if (error) {
    return ids;
  }
  for (const row of data ?? []) {
    const a = row.user_a as string;
    const b = row.user_b as string;
    ids.add(a === currentUserId ? b : a);
  }
  return ids;
}

async function fetchBlockedUserIds(currentUserId: string): Promise<Set<string>> {
  const blocked = new Set<string>();
  const candidates: Array<{table: string; from: string; to: string}> = [
    {table: 'user_blocks', from: 'blocker_id', to: 'blocked_user_id'},
    {table: 'user_blocks', from: 'blocker_id', to: 'blocked_id'},
    {table: 'blocked_users', from: 'user_id', to: 'blocked_user_id'},
    {table: 'blocks', from: 'blocker_id', to: 'blocked_id'},
  ];

  for (const candidate of candidates) {
    const {data, error} = await supabase
      .from(candidate.table)
      .select(`${candidate.from}, ${candidate.to}`)
      .or(`${candidate.from}.eq.${currentUserId},${candidate.to}.eq.${currentUserId}`)
      .limit(500);
    if (error || !data) {
      continue;
    }
    for (const row of data as Array<Record<string, unknown>>) {
      const fromId = row[candidate.from];
      const toId = row[candidate.to];
      if (fromId === currentUserId && typeof toId === 'string' && toId) {
        blocked.add(toId);
      }
      if (toId === currentUserId && typeof fromId === 'string' && fromId) {
        blocked.add(fromId);
      }
    }
  }
  return blocked;
}

async function buildHomeFeedAllowedUserIds(currentUserId: string): Promise<Set<string>> {
  const [friends, blocked] = await Promise.all([
    fetchAcceptedFriendIds(currentUserId),
    fetchBlockedUserIds(currentUserId),
  ]);
  const allowed = new Set<string>([currentUserId, ...friends]);
  blocked.forEach(id => allowed.delete(id));
  return allowed;
}

export async function fetchWorkoutPostsForHomeFeed(
  currentUserId: string,
): Promise<WorkoutPostRow[]> {
  const allowed = await buildHomeFeedAllowedUserIds(currentUserId);
  const allowedIds = [...allowed];
  if (!allowedIds.length) {
    return [];
  }
  const {data, error} = await supabase
    .from('posts')
    .select('*')
    .in('user_id', allowedIds)
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

export async function refreshWorkoutFeedFromServerForHome(
  currentUserId: string,
): Promise<void> {
  if (!currentUserId) {
    useFeedStore.getState().setFeedItems([]);
    return;
  }
  const rows = await fetchWorkoutPostsForHomeFeed(currentUserId);
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

/**
 * Sletter et workout-opslag: demo-id rydder kun Zustand-feed;
 * Supabase-id sletter række (RLS: egen bruger) og forsøger at fjerne billede i storage.
 */
export async function deleteWorkoutPostForUser(
  postId: string,
  authorUserId: string,
  imagePublicUrl?: string | null,
): Promise<{ok: boolean; message?: string}> {
  if (isLocalDemoPostId(postId)) {
    useFeedStore.getState().deleteFeedItem(postId);
    return {ok: true};
  }

  if (!isLikelyServerPostUuid(postId)) {
    useFeedStore.getState().deleteFeedItem(postId);
    return {ok: true};
  }

  const {data: authData} = await supabase.auth.getUser();
  const uid = authData?.user?.id;
  if (!uid || uid !== authorUserId) {
    return {ok: false, message: 'Ingen adgang.'};
  }

  const {error} = await supabase.from('posts').delete().eq('id', postId);
  if (error) {
    return {ok: false, message: error.message};
  }

  useFeedStore.getState().deleteFeedItem(postId);

  if (imagePublicUrl) {
    const path = workoutImageStoragePathFromPublicUrl(imagePublicUrl);
    if (path) {
      const {error: rmErr} = await supabase.storage.from(BUCKET).remove([path]);
      if (rmErr) {
        console.warn('[deleteWorkoutPostForUser] storage remove', rmErr.message);
      }
    }
  }

  return {ok: true};
}

/**
 * Indsend anmeldelse af andres opslag. Demo-/aktivitets-id: ingen DB-kald.
 */
export async function submitPostReport(postId: string): Promise<{ok: boolean; message?: string}> {
  if (isLocalDemoPostId(postId) || !isLikelyServerPostUuid(postId)) {
    return {ok: true};
  }

  const {data: authData} = await supabase.auth.getUser();
  const reporterId = authData?.user?.id;
  if (!reporterId) {
    return {ok: false, message: 'Ikke logget ind.'};
  }

  const {error} = await supabase.from('post_reports').insert({
    post_id: postId,
    reporter_id: reporterId,
  });

  if (error) {
    if (error.code === '23505') {
      return {ok: true};
    }
    if (error.code === '42P01' || error.message?.includes('post_reports')) {
      return {ok: false, message: 'Rapportering er ikke tilgængelig lige nu.'};
    }
    return {ok: false, message: error.message};
  }

  return {ok: true};
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

const homeFeedListeners = new Set<() => void>();
let homePostsChannel: ReturnType<typeof supabase.channel> | null = null;
let homeFeedRefCount = 0;
let homeFeedUserId: string | null = null;
let homeFeedAllowedIds = new Set<string>();

function notifyHomeFeedSideEffects() {
  for (const fn of homeFeedListeners) {
    try {
      fn();
    } catch (e) {
      console.warn('[home workout feed realtime]', e);
    }
  }
}

async function refreshHomeAllowedIds(): Promise<void> {
  if (!homeFeedUserId) {
    homeFeedAllowedIds = new Set<string>();
    return;
  }
  homeFeedAllowedIds = await buildHomeFeedAllowedUserIds(homeFeedUserId);
}

function ensureHomePostsChannel(currentUserId: string) {
  homeFeedUserId = currentUserId;
  if (homePostsChannel) {
    return;
  }
  void refreshHomeAllowedIds();
  homePostsChannel = supabase
    .channel('workout_posts_home_only')
    .on(
      'postgres_changes',
      {event: '*', schema: 'public', table: 'posts'},
      payload => {
        const candidateIds = [
          (payload.new as {user_id?: string} | null)?.user_id,
          (payload.old as {user_id?: string} | null)?.user_id,
        ].filter(Boolean) as string[];
        const shouldRefresh =
          candidateIds.length === 0 ||
          candidateIds.some(id => homeFeedAllowedIds.has(id));
        if (!shouldRefresh || !homeFeedUserId) {
          return;
        }
        logRealtimeEvent('workout_posts_home_only', 'posts', '*', homeFeedUserId);
        void (async () => {
          try {
            await refreshHomeAllowedIds();
            await refreshWorkoutFeedFromServerForHome(homeFeedUserId!);
          } finally {
            notifyHomeFeedSideEffects();
            logRealtimeStore('posts', 'home_feed_refresh');
          }
        })();
      },
    )
    .subscribe(status => {
      if (status === 'SUBSCRIBED') {
        logRealtimeSubscribed('workout_posts_home_only', 'posts');
      }
    });
}

export function subscribeWorkoutFeedRealtimeForHome(
  currentUserId: string,
  onUpdate?: () => void,
): () => void {
  if (!currentUserId) {
    return () => {};
  }
  homeFeedRefCount += 1;
  if (onUpdate) {
    homeFeedListeners.add(onUpdate);
  }
  ensureHomePostsChannel(currentUserId);
  return () => {
    homeFeedRefCount -= 1;
    if (onUpdate) {
      homeFeedListeners.delete(onUpdate);
    }
    if (homeFeedRefCount <= 0 && homePostsChannel) {
      void supabase.removeChannel(homePostsChannel);
      homePostsChannel = null;
      homeFeedUserId = null;
      homeFeedAllowedIds = new Set<string>();
    }
  };
}
