type Params = Record<string, string | number>;

export type TranslateFn = (path: string, params?: Params) => string;

export type PluralTranslateFn = (
  basePath: string,
  count: number,
  params?: Params,
) => string;

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as object)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function interpolate(template: string, params?: Params): string {
  if (!params) {
    return template;
  }
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = params[key];
    return v === undefined ? `{{${key}}}` : String(v);
  });
}

function resolveString(
  dict: Record<string, unknown>,
  fallbackDict: Record<string, unknown> | undefined,
  path: string,
): string | undefined {
  const primary = getPath(dict, path);
  if (typeof primary === 'string') {
    return primary;
  }
  const fallback = fallbackDict ? getPath(fallbackDict, path) : undefined;
  if (typeof fallback === 'string') {
    if (__DEV__) {
      console.warn(`[i18n] Missing key (using English): ${path}`);
    }
    return fallback;
  }
  return undefined;
}

/**
 * Create a translator. Missing keys fall back to `fallbackDict` (English),
 * then never return raw key paths to users in production.
 */
export function createTranslator(
  dict: Record<string, unknown>,
  fallbackDict?: Record<string, unknown>,
): TranslateFn {
  return function t(path: string, params?: Params): string {
    const resolved = resolveString(dict, fallbackDict, path);
    if (resolved !== undefined) {
      return interpolate(resolved, params);
    }

    if (__DEV__) {
      console.warn(`[i18n] Missing key: ${path}`);
    }
    // Last resort: humanize path instead of showing "home.feed"
    const leaf = path.split('.').pop() ?? path;
    return leaf
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, s => s.toUpperCase())
      .trim();
  };
}

/**
 * Plural-aware translator using Intl.PluralRules.
 * Keys: `basePath_one`, `basePath_other` (and `_zero` / `_few` / `_many` when needed).
 * Always injects `count` into params.
 */
export function createPluralTranslator(
  dict: Record<string, unknown>,
  fallbackDict: Record<string, unknown> | undefined,
  intlLocale: string,
): PluralTranslateFn {
  const t = createTranslator(dict, fallbackDict);
  return function tp(basePath: string, count: number, params?: Params): string {
    let category = 'other';
    try {
      category = new Intl.PluralRules(intlLocale).select(count);
    } catch {
      category = count === 1 ? 'one' : 'other';
    }
    const candidates = [
      `${basePath}_${category}`,
      `${basePath}_other`,
      `${basePath}_one`,
      basePath,
    ];
    const merged: Params = {count, ...params};
    for (const key of candidates) {
      if (
        typeof getPath(dict, key) === 'string' ||
        (fallbackDict && typeof getPath(fallbackDict, key) === 'string')
      ) {
        return t(key, merged);
      }
    }
    return t(`${basePath}_other`, merged);
  };
}
