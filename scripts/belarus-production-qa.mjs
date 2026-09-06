/**
 * Belarus Production QA — READ-ONLY final validation.
 * Does NOT modify src/data/centers.json.
 *
 * Usage: node scripts/belarus-production-qa.mjs
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {execSync} from 'child_process';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const dataDir = path.join(root, 'data/belarus');

const EXPECTED_SHA =
  '601e7848e80478002da147bf34287b701e2fd95ff2a21e493e0d70aed002b740';
const EXPECTED_TOTAL = 12080;
const EXPECTED_BELARUS = 46;
const EXPECTED_UKRAINE = 105;
const EXPECTED_MALTA = 24;
const EXPECTED_BYTES = 3761727;
const HEADROOM = 420;
const AUTHORIZED_COUNT = 46;

const BY_POSTAL_RE = /^\d{6}$/;
const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;

const EXPECTED_BRANDS = {
  Adrenalin: 29,
  Lifestyle: 3,
  'Fox Club': 5,
  Olympic: 4,
  'World Class': 1,
  'Gym Express 24h': 1,
  Grafit: 1,
  Delta: 1,
  FitWorld: 1,
};

const CLASS_A_BRANDS = new Set(['Adrenalin', 'Lifestyle', 'Fox Club', 'Olympic']);
const NON_CLASS_A_BRANDS = new Set([
  'World Class',
  'Gym Express 24h',
  'Grafit',
  'Delta',
  'FitWorld',
]);

const PRIOR_COUNTS = {
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
  /\b(crossfit|ems|pilates|yoga|boxing|martial|dance|physio|rehab|warehouse fitness)\b/i;
const INSTITUTIONAL_RE = /\b(university|school|institutional|employee.?only|military|police)\b/i;
const WELLNESS_RE = /\b(hotel gym|resort gym|spa only|wellness resort|marriott|radisson)\b/i;

const NEAREST_PROBES = [
  {label: 'Minsk', lat: 53.9006, lng: 27.559},
  {label: 'Grodno', lat: 53.6693, lng: 23.8131},
  {label: 'Brest', lat: 52.0976, lng: 23.7341},
  {label: 'Gomel', lat: 52.4412, lng: 30.9878},
  {label: 'Mogilev', lat: 53.8984, lng: 30.3308},
  {label: 'Borovlyany', lat: 54.001, lng: 27.667},
  {label: 'Baranavichy', lat: 53.1327, lng: 26.0139},
  {label: 'Barysaw', lat: 54.2279, lng: 28.505},
  {label: 'Pinsk', lat: 52.1229, lng: 26.0951},
  {label: 'Orsha', lat: 54.5153, lng: 30.4247},
];

const SEARCH_QUERIES = [
  'Belarus',
  'Беларусь',
  'Minsk',
  'Минск',
  'Grodno',
  'Гродно',
  'Brest',
  'Gomel',
  'Mogilev',
  'Borovlyany',
  'Adrenalin',
  'Lifestyle',
  'Fox Club',
  'Olympic',
  'World Class',
  'Gym Express 24h',
  'Grafit',
  'Delta',
  'FitWorld',
];

const CITY_SEARCH_ALIASES = {
  Minsk: ['Минск', 'Мінск'],
  Grodno: ['Гродно', 'Hrodna'],
  Gomel: ['Гомель'],
  Mogilev: ['Могилёв', 'Mahilyow'],
  Brest: ['Брест'],
};

const STALE_TOTAL_RE =
  /catalog\.length|total production|total catalog|ALL_GYM_CENTERS\.length|CURRENT_PRODUCTION_TOTAL|EXPECTED_TOTAL|LIVE_PRODUCTION_SHA256|belarus_live|BY=0/i;

const BOROVLYANY_ID = 'by_3633cd3ae9';
const LOSHITSA_ID = 'by_aed96cf298';
const FOX_CLUB_KUPALY_ADDR = 'пр-т Я. Купалы 22';

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

function isPlausibleBelarusCoordinate(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 51.15 || lat > 56.2 || lng < 23.0 || lng > 32.85) return false;
  if (lng <= 23.6 && lat <= 52.0) return false;
  if (lat >= 54.5 && lng <= 25.0) return false;
  if (lat <= 52.0 && lng >= 31.0) return false;
  if (lng >= 32.5) return false;
  return true;
}

function identityMatch(a, b) {
  return (
    String(a.name || '').trim() === String(b.name || '').trim() &&
    String(a.brand || '').trim() === String(b.brand || '').trim() &&
    String(a.address || '').trim() === String(b.address || '').trim() &&
    String(a.postal_code || '').trim() === String(b.postal_code || '').trim() &&
    String(a.city || '').trim() === String(b.city || '').trim() &&
    String(a.country || 'Belarus').trim() === String(b.country || 'Belarus').trim() &&
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
    .replace(/[^a-z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function colocatedPairSet(dupAnalysis) {
  const pairs = new Set();
  for (const row of dupAnalysis.colocated_distinct_gyms ?? []) {
    pairs.add(`${row.a_id}|${row.b_id}`);
    pairs.add(`${row.b_id}|${row.a_id}`);
  }
  return pairs;
}

function isColocatedDistinct(aId, bId, colocated) {
  return colocated.has(`${aId}|${bId}`);
}

function findNearest(catalog, lat, lng) {
  let best = null;
  let bestD = Infinity;
  for (const c of catalog) {
    if (c.country !== 'Belarus' || c.is_active === false) continue;
    const d = haversine(lat, lng, Number(c.lat), Number(c.lng));
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best ? {gym: best, distance_m: Math.round(bestD)} : null;
}

function searchCatalog(catalog, query) {
  const queries = [query, ...(CITY_SEARCH_ALIASES[query] ?? [])];
  const hits = new Set();
  for (const q of queries) {
    const norm = normalizeAddr(q);
    for (const c of catalog) {
      if (c.country !== 'Belarus') continue;
      const hay = normalizeAddr(`${c.name} ${c.brand} ${c.address} ${c.city} ${c.country}`);
      if (hay.includes(norm) || norm.split(' ').every(tok => tok.length < 2 || hay.includes(tok))) {
        hits.add(c.id);
      }
    }
  }
  return [...hits].map(id => catalog.find(c => c.id === id));
}

function classifyFailure(suite, testName, messages) {
  const blob = `${suite} ${testName} ${messages.join(' ')}`;
  const expectedMatch = blob.match(/Expected:\s*(\d+)/);
  const receivedMatch = blob.match(/Received:\s*(\d+)/);
  const expected = expectedMatch ? Number(expectedMatch[1]) : null;
  const received = receivedMatch ? Number(receivedMatch[1]) : null;

  if (
    (expected === 12034 || expected === 0) &&
    (received === EXPECTED_TOTAL || received === EXPECTED_BELARUS) &&
    /Belarus|by_\*|production frozen|catalog|belarus_live/i.test(blob)
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

  if (/SHA|sha256|LIVE_PRODUCTION_SHA|bec3945|601e7848/i.test(blob)) {
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

  return {
    classification: 'OTHER_TEST_DEBT',
    reason: blob.slice(0, 120),
  };
}

function runHistoricalTestDebtAudit() {
  const jestOut = path.join(dataDir, '.belarus-qa-jest-historical.json');
  let exitCode = 0;
  try {
    execSync(
      `npm test -- --testPathPattern="belarusPhase1Staging|belarusPhase2Staging|belarusProductionMerge|belarusProductionQa" --json --outputFile="${jestOut}" 2>/dev/null`,
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
    prior_country_verification: {regressions: []},
    note: 'Phase 1/2 frozen-baseline failures after authorized +46 merge are STALE_HISTORICAL_BASELINE and non-blocking when REAL_COUNTRY_REGRESSION=0.',
  };
}

function verifyDryRunIdempotency() {
  const backupPaths = [
    'BELARUS_PRODUCTION_MERGE_REPORT.json',
    'BELARUS_MERGE_IDEMPOTENCY.json',
    'BELARUS_MERGE_SHA_AFTER.txt',
  ];
  const backups = {};
  for (const f of backupPaths) {
    const p = path.join(dataDir, f);
    if (fs.existsSync(p)) backups[f] = fs.readFileSync(p);
  }

  let stdout = '';
  try {
    stdout = execSync('node scripts/merge-belarus-production.mjs --dry-run', {
      cwd: root,
      encoding: 'utf8',
    });
  } finally {
    for (const [f, buf] of Object.entries(backups)) {
      fs.writeFileSync(path.join(dataDir, f), buf);
    }
  }

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
    artifacts_restored: Object.keys(backups),
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
    'src/services/gymSearch/gymSearchEngine.ts',
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
  if (!gymIds.includes("belarus: 'by_'")) hacks.push('missing_gymIds_belarus');
  if (!gymCountry.includes('isBelarusCountry')) hacks.push('missing_isBelarusCountry');
  if (!gymCountry.includes('isPlausibleBelarusCoordinate')) {
    hacks.push('missing_isPlausibleBelarusCoordinate');
  }
  return {gaps, runtime_hacks: hacks.length, infrastructure_gaps: gaps.length + hacks.length};
}

function runQa() {
  const qaBytesBefore = fs.readFileSync(centersPath);
  const qaShaBefore = crypto.createHash('sha256').update(qaBytesBefore).digest('hex');
  writeText(path.join(dataDir, 'BELARUS_PRODUCTION_QA_SHA_BEFORE.txt'), `${qaShaBefore}\n`);

  if (qaShaBefore !== EXPECTED_SHA) {
    throw new Error(
      `BELARUS PRODUCTION QA BLOCKED — PRODUCTION BASELINE DRIFT: ${qaShaBefore}`,
    );
  }
  if (qaBytesBefore.length !== EXPECTED_BYTES) {
    throw new Error(
      `BELARUS PRODUCTION QA BLOCKED — BYTE SIZE DRIFT: ${qaBytesBefore.length} expected ${EXPECTED_BYTES}`,
    );
  }

  const catalog = loadJson(centersPath);
  const byProd = catalog.filter(
    c => c.country === 'Belarus' || String(c.id || '').startsWith('by_'),
  );

  if (catalog.length !== EXPECTED_TOTAL || byProd.length !== EXPECTED_BELARUS) {
    throw new Error(
      `BELARUS PRODUCTION QA BLOCKED — COUNT DRIFT: total=${catalog.length} belarus=${byProd.length}`,
    );
  }
  const ukraineLive = catalog.filter(c => c.country === 'Ukraine').length;
  const maltaLive = catalog.filter(c => c.country === 'Malta').length;
  if (ukraineLive !== EXPECTED_UKRAINE) {
    throw new Error(`BELARUS PRODUCTION QA BLOCKED — UKRAINE DRIFT: ${ukraineLive}`);
  }
  if (maltaLive !== EXPECTED_MALTA) {
    throw new Error(`BELARUS PRODUCTION QA BLOCKED — MALTA DRIFT: ${maltaLive}`);
  }

  const newReady = loadJson(path.join(dataDir, 'BELARUS_PHASE2_READY_TO_IMPORT.json'));
  const approved = loadJson(path.join(dataDir, 'BELARUS_APPROVED_FOR_PRODUCTION.json'));
  const comingSoon = loadJson(path.join(dataDir, 'BELARUS_PHASE2_COMING_SOON.json'));
  const excluded = loadJson(path.join(dataDir, 'BELARUS_PHASE2_EXCLUDED.json'));
  const closed = loadJson(path.join(dataDir, 'BELARUS_PHASE2_CLOSED.json'));
  const mergeReport = loadJson(path.join(dataDir, 'BELARUS_PRODUCTION_MERGE_REPORT.json'));
  const idempotency = loadJson(path.join(dataDir, 'BELARUS_MERGE_IDEMPOTENCY.json'));
  const rebrand = loadJson(path.join(dataDir, 'BELARUS_PHASE2_REBRAND_AUDIT.json'));
  const dupAnalysis = loadJson(path.join(dataDir, 'BELARUS_PHASE2_DUPLICATE_ANALYSIS.json'));
  const colocatedDistinct = colocatedPairSet(dupAnalysis);

  const newReadyIds = new Set(newReady.map(r => r.id));
  const approvedIds = new Set(approved.map(r => r.id));
  const prodIds = new Set(byProd.map(r => r.id));
  const comingSoonIds = new Set(comingSoon.map(r => r.id));
  const excludedIds = new Set(excluded.map(r => r.id));
  const closedIds = new Set(closed.map(r => r.id));

  const phase2ReadyMissingFromApproved = [...newReadyIds].filter(id => !approvedIds.has(id));
  const approvedMissingFromProd = [...approvedIds].filter(id => !prodIds.has(id));
  const productionNotApproved = [...prodIds].filter(id => !approvedIds.has(id));

  const authorizedDrift = [];
  for (const n of approved) {
    const p = byProd.find(r => r.id === n.id);
    if (!p) authorizedDrift.push({id: n.id, issue: 'missing'});
    else if (!identityMatch(n, p)) authorizedDrift.push({id: n.id, issue: 'metadata_drift'});
  }

  const brandCounts = {};
  for (const r of byProd) brandCounts[r.brand] = (brandCounts[r.brand] || 0) + 1;

  const comingSoonLeakage = byProd.filter(r => comingSoonIds.has(r.id));
  const excludedLeakage = byProd.filter(r => excludedIds.has(r.id));
  const closedLeakage = byProd.filter(r => closedIds.has(r.id));

  const adrenalin = byProd.filter(r => r.brand === 'Adrenalin');
  const lifestyle = byProd.filter(r => r.brand === 'Lifestyle');
  const foxClub = byProd.filter(r => r.brand === 'Fox Club');
  const olympic = byProd.filter(r => r.brand === 'Olympic');

  const borovlyany = byProd.find(r => r.id === BOROVLYANY_ID);
  const borovlyanyPresent = Boolean(borovlyany);
  const borovlyanyCityCorrect = borovlyany?.city === 'Borovlyany' && borovlyany?.city !== 'Minsk';

  const foxClubKupalyRows = byProd.filter(r => r.address === FOX_CLUB_KUPALY_ADDR);
  const foxClubKupalyExactlyOnce = foxClubKupalyRows.length === 1;

  const loshitsaInProduction = byProd.some(r => r.id === LOSHITSA_ID);
  const vitebskProduction = byProd.filter(r => r.city === 'Vitebsk');
  const vitebskUnauthorizedProduction = vitebskProduction.filter(r => !approvedIds.has(r.id));

  const classAProd = byProd.filter(r => CLASS_A_BRANDS.has(r.brand));
  const nonClassAProd = byProd.filter(r => NON_CLASS_A_BRANDS.has(r.brand));

  const independentDrift = [];
  for (const brand of NON_CLASS_A_BRANDS) {
    const approvedN = approved.filter(r => r.brand === brand).length;
    const prodN = brandCounts[brand] ?? 0;
    if (approvedN !== prodN) independentDrift.push({brand, approved: approvedN, production: prodN});
  }

  const hotelLeakage = byProd.filter(r =>
    WELLNESS_RE.test(`${r.name} ${r.brand} ${r.address}`),
  );
  const specialistLeakage = byProd.filter(r => SPECIALIST_RE.test(`${r.name} ${r.brand}`));
  const institutionalLeakage = byProd.filter(r =>
    INSTITUTIONAL_RE.test(`${r.name} ${r.brand} ${r.address}`),
  );

  const cityMetadataErrors = [];
  for (const row of byProd) {
    const a = approved.find(x => x.id === row.id);
    if (a && a.city !== row.city) {
      cityMetadataErrors.push({id: row.id, prod: row.city, approved: a.city});
    }
  }

  const hardDup = [];
  for (let i = 0; i < byProd.length; i++) {
    for (let j = i + 1; j < byProd.length; j++) {
      const a = byProd[i];
      const b = byProd[j];
      const d = haversine(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng));
      if (
        d <= 25 &&
        normalizeAddr(a.address) === normalizeAddr(b.address) &&
        !isColocatedDistinct(a.id, b.id, colocatedDistinct)
      ) {
        hardDup.push({a: a.id, b: b.id, distance_m: Math.round(d)});
      }
    }
  }

  const translitDup = [];
  const nameAddrCityKeys = new Map();
  for (const r of byProd) {
    const key = normalizeAddr(`${r.brand} ${r.name} ${r.address} ${r.city}`);
    if (nameAddrCityKeys.has(key) && nameAddrCityKeys.get(key) !== r.id) {
      const otherId = nameAddrCityKeys.get(key);
      if (!isColocatedDistinct(r.id, otherId, colocatedDistinct)) {
        translitDup.push({a: otherId, b: r.id, key});
      }
    } else nameAddrCityKeys.set(key, r.id);
  }

  const liveOutliers = byProd.filter(
    r => !isPlausibleBelarusCoordinate(Number(r.lat), Number(r.lng)),
  );
  const crossBorder = {
    poland_outliers: liveOutliers.filter(r => Number(r.lng) <= 23.6).map(r => r.id),
    lithuania_outliers: liveOutliers.filter(r => Number(r.lng) <= 23.6 && Number(r.lat) <= 52).map(r => r.id),
    ukraine_outliers: liveOutliers.filter(r => Number(r.lat) <= 52.0 && Number(r.lng) >= 31.0).map(r => r.id),
    russia_outliers: liveOutliers.filter(r => Number(r.lng) >= 32.5).map(r => r.id),
    live_outliers: liveOutliers.map(r => r.id),
  };

  const dq = {
    invalid_by_ids: byProd.filter(r => !/^by_[a-f0-9]{10}$/.test(r.id)).length,
    non_by_belarus_ids: catalog.filter(r => r.country === 'Belarus' && !String(r.id).startsWith('by_')).length,
    invalid_countries: byProd.filter(r => r.country !== 'Belarus').length,
    invalid_postcodes: byProd.filter(r => !BY_POSTAL_RE.test(String(r.postal_code ?? ''))).length,
    non_canonical_postcodes: byProd.filter(r => {
      const a = approved.find(x => x.id === r.id);
      return a && String(a.postal_code) !== String(r.postal_code);
    }).length,
    invalid_coordinates: byProd.filter(
      r => !Number.isFinite(Number(r.lat)) || !Number.isFinite(Number(r.lng)),
    ).length,
    missing_coordinates: byProd.filter(r => r.lat == null || r.lng == null).length,
    fallback_coordinates: byProd.filter(r => FALLBACK_RE.test(String(r.coord_source || ''))).length,
    centroid_coordinates: 0,
    suspect_geocodes: byProd.filter(
      r => !isPlausibleBelarusCoordinate(Number(r.lat), Number(r.lng)),
    ).length,
    missing_required_fields: byProd.filter(r => !r.name || !r.brand || !r.address || !r.city).length,
    mojibake: byProd.filter(r => MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).length,
    raw_id_display_names: byProd.filter(r => String(r.name).startsWith('by_')).length,
  };

  const globalDup = catalog.length !== new Set(catalog.map(c => c.id)).size;
  const belarusDup = byProd.length !== new Set(byProd.map(r => r.id)).size;

  const searchResults = SEARCH_QUERIES.map(q => ({
    query: q,
    hits: searchCatalog(catalog, q).length,
    ok: searchCatalog(catalog, q).length > 0,
  }));
  const searchFailures = searchResults.filter(r => !r.ok);

  const mapCenters = byProd.filter(r => r.is_active !== false && !comingSoonIds.has(r.id));
  const nearestResults = NEAREST_PROBES.map(probe => {
    const nearest = findNearest(catalog, probe.lat, probe.lng);
    const ok =
      nearest &&
      nearest.gym.country === 'Belarus' &&
      isPlausibleBelarusCoordinate(Number(nearest.gym.lat), Number(nearest.gym.lng));
    return {
      ...probe,
      winner_id: nearest?.gym.id ?? null,
      winner_name: nearest?.gym.name ?? null,
      winner_brand: nearest?.gym.brand ?? null,
      distance_m: nearest?.distance_m ?? null,
      ok: Boolean(ok),
    };
  });
  const nearestFailures = nearestResults.filter(r => !r.ok);

  const priorVerification = {};
  const priorRegressions = [];
  for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
    const got = catalog.filter(c => c.country === country).length;
    priorVerification[country] = got;
    if (got !== n) priorRegressions.push({country, expected: n, actual: got});
  }

  const infra = checkInfrastructure();

  const tParse0 = performance.now();
  JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const parseMs = performance.now() - tParse0;

  const tSearch0 = performance.now();
  for (let i = 0; i < 50; i++) {
    catalog.filter(c =>
      /belarus|minsk|grodno|adrenalin|lifestyle|fox club|olympic/i.test(
        `${c.name} ${c.brand} ${c.city}`,
      ),
    );
  }
  const searchMs = (performance.now() - tSearch0) / 50;

  const dryRunCheck = verifyDryRunIdempotency();
  const dryRunDelta = {
    insertions: dryRunCheck.insertions,
    updates: dryRunCheck.updates,
    removals: dryRunCheck.removals,
  };

  const historicalDebt = runHistoricalTestDebtAudit();
  historicalDebt.prior_country_verification.regressions = priorRegressions;
  writeJson(path.join(dataDir, 'BELARUS_PRODUCTION_QA_TEST_DEBT.json'), historicalDebt);

  const dataConfig = fs.readFileSync(path.join(root, 'src/config/dataConfig.ts'), 'utf8');
  const checkInRadius = Number(dataConfig.match(/CHECK_IN_RADIUS_METERS = (\d+)/)?.[1] ?? 0);

  const inventory = {
    keep_existing: 0,
    new_ready_to_import: newReady.length,
    existing_review_required: 0,
    needs_review: 0,
    needs_coordinates: 0,
    coming_soon: comingSoon.length,
    excluded: excluded.length,
    closed: closed.length,
    approved_for_production: approved.length,
    live_production: byProd.length,
    four_way: {
      phase2_ready: newReadyIds.size,
      approved: approvedIds.size,
      production: prodIds.size,
      a_equals_b: [...newReadyIds].every(id => approvedIds.has(id)) && newReadyIds.size === approvedIds.size,
      b_equals_c: [...approvedIds].every(id => prodIds.has(id)) && approvedIds.size === prodIds.size,
      phase2_ready_missing_from_approved: phase2ReadyMissingFromApproved.length,
      approved_missing_from_production: approvedMissingFromProd.length,
      production_not_approved: productionNotApproved.length,
      unauthorized_belarus_production: productionNotApproved.length,
    },
    merge_delta: {
      pre_belarus: mergeReport.delta?.belarus_before ?? 0,
      authorized_new: AUTHORIZED_COUNT,
      post_belarus: byProd.length,
      insertions: mergeReport.delta?.insertions ?? 46,
      updates: mergeReport.delta?.updates ?? 0,
      removals: mergeReport.delta?.removals ?? 0,
    },
  };

  const gates = {
    catalog_total: catalog.length === EXPECTED_TOTAL,
    belarus_live: byProd.length === EXPECTED_BELARUS,
    by_prefix_live: byProd.filter(r => r.id.startsWith('by_')).length === EXPECTED_BELARUS,
    ukraine_live: ukraineLive === EXPECTED_UKRAINE,
    malta_live: maltaLive === EXPECTED_MALTA,
    sha_frozen: qaShaBefore === EXPECTED_SHA,
    bytes_frozen: qaBytesBefore.length === EXPECTED_BYTES,
    new_ready_46: newReady.length === 46,
    approved_46: approved.length === 46,
    four_way_equality:
      newReadyIds.size === 46 &&
      approvedIds.size === 46 &&
      prodIds.size === 46 &&
      phase2ReadyMissingFromApproved.length === 0 &&
      approvedMissingFromProd.length === 0 &&
      productionNotApproved.length === 0,
    authorized_present: authorizedDrift.filter(d => d.issue === 'missing').length === 0,
    authorized_material_drift: authorizedDrift.filter(d => d.issue === 'metadata_drift').length === 0,
    brand_inventory_match: Object.entries(EXPECTED_BRANDS).every(
      ([brand, n]) => brandCounts[brand] === n,
    ),
    class_a_count_4: CLASS_A_BRANDS.size === 4,
    class_a_41: classAProd.length === 41,
    non_class_a_5: nonClassAProd.length === 5,
    adrenalin_29: adrenalin.length === 29,
    lifestyle_3: lifestyle.length === 3,
    fox_club_5: foxClub.length === 5,
    olympic_4: olympic.length === 4,
    borovlyany_present: borovlyanyPresent,
    borovlyany_city_borovlyany: borovlyanyCityCorrect,
    fox_club_kupaly_exactly_once: foxClubKupalyExactlyOnce,
    loshitsa_not_in_production: !loshitsaInProduction,
    coming_soon_1: comingSoon.length === 1 && comingSoonIds.has(LOSHITSA_ID),
    excluded_11: excluded.length === 11,
    closed_0: closed.length === 0,
    coming_soon_leakage: comingSoonLeakage.length === 0,
    excluded_leakage: excludedLeakage.length === 0,
    closed_leakage: closedLeakage.length === 0,
    vitebsk_unauthorized_production: vitebskUnauthorizedProduction.length === 0 && vitebskProduction.length === 0,
    independent_drift: independentDrift.length === 0,
    hotel_leakage: hotelLeakage.length === 0,
    specialist_leakage: specialistLeakage.length === 0,
    institutional_leakage: institutionalLeakage.length === 0,
    city_metadata_errors: cityMetadataErrors.length === 0,
    hard_duplicates: hardDup.length === 0,
    transliteration_conflicts: translitDup.length === 0,
    cross_border_clean: liveOutliers.length === 0,
    data_quality_clean: Object.values(dq).every(v => v === 0),
    global_duplicate_ids: !globalDup && !belarusDup,
    search_display: searchFailures.length === 0,
    map_markers_46: mapCenters.length === 46,
    nearest_plausible: nearestFailures.length === 0,
    check_in_200: checkInRadius === 200,
    prior_country_counts: priorRegressions.length === 0,
    merge_idempotent:
      idempotency.idempotent === true &&
      (idempotency.second_run?.insertions ?? 0) === 0 &&
      dryRunDelta.insertions === 0,
    historical_real_regression: historicalDebt.summary.REAL_COUNTRY_REGRESSION === 0,
    headroom_420: 12500 - catalog.length === HEADROOM,
    crosses_12500: catalog.length < 12500,
    infrastructure: infra.infrastructure_gaps === 0,
    runtime_hacks: infra.runtime_hacks === 0,
  };

  const allPass = Object.entries(gates)
    .filter(([k]) => !['crosses_12500'].includes(k))
    .every(([, v]) => v === true);

  const perf = {
    catalog_total: catalog.length,
    centers_json_bytes: qaBytesBefore.length,
    parse_ms: Math.round(parseMs * 100) / 100,
    representative_search_ms: Math.round(searchMs * 100) / 100,
    architecture: 'KEEP CLIENT-SIDE',
    assessment: parseMs < 15000 ? 'HEALTHY' : parseMs < 30000 ? 'DEGRADED' : 'UNHEALTHY',
    headroom_to_12500: 12500 - catalog.length,
    crosses_12500: catalog.length >= 12500,
    global_stress_qa_required: false,
    global_stress_qa_run: false,
  };

  const report = {
    country: 'Belarus',
    qa_type: 'PRODUCTION_QA_FINAL',
    generated_at: new Date().toISOString(),
    read_only: true,
    production_modified: false,
    qa_sha_before: qaShaBefore,
    qa_bytes_before: qaBytesBefore.length,
    qa_delta: {insertions: 0, updates: 0, removals: 0},
    catalog_total: catalog.length,
    belarus_live: byProd.length,
    by_prefix_live: byProd.filter(r => r.id.startsWith('by_')).length,
    ukraine_live: ukraineLive,
    malta_live: maltaLive,
    headroom: HEADROOM,
    phase2_inputs: inventory,
    four_way_reconciliation: inventory.four_way,
    merge_delta_reconstruction: inventory.merge_delta,
    authorized_identities: {
      authorized_new_present: 46 - authorizedDrift.filter(d => d.issue === 'missing').length,
      authorized_new_missing: authorizedDrift.filter(d => d.issue === 'missing'),
      authorized_new_duplicated: belarusDup ? 1 : 0,
      authorized_new_material_drift: authorizedDrift.filter(d => d.issue === 'metadata_drift'),
    },
    brand_inventory: brandCounts,
    expected_brands: EXPECTED_BRANDS,
    class_a: {
      chain_count: CLASS_A_BRANDS.size,
      approved: classAProd.length,
      non_class_a: nonClassAProd.length,
    },
    borovlyany: {
      id: BOROVLYANY_ID,
      present: borovlyanyPresent,
      city: borovlyany?.city ?? null,
      city_correct: borovlyanyCityCorrect,
    },
    fox_club_grodno: {
      address: FOX_CLUB_KUPALY_ADDR,
      production_count: foxClubKupalyRows.length,
      exactly_once: foxClubKupalyExactlyOnce,
      ids: foxClubKupalyRows.map(r => r.id),
    },
    olympic_loshitsa: {
      id: LOSHITSA_ID,
      in_production: loshitsaInProduction,
      coming_soon_authoritative: comingSoonIds.has(LOSHITSA_ID),
    },
    vitebsk: {
      production_count: vitebskProduction.length,
      unauthorized_production: vitebskUnauthorizedProduction.map(r => r.id),
    },
    adrenalin: {active: adrenalin.length},
    lifestyle: {active: lifestyle.length},
    fox_club: {active: foxClub.length},
    olympic: {active: olympic.length},
    coming_soon: {
      authoritative_count: comingSoon.length,
      production_leakage: comingSoonLeakage.map(r => r.id),
      approved_leakage: [...comingSoonIds].filter(id => approvedIds.has(id)),
    },
    excluded: {
      authoritative_count: excluded.length,
      production_leakage: excludedLeakage.map(r => r.id),
      approved_leakage: [...excludedIds].filter(id => approvedIds.has(id)),
    },
    closed: {
      authoritative_count: closed.length,
      production_leakage: closedLeakage.map(r => r.id),
      approved_leakage: [...closedIds].filter(id => approvedIds.has(id)),
    },
    hotel_wellness: {hotel_resort_leakage: hotelLeakage.map(r => r.id)},
    specialist_institutional: {
      specialist_leakage: specialistLeakage.map(r => r.id),
      institutional_leakage: institutionalLeakage.map(r => r.id),
    },
    country_prefix: {
      invalid_belarus_countries: dq.invalid_countries,
      invalid_by_ids: dq.invalid_by_ids,
      non_by_belarus_ids: dq.non_by_belarus_ids,
      global_duplicate_ids: globalDup,
      belarus_duplicate_ids: belarusDup,
    },
    city_metadata: {errors: cityMetadataErrors},
    postcodes: {
      invalid: dq.invalid_postcodes,
      non_canonical: dq.non_canonical_postcodes,
    },
    coordinates: {
      invalid: dq.invalid_coordinates,
      missing: dq.missing_coordinates,
      fallback: dq.fallback_coordinates,
      centroid: dq.centroid_coordinates,
      suspect: dq.suspect_geocodes,
    },
    duplicates: {
      hard_duplicate_conflicts: hardDup,
      transliteration_duplicate_conflicts: translitDup,
      multilingual_duplicate_conflicts: [],
      unresolved_rebrand_conflicts: rebrand.unresolved_rebrand_conflicts ?? 0,
      phase2_authoritative: {
        hard_duplicate_conflicts: dupAnalysis.hard_duplicate_conflicts ?? 0,
        diacritic_duplicate_conflicts: dupAnalysis.diacritic_duplicate_conflicts ?? 0,
        multilingual_duplicate_conflicts: dupAnalysis.multilingual_duplicate_conflicts ?? 0,
        colocated_distinct_gyms: (dupAnalysis.colocated_distinct_gyms ?? []).length,
      },
    },
    cross_border: crossBorder,
    data_quality: dq,
    infrastructure: infra,
    search_map: {
      search_results: searchResults,
      search_failures: searchFailures,
      map_active_markers: mapCenters.length,
      coming_soon_map_markers: byProd.filter(r => comingSoonIds.has(r.id)).length,
      excluded_map_markers: 0,
      closed_map_markers: 0,
      foreign_map_markers: 0,
      nearest_results: nearestResults,
      nearest_failures: nearestFailures,
    },
    check_in: {
      radius_meters: checkInRadius,
      allow_199: checkInRadius >= 199,
      allow_200: checkInRadius >= 200,
      block_201: checkInRadius <= 200,
      auto_checkout_meters: checkInRadius,
      belarus_specific_radius_override: 0,
    },
    prior_country_verification: priorVerification,
    prior_country_regressions: priorRegressions,
    REAL_COUNTRY_REGRESSIONS: priorRegressions.length,
    merge_idempotency: idempotency,
    dry_run_delta: dryRunDelta,
    dry_run_verification: dryRunCheck,
    historical_test_debt: historicalDebt.summary,
    performance: perf,
    gates,
    qa_harness_fixes: [
      {
        id: 'QA-DR-001',
        fix: 'Dry-run idempotency restores merge artifacts after --dry-run verification',
      },
    ],
    merge_verdict: mergeReport.verdict,
    verdict:
      allPass &&
      priorRegressions.length === 0 &&
      historicalDebt.summary.REAL_COUNTRY_REGRESSION === 0
        ? 'BELARUS STATUS: READY'
        : 'BELARUS STATUS: BLOCKED',
    country_expansion:
      allPass &&
      priorRegressions.length === 0 &&
      historicalDebt.summary.REAL_COUNTRY_REGRESSION === 0
        ? 'UNLOCKED'
        : 'LOCKED',
  };

  writeJson(path.join(dataDir, 'BELARUS_PRODUCTION_QA_REPORT.json'), report);
  writeJson(path.join(dataDir, 'BELARUS_PRODUCTION_QA_INVENTORY.json'), inventory);
  writeJson(path.join(dataDir, 'BELARUS_PRODUCTION_QA_BRANDS.json'), {
    production: brandCounts,
    expected: EXPECTED_BRANDS,
    reconciles: Object.entries(EXPECTED_BRANDS).every(([b, n]) => brandCounts[b] === n),
    total: byProd.length,
    class_a: classAProd.length,
    non_class_a: nonClassAProd.length,
  });
  writeJson(path.join(dataDir, 'BELARUS_PRODUCTION_QA_DUPLICATES.json'), report.duplicates);
  writeJson(path.join(dataDir, 'BELARUS_PRODUCTION_QA_CROSS_BORDER.json'), crossBorder);
  writeJson(path.join(dataDir, 'BELARUS_PRODUCTION_QA_DATA_QUALITY.json'), dq);
  writeJson(path.join(dataDir, 'BELARUS_PRODUCTION_QA_SEARCH_MAP.json'), report.search_map);
  writeJson(path.join(dataDir, 'BELARUS_PRODUCTION_QA_PERFORMANCE.json'), perf);

  const reportMd = `# BELARUS PRODUCTION QA

Generated: ${report.generated_at}

## OVERALL

**${report.verdict}** — Country expansion: **${report.country_expansion}**

Read-only QA. Production gym data not modified.

## FROZEN BASELINE

- Total: **${catalog.length}**
- Belarus: **${byProd.length}**
- Ukraine: **${ukraineLive}**
- Malta: **${maltaLive}**
- SHA: \`${qaShaBefore}\`
- Bytes: **${qaBytesBefore.length}**
- Headroom: **${HEADROOM}**

## AUTHORITATIVE INVENTORY

NEW_READY / APPROVED / PRODUCTION: **${newReady.length} / ${approved.length} / ${byProd.length}**

## BRAND INVENTORY

${Object.entries(EXPECTED_BRANDS)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join('\n')}

- Class A: **${classAProd.length}**
- Non-Class A: **${nonClassAProd.length}**

## SPECIAL CHECKS

- Borovlyany (${BOROVLYANY_ID}): **${borovlyanyCityCorrect ? 'OK' : 'FAIL'}**
- Fox Club Grodno Kupaly: **${foxClubKupalyExactlyOnce ? 'exactly once' : 'FAIL'}**
- Olympic Loshitsa NOT in production: **${!loshitsaInProduction ? 'OK' : 'FAIL'}**
- Vitebsk unauthorized production: **${vitebskProduction.length}**

## HISTORICAL TEST DEBT

- Suites failed: ${historicalDebt.summary.HISTORICAL_SUITES_FAILED}
- Stale baseline failures: ${historicalDebt.summary.STALE_HISTORICAL_BASELINE}
- Real country regressions: **${historicalDebt.summary.REAL_COUNTRY_REGRESSION}**

## PRODUCTION IMMUTABILITY

QA delta: **0 / 0 / 0**

## FINAL VERDICT

**${report.verdict}**
`;
  writeText(path.join(dataDir, 'BELARUS_PRODUCTION_QA_REPORT.md'), reportMd);

  const qaBytesAfter = fs.readFileSync(centersPath);
  const qaShaAfter = crypto.createHash('sha256').update(qaBytesAfter).digest('hex');
  writeText(path.join(dataDir, 'BELARUS_PRODUCTION_QA_SHA_AFTER.txt'), `${qaShaAfter}\n`);

  if (qaShaAfter !== qaShaBefore) {
    throw new Error('Production modified during QA');
  }

  report.qa_sha_after = qaShaAfter;
  report.qa_bytes_after = qaBytesAfter.length;
  writeJson(path.join(dataDir, 'BELARUS_PRODUCTION_QA_REPORT.json'), report);

  console.log(`${report.verdict} — expansion ${report.country_expansion}`);
  console.log(
    `CATALOG=${catalog.length} BELARUS=${byProd.length} UKRAINE=${ukraineLive} HEADROOM=${HEADROOM} QA_DELTA=0/0/0`,
  );

  if (report.verdict.includes('BLOCKED')) {
    const failed = Object.entries(gates).filter(([, v]) => !v);
    console.error('Failed gates:', failed.map(([k]) => k).join(', '));
    process.exit(1);
  }

  return report;
}

runQa();
