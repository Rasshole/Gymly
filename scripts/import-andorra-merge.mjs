/**
 * Andorra production-safe merge (Phase 2 canonical READY — small-market independents).
 *
 * Source: data/andorra/ANDORRA_PHASE2_READY_TO_IMPORT.json
 *
 * Usage:
 *   node scripts/import-andorra-merge.mjs --dry-run
 *   node scripts/import-andorra-merge.mjs
 *   node scripts/import-andorra-merge.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const stagingPath = path.join(root, 'data/andorra/andorra_centers_staging.json');
const readyPath = path.join(root, 'data/andorra/ANDORRA_PHASE2_READY_TO_IMPORT.json');
const phase2ReportPath = path.join(
  root,
  'data/andorra/ANDORRA_PHASE2_READINESS_REPORT.json',
);
const rebrandPath = path.join(root, 'data/andorra/ANDORRA_PHASE2_REBRAND_MAP.json');
const reportDir = path.join(root, 'data/andorra');
const reportPath = path.join(reportDir, 'ANDORRA_MERGE_REPORT.json');
const mdReportPath = path.join(reportDir, 'ANDORRA_MERGE_REPORT.md');
const dupAnalysisPath = path.join(reportDir, 'ANDORRA_MERGE_DUPLICATE_ANALYSIS.json');
const approvedPath = path.join(reportDir, 'ANDORRA_APPROVED_FOR_MERGE.json');
const idempotencyPath = path.join(reportDir, 'ANDORRA_MERGE_IDEMPOTENCY.json');

const dryRun = process.argv.includes('--dry-run');
const idempotencyCheck = process.argv.includes('--idempotency-check');

const EXPECTED_TOTAL_BEFORE = 11699;
const EXPECTED_READY = 12;
const EXPECTED_SHA_BEFORE =
  'b4f155e2501d10af07eded1ca1342f06784f5f122f4e51bb081ebf943cdb0bbc';
const AD_POSTAL_RE = /^AD[1-7]00$/i;
const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE =
  /fallback|invented|centroid|city.?center|postcode.?centroid|capital.?fallback|town.?centroid/i;

const REQUIRED_IDS = {
  anyospark: 'ad_8989e7b07f',
  urbanAlv: 'ad_488e241114',
  palauDeGel: 'ad_1fb5491cda',
  duplex: 'ad_6fc179f949',
  next: 'ad_2594f0bd4f',
  princiesport: 'ad_be0d30a1f0',
  serradells: 'ad_2759cd904a',
  escaldes: 'ad_cfb6dcda5e',
  ceoOrdino: 'ad_918cf36646',
  encamp: 'ad_8e838a1d13',
  pasDeLaCasa: 'ad_886040e59f',
  lauesport: 'ad_ae9200b719',
};

const FORBIDDEN_LIVE_IDS = new Set([
  'ad_9447826d36', // Urban Gym Arinsal — EXCLUDED_SEASONAL
]);

const EXPECTED_BRANDS = {
  AnyósPark: 1,
  'Urban Gym': 1,
  'Palau de Gel': 1,
  'Duplex Sport Club': 1,
  'NEXT Sports Club': 1,
  Princiesport: 1,
  Serradells: 1,
  'Centre Esportiu Escaldes-Engordany': 1,
  'CEO Ordino': 1,
  'Complex Esportiu Encamp': 1,
  'Centre Esportiu Pas de la Casa': 1,
  LAUesport: 1,
};

const BASELINE = {
  total: EXPECTED_TOTAL_BEFORE,
  andorra: 0,
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

/** Mirrors isPlausibleAndorraCoordinate */
function inAndorra(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 42.43 || lat > 42.66 || lng < 1.41 || lng > 1.79) return false;
  if (lat <= 42.45 && lng <= 1.5) return false;
  if (lng >= 1.76 && lat >= 42.55) return false;
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
    country: 'Andorra',
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

