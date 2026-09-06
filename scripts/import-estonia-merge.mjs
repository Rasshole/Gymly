/**
 * Estonia production-safe merge (Phase 2 canonical READY).
 *
 * Source: data/estonia/ESTONIA_PHASE2_READY_TO_IMPORT.json
 *
 * Usage:
 *   node scripts/import-estonia-merge.mjs --dry-run
 *   node scripts/import-estonia-merge.mjs
 *   node scripts/import-estonia-merge.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const stagingPath = path.join(root, 'data/estonia/estonia_centers_staging.json');
const readyPath = path.join(root, 'data/estonia/ESTONIA_PHASE2_READY_TO_IMPORT.json');
const phase2ReportPath = path.join(root, 'data/estonia/ESTONIA_PHASE2_READINESS_REPORT.json');
const reportDir = path.join(root, 'data/estonia');
const reportPath = path.join(reportDir, 'ESTONIA_MERGE_REPORT.json');
const mdReportPath = path.join(reportDir, 'ESTONIA_MERGE_REPORT.md');
const dupAnalysisPath = path.join(reportDir, 'ESTONIA_MERGE_DUPLICATE_ANALYSIS.json');
const approvedPath = path.join(reportDir, 'ESTONIA_APPROVED_FOR_MERGE.json');
const idempotencyPath = path.join(reportDir, 'ESTONIA_MERGE_IDEMPOTENCY.json');

const dryRun = process.argv.includes('--dry-run');
const idempotencyCheck = process.argv.includes('--idempotency-check');

const EXPECTED_TOTAL_BEFORE = 11542;
const EXPECTED_READY = 68;
const EXPECTED_SHA_BEFORE =
  '287c1c54ef1023fee08d23c9a65063ffc238edbd35c59b22cea09c146833d8ea';
const EE_POSTAL_RE = /^\d{5}$/;
const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE =
  /fallback|invented|centroid|city.?center|postcode.?centroid|capital.?fallback|town.?centroid/i;
const FOREIGN_TEXT_RE =
  /\b(latvia|latvija|riga|rīga|lithuania|lietuva|vilnius|kaunas|finland|helsinki|kaliningrad|russia|россия|belarus|poland|polska)\b/i;

const EXPECTED_BRAND_BREAKDOWN = {
  MyFitness: 19,
  '24-7 Fitness': 31,
  'Gym!': 15,
  'Golden Club': 3,
};

const EXCLUDED_BRAND_RE =
  /^(people fitness|lemon gym|reval-?sport|sparta|fitlife|hc gym|audentes|ring sport|status club|terra sport|aktiiv|corsagym|idakeskus|gym\+|impuls|basic-?fit|mcfit|anytime( fitness)?|fitinn|clever fit|john reed|gold'?s gym|fitness first|world class|bodifit|shape house)$/i;

const COMING_SOON_NAME_RE =
  /\b(pirita|annelinn|mai|papiniidu|õismäe|oismäe|kompassi|viimsi|laagri|ilmatsalu|rapla)\b/i;

const PHASE2_RECOVERED_NEEDLES = [
  'Volta',
  'Narva Fama',
  'Tabasalu',
  'Keila Keskus',
  'Sepa',
  'Viljandi Kaalu',
  'Rakvere',
  'Narva',
  'Võru',
  'Jõgeva',
  'Tondi',
];

const BASELINE = {
  total: EXPECTED_TOTAL_BEFORE,
  latvia: 33,
  lithuania: 61,
  estonia: 0,
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

/** Mirrors isPlausibleEstoniaCoordinate */
function inEstonia(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 57.5 || lat > 59.75 || lng < 21.7 || lng > 28.3) return false;
  if (lat <= 57.8 && lng >= 24.0 && lng <= 26.5) return false;
  if (lat <= 57.7 && lng >= 26.8) return false;
  if (lng >= 28.0 && lat <= 59.0) return false;
  if (lat >= 59.7 && lng <= 25.5) return false;
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
    country: 'Estonia',
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
            b_id: b.id,
            b_brand: b.brand,
            distance_m: Math.round(d),
            classification: 'A_legitimate_different_brand_colocation',
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

