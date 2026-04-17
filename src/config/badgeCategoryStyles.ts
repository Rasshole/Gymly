/**
 * Badge category styles — lookup must never do `undefined.background`.
 * Use: `const categoryStyle = CATEGORY_STYLES[key] ?? CATEGORY_STYLES.default` then `categoryStyle.background`.
 */
export type BadgeCategoryKey =
  | 'streak'
  | 'time'
  | 'sessions'
  | 'social'
  | 'special'
  | 'default';

export type BadgeCategoryStyle = {
  background: string;
  border: string;
  accent: string;
};

export const DEFAULT_BADGE_CATEGORY_STYLE: BadgeCategoryStyle = {
  background: '#FFFFFF',
  border: '#E5E7EB',
  accent: '#8B5CF6',
};

/** All valid categories — use only these keys on `badge.category` (English). */
export const CATEGORY_STYLES: Record<BadgeCategoryKey, BadgeCategoryStyle> = {
  default: DEFAULT_BADGE_CATEGORY_STYLE,
  streak: {
    background: '#FFFFFF',
    border: '#FBBF2480',
    accent: '#F59E0B',
  },
  time: {
    background: '#FFFFFF',
    border: '#A78BFA80',
    accent: '#8B5CF6',
  },
  sessions: {
    background: '#FFFFFF',
    border: '#34D39980',
    accent: '#10B981',
  },
  social: {
    background: '#FFFFFF',
    border: '#F472B680',
    accent: '#EC4899',
  },
  special: {
    background: '#FFFFFF',
    border: '#FFD70099',
    accent: '#FFD700',
  },
};

/** Maps legacy Danish labels to canonical keys (use English in data going forward). */
const DANISH_CATEGORY_TO_KEY: Record<string, BadgeCategoryKey> = {
  Tid: 'time',
  Sessioner: 'sessions',
};

/**
 * Resolves `badge.category` to a key that exists on CATEGORY_STYLES.
 */
export function resolveBadgeCategoryKey(
  category: string | undefined | null,
): BadgeCategoryKey {
  if (category == null || category === '') {
    return 'default';
  }
  const normalized = DANISH_CATEGORY_TO_KEY[category] ?? category;
  if (normalized in CATEGORY_STYLES) {
    return normalized as BadgeCategoryKey;
  }
  return 'default';
}
