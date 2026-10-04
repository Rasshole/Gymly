/**
 * Pure helpers for excluding blocked users from social lists / search merges.
 * Keeps direction-agnostic: any id in `blockedIds` is hidden without revealing who blocked whom.
 */

export function excludeBlockedIds<T extends {id: string}>(
  items: T[],
  blockedIds: ReadonlySet<string>,
): T[] {
  if (blockedIds.size === 0) {
    return items;
  }
  return items.filter(item => !blockedIds.has(item.id));
}

/** Bump so in-flight search responses are discarded after a local block. */
export function bumpSearchGeneration(current: number): number {
  return current + 1;
}

export function shouldCommitSearchResults(
  requestGen: number,
  currentGen: number,
): boolean {
  return requestGen === currentGen;
}
