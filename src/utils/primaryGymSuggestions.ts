/**
 * When a gym-suggestion response may replace the list on screen.
 * An older request, or a request for a center that is no longer primary, must not commit.
 */
export function shouldCommitGymSuggestions(
  requestGen: number,
  requestCenterId: string,
  currentGen: number,
  currentCenterId: string | null,
): boolean {
  return requestGen === currentGen && currentCenterId === requestCenterId;
}

export type GymSuggestPhase = 'loading' | 'error' | 'noGym' | 'empty' | 'ready';

export function gymSuggestPhase(input: {
  centerKnown: boolean;
  centerId: string | null;
  loading: boolean;
  error: boolean;
  count: number;
}): GymSuggestPhase {
  if (!input.centerKnown) {
    return input.error ? 'error' : 'loading';
  }
  if (!input.centerId) {
    return 'noGym';
  }
  if (input.loading && input.count === 0 && !input.error) {
    return 'loading';
  }
  if (input.error && input.count === 0) {
    return 'error';
  }
  if (input.count === 0) {
    return 'empty';
  }
  return 'ready';
}
