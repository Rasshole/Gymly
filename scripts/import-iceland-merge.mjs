/**
 * Iceland production-safe merge (Phase 1 canonical READY — Class A chains).
 *
 * Source: data/iceland/ICELAND_PHASE1_READY_TO_IMPORT.json
 *
 * Usage:
 *   node scripts/import-iceland-merge.mjs --dry-run
 *   node scripts/import-iceland-merge.mjs
 *   node scripts/import-iceland-merge.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const stagingPath = path.join(root, 'data/iceland/iceland_centers_staging.json');
const readyPath = path.join(root, 'data/iceland/ICELAND_PHASE1_READY_TO_IMPORT.json');
const phase1ReportPath = path.join(root, 'data/iceland/ICELAND_PHASE1_READINESS_REPORT.json');
const rebrandPath = path.join(root, 'data/iceland/ICELAND_PHASE1_REBRAND_MAP.json');
const reportDir = path.join(root, 'data/iceland');
const reportPath = path.join(reportDir, 'ICELAND_MERGE_REPORT.json');
const mdReportPath = path.join(reportDir, 'ICELAND_MERGE_REPORT.md');
const dupAnalysisPath = path.join(reportDir, 'ICELAND_MERGE_DUPLICATE_ANALYSIS.json');
const approvedPath = path.join(reportDir, 'ICELAND_APPROVED_FOR_MERGE.json');
const idempotencyPath = path.join(reportDir, 'ICELAND_MERGE_IDEMPOTENCY.json');

const dryRun = process.argv.includes('--dry-run');
const idempotencyCheck = process.argv.includes('--idempotency-check');

const EXPECTED_TOTAL_BEFORE = 11665;
const EXPECTED_READY = 27;
const EXPECTED_WC = 20;
const EXPECTED_KATLA = 7;
const EXPECTED_SHA_BEFORE =
  'caf838b1ce733fd20fb724306429bcc48ddee49d684a8efbe70c0cd9b1e46944';
const IS_POSTAL_RE = /^[1-9]\d{2}$/;
const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE =
  /fallback|invented|centroid|city.?center|postcode.?centroid|capital.?fallback|town.?centroid/i;

/** Closed/excluded staging IDs — must never enter production */
const FORBIDDEN_LIVE_IDS = new Set([
  'is_f1532c5942', // World Class Bjarg (legacy)
  'is_4679839ae8', // Reebok Fitness Lambhagi (legacy)
  'is_e3bcd63150', // Katla Studio
  'is_7752534bf6', // Hreyfing
  'is_2c4d4ba569', // Sporthúsið Kópavogur
  'is_aa2da9071f', // Sporthúsið Reykjanesbær
  'is_bf7a13f651', // Bjarg líkamsrækt
]);

const REQUIRED_IDENTITIES = {
  vatnsmyri: 'is_b39588e5e0',
  kringlan: 'is_7511719617',
  gamlaKringlan: 'is_48dceefaa5',
  wcTjarnarvellir: 'is_271c199e79',
  katlaTjarnarvellir: 'is_3c1b16259b',
  katlaHoltagardar: 'is_bece47bcec',
  katlaLambhagi: 'is_df6449ee85',
};

const BASELINE = {
  total: EXPECTED_TOTAL_BEFORE,
  iceland: 0,
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

function inIceland(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 63.0 || lat > 66.65 || lng < -25.0 || lng > -12.4) return false;
  if (lat >= 66.0 && lng <= -18.5) return false;
  if (lat >= 61.0 && lat <= 62.5 && lng >= -8.5 && lng <= -6.0) return false;
  if (lat < 66.0 && lng >= -8.0) return false;
  if (lat < 62.5 && lng >= -12.5) return false;
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
    country: 'Iceland',
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
    const aName = `${a.name} ${a.address}`.toLowerCase();
    const bName = `${b.name} ${b.address}`.toLowerCase();
    if (
      (a.id === REQUIRED_IDENTITIES.wcTjarnarvellir &&
        b.id === REQUIRED_IDENTITIES.katlaTjarnarvellir) ||
      (b.id === REQUIRED_IDENTITIES.wcTjarnarvellir &&
        a.id === REQUIRED_IDENTITIES.katlaTjarnarvellir)
    ) {
      return 'D_same_address_different_units';
    }
    if (d <= 100) return 'C_sports_complex_colocation';
    return 'B_distinct_brands_nearby';
  }
  if (addrBrandKey(a) === addrBrandKey(b)) return 'F_unresolved_duplicate';
  if (
    (a.id === REQUIRED_IDENTITIES.kringlan && b.id === REQUIRED_IDENTITIES.gamlaKringlan) ||
    (b.id === REQUIRED_IDENTITIES.kringlan && a.id === REQUIRED_IDENTITIES.gamlaKringlan)
  ) {
    return 'B_distinct_current_clubs';
  }
  return 'C_review_not_duplicate';
}

