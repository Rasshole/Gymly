/**
 * Build src/i18n/translations/{locale}.ts from flat JSON (EN skeleton).
 * Supports hyphenated ids (zh-Hans → const zhHans).
 *
 * Usage: npx tsx scripts/build-locale-from-flat.mts <locale> [flatDir]
 * flatDir defaults to scripts/out/batch1, then scripts/out/global
 */
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import en from '../src/i18n/translations/en.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const locale = process.argv[2];
const flatDirArg = process.argv[3];
if (!locale) {
  console.error('Usage: npx tsx scripts/build-locale-from-flat.mts <locale> [flatDir]');
  process.exit(1);
}

function safeIdent(id: string): string {
  return id.replace(/[^A-Za-z0-9_]/g, '_').replace(/^([^A-Za-z_])/, '_$1');
}

const candidates = flatDirArg
  ? [path.join(root, flatDirArg, `${locale}.flat.json`)]
  : [
      path.join(root, 'scripts/out/global', `${locale}.flat.json`),
      path.join(root, 'scripts/out/batch1', `${locale}.flat.json`),
    ];

const flatPath = candidates.find(p => fs.existsSync(p));
if (!flatPath) {
  console.error('Missing flat JSON for', locale, candidates);
  process.exit(1);
}

const flat = JSON.parse(fs.readFileSync(flatPath, 'utf8')) as Record<
  string,
  string
>;

function asDict(mod: unknown): Record<string, unknown> {
  const m = mod as {default?: Record<string, unknown>};
  return (m?.default ?? m) as Record<string, unknown>;
}

function applyFlat(
  node: unknown,
  prefix: string,
): string | Record<string, unknown> {
  if (typeof node === 'string') {
    const v = flat[prefix];
    if (v == null) {
      throw new Error(`Missing translation for ${prefix}`);
    }
    return v;
  }
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const key = prefix ? `${prefix}.${k}` : k;
      out[k] = applyFlat(v, key);
    }
    return out;
  }
  return node as Record<string, unknown>;
}

function serialize(value: unknown, indent: number): string {
  const pad = '  '.repeat(indent);
  const padIn = '  '.repeat(indent + 1);
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return '{}';
    }
    const lines = entries.map(([k, v]) => {
      const safeKey = /^[A-Za-z_][A-Za-z0-9_]*$/.test(k)
        ? k
        : JSON.stringify(k);
      return `${padIn}${safeKey}: ${serialize(v, indent + 1)},`;
    });
    return `{\n${lines.join('\n')}\n${pad}}`;
  }
  return String(value);
}

const ident = safeIdent(locale);
const tree = applyFlat(asDict(en), '');
const body = serialize(tree, 0);
const header = `import type {TranslationDict} from '../types';

/**
 * ${locale} translations — global expansion.
 * Semantic master: English. Structure mirrors en.ts.
 */
const ${ident} = ${body} as const satisfies TranslationDict;

export default ${ident};
`;

const outFile = path.join(root, 'src/i18n/translations', `${locale}.ts`);
fs.writeFileSync(outFile, header);
console.log('Wrote', outFile, 'keys', Object.keys(flat).length, 'from', flatPath);
