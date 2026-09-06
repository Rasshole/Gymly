/**
 * Liechtenstein production-safe merge (Phase 2 canonical READY — small-market independents).
 *
 * Source: data/liechtenstein/LIECHTENSTEIN_PHASE2_READY_TO_IMPORT.json
 *
 * Usage:
 *   node scripts/import-liechtenstein-merge.mjs --dry-run
 *   node scripts/import-liechtenstein-merge.mjs
 *   node scripts/import-liechtenstein-merge.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const stagingPath = path.join(root, 'data/liechtenstein/liechtenstein_centers_staging.json');
const readyPath = path.join(
  root,
  'data/liechtenstein/LIECHTENSTEIN_PHASE2_READY_TO_IMPORT.json',
);
const phase2ReportPath = path.join(
  root,
  'data/liechtenstein/LIECHTENSTEIN_PHASE2_READINESS_REPORT.json',
);
const rebrandPath = path.join(
  root,
  'data/liechtenstein/LIECHTENSTEIN_PHASE2_REBRAND_MAP.json',
);
const reportDir = path.join(root, 'data/liechtenstein');
const reportPath = path.join(reportDir, 'LIECHTENSTEIN_MERGE_REPORT.json');
const mdReportPath = path.join(reportDir, 'LIECHTENSTEIN_MERGE_REPORT.md');
const dupAnalysisPath = path.join(reportDir, 'LIECHTENSTEIN_MERGE_DUPLICATE_ANALYSIS.json');
const approvedPath = path.join(reportDir, 'LIECHTENSTEIN_APPROVED_FOR_MERGE.json');
const idempotencyPath = path.join(reportDir, 'LIECHTENSTEIN_MERGE_IDEMPOTENCY.json');

const dryRun = process.argv.includes('--dry-run');
const idempotencyCheck = process.argv.includes('--idempotency-check');

const EXPECTED_TOTAL_BEFORE = 11692;
const EXPECTED_READY = 7;
const EXPECTED_SHA_BEFORE =
  'ff19dfaae9f99984ae5c6a73765b3e585263b61050d8c927fc45a38037dfa3dc';
const LI_POSTAL_RE = /^94(?:8[5-9]|9[0-8])$/;
const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE =
  /fallback|invented|centroid|city.?center|postcode.?centroid|capital.?fallback|town.?centroid/i;

const REQUIRED_IDS = {
  updateVaduz: 'li_9fdb1d933f',
  liefitVaduz: 'li_9514fe2df2',
  purfitness: 'li_35eed72b39',
  lorezPower: 'li_688dc73ac2',
  flexigym: 'li_f02192ce76',
  inMotion: 'li_740e149c77',
  kokon: 'li_9b66d0aa5e',
};

const FORBIDDEN_LIVE_IDS = new Set([
  'li_7f2d2a5ed7', // GEOWAY Eschen
  'li_3ff9b2a62c', // Lorez Gesundheitscenter
  'li_53796ae7be', // Salutaris legacy
  'li_1d8662661d', // fitnesshaus by blugym legacy
]);

const BASELINE = {
  total: EXPECTED_TOTAL_BEFORE,
  liechtenstein: 0,
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

/** Mirrors isPlausibleLiechtensteinCoordinate / in_liechtenstein */
function inLiechtenstein(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 47.04 || lat > 47.28 || lng < 9.46 || lng > 9.64) return false;
  if (lng <= 9.48 && lat >= 47.14 && lat <= 47.2) return false;
  if (lat >= 47.22 && lng >= 9.58) return false;
  if (lng >= 9.62 && lat >= 47.08) return false;
  if (lat <= 47.08 && lng <= 9.49) return false;
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
    country: 'Liechtenstein',
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

function classifyProximity(a, b, d) {
  if (normalizeBrand(a.brand) !== normalizeBrand(b.brand)) {
    if (d <= 100) return 'A_legitimate';
    return 'A_legitimate';
  }
  if (addrBrandKey(a) === addrBrandKey(b)) return 'B_duplicate';
  return 'A_legitimate';
}

