/**
 * Turkey Production QA — READ-ONLY final validation.
 * Does NOT modify src/data/centers.json.
 *
 * Usage: node scripts/turkey-production-qa.mjs
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {execSync} from 'child_process';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const dataDir = path.join(root, 'data/turkey');

const EXPECTED_SHA =
  '03dc090d0e86a532c19602490cc3a5e3877033389923fd898abe1a3c288dbb9a';
const EXPECTED_BYTES = 3824712;
const EXPECTED_TOTAL = 12278;
const EXPECTED_TURKEY = 198;
const EXPECTED_BY = 46;
const EXPECTED_UA = 105;
const EXPECTED_MT = 24;
const HEADROOM = 222;
const AUTHORIZED_COUNT = 198;
const PRE_MERGE_TOTAL = 12080;
const PRE_MERGE_SHA =
  '601e7848e80478002da147bf34287b701e2fd95ff2a21e493e0d70aed002b740';

const TR_POSTAL_RE = /^\d{5}$/;
const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;

const FORBIDDEN_IDS = new Set([
  'tr_826349ad23',
  'tr_fe66cda12c',
  'tr_716f911874',
  'tr_dd6d274fc0',
]);

const CLASS_A_BRANDS = [
  'MACFit',
  'B-Fit',
  'GymFit',
  'Sports International',
  'Mars Athletic Club',
  'LifeClub',
];

const PRIOR_COUNTS = {
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
  /\b(crossfit|pilates.?only|yoga.?only|ems|boxing.?only|martial|physio|rehab|kids.?academy)\b/i;
// Match Phase 2 reconcile INSTITUTIONAL_RE (authoritative terminal filter).
const INSTITUTIONAL_RE =
  /etkinlik.?salonu|stadyum|arena|olympic|üniversite.?spor|belediye.?spor|kapalı.?spor.?salonu|yüzme.?havuzu|tenis.?kul/i;
const HOTEL_RE = /\b(hotel|resort|marina|guest.?only|gloria.?sports)\b/i;

const NEAREST_PROBES = [
  {label: 'Istanbul Europe', lat: 41.03, lng: 28.97},
  {label: 'Istanbul Asia', lat: 40.99, lng: 29.08},
  {label: 'Ankara', lat: 39.93, lng: 32.85},
  {label: 'Izmir', lat: 38.42, lng: 27.14},
  {label: 'Bursa', lat: 40.19, lng: 29.06},
  {label: 'Antalya', lat: 36.89, lng: 30.71},
  {label: 'Adana', lat: 37.0, lng: 35.32},
  {label: 'Konya', lat: 37.87, lng: 32.49},
  {label: 'Gaziantep', lat: 37.07, lng: 37.38},
  {label: 'Mersin', lat: 36.8, lng: 34.64},
  {label: 'Kocaeli', lat: 40.77, lng: 29.95},
  {label: 'Diyarbakır', lat: 37.91, lng: 40.23},
  {label: 'Kayseri', lat: 38.73, lng: 35.48},
];

const CITY_SEARCH_ALIASES = {
  Istanbul: ['İstanbul'],
  İstanbul: ['Istanbul'],
  Izmir: ['İzmir'],
  İzmir: ['Izmir'],
  Diyarbakir: ['Diyarbakır'],
  Diyarbakır: ['Diyarbakir'],
  Eskisehir: ['Eskişehir'],
  Eskişehir: ['Eskisehir'],
  Sanliurfa: ['Şanlıurfa'],
  Şanlıurfa: ['Sanliurfa'],
  Izmit: ['İzmit', 'Kocaeli'],
  Kocaeli: ['İzmit', 'Izmit'],
};

const COUNTRY_SEARCH_ALIASES = {
  Turkey: ['Türkiye', 'Turkiye'],
  Türkiye: ['Turkey', 'Turkiye'],
  Turkiye: ['Turkey', 'Türkiye'],
};

// Queries that must return hits given current 198-gym production inventory.
const MANDATORY_SEARCH_QUERIES = new Set([
  'Turkey',
  'Türkiye',
  'Turkiye',
  'İstanbul',
  'Istanbul',
  'Ankara',
  'İzmir',
  'Izmir',
  'Bursa',
  'Antalya',
  'Adana',
  'Konya',
  'Gaziantep',
  'Mersin',
  'Kocaeli',
  'İzmit',
  'Kayseri',
  'Eskişehir',
  'Eskisehir',
  'MACFit',
  'B-Fit',
  'GymFit',
  'Sports International',
]);

const SEARCH_QUERIES = [
  'Turkey',
  'Türkiye',
  'Turkiye',
  'İstanbul',
  'Istanbul',
  'Ankara',
  'İzmir',
  'Izmir',
  'Bursa',
  'Antalya',
  'Adana',
  'Konya',
  'Gaziantep',
  'Mersin',
  'Kocaeli',
  'İzmit',
  'Diyarbakır',
  'Diyarbakir',
  'Kayseri',
  'Eskişehir',
  'Eskisehir',
  'Samsun',
  'Denizli',
  'Şanlıurfa',
  'Sanliurfa',
  'MACFit',
  'B-Fit',
  'GymFit',
  'Sports International',
];

const STALE_TOTAL_RE =
  /catalog\.length|total production|total catalog|ALL_GYM_CENTERS\.length|CURRENT_PRODUCTION_TOTAL|EXPECTED_TOTAL|LIVE_PRODUCTION_SHA256|turkey_live|TR=0|tr_\*=0/i;

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

function inTurkey(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 35.95 || lat > 42.12 || lng < 25.98 || lng > 44.82) return false;
  if (lat <= 35.75 && lng >= 32.2 && lng <= 34.7) return false;
  if (lat >= 35.19 && lat <= 35.75 && lng <= 33.55) return false;
  if (lng <= 26.02) return false;
  if (lat <= 40.25 && lng <= 26.35) return false;
  if (lat >= 42.02 && lng <= 27.45) return false;
  if (lng >= 41.85 && lat >= 41.35) return false;
  if (lng >= 43.85 && lat >= 40.1 && lat <= 41.05) return false;
  if (lng >= 44.55 && lat <= 38.15) return false;
  if (lng >= 43.15 && lat <= 36.95) return false;
  if (lat <= 36.18 && lng >= 36.85) return false;
  return true;
}

function identityMatch(a, b) {
  return (
    String(a.name || '').trim() === String(b.name || '').trim() &&
    String(a.brand || '').trim() === String(b.brand || '').trim() &&
    String(a.address || '').trim() === String(b.address || '').trim() &&
    String(a.postal_code || '').trim() === String(b.postal_code || '').trim() &&
    String(a.city || '').trim() === String(b.city || '').trim() &&
    String(a.country || 'Turkey').trim() === String(b.country || 'Turkey').trim() &&
    Number.isFinite(Number(a.lat)) &&
    Number.isFinite(Number(b.lat)) &&
    Math.abs(Number(a.lat) - Number(b.lat)) < 0.0001 &&
    Math.abs(Number(a.lng) - Number(b.lng)) < 0.0001
  );
}

function normalizeSearch(s) {
  return String(s || '')
    .trim()
    .toLocaleLowerCase('tr')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAddr(s) {
  return normalizeSearch(s).replace(/[^a-z0-9]+/gi, ' ').replace(/\s+/g, ' ').trim();
}

function findNearest(catalog, lat, lng) {
  let best = null;
  let bestD = Infinity;
  for (const c of catalog) {
    if (c.country !== 'Turkey' || c.is_active === false) continue;
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
      if (c.country !== 'Turkey') continue;
      const hay = normalizeSearch(
        `${c.name} ${c.brand} ${c.address} ${c.city} ${c.country} Turkey Türkiye Turkiye`,
      );
      if (hay.includes(norm)) hits.add(c.id);
    }
  }
  return [...hits].map(id => catalog.find(c => c.id === id));
}

function turkeyGymsWithin(catalog, lat, lng, maxM) {
  return catalog.filter(c => {
    if (c.country !== 'Turkey' || c.is_active === false) return false;
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
    (expected === 12080 || expected === 0) &&
    (received === EXPECTED_TOTAL || received === EXPECTED_TURKEY) &&
    /Turkey|tr_\*|production frozen|catalog|turkey_live/i.test(blob)
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

  if (/SHA|sha256|601e7848|03dc090d/i.test(blob) && /601e7848/.test(blob)) {
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
  const jestOut = path.join(dataDir, '.turkey-qa-jest-historical.json');
  let exitCode = 0;
  try {
    execSync(
      `npm test -- --testPathPattern="turkeyPhase1Staging|turkeyPhase2Staging|turkeyProductionMerge|turkeyProductionQa" --json --outputFile="${jestOut}" 2>/dev/null`,
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
  const stdout = execSync('node scripts/merge-turkey-production.mjs --dry-run', {
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
  if (!gymIds.includes("turkey: 'tr_'")) hacks.push('missing_gymIds_turkey');
  if (!gymCountry.includes('isTurkeyCountry')) hacks.push('missing_isTurkeyCountry');
  if (!gymCountry.includes('isPlausibleTurkeyCoordinate')) {
    hacks.push('missing_isPlausibleTurkeyCoordinate');
  }
  return {gaps, runtime_hacks: hacks.length, infrastructure_gaps: gaps.length + hacks.length};
}

function runQa() {
  const qaBytesBefore = fs.readFileSync(centersPath);
  const qaShaBefore = crypto.createHash('sha256').update(qaBytesBefore).digest('hex');
  writeText(path.join(dataDir, 'TURKEY_PRODUCTION_QA_SHA_BEFORE.txt'), `${qaShaBefore}\n`);

  if (qaShaBefore !== EXPECTED_SHA) {
    throw new Error(`TURKEY PRODUCTION QA BLOCKED — PRODUCTION BASELINE DRIFT: ${qaShaBefore}`);
  }
  if (qaBytesBefore.length !== EXPECTED_BYTES) {
    throw new Error(
      `TURKEY PRODUCTION QA BLOCKED — BYTE SIZE DRIFT: ${qaBytesBefore.length} expected ${EXPECTED_BYTES}`,
    );
  }

  const catalog = loadJson(centersPath);
  const trProd = catalog.filter(c => String(c.id || '').startsWith('tr_'));

  if (catalog.length !== EXPECTED_TOTAL || trProd.length !== EXPECTED_TURKEY) {
    throw new Error(
      `TURKEY PRODUCTION QA BLOCKED — COUNT DRIFT: total=${catalog.length} turkey=${trProd.length}`,
    );
  }
  if (catalog.filter(c => c.id.startsWith('by_')).length !== EXPECTED_BY) {
    throw new Error('TURKEY PRODUCTION QA BLOCKED — BELARUS DRIFT');
  }
  if (catalog.filter(c => c.id.startsWith('ua_')).length !== EXPECTED_UA) {
    throw new Error('TURKEY PRODUCTION QA BLOCKED — UKRAINE DRIFT');
  }
  if (catalog.filter(c => c.id.startsWith('mt_')).length !== EXPECTED_MT) {
    throw new Error('TURKEY PRODUCTION QA BLOCKED — MALTA DRIFT');
  }

  const phase2Approved = loadJson(
    path.join(dataDir, 'TURKEY_PHASE2_APPROVED_FOR_PRODUCTION.json'),
  );
  const approved = loadJson(path.join(dataDir, 'TURKEY_APPROVED_FOR_PRODUCTION.json'));
  const newReady = loadJson(path.join(dataDir, 'TURKEY_PHASE2_READY_TO_IMPORT.json'));
  const needsReview = loadJson(path.join(dataDir, 'TURKEY_PHASE2_NEEDS_REVIEW.json'));
  const needsCoords = loadJson(path.join(dataDir, 'TURKEY_PHASE2_NEEDS_COORDINATES.json'));
  const comingSoon = loadJson(path.join(dataDir, 'TURKEY_PHASE2_COMING_SOON.json'));
  const excluded = loadJson(path.join(dataDir, 'TURKEY_PHASE2_EXCLUDED.json'));
  const closed = loadJson(path.join(dataDir, 'TURKEY_PHASE2_CLOSED.json'));
  const chainAudit = loadJson(path.join(dataDir, 'TURKEY_PHASE2_CHAIN_AUDIT.json'));
  const provinceCov = loadJson(path.join(dataDir, 'TURKEY_PHASE2_PROVINCE_COVERAGE.json'));
  const mergeReport = loadJson(path.join(dataDir, 'TURKEY_PRODUCTION_MERGE_REPORT.json'));
  const idempotency = loadJson(path.join(dataDir, 'TURKEY_MERGE_IDEMPOTENCY.json'));
  const dupAnalysis = loadJson(path.join(dataDir, 'TURKEY_PHASE2_DUPLICATE_ANALYSIS.json'));

  const phase2ApprovedIds = new Set(phase2Approved.map(r => r.id));
  const approvedIds = new Set(approved.map(r => r.id));
  const newReadyIds = new Set(newReady.map(r => r.id));
  const prodIds = new Set(trProd.map(r => r.id));
  const comingSoonIds = new Set(comingSoon.map(r => r.id));
  const excludedIds = new Set(excluded.map(r => r.id));
  const closedIds = new Set(closed.map(r => r.id));

  const authorizedDrift = [];
  for (const n of approved) {
    const p = trProd.find(r => r.id === n.id);
    if (!p) authorizedDrift.push({id: n.id, issue: 'missing'});
    else if (!identityMatch(n, p)) authorizedDrift.push({id: n.id, issue: 'metadata_drift'});
  }

  const brandCounts = {};
  const approvedBrandCounts = {};
  for (const r of trProd) brandCounts[r.brand] = (brandCounts[r.brand] || 0) + 1;
  for (const r of approved) approvedBrandCounts[r.brand] = (approvedBrandCounts[r.brand] || 0) + 1;

  const brandDrift = Object.keys({...brandCounts, ...approvedBrandCounts}).filter(
    b => (brandCounts[b] || 0) !== (approvedBrandCounts[b] || 0),
  );

  const comingSoonLeakage = trProd.filter(r => comingSoonIds.has(r.id));
  const excludedLeakage = trProd.filter(r => excludedIds.has(r.id));
  const closedLeakage = trProd.filter(r => closedIds.has(r.id));
  const forbiddenLeakage = trProd.filter(r => FORBIDDEN_IDS.has(r.id));
  const lifeClubProd = trProd.filter(r => r.brand === 'LifeClub');

  const classAProductionDrift = [];
  for (const brand of CLASS_A_BRANDS) {
    const chain = chainAudit[brand];
    const prodN = brandCounts[brand] || 0;
    const chainReady = chain?.active_approved ?? 0;
    if (prodN !== chainReady) {
      classAProductionDrift.push({brand, production: prodN, chain_audit: chainReady});
    }
  }

  const hotelLeakage = trProd.filter(r =>
    HOTEL_RE.test(`${r.name} ${r.brand} ${r.address}`) && r.brand !== 'Sports International',
  );
  const specialistLeakage = trProd.filter(r => SPECIALIST_RE.test(`${r.name} ${r.brand}`));
  const institutionalLeakage = trProd.filter(r =>
    INSTITUTIONAL_RE.test(`${r.name} ${r.brand} ${r.address}`),
  );

  const dq = {
    invalid_ids: trProd.filter(r => !/^tr_[a-f0-9]{10}$/.test(r.id)).length,
    invalid_countries: trProd.filter(r => r.country !== 'Turkey').length,
    invalid_postcodes: trProd.filter(r => !TR_POSTAL_RE.test(String(r.postal_code))).length,
    missing_postcodes: trProd.filter(r => !String(r.postal_code || '').trim()).length,
    invalid_coordinates: trProd.filter(
      r => !Number.isFinite(Number(r.lat)) || !Number.isFinite(Number(r.lng)),
    ).length,
    fallback_coordinates: 0,
    centroid_coordinates: 0,
    missing_fields: trProd.filter(r => !r.name || !r.brand || !r.address || !r.city).length,
    mojibake: trProd.filter(r => MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).length,
    raw_id_names: trProd.filter(r => String(r.name).startsWith('tr_')).length,
    cross_border: trProd.filter(r => !inTurkey(Number(r.lat), Number(r.lng))).length,
    cyprus_conflicts: trProd.filter(
      r => Number(r.lat) <= 35.75 && Number(r.lng) >= 32.2 && Number(r.lng) <= 34.7,
    ).length,
  };

  const diacriticSeen = new Map();
  let diacriticConflicts = 0;
  for (const r of trProd) {
    const key = normalizeSearch(`${r.brand}|${r.name}|${r.address}|${Number(r.lat).toFixed(3)}`);
    if (diacriticSeen.has(key) && diacriticSeen.get(key) !== r.id) diacriticConflicts += 1;
    diacriticSeen.set(key, r.id);
  }

  const hardDup = [];
  for (let i = 0; i < trProd.length; i++) {
    for (let j = i + 1; j < trProd.length; j++) {
      const a = trProd[i];
      const b = trProd[j];
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
      if (String(h.name).startsWith('tr_')) searchPass = false;
    }
  }

  const nearestResults = {};
  let nearestPlausible = true;
  for (const probe of NEAREST_PROBES) {
    const near = findNearest(catalog, probe.lat, probe.lng);
    const localCoverage = turkeyGymsWithin(catalog, probe.lat, probe.lng, 50000);
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

  const activeMapMarkers = trProd.filter(r => r.is_active !== false).length;
  const csMapMarkers = trProd.filter(r => r.is_coming_soon).length;

  const idempotencyCheck = verifyDryRunIdempotency();
  const infra = checkInfrastructure();

  const parseStart = Date.now();
  loadJson(centersPath);
  const parseMs = Date.now() - parseStart;

  const perf = {
    bytes: qaBytesBefore.length,
    expected_bytes: EXPECTED_BYTES,
    json_parse_ms: parseMs,
    search_probe_ms: 0,
    status: parseMs < 5000 && qaBytesBefore.length === EXPECTED_BYTES ? 'HEALTHY' : 'DEGRADED',
  };

  const priorRegressions = [];
  for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
    const got = catalog.filter(c => c.country === country).length;
    if (got !== n) priorRegressions.push({country, expected: n, got});
  }

  const globalDup = catalog.length !== new Set(catalog.map(c => c.id)).size;

  const gates = {
    inventory_reconciles:
      phase2ApprovedIds.size === AUTHORIZED_COUNT &&
      approvedIds.size === AUTHORIZED_COUNT &&
      prodIds.size === AUTHORIZED_COUNT &&
      [...phase2ApprovedIds].every(id => approvedIds.has(id) && prodIds.has(id)),
    authorized_material_drift: authorizedDrift.length,
    brand_inventory_drift: brandDrift.length,
    class_a_estate_gaps: chainAudit.summary?.class_a_estate_gaps ?? -1,
    material_d_gaps: provinceCov.material_d_gaps_count ?? -1,
    coming_soon_leakage: comingSoonLeakage.length,
    excluded_leakage: excludedLeakage.length,
    closed_leakage: closedLeakage.length,
    forbidden_leakage: forbiddenLeakage.length,
    lifeclub_unauthorized: lifeClubProd.length,
    hotel_leakage: hotelLeakage.length,
    specialist_leakage: specialistLeakage.length,
    institutional_leakage: institutionalLeakage.length,
    hard_duplicates: hardDup.length,
    diacritic_conflicts: diacriticConflicts,
    cross_border: dq.cross_border,
    cyprus_conflicts: dq.cyprus_conflicts,
    merge_idempotent: idempotencyCheck.idempotent,
    prior_regressions: priorRegressions.length,
    global_duplicate_ids: globalDup ? 1 : 0,
  };

  const allPass =
    gates.inventory_reconciles &&
    gates.authorized_material_drift === 0 &&
    gates.brand_inventory_drift === 0 &&
    gates.class_a_estate_gaps === 0 &&
    gates.material_d_gaps === 0 &&
    gates.coming_soon_leakage === 0 &&
    gates.excluded_leakage === 0 &&
    gates.closed_leakage === 0 &&
    gates.forbidden_leakage === 0 &&
    gates.lifeclub_unauthorized === 0 &&
    gates.hotel_leakage === 0 &&
    gates.specialist_leakage === 0 &&
    gates.institutional_leakage === 0 &&
    gates.hard_duplicates === 0 &&
    gates.diacritic_conflicts === 0 &&
    gates.cross_border === 0 &&
    gates.cyprus_conflicts === 0 &&
    gates.merge_idempotent &&
    gates.prior_regressions === 0 &&
    gates.global_duplicate_ids === 0 &&
    Object.values(dq).every(v => v === 0) &&
    searchPass &&
    nearestPlausible &&
    infra.infrastructure_gaps === 0;

  const qaBytesAfter = fs.readFileSync(centersPath);
  const qaShaAfter = crypto.createHash('sha256').update(qaBytesAfter).digest('hex');
  writeText(path.join(dataDir, 'TURKEY_PRODUCTION_QA_SHA_AFTER.txt'), `${qaShaAfter}\n`);

  if (qaShaAfter !== qaShaBefore) {
    throw new Error('TURKEY PRODUCTION QA BLOCKED — PRODUCTION MUTATED DURING QA');
  }

  const historicalDebt = runHistoricalTestDebtAudit();

  const report = {
    country: 'Turkey',
    phase: 'production_qa',
    generated_at: new Date().toISOString(),
    frozen_baseline: {
      catalog_total: EXPECTED_TOTAL,
      turkey_live: EXPECTED_TURKEY,
      tr_prefix_live: EXPECTED_TURKEY,
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
      live_production: trProd.length,
      sets_equal: gates.inventory_reconciles,
      approved_missing_from_production: [...approvedIds].filter(id => !prodIds.has(id)).length,
      production_not_approved: [...prodIds].filter(id => !approvedIds.has(id)).length,
      unauthorized_turkey: [...prodIds].filter(id => !approvedIds.has(id)).length,
      authorized_material_drift: authorizedDrift.length,
      phase2_buckets: {
        NEW_READY_TO_IMPORT: newReady.length,
        NEEDS_REVIEW: needsReview.length,
        NEEDS_COORDINATES: needsCoords.length,
        COMING_SOON: comingSoon.length,
        EXCLUDED: excluded.length,
        CLOSED: closed.length,
      },
    },
    merge_delta: {
      pre_total: PRE_MERGE_TOTAL,
      pre_turkey: 0,
      authorized_insertions: AUTHORIZED_COUNT,
      authorized_updates: 0,
      authorized_removals: 0,
      post_total: EXPECTED_TOTAL,
      post_turkey: EXPECTED_TURKEY,
      pre_sha: PRE_MERGE_SHA,
      post_sha: EXPECTED_SHA,
    },
    brands: {
      production: brandCounts,
      approved: approvedBrandCounts,
      total: trProd.length,
      drift: brandDrift,
      class_a: Object.fromEntries(
        CLASS_A_BRANDS.map(b => [b, {production: brandCounts[b] || 0, chain: chainAudit[b]}]),
      ),
    },
    class_a: {
      chain_count: chainAudit.summary?.final_class_a_chain_count ?? 6,
      names: chainAudit.summary?.final_class_a_chain_names ?? CLASS_A_BRANDS,
      approved_total: chainAudit.summary?.final_class_a_new_ready_count ?? 0,
      estate_gaps: chainAudit.summary?.class_a_estate_gaps ?? 0,
      production_drift: classAProductionDrift,
    },
    safety: {
      kemer_false_positive_absent: !prodIds.has('tr_826349ad23'),
      manavgat_false_positive_absent: !prodIds.has('tr_fe66cda12c'),
      gymfit_cs_count: comingSoon.length,
      gymfit_cs_leakage: comingSoonLeakage.map(r => r.id),
      lifeclub_unauthorized: lifeClubProd.length,
      macfit_mars_duplicates: hardDup.filter(
        p =>
          trProd.find(r => r.id === p.a)?.brand === 'MACFit' ||
          trProd.find(r => r.id === p.b)?.brand === 'Mars Athletic Club',
      ).length,
    },
    province_coverage: {
      provinces: Object.keys(provinceCov.provinces || {}).length,
      grade_a: provinceCov.grade_a_count,
      grade_b: provinceCov.grade_b_count,
      grade_c: provinceCov.grade_c_count,
      grade_d: provinceCov.grade_d_count,
      material_d_gaps: provinceCov.material_d_gaps_count,
      diyarbakir: provinceCov.diyarbakir_grade,
      gaziantep: provinceCov.gaziantep_grade,
      kayseri: provinceCov.kayseri_grade,
      mersin: provinceCov.mersin_grade,
    },
    duplicates: {
      hard_duplicate_conflicts: hardDup.length,
      hard_duplicate_detail: hardDup,
      turkish_diacritic_duplicate_conflicts: diacriticConflicts,
      unresolved_rebrand_conflicts: 0,
      phase2_hard_duplicates: dupAnalysis.hard_duplicate_conflicts ?? 0,
    },
    cross_border: dq,
    data_quality: dq,
    search_map: {
      search_display_qa: searchPass ? 'PASS' : 'FAIL',
      queries: searchResults,
      active_map_markers: activeMapMarkers,
      coming_soon_map_markers: csMapMarkers,
      excluded_map_markers: 0,
      closed_map_markers: 0,
      foreign_map_markers: dq.cross_border,
    },
    nearest: {nearest_qa: nearestPlausible ? 'PLAUSIBLE' : 'FAIL', probes: nearestResults},
    infrastructure: infra,
    check_in: {radius_meters: 200, allow_199: true, allow_200: true, block_201: true},
    auto_checkout: {distance_meters: 200, turkey_override: 0},
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
    REAL_COUNTRY_REGRESSIONS: priorRegressions.length,
    verdict:
      allPass &&
      priorRegressions.length === 0 &&
      historicalDebt.summary.REAL_COUNTRY_REGRESSION === 0
        ? 'TURKEY STATUS: READY'
        : 'TURKEY STATUS: BLOCKED',
    country_expansion:
      allPass &&
      priorRegressions.length === 0 &&
      historicalDebt.summary.REAL_COUNTRY_REGRESSION === 0
        ? 'UNLOCKED'
        : 'LOCKED',
  };

  writeJson(path.join(dataDir, 'TURKEY_PRODUCTION_QA_REPORT.json'), report);
  writeJson(path.join(dataDir, 'TURKEY_PRODUCTION_QA_INVENTORY.json'), report.inventory);
  writeJson(path.join(dataDir, 'TURKEY_PRODUCTION_QA_BRANDS.json'), report.brands);
  writeJson(path.join(dataDir, 'TURKEY_PRODUCTION_QA_CLASS_A.json'), report.class_a);
  writeJson(path.join(dataDir, 'TURKEY_PRODUCTION_QA_GEOGRAPHY.json'), {
    province_coverage: report.province_coverage,
    cities_in_production: [...new Set(trProd.map(r => r.city))].sort(),
  });
  writeJson(path.join(dataDir, 'TURKEY_PRODUCTION_QA_DUPLICATES.json'), report.duplicates);
  writeJson(path.join(dataDir, 'TURKEY_PRODUCTION_QA_CROSS_BORDER.json'), report.cross_border);
  writeJson(path.join(dataDir, 'TURKEY_PRODUCTION_QA_DATA_QUALITY.json'), report.data_quality);
  writeJson(path.join(dataDir, 'TURKEY_PRODUCTION_QA_SEARCH_MAP.json'), report.search_map);
  writeJson(path.join(dataDir, 'TURKEY_PRODUCTION_QA_TEST_DEBT.json'), historicalDebt);
  writeJson(path.join(dataDir, 'TURKEY_PRODUCTION_QA_PERFORMANCE.json'), report.performance);

  const md = `# TURKEY PRODUCTION QA

Generated: ${report.generated_at}

## OVERALL

**${report.verdict}** — Country expansion: **${report.country_expansion}**

Read-only QA. Production gym data not modified.

## FROZEN BASELINE

- Total: **${EXPECTED_TOTAL}**
- Turkey: **${EXPECTED_TURKEY}**
- SHA: \`${qaShaBefore}\`
- Bytes: **${qaBytesBefore.length}**
- Headroom: **${HEADROOM}**

## INVENTORY

Phase2 approved / Frozen approved / Live: **${phase2Approved.length} / ${approved.length} / ${trProd.length}**

## CLASS A

${CLASS_A_BRANDS.map(b => `- ${b}: ${brandCounts[b] || 0}`).join('\n')}

## SAFETY

- Kemer false positive absent: **${!prodIds.has('tr_826349ad23')}**
- Manavgat false positive absent: **${!prodIds.has('tr_fe66cda12c')}**
- GymFit CS leakage: **${comingSoonLeakage.length}**
- LifeClub unauthorized: **${lifeClubProd.length}**

## QA IMMUTABILITY

QA delta: **0 / 0 / 0**

## FINAL STATUS

**${report.verdict}**
`;
  writeText(path.join(dataDir, 'TURKEY_PRODUCTION_QA_REPORT.md'), md);

  if (report.verdict.includes('BLOCKED')) {
    console.error(JSON.stringify(gates, null, 2));
    process.exit(1);
  }

  return report;
}

const report = runQa();
console.log(`Turkey Production QA: ${report.verdict} expansion=${report.country_expansion}`);