function validateAndorraSpecials(rows) {
  const errors = [];
  const byId = Object.fromEntries(rows.map(r => [r.id, r]));
  for (const [key, id] of Object.entries(REQUIRED_IDS)) {
    if (!byId[id]) errors.push(`Missing required ${key} (${id})`);
  }
  if (rows.some(r => FORBIDDEN_LIVE_IDS.has(r.id))) {
    errors.push('Forbidden seasonal/excluded ID in approved/live set');
  }
  if (rows.some(r => /Arinsal/i.test(`${r.brand} ${r.name}`))) {
    errors.push('Urban Gym Arinsal present in live/approved set');
  }
  if (rows.some(r => /Caldea/i.test(`${r.brand} ${r.name}`))) {
    errors.push('Club Caldea present in live/approved set');
  }
  if (rows.some(r => /Casa Wellness/i.test(`${r.brand} ${r.name}`))) {
    errors.push('Casa Wellness present in live/approved set');
  }
  if (rows.some(r => /CrossFit|Primatesag/i.test(`${r.brand} ${r.name}`))) {
    errors.push('CrossFit/Primatesag present in live/approved set');
  }
  // Canillo identity: Palau de Gel only — no Urban Gym Canillo
  const canillo = byId[REQUIRED_IDS.palauDeGel];
  if (!canillo || canillo.brand !== 'Palau de Gel') {
    errors.push('Canillo must be Palau de Gel brand');
  }
  if (rows.some(r => /Urban Gym/i.test(r.brand) && /Canillo/i.test(r.name))) {
    errors.push('Urban Gym Canillo alias present — must be Palau de Gel only');
  }
  if (rows.filter(r => r.brand === 'Urban Gym').length !== 1) {
    errors.push('Urban Gym count !== 1');
  }
  if (rows.filter(r => r.brand === 'AnyósPark').length !== 1) {
    errors.push('AnyósPark count !== 1');
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
    if (!String(r.parish || '').trim() && r.parish !== undefined) {
      // parish required on READY/approved; production rows omit parish
    }
  }
  return errors;
}

function countrySnapshotMap(centers) {
  const countries = [
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
    const key = c === 'United Kingdom' ? 'united_kingdom' : c.toLowerCase();
    map[key] = snapshotCountry(centers, c);
  }
  return map;
}

