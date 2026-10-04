/**
 * Promote locale planned → ready only if coverage gate READY for that id.
 * Usage: npx tsx scripts/promote-locale-if-ready.mts fi
 * Reads latest npm run i18n:coverage output OR runs analyze inline.
 */
import {spawnSync} from 'child_process';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const locale = process.argv[2];
const forceRtlBlock = new Set(['ar', 'he']);

if (!locale) {
  console.error('Usage: npx tsx scripts/promote-locale-if-ready.mts <locale>');
  process.exit(1);
}

if (forceRtlBlock.has(locale)) {
  console.log(`${locale}: TRANSLATION_READY_BUT_UI_BLOCKED (RTL) — not promoting`);
  process.exit(0);
}

/** Reject English-copy packs (coverage alone is not enough). */
function identicalToEnRatio(localeId: string): number {
  const enPath = path.join(root, 'scripts/out/batch1/en.flat.json');
  const locPath = path.join(root, 'scripts/out/global', `${localeId}.flat.json`);
  const batchPath = path.join(root, 'scripts/out/batch1', `${localeId}.flat.json`);
  const flatPath = fs.existsSync(locPath) ? locPath : batchPath;
  if (!fs.existsSync(enPath) || !fs.existsSync(flatPath)) {
    return 0;
  }
  const en = JSON.parse(fs.readFileSync(enPath, 'utf8')) as Record<string, string>;
  const loc = JSON.parse(fs.readFileSync(flatPath, 'utf8')) as Record<string, string>;
  const allow = new Set([
    'OK',
    'PR',
    'Gymly',
    'GPS',
    'ID',
    'DM',
    'Email',
    'iOS',
    'Android',
    'Shopify',
    'Cardio',
    'Pilates',
    'Reformer',
    'Biceps',
    'Triceps',
  ]);
  let identical = 0;
  let scored = 0;
  for (const [k, ev] of Object.entries(en)) {
    if (
      allow.has(ev) ||
      ev.length <= 2 ||
      ev.startsWith('http') ||
      k.startsWith('language.option') ||
      k.startsWith('countries.') ||
      (k.startsWith('badges.catalog.') && k.endsWith('.name'))
    ) {
      continue;
    }
    scored += 1;
    if (loc[k] === ev) {
      identical += 1;
    }
  }
  return scored === 0 ? 0 : identical / scored;
}

const identicalRatio = identicalToEnRatio(locale);
if (identicalRatio > 0.25) {
  console.log(
    `${locale}: FAIL — too many English-identical strings (${(identicalRatio * 100).toFixed(1)}% > 25%)`,
  );
  process.exit(1);
}

const r = spawnSync('npm', ['run', 'i18n:coverage'], {
  cwd: root,
  encoding: 'utf8',
  shell: process.platform === 'win32',
});
const out = (r.stdout || '') + (r.stderr || '');
fs.mkdirSync(path.join(root, 'scripts/out/global/logs'), {recursive: true});
fs.writeFileSync(
  path.join(root, 'scripts/out/global/logs', `coverage_${locale}.txt`),
  out,
);

const line = out
  .split('\n')
  .find(l => l.startsWith(`${locale}:`) && l.includes('|'));
if (!line || !line.includes('| READY')) {
  console.log(`${locale}: FAIL — not promoting\n${line || '(no coverage line)'}`);
  process.exit(1);
}

const registryPath = path.join(root, 'src/i18n/localeRegistry.ts');
let registry = fs.readFileSync(registryPath, 'utf8');
const re = new RegExp(`(id: '${locale}',[\\s\\S]*?status: )'planned'`);
if (!re.test(registry)) {
  if (registry.includes(`id: '${locale}'`) && registry.match(new RegExp(`id: '${locale}',[\\s\\S]*?status: 'ready'`))) {
    console.log(`${locale}: already ready`);
    process.exit(0);
  }
  console.log(`${locale}: registry entry not found or unexpected`);
  process.exit(1);
}
registry = registry.replace(re, `$1'ready'`);
fs.writeFileSync(registryPath, registry);
console.log(`${locale}: promoted planned → ready`);
