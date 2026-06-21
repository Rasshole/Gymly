import {supabase} from '@/services/supabase/supabaseClient';
import type {RealtimeChannel} from '@supabase/supabase-js';

export type PostCommentRow = {
  id: string;
  postId: string;
  userId: string;
  authorName: string;
  body: string;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
};

export type CommentLikeState = {
  commentId: string;
  count: number;
  likedByMe: boolean;
};

export async function fetchPostComments(
  postIds: string[],
  currentUserId: string,
): Promise<Record<string, PostCommentRow[]>> {
  if (!postIds.length || !currentUserId) {
    return {};
  }
  const uniquePostIds = Array.from(new Set(postIds));

  const {data: comments, error} = await supabase
    .from('post_comments')
    .select('id, post_id, user_id, body, created_at')
    .in('post_id', uniquePostIds)
    .is('deleted_at', null)
    .order('created_at', {ascending: true});

  if (error) {
    throw new Error(error.message || 'Could not load comments.');
  }

  const rows = (comments ?? []) as Array<{
    id: string;
    post_id: string;
    user_id: string;
    body: string;
    created_at: string;
  }>;

  const commentIds = rows.map(r => r.id);
  const likeByComment: Record<string, CommentLikeState> = {};

  if (commentIds.length > 0) {
    const {data: likes, error: likesError} = await supabase
      .from('comment_likes')
      .select('comment_id, user_id')
      .in('comment_id', commentIds);

    if (likesError) {
      throw new Error(likesError.message || 'Could not load comment likes.');
    }

    for (const id of commentIds) {
      likeByComment[id] = {commentId: id, count: 0, likedByMe: false};
    }
    for (const like of (likes ?? []) as Array<{comment_id: string; user_id: string}>) {
      const cur = likeByComment[like.comment_id];
      if (!cur) {
        continue;
      }
      cur.count += 1;
      if (like.user_id === currentUserId) {
        cur.likedByMe = true;
      }
    }
  }

  const userIds = Array.from(new Set(rows.map(r => r.user_id)));
  const profileById = await fetchProfileNames(userIds);

  const result: Record<string, PostCommentRow[]> = {};
  for (const postId of uniquePostIds) {
    result[postId] = [];
  }

  for (const row of rows) {
    const likes = likeByComment[row.id] ?? {count: 0, likedByMe: false};
    result[row.post_id].push({
      id: row.id,
      postId: row.post_id,
      userId: row.user_id,
      authorName: profileById.get(row.user_id) ?? 'User',
      body: row.body,
      createdAt: row.created_at,
      likeCount: likes.count,
      likedByMe: likes.likedByMe,
    });
  }

  return result;
}

async function fetchProfileNames(userIds: string[]): Promise<Map<string, string>> {
  if (!userIds.length) {
    return new Map();
  }
  const {data, error} = await supabase
    .from('profiles')
    .select('id, display_name, username')
    .in('id', userIds);

  if (error) {
    return new Map();
  }

  return new Map(
    ((data ?? []) as Array<{
      id: string;
      display_name: string | null;
      username: string | null;
    }>).map(p => [
      p.id,
      p.display_name?.trim() || p.username?.trim() || 'User',
    ]),
  );
}

export async function createPostComment(
  postId: string,
  body: string,
): Promise<PostCommentRow> {
  const {data, error} = await supabase.rpc('create_post_comment', {
    p_post_id: postId,
    p_body: body.trim(),
  });

  if (error) {
    throw new Error(error.message || 'Could not post comment.');
  }

  const row = data as {
    id: string;
    post_id: string;
    user_id: string;
    body: string;
    created_at: string;
  };

  const names = await fetchProfileNames([row.user_id]);
  return {
    id: row.id,
    postId: row.post_id,
    userId: row.user_id,
    authorName: names.get(row.user_id) ?? 'User',
    body: row.body,
    createdAt: row.created_at,
    likeCount: 0,
    likedByMe: false,
  };
}

export async function toggleCommentBiceps(
  commentId: string,
): Promise<{reacted: boolean; count: number}> {
  const {data, error} = await supabase.rpc('toggle_comment_biceps', {
    p_comment_id: commentId,
  });

  if (error) {
    throw new Error(error.message || 'Could not update comment like.');
  }

  const result = Array.isArray(data) ? data[0] : data;
  return {
    reacted: Boolean(result?.reacted),
    count: Number(result?.reactions_count ?? 0),
  };
}

type PostEngagementListener = {
  onComments?: (postId: string) => void;
  onCommentLikes?: (commentId: string, postId?: string) => void;
};

let engagementChannel: RealtimeChannel | null = null;
let engagementRefCount = 0;
const engagementListeners = new Set<PostEngagementListener>();

function notifyComments(postId: string) {
  for (const l of engagementListeners) {
    try {
      l.onComments?.(postId);
    } catch {
      // ignore
    }
  }
}

function notifyCommentLikes(commentId: string, postId?: string) {
  for (const l of engagementListeners) {
    try {
      l.onCommentLikes?.(commentId, postId);
    } catch {
      // ignore
    }
  }
}

function ensureEngagementChannel() {
  if (engagementChannel) {
    return;
  }
  engagementChannel = supabase
    .channel('post_engagement_shared')
    .on(
      'postgres_changes',
      {event: '*', schema: 'public', table: 'post_comments'},
      payload => {
        const newPostId = (payload.new as {post_id?: string} | null)?.post_id;
        const oldPostId = (payload.old as {post_id?: string} | null)?.post_id;
        if (newPostId) {
          notifyComments(newPostId);
        }
        if (oldPostId && oldPostId !== newPostId) {
          notifyComments(oldPostId);
        }
      },
    )
    .on(
      'postgres_changes',
      {event: '*', schema: 'public', table: 'comment_likes'},
      payload => {
        const newCommentId = (payload.new as {comment_id?: string} | null)?.comment_id;
        const oldCommentId = (payload.old as {comment_id?: string} | null)?.comment_id;
        const id = newCommentId ?? oldCommentId;
        if (id) {
          notifyCommentLikes(id);
        }
      },
    )
    .subscribe();
}

export function subscribePostEngagementRealtime(
  listener: PostEngagementListener,
): () => void {
  engagementRefCount += 1;
  engagementListeners.add(listener);
  ensureEngagementChannel();
  return () => {
    engagementListeners.delete(listener);
    engagementRefCount -= 1;
    if (engagementRefCount <= 0 && engagementChannel) {
      void supabase.removeChannel(engagementChannel);
      engagementChannel = null;
    }
  };
}

/** UI-friendly comment shape used in feed screens */
export type FeedComment = {
  id: string;
  author: string;
  text: string;
  userId?: string;
  likeCount: number;
  likedByMe: boolean;
  pending?: boolean;
};

export function toFeedComments(rows: PostCommentRow[]): FeedComment[] {
  return rows.map(r => ({
    id: r.id,
    author: r.authorName,
    text: r.body,
    userId: r.userId,
    likeCount: r.likeCount,
    likedByMe: r.likedByMe,
  }));
}
