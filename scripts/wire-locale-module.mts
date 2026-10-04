/**
 * Wire a newly built translation pack into LANGUAGE_MODULE_IDS + TRANSLATION_MODULES.
 * Does NOT set registry ready.
 *
 * Usage: npx tsx scripts/wire-locale-module.mts fi
 */
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const locale = process.argv[2];
if (!locale) {
  console.error('Usage: npx tsx scripts/wire-locale-module.mts <locale>');
  process.exit(1);
}

const packPath = path.join(root, 'src/i18n/translations', `${locale}.ts`);
if (!fs.existsSync(packPath)) {
  console.error('Missing pack', packPath);
  process.exit(1);
}

function safeIdent(id: string): string {
  return id.replace(/[^A-Za-z0-9_]/g, '_').replace(/^([^A-Za-z_])/, '_$1');
}

const ident = safeIdent(locale);
const typesPath = path.join(root, 'src/i18n/types.ts');
const indexPath = path.join(root, 'src/i18n/translations/index.ts');

let types = fs.readFileSync(typesPath, 'utf8');
const idsMatch = types.match(
  /export const LANGUAGE_MODULE_IDS = \[([\s\S]*?)\] as const;/,
);
if (!idsMatch) {
  throw new Error('LANGUAGE_MODULE_IDS not found');
}
const idsBlock = idsMatch[1];
if (!idsBlock.includes(`'${locale}'`)) {
  const newBlock = idsBlock.replace(/\n\]/, `\n  '${locale}',\n]`);
  // fix - the closing is `] as const` - insert before ]
  const inserted = idsBlock.trimEnd().replace(/,?$/, ',') + `\n  '${locale}',\n`;
  types = types.replace(idsMatch[0], `export const LANGUAGE_MODULE_IDS = [${inserted}] as const;`);
  fs.writeFileSync(typesPath, types);
  console.log('Added to LANGUAGE_MODULE_IDS:', locale);
} else {
  console.log('Already in LANGUAGE_MODULE_IDS:', locale);
}

let index = fs.readFileSync(indexPath, 'utf8');
const importLine = `import ${ident} from './${locale}';`;
if (!index.includes(importLine) && !index.includes(`from './${locale}'`)) {
  index = index.replace(
    /(import pt from '\.\/pt';\n)/,
    `$1${importLine}\n`,
  );
  // if pt import pattern missing, append after last import from translations
  if (!index.includes(importLine)) {
    index = index.replace(
      /(import \w+ from '\.\/[^']+';\n)(\n\/\*\*)/,
      `$1${importLine}\n$2`,
    );
  }
  if (!index.includes(importLine)) {
    // fallback: after en import
    index = index.replace(
      /(import en from '\.\/en';\n)/,
      `$1${importLine}\n`,
    );
  }
}

const modulesMatch = index.match(
  /export const TRANSLATION_MODULES = \{([\s\S]*?)\} as const/,
);
if (!modulesMatch) {
  throw new Error('TRANSLATION_MODULES not found');
}
if (!modulesMatch[1].includes(locale.includes('-') ? `'${locale}'` : locale)) {
  const entry = locale.includes('-') || !/^[a-z]+$/.test(locale)
    ? `  '${locale}': ${ident},`
    : `  ${ident},`;
  const body = modulesMatch[1].trimEnd().replace(/,?$/, ',') + `\n${entry}\n`;
  index = index.replace(
    modulesMatch[0],
    `export const TRANSLATION_MODULES = {${body}} as const`,
  );
  console.log('Added to TRANSLATION_MODULES:', locale);
} else {
  console.log('Already in TRANSLATION_MODULES:', locale);
}

fs.writeFileSync(indexPath, index);
console.log('Wired', locale, 'as', ident);
