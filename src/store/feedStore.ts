import {create} from 'zustand';
import {MuscleGroup} from '@/types/workout.types';

export type FeedItemType = 'photo' | 'pr' | 'summary';

export type FeedItem = {
  id: string;
  type: FeedItemType;
  /** Bruges til at filtrere egne opslag på profil */
  userId?: string;
  user: string;
  description: string;
  timestamp: string;
  photoUri?: string;
  videoUri?: string; // Video URI for PR posts
  videoThumbnailUri?: string; // Thumbnail for PR video
  workoutInfo?: string; // Location, participants, muscle groups, time
  rating?: number; // 1-5 rating with emojis
  mentionedUsers?: string[]; // Array of user IDs that were mentioned/tagged
  muscles?: MuscleGroup[]; // Muscle groups for this workout (for icons in feed)
  prInfo?: string; // PR info if user set a new PR during workout
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


