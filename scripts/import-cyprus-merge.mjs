/**
 * Cyprus production-safe merge (Phase 2 canonical READY — small-market independents).
 *
 * Source: data/cyprus/CYPRUS_PHASE2_READY_TO_IMPORT.json
 *
 * Usage:
 *   node scripts/import-cyprus-merge.mjs --dry-run
 *   node scripts/import-cyprus-merge.mjs
 *   node scripts/import-cyprus-merge.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const stagingPath = path.join(root, 'data/cyprus/cyprus_centers_staging.json');
const readyPath = path.join(root, 'data/cyprus/CYPRUS_PHASE2_READY_TO_IMPORT.json');
const phase2ReportPath = path.join(root, 'data/cyprus/CYPRUS_PHASE2_READINESS_REPORT.json');
const territorialPath = path.join(root, 'data/cyprus/CYPRUS_TERRITORIAL_SAFETY.json');
const reportDir = path.join(root, 'data/cyprus');
const reportPath = path.join(reportDir, 'CYPRUS_MERGE_REPORT.json');
const mdReportPath = path.join(reportDir, 'CYPRUS_MERGE_REPORT.md');
const dupAnalysisPath = path.join(reportDir, 'CYPRUS_MERGE_DUPLICATE_ANALYSIS.json');
const approvedPath = path.join(reportDir, 'CYPRUS_APPROVED_FOR_MERGE.json');
const idempotencyPath = path.join(reportDir, 'CYPRUS_MERGE_IDEMPOTENCY.json');

const dryRun = process.argv.includes('--dry-run');
const idempotencyCheck = process.argv.includes('--idempotency-check');

const EXPECTED_TOTAL_BEFORE = 11648;
const EXPECTED_READY = 17;
const EXPECTED_SHA_BEFORE =
  'e039707d7c419d727b5297acf26b17bc1f885217ca997d3b75f21ff54f60a7f4';
const CY_POSTAL_RE = /^\d{4}$/;
const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE =
  /fallback|invented|centroid|city.?center|postcode.?centroid|capital.?fallback|town.?centroid/i;
const FOREIGN_NORTH_RE =
  /\b(kyrenia|girne|morphou|g[uü]zelyurt|northern cyprus|trnc|gazima[gğ]usa|lefko[sş]a|karavas|lapta|iskele)\b/i;

const SANCTUM_NAMES = /sanctum/i;
const FITNESS_ONE = /fitness one/i;
const NEEDS_COORD_NAMES =
  /anaplasis|arise active|kondylis|barbarian|gymland/i;

const BASELINE = {
  total: EXPECTED_TOTAL_BEFORE,
  cyprus: 0,
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

/** Mirrors isPlausibleCyprusCoordinate / in_cyprus */
function inCyprus(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 34.55 || lat > 35.22 || lng < 32.25 || lng > 34.65) return false;
  if (lat >= 35.19 && lng <= 33.55) return false;
  if (lat >= 35.08 && lng >= 33.85 && lng <= 34.15) return false;
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
    country: 'Cyprus',
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

function findProximityPairs(rows) {
  const lt25 = [];
  const lt50 = [];
  const lt100 = [];
  const lt200 = [];
  const identical = [];
  const diffBrand = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      if (!hasValidCoords(a) || !hasValidCoords(b)) continue;
      const d = haversineMeters(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng));
      if (d === 0) {
        identical.push({
          a_id: a.id,
          b_id: b.id,
          a_brand: a.brand,
          b_brand: b.brand,
          distance_m: 0,
          classification: 'F_unresolved',
        });
      }
      if (normalizeBrand(a.brand) !== normalizeBrand(b.brand)) {
        if (d <= 100) {
          diffBrand.push({
            a_id: a.id,
            a_brand: a.brand,
            a_name: a.name,
            b_id: b.id,
            b_brand: b.brand,
            b_name: b.name,
            distance_m: Math.round(d),
            classification: 'A_legitimate',
          });
        }
        continue;
      }
      const rec = {
        a_id: a.id,
        b_id: b.id,
        brand: a.brand,
        distance_m: Math.round(d),
        same_address: addrBrandKey(a) === addrBrandKey(b),
        classification: 'A_legitimate',
      };
      if (d <= 25) lt25.push(rec);
      if (d <= 50) lt50.push(rec);
      if (d <= 100) lt100.push(rec);
      if (d <= 200) lt200.push(rec);
    }
  }
  return {lt25, lt50, lt100, lt200, identical, diffBrand};
}

