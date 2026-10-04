/**
 * Pure helpers for Friends people-search scheduling / commit rules.
 * Keeps debounce + race logic testable without mounting the screen.
 */

export const FRIEND_SEARCH_MIN_CHARS = 2;

export type FriendSearchPlan =
  | {action: 'clear'}
  | {action: 'schedule'; query: string}
  | {action: 'noop'};

/**
 * Decide what the search debounce effect should do for a trimmed query.
 * `lastStartedQuery` is the last query a request was actually started for
 * (after debounce). Identical text must not schedule again.
 */
export function planFriendSearch(
  trimmedQuery: string,
  lastStartedQuery: string | null,
  minChars: number = FRIEND_SEARCH_MIN_CHARS,
): FriendSearchPlan {
  if (trimmedQuery.length < minChars) {
    return {action: 'clear'};
  }
  if (lastStartedQuery === trimmedQuery) {
    return {action: 'noop'};
  }
  return {action: 'schedule', query: trimmedQuery};
}

/** Failed searches must not wipe already-visible rows for the same query. */
export function shouldClearResultsOnSearchError(): boolean {
  return false;
}

/**
 * Simulate out-of-order responses: only the latest generation may commit.
 * Returns which request gens would update UI.
 */
export function filterCommittedSearchGenerations(
  completedGensInOrder: readonly number[],
  latestGen: number,
): number[] {
  return completedGensInOrder.filter(gen => gen === latestGen);
}
