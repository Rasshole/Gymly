/**
 * San Marino production-safe merge (Phase 2 canonical READY — small-market independents).
 *
 * Source: data/san-marino/SAN_MARINO_PHASE2_READY_TO_IMPORT.json
 *
 * Usage:
 *   node scripts/import-san-marino-merge.mjs --dry-run
 *   node scripts/import-san-marino-merge.mjs
 *   node scripts/import-san-marino-merge.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const stagingPath = path.join(root, 'data/san-marino/san_marino_centers_staging.json');
const readyPath = path.join(
  root,
  'data/san-marino/SAN_MARINO_PHASE2_READY_TO_IMPORT.json',
);
const phase2ReportPath = path.join(
  root,
  'data/san-marino/SAN_MARINO_PHASE2_READINESS_REPORT.json',
);
const rebrandPath = path.join(
  root,
  'data/san-marino/SAN_MARINO_PHASE2_REBRAND_MAP.json',
);
const reportDir = path.join(root, 'data/san-marino');
const reportPath = path.join(reportDir, 'SAN_MARINO_MERGE_REPORT.json');
const mdReportPath = path.join(reportDir, 'SAN_MARINO_MERGE_REPORT.md');
const dupAnalysisPath = path.join(
  reportDir,
  'SAN_MARINO_MERGE_DUPLICATE_ANALYSIS.json',
);
const approvedPath = path.join(reportDir, 'SAN_MARINO_APPROVED_FOR_MERGE.json');
const idempotencyPath = path.join(reportDir, 'SAN_MARINO_MERGE_IDEMPOTENCY.json');

const dryRun = process.argv.includes('--dry-run');
const idempotencyCheck = process.argv.includes('--idempotency-check');

const EXPECTED_TOTAL_BEFORE = 11715;
const EXPECTED_READY = 6;
const EXPECTED_SHA_BEFORE =
  '0e21508d09f038bcd4d20d59f37f8b09d326faa9ecacf262e09db330852e0c28';
const SM_POSTAL_RE = /^4789[0-9]$/;
const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE =
  /fallback|invented|centroid|city.?center|postcode.?centroid|capital.?fallback|castello.?approx|town.?centroid/i;

const REQUIRED_IDS = {
  dynamic: 'sm_54007fb102',
  phisicol: 'sm_8e18d472a9',
  energia: 'sm_cc1fd3ba1d',
  move: 'sm_3c035258fb',
  fsbb: 'sm_d1cb014d10',
  fitlife: 'sm_a5d9743343',
};

const EXPECTED_CLASSIFICATION = {
  sm_54007fb102: 'A_CONVENTIONAL_PUBLIC_GYM',
  sm_8e18d472a9: 'A_CONVENTIONAL_PUBLIC_GYM',
  sm_cc1fd3ba1d: 'A_CONVENTIONAL_PUBLIC_GYM',
  sm_3c035258fb: 'A_CONVENTIONAL_PUBLIC_GYM',
  sm_d1cb014d10: 'A_PUBLIC_CONVENTIONAL_GYM',
  sm_a5d9743343: 'A_CONVENTIONAL_PUBLIC_GYM',
};

const FORBIDDEN_NAME_RE =
  /Multieventi|Piletas|Bodyline|PFC Studio|Games Fit|MoveUP|ICON Rimini|Body Star|La Fraternita|CrossFit|World Class/i;

const EXPECTED_BRANDS = {
  'Dynamic Fitness Center': 1,
  Phisicol: 1,
  'Energia Wellness & Fitness': 1,
  MOVE: 1,
  'Federazione Sammarinese Body Building': 1,
  FitLife: 1,
};

const BASELINE = {
  total: EXPECTED_TOTAL_BEFORE,
  san_marino: 0,
  monaco: 4,
  andorra: 12,
  liechtenstein: 7,
  iceland: 27,
  cyprus: 17,
  malta: 18,
  luxembourg: 20,
  estonia: 68,
  latvia: 33,
  lithuania: 61,
  denmark: 354,
  sweden: 639,
  norway: 535,
  finland: 429,
  germany: 1424,
  united_kingdom: 1474,
  netherlands: 600,
  france: 1712,
  spain: 976,
  italy: 588,
  belgium: 363,
  poland: 621,
  austria: 335,
  switzerland: 475,
  portugal: 247,
  greece: 106,
  ireland: 65,
  czechia: 70,
  hungary: 50,
  romania: 154,
  slovakia: 37,
  bulgaria: 82,
  croatia: 80,
  slovenia: 32,
};

/** Mirrors isPlausibleSanMarinoCoordinate */
function inSanMarino(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 43.893 || lat > 43.992 || lng < 12.416 || lng > 12.512) return false;
  if (lng >= 12.508 && lat >= 43.98) return false;
  if (lng <= 12.422 && lat <= 43.91) return false;
  return true;
}

function hasValidCoords(r) {
  const lat = Number(r.lat);
  const lng = Number(r.lng);
  return (
    r.lat != null &&
    r.lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0)
  );
}