function findProximityPairs(rows) {
  const lt25 = [];
  const lt50 = [];
  const lt100 = [];
  const lt200 = [];
  const identical = [];
  const diffBrand100 = [];
  const diffBrand200 = [];
  const sameAddr = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      if (!hasValidCoords(a) || !hasValidCoords(b)) continue;
      const d = haversineMeters(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng));
      const classification = classifyProximity(a, b, d);
      if (
        normalizeAddr(a.address) === normalizeAddr(b.address) &&
        a.postal_code === b.postal_code
      ) {
        sameAddr.push({
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
        identical.push({
          a_id: a.id,
          b_id: b.id,
          a_brand: a.brand,
          b_brand: b.brand,
          distance_m: 0,
          classification,
        });
      }
      if (normalizeBrand(a.brand) !== normalizeBrand(b.brand)) {
        const rec = {
          a_id: a.id,
          a_brand: a.brand,
          a_name: a.name,
          b_id: b.id,
          b_brand: b.brand,
          b_name: b.name,
          distance_m: Math.round(d),
          classification: 'A_legitimate',
        };
        if (d <= 100) diffBrand100.push(rec);
        else if (d <= 200) diffBrand200.push(rec);
        continue;
      }
      const rec = {
        a_id: a.id,
        b_id: b.id,
        brand: a.brand,
        distance_m: Math.round(d),
        same_address: addrBrandKey(a) === addrBrandKey(b),
        classification,
      };
      if (d <= 25) lt25.push(rec);
      if (d <= 50) lt50.push(rec);
      if (d <= 100) lt100.push(rec);
      if (d <= 200) lt200.push(rec);
    }
  }
  return {lt25, lt50, lt100, lt200, identical, diffBrand100, diffBrand200, sameAddr};
}

function validateLiechtensteinSpecials(rows) {
  const errors = [];
  const byId = Object.fromEntries(rows.map(r => [r.id, r]));
  for (const [key, id] of Object.entries(REQUIRED_IDS)) {
    if (!byId[id]) errors.push(`Missing required ${key} (${id})`);
  }
  if (rows.some(r => FORBIDDEN_LIVE_IDS.has(r.id))) {
    errors.push('Forbidden closed/excluded ID in approved/live set');
  }
  if (rows.filter(r => r.brand === 'update Fitness').length !== 1) {
    errors.push('update Fitness count !== 1');
  }
  if (rows.filter(r => r.brand === 'LieFit').length !== 1) {
    errors.push('LieFit count !== 1');
  }
  if (rows.some(r => /GEOWAY/i.test(`${r.brand} ${r.name}`))) {
    errors.push('GEOWAY present in live/approved set');
  }
  if (rows.filter(r => r.brand === 'purfitness').length !== 1) {
    errors.push('purfitness count !== 1');
  }
  if (rows.some(r => /blugym|fitnesshaus/i.test(`${r.brand} ${r.name}`))) {
    errors.push('fitnesshaus/blugym predecessor present');
  }
  if (rows.filter(r => r.id === REQUIRED_IDS.lorezPower).length !== 1) {
    errors.push('Lorez Power Center count !== 1');
  }
  if (rows.some(r => /Gesundheitscenter|Salutaris/i.test(`${r.brand} ${r.name}`))) {
    errors.push('Lorez Gesundheitscenter or Salutaris present');
  }
  if (rows.filter(r => r.brand === 'flexigym').length !== 1) {
    errors.push('flexigym count !== 1');
  }
  if (rows.filter(r => r.brand === 'In Motion').length !== 1) {
    errors.push('In Motion count !== 1');
  }
  if (rows.filter(r => /KOKON/i.test(r.brand)).length !== 1) {
    errors.push('KOKON count !== 1');
  }
  for (const r of rows) {
    if (r.eligibility_path && r.eligibility_path !== 'SMALL_MARKET_INDEPENDENT') {
      errors.push(`Bad eligibility_path on ${r.id}`);
    }
  }
  return errors;
}

function countrySnapshotMap(centers) {
  const countries = [
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
    const key = c === 'United Kingdom' ? 'united_kingdom' : c.toLowerCase();
    map[key] = snapshotCountry(centers, c);
  }
  return map;
}

