import type {FeedItem} from '@/store/feedStore';
import type {PostActionSheetPost} from '@/components/feed/PostActionBottomSheet';

export function feedItemToPostActionSheet(item: FeedItem): PostActionSheetPost {
  return {
    id: item.id,
    userId: item.userId,
    userName: item.user,
    caption: item.description,
    photoUri: item.photoUri ?? item.videoThumbnailUri ?? item.videoUri,
    workoutInfo: item.workoutInfo,
  };
}
