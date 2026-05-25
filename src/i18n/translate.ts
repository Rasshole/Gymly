type Params = Record<string, string | number>;

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

export function createTranslator(dict: Record<string, unknown>) {
  return function t(path: string, params?: Params): string {
    const value = getPath(dict, path);
    if (typeof value === 'string') {
      return interpolate(value, params);
    }
    if (__DEV__) {
      console.warn(`[i18n] Missing key: ${path}`);
    }
    return path;
  };
}
