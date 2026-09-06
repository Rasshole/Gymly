/**
 * Bulgaria production-safe merge (Phase 3 canonical READY).
 *
 * Source: data/bulgaria/BULGARIA_PHASE3_READY_TO_IMPORT.json
 *
 * Usage:
 *   node scripts/import-bulgaria-merge.mjs --dry-run
 *   node scripts/import-bulgaria-merge.mjs
 *   node scripts/import-bulgaria-merge.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const stagingPath = path.join(root, 'data/bulgaria/bulgaria_centers_staging.json');
const readyPath = path.join(root, 'data/bulgaria/BULGARIA_PHASE3_READY_TO_IMPORT.json');
const phase3ReportPath = path.join(root, 'data/bulgaria/BULGARIA_PHASE3_READINESS_REPORT.json');
const reportDir = path.join(root, 'data/bulgaria');
const reportPath = path.join(reportDir, 'BULGARIA_MERGE_REPORT.json');
const mdReportPath = path.join(reportDir, 'BULGARIA_MERGE_REPORT.md');
const dupAnalysisPath = path.join(reportDir, 'BULGARIA_MERGE_DUPLICATE_ANALYSIS.json');
const approvedPath = path.join(reportDir, 'BULGARIA_APPROVED_FOR_MERGE.json');
const idempotencyPath = path.join(reportDir, 'BULGARIA_MERGE_IDEMPOTENCY.json');

const dryRun = process.argv.includes('--dry-run');
const idempotencyCheck = process.argv.includes('--idempotency-check');

const EXPECTED_TOTAL_BEFORE = 11254;
const EXPECTED_READY = 82;
const EXPECTED_SHA_BEFORE =
  '91ffadd49497614f96eaf11f9d01edbdb127df2a6d8ce87bb7d7ad4443717840';
const BG_POSTAL_RE = /^\d{4}$/;
const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE =
  /fallback|invented|centroid|city.?center|postcode.?centroid|capital.?fallback|town.?centroid/i;
const FOREIGN_TEXT_RE =
  /\b(romania|serbia|macedonia|skopje|greece|turkey|istanbul|strumica|atlantis)\b/i;

const EXPECTED_BRAND_BREAKDOWN = {
  'Next Level Fitness': 29,
  'Pulse Fitness': 19,
  'Flais Fitness': 14,
  'Athletic Fitness': 9,
  'Titanium Fitness': 6,
  'Hammer Gym': 5,
};

const BASELINE = {
  total: EXPECTED_TOTAL_BEFORE,
  bulgaria: 0,
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
};

/** Mirrors isPlausibleBulgariaCoordinate / in_bulgaria */
function inBulgaria(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 41.2 || lat > 44.25 || lng < 22.3 || lng > 28.7) return false;
  if (lat >= 44.0 && lng >= 25.0 && lng <= 27.5) return false;
  if (lat <= 41.5 && lng >= 27.8) return false;
  if (lat <= 41.55 && lng <= 23.6) return false;
  if (lat >= 43.5 && lng <= 22.55) return false;
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
    country: 'Bulgaria',
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
          a_name: a.name,
          b_name: b.name,
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
            classification: 'A_legitimate_different_brand_colocation',
          });
        }
        continue;
      }
      const rec = {
        a_id: a.id,
        a_name: a.name,
        a_address: a.address,
        a_postal: a.postal_code,
        b_id: b.id,
        b_name: b.name,
        b_address: b.address,
        b_postal: b.postal_code,
        brand: a.brand,
        distance_m: Math.round(d),
        same_address: addrBrandKey(a) === addrBrandKey(b),
        classification: d <= 50 ? 'D_uncertain_pending' : 'A_legitimate',
      };
      if (d <= 25) lt25.push(rec);
      if (d <= 50) lt50.push(rec);
      if (d <= 100) lt100.push(rec);
      if (d <= 200) lt200.push(rec);
    }
  }
  return {lt25, lt50, lt100, lt200, identical, diffBrand};
}

function validateBrandBreakdown(byBrand, expectedCanonical) {
  const mismatches = [];
  for (const [brand, expected] of Object.entries(EXPECTED_BRAND_BREAKDOWN)) {
    if ((byBrand[brand] || 0) !== expected) {
      mismatches.push({brand, expected, actual: byBrand[brand] || 0});
    }
  }
  const extra = Object.keys(byBrand).filter(b => !(b in EXPECTED_BRAND_BREAKDOWN));
  if (extra.length) mismatches.push({extra_brands: extra});
  const sum = Object.values(byBrand).reduce((a, b) => a + b, 0);
  if (sum !== expectedCanonical) {
    mismatches.push({sum_expected: expectedCanonical, sum_actual: sum});
  }
  return mismatches;
}

