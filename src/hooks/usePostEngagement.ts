import {useCallback, useEffect, useRef, useState} from 'react';
import {isDemoContentMode} from '@/demo/demoContentGate';
import {
  createPostComment,
  fetchPostComments,
  subscribePostEngagementRealtime,
  toggleCommentBiceps,
  toFeedComments,
  type FeedComment,
} from '@/services/supabase/postEngagementService';
import {
  fetchPostBicepsStates,
  subscribePostBicepsRealtime,
  togglePostBicepsReaction,
} from '@/services/supabase/workoutReactionService';

export type PostReactionState = {liked: boolean; likes: number};

export function usePostEngagement(
  postIds: string[],
  currentUserId: string | undefined,
) {
  const [reactions, setReactions] = useState<Record<string, PostReactionState>>({});
  const [commentsByPost, setCommentsByPost] = useState<Record<string, FeedComment[]>>({});
  const [submittingComment, setSubmittingComment] = useState(false);

  const reactionsRef = useRef(reactions);
  const commentsRef = useRef(commentsByPost);
  const busyPostsRef = useRef(new Set<string>());
  const busyCommentsRef = useRef(new Set<string>());
  const pendingCommentIdsRef = useRef(new Set<string>());

  useEffect(() => {
    reactionsRef.current = reactions;
  }, [reactions]);

  useEffect(() => {
    commentsRef.current = commentsByPost;
  }, [commentsByPost]);

  const postIdKey = postIds.join(',');

  const applyReactionStates = useCallback(
    (states: Record<string, {count: number; reactedByMe: boolean}>) => {
      setReactions(prev => {
        const next = {...prev};
        for (const id of postIds) {
          if (busyPostsRef.current.has(id)) {
            continue;
          }
          const state = states[id];
          if (state) {
            next[id] = {liked: state.reactedByMe, likes: state.count};
          } else if (!(id in next)) {
            next[id] = {liked: false, likes: 0};
          }
        }
        return next;
      });
    },
    [postIds],
  );

  const reloadReactions = useCallback(
    async (ids: string[]) => {
      if (!currentUserId || !ids.length || isDemoContentMode()) {
        return;
      }
      const states = await fetchPostBicepsStates(ids, currentUserId);
      const mapped: Record<string, {count: number; reactedByMe: boolean}> = {};
      for (const id of ids) {
        mapped[id] = {
          count: states[id]?.count ?? 0,
          reactedByMe: states[id]?.reactedByMe ?? false,
        };
      }
      applyReactionStates(mapped);
    },
    [currentUserId, applyReactionStates],
  );

  const reloadComments = useCallback(
    async (ids: string[]) => {
      if (!currentUserId || !ids.length || isDemoContentMode()) {
        return;
      }
      const rows = await fetchPostComments(ids, currentUserId);
      setCommentsByPost(prev => {
        const next = {...prev};
        for (const id of ids) {
          const server = toFeedComments(rows[id] ?? []);
          const pending = (prev[id] ?? []).filter(
            c => c.pending && pendingCommentIdsRef.current.has(c.id),
          );
          const serverIds = new Set(server.map(c => c.id));
          const mergedPending = pending.filter(c => !serverIds.has(c.id));
          next[id] = [...server, ...mergedPending];
        }
        return next;
      });
    },
    [currentUserId],
  );

  useEffect(() => {
    if (!currentUserId || !postIds.length) {
      setReactions({});
      setCommentsByPost({});
      return;
    }
    if (isDemoContentMode()) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [states] = await Promise.all([
          fetchPostBicepsStates(postIds, currentUserId),
          fetchPostComments(postIds, currentUserId).then(rows => {
            if (!cancelled) {
              const mapped: Record<string, FeedComment[]> = {};
              for (const id of postIds) {
                mapped[id] = toFeedComments(rows[id] ?? []);
              }
              setCommentsByPost(mapped);
            }
          }),
        ]);
        if (cancelled) {
          return;
        }
        const reactionMapped: Record<string, {count: number; reactedByMe: boolean}> = {};
        for (const id of postIds) {
          reactionMapped[id] = {
            count: states[id]?.count ?? 0,
            reactedByMe: states[id]?.reactedByMe ?? false,
          };
        }
        applyReactionStates(reactionMapped);
      } catch {
        // ignore transient load errors
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [postIdKey, currentUserId, applyReactionStates]);

  useEffect(() => {
    if (!currentUserId || isDemoContentMode()) {
      return;
    }
    return subscribePostBicepsRealtime(postId => {
      if (!postIds.includes(postId) || busyPostsRef.current.has(postId)) {
        return;
      }
      void reloadReactions([postId]);
    });
  }, [currentUserId, postIdKey, postIds, reloadReactions]);

  useEffect(() => {
    if (!currentUserId || isDemoContentMode()) {
      return;
    }
    return subscribePostEngagementRealtime({
      onComments: postId => {
        if (!postIds.includes(postId)) {
          return;
        }
        void reloadComments([postId]);
      },
      onCommentLikes: () => {
        void reloadComments(postIds);
      },
    });
  }, [currentUserId, postIdKey, postIds, reloadComments]);

  const togglePostLike = useCallback(
    async (postId: string) => {
      if (!currentUserId || busyPostsRef.current.has(postId) || isDemoContentMode()) {
        return;
      }
      const before = reactionsRef.current[postId] ?? {liked: false, likes: 0};
      busyPostsRef.current.add(postId);
      setReactions(prev => {
        const existing = prev[postId] ?? {liked: false, likes: 0};
        const nextLiked = !existing.liked;
        return {
          ...prev,
          [postId]: {
            liked: nextLiked,
            likes: Math.max(0, existing.likes + (nextLiked ? 1 : -1)),
          },
        };
      });
      try {
        const result = await togglePostBicepsReaction(postId);
        setReactions(prev => ({
          ...prev,
          [postId]: {liked: result.reacted, likes: result.count},
        }));
      } catch {
        setReactions(prev => ({...prev, [postId]: before}));
      } finally {
        busyPostsRef.current.delete(postId);
      }
    },
    [currentUserId],
  );

  const submitComment = useCallback(
    async (postId: string, body: string, authorName: string) => {
      const trimmed = body.trim();
      if (!trimmed || !currentUserId || submittingComment || isDemoContentMode()) {
        return false;
      }
      const tempId = `pending_${postId}_${Date.now()}`;
      pendingCommentIdsRef.current.add(tempId);
      const optimistic: FeedComment = {
        id: tempId,
        author: authorName,
        text: trimmed,
        userId: currentUserId,
        likeCount: 0,
        likedByMe: false,
        pending: true,
      };
      setCommentsByPost(prev => ({
        ...prev,
        [postId]: [...(prev[postId] ?? []), optimistic],
      }));
      setSubmittingComment(true);
      try {
        const saved = await createPostComment(postId, trimmed);
        pendingCommentIdsRef.current.delete(tempId);
        setCommentsByPost(prev => {
          const list = (prev[postId] ?? []).filter(c => c.id !== tempId);
          if (list.some(c => c.id === saved.id)) {
            return {...prev, [postId]: list};
          }
          return {
            ...prev,
            [postId]: [
              ...list,
              {
                id: saved.id,
                author: saved.authorName,
                text: saved.body,
                userId: saved.userId,
                likeCount: 0,
                likedByMe: false,
              },
            ],
          };
        });
        return true;
      } catch {
        pendingCommentIdsRef.current.delete(tempId);
        setCommentsByPost(prev => ({
          ...prev,
          [postId]: (prev[postId] ?? []).filter(c => c.id !== tempId),
        }));
        return false;
      } finally {
        setSubmittingComment(false);
      }
    },
    [currentUserId, submittingComment],
  );

  const toggleCommentLike = useCallback(
    async (postId: string, commentId: string) => {
      if (
        !currentUserId ||
        commentId.startsWith('pending_') ||
        busyCommentsRef.current.has(commentId) ||
        isDemoContentMode()
      ) {
        return;
      }
      busyCommentsRef.current.add(commentId);
      const list = commentsRef.current[postId] ?? [];
      const before = list.find(c => c.id === commentId);
      const prevLiked = before?.likedByMe ?? false;
      const prevCount = before?.likeCount ?? 0;
      setCommentsByPost(prev => {
        const items = prev[postId] ?? [];
        return {
          ...prev,
          [postId]: items.map(c =>
            c.id === commentId
              ? {
                  ...c,
                  likedByMe: !prevLiked,
                  likeCount: Math.max(0, prevCount + (prevLiked ? -1 : 1)),
                }
              : c,
          ),
        };
      });
      try {
        const result = await toggleCommentBiceps(commentId);
        setCommentsByPost(prev => {
          const items = prev[postId] ?? [];
          return {
            ...prev,
            [postId]: items.map(c =>
              c.id === commentId
                ? { ...c, likedByMe: result.reacted, likeCount: result.count }
                : c,
            ),
          };
        });
      } catch {
        if (before) {
          setCommentsByPost(prev => {
            const items = prev[postId] ?? [];
            return {
              ...prev,
              [postId]: items.map(c => (c.id === commentId ? {...before} : c)),
            };
          });
        }
      } finally {
        busyCommentsRef.current.delete(commentId);
      }
    },
    [currentUserId],
  );

  const getCommentLike = useCallback(
    (postId: string, commentId: string) => {
      const c = commentsByPost[postId]?.find(x => x.id === commentId);
      return {liked: c?.likedByMe ?? false, likes: c?.likeCount ?? 0};
    },
    [commentsByPost],
  );

  return {
    reactions,
    commentsByPost,
    submittingComment,
    togglePostLike,
    submitComment,
    toggleCommentLike,
    getCommentLike,
    reloadComments,
    reloadReactions,
  };
}
