/**
 * Pure helpers for Edit Profile centers selection order (primary = index 0).
 */

export const MAX_PROFILE_CENTERS = 3;

export function idsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((id, i) => id === b[i]);
}

/** Move the item at `fromIndex` to `toIndex` (insert semantics). */
export function moveIdInOrder(
  ids: string[],
  fromIndex: number,
  toIndex: number,
): string[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= ids.length ||
    toIndex >= ids.length ||
    fromIndex === toIndex
  ) {
    return ids;
  }
  const next = [...ids];
  const [item] = next.splice(fromIndex, 1);
  if (item == null) {
    return ids;
  }
  next.splice(toIndex, 0, item);
  return next;
}

/** Swap with neighbour (dir -1 earlier / +1 later). */
export function moveSelectedByDir(
  ids: string[],
  index: number,
  dir: -1 | 1,
): string[] {
  return moveIdInOrder(ids, index, index + dir);
}

/**
 * Visual slot shift for non-dragged items while dragging from `from` → `hover`.
 * Returns the translateX multiplier in slot units for item at `index`.
 */
export function dragPreviewSlotShift(
  index: number,
  from: number,
  hover: number,
): number {
  if (index === from) {
    return 0;
  }
  if (from < hover) {
    if (index > from && index <= hover) {
      return -1;
    }
  } else if (from > hover) {
    if (index >= hover && index < from) {
      return 1;
    }
  }
  return 0;
}

/** Which index becomes primary (0) after a preview reorder. */
export function previewPrimaryId(
  ids: string[],
  fromIndex: number,
  hoverIndex: number,
): string | undefined {
  return moveIdInOrder(ids, fromIndex, hoverIndex)[0];
}

export function clampCenterSelection(ids: string[]): string[] {
  return ids.slice(0, MAX_PROFILE_CENTERS);
}
