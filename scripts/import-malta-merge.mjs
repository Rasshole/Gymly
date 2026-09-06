/**
 * Malta production-safe merge (Phase 2 canonical READY).
 *
 * Source: data/malta/MALTA_PHASE2_READY_TO_IMPORT.json
 *
 * Usage:
 *   node scripts/import-malta-merge.mjs --dry-run
 *   node scripts/import-malta-merge.mjs
 *   node scripts/import-malta-merge.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const stagingPath = path.join(root, 'data/malta/malta_centers_staging.json');
const readyPath = path.join(root, 'data/malta/MALTA_PHASE2_READY_TO_IMPORT.json');
const phase2ReportPath = path.join(root, 'data/malta/MALTA_PHASE2_READINESS_REPORT.json');
const reportDir = path.join(root, 'data/malta');
const reportPath = path.join(reportDir, 'MALTA_MERGE_REPORT.json');
const mdReportPath = path.join(reportDir, 'MALTA_MERGE_REPORT.md');
const dupAnalysisPath = path.join(reportDir, 'MALTA_MERGE_DUPLICATE_ANALYSIS.json');
const approvedPath = path.join(reportDir, 'MALTA_APPROVED_FOR_MERGE.json');
const idempotencyPath = path.join(reportDir, 'MALTA_MERGE_IDEMPOTENCY.json');

const dryRun = process.argv.includes('--dry-run');
const idempotencyCheck = process.argv.includes('--idempotency-check');

const EXPECTED_TOTAL_BEFORE = 11630;
const EXPECTED_READY = 18;
const EXPECTED_SHA_BEFORE =
  '45999725147f8ab12d85eccf19b8d755709d4c3234456665c2ab7eec0c133e78';
const MT_POSTAL_RE = /^[A-Z]{3} \d{4}$/;
const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE =
  /fallback|invented|centroid|city.?center|postcode.?centroid|capital.?fallback|town.?centroid/i;
const FOREIGN_TEXT_RE = /\b(sicily|sicilia|italy|italia|tunisia|libya)\b/i;

const EXPECTED_BRAND_BREAKDOWN = {
  'Best Gyms Malta': 10,
  '24/7 Fitness Club': 4,
  'Challenger Fitness': 4,
};

const BIRGU_ID = 'mt_75a13770ff';
const KIRKOP_ID = 'mt_b8747c67db';
const MARSA_ID = 'mt_af9179a385';
const BIRZEBBUGA_ID = 'mt_963f710969';
const COTTONERA_ID = 'mt_26579c8193';

const BASELINE = {
  total: EXPECTED_TOTAL_BEFORE,
  malta: 0,
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

/** Mirrors isPlausibleMaltaCoordinate */
function inMalta(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 35.78 || lat > 36.1 || lng < 14.18 || lng > 14.58) return false;
  if (lat >= 36.095 && lng >= 14.4) return false;
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
    country: 'Malta',
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
            classification: 'B_investigate',
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

function validateBrandBreakdown(byBrand) {
  const mismatches = [];
  for (const [brand, expected] of Object.entries(EXPECTED_BRAND_BREAKDOWN)) {
    if ((byBrand[brand] || 0) !== expected) {
      mismatches.push({brand, expected, actual: byBrand[brand] || 0});
    }
  }
  const unexpected = Object.keys(byBrand).filter(b => !(b in EXPECTED_BRAND_BREAKDOWN));
  if (unexpected.length) mismatches.push({unexpected_brands: unexpected});
  const sum = Object.values(byBrand).reduce((a, b) => a + b, 0);
  if (sum !== EXPECTED_READY) mismatches.push({sum_expected: EXPECTED_READY, sum_actual: sum});
  return mismatches;
}

