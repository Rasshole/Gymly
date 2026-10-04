import {TRANSLATION_MODULES} from '../src/i18n/translations/index.ts';

function flatten(
  obj: unknown,
  prefix = '',
  out: Record<string, string> = {},
): Record<string, string> {
  for (const [k, v] of Object.entries((obj as object) ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') {
      out[key] = v;
    } else if (v && typeof v === 'object') {
      flatten(v, key, out);
    }
  }
  return out;
}

function asDict(m: unknown) {
  return ((m as {default?: unknown}).default ?? m) as object;
}

function tokens(s: string) {
  return [...s.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort();
}

const en = flatten(asDict(TRANSLATION_MODULES.en));
let n = 0;
for (const id of Object.keys(TRANSLATION_MODULES)) {
  if (id === 'en') {
    continue;
  }
  const flat = flatten(
    asDict(TRANSLATION_MODULES[id as keyof typeof TRANSLATION_MODULES]),
  );
  for (const [k, enV] of Object.entries(en)) {
    const loc = flat[k];
    if (!loc) {
      continue;
    }
    if (tokens(loc).join() !== tokens(enV).join()) {
      n += 1;
      console.log(id, k);
      console.log(' EN', JSON.stringify(enV));
      console.log(' LO', JSON.stringify(loc));
    }
  }
}
console.log('mismatches', n);
