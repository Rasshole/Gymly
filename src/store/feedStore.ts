import {create} from 'zustand';

export type FeedItemType = 'photo' | 'pr' | 'summary';

export type FeedItem = {
  id: string;
  type: FeedItemType;
  user: string;
  description: string;
  timestamp: string;
  photoUri?: string;
  workoutInfo?: string; // Location, participants, muscle groups, time
};

interface FeedState {
  feedItems: FeedItem[];
  addFeedItem: (item: FeedItem) => void;
}

const initialFeedItems: FeedItem[] = [
  {
    id: 'feed_photo_1',
    type: 'photo',
    user: 'Amalie',
    description: 'Ben session med Sofie og Birgitte – 60 minutters grind 💪',
    timestamp: 'for 2 timer siden',
  },
  {
    id: 'feed_pr_1',
    type: 'pr',
    user: 'Jeff',
    description: 'Ny PR i bænkpres: 125 kg!',
    timestamp: 'i dag kl. 10.21',
  },
  {
    id: 'feed_summary_1',
    type: 'summary',
    user: 'Marie',
    description: 'Afsluttede et fuldt bodyweight-flow i Repeat Fitness.',
    timestamp: 'i går',
  },
];

export const useFeedStore = create<FeedState>(set => ({
  feedItems: initialFeedItems,
  addFeedItem: item =>
    set(state => ({
      feedItems: [item, ...state.feedItems],
    })),
  deleteFeedItem: (itemId: string) =>
    set(state => ({
      feedItems: state.feedItems.filter(item => item.id !== itemId),
    })),
}));


