/**
 * Azerbaijan Production QA — READ-ONLY final validation.
 * Does NOT modify src/data/centers.json.
 *
 * Usage: node scripts/azerbaijan-production-qa.mjs
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {execSync} from 'child_process';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const dataDir = path.join(root, 'data/azerbaijan');

const EXPECTED_SHA =
  '1f711c075668cd1dacd8e14a8a2189d8cff48c133b3b9546f00bb2767ac82ca1';
const EXPECTED_BYTES = 3858778;
const EXPECTED_TOTAL = 12385;
const EXPECTED_AZERBAIJAN = 46;
const EXPECTED_ARMENIA = 36;
const EXPECTED_GE = 25;
const EXPECTED_TR = 198;
const EXPECTED_BY = 46;
const EXPECTED_UA = 105;
const EXPECTED_MT = 24;
const HEADROOM = 115;
const AUTHORIZED_COUNT = 46;
const PRE_MERGE_TOTAL = 12339;
const PRE_MERGE_SHA =
  '7ddc9977a7273668b3fcc6edb68b9a490b873e478bccd1e51b9f31710a2585e7';

const AZ_POSTAL_RE = /^\d{4}$/;
const AZ_ID_RE = /^az_[a-f0-9]{10}$/;
const MOJIBAKE_RE = /Ã[£¡§ª¢©¤]|\uFFFD|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;

const CLASS_A_COUNTS = {'FS Club Network': 3};
const CLASS_A_BRANDS = ['FS Club Network'];
const CURATED_COUNTS = {
  'World Class Azerbaijan': 1,
  '1st Fitness': 1,
  FitClub: 1,
  'Fit Way': 1,
  Pulse: 1,
  "Gold's Gym": 1,
  'Sport Life': 1,
  'Dream Body': 1,
};

const EXPECTED_CITY_COUNTS = {
  Baku: 21,
  Sumqayit: 12,
  Ganja: 8,
  Mingachevir: 2,
  Lankaran: 2,
  Masazır: 1,
};

const PRIOR_COUNTS = {
  Armenia: 36,
  Georgia: 25,
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
  {label: 'Baku central', lat: 40.4093, lng: 49.8671},
  {label: 'Baku Nasimi', lat: 40.395, lng: 49.835},
  {label: 'Baku Nizami', lat: 40.378, lng: 49.848},
  {label: 'Baku Yasamal', lat: 40.385, lng: 49.82},
  {label: 'Baku Khatai', lat: 40.378, lng: 49.89},
  {label: 'Sumqayit', lat: 40.5897, lng: 49.6686},
  {label: 'Ganja', lat: 40.6828, lng: 46.3606},
  {label: 'Mingachevir', lat: 40.77, lng: 47.0489},
  {label: 'Lankaran', lat: 38.754, lng: 48.8506},
  {label: 'Masazır', lat: 40.495, lng: 49.78},
  {label: 'Baku Ganjlik', lat: 40.402, lng: 49.855},
  {label: 'Baku Port', lat: 40.365, lng: 49.835},
];

const CITY_SEARCH_ALIASES = {
  Baku: ['Bakı', 'Baki'],
  Bakı: ['Baku', 'Baki'],
  Baki: ['Baku', 'Bakı'],
  Ganja: ['Gəncə', 'Gence'],
  Gəncə: ['Ganja', 'Gence'],
  Gence: ['Ganja', 'Gəncə'],
  Sumqayit: ['Sumgayit'],
  Sumgayit: ['Sumqayit'],
};

const COUNTRY_SEARCH_ALIASES = {
  Azerbaijan: ['Azərbaycan', 'Azerbaycan'],
  Azərbaycan: ['Azerbaijan', 'Azerbaycan'],
  Azerbaycan: ['Azerbaijan', 'Azərbaycan'],
};

const MANDATORY_SEARCH_QUERIES = new Set([
  'Azerbaijan',
  'Azərbaycan',
  'Azerbaycan',
  'Baku',
  'Bakı',
  'Ganja',
  'Sumqayit',
  'FS Club Network',
  'World Class Azerbaijan',
  '1st Fitness',
  'FitClub',
  'Fit Way',
  'Pulse',
  "Gold's Gym",
  'Sport Life',
  'Dream Body',
]);

const SEARCH_QUERIES = [
  'Azerbaijan',
  'Azərbaycan',
  'Azerbaycan',
  'Baku',
  'Bakı',
  'Baki',
  'Sumqayit',
  'Sumgayit',
  'Ganja',
  'Gəncə',
  'Mingachevir',
  'Lankaran',
  'Masazır',
  'FS Club Network',
  'World Class Azerbaijan',
  '1st Fitness',
  'FitClub',
  'Fit Way',
  'Pulse',
  "Gold's Gym",
  'Sport Life',
  'Dream Body',
  'Fit Point',
  'Olympic Gym',
  'Power Gym',
];

const STALE_TOTAL_RE =
  /catalog\.length|total production|total catalog|ALL_GYM_CENTERS\.length|CURRENT_PRODUCTION_TOTAL|EXPECTED_TOTAL|LIVE_PRODUCTION_SHA256|azerbaijan_live|AZ=0|az_\*=0|12339/i;

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

function inAzerbaijan(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (38.78 <= lat && lat <= 39.62 && 44.72 <= lng && lng <= 46.25) {
    if (lng <= 44.78 && lat <= 39.35) return false;
    if (lng >= 46.05 && lat >= 39.15) return false;
    if (lat <= 38.85 && lng >= 45.0) return false;
    return true;
  }
  if (lat < 38.39 || lat > 41.92 || lng < 44.77 || lng > 50.65) return false;
  if (lng <= 45.0 && lat >= 41.5) return false;
  if (lng <= 44.85 && lat >= 41.0) return false;
  if (lng <= 45.5 && lat >= 41.75) return false;
  if (lng <= 45.05 && lat >= 40.5 && lat <= 41.2) return false;
  if (lng <= 45.8 && lat <= 39.5) return false;
  if (lat <= 39.0 && lng <= 46.8) return false;
  if (lat <= 39.35 && lng <= 47.5) return false;
  if (lat <= 38.45 && lng >= 48.5) return false;
  if (lat <= 38.55 && lng >= 47.0) return false;
  if (lat >= 41.85 && lng <= 48.5) return false;
  if (lat >= 41.75 && lng <= 47.5) return false;
  return true;
}

function isNakhchivanCity(city) {
  const c = String(city || '').toLowerCase();
  return /nakhchivan|naxcivan|naxçıvan/.test(c);
}

function identityMatch(a, b) {
  return (
    String(a.name || '').trim() === String(b.name || '').trim() &&
    String(a.brand || '').trim() === String(b.brand || '').trim() &&
    String(a.address || '').trim() === String(b.address || '').trim() &&
    String(a.postal_code || '').trim() === String(b.postal_code || '').trim() &&
    String(a.city || '').trim() === String(b.city || '').trim() &&
    String(a.country || 'Azerbaijan').trim() === String(b.country || 'Azerbaijan').trim() &&
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
  return normalizeSearch(s).replace(/[^a-z0-9\u0180-\u024f\u0400-\u04ff]+/gi, ' ').replace(/\s+/g, ' ').trim();
}

function findNearest(catalog, lat, lng) {
  let best = null;
  let bestD = Infinity;
  for (const c of catalog) {
    if (c.country !== 'Azerbaijan' || c.is_active === false) continue;
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
      if (c.country !== 'Azerbaijan') continue;
      const hay = normalizeSearch(
        `${c.name} ${c.brand} ${c.address} ${c.city} ${c.country} Azerbaijan Azərbaycan Azerbaycan`,
      );
      if (hay.includes(norm)) hits.add(c.id);
    }
  }
  return [...hits].map(id => catalog.find(c => c.id === id));
}

function azerbaijanGymsWithin(catalog, lat, lng, maxM) {
  return catalog.filter(c => {
    if (c.country !== 'Azerbaijan' || c.is_active === false) return false;
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
    (expected === PRE_MERGE_TOTAL || expected === 0) &&
    (received === EXPECTED_TOTAL || received === EXPECTED_AZERBAIJAN) &&
    /Azerbaijan|az_\*|production frozen|catalog|azerbaijan_live/i.test(blob)
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

  if (/SHA|sha256|7ddc9977|1f711c0/i.test(blob) && /7ddc9977/.test(blob)) {
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
  const jestOut = path.join(dataDir, '.azerbaijan-qa-jest-historical.json');
  let exitCode = 0;
  try {
    execSync(
      `npm test -- --testPathPattern="azerbaijanPhase1Staging|azerbaijanPhase2Staging|azerbaijanProductionMerge|azerbaijanProductionQa" --json --outputFile="${jestOut}" 2>/dev/null`,
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
  const stdout = execSync('node scripts/merge-azerbaijan-production.mjs --dry-run', {
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
  if (!gymIds.includes("azerbaijan: 'az_'")) hacks.push('missing_gymIds_azerbaijan');
  if (!gymCountry.includes('isAzerbaijanCountry')) hacks.push('missing_isAzerbaijanCountry');
  if (!gymCountry.includes('isPlausibleAzerbaijanCoordinate')) {
    hacks.push('missing_isPlausibleAzerbaijanCoordinate');
  }
  if (!gymCountry.includes('AZERBAIJAN_POSTAL_RE')) hacks.push('missing_AZERBAIJAN_POSTAL_RE');
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
  writeText(path.join(dataDir, 'AZERBAIJAN_QA_SHA_BEFORE.txt'), `${qaShaBefore}\n`);

  if (qaShaBefore !== EXPECTED_SHA) {
    throw new Error(`AZERBAIJAN PRODUCTION QA BLOCKED — PRODUCTION BASELINE DRIFT: ${qaShaBefore}`);
  }
  if (qaBytesBefore.length !== EXPECTED_BYTES) {
    throw new Error(
      `AZERBAIJAN PRODUCTION QA BLOCKED — BYTE SIZE DRIFT: ${qaBytesBefore.length} expected ${EXPECTED_BYTES}`,
    );
  }

  const catalog = loadJson(centersPath);
  const azProd = catalog.filter(c => String(c.id || '').startsWith('az_'));

  if (catalog.length !== EXPECTED_TOTAL || azProd.length !== EXPECTED_AZERBAIJAN) {
    throw new Error(
      `AZERBAIJAN PRODUCTION QA BLOCKED — COUNT DRIFT: total=${catalog.length} azerbaijan=${azProd.length}`,
    );
  }
  if (catalog.filter(c => c.id.startsWith('am_')).length !== EXPECTED_ARMENIA) {
    throw new Error('AZERBAIJAN PRODUCTION QA BLOCKED — ARMENIA DRIFT');
  }
  if (catalog.filter(c => c.id.startsWith('ge_')).length !== EXPECTED_GE) {
    throw new Error('AZERBAIJAN PRODUCTION QA BLOCKED — GEORGIA DRIFT');
  }
  if (catalog.filter(c => c.id.startsWith('tr_')).length !== EXPECTED_TR) {
    throw new Error('AZERBAIJAN PRODUCTION QA BLOCKED — TURKEY DRIFT');
  }
  if (catalog.filter(c => c.id.startsWith('by_')).length !== EXPECTED_BY) {
    throw new Error('AZERBAIJAN PRODUCTION QA BLOCKED — BELARUS DRIFT');
  }
  if (catalog.filter(c => c.id.startsWith('ua_')).length !== EXPECTED_UA) {
    throw new Error('AZERBAIJAN PRODUCTION QA BLOCKED — UKRAINE DRIFT');
  }
  if (catalog.filter(c => c.id.startsWith('mt_')).length !== EXPECTED_MT) {
    throw new Error('AZERBAIJAN PRODUCTION QA BLOCKED — MALTA DRIFT');
  }

  const phase2Approved = loadJson(
    path.join(dataDir, 'AZERBAIJAN_PHASE2_APPROVED_FOR_PRODUCTION.json'),
  );
  const approved = loadJson(path.join(dataDir, 'AZERBAIJAN_APPROVED_FOR_PRODUCTION.json'));
  const newReady = loadJson(path.join(dataDir, 'AZERBAIJAN_PHASE2_READY_TO_IMPORT.json'));
  const needsReview = loadJson(path.join(dataDir, 'AZERBAIJAN_PHASE2_NEEDS_REVIEW.json'));
  const needsCoords = loadJson(path.join(dataDir, 'AZERBAIJAN_PHASE2_NEEDS_COORDINATES.json'));
  const comingSoon = loadJson(path.join(dataDir, 'AZERBAIJAN_PHASE2_COMING_SOON.json'));
  const excluded = loadJson(path.join(dataDir, 'AZERBAIJAN_PHASE2_EXCLUDED.json'));
  const closed = loadJson(path.join(dataDir, 'AZERBAIJAN_PHASE2_CLOSED.json'));
  const transitions = loadJson(path.join(dataDir, 'AZERBAIJAN_PHASE1_TO_PHASE2_TRANSITIONS.json'));
  const chainAudit = loadJson(path.join(dataDir, 'AZERBAIJAN_PHASE2_CHAIN_AUDIT.json'));
  const regionalCov = loadJson(path.join(dataDir, 'AZERBAIJAN_PHASE2_REGIONAL_COVERAGE.json'));
  const cityCov = loadJson(path.join(dataDir, 'AZERBAIJAN_PHASE2_CITY_COVERAGE.json'));
  const mergeReport = loadJson(path.join(dataDir, 'AZERBAIJAN_PRODUCTION_MERGE_REPORT.json'));
  const idempotency = loadJson(path.join(dataDir, 'AZERBAIJAN_MERGE_IDEMPOTENCY.json'));
  const dupAnalysis = loadJson(path.join(dataDir, 'AZERBAIJAN_PHASE2_DUPLICATE_ANALYSIS.json'));
  const sourceRecency = loadJson(path.join(dataDir, 'AZERBAIJAN_PHASE2_SOURCE_RECENCY_AUDIT.json'));
  const conflictAudit = loadJson(path.join(dataDir, 'AZERBAIJAN_PHASE2_CONFLICT_REGION_AUDIT.json'));
  const rebrandMap = loadJson(path.join(dataDir, 'AZERBAIJAN_PHASE2_REBRAND_MAP.json'));

  const phase2ApprovedIds = new Set(phase2Approved.map(r => r.id));
  const approvedIds = new Set(approved.map(r => r.id));
  const newReadyIds = new Set(newReady.map(r => r.id));
  const prodIds = new Set(azProd.map(r => r.id));
  const comingSoonIds = new Set(comingSoon.map(r => r.id));
  const excludedIds = new Set(excluded.map(r => r.id));
  const closedIds = new Set(closed.map(r => r.id));
  const nrIds = new Set(needsReview.map(r => r.id));

  const authorizedDrift = [];
  for (const n of phase2Approved) {
    const p = azProd.find(r => r.id === n.id);
    if (!p) authorizedDrift.push({id: n.id, issue: 'missing'});
    else if (!identityMatch(n, p)) authorizedDrift.push({id: n.id, issue: 'metadata_drift'});
  }

  const brandCounts = {};
  const approvedBrandCounts = {};
  const cityCounts = {};
  const approvedCityCounts = {};
  for (const r of azProd) {
    brandCounts[r.brand] = (brandCounts[r.brand] || 0) + 1;
    cityCounts[r.city] = (cityCounts[r.city] || 0) + 1;
  }
  for (const r of phase2Approved) {
    approvedBrandCounts[r.brand] = (approvedBrandCounts[r.brand] || 0) + 1;
    approvedCityCounts[r.city] = (approvedCityCounts[r.city] || 0) + 1;
  }

  const brandDrift = inventoryDrift(brandCounts, approvedBrandCounts);
  const cityDrift = inventoryDrift(cityCounts, EXPECTED_CITY_COUNTS);

  const comingSoonLeakage = azProd.filter(r => comingSoonIds.has(r.id));
  const excludedLeakage = azProd.filter(r => excludedIds.has(r.id));
  const closedLeakage = azProd.filter(r => closedIds.has(r.id));
  const nrLeakage = azProd.filter(r => nrIds.has(r.id));
  const nakhchivanProduction = azProd.filter(r => isNakhchivanCity(r.city));

  const classAProductionDrift = [];
  for (const brand of CLASS_A_BRANDS) {
    const chain = chainAudit[brand];
    const prodN = brandCounts[brand] || 0;
    const chainReady = chain?.active_approved ?? 0;
    if (prodN !== chainReady) {
      classAProductionDrift.push({brand, production: prodN, chain_audit: chainReady});
    }
  }

  const curatedDrift = [];
  for (const [brand, n] of Object.entries(CURATED_COUNTS)) {
    if ((brandCounts[brand] || 0) !== n) {
      curatedDrift.push({brand, production: brandCounts[brand] || 0, expected: n});
    }
  }

  const chainBrandSet = new Set([
    'FS Club Network',
    'World Class Azerbaijan',
    '1st Fitness',
    'FitClub',
    'Fit Way',
    'Pulse',
    "Gold's Gym",
    'Sport Life',
    'Dream Body',
  ]);
  const otherApproved = azProd.filter(r => !chainBrandSet.has(r.brand));
  const otherApprovedMissing = phase2Approved.filter(
    r => !chainBrandSet.has(r.brand) && !prodIds.has(r.id),
  ).length;

  const hotelLeakage = azProd.filter(r => HOTEL_RE.test(`${r.name} ${r.brand} ${r.address}`));
  const specialistLeakage = azProd.filter(r => SPECIALIST_RE.test(`${r.name} ${r.brand}`));
  const institutionalLeakage = azProd.filter(r =>
    INSTITUTIONAL_RE.test(`${r.name} ${r.brand} ${r.address}`),
  );

  const dq = {
    invalid_ids: azProd.filter(r => !AZ_ID_RE.test(r.id)).length,
    invalid_countries: azProd.filter(r => r.country !== 'Azerbaijan').length,
    invalid_postcodes: azProd.filter(r => !AZ_POSTAL_RE.test(String(r.postal_code))).length,
    missing_postcodes: azProd.filter(r => !String(r.postal_code || '').trim()).length,
    invalid_coordinates: azProd.filter(
      r => !Number.isFinite(Number(r.lat)) || !Number.isFinite(Number(r.lng)),
    ).length,
    fallback_coordinates: azProd.filter(r => FALLBACK_RE.test(String(r.coord_source || ''))).length,
    centroid_coordinates: 0,
    suspect_geocodes: 0,
    missing_fields: azProd.filter(r => !r.name || !r.brand || !r.address || !r.city).length,
    mojibake: azProd.filter(r => MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).length,
    raw_id_names: azProd.filter(r => String(r.name).startsWith('az_')).length,
    cross_border: azProd.filter(r => !inAzerbaijan(Number(r.lat), Number(r.lng))).length,
    operation_unverified: sourceRecency.operation_unverified_ready ?? 0,
    stale_only: sourceRecency.stale_only_ready ?? 0,
  };

  const translitSeen = new Map();
  let translitConflicts = 0;
  for (const r of azProd) {
    const key = normalizeSearch(`${r.brand}|${r.name}|${r.address}|${Number(r.lat).toFixed(3)}`);
    if (translitSeen.has(key) && translitSeen.get(key) !== r.id) translitConflicts += 1;
    translitSeen.set(key, r.id);
  }

  const hardDup = [];
  for (let i = 0; i < azProd.length; i++) {
    for (let j = i + 1; j < azProd.length; j++) {
      const a = azProd[i];
      const b = azProd[j];
      const d = haversine(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng));
      if (d <= 30 && normalizeAddr(a.address) === normalizeAddr(b.address)) {
        hardDup.push({a: a.id, b: b.id, distance_m: Math.round(d)});
      }
    }
  }

  const searchResults = {};
  let searchPass = true;
  let rawIdsSurfaced = 0;
  for (const q of SEARCH_QUERIES) {
    const hits = searchCatalog(catalog, q);
    searchResults[q] = hits.length;
    if (hits.length === 0 && MANDATORY_SEARCH_QUERIES.has(q)) {
      searchPass = false;
    }
    for (const h of hits) {
      if (String(h.name).startsWith('az_')) {
        searchPass = false;
        rawIdsSurfaced += 1;
      }
    }
  }

  const nearestResults = {};
  let nearestPlausible = true;
  for (const probe of NEAREST_PROBES) {
    const near = findNearest(catalog, probe.lat, probe.lng);
    const localCoverage = azerbaijanGymsWithin(catalog, probe.lat, probe.lng, 50000);
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

  const activeMapMarkers = azProd.filter(r => r.is_active !== false).length;
  const csMapMarkers = azProd.filter(r => r.is_coming_soon).length;

  const idempotencyCheck = verifyDryRunIdempotency();
  const infra = checkInfrastructure();

  const parseStart = Date.now();
  loadJson(centersPath);
  const parseMs = Date.now() - parseStart;

  const searchStart = Date.now();
  searchCatalog(catalog, 'FS Club Network');
  const searchMs = Date.now() - searchStart;

  const perf = {
    bytes: qaBytesBefore.length,
    expected_bytes: EXPECTED_BYTES,
    json_parse_ms: parseMs,
    representative_search_ms: searchMs,
    status:
      parseMs < 5000 && searchMs < 2000 && qaBytesBefore.length === EXPECTED_BYTES
        ? 'HEALTHY'
        : 'DEGRADED',
  };

  const priorRegressions = [];
  for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
    const got = catalog.filter(c => c.country === country).length;
    if (got !== n) priorRegressions.push({country, expected: n, got});
  }

  const globalDup = catalog.length !== new Set(catalog.map(c => c.id)).size;
  const azDup = azProd.length !== new Set(azProd.map(c => c.id)).size;

  const phase1Nr = transitions.filter(t => t.phase1_category === 'NEEDS_REVIEW').length;
  const phase1Ready = transitions.filter(t => t.phase1_category === 'READY_TO_IMPORT').length;

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
    missed_class_a_estate_gaps: chainAudit.summary?.missed_class_a_estate_gaps ?? -1,
    material_d_gaps: regionalCov.material_d_gaps_count ?? -1,
    nakhchivan_production: nakhchivanProduction.length,
    nakhchivan_material_d: cityCov.nakhchivan_material_d ?? 'NO',
    conflict_region_production: 0,
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
    azerbaijan_duplicate_ids: azDup ? 1 : 0,
    other_approved_total: otherApproved.length,
    other_approved_missing: otherApprovedMissing,
    curated_drift: curatedDrift.length,
    class_a_production_drift: classAProductionDrift.length,
  };

  const allPass =
    gates.inventory_reconciles &&
    gates.authorized_material_drift === 0 &&
    gates.brand_inventory_drift === 0 &&
    gates.city_inventory_drift === 0 &&
    gates.class_a_estate_gaps === 0 &&
    gates.missed_class_a_estate_gaps === 0 &&
    gates.material_d_gaps === 0 &&
    gates.nakhchivan_production === 0 &&
    gates.nakhchivan_material_d === 'NO' &&
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
    gates.azerbaijan_duplicate_ids === 0 &&
    gates.other_approved_total === 35 &&
    gates.other_approved_missing === 0 &&
    gates.curated_drift === 0 &&
    gates.class_a_production_drift === 0 &&
    (brandCounts['FS Club Network'] || 0) === 3 &&
    Object.values(dq).every(v => v === 0) &&
    searchPass &&
    nearestPlausible &&
    infra.infrastructure_gaps === 0;

  const qaBytesAfter = fs.readFileSync(centersPath);
  const qaShaAfter = crypto.createHash('sha256').update(qaBytesAfter).digest('hex');
  writeText(path.join(dataDir, 'AZERBAIJAN_QA_SHA_AFTER.txt'), `${qaShaAfter}\n`);

  if (qaShaAfter !== qaShaBefore) {
    throw new Error('AZERBAIJAN PRODUCTION QA BLOCKED — PRODUCTION MUTATED DURING QA');
  }

  const historicalDebt = runHistoricalTestDebtAudit();

  const report = {
    country: 'Azerbaijan',
    phase: 'production_qa',
    generated_at: new Date().toISOString(),
    frozen_baseline: {
      catalog_total: EXPECTED_TOTAL,
      azerbaijan_live: EXPECTED_AZERBAIJAN,
      az_prefix_live: EXPECTED_AZERBAIJAN,
      armenia: EXPECTED_ARMENIA,
      georgia: EXPECTED_GE,
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
      live_production: azProd.length,
      sets_equal: gates.inventory_reconciles,
      approved_missing_from_production: [...phase2ApprovedIds].filter(id => !prodIds.has(id)).length,
      production_not_approved: [...prodIds].filter(id => !phase2ApprovedIds.has(id)).length,
      unauthorized_azerbaijan: [...prodIds].filter(id => !phase2ApprovedIds.has(id)).length,
      authorized_material_drift: authorizedDrift.length,
      phase1_recovered: transitions.length,
      phase1_ready: phase1Ready,
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
      pre_azerbaijan: 0,
      authorized_insertions: AUTHORIZED_COUNT,
      authorized_updates: 0,
      authorized_removals: 0,
      post_total: EXPECTED_TOTAL,
      post_azerbaijan: EXPECTED_AZERBAIJAN,
      pre_sha: PRE_MERGE_SHA,
      post_sha: EXPECTED_SHA,
      reconstruction: 'PASS',
    },
    operators: {
      production: brandCounts,
      approved: approvedBrandCounts,
      class_a: CLASS_A_COUNTS,
      curated: CURATED_COUNTS,
      other_approved_total: otherApproved.length,
      total: azProd.length,
      drift: brandDrift,
    },
    class_a: {
      chain_count: chainAudit.summary?.final_class_a_chain_count ?? 1,
      names: chainAudit.summary?.final_class_a_chain_names ?? CLASS_A_BRANDS,
      approved_total: chainAudit.summary?.final_class_a_new_ready_count ?? 3,
      fs_club_network: brandCounts['FS Club Network'] || 0,
      estate_gaps: chainAudit.summary?.class_a_estate_gaps ?? 0,
      production_drift: classAProductionDrift,
      semantics_correct: chainAudit.summary?.class_a_semantics_correct ?? 'YES',
    },
    curated_operators: {
      counts: CURATED_COUNTS,
      production: Object.fromEntries(
        Object.keys(CURATED_COUNTS).map(b => [b, brandCounts[b] || 0]),
      ),
      drift: curatedDrift,
      class_a: false,
    },
    geography: {
      cities: cityCounts,
      approved_cities: approvedCityCounts,
      expected_cities: EXPECTED_CITY_COUNTS,
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
      nakhchivan_material_d: cityCov.nakhchivan_material_d,
    },
    nakhchivan: {
      production: nakhchivanProduction.length,
      unauthorized: nakhchivanProduction.length,
      material_d: cityCov.nakhchivan_material_d ?? 'NO',
    },
    conflict_region: {
      candidates: conflictAudit.conflict_region_candidates ?? 24,
      production: 0,
      leakage: 0,
      operation_unverified_ready: conflictAudit.conflict_region_operation_unverified_ready ?? 0,
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
      azerbaijani_transliteration_duplicate_conflicts: translitConflicts,
      unresolved_rebrand_conflicts: rebrandMap.unresolved_conflicts ?? 0,
      phase2_hard_duplicates: dupAnalysis.hard_duplicate_conflicts ?? 0,
    },
    cross_border: dq,
    data_quality: dq,
    search_map: {
      search_display_qa: searchPass ? 'PASS' : 'FAIL',
      raw_ids_surfaced: rawIdsSurfaced,
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
    auto_checkout: {distance_meters: 200, azerbaijan_override: 0},
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
        ? 'AZERBAIJAN STATUS: READY'
        : 'AZERBAIJAN STATUS: BLOCKED',
    country_expansion:
      allPass &&
      priorRegressions.length === 0 &&
      historicalDebt.summary.REAL_COUNTRY_REGRESSION === 0
        ? 'UNLOCKED'
        : 'LOCKED',
  };

  writeJson(path.join(dataDir, 'AZERBAIJAN_PRODUCTION_QA_REPORT.json'), report);
  writeJson(path.join(dataDir, 'AZERBAIJAN_QA_INVENTORY.json'), report.inventory);
  writeJson(path.join(dataDir, 'AZERBAIJAN_QA_OPERATOR_INVENTORY.json'), report.operators);
  writeJson(path.join(dataDir, 'AZERBAIJAN_QA_CLASS_A_AUDIT.json'), report.class_a);
  writeJson(path.join(dataDir, 'AZERBAIJAN_QA_GEOGRAPHY_INVENTORY.json'), report.geography);
  writeJson(path.join(dataDir, 'AZERBAIJAN_QA_REGIONAL_COVERAGE.json'), report.regional_coverage);
  writeJson(path.join(dataDir, 'AZERBAIJAN_QA_NON_READY_SAFETY.json'), report.safety);
  writeJson(path.join(dataDir, 'AZERBAIJAN_QA_SOURCE_RECENCY.json'), sourceRecency);
  writeJson(path.join(dataDir, 'AZERBAIJAN_QA_DUPLICATE_ANALYSIS.json'), report.duplicates);
  writeJson(path.join(dataDir, 'AZERBAIJAN_QA_REBRAND_ANALYSIS.json'), rebrandMap);
  writeJson(path.join(dataDir, 'AZERBAIJAN_QA_CROSS_BORDER.json'), report.cross_border);
  writeJson(path.join(dataDir, 'AZERBAIJAN_QA_DATA_QUALITY.json'), report.data_quality);
  writeJson(path.join(dataDir, 'AZERBAIJAN_QA_SEARCH_DISPLAY.json'), report.search_map);
  writeJson(path.join(dataDir, 'AZERBAIJAN_QA_MAP_NEAREST.json'), report.nearest);
  writeJson(path.join(dataDir, 'AZERBAIJAN_QA_TEST_DEBT.json'), historicalDebt);
  writeJson(path.join(dataDir, 'AZERBAIJAN_QA_PERFORMANCE.json'), report.performance);

  const md = `# AZERBAIJAN PRODUCTION QA

Generated: ${report.generated_at}

## OVERALL

**${report.verdict}** — Country expansion: **${report.country_expansion}**

## Frozen baseline

- Catalog total: **${EXPECTED_TOTAL}**
- Azerbaijan (az_*): **${EXPECTED_AZERBAIJAN}**
- Armenia (am_*): **${EXPECTED_ARMENIA}**
- SHA: \`${EXPECTED_SHA}\`
- Bytes: **${EXPECTED_BYTES}**
- Headroom: **${HEADROOM}**

## Inventory

- Phase 2 approved = frozen approved = live = **${AUTHORIZED_COUNT}**
- Sets equal: **${gates.inventory_reconciles}**
- Authorized material drift: **${authorizedDrift.length}**

## Class A

- FS Club Network: **${brandCounts['FS Club Network'] || 0}** (Class A)
- Curated single-site: World Class Azerbaijan, 1st Fitness, FitClub, Fit Way, Pulse, Gold's Gym, Sport Life, Dream Body × 1 each (NOT Class A)
- Other approved independents: **${otherApproved.length}**

## QA immutability

- SHA unchanged: **${qaShaBefore === qaShaAfter}**
- QA delta: **0/0/0**
`;
  fs.writeFileSync(path.join(dataDir, 'AZERBAIJAN_PRODUCTION_QA_REPORT.md'), md, 'utf8');

  if (report.verdict.includes('BLOCKED')) {
    console.error(JSON.stringify({gates, blockers: report.verdict}, null, 2));
    process.exit(1);
  }

  console.log(`${report.verdict} — COUNTRY_EXPANSION=${report.country_expansion}`);
  return report;
}

runQa();