function validateEstoniaSpecials(rows) {
  const errors = [];

  if (rows.filter(r => r.brand === 'MyFitness').length !== 19) {
    errors.push('MyFitness count != 19');
  }
  if (!rows.some(r => /volta/i.test(r.name))) errors.push('MyFitness Volta missing');
  if (!rows.some(r => /narva fama/i.test(r.name))) errors.push('MyFitness Narva Fama missing');

  if (rows.filter(r => r.brand === '24-7 Fitness').length !== 31) {
    errors.push('24-7 Fitness count != 31');
  }
  for (const needle of [
    'Tabasalu',
    'Keila Keskus',
    'Sepa',
    'Viljandi Kaalu',
    'Rakvere',
    'Võru',
    'Jõgeva',
  ]) {
    const hits = rows.filter(r => r.brand === '24-7 Fitness' && r.name.includes(needle));
    if (hits.length !== 1) errors.push(`24-7 ${needle} count ${hits.length} != 1`);
  }
  // Narva 24-7 (not MyFitness Narva Fama)
  const narva247 = rows.filter(
    r => r.brand === '24-7 Fitness' && /\bnarva\b/i.test(r.name) && !/fama/i.test(r.name),
  );
  if (narva247.length !== 1) errors.push(`24-7 Narva count ${narva247.length} != 1`);

  const gymBang = rows.filter(r => r.brand === 'Gym!');
  if (gymBang.length !== 15) errors.push(`Gym! count ${gymBang.length} !== 15`);
  if (rows.some(r => r.brand === 'Gym+')) errors.push('Gym+ contamination in Estonia READY');
  if (rows.some(r => /^Impuls$/i.test(r.brand))) errors.push('Impuls contamination');
  if (rows.some(r => /^People Fitness$/i.test(r.brand))) errors.push('People Fitness live');
  if (rows.some(r => /^Lemon Gym$/i.test(r.brand))) errors.push('Lemon Gym below-threshold leaked');

  if (rows.filter(r => r.brand === 'Golden Club').length !== 3) {
    errors.push('Golden Club count != 3');
  }
  if (!rows.some(r => /tondi/i.test(r.name) && /sõjakooli|sojakooli/i.test(r.address))) {
    // address may be Sõjakooli tn 10
    if (!rows.some(r => /tondi/i.test(r.name))) errors.push('Golden Club Tondi missing');
  }

  if (rows.some(r => String(r.id || '').startsWith('lv_'))) {
    errors.push('lv_* ID reuse in Estonia READY');
  }
  if (rows.some(r => String(r.id || '').startsWith('lt_'))) {
    errors.push('lt_* ID reuse in Estonia READY');
  }

  // COMING_SOON Gym! / 24-7 pipeline must not appear as READY open clubs without full metadata —
  // names alone can overlap (e.g. Viimsi open MyFitness); gate via staging later.

  return errors;
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
    throw new Error('ESTONIA_PHASE2_READY_TO_IMPORT.json missing or empty — STOP');
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

  const specialErrors = validateEstoniaSpecials(readyFile);
  if (specialErrors.length > 0) {
    throw new Error(`Estonia special validation failed — STOP: ${specialErrors.join('; ')}`);
  }

  const readyIds = new Set(readyFile.map(r => r.id));
  if (readyIds.size !== ACTUAL_READY_COUNT) {
    throw new Error('Duplicate IDs inside Phase 2 READY file — STOP');
  }

  for (const r of readyFile) {
    if (r.import_category && r.import_category !== 'READY_TO_IMPORT') {
      throw new Error(`Non-READY category in approved file — STOP: ${r.id} ${r.import_category}`);
    }
    if (EXCLUDED_BRAND_RE.test(String(r.brand || '').trim())) {
      throw new Error(`Excluded brand in READY — STOP: ${r.brand} ${r.name}`);
    }
  }

  const excludedCats = [
    'NEEDS_COORDINATES',
    'NEEDS_REVIEW',
    'COMING_SOON',
    'CLOSED',
    'DUPLICATE',
    'LEGACY',
    'EXCLUDED',
  ];
  for (const cs of staging.filter(r => r.import_category === 'COMING_SOON')) {
    if (readyIds.has(cs.id)) throw new Error(`COMING_SOON ${cs.id} in READY — STOP`);
  }
  for (const ex of staging.filter(r => r.import_category === 'EXCLUDED')) {
    if (readyIds.has(ex.id)) throw new Error(`EXCLUDED ${ex.id} in READY — STOP`);
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

  // Metadata match staging ↔ ready
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

  const before = {
    total: centers.length,
    estonia: countByCountry(centers, 'Estonia'),
    latvia: countByCountry(centers, 'Latvia'),
    lithuania: countByCountry(centers, 'Lithuania'),
    denmark: countByCountry(centers, 'Denmark'),
    sweden: countByCountry(centers, 'Sweden'),
    norway: countByCountry(centers, 'Norway'),
    finland: countByCountry(centers, 'Finland'),
    germany: countByCountry(centers, 'Germany'),
    united_kingdom: countByCountry(centers, 'United Kingdom'),
    netherlands: countByCountry(centers, 'Netherlands'),
    france: countByCountry(centers, 'France'),
    spain: countByCountry(centers, 'Spain'),
    italy: countByCountry(centers, 'Italy'),
    belgium: countByCountry(centers, 'Belgium'),
    poland: countByCountry(centers, 'Poland'),
    austria: countByCountry(centers, 'Austria'),
    switzerland: countByCountry(centers, 'Switzerland'),
    portugal: countByCountry(centers, 'Portugal'),
    greece: countByCountry(centers, 'Greece'),
    ireland: countByCountry(centers, 'Ireland'),
    czechia: countByCountry(centers, 'Czechia'),
    hungary: countByCountry(centers, 'Hungary'),
    romania: countByCountry(centers, 'Romania'),
    slovakia: countByCountry(centers, 'Slovakia'),
    bulgaria: countByCountry(centers, 'Bulgaria'),
    croatia: countByCountry(centers, 'Croatia'),
    slovenia: countByCountry(centers, 'Slovenia'),
  };

  for (const [key, expected] of Object.entries(BASELINE)) {
    if (idempotencyCheck) {
      if (key === 'estonia' || key === 'total') continue;
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

  if (!idempotencyCheck && centers.filter(c => String(c.id || '').startsWith('ee_')).length > 0) {
    throw new Error('Pre-merge ee_* IDs already in production — STOP');
  }

  const countrySnapshots = {
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

  const withheldDetails = [];
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
    excluded_brand: 0,
    dup_id_in_batch: 0,
    not_in_ready_file: 0,
  };

  const candidates = idempotencyCheck ? sourceRows : readyFile;
  const seenBatchIds = new Set();
  const validated = [];

  for (const r of candidates) {
    const s = stagingById.get(r.id);
    if (s && excludedCats.includes(s.import_category)) {
      rejected.wrong_import_status = (rejected.wrong_import_status || 0) + 1;
      withheldDetails.push({id: r.id, reason: 'excluded_import_category'});
      continue;
    }
    if (!/^ee_[a-f0-9]{10}$/.test(String(r.id || ''))) {
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
    if (EXCLUDED_BRAND_RE.test(String(r.brand || '').trim())) {
      rejected.excluded_brand++;
      continue;
    }
    if (!String(r.address || '').trim() || String(r.address).trim().length < 4) {
      rejected.missing_address++;
      continue;
    }
    const postal = String(r.postal_code || '').trim();
    if (typeof r.postal_code !== 'string' || !EE_POSTAL_RE.test(postal)) {
      rejected.bad_postal_format++;
      continue;
    }
    if (!String(r.city || '').trim()) {
      rejected.missing_city++;
      continue;
    }
    if (String(r.country || '').trim() !== 'Estonia') {
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
    if (!inEstonia(lat, lng)) {
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
    validated.push({...r, postal_code: postal});
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
    throw new Error('STOP: unexpected proximity hard-dups in pre-merge READY');
  }

  const byId = new Map(centers.map(c => [c.id, c]));
  if (!idempotencyCheck && before.estonia === 0) {
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
    return String(a.name).localeCompare(String(b.name), 'et');
  });

  const existingIds = new Set(centers.map(c => c.id));
  const appended = insertedRows.filter(r => !existingIds.has(r.id));
  const catalog = [...centers, ...appended];

  const after = {
    total: catalog.length,
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

  if (!idempotencyCheck) {
    if (after.total !== EXPECTED_TOTAL_AFTER) {
      throw new Error(`After total ${after.total} !== ${EXPECTED_TOTAL_AFTER}`);
    }
    if (after.estonia !== ACTUAL_READY_COUNT) {
      throw new Error(`After Estonia ${after.estonia} !== ${ACTUAL_READY_COUNT}`);
    }
  }

  const eeLive = catalog.filter(c => c.country === 'Estonia');
  const postMergeProximity = findProximityPairs(eeLive);
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

  const specialLive = validateEstoniaSpecials(eeLive);
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
    country: 'Estonia',
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
  const prodEeIds = new Set(eeLive.map(c => c.id));
  const approvedIds = new Set(approved.map(r => r.id));

  const brandAfter = brandBreakdown(eeLive);

  const comingSoonStaging = stagingOut.filter(r => r.import_category === 'COMING_SOON');
  const excludedStaging = stagingOut.filter(r => r.import_category === 'EXCLUDED');

  const report = {
    country: 'Estonia',
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
    staging_reconciliation: {
      MERGED_INTO_CATALOG: stagingCats.MERGED_INTO_CATALOG || 0,
      NEEDS_COORDINATES: stagingCats.NEEDS_COORDINATES || 0,
      NEEDS_REVIEW: stagingCats.NEEDS_REVIEW || 0,
      COMING_SOON: stagingCats.COMING_SOON || 0,
      CLOSED: stagingCats.CLOSED || 0,
      EXCLUDED: stagingCats.EXCLUDED || 0,
      DUPLICATE_LEGACY: stagingCats.DUPLICATE || stagingCats.LEGACY || 0,
      missing_production_ids: [...prodEeIds].filter(id => !mergedIds.has(id)),
      unexpected_production_ids: [...mergedIds].filter(id => !prodEeIds.has(id)),
      approved_ids_match: [...prodEeIds].every(id => approvedIds.has(id)),
      phase2_ready_ids_match: [...prodEeIds].every(id => readyIds.has(id)),
      metadata_drift:
        [...prodEeIds].filter(id => !mergedIds.has(id)).length ||
        [...mergedIds].filter(id => !prodEeIds.has(id)).length
          ? 'DRIFT'
          : 'NONE',
      reconciliation: `${prodEeIds.size} == ${approvedIds.size} == ${readyIds.size} == ${mergedIds.size}`,
    },
    post_merge: {
      duplicate_ids: duplicateIds.length,
      same_brand_lte_25m: postMergeProximity.lt25.length,
      same_brand_lte_50m: postMergeProximity.lt50.length,
      same_brand_lte_100m: postMergeProximity.lt100.length,
      same_brand_lte_200m: postMergeProximity.lt200.length,
      identical_coordinate_clusters: postMergeProximity.identical.length,
      different_brand_colocations: postMergeProximity.diffBrand.length,
    },
    myfitness: {
      live: eeLive.filter(c => c.brand === 'MyFitness').length,
      volta_present: eeLive.some(c => /volta/i.test(c.name)),
      narva_fama_present: eeLive.some(c => /narva fama/i.test(c.name)),
      people_fitness_absent: !eeLive.some(c => /^People Fitness$/i.test(c.brand)),
      no_lv_id_reuse: !eeLive.some(c => String(c.id).startsWith('lv_')),
    },
    fitness_247: {
      live: eeLive.filter(c => c.brand === '24-7 Fitness').length,
      recovered_present: [
        'Tabasalu',
        'Keila Keskus',
        'Sepa',
        'Viljandi Kaalu',
        'Rakvere',
        'Võru',
        'Jõgeva',
      ].every(
        n => eeLive.filter(c => c.brand === '24-7 Fitness' && c.name.includes(n)).length === 1,
      ),
      narva_present:
        eeLive.filter(
          c => c.brand === '24-7 Fitness' && /\bnarva\b/i.test(c.name) && !/fama/i.test(c.name),
        ).length === 1,
      coming_soon_absent: comingSoonStaging
        .filter(r => r.brand === '24-7 Fitness')
        .every(r => !prodEeIds.has(r.id)),
    },
    gym_bang: {
      live: eeLive.filter(c => c.brand === 'Gym!').length,
      gym_plus_absent: !eeLive.some(c => c.brand === 'Gym+'),
      coming_soon_absent: comingSoonStaging
        .filter(r => r.brand === 'Gym!')
        .every(r => !prodEeIds.has(r.id)),
    },
    golden_club: {
      live: eeLive.filter(c => c.brand === 'Golden Club').length,
      tondi_present: eeLive.some(c => /tondi/i.test(c.name)),
    },
    lemon_gym: {
      live: eeLive.filter(c => c.brand === 'Lemon Gym').length,
      excluded_staging: excludedStaging.filter(r => r.brand === 'Lemon Gym').length,
    },
    rebrand: {
      people_fitness_live: eeLive.filter(c => /^People Fitness$/i.test(c.brand)).length,
      gym_plus_live: eeLive.filter(c => c.brand === 'Gym+').length,
      impuls_live: eeLive.filter(c => /^Impuls$/i.test(c.brand)).length,
      lemon_gym_live: eeLive.filter(c => c.brand === 'Lemon Gym').length,
      myfitness_live: eeLive.filter(c => /^MyFitness$/i.test(c.brand)).length,
      gym_bang_distinct_from_gym_plus:
        eeLive.some(c => c.brand === 'Gym!') && !eeLive.some(c => c.brand === 'Gym+'),
      no_lv_id_reuse: !eeLive.some(c => String(c.id).startsWith('lv_')),
      no_lt_id_reuse: !eeLive.some(c => String(c.id).startsWith('lt_')),
    },
    exclusions: {
      coming_soon_ids_absent: comingSoonStaging.every(r => !prodEeIds.has(r.id)),
      coming_soon_count: comingSoonStaging.length,
      excluded_ids_absent: excludedStaging.every(r => !prodEeIds.has(r.id)),
      excluded_brands_absent: eeLive.every(
        c => !EXCLUDED_BRAND_RE.test(String(c.brand || '').trim()),
      ),
    },
    border_safety: {
      foreign_coords: eeLive.filter(c => !inEstonia(c.lat, c.lng)).length,
      latvia_text: eeLive.filter(c =>
        /latvia|latvija|\briga\b|rīga/i.test(`${c.city} ${c.address}`),
      ).length,
      lithuania_text: eeLive.filter(c =>
        /lithuania|lietuva|vilnius|kaunas/i.test(`${c.city} ${c.address}`),
      ).length,
      finland_text: eeLive.filter(c =>
        /finland|helsinki|suomi/i.test(`${c.city} ${c.address}`),
      ).length,
      russia_text: eeLive.filter(c =>
        /kaliningrad|russia|россия|ivangorod/i.test(`${c.city} ${c.address}`),
      ).length,
      lv_prefix_reuse: eeLive.filter(c => String(c.id).startsWith('lv_')).length,
      lt_prefix_reuse: eeLive.filter(c => String(c.id).startsWith('lt_')).length,
    },
    check_in: {
      CHECK_IN_RADIUS_METERS: 200,
      AUTO_CHECKOUT_DISTANCE_METERS: 200,
      changed: false,
    },
    global_scale: {
      previous: EXPECTED_TOTAL_BEFORE,
      new: after.total,
      crossed_12500: after.total > 12500,
      global_stress_qa_required_now: false,
    },
    verdict: 'ESTONIA MERGE COMPLETE — WAITING FOR QA',
  };

  if (dryRun) {
    console.log(
      JSON.stringify(
        {dry_run: true, would_insert: inserted, after, brand_breakdown: brandAfter},
        null,
        2,
      ),
    );
    return;
  }

  if (idempotencyCheck) {
    const idem = {
      second_run_insertions: inserted,
      final_catalog: catalog.length,
      estonia: after.estonia,
      pass:
        inserted === 0 &&
        catalog.length === EXPECTED_TOTAL_AFTER &&
        after.estonia === EXPECTED_READY,
    };
    fs.writeFileSync(idempotencyPath, JSON.stringify(idem, null, 2) + '\n');
    console.log(JSON.stringify(idem, null, 2));
    if (!idem.pass) throw new Error('Idempotency check FAILED');
    return;
  }

  // Freeze approved input before write (exact 33 Phase 2 READY rows)
  fs.writeFileSync(approvedPath, JSON.stringify(approved, null, 2) + '\n');
  if (approved.length !== EXPECTED_READY) {
    throw new Error(`Approved freeze count ${approved.length} !== ${EXPECTED_READY}`);
  }

  fs.writeFileSync(centersPath, JSON.stringify(catalog, null, 2) + '\n');
  const postMergeSha256 = sha256File(centersPath);
  report.post_merge_sha256 = postMergeSha256;

  const jsonSize = fs.statSync(centersPath).size;
  const tParse0 = Date.now();
  JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const parseMs = Date.now() - tParse0;
  report.performance = {
    catalog: after.total,
    active: catalog.filter(c => c.is_active !== false).length,
    json_size_mb: +(jsonSize / 1024 / 1024).toFixed(2),
    parse_ms: parseMs,
    architecture: 'KEEP CLIENT-SIDE',
  };

  dupAnalysis.post_merge_proximity = postMergeProximity;
  dupAnalysis.counts = report.post_merge;
  dupAnalysis.classified_suspicious = postMergeProximity.diffBrand;

  fs.writeFileSync(stagingPath, JSON.stringify(stagingOut, null, 2) + '\n');
  fs.writeFileSync(dupAnalysisPath, JSON.stringify(dupAnalysis, null, 2) + '\n');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

  const md = `# ESTONIA MERGE REPORT

Generated: ${report.generated_at}

## Verdict

**${report.verdict}**

## Baseline → After

| Metric | Before | After |
|--------|-------:|------:|
| Total | ${before.total} | ${after.total} |
| Estonia | ${before.estonia} | ${after.estonia} |

Inserted: **${inserted}**  
Withheld: **${report.withheld}**  
Pre-merge SHA: \`${preMergeSha256}\`  
Post-merge SHA: \`${postMergeSha256}\`

## Brand breakdown

${Object.entries(brandAfter)
  .map(([b, n]) => `- ${b}: ${n}`)
  .join('\n')}

## Special validation

- MyFitness: ${report.myfitness.live} (Volta ${report.myfitness.volta_present}, Narva Fama ${report.myfitness.narva_fama_present})
- 24-7 Fitness: ${report.fitness_247.live}
- Gym!: ${report.gym_bang.live} (Gym+ absent: ${report.gym_bang.gym_plus_absent})
- Golden Club: ${report.golden_club.live} (Tondi ${report.golden_club.tondi_present})
- Lemon Gym live: ${report.lemon_gym.live}

## Staging reconciliation

${report.staging_reconciliation.reconciliation}  
Metadata drift: ${report.staging_reconciliation.metadata_drift}

## Global scale

Projected: ${after.total}  
12,500 crossed: ${report.global_scale.crossed_12500}  
Global Stress QA required now: NO
`;
  fs.writeFileSync(mdReportPath, md);

  console.log(
    JSON.stringify(
      {
        inserted,
        after_total: after.total,
        estonia: after.estonia,
        sha_before: preMergeSha256,
        sha_after: postMergeSha256,
        verdict: report.verdict,
      },
      null,
      2,
    ),
  );
}

main();