function validateCyprusSpecials(rows) {
  const errors = [];
  const ff = rows.filter(r => /fitness factory/i.test(r.brand));
  if (ff.length !== 1) errors.push(`Fitness Factory count ${ff.length} !== 1`);
  if (ff[0] && !/engomi|pindou/i.test(`${ff[0].name} ${ff[0].address} ${ff[0].city}`)) {
    errors.push('Fitness Factory not Engomi/Pindou');
  }
  const curves = rows.filter(r => r.brand === 'Curves');
  if (curves.length !== 2) errors.push(`Curves count ${curves.length} !== 2`);
  const alter = rows.filter(r => /alterlife/i.test(r.brand));
  if (alter.length !== 1) errors.push(`ALTERLIFE count ${alter.length} !== 1`);
  if (rows.some(r => SANCTUM_NAMES.test(r.brand) || SANCTUM_NAMES.test(r.name))) {
    errors.push('Sanctum leaked');
  }
  if (rows.some(r => FITNESS_ONE.test(r.brand) || FITNESS_ONE.test(r.name))) {
    errors.push('Fitness One leaked');
  }
  if (rows.some(r => NEEDS_COORD_NAMES.test(`${r.brand} ${r.name}`))) {
    errors.push('NEEDS_COORDINATES candidate leaked');
  }
  if (rows.some(r => String(r.id || '').startsWith('gr_'))) {
    errors.push('gr_* Greece ID leaked into Cyprus set');
  }
  if (rows.some(r => r.eligibility_path && r.eligibility_path !== 'SMALL_MARKET_INDEPENDENT')) {
    errors.push('Non-independent eligibility_path in approved set');
  }
  return errors;
}

function countrySnapshotMap(centers) {
  return {
    malta: snapshotCountry(centers, 'Malta'),
    luxembourg: snapshotCountry(centers, 'Luxembourg'),
    estonia: snapshotCountry(centers, 'Estonia'),
    latvia: snapshotCountry(centers, 'Latvia'),
    lithuania: snapshotCountry(centers, 'Lithuania'),
    denmark: snapshotCountry(centers, 'Denmark'),
    sweden: snapshotCountry(centers, 'Sweden'),
    norway: snapshotCountry(centers, 'Norway'),
    finland: snapshotCountry(centers, 'Finland'),
    germany: snapshotCountry(centers, 'Germany'),
    united_kingdom: snapshotCountry(centers, 'United Kingdom'),
    netherlands: snapshotCountry(centers, 'Netherlands'),
    france: snapshotCountry(centers, 'France'),
    spain: snapshotCountry(centers, 'Spain'),
    italy: snapshotCountry(centers, 'Italy'),
    belgium: snapshotCountry(centers, 'Belgium'),
    poland: snapshotCountry(centers, 'Poland'),
    austria: snapshotCountry(centers, 'Austria'),
    switzerland: snapshotCountry(centers, 'Switzerland'),
    portugal: snapshotCountry(centers, 'Portugal'),
    greece: snapshotCountry(centers, 'Greece'),
    ireland: snapshotCountry(centers, 'Ireland'),
    czechia: snapshotCountry(centers, 'Czechia'),
    hungary: snapshotCountry(centers, 'Hungary'),
    romania: snapshotCountry(centers, 'Romania'),
    slovakia: snapshotCountry(centers, 'Slovakia'),
    bulgaria: snapshotCountry(centers, 'Bulgaria'),
    croatia: snapshotCountry(centers, 'Croatia'),
    slovenia: snapshotCountry(centers, 'Slovenia'),
  };
}

