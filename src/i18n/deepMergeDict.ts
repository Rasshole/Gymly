/**
 * Deep-merge translation dictionaries. Overlay wins on string leaves;
 * nested objects are merged recursively. English is the master base.
 */

export type DictNode = string | {[key: string]: DictNode};

export function deepMergeDict(
  base: Record<string, unknown>,
  overlay: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!overlay) {
    return base;
  }
  const out: Record<string, unknown> = {...base};
  for (const key of Object.keys(overlay)) {
    const oVal = overlay[key];
    const bVal = base[key];
    if (
      oVal &&
      typeof oVal === 'object' &&
      !Array.isArray(oVal) &&
      bVal &&
      typeof bVal === 'object' &&
      !Array.isArray(bVal)
    ) {
      out[key] = deepMergeDict(
        bVal as Record<string, unknown>,
        oVal as Record<string, unknown>,
      );
    } else if (typeof oVal === 'string') {
      out[key] = oVal;
    } else if (oVal && typeof oVal === 'object' && !Array.isArray(oVal)) {
      out[key] = deepMergeDict({}, oVal as Record<string, unknown>);
    }
  }
  return out;
}
