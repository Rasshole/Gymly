import type {ProfileVisibility} from '@/types/user.types';

export function shouldInsertWorkoutPost(input: {
  audience: ProfileVisibility;
  existingPostId: string | null;
  alreadySubmitted: boolean;
}): boolean {
  if (input.alreadySubmitted || input.existingPostId) {
    return false;
  }
  return input.audience !== 'private';
}