function main() {
  const centers = JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8'));
  const readyFile = JSON.parse(fs.readFileSync(readyPath, 'utf8'));
  const phase3Report = fs.existsSync(phase3ReportPath)
    ? JSON.parse(fs.readFileSync(phase3ReportPath, 'utf8'))
    : null;
  const stagingById = new Map(staging.map(r => [r.id, r]));

  if (!Array.isArray(readyFile) || readyFile.length === 0) {
    throw new Error('BULGARIA_PHASE3_READY_TO_IMPORT.json missing or empty — STOP');
  }

  const ACTUAL_READY_COUNT = readyFile.length;
  const EXPECTED_TOTAL_AFTER = EXPECTED_TOTAL_BEFORE + ACTUAL_READY_COUNT;

  if (ACTUAL_READY_COUNT !== EXPECTED_READY) {
    throw new Error(`READY count is ${ACTUAL_READY_COUNT}, expected ${EXPECTED_READY} — STOP`);
  }

  const brandMismatches = validateBrandBreakdown(brandBreakdown(readyFile), ACTUAL_READY_COUNT);
  if (brandMismatches.length > 0) {
    throw new Error(`Brand breakdown mismatch — STOP: ${JSON.stringify(brandMismatches)}`);
  }

  const readyIds = new Set(readyFile.map(r => r.id));
  if (readyIds.size !== ACTUAL_READY_COUNT) {
    throw new Error('Duplicate IDs inside Phase 3 READY file — STOP');
  }

  // Explicit exclusion / identity checks
  for (const r of readyFile) {
    const n = `${r.name} ${r.brand}`;
    if (/atlantis/i.test(n)) throw new Error(`Pulse Atlantis in READY — STOP`);
    if (/therme/i.test(n)) throw new Error(`Pulse Therme in READY — STOP`);
    if (/royal\s*hotel/i.test(n)) throw new Error(`Pulse Royal Hotel in READY — STOP`);
    if (/platinum\s*health\s*club/i.test(n)) {
      throw new Error(`Platinum Health Club identity in READY — STOP`);
    }
    if (/nikolai\s*kopernik/i.test(n)) throw new Error(`Athletic Nikolai Kopernik in READY — STOP`);
    if (/^Pulse Ovcha Kupel$/i.test(r.name) || /^Pulse Drujba$/i.test(r.name)) {
      throw new Error(`Coming-soon Pulse in READY: ${r.name} — STOP`);
    }
  }

  // Titanium identity correction must be preserved
  const tiStudentski = readyFile.find(r => /studentski/i.test(r.name));
  const tiMladost3 = readyFile.find(r => /mladost\s*3/i.test(r.name));
  if (!tiStudentski || !/симеоновско|simeonovsko/i.test(tiStudentski.address || '')) {
    throw new Error('Titanium Studentski Grad must be Simeonovsko 77 — STOP');
  }
  if (!tiMladost3 || !/386|блок|blok/i.test(tiMladost3.address || '')) {
    throw new Error('Titanium Mladost 3 must be Blok 386 — STOP');
  }

  // Pulse Platinum + Hammer Platinum both present and distinct
  const pulsePlat = readyFile.find(r => r.name === 'Pulse Platinum');
  const hammerPlat = readyFile.find(r => r.name === 'Hammer Gym Platinum');
  if (!pulsePlat || pulsePlat.brand !== 'Pulse Fitness') {
    throw new Error('Pulse Platinum missing as Pulse Fitness — STOP');
  }
  if (!hammerPlat || hammerPlat.brand !== 'Hammer Gym') {
    throw new Error('Hammer Gym Platinum missing — STOP');
  }
  const westPark = readyFile.find(r => r.name === 'Pulse West Park');
  const lyulin = readyFile.find(r => r.name === 'Pulse Lyulin');
  if (!westPark || !lyulin) throw new Error('Pulse West Park / Lyulin missing — STOP');
  const wpLyDist = haversineMeters(
    Number(westPark.lat),
    Number(westPark.lng),
    Number(lyulin.lat),
    Number(lyulin.lng),
  );
  if (wpLyDist < 200) {
    throw new Error(`Pulse West Park / Lyulin too close (${Math.round(wpLyDist)}m) — STOP`);
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
  const excludedInReady = staging.filter(
    r => readyIds.has(r.id) && excludedCats.includes(r.import_category),
  );
  if (excludedInReady.length > 0) {
    throw new Error(
      `READY file contains excluded staging IDs: ${excludedInReady.map(r => r.id).join(', ')} — STOP`,
    );
  }

  for (const cs of staging.filter(r => r.import_category === 'COMING_SOON')) {
    if (readyIds.has(cs.id)) throw new Error(`COMING_SOON ${cs.id} in READY — STOP`);
  }

  if (
    phase3Report &&
    phase3Report.ready_count != null &&
    phase3Report.ready_count !== ACTUAL_READY_COUNT
  ) {
    throw new Error(
      `Phase3 report ready_count=${phase3Report.ready_count}, file=${ACTUAL_READY_COUNT} — STOP`,
    );
  }

  const sourceRows = idempotencyCheck
    ? staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG')
    : staging.filter(r => r.import_category === 'READY_TO_IMPORT');

  if (!idempotencyCheck && sourceRows.length !== ACTUAL_READY_COUNT) {
    throw new Error(
      `Staging READY count ${sourceRows.length} !== Phase3 READY ${ACTUAL_READY_COUNT} — STOP`,
    );
  }

  if (!idempotencyCheck) {
    const stagingReadyIds = new Set(sourceRows.map(r => r.id));
    for (const id of readyIds) {
      if (!stagingReadyIds.has(id)) {
        throw new Error(`Phase3 READY id ${id} missing from staging READY — STOP`);
      }
    }
  }

  const preMergeSha256 = sha256File(centersPath);
  if (!idempotencyCheck && preMergeSha256 !== EXPECTED_SHA_BEFORE) {
    throw new Error(`Pre-merge SHA mismatch: ${preMergeSha256} — STOP`);
  }

  const before = {
    total: centers.length,
    bulgaria: countByCountry(centers, 'Bulgaria'),
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
  };

  for (const [key, expected] of Object.entries(BASELINE)) {
    if (idempotencyCheck) {
      if (key === 'bulgaria' || key === 'total') continue;
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

  const countrySnapshots = {
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
  };

  const withheldDetails = [];
  const rejected = {
    missing_id_prefix: 0,
    missing_name: 0,
    missing_brand: 0,
    missing_address: 0,
    missing_postal: 0,
    missing_city: 0,
    wrong_country: 0,
    invalid_coords: 0,
    bad_postal_format: 0,
    foreign_coords: 0,
    foreign_text: 0,
    mojibake: 0,
    not_active: 0,
    coming_soon: 0,
    closed: 0,
    fallback_coord: 0,
    wrong_import_status: 0,
    dup_id_in_batch: 0,
    not_in_ready_file: 0,
  };

  const candidates = idempotencyCheck ? sourceRows : readyFile;
  const seenBatchIds = new Set();
  const validated = [];

  for (const r of candidates) {
    const s = stagingById.get(r.id);
    if (s && excludedCats.includes(s.import_category)) {
      rejected.wrong_import_status++;
      withheldDetails.push({id: r.id, reason: 'excluded_import_category', value: s.import_category});
      continue;
    }
    if (!/^bg_[a-f0-9]{10}$/.test(String(r.id || ''))) {
      rejected.missing_id_prefix++;
      withheldDetails.push({id: r.id, reason: 'missing_bg_prefix'});
      continue;
    }
    if (seenBatchIds.has(r.id)) {
      rejected.dup_id_in_batch++;
      withheldDetails.push({id: r.id, reason: 'dup_id_in_batch'});
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
    if (!String(r.address || '').trim() || String(r.address).trim().length < 8) {
      rejected.missing_address++;
      continue;
    }
    const postal = String(r.postal_code || '').trim();
    if (typeof r.postal_code !== 'string' || !BG_POSTAL_RE.test(postal)) {
      rejected.bad_postal_format++;
      withheldDetails.push({id: r.id, reason: 'bad_postal_format', postal});
      continue;
    }
    if (!String(r.city || '').trim()) {
      rejected.missing_city++;
      continue;
    }
    if (String(r.country || '').trim() !== 'Bulgaria') {
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
    if (!inBulgaria(lat, lng)) {
      rejected.foreign_coords++;
      withheldDetails.push({id: r.id, reason: 'foreign_coords', lat, lng});
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
      `STOP BEFORE WRITE: validated ${validated.length}/${ACTUAL_READY_COUNT}. Withheld: ${JSON.stringify(withheldDetails)} rejected=${JSON.stringify(rejected)}`,
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
      `STOP: unexpected proximity hard-dups ${JSON.stringify({
        lt25: preMergeProximity.lt25,
        lt50: preMergeProximity.lt50,
        identical: preMergeProximity.identical,
      })}`,
    );
  }

  const byId = new Map(centers.map(c => [c.id, c]));
  const prodCollisions = validated.filter(r => byId.has(r.id)).map(r => r.id);
  if (!idempotencyCheck && before.bulgaria === 0 && prodCollisions.length > 0) {
    throw new Error(`STOP: duplicate IDs vs production: ${prodCollisions.join(', ')}`);
  }

  const liveIds = new Set(centers.map(c => c.id));
  let inserted = 0;
  const insertedRows = [];
  const dupAnalysis = {
    pre_merge_proximity: {
      lt25: preMergeProximity.lt25,
      lt50: preMergeProximity.lt50,
      lt100: preMergeProximity.lt100,
      lt200: preMergeProximity.lt200,
      identical: preMergeProximity.identical,
      diffBrand: preMergeProximity.diffBrand,
    },
    skipped_existing_id: [],
    withheld: withheldDetails,
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
    const nn = String(a.name).localeCompare(String(b.name), 'bg');
    if (nn !== 0) return nn;
    return String(a.id).localeCompare(String(b.id));
  });

  const existingIds = new Set(centers.map(c => c.id));
  const appended = insertedRows.filter(r => !existingIds.has(r.id));
  const catalog = [...centers, ...appended];

  const after = {
    total: catalog.length,
    bulgaria: countByCountry(catalog, 'Bulgaria'),
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
  };

  if (!idempotencyCheck) {
    if (after.total !== EXPECTED_TOTAL_AFTER) {
      throw new Error(`After total ${after.total} !== ${EXPECTED_TOTAL_AFTER}`);
    }
    if (after.bulgaria !== ACTUAL_READY_COUNT) {
      throw new Error(`After Bulgaria ${after.bulgaria} !== ${ACTUAL_READY_COUNT}`);
    }
  }

  const bgLive = catalog.filter(c => c.country === 'Bulgaria');
  const postMergeProximity = findProximityPairs(bgLive);
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

  const approved = validated.map(r => ({
    id: r.id,
    brand: r.brand,
    name: r.name,
    address: r.address,
    postal_code: r.postal_code,
    city: r.city,
    lat: r.lat,
    lng: r.lng,
    source_url: r.source_url || null,
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
  const prodBgIds = new Set(bgLive.map(c => c.id));
  const missingProd = [...prodBgIds].filter(id => !mergedIds.has(id));
  const unexpectedMerged = [...mergedIds].filter(id => !prodBgIds.has(id));
  const missingFromApproved = [...prodBgIds].filter(id => !readyIds.has(id));
  const unexpectedInProd = [...readyIds].filter(id => !prodBgIds.has(id) && !idempotencyCheck);

  const brandAfter = brandBreakdown(bgLive);

  const report = {
    country: 'Bulgaria',
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
    withheld_details: withheldDetails,
    country_regression: countryRegression,
    staging_reconciliation: {
      MERGED_INTO_CATALOG: stagingCats.MERGED_INTO_CATALOG || 0,
      NEEDS_COORDINATES: stagingCats.NEEDS_COORDINATES || 0,
      NEEDS_REVIEW: stagingCats.NEEDS_REVIEW || 0,
      COMING_SOON: stagingCats.COMING_SOON || 0,
      CLOSED: stagingCats.CLOSED || 0,
      EXCLUDED: stagingCats.EXCLUDED || 0,
      DUPLICATE_LEGACY: stagingCats.DUPLICATE || stagingCats.LEGACY || 0,
      missing_production_ids: missingProd,
      unexpected_production_ids: unexpectedMerged,
      missing_from_approved: missingFromApproved,
      unexpected_in_prod_vs_ready: unexpectedInProd,
      metadata_drift:
        missingProd.length || unexpectedMerged.length || missingFromApproved.length
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
    },
    pulse_validation: {
      open_current_merged: brandAfter['Pulse Fitness'] || 0,
      pulse_platinum_present: bgLive.some(c => c.name === 'Pulse Platinum'),
      west_park_lyulin_distance_m: Math.round(wpLyDist),
      hotel_foreign_merged: bgLive.filter(c =>
        /atlantis|therme|royal\s*hotel/i.test(c.name),
      ).length,
      coming_soon_merged: bgLive.filter(
        c => c.name === 'Pulse Ovcha Kupel' || c.name === 'Pulse Drujba',
      ).length,
    },
    titanium_validation: {
      studentski_address: tiStudentski.address,
      mladost3_address: tiMladost3.address,
    },
    exclusions: {
      atlantis_absent: !bgLive.some(c => /atlantis/i.test(c.name)),
      therme_absent: !bgLive.some(c => /therme/i.test(c.name)),
      royal_hotel_absent: !bgLive.some(c => /royal\s*hotel/i.test(c.name)),
      coming_soon_pulse_absent: !bgLive.some(
        c => c.name === 'Pulse Ovcha Kupel' || c.name === 'Pulse Drujba',
      ),
      athletic_nk_absent: !bgLive.some(c => /nikolai\s*kopernik/i.test(c.name)),
      platinum_health_club_absent: !bgLive.some(c => /platinum\s*health\s*club/i.test(c.name)),
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
    verdict: 'BULGARIA MERGE COMPLETE — WAITING FOR QA',
  };

  if (dryRun) {
    console.log(JSON.stringify({dry_run: true, would_insert: inserted, after}, null, 2));
    return;
  }

  if (idempotencyCheck) {
    const idem = {
      second_run_insertions: inserted,
      final_catalog: catalog.length,
      bulgaria: after.bulgaria,
      pass:
        inserted === 0 &&
        catalog.length === EXPECTED_TOTAL_AFTER &&
        after.bulgaria === EXPECTED_READY,
    };
    fs.writeFileSync(idempotencyPath, JSON.stringify(idem, null, 2) + '\n');
    console.log(JSON.stringify(idem, null, 2));
    if (!idem.pass) throw new Error('Idempotency check FAILED');
    return;
  }

  fs.writeFileSync(centersPath, JSON.stringify(catalog, null, 2) + '\n');
  const postMergeSha256 = sha256File(centersPath);
  report.post_merge_sha256 = postMergeSha256;

  // Performance (merge-time)
  const jsonSize = fs.statSync(centersPath).size;
  const tParse0 = Date.now();
  JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const parseMs = Date.now() - tParse0;
  report.performance = {
    catalog: after.total,
    active: catalog.filter(c => c.is_active !== false).length,
    json_size_mb: +(jsonSize / 1024 / 1024).toFixed(2),
    parse_ms: parseMs,
    note: 'Full cold-index/search timings in merge-safety test / Production QA.',
  };

  fs.writeFileSync(stagingPath, JSON.stringify(stagingOut, null, 2) + '\n');
  fs.writeFileSync(approvedPath, JSON.stringify(approved, null, 2) + '\n');
  fs.writeFileSync(dupAnalysisPath, JSON.stringify(dupAnalysis, null, 2) + '\n');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

  const md = `# BULGARIA MERGE REPORT

Generated: ${report.generated_at}

## Verdict

**${report.verdict}**

## Baseline → After

| Metric | Before | After |
|--------|-------:|------:|
| Total | ${before.total} | ${after.total} |
| Bulgaria | ${before.bulgaria} | ${after.bulgaria} |

Inserted: **${inserted}**  
Withheld: **${report.withheld}**  
Pre-merge SHA: \`${preMergeSha256}\`  
Post-merge SHA: \`${postMergeSha256}\`

## Brand breakdown

${Object.entries(brandAfter)
  .map(([b, n]) => `- ${b}: ${n}`)
  .join('\n')}

## Staging

MERGED_INTO_CATALOG: ${report.staging_reconciliation.MERGED_INTO_CATALOG}  
NEEDS_REVIEW: ${report.staging_reconciliation.NEEDS_REVIEW}  
COMING_SOON: ${report.staging_reconciliation.COMING_SOON}  
EXCLUDED: ${report.staging_reconciliation.EXCLUDED}  
Metadata drift: ${report.staging_reconciliation.metadata_drift}

## Duplicates

Same-brand ≤50 m: ${report.post_merge.same_brand_lte_50m}  
Same-brand ≤200 m: ${report.post_merge.same_brand_lte_200m}  
Identical coords: ${report.post_merge.identical_coordinate_clusters}  
Different-brand ≤100 m: ${report.post_merge.different_brand_colocations}

## Global scale

${before.total} → ${after.total} (12,500 crossed: NO)
`;
  fs.writeFileSync(mdReportPath, md);

  console.log(
    JSON.stringify(
      {
        inserted,
        after_total: after.total,
        bulgaria: after.bulgaria,
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
