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

/**
 * Drop friends and blocks, and attach an incoming request once that map is known.
 * A pending outgoing request stays outgoing. Missing incoming ids are left alone
 * so a not-yet-loaded map cannot clear a status the suggestion fetch already set.
 */
export function mergeGymSuggestionRows<
  T extends {id: string; status: string; incomingRequestId?: string},
>(
  rows: T[],
  incomingByFromId: ReadonlyMap<string, string>,
  hiddenIds: ReadonlySet<string>,
): T[] {
  let changed = false;
  const next: T[] = [];
  for (const row of rows) {
    if (hiddenIds.has(row.id)) {
      changed = true;
      continue;
    }
    const incomingId = incomingByFromId.get(row.id);
    if (
      incomingId &&
      row.status !== 'pending_sent' &&
      (row.status !== 'pending_received' || row.incomingRequestId !== incomingId)
    ) {
      changed = true;
      next.push({
        ...row,
        status: 'pending_received',
        incomingRequestId: incomingId,
      });
      continue;
    }
    next.push(row);
  }
  return changed ? next : rows;
}

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