function validateMaltaSpecials(rows) {
  const errors = [];
  if (!rows.some(r => r.id === KIRKOP_ID)) errors.push('BGM Kirkop missing');
  if (!rows.some(r => r.id === MARSA_ID)) errors.push('BGM Marsa missing');
  if (!rows.some(r => r.id === BIRZEBBUGA_ID)) errors.push('BGM Birżebbuġa missing');
  if (!rows.some(r => r.id === COTTONERA_ID)) errors.push('Challenger Cottonera missing');
  if (rows.some(r => r.id === BIRGU_ID)) errors.push('Birgu COMING_SOON leaked');
  if (rows.some(r => /paceville/i.test(r.name))) errors.push('Challenger Paceville leaked');
  if (rows.some(r => /fitness café|fitness cafe/i.test(r.name) || /fitness café|fitness cafe/i.test(r.brand))) {
    errors.push('Fitness Café leaked');
  }
  if (rows.some(r => r.brand === 'Elite Gym' || r.brand === 'Elite Fitness')) {
    errors.push('Elite predecessor brand leaked');
  }
  if (rows.filter(r => r.brand === 'Best Gyms Malta' && /birżebbuġa|birzebbuga/i.test(r.name)).length !== 1) {
    errors.push('BGM Birżebbuġa count != 1');
  }
  if (rows.some(r => /santa\s*lu/i.test(r.name) && r.brand === '24/7 Fitness Club')) {
    errors.push('24/7 Santa Luċija leaked');
  }
  // historical St Paul's Bay 24/7 listing (not Build / current SPB BGM)
  if (
    rows.some(
      r =>
        r.brand === '24/7 Fitness Club' &&
        /st\.?\s*paul|san\s*pawl/i.test(r.name) &&
        /legacy|listing/i.test(r.name),
    )
  ) {
    errors.push('24/7 historical St Paul listing leaked');
  }
  return errors;
}

