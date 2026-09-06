#!/usr/bin/env node
/**
 * Dev-only: compare translation modules against English master.
 * Usage: npm run i18n:coverage
 */
const {spawnSync} = require('child_process');
const path = require('path');

const script = `
import en from './src/i18n/translations/en.ts';
import da from './src/i18n/translations/da.ts';
import sv from './src/i18n/translations/sv.ts';
import nb from './src/i18n/translations/nb.ts';

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? \`\${prefix}.\${k}\` : k;
    if (typeof v === 'string') out[key] = v;
    else if (v && typeof v === 'object') flatten(v, key, out);
  }
  return out;
}

const enKeys = flatten(en);
const locales = [
  {id: 'en', keys: enKeys},
  {id: 'da', keys: flatten(da)},
  {id: 'sv', keys: flatten(sv)},
  {id: 'nb', keys: flatten(nb)},
];
const enCount = Object.keys(enKeys).length;
console.log('Gymly i18n coverage (vs English master)\\n');
for (const loc of locales) {
  const missing = Object.keys(enKeys).filter(k => !(k in loc.keys));
  const covered = enCount - missing.length;
  const pct = ((covered / enCount) * 100).toFixed(1);
  console.log(\`\${loc.id}: \${pct}% (\${covered}/\${enCount} keys)\`);
  if (missing.length && loc.id !== 'en') {
    console.log(\`  Missing (\${missing.length}):\`);
    for (const k of missing.slice(0, 50)) console.log('    - ' + k);
    if (missing.length > 50) console.log(\`    … +\${missing.length - 50} more\`);
  }
  console.log('');
}
`;

const r = spawnSync(
  'npx',
  ['--yes', 'tsx', '-e', script],
  {cwd: path.join(__dirname, '..'), encoding: 'utf8', shell: process.platform === 'win32'},
);
process.stdout.write(r.stdout || '');
process.stderr.write(r.stderr || '');
process.exit(r.status ?? 1);
