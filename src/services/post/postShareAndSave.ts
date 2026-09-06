import {Alert, Platform, Share} from 'react-native';
import {CameraRoll} from '@react-native-camera-roll/camera-roll';
import {rt} from '@/i18n';

export type ShareablePostPayload = {
  caption?: string;
  workoutInfo?: string;
};

export function buildWorkoutPostShareMessage(post: ShareablePostPayload): string {
  const parts = [post.caption?.trim(), post.workoutInfo?.trim()].filter(Boolean);
  if (parts.length) {
    return parts.join('\n\n');
  }
  return rt('mediaSave.shareFallback');
}

export async function shareWorkoutPost(post: ShareablePostPayload & {photoUri?: string | null}): Promise<void> {
  const message = buildWorkoutPostShareMessage(post);
  const raw = post.photoUri?.trim();
  const url =
    raw && (raw.startsWith('http') || raw.startsWith('file') || raw.startsWith('content'))
      ? raw
      : undefined;
  try {
    if (url && Platform.OS === 'ios') {
      await Share.share({message, url});
    } else if (url && Platform.OS === 'android') {
      await Share.share({message: `${message}\n${url}`});
    } else {
      await Share.share({message});
    }
  } catch {
    /* user dismissed */
  }
}

export async function saveWorkoutPostImageToLibrary(uri: string | null | undefined): Promise<void> {
  const trimmed = uri?.trim();
  if (
    !trimmed ||
    (!trimmed.startsWith('http') &&
      !trimmed.startsWith('file') &&
      !trimmed.startsWith('content') &&
      !trimmed.startsWith('ph://'))
  ) {
    Alert.alert(rt('mediaSave.noImageTitle'), rt('mediaSave.noImageBody'));
    return;
  }
  try {
    await CameraRoll.saveAsset(trimmed, {type: 'photo'});
    Alert.alert(rt('mediaSave.savedTitle'), rt('mediaSave.savedBody'));
  } catch {
    Alert.alert(rt('mediaSave.saveFailedTitle'), rt('mediaSave.saveFailedBody'));
  }
}