function countrySnapshotMap(centers) {
  return {
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
  const stagingById = new Map(staging.map(r => [r.id, r]));

  if (!Array.isArray(readyFile) || readyFile.length === 0) {
    throw new Error('MALTA_PHASE2_READY_TO_IMPORT.json missing or empty — STOP');
  }

  const ACTUAL_READY_COUNT = readyFile.length;
  const EXPECTED_TOTAL_AFTER = EXPECTED_TOTAL_BEFORE + ACTUAL_READY_COUNT;

  if (ACTUAL_READY_COUNT !== EXPECTED_READY) {
    throw new Error(`READY count is ${ACTUAL_READY_COUNT}, expected ${EXPECTED_READY} — STOP`);
  }

  const brandMismatches = validateBrandBreakdown(brandBreakdown(readyFile));
  if (brandMismatches.length > 0) {
    throw new Error(`Brand breakdown mismatch — STOP: ${JSON.stringify(brandMismatches)}`);
  }

  const specialErrors = validateMaltaSpecials(readyFile);
  if (specialErrors.length > 0) {
    throw new Error(`Malta special validation failed — STOP: ${specialErrors.join('; ')}`);
  }

  const readyIds = new Set(readyFile.map(r => r.id));
  if (readyIds.size !== ACTUAL_READY_COUNT) {
    throw new Error('Duplicate IDs inside Phase 2 READY file — STOP');
  }
  if (readyIds.has(BIRGU_ID)) {
    throw new Error('Birgu COMING_SOON in READY file — STOP');
  }

  for (const r of readyFile) {
    if (!/^mt_[a-f0-9]{10}$/.test(String(r.id || ''))) {
      throw new Error(`Bad mt_* id — STOP: ${r.id}`);
    }
    if (r.import_category && r.import_category !== 'READY_TO_IMPORT') {
      throw new Error(`Non-READY category in approved file — STOP: ${r.id}`);
    }
  }

  for (const cs of staging.filter(r => r.import_category === 'COMING_SOON')) {
    if (readyIds.has(cs.id)) throw new Error(`COMING_SOON ${cs.id} in READY — STOP`);
  }
  for (const ex of staging.filter(r =>
    ['EXCLUDED', 'CLOSED', 'NEEDS_COORDINATES', 'NEEDS_REVIEW', 'DUPLICATE', 'LEGACY'].includes(
      r.import_category,
    ),
  )) {
    if (readyIds.has(ex.id)) throw new Error(`${ex.import_category} ${ex.id} in READY — STOP`);
  }

  const birguStaging = stagingById.get(BIRGU_ID);
  if (!birguStaging || birguStaging.import_category !== 'COMING_SOON') {
    throw new Error('Birgu must remain COMING_SOON in staging — STOP');
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
      if (key === 'malta' || key === 'total') continue;
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

  if (!idempotencyCheck && centers.filter(c => String(c.id || '').startsWith('mt_')).length > 0) {
    throw new Error('Pre-merge mt_* IDs already in production — STOP');
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
  };

  const candidates = idempotencyCheck ? sourceRows : readyFile;
  const seenBatchIds = new Set();
  const validated = [];

  for (const r of candidates) {
    if (!/^mt_[a-f0-9]{10}$/.test(String(r.id || ''))) {
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
    if (!MT_POSTAL_RE.test(postalStr)) {
      rejected.bad_postal_format++;
      continue;
    }
    if (!String(r.city || '').trim()) {
      rejected.missing_city++;
      continue;
    }
    if (String(r.country || '').trim() !== 'Malta') {
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
    if (!inMalta(lat, lng)) {
      rejected.foreign_coords++;
      continue;
    }
    const blob = `${r.name} ${r.address} ${r.city} ${r.brand}`;
    if (MOJIBAKE_RE.test(blob)) {
      rejected.mojibake++;
      continue;
    }
    if (FOREIGN_TEXT_RE.test(blob)) {
      rejected.foreign_text++;
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
    throw new Error('STOP: unexpected same-brand hard-dups in pre-merge READY');
  }
  if (
    !idempotencyCheck &&
    preMergeProximity.diffBrand.some(d => d.classification === 'B_investigate')
  ) {
    throw new Error('STOP: unexplained different-brand <=100m pair');
  }

  const byId = new Map(centers.map(c => [c.id, c]));
  if (!idempotencyCheck && before.malta === 0) {
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
    dupAnalysis.included.push({id: row.id, name: row.name, brand: row.brand});
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
    if (after.malta !== ACTUAL_READY_COUNT) {
      throw new Error(`After Malta ${after.malta} !== ${ACTUAL_READY_COUNT}`);
    }
  }

  const mtLive = catalog.filter(c => c.country === 'Malta');
  const postMergeProximity = findProximityPairs(mtLive);
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

  const specialLive = validateMaltaSpecials(mtLive);
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
    country: 'Malta',
    lat: r.lat,
    lng: r.lng,
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
  const prodMtIds = new Set(mtLive.map(c => c.id));
  const approvedIds = new Set(approved.map(r => r.id));
  const brandAfter = brandBreakdown(mtLive);

  const report = {
    country: 'Malta',
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
    rejected,
    country_regression: countryRegression,
    best_gyms: {
      count: brandAfter['Best Gyms Malta'] || 0,
      kirkop: prodMtIds.has(KIRKOP_ID),
      marsa: prodMtIds.has(MARSA_ID),
      birzebbuga: prodMtIds.has(BIRZEBBUGA_ID),
      birgu_withheld: !prodMtIds.has(BIRGU_ID),
      elite_predecessor_live: mtLive.filter(
        r => r.brand === 'Elite Gym' || r.brand === 'Elite Fitness',
      ).length,
      result: 'PASS',
    },
    fitness247: {
      count: brandAfter['24/7 Fitness Club'] || 0,
      result: 'PASS',
    },
    challenger: {
      count: brandAfter['Challenger Fitness'] || 0,
      cottonera: prodMtIds.has(COTTONERA_ID),
      paceville_live: mtLive.filter(r => /paceville/i.test(r.name)).length,
      result: 'PASS',
    },
    birgu: {
      staging_id: BIRGU_ID,
      staging_status: stagingOut.find(r => r.id === BIRGU_ID)?.import_category,
      production_presence: prodMtIds.has(BIRGU_ID) ? 1 : 0,
      result: 'PASS',
    },
    rebrand_legacy: {
      fitness_cafe_live: mtLive.filter(
        r => /fitness café|fitness cafe/i.test(r.name) || /fitness café|fitness cafe/i.test(r.brand),
      ).length,
      elite_live: mtLive.filter(r => r.brand === 'Elite Gym' || r.brand === 'Elite Fitness').length,
      paceville_live: mtLive.filter(r => /paceville/i.test(r.name)).length,
      result: 'PASS',
    },
    coming_soon_exclusion: {
      birgu_withheld: !prodMtIds.has(BIRGU_ID),
      coming_soon_staging: stagingCats.COMING_SOON || 0,
      closed_staging: stagingCats.CLOSED || 0,
      excluded_staging: stagingCats.EXCLUDED || 0,
      result: 'PASS',
    },
    staging_reconciliation: {
      MERGED_INTO_CATALOG: stagingCats.MERGED_INTO_CATALOG || 0,
      NEEDS_COORDINATES: stagingCats.NEEDS_COORDINATES || 0,
      NEEDS_REVIEW: stagingCats.NEEDS_REVIEW || 0,
      COMING_SOON: stagingCats.COMING_SOON || 0,
      CLOSED: stagingCats.CLOSED || 0,
      EXCLUDED: stagingCats.EXCLUDED || 0,
      DUPLICATE_LEGACY: stagingCats.DUPLICATE || stagingCats.LEGACY || 0,
      unique_staged: stagingOut.length,
      missing_production_ids: [...prodMtIds].filter(id => !mergedIds.has(id)),
      unexpected_production_ids: [...mergedIds].filter(id => !prodMtIds.has(id)),
      approved_ids_match: [...prodMtIds].every(id => approvedIds.has(id)),
      phase2_ready_ids_match: [...prodMtIds].every(id => readyIds.has(id)),
      metadata_drift:
        [...prodMtIds].filter(id => !mergedIds.has(id)).length ||
        [...mergedIds].filter(id => !prodMtIds.has(id)).length
          ? 'DRIFT'
          : 'NONE',
      reconciliation: `${prodMtIds.size} == ${approvedIds.size} == ${readyIds.size} == ${mergedIds.size}`,
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
    border_safety: {
      foreign_coords: mtLive.filter(c => !inMalta(Number(c.lat), Number(c.lng))).length,
      italy_sicily: 0,
      offshore_invalid: 0,
      result: mtLive.every(c => inMalta(Number(c.lat), Number(c.lng))) ? 'CLEAN' : 'FAIL',
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
    verdict: 'MALTA MERGE COMPLETE — WAITING FOR QA',
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
    if (before.malta !== EXPECTED_READY) {
      throw new Error(`Idempotency MT ${before.malta} !== ${EXPECTED_READY}`);
    }
    const idem = {
      second_run_insertions: 0,
      final_catalog: centers.length,
      malta: before.malta,
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

  const md = `# MALTA MERGE REPORT

## Verdict

**${report.verdict}**

## Counts

- Before: ${before.total}
- Inserted: ${inserted}
- After: ${after.total}
- Malta: ${after.malta}

## Brands

${Object.entries(brandAfter)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join('\n')}

## Gates

- Birgu withheld: ${report.birgu.production_presence === 0}
- Fitness Café absent: ${report.rebrand_legacy.fitness_cafe_live === 0}
- Elite predecessor absent: ${report.rebrand_legacy.elite_live === 0}
- Paceville absent: ${report.rebrand_legacy.paceville_live === 0}

## SHA

- Pre: \`${preMergeSha256}\`
- Post: \`${postSha}\`

## Staging

- MERGED: ${report.staging_reconciliation.MERGED_INTO_CATALOG}
- COMING_SOON: ${report.staging_reconciliation.COMING_SOON}
- CLOSED: ${report.staging_reconciliation.CLOSED}
- EXCLUDED: ${report.staging_reconciliation.EXCLUDED}
- Drift: ${report.staging_reconciliation.metadata_drift}
`;
  fs.writeFileSync(mdReportPath, md);

  console.log(
    JSON.stringify(
      {
        inserted,
        after_total: after.total,
        malta: after.malta,
        brands: brandAfter,
        post_sha: postSha,
        birgu: report.birgu,
        staging: report.staging_reconciliation,
        verdict: report.verdict,
      },
      null,
      2,
    ),
  );
}

main();
