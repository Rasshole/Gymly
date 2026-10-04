/**
 * Shared i18n coverage analysis (used by CLI report + Jest).
 * English deep-merge alone must NOT produce PASS for a ready locale.
 */

'use strict';

/** Required product UI namespaces (prefix of leaf keys). */
const REQUIRED_NAMESPACE_PREFIXES = [
  'language.',
  'auth.',
  'register.',
  'home.',
  'checkIn.',
  'workoutLog.',
  'profile.',
  'friends.',
  'messages.',
  'chat.',
  'sayHi.',
  'groups.',
  'badges.',
  'leaderboard.',
  'settings.',
  'notifications.',
  'errors.',
  'shop.',
  'common.',
  'permissions.',
  'addPr.',
  'editProfile.',
];

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') {
      out[key] = v;
    } else if (v && typeof v === 'object') {
      flatten(v, key, out);
    }
  }
  return out;
}

function keysMatchingPrefix(keys, prefix) {
  return keys.filter(k => k.startsWith(prefix));
}

/**
 * @param {object} opts
 * @param {Record<string,string>} opts.enFlat
 * @param {Record<string,string>} opts.localeFlat
 * @param {string} opts.localeId
 * @param {'FULLY_LOCALIZED'|'CANONICAL_GYM_ENGLISH_ALLOWED'} [opts.exerciseNamePolicy]
 * @param {string[]} [opts.exerciseLibraryIds]
 * @param {Record<string,string>} [opts.exerciseOverrides] id→name for this locale
 * @param {string[]} [opts.badgeIds]
 * @param {boolean} [opts.isEnglishMaster]
 */
function analyzeLocaleCoverage(opts) {
  const {
    enFlat,
    localeFlat,
    localeId,
    exerciseNamePolicy = 'CANONICAL_GYM_ENGLISH_ALLOWED',
    exerciseLibraryIds = [],
    exerciseOverrides = {},
    badgeIds = [],
    isEnglishMaster = localeId === 'en',
  } = opts;

  const enKeys = Object.keys(enFlat);
  const locKeys = Object.keys(localeFlat);
  const enCount = enKeys.length;
  const locCount = locKeys.length;

  const missing = enKeys.filter(k => !(k in localeFlat));
  const extra = locKeys.filter(k => !(k in enFlat));
  const covered = enCount - missing.length;
  const coveragePct = enCount === 0 ? 0 : (covered / enCount) * 100;

  let identicalToEn = 0;
  for (const k of enKeys) {
    if (k in localeFlat && localeFlat[k] === enFlat[k]) {
      identicalToEn += 1;
    }
  }

  const namespaceIssues = [];
  for (const prefix of REQUIRED_NAMESPACE_PREFIXES) {
    const required = keysMatchingPrefix(enKeys, prefix);
    if (required.length === 0) {
      continue;
    }
    const miss = required.filter(k => !(k in localeFlat));
    if (miss.length > 0) {
      namespaceIssues.push({
        prefix,
        missing: miss.length,
        sample: miss.slice(0, 5),
      });
    }
  }

  // Prefer catalog ids present on the English master (source of truth for i18n).
  const catalogIdsFromEn = [
    ...new Set(
      Object.keys(enFlat)
        .map(k => {
          const m = /^badges\.catalog\.([^.]+)\.name$/.exec(k);
          return m ? m[1] : null;
        })
        .filter(Boolean),
    ),
  ];
  const catalogIds =
    catalogIdsFromEn.length > 0 ? catalogIdsFromEn : badgeIds;

  const badgeIssues = [];
  for (const id of catalogIds) {
    const nameKey = `badges.catalog.${id}.name`;
    const descKey = `badges.catalog.${id}.description`;
    if (!(nameKey in localeFlat)) {
      badgeIssues.push(nameKey);
    }
    if (!(descKey in localeFlat)) {
      badgeIssues.push(descKey);
    }
  }

  const overrideCount = Object.keys(exerciseOverrides).length;
  const libraryCount = exerciseLibraryIds.length;
  let exerciseOk = true;
  let exerciseNote = '';
  if (isEnglishMaster || exerciseNamePolicy === 'CANONICAL_GYM_ENGLISH_ALLOWED') {
    exerciseOk = true;
    exerciseNote = `policy=CANONICAL_GYM_ENGLISH_ALLOWED overrides=${overrideCount}/${libraryCount || '?'}`;
  } else if (exerciseNamePolicy === 'FULLY_LOCALIZED') {
    const missingEx = exerciseLibraryIds.filter(id => !exerciseOverrides[id]);
    // Allow tiny drift (≤2%) so parser/library sync noise does not fail shipped packs.
    const maxMissing = Math.max(0, Math.ceil(libraryCount * 0.02));
    exerciseOk = missingEx.length <= maxMissing;
    exerciseNote = `policy=FULLY_LOCALIZED overrides=${overrideCount}/${libraryCount} missing=${missingEx.length} (max ${maxMissing})`;
  }

  // PASS requires: full key parity for required namespaces + all EN keys present.
  // English deep-merge is NOT considered completeness.
  const keyParityOk = missing.length === 0;
  const namespacesOk = namespaceIssues.length === 0;
  const badgesOk = badgeIssues.length === 0;
  const verdict =
    (isEnglishMaster || (keyParityOk && namespacesOk && badgesOk && exerciseOk))
      ? 'READY'
      : 'FAIL';

  return {
    localeId,
    enCount,
    locCount,
    missingCount: missing.length,
    extraCount: extra.length,
    coveragePct,
    identicalToEn,
    missing: missing.slice(0, 40),
    extra: extra.slice(0, 20),
    namespaceIssues,
    badgeIssues: badgeIssues.slice(0, 20),
    exerciseOk,
    exerciseNote,
    verdict,
    // Explicit: runtime EN merge must not be treated as translation
    englishMergeDoesNotCountAsComplete: true,
  };
}

module.exports = {
  REQUIRED_NAMESPACE_PREFIXES,
  flatten,
  analyzeLocaleCoverage,
};
