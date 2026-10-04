/**
 * Phase 3 wiring helper: build a Batch 1 locale pack from flat JSON and register
 * the translation module. Does NOT flip registry status to `ready`.
 *
 * Usage: npx tsx scripts/activate-batch1-locale.mts <locale>
 * Example: npx tsx scripts/activate-batch1-locale.mts de
 *
 * Prerequisites:
 *   - scripts/out/batch1/{locale}.flat.json
 * After this script: run coverage gate, then manually set status to `ready`.
 */
import {spawnSync} from 'child_process';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const BATCH1 = ['de', 'fr', 'es', 'nl', 'it', 'pl', 'pt'] as const;
type Batch1Locale = (typeof BATCH1)[number];

const NATIVE_FALLBACK: Record<Batch1Locale, string> = {
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  nl: 'Nederlands',
  it: 'Italiano',
  pl: 'Polski',
  pt: 'Português',
};

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const locale = process.argv[2]?.trim();

if (!locale || !(BATCH1 as readonly string[]).includes(locale)) {
  console.error(
    `Usage: npx tsx scripts/activate-batch1-locale.mts <${BATCH1.join('|')}>`,
  );
  process.exit(1);
}

const flatPath = path.join(root, 'scripts/out/batch1', `${locale}.flat.json`);
if (!fs.existsSync(flatPath)) {
  console.error(
    `Missing flat pack: ${flatPath}\nGenerate it before activating.`,
  );
  process.exit(1);
}

function runBuild(): void {
  const buildScript = path.join(root, 'scripts/build-locale-from-flat.mts');
  const result = spawnSync(
    'npx',
    ['tsx', buildScript, locale!],
    {stdio: 'inherit', cwd: root, shell: process.platform === 'win32'},
  );
  if (result.status !== 0) {
    console.error('build-locale-from-flat.mts failed');
    process.exit(result.status ?? 1);
  }
}

function ensureLanguageModuleId(typesPath: string): boolean {
  let src = fs.readFileSync(typesPath, 'utf8');
  const arrayMatch = src.match(
    /export const LANGUAGE_MODULE_IDS = \[([^\]]*)\] as const;/,
  );
  if (!arrayMatch) {
    throw new Error('Could not find LANGUAGE_MODULE_IDS in types.ts');
  }
  const ids = arrayMatch[1]
    .split(',')
    .map(s => s.trim().replace(/['"]/g, ''))
    .filter(Boolean);
  if (ids.includes(locale!)) {
    console.log(`LANGUAGE_MODULE_IDS already includes '${locale}'`);
    return false;
  }
  ids.push(locale!);
  const nextArray = ids.map(id => `'${id}'`).join(', ');
  src = src.replace(
    /export const LANGUAGE_MODULE_IDS = \[[^\]]*\] as const;/,
    `export const LANGUAGE_MODULE_IDS = [${nextArray}] as const;`,
  );

  // Keep LANGUAGE_NATIVE_LABELS in sync with AppLanguage
  const labelsMatch = src.match(
    /export const LANGUAGE_NATIVE_LABELS: Record<AppLanguage, string> = \{([^}]*)\};/s,
  );
  if (!labelsMatch) {
    throw new Error('Could not find LANGUAGE_NATIVE_LABELS in types.ts');
  }
  if (!new RegExp(`\\b${locale}:`).test(labelsMatch[1])) {
    const entry = `  ${locale}: LOCALE_BY_ID.${locale}?.nativeName ?? '${NATIVE_FALLBACK[locale as Batch1Locale]}',\n`;
    const body = labelsMatch[1].replace(/\s*$/, '') + (labelsMatch[1].trimEnd().endsWith(',') ? '\n' : ',\n') + entry;
    src = src.replace(
      /export const LANGUAGE_NATIVE_LABELS: Record<AppLanguage, string> = \{([^}]*)\};/s,
      `export const LANGUAGE_NATIVE_LABELS: Record<AppLanguage, string> = {${body}};`,
    );
  }

  fs.writeFileSync(typesPath, src);
  console.log(`Appended '${locale}' to LANGUAGE_MODULE_IDS (+ native label)`);
  return true;
}

function ensureTranslationModule(indexPath: string): boolean {
  let src = fs.readFileSync(indexPath, 'utf8');
  const importLine = `import ${locale} from './${locale}';`;
  if (!src.includes(importLine) && !src.includes(`from './${locale}'`)) {
    // Insert after last translation import
    const importRe = /^import \w+ from '\.\/\w+';$/gm;
    let lastImport: RegExpExecArray | null = null;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(src)) !== null) {
      lastImport = m;
    }
    if (!lastImport) {
      throw new Error('Could not find translation imports in index.ts');
    }
    const insertAt = lastImport.index! + lastImport[0].length;
    src = src.slice(0, insertAt) + `\n${importLine}` + src.slice(insertAt);
  } else {
    console.log(`Import for '${locale}' already present in translations/index.ts`);
  }

  const modulesMatch = src.match(
    /export const TRANSLATION_MODULES = \{([^}]*)\} as const satisfies Record<AppLanguage, unknown>;/s,
  );
  if (!modulesMatch) {
    throw new Error('Could not find TRANSLATION_MODULES in index.ts');
  }
  const body = modulesMatch[1];
  if (new RegExp(`\\b${locale}\\b`).test(body)) {
    console.log(`TRANSLATION_MODULES already includes '${locale}'`);
    fs.writeFileSync(indexPath, src);
    return false;
  }
  const trimmed = body.replace(/\s*$/, '');
  const needsComma = trimmed.trim().length > 0 && !trimmed.trimEnd().endsWith(',');
  const nextBody = `${trimmed}${needsComma ? ',' : ''}\n  ${locale},\n`;
  src = src.replace(
    /export const TRANSLATION_MODULES = \{([^}]*)\} as const satisfies Record<AppLanguage, unknown>;/s,
    `export const TRANSLATION_MODULES = {${nextBody}} as const satisfies Record<AppLanguage, unknown>;`,
  );
  fs.writeFileSync(indexPath, src);
  console.log(`Added '${locale}' to TRANSLATION_MODULES`);
  return true;
}

console.log(`Activating Batch 1 locale wiring for '${locale}'…`);
runBuild();

const typesPath = path.join(root, 'src/i18n/types.ts');
const indexPath = path.join(root, 'src/i18n/translations/index.ts');
ensureLanguageModuleId(typesPath);
ensureTranslationModule(indexPath);

console.log(`
Done (module wiring only).
Reminder: do NOT set localeRegistry status to 'ready' yet.
Run the i18n coverage gate for '${locale}' first, then flip status manually when it passes.
`);
