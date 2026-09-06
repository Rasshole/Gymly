#!/usr/bin/env node
/**
 * Dev-only heuristic scan for likely user-facing hardcoded strings.
 * Usage: npm run i18n:audit
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const SKIP_DIRS = new Set(['node_modules', 'demo', '__tests__', 'assets']);

const PATTERNS = [
  {name: 'Alert.alert literal', re: /Alert\.alert\(\s*['"`][^'"`]+['"`]/},
  {name: 'placeholder literal', re: /placeholder=\{?['"`][^'"`{]+['"`]/},
  {name: 'accessibilityLabel literal', re: /accessibilityLabel=\{?['"`][A-Za-zÆØÅæøå]/},
  {name: 'Text children literal', re: /<(Text)[^>]*>\s*[A-Za-zÆØÅæøå][^<{]{3,}/},
  {name: 'title= literal', re: /\btitle=\{?['"`][A-Za-zÆØÅæøå][^'"`]{2,}['"`]/},
  {name: 'message= literal', re: /\bmessage=\{?['"`][A-Za-zÆØÅæøå][^'"`]{2,}['"`]/},
  {name: 'hardcoded da-DK', re: /['"`]da[-_]DK['"`]|locale:\s*da\b|from 'date-fns\/locale'/},
  {name: "localeCompare 'da'", re: /localeCompare\([^)]*['"`]da['"`]/},
];

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, {withFileTypes: true})) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (/\.(tsx|ts)$/.test(ent.name) && !ent.name.endsWith('.d.ts')) files.push(p);
  }
  return files;
}

/** Locale wiring files intentionally contain da-DK / date-fns locale imports. */
const SKIP_I18N_LOCALE_WIRING = new Set([
  path.join(SRC, 'i18n', 'locales.ts'),
  path.join(SRC, 'i18n', 'localeRegistry.ts'),
]);

const files = walk(SRC).filter(
  f =>
    !f.includes(`${path.sep}i18n${path.sep}translations${path.sep}`) &&
    !SKIP_I18N_LOCALE_WIRING.has(f),
);

const results = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/console\.|\/\/|^\s*\*|testID|__DEV__/.test(line)) continue;
    const usesT = /t\(['"`]|rt\(|tp\(['"`]/.test(line);
    for (const pat of PATTERNS) {
      if (!pat.re.test(line)) continue;
      if (usesT && !/da[-_]DK|localeCompare\([^)]*'da'|from 'date-fns\/locale'/.test(line)) {
        continue;
      }
      results.push({
        file: path.relative(path.join(SRC, '..'), file),
        line: i + 1,
        kind: pat.name,
        snippet: line.trim().slice(0, 140),
      });
    }
  }
}

console.log(`Hardcoded string audit — ${results.length} hits\n`);
const byKind = {};
for (const r of results) {
  byKind[r.kind] = (byKind[r.kind] || 0) + 1;
}
for (const [k, n] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${n}\t${k}`);
}
console.log('\nSample (first 60):\n');
for (const r of results.slice(0, 60)) {
  console.log(`${r.file}:${r.line} [${r.kind}]`);
  console.log(`  ${r.snippet}\n`);
}
if (results.length > 60) console.log(`… +${results.length - 60} more`);