function findProximityPairs(rows) {
  const lt25 = [];
  const lt50 = [];
  const lt100 = [];
  const lt200 = [];
  const identical = [];
  const diffBrand = [];
  const sameAddr = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      if (!hasValidCoords(a) || !hasValidCoords(b)) continue;
      const d = haversineMeters(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng));
      const classification = classifyProximity(a, b, d);
      if (normalizeAddr(a.address) === normalizeAddr(b.address) && a.postal_code === b.postal_code) {
        sameAddr.push({
          a_id: a.id,
          b_id: b.id,
          a_brand: a.brand,
          b_brand: b.brand,
          classification,
        });
      }
      if (Math.abs(Number(a.lat) - Number(b.lat)) < 1e-7 && Math.abs(Number(a.lng) - Number(b.lng)) < 1e-7) {
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
        if (d <= 100) {
          diffBrand.push({
            a_id: a.id,
            a_brand: a.brand,
            a_name: a.name,
            b_id: b.id,
            b_brand: b.brand,
            b_name: b.name,
            distance_m: Math.round(d),
            classification,
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
        classification,
      };
      if (d <= 25) lt25.push(rec);
      if (d <= 50) lt50.push(rec);
      if (d <= 100) lt100.push(rec);
      if (d <= 200) lt200.push(rec);
    }
  }
  return {lt25, lt50, lt100, lt200, identical, diffBrand, sameAddr};
}

function validateIcelandSpecials(rows) {
  const errors = [];
  const wc = rows.filter(r => r.brand === 'World Class');
  const katla = rows.filter(r => r.brand === 'Katla Fitness');
  if (wc.length !== EXPECTED_WC) errors.push(`World Class count ${wc.length} !== ${EXPECTED_WC}`);
  if (katla.length !== EXPECTED_KATLA) errors.push(`Katla count ${katla.length} !== ${EXPECTED_KATLA}`);
  if (rows.some(r => FORBIDDEN_LIVE_IDS.has(r.id))) errors.push('Forbidden closed/excluded ID in approved set');
  if (!rows.some(r => r.id === REQUIRED_IDENTITIES.vatnsmyri)) errors.push('Missing Vatnsmýri successor');
  if (rows.some(r => r.id === 'is_f1532c5942')) errors.push('Legacy Bjarg in approved set');
  if (rows.some(r => r.id === 'is_4679839ae8')) errors.push('Reebok predecessor in approved set');
  if (!rows.some(r => r.id === REQUIRED_IDENTITIES.kringlan)) errors.push('Missing Kringlan 4-7');
  if (!rows.some(r => r.id === REQUIRED_IDENTITIES.gamlaKringlan)) errors.push('Missing Gamla Kringlan');
  if (!rows.some(r => r.id === REQUIRED_IDENTITIES.wcTjarnarvellir)) errors.push('Missing WC Tjarnarvellir');
  if (!rows.some(r => r.id === REQUIRED_IDENTITIES.katlaTjarnarvellir)) errors.push('Missing Katla Tjarnarvellir');
  const holtag = rows.find(r => r.id === REQUIRED_IDENTITIES.katlaHoltagardar);
  if (!holtag) errors.push('Missing Katla Holtagarðar');
  else if (!/holtagar/i.test(holtag.address)) errors.push('Holtagarðar official address not retained');
  const unexpectedBrands = new Set(rows.map(r => r.brand)).difference
    ? null
    : [...new Set(rows.map(r => r.brand))].filter(b => b !== 'World Class' && b !== 'Katla Fitness');
  if (unexpectedBrands?.length) errors.push(`Unexpected brands: ${unexpectedBrands.join(', ')}`);
  return errors;
}