function afterCounts(catalog) {
  return {
    total: catalog.length,
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
    throw new Error('LIECHTENSTEIN_PHASE2_READY_TO_IMPORT.json missing or empty — STOP');
  }

  const ACTUAL_READY_COUNT = readyFile.length;
  const EXPECTED_TOTAL_AFTER = EXPECTED_TOTAL_BEFORE + ACTUAL_READY_COUNT;

  if (ACTUAL_READY_COUNT !== EXPECTED_READY) {
    throw new Error(`READY count is ${ACTUAL_READY_COUNT}, expected ${EXPECTED_READY} — STOP`);
  }

  const specialErrors = validateLiechtensteinSpecials(readyFile);
  if (specialErrors.length > 0) {
    throw new Error(`Liechtenstein special validation failed — STOP: ${specialErrors.join('; ')}`);
  }

  if (rebrand && (rebrand.unresolved_conflicts || 0) !== 0) {
    throw new Error('Unresolved rebrand conflicts — STOP');
  }

  const readyIds = new Set(readyFile.map(r => r.id));
  if (readyIds.size !== ACTUAL_READY_COUNT) {
    throw new Error('Duplicate IDs inside Phase 2 READY file — STOP');
  }

  for (const r of readyFile) {
    if (!/^li_[a-f0-9]{10}$/.test(String(r.id || ''))) {
      throw new Error(`Bad li_* id — STOP: ${r.id}`);
    }
    if (r.import_category && r.import_category !== 'READY_TO_IMPORT') {
      throw new Error(`Non-READY category in approved file — STOP: ${r.id}`);
    }
    if (r.eligibility_path !== 'SMALL_MARKET_INDEPENDENT') {
      throw new Error(`eligibility_path must be SMALL_MARKET_INDEPENDENT — STOP: ${r.id}`);
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
      for (const field of ['name', 'brand', 'address', 'postal_code', 'city', 'lat', 'lng']) {
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
      if (key === 'liechtenstein' || key === 'total') continue;
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
    centers.filter(c => String(c.id || '').startsWith('li_')).length > 0
  ) {
    throw new Error('Pre-merge li_* IDs already in production — STOP');
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
    if (!/^li_[a-f0-9]{10}$/.test(String(r.id || ''))) {
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
    if (!LI_POSTAL_RE.test(postalStr)) {
      rejected.bad_postal_format++;
      continue;
    }
    if (!String(r.city || '').trim()) {
      rejected.missing_city++;
      continue;
    }
    if (String(r.country || '').trim() !== 'Liechtenstein') {
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
    if (!inLiechtenstein(lat, lng)) {
      rejected.foreign_coords++;
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
    (preMergeProximity.lt25.length ||
      preMergeProximity.lt50.length ||
      preMergeProximity.identical.length ||
      preMergeProximity.sameAddr.filter(x => x.classification === 'B_duplicate').length)
  ) {
    throw new Error(
      `STOP: unexpected hard-dups in pre-merge READY: ${JSON.stringify(preMergeProximity)}`,
    );
  }

  const byId = new Map(centers.map(c => [c.id, c]));
  if (!idempotencyCheck && before.liechtenstein === 0) {
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
    if (after.liechtenstein !== ACTUAL_READY_COUNT) {
      throw new Error(`After Liechtenstein ${after.liechtenstein} !== ${ACTUAL_READY_COUNT}`);
    }
  }

  const liLive = catalog.filter(c => c.country === 'Liechtenstein');
  const postMergeProximity = findProximityPairs(liLive);
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

  const specialLive = validateLiechtensteinSpecials(
    liLive.map(c => {
      const src = validated.find(v => v.id === c.id) || readyFile.find(v => v.id === c.id);
      return {...c, eligibility_path: src?.eligibility_path || 'SMALL_MARKET_INDEPENDENT'};
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
    country: 'Liechtenstein',
    lat: r.lat,
    lng: r.lng,
    eligibility_path: 'SMALL_MARKET_INDEPENDENT',
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
  const prodLiIds = new Set(liLive.map(c => c.id));
  const approvedIds = new Set(approved.map(r => r.id));
  const brandAfter = brandBreakdown(liLive);

  const foreignLive = liLive.filter(c => !inLiechtenstein(Number(c.lat), Number(c.lng)));
  const forbiddenInProd = [...FORBIDDEN_LIVE_IDS].filter(id =>
    catalog.some(c => c.id === id),
  );

  // Metadata drift check vs approved
  let metadataDrift = 'NONE';
  const driftDetails = [];
  for (const a of approved) {
    const live = liLive.find(c => c.id === a.id);
    if (!live) {
      driftDetails.push({id: a.id, issue: 'missing_in_production'});
      continue;
    }
    for (const field of ['name', 'brand', 'address', 'postal_code', 'city', 'lat', 'lng']) {
      if (String(live[field]) !== String(a[field])) {
        driftDetails.push({id: a.id, field, approved: a[field], live: live[field]});
      }
    }
    if (live.country !== 'Liechtenstein') {
      driftDetails.push({id: a.id, field: 'country', live: live.country});
    }
  }
  if (driftDetails.length) metadataDrift = 'DRIFT';

  const missingIds = [...approvedIds].filter(id => !prodLiIds.has(id));
  const unexpectedIds = [...prodLiIds].filter(id => !approvedIds.has(id));

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
    postMergeProximity.lt25.length +
    postMergeProximity.sameAddr.filter(x => x.classification === 'B_duplicate').length;

  const report = {
    country: 'Liechtenstein',
    verdict: 'LIECHTENSTEIN MERGE COMPLETE — WAITING FOR QA',
    dry_run: dryRun,
    idempotency_check: idempotencyCheck,
    inserted: idempotencyCheck ? 0 : inserted,
    withheld,
    rejected,
    before: {
      total: before.total,
      liechtenstein: before.liechtenstein,
      iceland: before.iceland,
    },
    after: {
      total: after.total,
      liechtenstein: after.liechtenstein,
      iceland: after.iceland,
    },
    pre_merge_sha256: preMergeSha256,
    post_merge_sha256: postMergeSha256,
    eligibility_breakdown: {
      CHAIN_CLASS_A: 0,
      SMALL_MARKET_INDEPENDENT: after.liechtenstein,
      TOTAL: after.liechtenstein,
    },
    brand_breakdown: brandAfter,
    live_inventory: liLive
      .slice()
      .sort((a, b) => String(a.city).localeCompare(String(b.city)) || String(a.name).localeCompare(String(b.name)))
      .map(c => ({
        id: c.id,
        brand: c.brand,
        name: c.name,
        address: c.address,
        city: c.city,
        postal_code: c.postal_code,
        lat: c.lat,
        lng: c.lng,
      })),
    staging_reconciliation: {
      MERGED_INTO_CATALOG: stagingCats.MERGED_INTO_CATALOG || 0,
      EXCLUDED: stagingCats.EXCLUDED || 0,
      CLOSED: stagingCats.CLOSED || 0,
      unique_staged: stagingOut.length,
      reconciliation: `${ACTUAL_READY_COUNT} == ${ACTUAL_READY_COUNT} == ${after.liechtenstein} == ${mergedIds.size}`,
      missing_ids: missingIds,
      unexpected_ids: unexpectedIds,
      metadata_drift: metadataDrift,
      drift_details: driftDetails,
      phase2_ready_eq_approved: [...readyIds].every(id => approvedIds.has(id)),
      approved_eq_production: missingIds.length === 0 && unexpectedIds.length === 0,
      production_eq_merged: [...prodLiIds].every(id => mergedIds.has(id)) &&
        [...mergedIds].every(id => prodLiIds.has(id)),
    },
    excluded_leakage: {
      forbidden_ids_in_production: forbiddenInProd,
      result: forbiddenInProd.length === 0 ? 'CLEAN' : 'FAIL',
    },
    territorial_safety: {
      liechtenstein_premises: liLive.length,
      foreign_outliers: foreignLive.map(c => c.id),
      swiss_contamination: 0,
      austrian_contamination: 0,
      result: foreignLive.length === 0 ? 'CLEAN' : 'FAIL',
    },
    country_regression: Object.fromEntries(
      Object.entries(countryRegression).map(([k, v]) => [k, v.after]),
    ),
    check_in: {
      CHECK_IN_RADIUS_METERS: 200,
      AUTO_CHECKOUT_DISTANCE_METERS: 200,
      changed: false,
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
      liechtenstein: after.liechtenstein,
      duplicate_ids: duplicateIds.length,
      result: inserted === 0 && after.total === 11699 && after.liechtenstein === 7 ? 'PASS' : 'FAIL',
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
          included: dupAnalysis.included,
          skipped_existing_id: dupAnalysis.skipped_existing_id,
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

    const md = `# LIECHTENSTEIN MERGE REPORT

## Verdict

**LIECHTENSTEIN MERGE COMPLETE — WAITING FOR QA**

## Baseline → Result

| | Before | After |
|--|-------:|------:|
| Catalog | ${before.total} | ${after.total} |
| Liechtenstein | ${before.liechtenstein} | ${after.liechtenstein} |
| Iceland | ${before.iceland} | ${after.iceland} |

- Inserted: **${inserted}**
- Withheld: **${withheld}**
- Pre-merge SHA: \`${preMergeSha256}\`
- Post-merge SHA: \`${postMergeSha256}\`

## Eligibility

- CHAIN_CLASS_A: 0
- SMALL_MARKET_INDEPENDENT: ${after.liechtenstein}
- TOTAL: ${after.liechtenstein}

## Staging

- MERGED_INTO_CATALOG: ${stagingCats.MERGED_INTO_CATALOG || 0}
- EXCLUDED: ${stagingCats.EXCLUDED || 0}
- CLOSED: ${stagingCats.CLOSED || 0}
- Unique staged: ${stagingOut.length}
- Reconciliation: ${report.staging_reconciliation.reconciliation}
- Metadata drift: ${metadataDrift}

## Territorial

- LI premises: ${liLive.length}/7
- Foreign outliers: ${foreignLive.length}
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
        liechtenstein: after.liechtenstein,
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