function afterCounts(catalog) {
  return {
    total: catalog.length,
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
    throw new Error('ANDORRA_PHASE2_READY_TO_IMPORT.json missing or empty — STOP');
  }

  const ACTUAL_READY_COUNT = readyFile.length;
  const EXPECTED_TOTAL_AFTER = EXPECTED_TOTAL_BEFORE + ACTUAL_READY_COUNT;

  if (ACTUAL_READY_COUNT !== EXPECTED_READY) {
    throw new Error(`READY count is ${ACTUAL_READY_COUNT}, expected ${EXPECTED_READY} — STOP`);
  }

  const specialErrors = validateAndorraSpecials(readyFile);
  if (specialErrors.length > 0) {
    throw new Error(`Andorra special validation failed — STOP: ${specialErrors.join('; ')}`);
  }

  if (rebrand && (rebrand.unresolved_conflicts || 0) !== 0) {
    throw new Error('Unresolved rebrand conflicts — STOP');
  }

  const readyIds = new Set(readyFile.map(r => r.id));
  if (readyIds.size !== ACTUAL_READY_COUNT) {
    throw new Error('Duplicate IDs inside Phase 2 READY file — STOP');
  }

  for (const r of readyFile) {
    if (!/^ad_[a-f0-9]{10}$/.test(String(r.id || ''))) {
      throw new Error(`Bad ad_* id — STOP: ${r.id}`);
    }
    if (r.import_category && r.import_category !== 'READY_TO_IMPORT') {
      throw new Error(`Non-READY category in approved file — STOP: ${r.id}`);
    }
    if (r.eligibility_path !== 'SMALL_MARKET_INDEPENDENT') {
      throw new Error(`eligibility_path must be SMALL_MARKET_INDEPENDENT — STOP: ${r.id}`);
    }
    if (!String(r.parish || '').trim()) {
      throw new Error(`Missing parish — STOP: ${r.id}`);
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

  // Explicit Arinsal gate
  const arinsal = stagingById.get('ad_9447826d36');
  if (!arinsal || arinsal.import_category !== 'EXCLUDED') {
    throw new Error('Arinsal ad_9447826d36 must remain EXCLUDED — STOP');
  }
  if (readyIds.has('ad_9447826d36')) {
    throw new Error('Arinsal in READY set — STOP');
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
        'parish',
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
      if (key === 'andorra' || key === 'total') continue;
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
    centers.filter(c => String(c.id || '').startsWith('ad_')).length > 0
  ) {
    throw new Error('Pre-merge ad_* IDs already in production — STOP');
  }

  const countrySnapshots = countrySnapshotMap(centers);

  const rejected = {
    missing_id_prefix: 0,
    missing_name: 0,
    missing_brand: 0,
    missing_address: 0,
    bad_postal_format: 0,
    missing_city: 0,
    missing_parish: 0,
    wrong_country: 0,
    invalid_coords: 0,
    foreign_coords: 0,
    spanish_outlier: 0,
    french_outlier: 0,
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
    if (!/^ad_[a-f0-9]{10}$/.test(String(r.id || ''))) {
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
    const postalStr = String(r.postal_code || '').trim().toUpperCase();
    if (!AD_POSTAL_RE.test(postalStr)) {
      rejected.bad_postal_format++;
      continue;
    }
    if (!String(r.city || '').trim()) {
      rejected.missing_city++;
      continue;
    }
    if (!idempotencyCheck && !String(r.parish || '').trim()) {
      rejected.missing_parish++;
      continue;
    }
    if (String(r.country || '').trim() !== 'Andorra') {
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
    if (!inAndorra(lat, lng)) {
      // Classify Spain vs France for reporting
      if (lat <= 42.45 || (lat < 42.5 && lng < 1.48)) rejected.spanish_outlier++;
      else if (lng >= 1.76 || lat > 42.58) rejected.french_outlier++;
      else rejected.foreign_coords++;
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
  // Same-brand hard dups only — different-brand dense proximity is expected in Andorra
  if (
    !idempotencyCheck &&
    (preMergeProximity.lt25.filter(x => x.classification === 'B_duplicate').length ||
      preMergeProximity.identical.length ||
      preMergeProximity.sameAddr.filter(x => x.classification === 'B_duplicate').length)
  ) {
    throw new Error(
      `STOP: unexpected hard-dups in pre-merge READY: ${JSON.stringify(preMergeProximity)}`,
    );
  }

  const byId = new Map(centers.map(c => [c.id, c]));
  if (!idempotencyCheck && before.andorra === 0) {
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
    if (after.andorra !== ACTUAL_READY_COUNT) {
      throw new Error(`After Andorra ${after.andorra} !== ${ACTUAL_READY_COUNT}`);
    }
  }

  const adLive = catalog.filter(c => c.country === 'Andorra');
  const postMergeProximity = findProximityPairs(adLive);
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

  const specialLive = validateAndorraSpecials(
    adLive.map(c => {
      const src = validated.find(v => v.id === c.id) || readyFile.find(v => v.id === c.id);
      return {
        ...c,
        eligibility_path: src?.eligibility_path || 'SMALL_MARKET_INDEPENDENT',
        parish: src?.parish,
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
    parish: r.parish || null,
    country: 'Andorra',
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
  const prodAdIds = new Set(adLive.map(c => c.id));
  const approvedIds = new Set(approved.map(r => r.id));
  const brandAfter = brandBreakdown(adLive);

  const foreignLive = adLive.filter(c => !inAndorra(Number(c.lat), Number(c.lng)));
  const spanishLive = foreignLive.filter(c => Number(c.lat) <= 42.45 || Number(c.lng) < 1.48);
  const frenchLive = foreignLive.filter(c => Number(c.lng) >= 1.76 || Number(c.lat) > 42.58);
  const forbiddenInProd = [...FORBIDDEN_LIVE_IDS].filter(id =>
    catalog.some(c => c.id === id),
  );

  // Metadata drift check vs approved
  let metadataDrift = 'NONE';
  const driftDetails = [];
  for (const a of approved) {
    const live = adLive.find(c => c.id === a.id);
    if (!live) {
      driftDetails.push({id: a.id, issue: 'missing_in_production'});
      continue;
    }
    for (const field of ['name', 'brand', 'address', 'postal_code', 'city', 'lat', 'lng']) {
      if (String(live[field]) !== String(a[field])) {
        driftDetails.push({id: a.id, field, approved: a[field], live: live[field]});
      }
    }
    if (live.country !== 'Andorra') {
      driftDetails.push({id: a.id, field: 'country', live: live.country});
    }
  }
  if (driftDetails.length) metadataDrift = 'DRIFT';

  const missingIds = [...approvedIds].filter(id => !prodAdIds.has(id));
  const unexpectedIds = [...prodAdIds].filter(id => !approvedIds.has(id));

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
    postMergeProximity.lt25.filter(x => x.classification === 'B_duplicate').length +
    postMergeProximity.sameAddr.filter(x => x.classification === 'B_duplicate').length;

  // Parish coverage from approved (production has city only)
  const parishSet = new Set(approved.map(a => a.parish).filter(Boolean));
  const expectedParishes = [
    'Andorra la Vella',
    'Canillo',
    'Encamp',
    'Escaldes-Engordany',
    'La Massana',
    'Ordino',
    'Sant Julià de Lòria',
  ];

  // Performance snapshot
  const centersBytes = fs.statSync(centersPath).size;
  const t0 = process.hrtime.bigint();
  JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const t1 = process.hrtime.bigint();
  const parseMs = Number(t1 - t0) / 1e6;

  const report = {
    country: 'Andorra',
    verdict: 'ANDORRA MERGE COMPLETE — WAITING FOR QA',
    dry_run: dryRun,
    idempotency_check: idempotencyCheck,
    inserted: idempotencyCheck ? 0 : inserted,
    withheld,
    rejected,
    before: {
      total: before.total,
      andorra: before.andorra,
      liechtenstein: before.liechtenstein,
      iceland: before.iceland,
    },
    after: {
      total: after.total,
      andorra: after.andorra,
      liechtenstein: after.liechtenstein,
      iceland: after.iceland,
    },
    pre_merge_sha256: preMergeSha256,
    post_merge_sha256: postMergeSha256,
    eligibility_breakdown: {
      CHAIN_CLASS_A: 0,
      SMALL_MARKET_INDEPENDENT: after.andorra,
      TOTAL: after.andorra,
    },
    brand_breakdown: brandAfter,
    live_inventory: adLive
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
          parish: src?.parish || null,
          postal_code: c.postal_code,
          lat: c.lat,
          lng: c.lng,
          eligibility_path: 'SMALL_MARKET_INDEPENDENT',
        };
      }),
    staging_reconciliation: {
      MERGED_INTO_CATALOG: stagingCats.MERGED_INTO_CATALOG || 0,
      EXCLUDED: stagingCats.EXCLUDED || 0,
      CLOSED: stagingCats.CLOSED || 0,
      NEEDS_REVIEW: stagingCats.NEEDS_REVIEW || 0,
      unique_staged: stagingOut.length,
      reconciliation: `${ACTUAL_READY_COUNT} == ${ACTUAL_READY_COUNT} == ${after.andorra} == ${mergedIds.size}`,
      missing_ids: missingIds,
      unexpected_ids: unexpectedIds,
      metadata_drift: metadataDrift,
      drift_details: driftDetails,
      phase2_ready_eq_approved: [...readyIds].every(id => approvedIds.has(id)),
      approved_eq_production: missingIds.length === 0 && unexpectedIds.length === 0,
      production_eq_merged:
        [...prodAdIds].every(id => mergedIds.has(id)) &&
        [...mergedIds].every(id => prodAdIds.has(id)),
    },
    excluded_leakage: {
      forbidden_ids_in_production: forbiddenInProd,
      arinsal_excluded: true,
      caldea_excluded: !catalog.some(c => /Caldea/i.test(`${c.brand} ${c.name}`)),
      result: forbiddenInProd.length === 0 ? 'CLEAN' : 'FAIL',
    },
    territorial_safety: {
      andorra_premises: adLive.length,
      spain: spanishLive.length,
      france: frenchLive.length,
      foreign_outliers: foreignLive.map(c => c.id),
      pas_de_la_casa_in_andorra: Boolean(
        adLive.find(c => c.id === REQUIRED_IDS.pasDeLaCasa && inAndorra(c.lat, c.lng)),
      ),
      result: foreignLive.length === 0 ? 'CLEAN' : 'FAIL',
    },
    parish_coverage: Object.fromEntries(
      expectedParishes.map(p => [p, parishSet.has(p) ? 'READY_present' : 'MISSING']),
    ),
    rebrand_validation: {
      canillo_identity: 'Palau de Gel',
      urban_arinsal: 'EXCLUDED_SEASONAL',
      caldea: 'EXCLUDED',
      urban_anyospark_class_a: false,
      unresolved_conflicts: rebrand?.unresolved_conflicts ?? 0,
      result: 'PASS',
    },
    country_regression: Object.fromEntries(
      Object.entries(countryRegression).map(([k, v]) => [k, v.after]),
    ),
    check_in: {
      CHECK_IN_RADIUS_METERS: 200,
      AUTO_CHECKOUT_DISTANCE_METERS: 200,
      changed: false,
    },
    performance: {
      catalog: after.total,
      active: catalog.filter(c => c.is_active !== false).length,
      json_bytes: centersBytes,
      json_size_mb: Math.round((centersBytes / (1024 * 1024)) * 100) / 100,
      parse_ms: Math.round(parseMs * 100) / 100,
      architecture: 'KEEP CLIENT-SIDE',
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
      andorra: after.andorra,
      duplicate_ids: duplicateIds.length,
      result:
        inserted === 0 && after.total === 11711 && after.andorra === 12 ? 'PASS' : 'FAIL',
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
          known_legitimate_proximity: [
            {
              pair: 'Urban Gym ↔ Duplex Sport Club',
              note: '~76 m different-brand dense ALV; distinct premises',
            },
            {
              pair: 'NEXT Sports Club ↔ Centre Esportiu Escaldes-Engordany',
              note: '~146 m different-brand; distinct premises',
            },
          ],
          included: dupAnalysis.included,
          skipped_existing_id: dupAnalysis.skipped_existing_id,
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

    const md = `# ANDORRA MERGE REPORT

## Verdict

**ANDORRA MERGE COMPLETE — WAITING FOR QA**

## Baseline → Result

| | Before | After |
|--|-------:|------:|
| Catalog | ${before.total} | ${after.total} |
| Andorra | ${before.andorra} | ${after.andorra} |
| Liechtenstein | ${before.liechtenstein} | ${after.liechtenstein} |
| Iceland | ${before.iceland} | ${after.iceland} |

- Inserted: **${inserted}**
- Withheld: **${withheld}**
- Pre-merge SHA: \`${preMergeSha256}\`
- Post-merge SHA: \`${postMergeSha256}\`

## Eligibility

- CHAIN_CLASS_A: 0
- SMALL_MARKET_INDEPENDENT: ${after.andorra}
- TOTAL: ${after.andorra}

## Staging

- MERGED_INTO_CATALOG: ${stagingCats.MERGED_INTO_CATALOG || 0}
- EXCLUDED: ${stagingCats.EXCLUDED || 0}
- Unique staged: ${stagingOut.length}
- Reconciliation: ${report.staging_reconciliation.reconciliation}
- Metadata drift: ${metadataDrift}

## Territorial

- AD premises: ${adLive.length}/12
- Spain: ${spanishLive.length}
- France: ${frenchLive.length}
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
        andorra: after.andorra,
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