function countrySnapshotMap(centers) {
  const countries = [
    'Malta', 'Luxembourg', 'Estonia', 'Latvia', 'Lithuania', 'Denmark', 'Sweden', 'Norway',
    'Finland', 'Germany', 'United Kingdom', 'Netherlands', 'France', 'Spain', 'Italy', 'Belgium',
    'Poland', 'Austria', 'Switzerland', 'Portugal', 'Greece', 'Ireland', 'Czechia', 'Hungary',
    'Romania', 'Slovakia', 'Bulgaria', 'Croatia', 'Slovenia', 'Cyprus',
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
  const phase1Report = fs.existsSync(phase1ReportPath)
    ? JSON.parse(fs.readFileSync(phase1ReportPath, 'utf8'))
    : null;
  const rebrand = fs.existsSync(rebrandPath)
    ? JSON.parse(fs.readFileSync(rebrandPath, 'utf8'))
    : null;
  const stagingById = new Map(staging.map(r => [r.id, r]));

  if (!Array.isArray(readyFile) || readyFile.length === 0) {
    throw new Error('ICELAND_PHASE1_READY_TO_IMPORT.json missing or empty — STOP');
  }

  const ACTUAL_READY_COUNT = readyFile.length;
  const EXPECTED_TOTAL_AFTER = EXPECTED_TOTAL_BEFORE + ACTUAL_READY_COUNT;

  if (ACTUAL_READY_COUNT !== EXPECTED_READY) {
    throw new Error(`READY count is ${ACTUAL_READY_COUNT}, expected ${EXPECTED_READY} — STOP`);
  }

  const brandReady = brandBreakdown(readyFile);
  if (brandReady['World Class'] !== EXPECTED_WC || brandReady['Katla Fitness'] !== EXPECTED_KATLA) {
    throw new Error(
      `Brand breakdown WC=${brandReady['World Class']} Katla=${brandReady['Katla Fitness']} — STOP`,
    );
  }

  const specialErrors = validateIcelandSpecials(readyFile);
  if (specialErrors.length > 0) {
    throw new Error(`Iceland special validation failed — STOP: ${specialErrors.join('; ')}`);
  }

  if (rebrand && (rebrand.unresolved || []).length > 0) {
    throw new Error('Unresolved rebrand conflicts — STOP');
  }

  const readyIds = new Set(readyFile.map(r => r.id));
  if (readyIds.size !== ACTUAL_READY_COUNT) {
    throw new Error('Duplicate IDs inside Phase 1 READY file — STOP');
  }

  for (const r of readyFile) {
    if (!/^is_[a-f0-9]{10}$/.test(String(r.id || ''))) {
      throw new Error(`Bad is_* id — STOP: ${r.id}`);
    }
    if (r.import_category && r.import_category !== 'READY_TO_IMPORT') {
      throw new Error(`Non-READY category in approved file — STOP: ${r.id}`);
    }
  }

  for (const ex of staging.filter(r =>
    ['EXCLUDED', 'CLOSED', 'NEEDS_COORDINATES', 'NEEDS_REVIEW', 'COMING_SOON', 'DUPLICATE', 'LEGACY'].includes(
      r.import_category,
    ),
  )) {
    if (readyIds.has(ex.id)) throw new Error(`${ex.import_category} ${ex.id} in READY — STOP`);
  }

  if (
    phase1Report &&
    phase1Report.ready_count != null &&
    phase1Report.ready_count !== ACTUAL_READY_COUNT
  ) {
    throw new Error(
      `Phase1 report ready_count=${phase1Report.ready_count}, file=${ACTUAL_READY_COUNT} — STOP`,
    );
  }

  const sourceRows = idempotencyCheck
    ? staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG')
    : staging.filter(r => r.import_category === 'READY_TO_IMPORT');

  if (!idempotencyCheck && sourceRows.length !== ACTUAL_READY_COUNT) {
    throw new Error(
      `Staging READY count ${sourceRows.length} !== Phase1 READY ${ACTUAL_READY_COUNT} — STOP`,
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
      if (key === 'iceland' || key === 'total') continue;
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

  if (!idempotencyCheck && centers.filter(c => String(c.id || '').startsWith('is_')).length > 0) {
    throw new Error('Pre-merge is_* IDs already in production — STOP');
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
    forbidden_id: 0,
  };

  const candidates = idempotencyCheck ? sourceRows : readyFile;
  const seenBatchIds = new Set();
  const validated = [];

  for (const r of candidates) {
    if (!/^is_[a-f0-9]{10}$/.test(String(r.id || ''))) {
      rejected.missing_id_prefix++;
      continue;
    }
    if (FORBIDDEN_LIVE_IDS.has(r.id)) {
      rejected.forbidden_id++;
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
    if (!String(r.address || '').trim() || String(r.address).trim().length < 3) {
      rejected.missing_address++;
      continue;
    }
    const postalStr = String(r.postal_code || '').trim();
    if (!IS_POSTAL_RE.test(postalStr)) {
      rejected.bad_postal_format++;
      continue;
    }
    if (!String(r.city || '').trim()) {
      rejected.missing_city++;
      continue;
    }
    if (String(r.country || '').trim() !== 'Iceland') {
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
    if (!inIceland(lat, lng)) {
      rejected.foreign_coords++;
      continue;
    }
    const blob = `${r.name} ${r.address} ${r.city} ${r.brand}`;
    if (MOJIBAKE_RE.test(blob)) {
      rejected.mojibake++;
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
  const hardDup = [
    ...preMergeProximity.identical.filter(x => x.classification === 'F_unresolved_duplicate'),
    ...preMergeProximity.lt25.filter(x => x.classification === 'F_unresolved_duplicate'),
  ];
  if (!idempotencyCheck && hardDup.length) {
    throw new Error(`STOP: hard duplicate in pre-merge READY: ${JSON.stringify(hardDup)}`);
  }

  const byId = new Map(centers.map(c => [c.id, c]));
  if (!idempotencyCheck && before.iceland === 0) {
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
    if (after.iceland !== ACTUAL_READY_COUNT) {
      throw new Error(`After Iceland ${after.iceland} !== ${ACTUAL_READY_COUNT}`);
    }
  }

  const isLive = catalog.filter(c => c.country === 'Iceland');
  const postMergeProximity = findProximityPairs(isLive);
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

  const specialLive = validateIcelandSpecials(isLive);
  if (!idempotencyCheck && specialLive.length) {
    throw new Error(`Post-merge special validation failed: ${specialLive.join('; ')}`);
  }

  const forbiddenInProd = isLive.filter(c => FORBIDDEN_LIVE_IDS.has(c.id));
  if (!idempotencyCheck && forbiddenInProd.length) {
    throw new Error(`Forbidden IDs in production: ${forbiddenInProd.map(c => c.id).join(', ')}`);
  }

  const approved = validated.map(r => ({
    id: r.id,
    brand: r.brand,
    name: r.name,
    address: r.address,
    postal_code: r.postal_code,
    city: r.city,
    country: 'Iceland',
    lat: r.lat,
    lng: r.lng,
    operator_class: 'A',
    source_url: r.source_url || null,
    coord_source: r.coord_source || null,
    approved_at: new Date().toISOString(),
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
  const prodIsIds = new Set(isLive.map(c => c.id));
  const approvedIds = new Set(approved.map(r => r.id));
  const brandAfter = brandBreakdown(isLive);

  const foreignLive = isLive.filter(c => !inIceland(Number(c.lat), Number(c.lng)));

  const report = {
    country: 'Iceland',
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
    rebrand_validation: {
      vatnsmyri_successor: isLive.some(c => c.id === REQUIRED_IDENTITIES.vatnsmyri),
      legacy_bjarg_absent: !isLive.some(c => c.id === 'is_f1532c5942'),
      reebok_predecessor_absent: !isLive.some(c => c.id === 'is_4679839ae8'),
      kringlan_distinct: isLive.some(c => c.id === REQUIRED_IDENTITIES.kringlan),
      gamla_kringlan_distinct: isLive.some(c => c.id === REQUIRED_IDENTITIES.gamlaKringlan),
      tjarnarvellir_coexistence:
        isLive.some(c => c.id === REQUIRED_IDENTITIES.wcTjarnarvellir) &&
        isLive.some(c => c.id === REQUIRED_IDENTITIES.katlaTjarnarvellir),
      holtagardar_address: isLive.find(c => c.id === REQUIRED_IDENTITIES.katlaHoltagardar)?.address,
      result: 'PASS',
    },
    excluded_leakage: {
      forbidden_ids_in_production: forbiddenInProd.map(c => c.id),
      staging_closed_excluded_in_production: staging
        .filter(r => ['CLOSED', 'EXCLUDED'].includes(r.import_category))
        .filter(r => prodIsIds.has(r.id)).length,
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
      reconciliation: `${prodIsIds.size} == ${approvedIds.size} == ${readyIds.size} == ${mergedIds.size}`,
      metadata_drift:
        [...prodIsIds].filter(id => !mergedIds.has(id)).length ||
        [...mergedIds].filter(id => !prodIsIds.has(id)).length
          ? 'DRIFT'
          : 'NONE',
    },
    post_merge: {
      duplicate_ids: duplicateIds.length,
      same_brand_lte_25m: postMergeProximity.lt25.length,
      same_brand_lte_50m: postMergeProximity.lt50.length,
      same_brand_lte_100m: postMergeProximity.lt100.length,
      same_brand_lte_200m: postMergeProximity.lt200.length,
      identical_coordinate_clusters: postMergeProximity.identical.length,
      different_brand_colocations: postMergeProximity.diffBrand.length,
      normalized_same_addresses: postMergeProximity.sameAddr.length,
    },
    territorial_safety: {
      iceland_plausible: isLive.filter(c => inIceland(Number(c.lat), Number(c.lng))).length,
      foreign: foreignLive.length,
      result: foreignLive.length === 0 ? 'CLEAN' : 'FAIL',
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
    inventory: isLive.map(c => ({
      id: c.id,
      brand: c.brand,
      name: c.name,
      city: c.city,
      postal_code: c.postal_code,
    })),
    verdict: 'ICELAND MERGE COMPLETE — WAITING FOR QA',
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
    if (before.iceland !== EXPECTED_READY) {
      throw new Error(`Idempotency IS ${before.iceland} !== ${EXPECTED_READY}`);
    }
    const idem = {
      second_run_insertions: 0,
      final_catalog: centers.length,
      iceland: before.iceland,
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
    json_parse_ms: (() => {
      const t0 = performance.now();
      JSON.parse(fs.readFileSync(centersPath, 'utf8'));
      return +(performance.now() - t0).toFixed(2);
    })(),
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

  const md = `# ICELAND MERGE REPORT

## Verdict

**${report.verdict}**

## Counts

- Before: ${before.total}
- Inserted: ${inserted}
- Withheld: ${report.withheld}
- After: ${after.total}
- Iceland: ${after.iceland}

## Brands

- World Class: ${brandAfter['World Class'] || 0}
- Katla Fitness: ${brandAfter['Katla Fitness'] || 0}

## SHA

- Pre: \`${preMergeSha256}\`
- Post: \`${postSha}\`

## Staging

- MERGED: ${report.staging_reconciliation.MERGED_INTO_CATALOG}
- CLOSED: ${report.staging_reconciliation.CLOSED}
- EXCLUDED: ${report.staging_reconciliation.EXCLUDED}
- Reconciliation: ${report.staging_reconciliation.reconciliation}

## Territorial

${report.territorial_safety.result}
`;
  fs.writeFileSync(mdReportPath, md);

  console.log(
    JSON.stringify(
      {
        inserted,
        after_total: after.total,
        iceland: after.iceland,
        brands: brandAfter,
        pre_sha: preMergeSha256,
        post_sha: postSha,
        verdict: report.verdict,
      },
      null,
      2,
    ),
  );
}

main();
