/**
 * Share Workout capture/export invariants (testable without a device).
 */

import type {ShareWorkoutBackground} from '@/types/shareWorkout.types';
import {SHARE_EXPORT_FORMATS} from '@/types/shareWorkout.types';

export const SHARE_STORY_EXPORT = SHARE_EXPORT_FORMATS.stories;

/** Capture target must render at story export resolution. */
export function shareCaptureDimensions(): {width: number; height: number} {
  return {
    width: SHARE_STORY_EXPORT.width,
    height: SHARE_STORY_EXPORT.height,
  };
}

/** Transparent exports must not include an opaque canvas fill. */
export function shareCanvasBackgroundColor(
  background: ShareWorkoutBackground,
): string | undefined {
  if (background === 'transparent') {
    return 'transparent';
  }
  if (background === 'photo') {
    return undefined;
  }
  return undefined;
}

/** Checkerboard is preview-only — never part of exported card component tree for transparent mode. */
export function sharePreviewUsesCheckerboard(
  background: ShareWorkoutBackground,
): boolean {
  return background === 'transparent';
}
