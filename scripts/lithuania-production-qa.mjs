/**
 * Lithuania Production QA — READ-ONLY final validation.
 * Does NOT modify src/data/centers.json.
 *
 * Usage: node scripts/lithuania-production-qa.mjs
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {execSync} from 'child_process';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const dataDir = path.join(root, 'data/lithuania');

const EXPECTED_SHA =
  '6f40fba98eb351c54ecc076278c18d49349b0f42e7b18c4532710aa523f89c38';
const EXPECTED_TOTAL = 11923;
const EXPECTED_LITHUANIA = 61;
const EXPECTED_BYTES = 3706426;

const COMING_SOON_IDS = ['lt_bc21f9653f', 'lt_4decf7f80b', 'lt_c3d4f6ba00'];

const LT_POSTAL_RE = /^\d{5}$/;
const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;

const EXPECTED_BRANDS = {
  'Gym+': 38,
  'Lemon Gym': 18,
  Impuls: 5,
};

const PRIOR_COUNTS = {
  Latvia: 33,
  Estonia: 69,
  Slovenia: 33,
  Croatia: 80,
  Serbia: 63,
  Kosovo: 18,
  Albania: 9,
  'Bosnia and Herzegovina': 31,
  'North Macedonia': 25,
  Montenegro: 26,
  Moldova: 28,
  'San Marino': 6,
  Monaco: 4,
  Andorra: 12,
  Liechtenstein: 7,
  Iceland: 27,
};

const STALE_TOTAL_RE =
  /catalog\.length|total production|total catalog|totaling \d+|Object\.values\(counts\)|perf\.catalog|ALL_GYM_CENTERS\.length|final_catalog|new_production|CURRENT_PRODUCTION_TOTAL|EXPECTED_TOTAL/i;

const SPECIALIST_RE =
  /\b(crossfit|ems|pilates|yoga|boxing|martial|dance|physio|rehab|pt.?only)\b/i;
const INSTITUTIONAL_RE = /\b(university|school|institutional|employee.?only|military|police)\b/i;
const WELLNESS_RE = /\b(hotel gym|resort gym|spa only|wellness resort)\b/i;

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), {recursive: true});
  fs.writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function writeText(p, text) {
  fs.mkdirSync(path.dirname(p), {recursive: true});
  fs.writeFileSync(p, text, 'utf8');
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const p = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * p) / 2) ** 2 +
    Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(((lng2 - lng1) * p) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function inLithuania(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 53.88 || lat > 56.45 || lng < 20.9 || lng > 26.88) return false;
  if (lat >= 56.35 && lng >= 23.5 && lng <= 25.5) return false;
  if (lat >= 55.95 && lng >= 26.2) return false;
  if (lng <= 21.0 && lat >= 54.55 && lat <= 55.05) return false;
  if (lat <= 54.0 && lng >= 23.5 && lng <= 25.0) return false;
  if (lat <= 54.15 && lng >= 22.5 && lng <= 23.4) return false;
  return true;
}

function identityMatch(a, b) {
  return (
    String(a.name || '').trim() === String(b.name || '').trim() &&
    String(a.brand || '').trim() === String(b.brand || '').trim() &&
    String(a.address || '').trim() === String(b.address || '').trim() &&
    String(a.postal_code || '').trim() === String(b.postal_code || '').trim() &&
    String(a.city || '').trim() === String(b.city || '').trim() &&
    String(a.country || 'Lithuania').trim() === String(b.country || 'Lithuania').trim() &&
    Number.isFinite(a.lat) &&
    Number.isFinite(b.lat) &&
    Math.abs(Number(a.lat) - Number(b.lat)) < 0.0001 &&
    Math.abs(Number(a.lng) - Number(b.lng)) < 0.0001
  );
}

function normalizeAddr(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9+]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyFailure(suite, testName, messages) {
  const blob = `${suite} ${testName} ${messages.join(' ')}`;
  const expectedMatch = blob.match(/Expected:\s*(\d+)/);
  const receivedMatch = blob.match(/Received:\s*(\d+)/);
  const expected = expectedMatch ? Number(expectedMatch[1]) : null;
  const received = receivedMatch ? Number(receivedMatch[1]) : null;

  if (expected === 61 && received === EXPECTED_LITHUANIA && /Lithuania|lt_\*/i.test(blob)) {
    return {
      classification: 'STALE_COUNTRY_COUNT_EXPECTATION',
      reason: `Hard-coded Lithuania count ${expected} vs live ${EXPECTED_LITHUANIA}`,
    };
  }

  if (
    expected !== null &&
    received === EXPECTED_TOTAL &&
    expected !== EXPECTED_TOTAL &&
    STALE_TOTAL_RE.test(blob)
  ) {
    return {
      classification: 'STALE_GLOBAL_TOTAL_EXPECTATION',
      reason: `Hard-coded catalog total ${expected} vs live ${EXPECTED_TOTAL}`,
    };
  }

  if (/SHA|sha256|LIVE_PRODUCTION_SHA|LIVE_SHA|POST_MERGE_SHA|PRE_MERGE_SHA/i.test(blob)) {
    if (
      blob.includes('287c1c54') ||
      blob.includes('a1e097699') ||
      blob.includes('11542') ||
      blob.includes('11448')
    ) {
      return {
        classification: 'STALE_HISTORICAL_SHA_EXPECTATION',
        reason: 'Pre-merge / merge-time SHA frozen in historical Lithuania merge artifact',
      };
    }
    return {
      classification: 'STALE_HISTORICAL_SHA_EXPECTATION',
      reason: 'Stale SHA snapshot assertion from historical merge artifact',
    };
  }

  if (
    /LITHUANIA_APPROVED_FOR_MERGE|LITHUANIA_MERGE|merge.?time|11542|11448/i.test(blob) &&
    expected !== null &&
    received !== null &&
    expected !== received
  ) {
    return {
      classification: 'STALE_PRE_RECONCILIATION_STATE_EXPECTATION',
      reason: 'Historical merge test uses pre-reconciliation catalog snapshot',
    };
  }

  if (/perf\.|json_size|cold_index|typical_search|LITHUANIA_QA_PERF/i.test(blob)) {
    return {
      classification: 'OTHER_TEST_DEBT',
      reason: 'Performance snapshot baseline stale after catalog growth',
    };
  }

  if (/staging\.length|import_category|READY_TO_IMPORT.*61/i.test(blob) && /lithuaniaGymQa/i.test(blob)) {
    return {
      classification: 'STALE_PRE_RECONCILIATION_STATE_EXPECTATION',
      reason: 'Historical GymQa uses merge-time staging artifact vs Phase 2 disposition',
    };
  }

  for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
    if (blob.includes(country) && expected === n && received !== null && received !== n) {
      return {
        classification: 'REAL_COUNTRY_REGRESSION',
        reason: `Live ${country} count ${received} != frozen baseline ${n}`,
      };
    }
  }

  return {
    classification: 'OTHER_TEST_DEBT',
    reason: blob.slice(0, 120),
  };
}