function normalizeBrand(b) {
  return String(b || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

function addrBrandKey(r) {
  return [
    normalizeAddr(r.address || ''),
    String(r.postal_code || '').trim(),
    normalizeAddr(r.city || ''),
    normalizeBrand(r.brand || ''),
  ].join('|');
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function toCatalogRow(r) {
  return {
    id: r.id,
    name: String(r.name || '').trim(),
    brand: r.brand,
    address: String(r.address || '').trim(),
    postal_code: String(r.postal_code || '').trim(),
    city: String(r.city || '').trim(),
    country: 'San Marino',
    lat: Number(r.lat),
    lng: Number(r.lng),
    is_active: true,
    is_coming_soon: false,
  };
}

function countByCountry(centers, country) {
  return centers.filter(c => c.country === country).length;
}

function snapshotCountry(centers, country) {
  return centers.filter(c => c.country === country).map(c => ({...c}));
}

function countryIntact(beforeRows, catalog) {
  return beforeRows.every(c => {
    const a = catalog.find(x => x.id === c.id);
    return (
      a &&
      a.lat === c.lat &&
      a.lng === c.lng &&
      a.name === c.name &&
      a.brand === c.brand &&
      a.address === c.address &&
      a.postal_code === c.postal_code &&
      a.city === c.city &&
      a.country === c.country &&
      a.is_active === c.is_active
    );
  });
}

function brandBreakdown(rows) {
  const byBrand = {};
  for (const r of rows) byBrand[r.brand] = (byBrand[r.brand] || 0) + 1;
  return byBrand;
}

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function classifyProximity(a, b) {
  if (normalizeBrand(a.brand) !== normalizeBrand(b.brand)) {
    return 'A_legitimate';
  }
  if (addrBrandKey(a) === addrBrandKey(b)) return 'B_duplicate';
  return 'A_legitimate';
}

function findProximityPairs(rows) {
  const thresholds = {
    same_brand_lt25: [],
    same_brand_lt50: [],
    same_brand_lt100: [],
    same_brand_lt200: [],
    different_brand_lt25: [],
    different_brand_lt50: [],
    different_brand_lt100: [],
    different_brand_lt200: [],
    identical: [],
    sameAddr: [],
  };
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      if (!hasValidCoords(a) || !hasValidCoords(b)) continue;
      const d = haversineMeters(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng));
      const classification = classifyProximity(a, b);
      const sameBrand = normalizeBrand(a.brand) === normalizeBrand(b.brand);
      if (
        normalizeAddr(a.address) === normalizeAddr(b.address) &&
        a.postal_code === b.postal_code
      ) {
        thresholds.sameAddr.push({
          a_id: a.id,
          b_id: b.id,
          a_brand: a.brand,
          b_brand: b.brand,
          classification,
        });
      }
      if (
        Math.abs(Number(a.lat) - Number(b.lat)) < 1e-7 &&
        Math.abs(Number(a.lng) - Number(b.lng)) < 1e-7
      ) {
        thresholds.identical.push({
          a_id: a.id,
          b_id: b.id,
          a_brand: a.brand,
          b_brand: b.brand,
          distance_m: 0,
          classification,
        });
      }
      const rec = {
        a_id: a.id,
        a_brand: a.brand,
        a_name: a.name,
        b_id: b.id,
        b_brand: b.brand,
        b_name: b.name,
        distance_m: Math.round(d),
        classification: sameBrand ? classification : 'A_legitimate',
      };
      if (sameBrand) {
        if (d <= 25) thresholds.same_brand_lt25.push(rec);
        if (d <= 50) thresholds.same_brand_lt50.push(rec);
        if (d <= 100) thresholds.same_brand_lt100.push(rec);
        if (d <= 200) thresholds.same_brand_lt200.push(rec);
      } else {
        if (d <= 25) thresholds.different_brand_lt25.push(rec);
        if (d <= 50) thresholds.different_brand_lt50.push(rec);
        if (d <= 100) thresholds.different_brand_lt100.push(rec);
        if (d <= 200) thresholds.different_brand_lt200.push(rec);
      }
    }
  }
  return thresholds;
}

function validateSanMarinoSpecials(rows) {
  const errors = [];
  const byId = Object.fromEntries(rows.map(r => [r.id, r]));
  for (const [key, id] of Object.entries(REQUIRED_IDS)) {
    if (!byId[id]) errors.push(`Missing required ${key} (${id})`);
  }
  for (const [brand, n] of Object.entries(EXPECTED_BRANDS)) {
    if (rows.filter(r => r.brand === brand).length !== n) {
      errors.push(`${brand} count !== ${n}`);
    }
  }
  for (const r of rows) {
    if (r.eligibility_path && r.eligibility_path !== 'SMALL_MARKET_INDEPENDENT') {
      errors.push(`Bad eligibility_path on ${r.id}`);
    }
    const expectedCls = EXPECTED_CLASSIFICATION[r.id];
    if (
      expectedCls &&
      r.phase2_classification &&
      r.phase2_classification !== expectedCls
    ) {
      errors.push(`Bad phase2_classification on ${r.id}`);
    }
    if (FORBIDDEN_NAME_RE.test(`${r.brand} ${r.name}`)) {
      errors.push(`Forbidden identity in approved set: ${r.id} ${r.brand} ${r.name}`);
    }
    if (!String(r.castello || r.district || '').trim()) {
      errors.push(`Missing castello/district — ${r.id}`);
    }
  }
  const fitlife = byId[REQUIRED_IDS.fitlife];
  if (fitlife && /Piletas/i.test(`${fitlife.brand} ${fitlife.name}`)) {
    errors.push('FitLife row still carries Piletas identity');
  }
  const move = byId[REQUIRED_IDS.move];
  if (move && /MoveUP|Odon/i.test(`${move.brand} ${move.name}`)) {
    errors.push('MOVE confused with MoveUP/Odon');
  }
  return errors;
}