function afterCounts(catalog) {
  return {
    total: catalog.length,
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
  const territorial = fs.existsSync(territorialPath)
    ? JSON.parse(fs.readFileSync(territorialPath, 'utf8'))
    : null;
  const stagingById = new Map(staging.map(r => [r.id, r]));

  if (!Array.isArray(readyFile) || readyFile.length === 0) {
    throw new Error('CYPRUS_PHASE2_READY_TO_IMPORT.json missing or empty — STOP');
  }

  const ACTUAL_READY_COUNT = readyFile.length;
  const EXPECTED_TOTAL_AFTER = EXPECTED_TOTAL_BEFORE + ACTUAL_READY_COUNT;

  if (ACTUAL_READY_COUNT !== EXPECTED_READY) {
    throw new Error(`READY count is ${ACTUAL_READY_COUNT}, expected ${EXPECTED_READY} — STOP`);
  }

  if (
    !readyFile.every(r => r.eligibility_path === 'SMALL_MARKET_INDEPENDENT')
  ) {
    throw new Error('All READY must have eligibility_path=SMALL_MARKET_INDEPENDENT — STOP');
  }

  const specialErrors = validateCyprusSpecials(readyFile);
  if (specialErrors.length > 0) {
    throw new Error(`Cyprus special validation failed — STOP: ${specialErrors.join('; ')}`);
  }

  const readyIds = new Set(readyFile.map(r => r.id));
  if (readyIds.size !== ACTUAL_READY_COUNT) {
    throw new Error('Duplicate IDs inside Phase 2 READY file — STOP');
  }

  for (const r of readyFile) {
    if (!/^cy_[a-f0-9]{10}$/.test(String(r.id || ''))) {
      throw new Error(`Bad cy_* id — STOP: ${r.id}`);
    }
    if (r.import_category && r.import_category !== 'READY_TO_IMPORT') {
      throw new Error(`Non-READY category in approved file — STOP: ${r.id}`);
    }
    if (String(r.postal_code || '').startsWith('99')) {
      throw new Error(`TRNC-style postcode — STOP: ${r.id}`);
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

  if (
    territorial &&
    (territorial.ready_foreign_outliers || 0) !== 0 &&
    !idempotencyCheck
  ) {
    throw new Error('Territorial safety READY outliers != 0 — STOP');
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
      if (key === 'cyprus' || key === 'total') continue;
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

  if (!idempotencyCheck && centers.filter(c => String(c.id || '').startsWith('cy_')).length > 0) {
    throw new Error('Pre-merge cy_* IDs already in production — STOP');
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
    foreign_text: 0,
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
    if (!/^cy_[a-f0-9]{10}$/.test(String(r.id || ''))) {
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
    if (!CY_POSTAL_RE.test(postalStr) || postalStr.startsWith('99')) {
      rejected.bad_postal_format++;
      continue;
    }
    if (!String(r.city || '').trim()) {
      rejected.missing_city++;
      continue;
    }
    if (String(r.country || '').trim() !== 'Cyprus') {
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
    if (!inCyprus(lat, lng)) {
      rejected.foreign_coords++;
      continue;
    }
    const blob = `${r.name} ${r.address} ${r.city} ${r.brand}`;
    if (MOJIBAKE_RE.test(blob)) {
      rejected.mojibake++;
      continue;
    }
    if (FOREIGN_NORTH_RE.test(blob)) {
      rejected.foreign_text++;
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
      preMergeProximity.identical.length)
  ) {
    throw new Error(
      `STOP: unexpected same-brand hard-dups in pre-merge READY: ${JSON.stringify(preMergeProximity)}`,
    );
  }

  const byId = new Map(centers.map(c => [c.id, c]));
  if (!idempotencyCheck && before.cyprus === 0) {
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
    if (after.cyprus !== ACTUAL_READY_COUNT) {
      throw new Error(`After Cyprus ${after.cyprus} !== ${ACTUAL_READY_COUNT}`);
    }
  }

  const cyLive = catalog.filter(c => c.country === 'Cyprus');
  const postMergeProximity = findProximityPairs(cyLive);
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

  const specialLive = validateCyprusSpecials(
    cyLive.map(c => {
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
    country: 'Cyprus',
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
  const prodCyIds = new Set(cyLive.map(c => c.id));
  const approvedIds = new Set(approved.map(r => r.id));
  const brandAfter = brandBreakdown(cyLive);

  const northernLive = cyLive.filter(
    c =>
      !inCyprus(Number(c.lat), Number(c.lng)) ||
      FOREIGN_NORTH_RE.test(`${c.name} ${c.address} ${c.city}`),
  );

  const report = {
    country: 'Cyprus',
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    idempotency_check: idempotencyCheck,
    before,
    after,
    inserted: idempotencyCheck ? 0 : inserted,
    withheld: idempotencyCheck ? 0 : ACTUAL_READY_COUNT - inserted,
    pre_merge_sha256: preMergeSha256,
    post_merge_sha256: null,
    brand_breakdown: brandAfter,
    eligibility_breakdown: {
      CHAIN_CLASS_A: 0,
      SMALL_MARKET_INDEPENDENT: cyLive.length,
      TOTAL: cyLive.length,
    },
    rejected,
    country_regression: countryRegression,
    sanctum: {
      marina: cyLive.filter(r => /sanctum/i.test(r.name) && /marina/i.test(r.name)).length,
      icon: cyLive.filter(r => /sanctum/i.test(r.name) && /icon/i.test(r.name)).length,
      sunset: cyLive.filter(r => /sanctum/i.test(r.name) && /sunset/i.test(r.name)).length,
      total: cyLive.filter(r => /sanctum/i.test(r.name) || /sanctum/i.test(r.brand || '')).length,
      result: 'PASS',
    },
    fitness_factory: {
      count: brandAfter['Fitness Factory'] || 0,
      engomi_only: (brandAfter['Fitness Factory'] || 0) === 1,
      result: 'PASS',
    },
    fitness_one: {
      count: cyLive.filter(r => /fitness one/i.test(r.brand || '') || /fitness one/i.test(r.name))
        .length,
      result: 'PASS',
    },
    curves: {
      count: brandAfter['Curves'] || 0,
      result: 'PASS',
    },
    alterlife: {
      count: brandAfter['ALTERLIFE'] || 0,
      greece_gr_ids: catalog.filter(
        c => String(c.id || '').startsWith('gr_') && /alterlife/i.test(c.brand || ''),
      ).length,
      result: 'PASS',
    },
    needs_coordinates_exclusion: {
      staging_needs_coordinates: stagingCats.NEEDS_COORDINATES || 0,
      production_from_needs_coord: cyLive.filter(r =>
        NEEDS_COORD_NAMES.test(`${r.brand} ${r.name}`),
      ).length,
      result: 'PASS',
    },
    closed_excluded: {
      closed_staging: stagingCats.CLOSED || 0,
      excluded_staging: stagingCats.EXCLUDED || 0,
      production_from_closed_excluded_ids: staging
        .filter(r => ['CLOSED', 'EXCLUDED'].includes(r.import_category))
        .filter(r => prodCyIds.has(r.id)).length,
      result: 'PASS',
    },
    staging_reconciliation: {
      MERGED_INTO_CATALOG: stagingCats.MERGED_INTO_CATALOG || 0,
      NEEDS_COORDINATES: stagingCats.NEEDS_COORDINATES || 0,
      NEEDS_REVIEW: stagingCats.NEEDS_REVIEW || 0,
      COMING_SOON: stagingCats.COMING_SOON || 0,
      CLOSED: stagingCats.CLOSED || 0,
      EXCLUDED: stagingCats.EXCLUDED || 0,
      unique_staged: stagingOut.length,
      missing_production_ids: [...prodCyIds].filter(id => !mergedIds.has(id)),
      unexpected_production_ids: [...mergedIds].filter(id => !prodCyIds.has(id)),
      approved_ids_match: [...prodCyIds].every(id => approvedIds.has(id)),
      phase2_ready_ids_match: [...prodCyIds].every(id => readyIds.has(id)),
      metadata_drift:
        [...prodCyIds].filter(id => !mergedIds.has(id)).length ||
        [...mergedIds].filter(id => !prodCyIds.has(id)).length
          ? 'DRIFT'
          : 'NONE',
      reconciliation: `${prodCyIds.size} == ${approvedIds.size} == ${readyIds.size} == ${mergedIds.size}`,
    },
    post_merge: {
      duplicate_ids: duplicateIds.length,
      same_brand_lte_25m: postMergeProximity.lt25.length,
      same_brand_lte_50m: postMergeProximity.lt50.length,
      same_brand_lte_100m: postMergeProximity.lt100.length,
      same_brand_lte_200m: postMergeProximity.lt200.length,
      identical_coordinate_clusters: postMergeProximity.identical.length,
      different_brand_colocations: postMergeProximity.diffBrand.length,
      different_brand_details: postMergeProximity.diffBrand,
    },
    territorial_safety: {
      republic_controlled: cyLive.filter(c => inCyprus(Number(c.lat), Number(c.lng))).length,
      northern_cyprus: northernLive.length,
      foreign: cyLive.filter(c => !inCyprus(Number(c.lat), Number(c.lng))).length,
      result: northernLive.length === 0 && cyLive.every(c => inCyprus(Number(c.lat), Number(c.lng)))
        ? 'CLEAN'
        : 'FAIL',
    },
    check_in: {
      CHECK_IN_RADIUS_METERS: 200,
      AUTO_CHECKOUT_DISTANCE_METERS: 200,
      changed: false,
    },
    performance: null,
    global_scale: {
      previous_production: EXPECTED_TOTAL_BEFORE,
      new_production: after.total,
      crossed_12500: after.total >= 12500,
      global_stress_qa_required_now: false,
    },
    inventory: cyLive.map(c => ({
      id: c.id,
      brand: c.brand,
      name: c.name,
      city: c.city,
      postal_code: c.postal_code,
    })),
    verdict: 'CYPRUS MERGE COMPLETE — WAITING FOR QA',
  };

  if (dryRun) {
    console.log(JSON.stringify({dry_run: true, would_insert: inserted, after}, null, 2));
    return;
  }

  if (idempotencyCheck) {
    if (inserted !== 0) throw new Error(`Idempotency failed: inserted ${inserted}`);
    if (centers.length !== EXPECTED_TOTAL_AFTER) {
      throw new Error(`Idempotency catalog ${centers.length} !== ${EXPECTED_TOTAL_AFTER}`);
    }
    if (before.cyprus !== EXPECTED_READY) {
      throw new Error(`Idempotency CY ${before.cyprus} !== ${EXPECTED_READY}`);
    }
    const idem = {
      second_run_insertions: 0,
      final_catalog: centers.length,
      cyprus: before.cyprus,
      result: 'PASS',
      sha256: preMergeSha256,
    };
    fs.writeFileSync(idempotencyPath, JSON.stringify(idem, null, 2) + '\n');
    console.log(JSON.stringify(idem, null, 2));
    return;
  }

  fs.writeFileSync(centersPath, JSON.stringify(catalog, null, 2) + '\n');
  fs.writeFileSync(stagingPath, JSON.stringify(stagingOut, null, 2) + '\n');
  fs.writeFileSync(approvedPath, JSON.stringify(approved, null, 2) + '\n');

  const postSha = sha256File(centersPath);
  report.post_merge_sha256 = postSha;
  report.performance = {
    catalog: after.total,
    active: catalog.filter(c => c.is_active !== false).length,
    json_size_bytes: fs.statSync(centersPath).size,
    json_size_mb: +(fs.statSync(centersPath).size / (1024 * 1024)).toFixed(2),
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(
    dupAnalysisPath,
    JSON.stringify(
      {
        ...dupAnalysis,
        post_merge_proximity: postMergeProximity,
        duplicate_ids: duplicateIds,
        unexplained_hard_duplicates: 0,
      },
      null,
      2,
    ) + '\n',
  );

  const md = `# CYPRUS MERGE REPORT

## Verdict

**${report.verdict}**

## Counts

- Before: ${before.total}
- Inserted: ${inserted}
- Withheld: ${report.withheld}
- After: ${after.total}
- Cyprus: ${after.cyprus}

## Eligibility

- CHAIN_CLASS_A: 0
- SMALL_MARKET_INDEPENDENT: ${after.cyprus}
- TOTAL: ${after.cyprus}

## Brands

${Object.entries(brandAfter)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join('\n')}

## Gates

- Sanctum live: ${report.sanctum.total}
- Fitness Factory: ${report.fitness_factory.count}
- Fitness One: ${report.fitness_one.count}
- Curves: ${report.curves.count}
- ALTERLIFE: ${report.alterlife.count}
- Territorial: ${report.territorial_safety.result}

## SHA

- Pre: \`${preMergeSha256}\`
- Post: \`${postSha}\`

## Staging

- MERGED: ${report.staging_reconciliation.MERGED_INTO_CATALOG}
- NEEDS_COORDINATES: ${report.staging_reconciliation.NEEDS_COORDINATES}
- CLOSED: ${report.staging_reconciliation.CLOSED}
- EXCLUDED: ${report.staging_reconciliation.EXCLUDED}
- Drift: ${report.staging_reconciliation.metadata_drift}
- Reconciliation: ${report.staging_reconciliation.reconciliation}
`;
  fs.writeFileSync(mdReportPath, md);

  console.log(
    JSON.stringify(
      {
        inserted,
        withheld: report.withheld,
        after_total: after.total,
        cyprus: after.cyprus,
        brands: brandAfter,
        post_sha: postSha,
        staging: report.staging_reconciliation,
        territorial: report.territorial_safety,
        verdict: report.verdict,
      },
      null,
      2,
    ),
  );
}

main();
