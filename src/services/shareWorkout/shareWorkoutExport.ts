/**
 * Capture Share Workout cards and share/save them.
 * Transparent backgrounds export as PNG with alpha preserved.
 */

import {Alert, Platform} from 'react-native';
import {CameraRoll} from '@react-native-camera-roll/camera-roll';
import {captureRef} from 'react-native-view-shot';
import Share from 'react-native-share';
import type {RefObject} from 'react';
import type {
  ShareExportFormat,
  ShareWorkoutBackground,
} from '@/types/shareWorkout.types';
import {SHARE_EXPORT_FORMATS} from '@/types/shareWorkout.types';
import {rt} from '@/i18n';

export type CaptureTarget = RefObject<{capture?: () => Promise<string>} | null>;

function normalizeFileUri(uri: string): string {
  if (uri.startsWith('file://') || uri.startsWith('content://')) {
    return uri;
  }
  return `file://${uri}`;
}

export async function captureShareWorkoutImage(params: {
  viewRef: CaptureTarget;
  background: ShareWorkoutBackground;
  format?: ShareExportFormat;
}): Promise<string> {
  const format = params.format ?? SHARE_EXPORT_FORMATS.stories;
  const target = params.viewRef.current;
  if (!target) {
    throw new Error('Could not capture share image.');
  }

  let uri: string;
  if (typeof target.capture === 'function') {
    uri = await target.capture();
  } else {
    uri = await captureRef(params.viewRef as any, {
      format: 'png',
      quality: 1,
      result: 'tmpfile',
      width: format.width,
      height: format.height,
    });
  }

  if (!uri) {
    throw new Error('Could not capture share image.');
  }
  return normalizeFileUri(uri);
}

export async function saveShareWorkoutImage(uri: string): Promise<void> {
  try {
    await CameraRoll.saveAsset(uri, {type: 'photo'});
    Alert.alert(rt('mediaSave.savedTitle'), rt('mediaSave.savedBody'));
  } catch {
    Alert.alert(rt('mediaSave.saveFailedTitle'), rt('mediaSave.saveFailedBody'));
  }
}

export async function shareShareWorkoutImage(params: {
  uri: string;
  message?: string;
}): Promise<void> {
  const url = normalizeFileUri(params.uri);
  try {
    await Share.open({
      url,
      type: 'image/png',
      failOnCancel: false,
      message: params.message,
    });
  } catch {
    /* user dismissed */
  }
}

/**
 * Instagram Stories sticker share when Instagram is installed.
 * Transparent PNG is passed as stickerImage so it overlays the user's story media.
 * Android may need a Facebook App ID for reliable Stories sharing —
 * on failure we return 'fallback' so the caller can open the system share sheet.
 */
export async function shareShareWorkoutToInstagramStories(params: {
  uri: string;
  background: ShareWorkoutBackground;
}): Promise<'shared' | 'unavailable' | 'fallback'> {
  const stickerImage = normalizeFileUri(params.uri);
  try {
    if (Platform.OS === 'android') {
      const can = await Share.isPackageInstalled('com.instagram.android');
      if (!can?.isInstalled) {
        return 'unavailable';
      }
    }

    await Share.shareSingle({
      social: Share.Social.INSTAGRAM_STORIES as any,
      stickerImage,
      backgroundTopColor: '#8B5CF6',
      backgroundBottomColor: '#6D28D9',
      attributionURL: 'https://gymlyapp.com',
    });
    return 'shared';
  } catch {
    return 'fallback';
  }
}