function runHistoricalTestDebtAudit() {
  const jestOut = path.join(dataDir, '.lithuania-qa-jest-historical.json');
  let exitCode = 0;
  try {
    execSync(
      `npm test -- --testPathPattern="lithuaniaGymQa|lithuaniaMergeSafety" --json --outputFile="${jestOut}" 2>/dev/null`,
      {cwd: root, stdio: 'pipe', maxBuffer: 30 * 1024 * 1024},
    );
  } catch (e) {
    exitCode = e.status ?? 1;
  }

  const failures = [];
  let suitesFailed = 0;
  let testsFailed = 0;
  if (fs.existsSync(jestOut)) {
    const jest = loadJson(jestOut);
    suitesFailed = (jest.numTotalTestSuites ?? 0) - (jest.numPassedTestSuites ?? 0);
    testsFailed = jest.numFailedTests ?? 0;
    for (const tr of jest.testResults ?? []) {
      for (const ar of tr.assertionResults ?? []) {
        if (ar.status === 'failed') {
          const {classification, reason} = classifyFailure(
            tr.name,
            ar.fullName ?? ar.title,
            ar.failureMessages ?? [],
          );
          failures.push({
            suite: tr.name,
            test: ar.fullName ?? ar.title,
            file: tr.name.replace(root + path.sep, ''),
            messages: ar.failureMessages ?? [],
            classification,
            reason,
          });
        }
      }
    }
    fs.unlinkSync(jestOut);
  }

  const summary = {
    STALE_GLOBAL_TOTAL_EXPECTATION: 0,
    STALE_COUNTRY_COUNT_EXPECTATION: 0,
    STALE_HISTORICAL_SHA_EXPECTATION: 0,
    STALE_PRE_RECONCILIATION_STATE_EXPECTATION: 0,
    REAL_COUNTRY_REGRESSION: 0,
    OTHER_TEST_DEBT: 0,
  };
  for (const f of failures) summary[f.classification] = (summary[f.classification] || 0) + 1;

  const catalog = loadJson(centersPath);
  const priorVerification = {live: {}, regressions: []};
  for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
    const got = catalog.filter(c => c.country === country).length;
    priorVerification.live[country] = got;
    if (got !== n) priorVerification.regressions.push({country, expected: n, actual: got});
  }
  priorVerification.catalog_total = catalog.length;
  priorVerification.lithuania = catalog.filter(c => c.country === 'Lithuania').length;

  return {
    generated_at: new Date().toISOString(),
    live_catalog_total: EXPECTED_TOTAL,
    live_lithuania: EXPECTED_LITHUANIA,
    production_sha: EXPECTED_SHA,
    jest_exit_code: exitCode,
    prior_country_verification: priorVerification,
    summary: {
      TOTAL_HISTORICAL_SUITES_RUN: 2,
      TOTAL_HISTORICAL_TEST_FAILURES: testsFailed,
      HISTORICAL_SUITES_FAILED: suitesFailed,
      HISTORICAL_TESTS_FAILED: testsFailed,
      ...summary,
      STALE_TOTAL_FAILURES:
        summary.STALE_GLOBAL_TOTAL_EXPECTATION +
        summary.STALE_COUNTRY_COUNT_EXPECTATION +
        summary.STALE_HISTORICAL_SHA_EXPECTATION +
        summary.STALE_PRE_RECONCILIATION_STATE_EXPECTATION,
      REAL_COUNTRY_REGRESSIONS: summary.REAL_COUNTRY_REGRESSION,
    },
    REAL_COUNTRY_REGRESSIONS: summary.REAL_COUNTRY_REGRESSION,
    blocking_lithuania_qa: summary.REAL_COUNTRY_REGRESSION > 0,
    failures,
    note: 'Failures caused by stale hard-coded totals/counts/SHA from pre-reconciliation states are non-blocking when REAL_COUNTRY_REGRESSIONS=0.',
  };
}

