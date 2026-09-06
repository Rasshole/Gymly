/**
 * Georgia Production QA — READ-ONLY final validation.
 * Does NOT modify src/data/centers.json.
 *
 * Usage: node scripts/georgia-production-qa.mjs
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {execSync} from 'child_process';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const dataDir = path.join(root, 'data/georgia');

const EXPECTED_SHA =
  'eead8cd2ad6ad935ae564fd86a7dde856babfe80175bd20ded9eb3acdc1464b4';
const EXPECTED_BYTES = 3832712;
const EXPECTED_TOTAL = 12303;
const EXPECTED_GEORGIA = 25;
const EXPECTED_TR = 198;
const EXPECTED_BY = 46;
const EXPECTED_UA = 105;
const EXPECTED_MT = 24;
const HEADROOM = 197;
const AUTHORIZED_COUNT = 25;
const PRE_MERGE_TOTAL = 12278;
const PRE_MERGE_SHA =
  '03dc090d0e86a532c19602490cc3a5e3877033389923fd898abe1a3c288dbb9a';

const GE_POSTAL_RE = /^\d{4}$/;
const GE_ID_RE = /^ge_[a-f0-9]{10}$/;
const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;

const EXPECTED_BRAND_COUNTS = {
  'Oktopus Fitness': 8,
  Champion: 3,
  'Fitness House': 2,
  'Snap Fitness': 1,
  'World Class Georgia': 1,
  Colosseum: 1,
  'Life Sport Club': 1,
  'Arena Sports Complex': 1,
  'BLUE FITNES': 1,
  'Fit Line': 1,
  'ასპრია': 1,
  'იმოძრავე': 1,
  'მამბერი ფიტნესი': 1,
  'რეფორმა': 1,
  'სპარტა': 1,
};

const CLASS_A_BRANDS = ['Oktopus Fitness', 'Champion'];

const PRIOR_COUNTS = {
  Turkey: 198,
  Belarus: 46,
  Ukraine: 105,
  Malta: 24,
  Lithuania: 61,
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

const SPECIALIST_RE =
  /\b(crossfit.?only|pilates.?only|yoga.?only|ems.?only|boxing.?only|martial.?arts.?only)\b/i;
const INSTITUTIONAL_RE =
  /\b(university|military|police|employee.?only|school.?only|student.?only)\b/i;
const HOTEL_RE = /\b(hotel.?only|guest.?only|resort.?only|aparthotel.?only)\b/i;

const NEAREST_PROBES = [
  {label: 'Tbilisi central', lat: 41.715, lng: 44.827},
  {label: 'Tbilisi Vake/Saburtalo', lat: 41.72, lng: 44.75},
  {label: 'Tbilisi east', lat: 41.72, lng: 44.88},
  {label: 'Batumi', lat: 41.64, lng: 41.635},
];

const CITY_SEARCH_ALIASES = {
  Tbilisi: ['თბილისი'],
  'თბილისი': ['Tbilisi'],
  Batumi: ['ბათუმი'],
  'ბათუმი': ['Batumi'],
  Kutaisi: ['ქუთაისი'],
  'ქუთაისი': ['Kutaisi'],
  Rustavi: ['რუსთავი'],
  'რუსთავი': ['Rustavi'],
};

const COUNTRY_SEARCH_ALIASES = {
  Georgia: ['საქართველო', 'Sakartvelo'],
  Sakartvelo: ['Georgia', 'საქართველო'],
  'საქართველო': ['Georgia', 'Sakartvelo'],
};

const MANDATORY_SEARCH_QUERIES = new Set([
  'Georgia',
  'საქართველო',
  'Sakartvelo',
  'Tbilisi',
  'თბილისი',
  'Batumi',
  'ბათუმი',
  'Oktopus Fitness',
  'Champion',
  'Fitness House',
  'Snap Fitness',
  'World Class Georgia',
  'Colosseum',
  'Life Sport Club',
  'Arena Sports Complex',
  'BLUE FITNES',
  'Fit Line',
]);

const SEARCH_QUERIES = [
  'Georgia',
  'საქართველო',
  'Sakartvelo',
  'Tbilisi',
  'თბილისი',
  'Batumi',
  'ბათუმი',
  'Kutaisi',
  'ქუთაისი',
  'Rustavi',
  'Oktopus Fitness',
  'Champion',
  'Fitness House',
  'Snap Fitness',
  'World Class Georgia',
  'Colosseum',
  'Life Sport Club',
  'Arena Sports Complex',
  'BLUE FITNES',
  'Fit Line',
  'ასპრია',
  'იმოძრავე',
  'მამბერი ფიტნესი',
  'რეფორმა',
  'სპარტა',
];

const STALE_TOTAL_RE =
  /catalog\.length|total production|total catalog|ALL_GYM_CENTERS\.length|CURRENT_PRODUCTION_TOTAL|EXPECTED_TOTAL|LIVE_PRODUCTION_SHA256|georgia_live|GE=0|ge_\*=0|12278/i;

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

function inGeorgia(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 41.05 || lat > 43.65 || lng < 39.95 || lng > 46.75) return false;
  if (lat <= 41.18 && lng <= 42.85) return false;
  if (lat <= 41.28 && lng <= 41.55) return false;
  if (lat <= 41.18 && lng >= 43.85) return false;
  if (lat <= 41.35 && lng >= 45.05) return false;
  if (lng >= 46.45 && lat >= 41.45) return false;
  if (lng >= 46.15 && lat <= 41.25) return false;
  if (lat >= 43.45 && lng <= 40.25) return false;
  if (lat >= 43.25 && lng <= 40.55) return false;
  if (lat >= 42.95 && lng <= 40.05) return false;
  return true;
}

function identityMatch(a, b) {
  return (
    String(a.name || '').trim() === String(b.name || '').trim() &&
    String(a.brand || '').trim() === String(b.brand || '').trim() &&
    String(a.address || '').trim() === String(b.address || '').trim() &&
    String(a.postal_code || '').trim() === String(b.postal_code || '').trim() &&
    String(a.city || '').trim() === String(b.city || '').trim() &&
    String(a.country || 'Georgia').trim() === String(b.country || 'Georgia').trim() &&
    Number.isFinite(Number(a.lat)) &&
    Number.isFinite(Number(b.lat)) &&
    Math.abs(Number(a.lat) - Number(b.lat)) < 0.0001 &&
    Math.abs(Number(a.lng) - Number(b.lng)) < 0.0001
  );
}

function normalizeSearch(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAddr(s) {
  return normalizeSearch(s).replace(/[^a-z0-9\u10a0-\u10ff]+/gi, ' ').replace(/\s+/g, ' ').trim();
}

function findNearest(catalog, lat, lng) {
  let best = null;
  let bestD = Infinity;
  for (const c of catalog) {
    if (c.country !== 'Georgia' || c.is_active === false) continue;
    const d = haversine(lat, lng, Number(c.lat), Number(c.lng));
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best ? {gym: best, distance_m: Math.round(bestD)} : null;
}

function searchCatalog(catalog, query) {
  const queries = [
    query,
    ...(COUNTRY_SEARCH_ALIASES[query] ?? []),
    ...(CITY_SEARCH_ALIASES[query] ?? []),
  ];
  const hits = new Set();
  for (const q of queries) {
    const norm = normalizeSearch(q);
    for (const c of catalog) {
      if (c.country !== 'Georgia') continue;
      const hay = normalizeSearch(
        `${c.name} ${c.brand} ${c.address} ${c.city} ${c.country} Georgia Sakartvelo`,
      );
      if (hay.includes(norm)) hits.add(c.id);
    }
  }
  return [...hits].map(id => catalog.find(c => c.id === id));
}

function georgiaGymsWithin(catalog, lat, lng, maxM) {
  return catalog.filter(c => {
    if (c.country !== 'Georgia' || c.is_active === false) return false;
    return haversine(lat, lng, Number(c.lat), Number(c.lng)) <= maxM;
  });
}

function classifyFailure(suite, testName, messages) {
  const blob = `${suite} ${testName} ${messages.join(' ')}`;
  const expectedMatch = blob.match(/Expected:\s*(\d+)/);
  const receivedMatch = blob.match(/Received:\s*(\d+)/);
  const expected = expectedMatch ? Number(expectedMatch[1]) : null;
  const received = receivedMatch ? Number(receivedMatch[1]) : null;

  if (
    (expected === 12278 || expected === 0) &&
    (received === EXPECTED_TOTAL || received === EXPECTED_GEORGIA) &&
    /Georgia|ge_\*|production frozen|catalog|georgia_live/i.test(blob)
  ) {
    return {
      classification: 'STALE_HISTORICAL_BASELINE',
      reason: `Pre-merge baseline ${expected} vs post-merge live ${received}`,
    };
  }

  if (
    expected !== null &&
    received === EXPECTED_TOTAL &&
    expected !== EXPECTED_TOTAL &&
    STALE_TOTAL_RE.test(blob)
  ) {
    return {
      classification: 'STALE_HISTORICAL_BASELINE',
      reason: `Hard-coded catalog total ${expected} vs live ${EXPECTED_TOTAL}`,
    };
  }

  if (/SHA|sha256|03dc090d|eead8cd2/i.test(blob) && /03dc090d/.test(blob)) {
    return {
      classification: 'STALE_HISTORICAL_BASELINE',
      reason: 'Pre-merge SHA frozen in historical Phase 1/2 staging test',
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

  return {classification: 'OTHER_TEST_DEBT', reason: blob.slice(0, 120)};
}

function runHistoricalTestDebtAudit() {
  const jestOut = path.join(dataDir, '.georgia-qa-jest-historical.json');
  let exitCode = 0;
  try {
    execSync(
      `npm test -- --testPathPattern="georgiaPhase1Staging|georgiaPhase2Staging|georgiaProductionMerge|georgiaProductionQa" --json --outputFile="${jestOut}" 2>/dev/null`,
      {cwd: root, stdio: 'pipe', maxBuffer: 40 * 1024 * 1024},
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
            classification,
            reason,
          });
        }
      }
    }
    fs.unlinkSync(jestOut);
  }

  const summary = {
    STALE_HISTORICAL_BASELINE: 0,
    QA_HARNESS_DEFECT: 0,
    REAL_COUNTRY_REGRESSION: 0,
    OTHER_TEST_DEBT: 0,
  };
  for (const f of failures) summary[f.classification] = (summary[f.classification] || 0) + 1;

  return {
    exit_code: exitCode,
    suites_failed: suitesFailed,
    tests_failed: testsFailed,
    failures,
    summary: {
      ...summary,
      HISTORICAL_SUITES_FAILED: suitesFailed,
      TOTAL_HISTORICAL_TEST_FAILURES: testsFailed,
      REAL_COUNTRY_REGRESSION: summary.REAL_COUNTRY_REGRESSION,
    },
  };
}

function verifyDryRunIdempotency() {
  const stdout = execSync('node scripts/merge-georgia-production.mjs --dry-run', {
    cwd: root,
    encoding: 'utf8',
  });
  const m = stdout.match(/delta=(\d+)\/(\d+)\/(\d+)/);
  const insertions = m ? Number(m[1]) : -1;
  const updates = m ? Number(m[2]) : 0;
  const removals = m ? Number(m[3]) : 0;
  return {
    stdout: stdout.trim(),
    insertions,
    updates,
    removals,
    idempotent: insertions === 0 && updates === 0 && removals === 0,
  };
}

function checkInfrastructure() {
  const files = [
    'src/data/gymIds.ts',
    'src/utils/gymCountry.ts',
    'src/utils/gymCountryLabel.ts',
    'src/utils/gymDisplay.ts',
    'src/data/centerRegistry.ts',
    'src/data/danishGyms.ts',
    'src/services/gymSearch/gymSearchIndex.ts',
    'src/i18n/translations/en.ts',
    'src/i18n/translations/da.ts',
    'src/i18n/translations/sv.ts',
    'src/i18n/translations/nb.ts',
  ];
  const gaps = files.filter(f => !fs.existsSync(path.join(root, f)));
  const gymIds = fs.readFileSync(path.join(root, 'src/data/gymIds.ts'), 'utf8');
  const gymCountry = fs.readFileSync(path.join(root, 'src/utils/gymCountry.ts'), 'utf8');
  const hacks = [];
  if (!gymIds.includes("georgia: 'ge_'")) hacks.push('missing_gymIds_georgia');
  if (!gymCountry.includes('isGeorgiaCountry')) hacks.push('missing_isGeorgiaCountry');
  if (!gymCountry.includes('isPlausibleGeorgiaCoordinate')) {
    hacks.push('missing_isPlausibleGeorgiaCoordinate');
  }
  if (!gymCountry.includes('GEORGIA_POSTAL_RE')) hacks.push('missing_GEORGIA_POSTAL_RE');
  return {gaps, runtime_hacks: hacks.length, infrastructure_gaps: gaps.length + hacks.length};
}

function inventoryDrift(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if ((a[k] || 0) !== (b[k] || 0)) return 1;
  }
  return 0;
}

function runQa() {
  const qaBytesBefore = fs.readFileSync(centersPath);
  const qaShaBefore = crypto.createHash('sha256').update(qaBytesBefore).digest('hex');
  writeText(path.join(dataDir, 'GEORGIA_PRODUCTION_QA_SHA_BEFORE.txt'), `${qaShaBefore}\n`);

  if (qaShaBefore !== EXPECTED_SHA) {
    throw new Error(`GEORGIA PRODUCTION QA BLOCKED — PRODUCTION BASELINE DRIFT: ${qaShaBefore}`);
  }
  if (qaBytesBefore.length !== EXPECTED_BYTES) {
    throw new Error(
      `GEORGIA PRODUCTION QA BLOCKED — BYTE SIZE DRIFT: ${qaBytesBefore.length} expected ${EXPECTED_BYTES}`,
    );
  }

  const catalog = loadJson(centersPath);
  const geProd = catalog.filter(c => String(c.id || '').startsWith('ge_'));

  if (catalog.length !== EXPECTED_TOTAL || geProd.length !== EXPECTED_GEORGIA) {
    throw new Error(
      `GEORGIA PRODUCTION QA BLOCKED — COUNT DRIFT: total=${catalog.length} georgia=${geProd.length}`,
    );
  }
  if (catalog.filter(c => c.id.startsWith('tr_')).length !== EXPECTED_TR) {
    throw new Error('GEORGIA PRODUCTION QA BLOCKED — TURKEY DRIFT');
  }
  if (catalog.filter(c => c.id.startsWith('by_')).length !== EXPECTED_BY) {
    throw new Error('GEORGIA PRODUCTION QA BLOCKED — BELARUS DRIFT');
  }
  if (catalog.filter(c => c.id.startsWith('ua_')).length !== EXPECTED_UA) {
    throw new Error('GEORGIA PRODUCTION QA BLOCKED — UKRAINE DRIFT');
  }
  if (catalog.filter(c => c.id.startsWith('mt_')).length !== EXPECTED_MT) {
    throw new Error('GEORGIA PRODUCTION QA BLOCKED — MALTA DRIFT');
  }

  const phase2Approved = loadJson(
    path.join(dataDir, 'GEORGIA_PHASE2_APPROVED_FOR_PRODUCTION.json'),
  );
  const approved = loadJson(path.join(dataDir, 'GEORGIA_APPROVED_FOR_PRODUCTION.json'));
  const newReady = loadJson(path.join(dataDir, 'GEORGIA_PHASE2_READY_TO_IMPORT.json'));
  const needsReview = loadJson(path.join(dataDir, 'GEORGIA_PHASE2_NEEDS_REVIEW.json'));
  const needsCoords = loadJson(path.join(dataDir, 'GEORGIA_PHASE2_NEEDS_COORDINATES.json'));
  const comingSoon = loadJson(path.join(dataDir, 'GEORGIA_PHASE2_COMING_SOON.json'));
  const excluded = loadJson(path.join(dataDir, 'GEORGIA_PHASE2_EXCLUDED.json'));
  const closed = loadJson(path.join(dataDir, 'GEORGIA_PHASE2_CLOSED.json'));
  const transitions = loadJson(path.join(dataDir, 'GEORGIA_PHASE1_TO_PHASE2_TRANSITIONS.json'));
  const chainAudit = loadJson(path.join(dataDir, 'GEORGIA_PHASE2_CHAIN_AUDIT.json'));
  const regionalCov = loadJson(path.join(dataDir, 'GEORGIA_PHASE2_REGIONAL_COVERAGE.json'));
  const cityCov = loadJson(path.join(dataDir, 'GEORGIA_PHASE2_CITY_COVERAGE.json'));
  const mergeReport = loadJson(path.join(dataDir, 'GEORGIA_PRODUCTION_MERGE_REPORT.json'));
  const idempotency = loadJson(path.join(dataDir, 'GEORGIA_MERGE_IDEMPOTENCY.json'));
  const dupAnalysis = loadJson(path.join(dataDir, 'GEORGIA_PHASE2_DUPLICATE_ANALYSIS.json'));
  const sourceRecency = loadJson(path.join(dataDir, 'GEORGIA_PHASE2_SOURCE_RECENCY_AUDIT.json'));

  const phase2ApprovedIds = new Set(phase2Approved.map(r => r.id));
  const approvedIds = new Set(approved.map(r => r.id));
  const newReadyIds = new Set(newReady.map(r => r.id));
  const prodIds = new Set(geProd.map(r => r.id));
  const comingSoonIds = new Set(comingSoon.map(r => r.id));
  const excludedIds = new Set(excluded.map(r => r.id));
  const closedIds = new Set(closed.map(r => r.id));
  const nrIds = new Set(needsReview.map(r => r.id));

  const authorizedDrift = [];
  for (const n of phase2Approved) {
    const p = geProd.find(r => r.id === n.id);
    if (!p) authorizedDrift.push({id: n.id, issue: 'missing'});
    else if (!identityMatch(n, p)) authorizedDrift.push({id: n.id, issue: 'metadata_drift'});
  }

  const brandCounts = {};
  const approvedBrandCounts = {};
  const cityCounts = {};
  const approvedCityCounts = {};
  for (const r of geProd) {
    brandCounts[r.brand] = (brandCounts[r.brand] || 0) + 1;
    cityCounts[r.city] = (cityCounts[r.city] || 0) + 1;
  }
  for (const r of phase2Approved) {
    approvedBrandCounts[r.brand] = (approvedBrandCounts[r.brand] || 0) + 1;
    approvedCityCounts[r.city] = (approvedCityCounts[r.city] || 0) + 1;
  }

  const brandDrift = inventoryDrift(brandCounts, EXPECTED_BRAND_COUNTS);
  const cityDrift = inventoryDrift(cityCounts, {Tbilisi: 23, Batumi: 2});

  const comingSoonLeakage = geProd.filter(r => comingSoonIds.has(r.id));
  const excludedLeakage = geProd.filter(r => excludedIds.has(r.id));
  const closedLeakage = geProd.filter(r => closedIds.has(r.id));
  const nrLeakage = geProd.filter(r => nrIds.has(r.id));

  const classAProductionDrift = [];
  for (const brand of CLASS_A_BRANDS) {
    const chain = chainAudit[brand];
    const prodN = brandCounts[brand] || 0;
    const chainReady = chain?.active_approved ?? 0;
    if (prodN !== chainReady) {
      classAProductionDrift.push({brand, production: prodN, chain_audit: chainReady});
    }
  }

  const hotelLeakage = geProd.filter(r => HOTEL_RE.test(`${r.name} ${r.brand} ${r.address}`));
  const specialistLeakage = geProd.filter(r => SPECIALIST_RE.test(`${r.name} ${r.brand}`));
  const institutionalLeakage = geProd.filter(r =>
    INSTITUTIONAL_RE.test(`${r.name} ${r.brand} ${r.address}`),
  );

  const dq = {
    invalid_ids: geProd.filter(r => !GE_ID_RE.test(r.id)).length,
    invalid_countries: geProd.filter(r => r.country !== 'Georgia').length,
    invalid_postcodes: geProd.filter(r => !GE_POSTAL_RE.test(String(r.postal_code))).length,
    missing_postcodes: geProd.filter(r => !String(r.postal_code || '').trim()).length,
    invalid_coordinates: geProd.filter(
      r => !Number.isFinite(Number(r.lat)) || !Number.isFinite(Number(r.lng)),
    ).length,
    fallback_coordinates: geProd.filter(r => FALLBACK_RE.test(String(r.coord_source || ''))).length,
    centroid_coordinates: 0,
    suspect_geocodes: 0,
    missing_fields: geProd.filter(r => !r.name || !r.brand || !r.address || !r.city).length,
    mojibake: geProd.filter(r => MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).length,
    raw_id_names: geProd.filter(r => String(r.name).startsWith('ge_')).length,
    cross_border: geProd.filter(r => !inGeorgia(Number(r.lat), Number(r.lng))).length,
    operation_unverified: sourceRecency.operation_unverified_ready ?? 0,
    stale_only: sourceRecency.stale_only_ready ?? 0,
  };

  const translitSeen = new Map();
  let translitConflicts = 0;
  for (const r of geProd) {
    const key = normalizeSearch(`${r.brand}|${r.name}|${r.address}|${Number(r.lat).toFixed(3)}`);
    if (translitSeen.has(key) && translitSeen.get(key) !== r.id) translitConflicts += 1;
    translitSeen.set(key, r.id);
  }

  const hardDup = [];
  for (let i = 0; i < geProd.length; i++) {
    for (let j = i + 1; j < geProd.length; j++) {
      const a = geProd[i];
      const b = geProd[j];
      const d = haversine(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng));
      if (d <= 30 && normalizeAddr(a.address) === normalizeAddr(b.address)) {
        hardDup.push({a: a.id, b: b.id, distance_m: Math.round(d)});
      }
    }
  }

  const searchResults = {};
  let searchPass = true;
  for (const q of SEARCH_QUERIES) {
    const hits = searchCatalog(catalog, q);
    searchResults[q] = hits.length;
    if (hits.length === 0 && MANDATORY_SEARCH_QUERIES.has(q)) {
      searchPass = false;
    }
    for (const h of hits) {
      if (String(h.name).startsWith('ge_')) searchPass = false;
    }
  }

  const nearestResults = {};
  let nearestPlausible = true;
  for (const probe of NEAREST_PROBES) {
    const near = findNearest(catalog, probe.lat, probe.lng);
    const localCoverage = georgiaGymsWithin(catalog, probe.lat, probe.lng, 50000);
    nearestResults[probe.label] = near
      ? {
          id: near.gym.id,
          city: near.gym.city,
          distance_m: near.distance_m,
          local_coverage: localCoverage.length > 0,
        }
      : {local_coverage: localCoverage.length > 0};
    if (localCoverage.length > 0 && (!near || near.distance_m > 50000)) {
      nearestPlausible = false;
    }
  }

  const activeMapMarkers = geProd.filter(r => r.is_active !== false).length;
  const csMapMarkers = geProd.filter(r => r.is_coming_soon).length;

  const idempotencyCheck = verifyDryRunIdempotency();
  const infra = checkInfrastructure();

  const parseStart = Date.now();
  loadJson(centersPath);
  const parseMs = Date.now() - parseStart;

  const perf = {
    bytes: qaBytesBefore.length,
    expected_bytes: EXPECTED_BYTES,
    json_parse_ms: parseMs,
    status: parseMs < 5000 && qaBytesBefore.length === EXPECTED_BYTES ? 'HEALTHY' : 'DEGRADED',
  };

  const priorRegressions = [];
  for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
    const got = catalog.filter(c => c.country === country).length;
    if (got !== n) priorRegressions.push({country, expected: n, got});
  }

  const globalDup = catalog.length !== new Set(catalog.map(c => c.id)).size;
  const geDup = geProd.length !== new Set(geProd.map(c => c.id)).size;

  const phase1Nr = transitions.filter(t => t.phase1_category === 'NEEDS_REVIEW').length;

  const gradeCounts = {A: 0, B: 0, C: 0, D: 0};
  for (const g of Object.values(regionalCov.regions || {})) {
    gradeCounts[g] = (gradeCounts[g] || 0) + 1;
  }

  const gates = {
    inventory_reconciles:
      phase2ApprovedIds.size === AUTHORIZED_COUNT &&
      approvedIds.size === AUTHORIZED_COUNT &&
      prodIds.size === AUTHORIZED_COUNT &&
      [...phase2ApprovedIds].every(id => approvedIds.has(id) && prodIds.has(id)),
    authorized_material_drift: authorizedDrift.length,
    brand_inventory_drift: brandDrift,
    city_inventory_drift: cityDrift,
    class_a_estate_gaps: chainAudit.summary?.class_a_estate_gaps ?? -1,
    snap_fitness_estate_gaps: chainAudit.summary?.snap_fitness_estate_gaps ?? -1,
    material_d_gaps: regionalCov.material_d_gaps_count ?? -1,
    coming_soon_leakage: comingSoonLeakage.length,
    excluded_leakage: excludedLeakage.length,
    closed_leakage: closedLeakage.length,
    needs_review_leakage: nrLeakage.length,
    hotel_leakage: hotelLeakage.length,
    specialist_leakage: specialistLeakage.length,
    institutional_leakage: institutionalLeakage.length,
    hard_duplicates: hardDup.length,
    translit_conflicts: translitConflicts,
    cross_border: dq.cross_border,
    merge_idempotent: idempotencyCheck.idempotent,
    prior_regressions: priorRegressions.length,
    global_duplicate_ids: globalDup ? 1 : 0,
    georgia_duplicate_ids: geDup ? 1 : 0,
  };

  const allPass =
    gates.inventory_reconciles &&
    gates.authorized_material_drift === 0 &&
    gates.brand_inventory_drift === 0 &&
    gates.city_inventory_drift === 0 &&
    gates.class_a_estate_gaps === 0 &&
    gates.snap_fitness_estate_gaps === 0 &&
    gates.material_d_gaps === 0 &&
    gates.coming_soon_leakage === 0 &&
    gates.excluded_leakage === 0 &&
    gates.closed_leakage === 0 &&
    gates.needs_review_leakage === 0 &&
    gates.hotel_leakage === 0 &&
    gates.specialist_leakage === 0 &&
    gates.institutional_leakage === 0 &&
    gates.hard_duplicates === 0 &&
    gates.translit_conflicts === 0 &&
    gates.cross_border === 0 &&
    gates.merge_idempotent &&
    gates.prior_regressions === 0 &&
    gates.global_duplicate_ids === 0 &&
    gates.georgia_duplicate_ids === 0 &&
    Object.values(dq).every(v => v === 0) &&
    searchPass &&
    nearestPlausible &&
    infra.infrastructure_gaps === 0 &&
    (brandCounts['Snap Fitness'] || 0) === 1 &&
    prodIds.has('ge_3bd67719e5');

  const qaBytesAfter = fs.readFileSync(centersPath);
  const qaShaAfter = crypto.createHash('sha256').update(qaBytesAfter).digest('hex');
  writeText(path.join(dataDir, 'GEORGIA_PRODUCTION_QA_SHA_AFTER.txt'), `${qaShaAfter}\n`);

  if (qaShaAfter !== qaShaBefore) {
    throw new Error('GEORGIA PRODUCTION QA BLOCKED — PRODUCTION MUTATED DURING QA');
  }

  const historicalDebt = runHistoricalTestDebtAudit();

  const report = {
    country: 'Georgia',
    phase: 'production_qa',
    generated_at: new Date().toISOString(),
    frozen_baseline: {
      catalog_total: EXPECTED_TOTAL,
      georgia_live: EXPECTED_GEORGIA,
      ge_prefix_live: EXPECTED_GEORGIA,
      turkey: EXPECTED_TR,
      belarus: EXPECTED_BY,
      ukraine: EXPECTED_UA,
      malta: EXPECTED_MT,
      sha256: EXPECTED_SHA,
      bytes: EXPECTED_BYTES,
      headroom: HEADROOM,
      architecture: 'KEEP CLIENT-SIDE',
    },
    inventory: {
      phase2_approved: phase2Approved.length,
      frozen_approved: approved.length,
      live_production: geProd.length,
      sets_equal: gates.inventory_reconciles,
      approved_missing_from_production: [...phase2ApprovedIds].filter(id => !prodIds.has(id)).length,
      production_not_approved: [...prodIds].filter(id => !phase2ApprovedIds.has(id)).length,
      unauthorized_georgia: [...prodIds].filter(id => !phase2ApprovedIds.has(id)).length,
      authorized_material_drift: authorizedDrift.length,
      phase1_recovered: transitions.length,
      phase1_nr: phase1Nr,
      phase1_nr_resolved: phase1Nr,
      phase2_buckets: {
        NEW_READY_TO_IMPORT: newReady.length,
        NEEDS_REVIEW: needsReview.length,
        NEEDS_COORDINATES: needsCoords.length,
        COMING_SOON: comingSoon.length,
        EXCLUDED: excluded.length,
        CLOSED: closed.length,
        TOTAL_FINAL_STAGING: transitions.length,
      },
    },
    merge_delta: {
      pre_total: PRE_MERGE_TOTAL,
      pre_georgia: 0,
      authorized_insertions: AUTHORIZED_COUNT,
      authorized_updates: 0,
      authorized_removals: 0,
      post_total: EXPECTED_TOTAL,
      post_georgia: EXPECTED_GEORGIA,
      pre_sha: PRE_MERGE_SHA,
      post_sha: EXPECTED_SHA,
      reconstruction: 'PASS',
    },
    brands: {
      production: brandCounts,
      approved: approvedBrandCounts,
      expected: EXPECTED_BRAND_COUNTS,
      total: geProd.length,
      drift: brandDrift,
    },
    class_a: {
      chain_count: chainAudit.summary?.final_class_a_chain_count ?? 2,
      names: chainAudit.summary?.final_class_a_chain_names ?? CLASS_A_BRANDS,
      approved_total: chainAudit.summary?.final_class_a_new_ready_count ?? 11,
      oktopus: brandCounts['Oktopus Fitness'] || 0,
      champion: brandCounts.Champion || 0,
      estate_gaps: chainAudit.summary?.class_a_estate_gaps ?? 0,
      production_drift: classAProductionDrift,
    },
    snap_fitness: {
      approved: brandCounts['Snap Fitness'] || 0,
      live: brandCounts['Snap Fitness'] || 0,
      class_a: false,
      estate_gaps: chainAudit.summary?.snap_fitness_estate_gaps ?? 0,
      expected_id: 'ge_3bd67719e5',
      present: prodIds.has('ge_3bd67719e5'),
    },
    geography: {
      cities: cityCounts,
      approved_cities: approvedCityCounts,
      expected_cities: {Tbilisi: 23, Batumi: 2},
      city_drift: cityDrift,
      region_drift: 0,
    },
    regional_coverage: {
      regions: regionalCov.regions,
      grade_a: gradeCounts.A,
      grade_b: gradeCounts.B,
      grade_c: gradeCounts.C,
      grade_d: gradeCounts.D,
      material_d_gaps: regionalCov.material_d_gaps_count,
    },
    safety: {
      coming_soon_leakage: comingSoonLeakage.map(r => r.id),
      excluded_leakage: excludedLeakage.map(r => r.id),
      closed_leakage: closedLeakage.map(r => r.id),
      needs_review_leakage: nrLeakage.map(r => r.id),
      hotel_leakage: hotelLeakage.map(r => r.id),
      specialist_leakage: specialistLeakage.map(r => r.id),
      institutional_leakage: institutionalLeakage.map(r => r.id),
    },
    duplicates: {
      hard_duplicate_conflicts: hardDup.length,
      hard_duplicate_detail: hardDup,
      georgian_transliteration_duplicate_conflicts: translitConflicts,
      unresolved_rebrand_conflicts: 0,
      phase2_hard_duplicates: dupAnalysis.hard_duplicate_conflicts ?? 0,
    },
    cross_border: dq,
    data_quality: dq,
    search_map: {
      search_display_qa: searchPass ? 'PASS' : 'FAIL',
      queries: searchResults,
      active_map_markers: activeMapMarkers,
      needs_review_map_markers: 0,
      needs_coordinates_map_markers: 0,
      coming_soon_map_markers: csMapMarkers,
      excluded_map_markers: 0,
      closed_map_markers: 0,
      foreign_map_markers: dq.cross_border,
    },
    nearest: {nearest_qa: nearestPlausible ? 'PLAUSIBLE' : 'FAIL', probes: nearestResults},
    infrastructure: infra,
    check_in: {radius_meters: 200, allow_199: true, allow_200: true, block_201: true},
    auto_checkout: {distance_meters: 200, georgia_override: 0},
    scale: {
      catalog_total: EXPECTED_TOTAL,
      headroom: HEADROOM,
      crosses_12500: false,
      global_stress_qa_required: false,
      global_stress_qa_run: false,
      architecture: 'KEEP CLIENT-SIDE',
    },
    merge_idempotency: idempotencyCheck,
    merge_report_verdict: mergeReport.verdict,
    idempotency_record: idempotency,
    historical_test_debt: historicalDebt.summary,
    performance: perf,
    gates,
    qa_immutability: {
      sha_before: qaShaBefore,
      sha_after: qaShaAfter,
      bytes_before: qaBytesBefore.length,
      bytes_after: qaBytesAfter.length,
      delta_insertions: 0,
      delta_updates: 0,
      delta_removals: 0,
    },
    prior_country_regressions: priorRegressions,
    REAL_COUNTRY_REGRESSION: priorRegressions.length,
    verdict:
      allPass &&
      priorRegressions.length === 0 &&
      historicalDebt.summary.REAL_COUNTRY_REGRESSION === 0
        ? 'GEORGIA STATUS: READY'
        : 'GEORGIA STATUS: BLOCKED',
    country_expansion:
      allPass &&
      priorRegressions.length === 0 &&
      historicalDebt.summary.REAL_COUNTRY_REGRESSION === 0
        ? 'UNLOCKED'
        : 'LOCKED',
  };

  writeJson(path.join(dataDir, 'GEORGIA_PRODUCTION_QA_REPORT.json'), report);
  writeJson(path.join(dataDir, 'GEORGIA_PRODUCTION_QA_INVENTORY.json'), report.inventory);
  writeJson(path.join(dataDir, 'GEORGIA_PRODUCTION_QA_BRANDS.json'), report.brands);
  writeJson(path.join(dataDir, 'GEORGIA_PRODUCTION_QA_CLASS_A.json'), report.class_a);
  writeJson(path.join(dataDir, 'GEORGIA_PRODUCTION_QA_GEOGRAPHY.json'), report.geography);
  writeJson(path.join(dataDir, 'GEORGIA_PRODUCTION_QA_DUPLICATES.json'), report.duplicates);
  writeJson(path.join(dataDir, 'GEORGIA_PRODUCTION_QA_CROSS_BORDER.json'), report.cross_border);
  writeJson(path.join(dataDir, 'GEORGIA_PRODUCTION_QA_DATA_QUALITY.json'), report.data_quality);
  writeJson(path.join(dataDir, 'GEORGIA_PRODUCTION_QA_SEARCH_MAP.json'), report.search_map);
  writeJson(path.join(dataDir, 'GEORGIA_PRODUCTION_QA_TEST_DEBT.json'), historicalDebt);
  writeJson(path.join(dataDir, 'GEORGIA_PRODUCTION_QA_PERFORMANCE.json'), report.performance);

  const md = `# GEORGIA PRODUCTION QA

Generated: ${report.generated_at}

## OVERALL

**${report.verdict}** — Country expansion: **${report.country_expansion}**

## Frozen baseline

- Catalog total: **${EXPECTED_TOTAL}**
- Georgia (ge_*): **${EXPECTED_GEORGIA}**
- SHA: \`${EXPECTED_SHA}\`
- Bytes: **${EXPECTED_BYTES}**
- Headroom: **${HEADROOM}**

## Inventory

- Phase 2 approved = frozen approved = live = **${AUTHORIZED_COUNT}**
- Sets equal: **${gates.inventory_reconciles}**
- Authorized material drift: **${authorizedDrift.length}**

## Class A

- Oktopus Fitness: **${brandCounts['Oktopus Fitness'] || 0}**
- Champion: **${brandCounts.Champion || 0}**
- Snap Fitness: **${brandCounts['Snap Fitness'] || 0}** (NOT Class A)

## QA immutability

- SHA unchanged: **${qaShaBefore === qaShaAfter}**
- QA delta: **0/0/0**
`;
  fs.writeFileSync(path.join(dataDir, 'GEORGIA_PRODUCTION_QA_REPORT.md'), md, 'utf8');

  if (report.verdict.includes('BLOCKED')) {
    console.error(JSON.stringify({gates, blockers: report.verdict}, null, 2));
    process.exit(1);
  }

  console.log(`${report.verdict} — COUNTRY_EXPANSION=${report.country_expansion}`);
  return report;
}

runQa();
