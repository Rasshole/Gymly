import en from '../src/i18n/translations/en.ts';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

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

const dict = ((en as {default?: unknown}).default ?? en) as object;
const flat = flatten(dict);
const outDir = path.join(root, 'scripts/out/batch1');
fs.mkdirSync(outDir, {recursive: true});
fs.writeFileSync(path.join(outDir, 'en.flat.json'), JSON.stringify(flat, null, 2));
console.log('keys', Object.keys(flat).length);
