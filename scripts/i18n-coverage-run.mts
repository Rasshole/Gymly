/**
 * Gymly i18n coverage gate vs English master.
 * Run: npm run i18n:coverage
 *
 * Evaluates every installed translation module. Promoting to registry `ready`
 * is a separate step after READY verdict.
 */
import {createRequire} from 'module';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {LOCALE_BY_ID} from '../src/i18n/localeRegistry.ts';
import {TRANSLATION_MODULES} from '../src/i18n/translations/index.ts';
import en from '../src/i18n/translations/en.ts';

const require = createRequire(import.meta.url);
const {flatten, analyzeLocaleCoverage} = require('./lib/i18nCoverageCore.cjs');

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadExerciseOverrides() {
  const src = fs.readFileSync(path.join(root, 'src/i18n/exerciseNames.ts'), 'utf8');
  const out: Record<string, Record<string, string>> = {};
  for (const lang of Object.keys(TRANSLATION_MODULES)) {
    const start = src.indexOf(`\n  ${lang}: {`);
    if (start < 0) {
      out[lang] = {};
      continue;
    }
    const from = start + `\n  ${lang}: {`.length;
    let depth = 1;
    let i = from;
    for (; i < src.length && depth > 0; i += 1) {
      const ch = src[i];
      if (ch === '{') {
        depth += 1;
      } else if (ch === '}') {
        depth -= 1;
      }
    }
    const block = src.slice(from, i - 1);
    out[lang] = {};
    for (const km of block.matchAll(/'([^']+)':/g)) {
      out[lang][km[1]] = '1';
    }
  }
  return out;
}

function loadExerciseLibraryIds() {
  const src = fs.readFileSync(path.join(root, 'src/data/exerciseLibrary.ts'), 'utf8');
  return [...src.matchAll(/\bid:\s*["']([^"']+)["']/g)].map(m => m[1]);
}

function loadBadgeIds() {
  const src = fs.readFileSync(
    path.join(root, 'src/config/badgeDefinitions.ts'),
    'utf8',
  );
  return [...src.matchAll(/\bid:\s*'([^']+)'/g)].map(m => m[1]);
}

function asDict(mod: unknown): Record<string, unknown> {
  const m = mod as {default?: Record<string, unknown>};
  return (m?.default ?? m) as Record<string, unknown>;
}

const enFlat = flatten(asDict(en));
const exerciseOverrides = loadExerciseOverrides();
const exerciseLibraryIds = loadExerciseLibraryIds();
const badgeIds = loadBadgeIds();

console.log('Gymly i18n coverage gate (vs English master)');
console.log('English master leaf count:', Object.keys(enFlat).length);
console.log(
  'Badge catalog ids on EN:',
  Object.keys(enFlat).filter(k => /^badges\.catalog\.[^.]+\.name$/.test(k))
    .length,
);
console.log('Exercise library ids:', exerciseLibraryIds.length);
console.log('Installed modules:', Object.keys(TRANSLATION_MODULES).join(', '));
console.log('');

let anyFail = false;
const results: Record<string, string> = {};
for (const id of Object.keys(TRANSLATION_MODULES)) {
  const policy =
    LOCALE_BY_ID[id]?.exerciseNamePolicy ?? 'CANONICAL_GYM_ENGLISH_ALLOWED';
  const report = analyzeLocaleCoverage({
    enFlat,
    localeFlat: flatten(asDict(TRANSLATION_MODULES[id as keyof typeof TRANSLATION_MODULES])),
    localeId: id,
    exerciseNamePolicy: policy,
    exerciseLibraryIds,
    exerciseOverrides: id === 'en' ? {} : exerciseOverrides[id] || {},
    badgeIds,
    isEnglishMaster: id === 'en',
  });
  results[id] = report.verdict;

  console.log(
    `${id}: ${report.coveragePct.toFixed(1)}% (${report.enCount - report.missingCount}/${report.enCount} keys) | identical-to-EN=${report.identicalToEn} | extras=${report.extraCount} | ${report.exerciseNote} | ${report.verdict}`,
  );
  if (report.missingCount && id !== 'en') {
    console.log(`  Missing (${report.missingCount}):`);
    for (const k of report.missing) {
      console.log('    - ' + k);
    }
  }
  if (report.namespaceIssues.length) {
    console.log('  Namespace gaps:');
    for (const n of report.namespaceIssues) {
      console.log(`    - ${n.prefix} missing ${n.missing}`);
    }
  }
  if (report.badgeIssues.length) {
    console.log('  Badge gaps:', report.badgeIssues.join(', '));
  }
  if (report.verdict === 'FAIL') {
    anyFail = true;
  }
  console.log('');
}

console.log('Per-locale verdicts:', JSON.stringify(results));
console.log(
  anyFail
    ? 'OVERALL: FAIL — do not mark failing locales ready'
    : 'OVERALL: READY — installed packs pass key/badge/exercise policy gates',
);
process.exit(anyFail ? 1 : 0);
