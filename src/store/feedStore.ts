import {create} from 'zustand';
import {MuscleGroup} from '@/types/workout.types';
import type {SharedWorkoutSnapshot} from '@/types/personalRecord.types';

export type FeedItemType = 'photo' | 'pr' | 'summary';

/**
 * Feed item — workout session is the primary object.
 * `type` is a display hint for legacy paths; media (`photoUri`/`videoUri`),
 * `workoutSnapshot` (PRs + stats), and `description` (caption) are composable
 * and must not be treated as mutually exclusive.
 */
export type FeedItem = {
  id: string;
  type: FeedItemType;
  /** Bruges til at filtrere egne opslag på profil */
  userId?: string;
  user: string;
  userAvatarUrl?: string;
  description: string;
  timestamp: string;
  photoUri?: string;
  videoUri?: string; // Video URI for PR posts
  videoThumbnailUri?: string; // Thumbnail for PR video
  workoutInfo?: string; // Location, participants, muscle groups, time
  /** Whole minutes, so the feed can format duration in the viewer language. */
  durationMinutes?: number;
  centerName?: string;
  /** Stored workout type (keys or legacy labels) before display formatting. */
  workoutTypeSource?: string;
  rating?: number; // 1-5 rating with emojis
  mentionedUsers?: string[]; // Array of user IDs that were mentioned/tagged
  muscles?: MuscleGroup[]; // Muscle groups for this workout (for icons in feed)
  prInfo?: string; // PR info if user set a new PR during workout
  /** Intentional shared workout payload (never private history) */
  workoutSnapshot?: SharedWorkoutSnapshot;
  checkInId?: string;
};

interface FeedState {
  feedItems: FeedItem[];
  addFeedItem: (item: FeedItem) => void;
  setFeedItems: (items: FeedItem[]) => void;
  deleteFeedItem: (itemId: string) => void;
}

export const useFeedStore = create<FeedState>(set => ({
  feedItems: [],
  addFeedItem: item =>
    set(state => ({
      feedItems: [item, ...state.feedItems],
    })),
  setFeedItems: items => set({feedItems: items}),
  deleteFeedItem: itemId =>
    set(state => ({
      feedItems: state.feedItems.filter(item => item.id !== itemId),
    })),
}));