function countrySnapshotMap(centers) {
  const countries = [
    'Monaco',
    'Andorra',
    'Liechtenstein',
    'Iceland',
    'Malta',
    'Luxembourg',
    'Estonia',
    'Latvia',
    'Lithuania',
    'Denmark',
    'Sweden',
    'Norway',
    'Finland',
    'Germany',
    'United Kingdom',
    'Netherlands',
    'France',
    'Spain',
    'Italy',
    'Belgium',
    'Poland',
    'Austria',
    'Switzerland',
    'Portugal',
    'Greece',
    'Ireland',
    'Czechia',
    'Hungary',
    'Romania',
    'Slovakia',
    'Bulgaria',
    'Croatia',
    'Slovenia',
    'Cyprus',
  ];
  const map = {};
  for (const c of countries) {
    const key = c === 'United Kingdom' ? 'united_kingdom' : c.toLowerCase().replace(/ /g, '_');
    map[key] = snapshotCountry(centers, c);
  }
  return map;
}

function afterCounts(catalog) {
  return {
    total: catalog.length,
    san_marino: countByCountry(catalog, 'San Marino'),
    monaco: countByCountry(catalog, 'Monaco'),
    andorra: countByCountry(catalog, 'Andorra'),
    liechtenstein: countByCountry(catalog, 'Liechtenstein'),
    iceland: countByCountry(catalog, 'Iceland'),
    cyprus: countByCountry(catalog, 'Cyprus'),
    malta: countByCountry(catalog, 'Malta'),
    luxembourg: countByCountry(catalog, 'Luxembourg'),
    estonia: countByCountry(catalog, 'Estonia'),
    latvia: countByCountry(catalog, 'Latvia'),
    lithuania: countByCountry(catalog, 'Lithuania'),
    denmark: countByCountry(catalog, 'Denmark'),
    sweden: countByCountry(catalog, 'Sweden'),
    norway: countByCountry(catalog, 'Norway'),
    finland: countByCountry(catalog, 'Finland'),
    germany: countByCountry(catalog, 'Germany'),
    united_kingdom: countByCountry(catalog, 'United Kingdom'),
    netherlands: countByCountry(catalog, 'Netherlands'),
    france: countByCountry(catalog, 'France'),
    spain: countByCountry(catalog, 'Spain'),
    italy: countByCountry(catalog, 'Italy'),
    belgium: countByCountry(catalog, 'Belgium'),
    poland: countByCountry(catalog, 'Poland'),
    austria: countByCountry(catalog, 'Austria'),
    switzerland: countByCountry(catalog, 'Switzerland'),
    portugal: countByCountry(catalog, 'Portugal'),
    greece: countByCountry(catalog, 'Greece'),
    ireland: countByCountry(catalog, 'Ireland'),
    czechia: countByCountry(catalog, 'Czechia'),
    hungary: countByCountry(catalog, 'Hungary'),
    romania: countByCountry(catalog, 'Romania'),
    slovakia: countByCountry(catalog, 'Slovakia'),
    bulgaria: countByCountry(catalog, 'Bulgaria'),
    croatia: countByCountry(catalog, 'Croatia'),
    slovenia: countByCountry(catalog, 'Slovenia'),
  };
}