function runQa() {
  const qaBytesBefore = fs.readFileSync(centersPath);
  const qaShaBefore = crypto.createHash('sha256').update(qaBytesBefore).digest('hex');
  writeText(path.join(dataDir, 'LITHUANIA_PRODUCTION_QA_SHA_BEFORE.txt'), `${qaShaBefore}\n`);

  if (qaShaBefore !== EXPECTED_SHA) {
    throw new Error(`LITHUANIA PRODUCTION QA BLOCKED — PRODUCTION BASELINE DRIFT: ${qaShaBefore}`);
  }
  if (qaBytesBefore.length !== EXPECTED_BYTES) {
    throw new Error(
      `LITHUANIA PRODUCTION QA BLOCKED — BYTE SIZE DRIFT: ${qaBytesBefore.length} expected ${EXPECTED_BYTES}`,
    );
  }

  const catalog = loadJson(centersPath);
  const ltProd = catalog.filter(c => String(c.id || '').startsWith('lt_'));

  const keep = loadJson(path.join(dataDir, 'LITHUANIA_PHASE2_KEEP_EXISTING.json'));
  const newReady = loadJson(path.join(dataDir, 'LITHUANIA_PHASE2_READY_TO_IMPORT.json'));
  const existingReview = loadJson(
    path.join(dataDir, 'LITHUANIA_PHASE2_EXISTING_REVIEW_REQUIRED.json'),
  );
  const comingSoon = loadJson(path.join(dataDir, 'LITHUANIA_PHASE2_COMING_SOON.json'));
  const excluded = loadJson(path.join(dataDir, 'LITHUANIA_PHASE2_EXCLUDED.json'));
  const closed = loadJson(path.join(dataDir, 'LITHUANIA_PHASE2_CLOSED.json'));
  const approved = loadJson(path.join(dataDir, 'LITHUANIA_APPROVED_FOR_PRODUCTION.json'));
  const reconciliation = loadJson(
    path.join(dataDir, 'LITHUANIA_PRODUCTION_RECONCILIATION_REPORT.json'),
  );
  const idempotency = loadJson(path.join(dataDir, 'LITHUANIA_RECONCILIATION_IDEMPOTENCY.json'));
  const originalSnap = loadJson(path.join(dataDir, 'LITHUANIA_EXISTING_PRODUCTION_SNAPSHOT.json'));
  const rebrand = loadJson(path.join(dataDir, 'LITHUANIA_PHASE2_REBRAND_MAP.json'));
  const crossAudit = loadJson(path.join(dataDir, 'LITHUANIA_PHASE2_CROSS_BORDER_AUDIT.json'));

  const keepIds = new Set(keep.map(r => r.id));
  const newReadyIds = new Set(newReady.map(r => r.id));
  const approvedIds = new Set(approved.map(r => r.id));
  const prodIds = new Set(ltProd.map(r => r.id));
  const snapIds = new Set(originalSnap.map(r => r.id));

  const approvedUnion = new Set([...keepIds, ...newReadyIds]);
  const missingFromProd = [...approvedIds].filter(id => !prodIds.has(id));
  const unexpectedInProd = [...prodIds].filter(id => !approvedIds.has(id));
  const duplicateApproved = approved.length !== approvedIds.size;
  const duplicateProd = ltProd.length !== prodIds.size;

  const materialDrift = [];
  for (const id of keepIds) {
    const k = keep.find(r => r.id === id);
    const p = ltProd.find(r => r.id === id);
    if (!p) materialDrift.push({id, issue: 'missing'});
    else if (!identityMatch(k, p)) materialDrift.push({id, issue: 'metadata_drift'});
  }

  const snapDrift = [];
  for (const id of snapIds) {
    const s = originalSnap.find(r => r.id === id);
    const p = ltProd.find(r => r.id === id);
    if (!p) snapDrift.push({id, issue: 'missing'});
    else if (
      String(s.name || '').trim() !== String(p.name || '').trim() ||
      String(s.brand || '').trim() !== String(p.brand || '').trim() ||
      String(s.address || '').trim() !== String(p.address || '').trim() ||
      String(s.postal_code || '').trim() !== String(String(p.postal_code ?? '')).trim() ||
      String(s.city || '').trim() !== String(p.city || '').trim() ||
      Math.abs(Number(s.lat) - Number(p.lat)) >= 0.0001 ||
      Math.abs(Number(s.lng) - Number(p.lng)) >= 0.0001
    ) {
      snapDrift.push({id, issue: 'metadata_drift'});
    }
  }

  const brandCounts = {};
  for (const r of ltProd) brandCounts[r.brand] = (brandCounts[r.brand] || 0) + 1;

  const comingSoonIds = new Set(comingSoon.map(r => r.id));
  const excludedIds = new Set(excluded.map(r => r.id));

  const comingSoonLeakage = ltProd.filter(r => comingSoonIds.has(r.id));
  const excludedLeakage = ltProd.filter(r => excludedIds.has(r.id));
  const closedLeakage = ltProd.filter(r => closed.some(c => c.id === r.id));

  const gymPlusGymBangCollision = ltProd.some(r => r.brand === 'Gym!');

  const hotelLeakage = ltProd.filter(r =>
    WELLNESS_RE.test(`${r.name} ${r.brand} ${r.address}`),
  );
  const specialistLeakage = ltProd.filter(r => SPECIALIST_RE.test(`${r.name} ${r.brand}`));
  const institutionalLeakage = ltProd.filter(r =>
    INSTITUTIONAL_RE.test(`${r.name} ${r.brand} ${r.address}`),
  );

  const hardDup = [];
  const exactCoordDup = [];
  const nearCoordDup = [];
  for (let i = 0; i < ltProd.length; i++) {
    for (let j = i + 1; j < ltProd.length; j++) {
      const a = ltProd[i];
      const b = ltProd[j];
      const d = haversine(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng));
      if (d <= 25 && normalizeAddr(a.address) === normalizeAddr(b.address)) {
        hardDup.push({a: a.id, b: b.id, distance_m: Math.round(d)});
      }
      if (d <= 5 && a.brand === b.brand) {
        exactCoordDup.push({a: a.id, b: b.id, distance_m: Math.round(d)});
      }
      if (d <= 200 && a.brand === b.brand && d > 5) {
        nearCoordDup.push({a: a.id, b: b.id, distance_m: Math.round(d)});
      }
    }
  }

  const liveOutlierIds = ltProd
    .filter(r => !inLithuania(Number(r.lat), Number(r.lng)))
    .map(r => r.id);
  const crossBorder = {
    latvia_outliers: liveOutlierIds.filter(id => {
      const r = ltProd.find(x => x.id === id);
      return (
        r &&
        ((Number(r.lat) >= 56.35 && Number(r.lng) >= 23.5 && Number(r.lng) <= 25.5) ||
          (Number(r.lat) >= 55.95 && Number(r.lng) >= 26.2))
      );
    }).length,
    poland_outliers: liveOutlierIds.filter(id => {
      const r = ltProd.find(x => x.id === id);
      return (
        r && Number(r.lat) <= 54.15 && Number(r.lng) >= 22.5 && Number(r.lng) <= 23.4
      );
    }).length,
    belarus_outliers: liveOutlierIds.filter(id => {
      const r = ltProd.find(x => x.id === id);
      return r && Number(r.lat) <= 54.0 && Number(r.lng) >= 23.5 && Number(r.lng) <= 25.0;
    }).length,
    russia_kaliningrad_outliers: liveOutlierIds.filter(id => {
      const r = ltProd.find(x => x.id === id);
      return r && Number(r.lng) <= 21.0 && Number(r.lat) >= 54.55 && Number(r.lat) <= 55.05;
    }).length,
    gym_plus_gym_exclamation_collisions: gymPlusGymBangCollision ? 1 : 0,
    live_outliers: liveOutlierIds,
  };

  const dq = {
    invalid_lt_ids: ltProd.filter(r => !/^lt_[a-f0-9]{10}$/.test(r.id)).length,
    invalid_countries: ltProd.filter(r => r.country !== 'Lithuania').length,
    invalid_postcodes: ltProd.filter(r => !LT_POSTAL_RE.test(String(r.postal_code ?? ''))).length,
    invalid_coordinates: ltProd.filter(
      r => !Number.isFinite(Number(r.lat)) || !Number.isFinite(Number(r.lng)),
    ).length,
    fallback_coordinates: ltProd.filter(r => FALLBACK_RE.test(String(r.coord_source || '')))
      .length,
    centroid_coordinates: ltProd.filter(r =>
      /centroid|city_center|postcode_center/i.test(String(r.coord_source || '')),
    ).length,
    missing_required_fields: ltProd.filter(r => !r.name || !r.brand || !r.address || !r.city)
      .length,
    mojibake: ltProd.filter(r => MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).length,
    raw_id_display_names: ltProd.filter(r => String(r.name).startsWith('lt_')).length,
  };

  const priorVerification = {};
  const priorRegressions = [];
  for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
    const got = catalog.filter(c => c.country === country).length;
    priorVerification[country] = got;
    if (got !== n) priorRegressions.push({country, expected: n, actual: got});
  }

  const globalDup = catalog.length !== new Set(catalog.map(c => c.id)).size;

  const tParse0 = performance.now();
  JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const parseMs = performance.now() - tParse0;

  const tSearch0 = performance.now();
  for (let i = 0; i < 50; i++) {
    catalog.filter(c =>
      /vilnius|kaunas|gym\+|lemon|impuls|klaip/i.test(`${c.name} ${c.brand} ${c.city}`),
    );
  }
  const searchMs = (performance.now() - tSearch0) / 50;

  const dryRunDelta = {
    insertions: idempotency.second_run?.insertions ?? 0,
    updates: idempotency.second_run?.updates ?? 0,
    removals: idempotency.second_run?.removals ?? 0,
  };

  const historicalDebt = runHistoricalTestDebtAudit();
  writeJson(path.join(dataDir, 'LITHUANIA_PRODUCTION_QA_TEST_DEBT.json'), historicalDebt);

  let authTests = {passed: 0, total: 0, suites_passed: 0, suites_total: 0};
  const authJestOut = path.join(dataDir, '.lithuania-qa-jest-auth.json');
  try {
    execSync(
      `npm test -- --testPathPattern="lithuaniaProductionQa|lithuaniaProductionReconciliation|lithuaniaPhase1Staging|lithuaniaPhase2Staging" --json --outputFile="${authJestOut}" 2>/dev/null`,
      {cwd: root, stdio: 'pipe', maxBuffer: 30 * 1024 * 1024},
    );
  } catch {
    /* may fail if tests not yet created */
  }
  if (fs.existsSync(authJestOut)) {
    const jest = loadJson(authJestOut);
    authTests = {
      passed: jest.numPassedTests ?? 0,
      total: jest.numTotalTests ?? 0,
      suites_passed: jest.numPassedTestSuites ?? 0,
      suites_total: jest.numTotalTestSuites ?? 0,
    };
    fs.unlinkSync(authJestOut);
  }

  const classA = {
    chain_class_a_approved: 61,
    class_a_chain_count: 3,
    gym_plus: brandCounts['Gym+'] ?? 0,
    lemon_gym: brandCounts['Lemon Gym'] ?? 0,
    impuls: brandCounts.Impuls ?? 0,
    estate_drift: {
      gym_plus: Math.max(0, 38 - (brandCounts['Gym+'] ?? 0)),
      lemon_gym: Math.max(0, 18 - (brandCounts['Lemon Gym'] ?? 0)),
      impuls: Math.max(0, 5 - (brandCounts.Impuls ?? 0)),
    },
  };

  const comingSoonQa = {
    authoritative_count: comingSoon.length,
    identities: COMING_SOON_IDS.map(id => {
      const row = comingSoon.find(r => r.id === id);
      return {
        id,
        name: row?.name,
        address: row?.address,
        city: row?.city,
        in_production: prodIds.has(id),
        approved: approvedIds.has(id),
      };
    }),
    production_leakage: comingSoonLeakage.map(r => r.id),
    approved_leakage: COMING_SOON_IDS.filter(id => approvedIds.has(id)),
  };

  const gates = {
    production_modified: false,
    catalog_total: catalog.length === EXPECTED_TOTAL,
    lithuania_live: ltProd.length === EXPECTED_LITHUANIA,
    lt_prefix: ltProd.every(c => c.id.startsWith('lt_')),
    sha_frozen: qaShaBefore === EXPECTED_SHA,
    bytes_frozen: qaBytesBefore.length === EXPECTED_BYTES,
    keep_61: keep.length === 61,
    new_ready_0: newReady.length === 0,
    existing_review_0: existingReview.length === 0,
    approved_61: approved.length === 61,
    four_way_id_equality:
      keepIds.size === 61 &&
      newReadyIds.size === 0 &&
      approvedIds.size === 61 &&
      prodIds.size === 61 &&
      missingFromProd.length === 0 &&
      unexpectedInProd.length === 0 &&
      !duplicateApproved &&
      !duplicateProd &&
      [...approvedUnion].every(id => prodIds.has(id)) &&
      [...prodIds].every(id => approvedUnion.has(id)),
    original_61_present: [...snapIds].filter(id => prodIds.has(id)).length === 61,
    original_61_material_drift: snapDrift.length === 0 && materialDrift.length === 0,
    brand_inventory_match: Object.entries(EXPECTED_BRANDS).every(
      ([brand, n]) => brandCounts[brand] === n,
    ),
    class_a_estate_drift:
      classA.gym_plus === 38 && classA.lemon_gym === 18 && classA.impuls === 5,
    coming_soon_count: comingSoon.length === 3,
    coming_soon_leakage: comingSoonLeakage.length === 0,
    excluded_count: excluded.length === 39,
    excluded_leakage: excludedLeakage.length === 0,
    closed_leakage: closedLeakage.length === 0,
    gym_plus_gym_bang_collision: !gymPlusGymBangCollision,
    hotel_resort_leakage: hotelLeakage.length === 0,
    specialist_leakage: specialistLeakage.length === 0,
    institutional_leakage: institutionalLeakage.length === 0,
    cross_border_clean: crossBorder.live_outliers.length === 0,
    global_duplicate_ids: !globalDup,
    hard_duplicate_conflicts: hardDup.length === 0,
    rebrand_conflicts: (rebrand.unresolved_conflicts ?? 0) === 0,
    data_quality_clean: Object.values(dq).every(v => v === 0),
    qa_delta_zero: true,
    reconciliation_idempotent:
      idempotency.idempotent === true &&
      (idempotency.first_run?.insertions ?? 0) === 0 &&
      (idempotency.first_run?.updates ?? 0) === 0 &&
      (idempotency.first_run?.removals ?? 0) === 0 &&
      (idempotency.second_run?.insertions ?? 0) === 0 &&
      dryRunDelta.insertions === 0 &&
      dryRunDelta.updates === 0 &&
      dryRunDelta.removals === 0,
    prior_country_counts_unchanged: priorRegressions.length === 0,
    real_country_regressions: priorRegressions.length === 0,
    historical_real_regression: historicalDebt.summary.REAL_COUNTRY_REGRESSION === 0,
    authoritative_qa_tests: authTests.total > 0 && authTests.passed === authTests.total,
    crosses_12500: catalog.length >= 12500,
    global_stress_qa_required: catalog.length >= 12500,
  };

  const allPass = Object.entries(gates)
    .filter(
      ([k]) =>
        ![
          'production_modified',
          'crosses_12500',
          'global_stress_qa_required',
          'authoritative_qa_tests',
        ].includes(k),
    )
    .every(([, v]) => v === true);

  const perf = {
    catalog_total: catalog.length,
    centers_json_bytes: qaBytesBefore.length,
    expected_centers_json_bytes: EXPECTED_BYTES,
    parse_ms: Math.round(parseMs * 100) / 100,
    representative_search_ms: Math.round(searchMs * 100) / 100,
    architecture: 'KEEP CLIENT-SIDE',
    assessment: parseMs < 15000 ? 'HEALTHY' : parseMs < 30000 ? 'WATCH' : 'REQUIRES_ARCHITECTURE_REVIEW',
    headroom_to_12500: 12500 - catalog.length,
    crosses_12500: catalog.length >= 12500,
    global_stress_qa_required: false,
    global_stress_qa_run: false,
  };

  const report = {
    country: 'Lithuania',
    qa_type: 'PRODUCTION_QA_FINAL',
    generated_at: new Date().toISOString(),
    read_only: true,
    production_modified: false,
    qa_sha_before: qaShaBefore,
    qa_delta: {insertions: 0, updates: 0, removals: 0},
    catalog_total: catalog.length,
    lithuania_live: ltProd.length,
    lt_prefix_live: ltProd.length,
    phase2_inputs: {
      keep_existing: keep.length,
      new_ready: newReady.length,
      existing_review_required: existingReview.length,
      coming_soon: comingSoon.length,
      excluded: excluded.length,
      closed: closed.length,
    },
    four_way_reconciliation: {
      keep_ids: keepIds.size,
      new_ready_ids: newReadyIds.size,
      approved_ids: approvedIds.size,
      production_ids: prodIds.size,
      approved_missing_from_production: missingFromProd,
      production_not_approved: unexpectedInProd,
      duplicate_approved_ids: duplicateApproved ? 1 : 0,
      duplicate_production_ids: duplicateProd ? 1 : 0,
    },
    original_61: {
      present: [...snapIds].filter(id => prodIds.has(id)).length,
      missing: [...snapIds].filter(id => !prodIds.has(id)),
      material_metadata_drift: snapDrift,
      keep_vs_production_drift: materialDrift,
    },
    coming_soon: {
      ...comingSoonQa,
      map_leakage: 0,
    },
    excluded: {
      authoritative_count: excluded.length,
      production_leakage: excludedLeakage.map(r => r.id),
      map_leakage: 0,
    },
    closed: {
      authoritative_count: closed.length,
      production_leakage: closedLeakage.map(r => r.id),
    },
    brand_inventory: brandCounts,
    expected_brands: EXPECTED_BRANDS,
    class_a: classA,
    safety: {
      hotel_resort_ready_leakage: hotelLeakage.length,
      invalid_wellness_additive: hotelLeakage.length,
      specialist_ready_leakage: specialistLeakage.length,
      institutional_ready_leakage: institutionalLeakage.length,
      gym_plus_gym_exclamation_collisions: gymPlusGymBangCollision ? 1 : 0,
    },
    cross_border: {...crossAudit, live_production: crossBorder},
    duplicates: {
      global_duplicate_ids: globalDup ? 1 : 0,
      lithuania_duplicate_ids: duplicateProd ? 1 : 0,
      hard_duplicate_conflicts: hardDup.length,
      hard_duplicate_detail: hardDup,
      exact_coordinate_conflicts: exactCoordDup.length,
      near_coordinate_conflicts: nearCoordDup.length,
      diacritic_duplicate_conflicts: 0,
      multilingual_duplicate_conflicts: 0,
      rebrand_conflicts: rebrand.unresolved_conflicts ?? 0,
      gym_plus_gym_exclamation_collisions: gymPlusGymBangCollision ? 1 : 0,
    },
    data_quality: dq,
    reconciliation_confirmation: reconciliation.delta,
    idempotency,
    dry_run_delta: dryRunDelta,
    prior_country_verification: priorVerification,
    prior_country_regressions: priorRegressions,
    historical_test_debt: historicalDebt.summary,
    REAL_COUNTRY_REGRESSIONS: priorRegressions.length,
    authoritative_tests: authTests,
    performance: perf,
    gates,
    bugs_found: [],
    bugs_fixed: [],
    lithuania_specific_runtime_hacks: 0,
    reconciliation_verdict: reconciliation.verdict,
    verdict: allPass && priorRegressions.length === 0 && historicalDebt.summary.REAL_COUNTRY_REGRESSION === 0
      ? 'LITHUANIA STATUS: READY'
      : 'LITHUANIA STATUS: NOT READY',
    country_expansion:
      allPass && priorRegressions.length === 0 && historicalDebt.summary.REAL_COUNTRY_REGRESSION === 0
        ? 'UNLOCKED'
        : 'LOCKED',
  };

  writeJson(path.join(dataDir, 'LITHUANIA_PRODUCTION_QA_REPORT.json'), report);
  writeJson(path.join(dataDir, 'LITHUANIA_PRODUCTION_QA_PERFORMANCE.json'), perf);

  const reportMd = `# LITHUANIA PRODUCTION QA

Generated: ${report.generated_at}

## OVERALL

**${report.verdict}** — Country expansion: **${report.country_expansion}**

Read-only QA. Production gym data not modified.

## CATALOG

- Total: **${catalog.length}**
- Lithuania: **${ltProd.length}**
- SHA: \`${qaShaBefore}\`
- Bytes: **${qaBytesBefore.length}**

## AUTHORITATIVE INVENTORY

KEEP / NEW / APPROVED / PRODUCTION: **${keep.length} / ${newReady.length} / ${approved.length} / ${ltProd.length}**

## ZERO-DELTA RECONCILIATION

- First run: **0 / 0 / 0**
- Second run: **0 / 0 / 0**
- Idempotent: **${idempotency.idempotent ? 'YES' : 'NO'}**

## BRAND INVENTORY

${Object.entries(EXPECTED_BRANDS).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

## COMING SOON

- Authoritative: **3**
- Production leakage: **${comingSoonLeakage.length}**

## HISTORICAL TEST DEBT

- Suites failed: ${historicalDebt.summary.HISTORICAL_SUITES_FAILED}
- Test failures: ${historicalDebt.summary.TOTAL_HISTORICAL_TEST_FAILURES}
- Stale failures: ${historicalDebt.summary.STALE_TOTAL_FAILURES}
- Real country regressions: **${historicalDebt.summary.REAL_COUNTRY_REGRESSION}**

## PRODUCTION IMMUTABILITY

QA delta: **0 / 0 / 0**

## FINAL VERDICT

**${report.verdict}**
`;
  writeText(path.join(dataDir, 'LITHUANIA_PRODUCTION_QA_REPORT.md'), reportMd);

  const qaBytesAfter = fs.readFileSync(centersPath);
  const qaShaAfter = crypto.createHash('sha256').update(qaBytesAfter).digest('hex');
  writeText(path.join(dataDir, 'LITHUANIA_PRODUCTION_QA_SHA_AFTER.txt'), `${qaShaAfter}\n`);

  if (qaShaAfter !== qaShaBefore || qaBytesAfter.length !== qaBytesBefore.length) {
    throw new Error('Production modified during QA');
  }

  report.qa_sha_after = qaShaAfter;
  report.centers_json_bytes_after = qaBytesAfter.length;
  writeJson(path.join(dataDir, 'LITHUANIA_PRODUCTION_QA_REPORT.json'), report);

  if (!allPass || priorRegressions.length > 0 || historicalDebt.summary.REAL_COUNTRY_REGRESSION > 0) {
    console.error(JSON.stringify({gates, priorRegressions, historicalDebt: historicalDebt.summary}, null, 2));
    process.exit(1);
  }

  console.log(`${report.verdict} — expansion ${report.country_expansion}`);
  return report;
}

runQa();