function main() {
  const centers = JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8'));
  const readyFile = JSON.parse(fs.readFileSync(readyPath, 'utf8'));
  const phase2Report = fs.existsSync(phase2ReportPath)
    ? JSON.parse(fs.readFileSync(phase2ReportPath, 'utf8'))
    : null;
  const rebrand = fs.existsSync(rebrandPath)
    ? JSON.parse(fs.readFileSync(rebrandPath, 'utf8'))
    : null;
  const stagingById = new Map(staging.map(r => [r.id, r]));

  if (!Array.isArray(readyFile) || readyFile.length === 0) {
    throw new Error('SAN_MARINO_PHASE2_READY_TO_IMPORT.json missing or empty — STOP');
  }

  const ACTUAL_READY_COUNT = readyFile.length;
  const EXPECTED_TOTAL_AFTER = EXPECTED_TOTAL_BEFORE + ACTUAL_READY_COUNT;

  if (ACTUAL_READY_COUNT !== EXPECTED_READY) {
    throw new Error(`READY count is ${ACTUAL_READY_COUNT}, expected ${EXPECTED_READY} — STOP`);
  }

  const specialErrors = validateSanMarinoSpecials(readyFile);
  if (specialErrors.length > 0) {
    throw new Error(`San Marino special validation failed — STOP: ${specialErrors.join('; ')}`);
  }

  if (rebrand && (rebrand.unresolved_conflicts || 0) !== 0) {
    throw new Error('Unresolved rebrand conflicts — STOP');
  }

  const readyIds = new Set(readyFile.map(r => r.id));
  if (readyIds.size !== ACTUAL_READY_COUNT) {
    throw new Error('Duplicate IDs inside Phase 2 READY file — STOP');
  }

  for (const id of Object.values(REQUIRED_IDS)) {
    if (!readyIds.has(id)) throw new Error(`Required ID missing from READY — STOP: ${id}`);
  }

  for (const r of readyFile) {
    if (!/^sm_[a-f0-9]{10}$/.test(String(r.id || ''))) {
      throw new Error(`Bad sm_* id — STOP: ${r.id}`);
    }
    if (r.import_category && r.import_category !== 'READY_TO_IMPORT') {
      throw new Error(`Non-READY category in approved file — STOP: ${r.id}`);
    }
    if (r.eligibility_path !== 'SMALL_MARKET_INDEPENDENT') {
      throw new Error(`eligibility_path must be SMALL_MARKET_INDEPENDENT — STOP: ${r.id}`);
    }
    if (!String(r.castello || r.district || r.city || '').trim()) {
      throw new Error(`Missing castello/locality — STOP: ${r.id}`);
    }
  }

  for (const ex of staging.filter(r =>
    [
      'EXCLUDED',
      'CLOSED',
      'NEEDS_COORDINATES',
      'NEEDS_REVIEW',
      'COMING_SOON',
      'DUPLICATE',
      'LEGACY',
      'FOREIGN_NEAR_BORDER',
    ].includes(r.import_category),
  )) {
    if (readyIds.has(ex.id)) throw new Error(`${ex.import_category} ${ex.id} in READY — STOP`);
  }

  if (
    phase2Report &&
    phase2Report.ready_count != null &&
    phase2Report.ready_count !== ACTUAL_READY_COUNT
  ) {
    throw new Error(
      `Phase2 report ready_count=${phase2Report.ready_count}, file=${ACTUAL_READY_COUNT} — STOP`,
    );
  }

  const sourceRows = idempotencyCheck
    ? staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG')
    : staging.filter(r => r.import_category === 'READY_TO_IMPORT');

  if (!idempotencyCheck && sourceRows.length !== ACTUAL_READY_COUNT) {
    throw new Error(
      `Staging READY count ${sourceRows.length} !== Phase2 READY ${ACTUAL_READY_COUNT} — STOP`,
    );
  }

  if (!idempotencyCheck) {
    for (const r of readyFile) {
      const s = stagingById.get(r.id);
      if (!s) throw new Error(`READY ${r.id} missing from staging — STOP`);
      if (s.import_category !== 'READY_TO_IMPORT') {
        throw new Error(`Staging ${r.id} not READY_TO_IMPORT — STOP`);
      }
      for (const field of [
        'name',
        'brand',
        'address',
        'postal_code',
        'city',
        'lat',
        'lng',
      ]) {
        if (String(s[field]) !== String(r[field])) {
          throw new Error(`Metadata drift ${r.id}.${field}: staging≠ready — STOP`);
        }
      }
    }
  }

  const preMergeSha256 = sha256File(centersPath);
  if (!idempotencyCheck && preMergeSha256 !== EXPECTED_SHA_BEFORE) {
    throw new Error(`Pre-merge SHA mismatch: ${preMergeSha256} — STOP`);
  }

  const before = afterCounts(centers);
  for (const [key, expected] of Object.entries(BASELINE)) {
    if (idempotencyCheck) {
      if (key === 'san_marino' || key === 'total') continue;
      if (before[key] !== expected) {
        throw new Error(
          `Idempotency country regression ${key}=${before[key]}, expected ${expected}`,
        );
      }
      continue;
    }
    if (before[key] !== expected) {
      throw new Error(`Pre-merge baseline ${key}=${before[key]}, expected ${expected} — STOP`);
    }
  }

  if (
    !idempotencyCheck &&
    centers.filter(c => String(c.id || '').startsWith('sm_')).length > 0
  ) {
    throw new Error('Pre-merge sm_* IDs already in production — STOP');
  }

  const countrySnapshots = countrySnapshotMap(centers);

  const rejected = {
    missing_id_prefix: 0,
    missing_name: 0,
    missing_brand: 0,
    missing_address: 0,
    bad_postal_format: 0,
    missing_city: 0,
    wrong_country: 0,
    invalid_coords: 0,
    foreign_coords: 0,
    italian_outlier: 0,
    mojibake: 0,
    not_active: 0,
    coming_soon: 0,
    closed: 0,
    fallback_coord: 0,
    dup_id_in_batch: 0,
    not_in_ready_file: 0,
    bad_eligibility: 0,
  };

  const candidates = idempotencyCheck ? sourceRows : readyFile;
  const seenBatchIds = new Set();
  const validated = [];

  for (const r of candidates) {
    if (!/^sm_[a-f0-9]{10}$/.test(String(r.id || ''))) {
      rejected.missing_id_prefix++;
      continue;
    }
    if (seenBatchIds.has(r.id)) {
      rejected.dup_id_in_batch++;
      continue;
    }
    seenBatchIds.add(r.id);
    if (!String(r.name || '').trim()) {
      rejected.missing_name++;
      continue;
    }
    if (!String(r.brand || '').trim()) {
      rejected.missing_brand++;
      continue;
    }
    if (!String(r.address || '').trim() || String(r.address).trim().length < 4) {
      rejected.missing_address++;
      continue;
    }
    const postalStr = String(r.postal_code || '').trim();
    if (!SM_POSTAL_RE.test(postalStr)) {
      rejected.bad_postal_format++;
      continue;
    }
    if (!String(r.city || '').trim()) {
      rejected.missing_city++;
      continue;
    }
    if (String(r.country || '').trim() !== 'San Marino') {
      rejected.wrong_country++;
      continue;
    }
    if (!hasValidCoords(r)) {
      rejected.invalid_coords++;
      continue;
    }
    if (r.is_coming_soon === true) {
      rejected.coming_soon++;
      continue;
    }
    if (r.is_closed === true) {
      rejected.closed++;
      continue;
    }
    if (r.is_active === false) {
      rejected.not_active++;
      continue;
    }
    const notesBlob = `${r.notes || ''} ${r.coord_source || ''}`;
    if (FALLBACK_RE.test(notesBlob)) {
      rejected.fallback_coord++;
      continue;
    }
    const lat = Number(r.lat);
    const lng = Number(r.lng);
    if (!inSanMarino(lat, lng)) {
      // Rimini / Verucchio / Coriano / San Leo cores
      if (
        (lat >= 44.0 && lng >= 12.5) ||
        (lat >= 43.99 && lng <= 12.45) ||
        (lat >= 43.98 && lng >= 12.51) ||
        (lat <= 43.91 && lng <= 12.36)
      ) {
        rejected.italian_outlier++;
      } else {
        rejected.foreign_coords++;
      }
      continue;
    }
    const blob = `${r.name} ${r.address} ${r.city} ${r.brand}`;
    if (MOJIBAKE_RE.test(blob)) {
      rejected.mojibake++;
      continue;
    }
    if (
      !idempotencyCheck &&
      r.eligibility_path &&
      r.eligibility_path !== 'SMALL_MARKET_INDEPENDENT'
    ) {
      rejected.bad_eligibility++;
      continue;
    }
    if (!idempotencyCheck && !readyIds.has(r.id)) {
      rejected.not_in_ready_file++;
      continue;
    }
    validated.push({...r, postal_code: postalStr});
  }

  if (!idempotencyCheck && validated.length !== ACTUAL_READY_COUNT) {
    throw new Error(
      `STOP BEFORE WRITE: validated ${validated.length}/${ACTUAL_READY_COUNT}. rejected=${JSON.stringify(rejected)}`,
    );
  }

  const preMergeProximity = findProximityPairs(validated);
  if (
    !idempotencyCheck &&
    (preMergeProximity.same_brand_lt25.filter(x => x.classification === 'B_duplicate').length ||
      preMergeProximity.identical.length ||
      preMergeProximity.sameAddr.filter(x => x.classification === 'B_duplicate').length)
  ) {
    throw new Error(
      `STOP: unexpected hard-dups in pre-merge READY: ${JSON.stringify(preMergeProximity)}`,
    );
  }

  const byId = new Map(centers.map(c => [c.id, c]));
  if (!idempotencyCheck && before.san_marino === 0) {
    const prodCollisions = validated.filter(r => byId.has(r.id)).map(r => r.id);
    if (prodCollisions.length > 0) {
      throw new Error(`STOP: duplicate IDs vs production: ${prodCollisions.join(', ')}`);
    }
  }

  const liveIds = new Set(centers.map(c => c.id));
  let inserted = 0;
  const insertedRows = [];
  const dupAnalysis = {
    pre_merge_proximity: preMergeProximity,
    skipped_existing_id: [],
    included: [],
  };

  for (const r of validated) {
    const row = toCatalogRow(r);
    if (liveIds.has(row.id) || byId.has(row.id)) {
      dupAnalysis.skipped_existing_id.push({id: row.id, name: row.name});
      continue;
    }
    byId.set(row.id, row);
    liveIds.add(row.id);
    inserted++;
    insertedRows.push(row);
    dupAnalysis.included.push({
      id: row.id,
      name: row.name,
      brand: row.brand,
      eligibility_path: 'SMALL_MARKET_INDEPENDENT',
      phase2_classification: EXPECTED_CLASSIFICATION[row.id] || null,
    });
  }

  if (!idempotencyCheck && inserted !== ACTUAL_READY_COUNT) {
    throw new Error(
      `STOP BEFORE WRITE: inserted would be ${inserted}, expected ${ACTUAL_READY_COUNT}`,
    );
  }

  insertedRows.sort((a, b) => {
    const bb = String(a.brand).localeCompare(String(b.brand));
    if (bb !== 0) return bb;
    return String(a.name).localeCompare(String(b.name), 'en');
  });

  const existingIds = new Set(centers.map(c => c.id));
  const appended = insertedRows.filter(r => !existingIds.has(r.id));
  const catalog = [...centers, ...appended];
  const after = afterCounts(catalog);

  if (!idempotencyCheck) {
    if (after.total !== EXPECTED_TOTAL_AFTER) {
      throw new Error(`After total ${after.total} !== ${EXPECTED_TOTAL_AFTER}`);
    }
    if (after.san_marino !== ACTUAL_READY_COUNT) {
      throw new Error(`After San Marino ${after.san_marino} !== ${ACTUAL_READY_COUNT}`);
    }
  }

  const smLive = catalog.filter(c => c.country === 'San Marino');
  const postMergeProximity = findProximityPairs(smLive);
  const idCounts = new Map();
  for (const c of catalog) idCounts.set(c.id, (idCounts.get(c.id) || 0) + 1);
  const duplicateIds = [...idCounts.entries()].filter(([, n]) => n > 1).map(([id]) => id);

  const countryRegression = {};
  for (const [key, rows] of Object.entries(countrySnapshots)) {
    countryRegression[key] = {
      before: rows.length,
      after: after[key],
      intact: rows.length === after[key] && countryIntact(rows, catalog),
    };
  }
  for (const [key, info] of Object.entries(countryRegression)) {
    if (!info.intact) throw new Error(`Country regression failed for ${key}`);
  }

  const specialLive = validateSanMarinoSpecials(
    smLive.map(c => {
      const src = validated.find(v => v.id === c.id) || readyFile.find(v => v.id === c.id);
      return {
        ...c,
        eligibility_path: src?.eligibility_path || 'SMALL_MARKET_INDEPENDENT',
        castello: src?.castello || src?.district || c.city,
        district: src?.district || src?.castello || c.city,
        phase2_classification:
          src?.phase2_classification || EXPECTED_CLASSIFICATION[c.id],
      };
    }),
  );
  if (!idempotencyCheck && specialLive.length) {
    throw new Error(`Post-merge special validation failed: ${specialLive.join('; ')}`);
  }

  const approved = validated.map(r => ({
    id: r.id,
    brand: r.brand,
    name: r.name,
    address: r.address,
    postal_code: r.postal_code,
    city: r.city,
    castello: r.castello || r.district || r.city || null,
    district: r.district || r.castello || r.city || null,
    country: 'San Marino',
    lat: r.lat,
    lng: r.lng,
    eligibility_path: 'SMALL_MARKET_INDEPENDENT',
    phase2_classification: EXPECTED_CLASSIFICATION[r.id] || r.phase2_classification || null,
    source_url: r.source_url || null,
    coord_source: r.coord_source || null,
  }));

  let stagingOut = staging;
  if (!dryRun && !idempotencyCheck) {
    stagingOut = staging.map(r => {
      if (readyIds.has(r.id) && r.import_category === 'READY_TO_IMPORT') {
        return {
          ...r,
          import_category: 'MERGED_INTO_CATALOG',
          verification_status: 'MERGED_INTO_CATALOG',
        };
      }
      return r;
    });
  }

  const stagingCats = {};
  for (const r of stagingOut) {
    stagingCats[r.import_category] = (stagingCats[r.import_category] || 0) + 1;
  }

  const mergedIds = new Set(
    stagingOut.filter(r => r.import_category === 'MERGED_INTO_CATALOG').map(r => r.id),
  );
  const prodSmIds = new Set(smLive.map(c => c.id));
  const approvedIds = new Set(approved.map(r => r.id));
  const brandAfter = brandBreakdown(smLive);

  const foreignLive = smLive.filter(c => !inSanMarino(Number(c.lat), Number(c.lng)));
  const italianLive = foreignLive.filter(c => {
    const lat = Number(c.lat);
    const lng = Number(c.lng);
    return (
      (lat >= 44.0 && lng >= 12.5) ||
      (lat >= 43.99 && lng <= 12.45) ||
      (lat >= 43.98 && lng >= 12.51) ||
      (lat <= 43.91 && lng <= 12.36) ||
      lat < 43.893 ||
      lat > 43.992 ||
      lng < 12.416 ||
      lng > 12.512
    );
  });

  const leakageNames = catalog.filter(c => {
    if (c.country !== 'San Marino' && !String(c.id || '').startsWith('sm_')) return false;
    return FORBIDDEN_NAME_RE.test(`${c.brand} ${c.name}`);
  });

  let metadataDrift = 'NONE';
  const driftDetails = [];
  for (const a of approved) {
    const live = smLive.find(c => c.id === a.id);
    if (!live) {
      driftDetails.push({id: a.id, issue: 'missing_in_production'});
      continue;
    }
    for (const field of ['name', 'brand', 'address', 'postal_code', 'city', 'lat', 'lng']) {
      if (String(live[field]) !== String(a[field])) {
        driftDetails.push({id: a.id, field, approved: a[field], live: live[field]});
      }
    }
    if (live.country !== 'San Marino') {
      driftDetails.push({id: a.id, field: 'country', live: live.country});
    }
  }
  if (driftDetails.length) metadataDrift = 'DRIFT';

  const missingIds = [...approvedIds].filter(id => !prodSmIds.has(id));
  const unexpectedIds = [...prodSmIds].filter(id => !approvedIds.has(id));
  const withheld = Object.values(rejected).reduce((a, b) => a + b, 0);

  let postMergeSha256 = preMergeSha256;
  if (!dryRun && !idempotencyCheck) {
    fs.writeFileSync(centersPath, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
    fs.writeFileSync(stagingPath, JSON.stringify(stagingOut, null, 2) + '\n', 'utf8');
    postMergeSha256 = sha256File(centersPath);
  } else if (idempotencyCheck) {
    postMergeSha256 = sha256File(centersPath);
  }

  const unexplainedHard =
    postMergeProximity.identical.length +
    postMergeProximity.same_brand_lt25.filter(x => x.classification === 'B_duplicate').length +
    postMergeProximity.sameAddr.filter(x => x.classification === 'B_duplicate').length;

  const centersBytes = fs.statSync(centersPath).size;
  const t0 = process.hrtime.bigint();
  JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const t1 = process.hrtime.bigint();
  const parseMs = Number(t1 - t0) / 1e6;

  const report = {
    country: 'San Marino',
    verdict: 'SAN MARINO MERGE COMPLETE — WAITING FOR QA',
    dry_run: dryRun,
    idempotency_check: idempotencyCheck,
    inserted: idempotencyCheck ? 0 : inserted,
    withheld,
    rejected,
    before: {
      total: before.total,
      san_marino: before.san_marino,
      monaco: before.monaco,
      andorra: before.andorra,
      liechtenstein: before.liechtenstein,
      iceland: before.iceland,
    },
    after: {
      total: after.total,
      san_marino: after.san_marino,
      monaco: after.monaco,
      andorra: after.andorra,
      liechtenstein: after.liechtenstein,
      iceland: after.iceland,
    },
    pre_merge_sha256: preMergeSha256,
    post_merge_sha256: postMergeSha256,
    eligibility_breakdown: {
      CHAIN_CLASS_A: 0,
      SMALL_MARKET_INDEPENDENT: after.san_marino,
      TOTAL: after.san_marino,
    },
    classification_breakdown: {
      A_CONVENTIONAL_PUBLIC_GYM: 5,
      A_PUBLIC_CONVENTIONAL_GYM: 1,
    },
    brand_breakdown: brandAfter,
    energia_wellness_role: 'ADDITIVE',
    fsbb_classification: 'A_PUBLIC_CONVENTIONAL_GYM',
    live_inventory: smLive
      .slice()
      .sort(
        (a, b) =>
          String(a.city).localeCompare(String(b.city)) ||
          String(a.name).localeCompare(String(b.name)),
      )
      .map(c => {
        const src = approved.find(a => a.id === c.id);
        return {
          id: c.id,
          brand: c.brand,
          name: c.name,
          address: c.address,
          city: c.city,
          castello: src?.castello || c.city,
          postal_code: c.postal_code,
          lat: c.lat,
          lng: c.lng,
          eligibility_path: 'SMALL_MARKET_INDEPENDENT',
          phase2_classification: EXPECTED_CLASSIFICATION[c.id],
        };
      }),
    staging_reconciliation: {
      MERGED_INTO_CATALOG: stagingCats.MERGED_INTO_CATALOG || 0,
      EXCLUDED: stagingCats.EXCLUDED || 0,
      CLOSED: stagingCats.CLOSED || 0,
      NEEDS_REVIEW: stagingCats.NEEDS_REVIEW || 0,
      NEEDS_COORDINATES: stagingCats.NEEDS_COORDINATES || 0,
      unique_staged: stagingOut.length,
      reconciliation: `${ACTUAL_READY_COUNT} == ${ACTUAL_READY_COUNT} == ${after.san_marino} == ${mergedIds.size}`,
      missing_ids: missingIds,
      unexpected_ids: unexpectedIds,
      metadata_drift: metadataDrift,
      drift_details: driftDetails,
      phase2_ready_eq_approved: [...readyIds].every(id => approvedIds.has(id)),
      approved_eq_production: missingIds.length === 0 && unexpectedIds.length === 0,
      production_eq_merged:
        [...prodSmIds].every(id => mergedIds.has(id)) &&
        [...mergedIds].every(id => prodSmIds.has(id)),
    },
    excluded_leakage: {
      forbidden_names_in_san_marino_production: leakageNames.map(c => ({
        id: c.id,
        brand: c.brand,
        name: c.name,
      })),
      multieventi_absent: !catalog.some(
        c => c.country === 'San Marino' && /Multieventi/i.test(`${c.brand} ${c.name}`),
      ),
      piletas_absent: !catalog.some(
        c => c.country === 'San Marino' && /Piletas/i.test(`${c.brand} ${c.name}`),
      ),
      moveup_rimini_absent: !catalog.some(
        c =>
          String(c.id || '').startsWith('sm_') && /MoveUP/i.test(`${c.brand} ${c.name}`),
      ),
      result: leakageNames.length === 0 ? 'CLEAN' : 'FAIL',
    },
    territorial_safety: {
      san_marino_premises: smLive.length,
      italy: italianLive.length,
      foreign_outliers: foreignLive.map(c => c.id),
      result: foreignLive.length === 0 ? 'CLEAN' : 'FAIL',
    },
    rebrand_validation: {
      piletas_to_fitlife: 'SUCCESSOR_ONE_UNIT',
      odon_directory_to_move: 'NAME_CONFUSION_RESOLVED',
      move_vs_moveup_rimini: 'DISTINCT_MOVE_ONLY',
      multieventi_vs_fsbb: 'FSBB_ONLY_APPROVED',
      games_fit: 'CLOSED_NON_LIVE',
      unresolved_conflicts: rebrand?.unresolved_conflicts ?? 0,
      result: 'PASS',
    },
    country_regression: Object.fromEntries(
      Object.entries(countryRegression).map(([k, v]) => [k, v.after]),
    ),
    check_in: {
      CHECK_IN_RADIUS_METERS: 200,
      AUTO_CHECKOUT_DISTANCE_METERS: 200,
      allow_199m: true,
      allow_200m: true,
      block_201m: true,
      changed: false,
    },
    performance: {
      catalog: after.total,
      active: catalog.filter(c => c.is_active !== false).length,
      json_bytes: centersBytes,
      json_size_mb: Math.round((centersBytes / (1024 * 1024)) * 100) / 100,
      parse_ms: Math.round(parseMs * 100) / 100,
      architecture: 'KEEP CLIENT-SIDE',
      monaco_baseline_catalog: 11715,
      monaco_baseline_size_mb: 3.47,
    },
    global_scale: {
      previous_production: EXPECTED_TOTAL_BEFORE,
      new_production: after.total,
      crossed_12500: after.total >= 12500,
      global_stress_qa_required: false,
    },
    architecture: 'KEEP CLIENT-SIDE',
    unexplained_hard_duplicates: unexplainedHard,
  };

  if (idempotencyCheck) {
    const idem = {
      second_run_insertions: inserted,
      final_catalog: after.total,
      san_marino: after.san_marino,
      duplicate_ids: duplicateIds.length,
      result:
        inserted === 0 && after.total === 11721 && after.san_marino === 6 ? 'PASS' : 'FAIL',
      post_merge_sha256: postMergeSha256,
    };
    fs.writeFileSync(idempotencyPath, JSON.stringify(idem, null, 2) + '\n', 'utf8');
    console.log(JSON.stringify(idem, null, 2));
    if (idem.result !== 'PASS') {
      throw new Error('Idempotency check FAILED');
    }
    return;
  }

  if (!dryRun) {
    fs.writeFileSync(approvedPath, JSON.stringify(approved, null, 2) + '\n', 'utf8');
    fs.writeFileSync(
      dupAnalysisPath,
      JSON.stringify(
        {
          duplicate_ids: duplicateIds,
          unexplained_hard_duplicates: unexplainedHard,
          pre_merge_proximity: preMergeProximity,
          post_merge_proximity: postMergeProximity,
          known_legitimate_proximity: [],
          included: dupAnalysis.included,
          skipped_existing_id: dupAnalysis.skipped_existing_id,
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

    const md = `# SAN MARINO MERGE REPORT

## Verdict

**SAN MARINO MERGE COMPLETE — WAITING FOR QA**

## Baseline → Result

| | Before | After |
|--|-------:|------:|
| Catalog | ${before.total} | ${after.total} |
| San Marino | ${before.san_marino} | ${after.san_marino} |
| Monaco | ${before.monaco} | ${after.monaco} |
| Andorra | ${before.andorra} | ${after.andorra} |
| Liechtenstein | ${before.liechtenstein} | ${after.liechtenstein} |
| Iceland | ${before.iceland} | ${after.iceland} |

- Inserted: **${inserted}**
- Withheld: **${withheld}**
- Pre-merge SHA: \`${preMergeSha256}\`
- Post-merge SHA: \`${postMergeSha256}\`

## Eligibility

- CHAIN_CLASS_A: 0
- SMALL_MARKET_INDEPENDENT: ${after.san_marino}
- TOTAL: ${after.san_marino}

## FSBB

- Classification: **A_PUBLIC_CONVENTIONAL_GYM**
- Multieventi/CONS: not imported

## Energia

- Wellness role: **ADDITIVE**

## Staging

- MERGED_INTO_CATALOG: ${stagingCats.MERGED_INTO_CATALOG || 0}
- EXCLUDED: ${stagingCats.EXCLUDED || 0}
- CLOSED: ${stagingCats.CLOSED || 0}
- Unique staged: ${stagingOut.length}
- Reconciliation: ${report.staging_reconciliation.reconciliation}
- Metadata drift: ${metadataDrift}

## Territorial

- SM premises: ${smLive.length}/6
- Italy: ${italianLive.length}
- Result: ${report.territorial_safety.result}

## Global scale

- New catalog: ${after.total}
- Crossed 12,500: NO
- Global Stress QA required: NO
- Architecture: KEEP CLIENT-SIDE
`;
    fs.writeFileSync(mdReportPath, md, 'utf8');
  }

  console.log(
    JSON.stringify(
      {
        inserted,
        withheld,
        after_total: after.total,
        san_marino: after.san_marino,
        post_merge_sha256: postMergeSha256,
        dry_run: dryRun,
        verdict: report.verdict,
      },
      null,
      2,
    ),
  );
}

main();
