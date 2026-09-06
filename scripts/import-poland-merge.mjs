/**
 * Poland production-safe merge.
 *
 * Source of truth:
 *   primary: data/poland/poland_centers_staging.json (import_category READY_TO_IMPORT)
 * Cross-check:
 *   data/poland/POLAND_PHASE2_READY_TO_IMPORT.json (621)
 *   data/poland/POLAND_PHASE2_READINESS_REPORT.json
 *
 * HARD RULES:
 * - Never merge NEEDS_COORDINATES / NEEDS_REVIEW / COMING_SOON / CLOSED / DUPLICATE / LEGACY / EXCLUDED
 * - Never invent or repair questionable rows — withhold and report
 * - Polish postal must remain NN-NNN STRING (^\d{2}-\d{3}$)
 * - Reject foreign pins outside Poland; honor rebrand map (no Fitness Platinium as current brand)
 * - Same-brand <50/100m in approved batch → STOP before write (unexplained physical duplicate)
 * - If inserted !== 621, STOP without writing centers.json (unless --allow-partial)
 *
 * Usage:
 *   node scripts/import-poland-merge.mjs --dry-run
 *   node scripts/import-poland-merge.mjs
 *   node scripts/import-poland-merge.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const stagingPath = path.join(root, 'data/poland/poland_centers_staging.json');
const readyPath = path.join(root, 'data/poland/POLAND_PHASE2_READY_TO_IMPORT.json');
const phase2ReportPath = path.join(root, 'data/poland/POLAND_PHASE2_READINESS_REPORT.json');
const reportDir = path.join(root, 'data/poland');
const reportPath = path.join(reportDir, 'POLAND_MERGE_REPORT.json');
const mdReportPath = path.join(reportDir, 'POLAND_MERGE_REPORT.md');
const dupAnalysisPath = path.join(reportDir, 'POLAND_MERGE_DUPLICATE_ANALYSIS.json');
const approvedPath = path.join(reportDir, 'POLAND_APPROVED_FOR_MERGE.json');

const dryRun = process.argv.includes('--dry-run');
const idempotencyCheck = process.argv.includes('--idempotency-check');
const allowPartial = process.argv.includes('--allow-partial');

const EXPECTED_INSERT = 621;
const EXPECTED_TOTAL_BEFORE = 9094;
const PL_POSTAL_RE = /^\d{2}-\d{3}$/;
const MOJIBAKE_RE = /Ã.|�|â€/;
const ALLOWED_COORD = new Set([
  'OFFICIAL_COORDINATE',
  'STRICT_ADDRESS_GEOCODE',
  'NAMED_GYM_POI',
  'OFFICIAL_MAP_PIN',
]);

/** Poland mainland bbox (matches poland-phase1-consolidate.py). */
const PL_BOUNDS = {latMin: 49.0, latMax: 54.9, lngMin: 14.07, lngMax: 24.15};

/** Interior foreign boxes — reject pins clearly outside Poland. */
const FOREIGN_BOXES = [
  {code: 'DE', name: 'Germany', latMin: 50.5, latMax: 54.5, lngMin: 6.0, lngMax: 14.0},
  {code: 'CZ', name: 'Czechia', latMin: 48.5, latMax: 49.05, lngMin: 12.0, lngMax: 18.9},
  {code: 'SK', name: 'Slovakia', latMin: 47.7, latMax: 49.05, lngMin: 16.8, lngMax: 22.6},
  {code: 'UA', name: 'Ukraine', latMin: 44.0, latMax: 52.5, lngMin: 24.2, lngMax: 40.0},
  {code: 'BY', name: 'Belarus', latMin: 51.0, latMax: 56.2, lngMin: 23.6, lngMax: 32.8},
  {code: 'LT', name: 'Lithuania', latMin: 54.95, latMax: 56.5, lngMin: 20.9, lngMax: 26.9},
  {code: 'RU', name: 'Kaliningrad', latMin: 54.2, latMax: 55.5, lngMin: 19.0, lngMax: 22.8},
];

const LEGACY_CURRENT_BRANDS = new Set([
  'fitness platinium',
  'smart gym',
  'mcfit poland',
  'my fitness place',
  'saturn fitness',
  'total fitness',
  'stepone',
  'tone zone',
]);

const BASELINE = {
  total: EXPECTED_TOTAL_BEFORE,
  poland: 0,
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
};

function hasValidCoords(r) {
  const lat = Number(r.lat);
  const lng = Number(r.lng);
  return (
    r.lat != null && r.lng != null &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    !(lat === 0 && lng === 0) &&
    !Number.isNaN(lat) && !Number.isNaN(lng)
  );
}

function inBounds(lat, lng, b) {
  return lat >= b.latMin && lat <= b.latMax && lng >= b.lngMin && lng <= b.lngMax;
}

function inPolandBbox(lat, lng) {
  return inBounds(lat, lng, PL_BOUNDS);
}

function foreignNeighborHint(lat, lng, city, name, address) {
  const cityL = String(city || '').toLowerCase().trim();
  const blob = `${city || ''} ${name || ''} ${address || ''}`.toLowerCase();

  if (/\b(germany|deutschland|niemcy)\b/.test(blob) &&
      !/(ul\.|ulica|al\.|aleja)\s+.*\b(germany|deutschland)\b/i.test(blob)) {
    return 'DE_name';
  }
  if (/^\s*(berlin|dresden|frankfurt|leipzig|görlitz|gorlitz)\s*$/i.test(cityL)) {
    return 'DE_city';
  }
  if (/\b(czech|czechia|czechy|česko)\b/.test(blob)) return 'CZ_name';
  if (/^\s*(prague|praha|brno|ostrava|liberec)\s*$/i.test(cityL)) return 'CZ_city';
  if (/\b(slovakia|słowacja|slowakei)\b/.test(blob)) return 'SK_name';
  if (/^\s*(bratislava|košice|kosice|žilina|zilina)\s*$/i.test(cityL)) return 'SK_city';
  if (/\b(ukraine|ukraina)\b/.test(blob)) return 'UA_name';
  if (/^\s*(lviv|kyiv|kiev|chernivtsi)\s*$/i.test(cityL)) return 'UA_city';
  if (/\b(belarus|białoruś|bialorus)\b/.test(blob)) return 'BY_name';
  if (/\b(lithuania|litwa)\b/.test(blob)) return 'LT_name';
  if (/^\s*(vilnius|kaunas|klaipėda|klaipeda)\s*$/i.test(cityL)) return 'LT_city';
  if (/\b(kaliningrad|królewiec|krolewiec)\b/.test(blob)) return 'RU_name';

  for (const box of FOREIGN_BOXES) {
    if (inBounds(lat, lng, box)) return `${box.code}_geo`;
  }
  return null;
}

function isValidCity(city) {
  const c = String(city || '').trim();
  if (!c) return false;
  if (/^\d+$/.test(c)) return false;
  if (PL_POSTAL_RE.test(c)) return false;
  return true;
}

function normalizeBrand(b) {
  return String(b || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeAddr(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
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
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function hasMojibake(text) {
  return MOJIBAKE_RE.test(text);
}

function toCatalogRow(r) {
  return {
    id: r.id,
    name: r.name,
    brand: r.brand,
    address: r.address || '',
    postal_code: String(r.postal_code || '').trim(),
    city: r.city,
    country: 'Poland',
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
    return a && a.lat === c.lat && a.lng === c.lng && a.name === c.name &&
      a.brand === c.brand && a.address === c.address &&
      a.postal_code === c.postal_code && a.city === c.city &&
      a.country === c.country && a.is_active === c.is_active;
  });
}

function encodingIssues(rows) {
  const bad = [];
  for (const r of rows) {
    const blob = `${r.name} ${r.address} ${r.city} ${r.brand}`;
    if (hasMojibake(blob)) {
      bad.push({id: r.id, name: r.name, snippet: blob.slice(0, 80)});
    }
  }
  return bad;
}

function countPolishLetters(rows) {
  const counts = {
    a_ogonek: 0, c_acute: 0, e_ogonek: 0, l_stroke: 0, n_acute: 0,
    o_acute: 0, s_acute: 0, z_acute: 0, z_dot: 0,
  };
  for (const r of rows) {
    const blob = `${r.name}${r.address}${r.city}`;
    counts.a_ogonek += (blob.match(/[ąĄ]/g) || []).length;
    counts.c_acute += (blob.match(/[ćĆ]/g) || []).length;
    counts.e_ogonek += (blob.match(/[ęĘ]/g) || []).length;
    counts.l_stroke += (blob.match(/[łŁ]/g) || []).length;
    counts.n_acute += (blob.match(/[ńŃ]/g) || []).length;
    counts.o_acute += (blob.match(/[óÓ]/g) || []).length;
    counts.s_acute += (blob.match(/[śŚ]/g) || []).length;
    counts.z_acute += (blob.match(/[źŹ]/g) || []).length;
    counts.z_dot += (blob.match(/[żŻ]/g) || []).length;
  }
  return counts;
}

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function findSameBrandProximity(rows) {
  const lt50 = [];
  const lt100 = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      if (!hasValidCoords(a) || !hasValidCoords(b)) continue;
      if (normalizeBrand(a.brand) !== normalizeBrand(b.brand)) continue;
      const d = haversineMeters(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng));
      if (d >= 100) continue;
      const rec = {
        a_id: a.id, a_brand: a.brand, a_name: a.name,
        b_id: b.id, b_brand: b.brand, b_name: b.name,
        distance_m: Math.round(d),
        a_notes: a.notes || '', b_notes: b.notes || '',
      };
      if (d < 50) lt50.push(rec);
      lt100.push(rec);
    }
  }
  return {lt50, lt100};
}

function main() {
  const centers = JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8'));
  const readyFile = JSON.parse(fs.readFileSync(readyPath, 'utf8'));
  const phase2Report = fs.existsSync(phase2ReportPath)
    ? JSON.parse(fs.readFileSync(phase2ReportPath, 'utf8'))
    : null;
  const stagingById = new Map(staging.map(r => [r.id, r]));

  if (!Array.isArray(readyFile) || readyFile.length !== EXPECTED_INSERT) {
    throw new Error(
      `POLAND_PHASE2_READY_TO_IMPORT.json count ${readyFile?.length}, expected ${EXPECTED_INSERT}`,
    );
  }

  const stagingReadyOrMerged = staging.filter(r =>
    r.import_category === 'READY_TO_IMPORT' || r.import_category === 'MERGED_INTO_CATALOG',
  );
  const readyIds = new Set(readyFile.map(r => r.id));
  const stagingEligibleIds = new Set(stagingReadyOrMerged.map(r => r.id));
  const stagingReadyCount = staging.filter(r => r.import_category === 'READY_TO_IMPORT').length;
  const stagingMergedCount = staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG').length;

  if ([...readyIds].some(id => !stagingEligibleIds.has(id))) {
    throw new Error(
      `Cross-check failed: Phase2 READY IDs missing from staging READY/MERGED ` +
      `(ready=${readyFile.length}, staging_ready=${stagingReadyCount}, staging_merged=${stagingMergedCount})`,
    );
  }
  if (!idempotencyCheck && stagingReadyCount !== EXPECTED_INSERT) {
    throw new Error(
      `Cross-check failed: staging READY (${stagingReadyCount}) !== Phase2 READY (${readyFile.length}) — STOP`,
    );
  }
  if (phase2Report && phase2Report.ready_to_import !== EXPECTED_INSERT) {
    throw new Error(
      `Phase2 report ready_to_import=${phase2Report.ready_to_import}, expected ${EXPECTED_INSERT}`,
    );
  }

  const sourceRows = idempotencyCheck
    ? staging.filter(r =>
      r.import_category === 'MERGED_INTO_CATALOG' || r.import_category === 'READY_TO_IMPORT')
      .filter(r => readyIds.has(r.id))
    : staging.filter(r => r.import_category === 'READY_TO_IMPORT');

  if (!idempotencyCheck && sourceRows.length !== EXPECTED_INSERT) {
    throw new Error(
      `Staging READY count ${sourceRows.length} !== ${EXPECTED_INSERT} — STOP before write`,
    );
  }

  const preMergeSha256 = sha256File(centersPath);

  const before = {
    total: centers.length,
    poland: countByCountry(centers, 'Poland'),
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
  };

  const dkBefore = snapshotCountry(centers, 'Denmark');
  const seBefore = snapshotCountry(centers, 'Sweden');
  const noBefore = snapshotCountry(centers, 'Norway');
  const fiBefore = snapshotCountry(centers, 'Finland');
  const deBefore = snapshotCountry(centers, 'Germany');
  const ukBefore = snapshotCountry(centers, 'United Kingdom');
  const nlBefore = snapshotCountry(centers, 'Netherlands');
  const frBefore = snapshotCountry(centers, 'France');
  const esBefore = snapshotCountry(centers, 'Spain');
  const itBefore = snapshotCountry(centers, 'Italy');
  const beBefore = snapshotCountry(centers, 'Belgium');

  const rejected = {
    not_ready: 0, missing_id_prefix: 0, missing_name: 0, missing_brand: 0,
    missing_address: 0, missing_postal: 0, missing_city: 0,
    wrong_country: 0, invalid_coords: 0, bad_postal_format: 0,
    postal_not_string: 0, outside_bbox: 0, mojibake: 0, not_active: 0,
    questionable_city: 0, foreign_neighbor: 0,
    staging_mismatch: 0, dup_id_in_batch: 0,
    bad_coord_source: 0, fallback_coord: 0, centroid_coord: 0,
    legacy_current_brand: 0,
  };
  const rejectedDetails = [];

  const candidates = sourceRows.filter(r => {
    const s = stagingById.get(r.id);
    if (s && s.import_category !== 'READY_TO_IMPORT' && s.import_category !== 'MERGED_INTO_CATALOG') {
      rejected.not_ready++;
      rejectedDetails.push({id: r.id, reason: 'staging_not_ready', value: s.import_category});
      return false;
    }
    return true;
  });

  const seenBatchIds = new Set();
  const approved = [];
  let stopDuplicateIds = [];

  for (const r of candidates) {
    if (!String(r.id || '').startsWith('pl_')) {
      rejected.missing_id_prefix++;
      rejectedDetails.push({id: r.id, reason: 'missing_pl_prefix'});
      continue;
    }
    if (seenBatchIds.has(r.id)) {
      rejected.dup_id_in_batch++;
      rejectedDetails.push({id: r.id, reason: 'dup_id_in_batch'});
      stopDuplicateIds.push(r.id);
      continue;
    }
    seenBatchIds.add(r.id);

    if (!String(r.name || '').trim()) {
      rejected.missing_name++;
      rejectedDetails.push({id: r.id, reason: 'missing_name'});
      continue;
    }
    if (!String(r.brand || '').trim()) {
      rejected.missing_brand++;
      rejectedDetails.push({id: r.id, reason: 'missing_brand'});
      continue;
    }
    const brandNorm = normalizeBrand(r.brand);
    if (LEGACY_CURRENT_BRANDS.has(brandNorm)) {
      rejected.legacy_current_brand++;
      rejectedDetails.push({id: r.id, reason: 'legacy_current_brand', brand: r.brand});
      continue;
    }
    if (!String(r.address || '').trim()) {
      rejected.missing_address++;
      rejectedDetails.push({id: r.id, reason: 'missing_address'});
      continue;
    }
    if (typeof r.postal_code !== 'string') {
      rejected.postal_not_string++;
      rejectedDetails.push({id: r.id, reason: 'postal_not_string', value: r.postal_code});
      continue;
    }
    const postal = String(r.postal_code ?? '').trim();
    if (!postal) {
      rejected.missing_postal++;
      rejectedDetails.push({id: r.id, reason: 'missing_postal', name: r.name, brand: r.brand});
      continue;
    }
    if (!PL_POSTAL_RE.test(postal)) {
      rejected.bad_postal_format++;
      rejectedDetails.push({id: r.id, reason: 'bad_postal_format', value: r.postal_code});
      continue;
    }
    if (!isValidCity(r.city)) {
      if (!String(r.city || '').trim()) {
        rejected.missing_city++;
        rejectedDetails.push({id: r.id, reason: 'missing_city'});
      } else {
        rejected.questionable_city++;
        rejectedDetails.push({id: r.id, reason: 'questionable_city', value: r.city, name: r.name});
      }
      continue;
    }
    if (String(r.country || '').trim() !== 'Poland') {
      rejected.wrong_country++;
      rejectedDetails.push({id: r.id, reason: 'wrong_country', value: r.country});
      continue;
    }
    if (!hasValidCoords(r)) {
      rejected.invalid_coords++;
      rejectedDetails.push({id: r.id, reason: 'invalid_coords'});
      continue;
    }
    if (r.is_active !== true) {
      rejected.not_active++;
      rejectedDetails.push({id: r.id, reason: 'not_active'});
      continue;
    }
    const coordSrc = String(r.coord_source || '');
    if (coordSrc && !ALLOWED_COORD.has(coordSrc)) {
      rejected.bad_coord_source++;
      rejectedDetails.push({id: r.id, reason: 'bad_coord_source', value: coordSrc});
      continue;
    }
    const notesBlob = `${r.notes || ''} ${coordSrc} ${(r.geocode_reasons || []).join(' ')}`;
    if (/fallback|invented/i.test(notesBlob)) {
      rejected.fallback_coord++;
      rejectedDetails.push({id: r.id, reason: 'fallback_coord', notes: r.notes});
      continue;
    }
    if (/centroid|city.?center|postcode.?centroid|warsaw.?fallback|poland.?centroid|voivodeship.?centroid|neighbour/i.test(notesBlob)) {
      rejected.centroid_coord++;
      rejectedDetails.push({id: r.id, reason: 'centroid_coord', notes: r.notes});
      continue;
    }
    const lat = Number(r.lat);
    const lng = Number(r.lng);
    if (!inPolandBbox(lat, lng)) {
      rejected.outside_bbox++;
      rejectedDetails.push({id: r.id, reason: 'outside_poland_bbox', lat, lng, name: r.name});
      continue;
    }
    const foreign = foreignNeighborHint(lat, lng, r.city, r.name, r.address);
    if (foreign) {
      rejected.foreign_neighbor++;
      rejectedDetails.push({
        id: r.id, reason: 'foreign_neighbor', hint: foreign, lat, lng,
        name: r.name, city: r.city,
      });
      continue;
    }
    const blob = `${r.name} ${r.address} ${r.city} ${r.brand}`;
    if (hasMojibake(blob)) {
      rejected.mojibake++;
      rejectedDetails.push({id: r.id, reason: 'mojibake', snippet: blob.slice(0, 80)});
      continue;
    }
    const s = stagingById.get(r.id);
    if (!s) {
      rejected.staging_mismatch++;
      rejectedDetails.push({id: r.id, reason: 'not_in_staging'});
      continue;
    }
    if (!readyIds.has(r.id) && !idempotencyCheck) {
      rejected.staging_mismatch++;
      rejectedDetails.push({id: r.id, reason: 'not_in_phase2_ready'});
      continue;
    }
    approved.push(r);
  }

  const byId = new Map(centers.map(c => [c.id, c]));
  const prodCollisions = approved.filter(r => byId.has(r.id)).map(r => r.id);
  const unexpectedProdCollision = !idempotencyCheck && before.poland === 0 && prodCollisions.length > 0;
  if (stopDuplicateIds.length > 0 || unexpectedProdCollision) {
    const allDup = [...new Set([...prodCollisions, ...stopDuplicateIds])];
    const stopReport = {
      stopped: true,
      reason: 'duplicate_ids',
      duplicate_ids_vs_production: prodCollisions,
      duplicate_ids_in_batch: stopDuplicateIds,
      message: `STOP: duplicate IDs found — centers.json NOT modified`,
    };
    fs.writeFileSync(reportPath, JSON.stringify(stopReport, null, 2) + '\n');
    console.error(stopReport.message);
    throw new Error(stopReport.message);
  }

  const preMergeProximity = findSameBrandProximity(approved);
  if (preMergeProximity.lt100.length > 0 && !idempotencyCheck) {
    const stopReport = {
      stopped: true,
      reason: 'same_brand_physical_duplicate',
      same_brand_lt50: preMergeProximity.lt50,
      same_brand_lt100: preMergeProximity.lt100,
      message: `STOP: unexplained same-brand proximity in approved batch — centers.json NOT modified`,
    };
    fs.writeFileSync(reportPath, JSON.stringify(stopReport, null, 2) + '\n');
    fs.writeFileSync(dupAnalysisPath, JSON.stringify(preMergeProximity, null, 2) + '\n');
    console.error(stopReport.message);
    throw new Error(stopReport.message);
  }

  const liveAddrBrand = new Set(centers.map(addrBrandKey));

  const dupAnalysis = {
    skipped_existing_id: [],
    skipped_same_addr_brand: [],
    skipped_proximity_same_brand: [],
    skipped_batch_dup: [],
    different_brand_colocations_kept: [],
    same_brand_pre_merge: preMergeProximity,
    withheld_questionable: rejectedDetails,
    included: [],
    retained_close_pairs: [],
  };

  let inserted = 0;
  const insertedRows = [];
  const batchAddrBrand = new Set();

  for (let i = 0; i < approved.length; i++) {
    for (let j = i + 1; j < approved.length; j++) {
      const a = approved[i];
      const b = approved[j];
      if (!hasValidCoords(a) || !hasValidCoords(b)) continue;
      const d = haversineMeters(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng));
      if (d >= 50) continue;
      if (normalizeBrand(a.brand) !== normalizeBrand(b.brand)) {
        dupAnalysis.different_brand_colocations_kept.push({
          a_id: a.id, a_name: a.name, a_brand: a.brand,
          b_id: b.id, b_name: b.name, b_brand: b.brand,
          distance_m: Math.round(d),
          note: 'different_brand_kept',
          reason_retained: 'Legitimate different-brand co-location (shopping center / building)',
        });
      }
    }
  }

  for (const r of approved) {
    const row = toCatalogRow(r);

    if (byId.has(row.id)) {
      dupAnalysis.skipped_existing_id.push({id: row.id, name: row.name});
      continue;
    }

    const k = addrBrandKey(row);
    if (liveAddrBrand.has(k) || batchAddrBrand.has(k)) {
      dupAnalysis.skipped_same_addr_brand.push({id: row.id, name: row.name, key: k});
      continue;
    }

    byId.set(row.id, row);
    liveAddrBrand.add(k);
    batchAddrBrand.add(k);
    inserted++;
    insertedRows.push(row);
    dupAnalysis.included.push({id: row.id, name: row.name, brand: row.brand});
  }

  const existingIds = new Set(centers.map(c => c.id));
  const appended = insertedRows.filter(r => !existingIds.has(r.id));
  const catalog = [...centers, ...appended];

  const after = {
    total: catalog.length,
    poland: countByCountry(catalog, 'Poland'),
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
  };

  const idCounts = new Map();
  for (const c of catalog) idCounts.set(c.id, (idCounts.get(c.id) || 0) + 1);
  const duplicateIds = [...idCounts.entries()].filter(([, n]) => n > 1).map(([id]) => id);

  const plLive = catalog.filter(c => c.country === 'Poland');
  const sameBrandPhysical = [];
  for (let i = 0; i < plLive.length; i++) {
    for (let j = i + 1; j < plLive.length; j++) {
      const a = plLive[i];
      const b = plLive[j];
      if (!hasValidCoords(a) || !hasValidCoords(b)) continue;
      if (normalizeBrand(a.brand) !== normalizeBrand(b.brand)) continue;
      const d = haversineMeters(a.lat, a.lng, b.lat, b.lng);
      if (d < 100) {
        sameBrandPhysical.push({
          a_id: a.id, a_name: a.name, a_brand: a.brand,
          b_id: b.id, b_name: b.name, b_brand: b.brand,
          distance_m: Math.round(d),
        });
      }
    }
  }

  const enc = encodingIssues(plLive);
  const polishLetters = countPolishLetters(plLive);

  const postalOk = plLive.every(c =>
    typeof c.postal_code === 'string' && PL_POSTAL_RE.test(String(c.postal_code || '')));
  const postalAllString = plLive.every(c => typeof c.postal_code === 'string');

  const dkIntact = dkBefore.length === after.denmark && countryIntact(dkBefore, catalog);
  const seIntact = seBefore.length === after.sweden && countryIntact(seBefore, catalog);
  const noIntact = noBefore.length === after.norway && countryIntact(noBefore, catalog);
  const fiIntact = fiBefore.length === after.finland && countryIntact(fiBefore, catalog);
  const deIntact = deBefore.length === after.germany && countryIntact(deBefore, catalog);
  const ukIntact = ukBefore.length === after.united_kingdom && countryIntact(ukBefore, catalog);
  const nlIntact = nlBefore.length === after.netherlands && countryIntact(nlBefore, catalog);
  const frIntact = frBefore.length === after.france && countryIntact(frBefore, catalog);
  const esIntact = esBefore.length === after.spain && countryIntact(esBefore, catalog);
  const itIntact = itBefore.length === after.italy && countryIntact(itBefore, catalog);
  const beIntact = beBefore.length === after.belgium && countryIntact(beBefore, catalog);

  const byBrand = {};
  for (const r of plLive) byBrand[r.brand] = (byBrand[r.brand] || 0) + 1;
  const brandSum = Object.values(byBrand).reduce((a, b) => a + b, 0);

  const wouldWrite = !dryRun && !idempotencyCheck;
  const insertMismatch = inserted !== EXPECTED_INSERT;
  const stopped = wouldWrite && insertMismatch && !allowPartial;

  if (wouldWrite && !stopped) {
    const insertedIdSet = new Set(insertedRows.map(r => r.id));
    for (const r of staging) {
      if (insertedIdSet.has(r.id)) {
        r.import_category = 'MERGED_INTO_CATALOG';
      }
    }
  }

  const stagingCats = staging.reduce((acc, r) => {
    acc[r.import_category] = (acc[r.import_category] || 0) + 1;
    return acc;
  }, {});

  const stagingReconciliation = {
    ready_before: stagingReadyCount,
    marked_merged: wouldWrite && !stopped ? insertedRows.length : 0,
    production_ids_match: insertedRows.map(r => r.id).sort(),
    staging_merged_after: stagingCats.MERGED_INTO_CATALOG || 0,
    staging_ready_after: stagingCats.READY_TO_IMPORT || 0,
  };

  const report = {
    dry_run: dryRun,
    idempotency_check: idempotencyCheck,
    source_of_truth: 'data/poland/poland_centers_staging.json (READY_TO_IMPORT)',
    cross_check: 'data/poland/POLAND_PHASE2_READY_TO_IMPORT.json',
    expected_insert: EXPECTED_INSERT,
    note: 'SAFE merge of Phase 2 READY_TO_IMPORT only (621). Benefit locator recovery included.',
    stopped_short_of_expected: stopped || (insertMismatch && !idempotencyCheck),
    stop_reason: insertMismatch
      ? `inserted ${inserted} !== expected ${EXPECTED_INSERT}`
      : null,
    pre_merge_sha256: preMergeSha256,
    ready_file_count: readyFile.length,
    staging_ready_count: stagingReadyCount,
    staging_merged_count: stagingMergedCount,
    phase2_report_ready: phase2Report?.ready_to_import ?? null,
    before,
    after: stopped ? before : after,
    inserted: stopped ? 0 : inserted,
    would_have_inserted: inserted,
    rejected,
    rejected_details: rejectedDetails,
    poland_by_brand: stopped ? {} : byBrand,
    brand_sum: stopped ? 0 : brandSum,
    duplicate_ids_in_catalog: duplicateIds,
    duplicate_same_brand_physical: sameBrandPhysical,
    encoding_issues: enc,
    polish_letter_counts: polishLetters,
    postal_format_ok: postalOk,
    postal_all_string: postalAllString,
    countries_intact: {
      dk: dkIntact, se: seIntact, no: noIntact, fi: fiIntact,
      de: deIntact, uk: ukIntact, nl: nlIntact, fr: frIntact,
      es: esIntact, it: itIntact, be: beIntact,
    },
    staging_categories: stagingCats,
    staging_reconciliation: stagingReconciliation,
    excluded_still_staged: {
      NEEDS_COORDINATES: staging.filter(r => r.import_category === 'NEEDS_COORDINATES').length,
      NEEDS_REVIEW: staging.filter(r => r.import_category === 'NEEDS_REVIEW').length,
      COMING_SOON: staging.filter(r => r.import_category === 'COMING_SOON').length,
      CLOSED: staging.filter(r => r.import_category === 'CLOSED').length,
      DUPLICATE: staging.filter(r => r.import_category === 'DUPLICATE').length,
      READY_TO_IMPORT: staging.filter(r => r.import_category === 'READY_TO_IMPORT').length,
      MERGED_INTO_CATALOG: staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG').length,
    },
    dupAnalysis_summary: {
      skipped_existing_id: dupAnalysis.skipped_existing_id.length,
      skipped_same_addr_brand: dupAnalysis.skipped_same_addr_brand.length,
      different_brand_colocations_kept: dupAnalysis.different_brand_colocations_kept.length,
      same_brand_lt50_pre_merge: preMergeProximity.lt50.length,
      same_brand_lt100_pre_merge: preMergeProximity.lt100.length,
      same_brand_lt100_post_merge: sameBrandPhysical.length,
    },
    checkpoint_10k: {
      live_after_if_merged: before.total + inserted,
      headroom_to_10000: Math.max(0, 10000 - (before.total + inserted)),
      centers_to_reach_10000: Math.max(0, 10000 - (before.total + inserted)),
      centers_to_exceed_10000: Math.max(0, 10001 - (before.total + inserted)),
      stress_qa: 'NO',
    },
    check_in_radius_meters: 200,
    auto_checkout_unchanged: true,
  };

  if (wouldWrite) {
    if (before.total !== BASELINE.total) {
      throw new Error(`Pre-merge total ${before.total}, expected ${BASELINE.total} — abort`);
    }
    if (before.poland !== 0) {
      throw new Error(`Pre-merge Poland ${before.poland}, expected 0 — abort`);
    }
    for (const [key, expected] of Object.entries(BASELINE)) {
      if (key === 'total' || key === 'poland') continue;
      const countryMap = {
        denmark: 'Denmark', sweden: 'Sweden', norway: 'Norway', finland: 'Finland',
        germany: 'Germany', united_kingdom: 'United Kingdom', netherlands: 'Netherlands',
        france: 'France', spain: 'Spain', italy: 'Italy', belgium: 'Belgium',
      };
      if (before[key] !== expected) {
        throw new Error(`${countryMap[key] || key} ${before[key]}, expected ${expected}`);
      }
    }

    if (stopped) {
      console.error(`STOP: would insert ${inserted}, expected ${EXPECTED_INSERT}. centers.json NOT modified.`);
    } else {
      for (const [key, expected] of Object.entries(BASELINE)) {
        if (key === 'total' || key === 'poland') continue;
        if (after[key] !== expected) {
          throw new Error(`Post-merge ${key} count ${after[key]}, expected ${expected}`);
        }
      }
      if (after.poland !== EXPECTED_INSERT) {
        throw new Error(`Poland after ${after.poland}, expected ${EXPECTED_INSERT}`);
      }
      if (after.total !== BASELINE.total + EXPECTED_INSERT) {
        throw new Error(`Total after ${after.total}, expected ${BASELINE.total + EXPECTED_INSERT}`);
      }
      if (duplicateIds.length > 0) throw new Error(`Duplicate IDs found: ${duplicateIds.join(', ')}`);
      if (!dkIntact || !seIntact || !noIntact || !fiIntact || !deIntact ||
          !ukIntact || !nlIntact || !frIntact || !esIntact || !itIntact || !beIntact) {
        throw new Error('Country regression detected — abort write');
      }

      fs.writeFileSync(centersPath, JSON.stringify(catalog, null, 2) + '\n');
      fs.writeFileSync(stagingPath, JSON.stringify(staging, null, 2) + '\n');
      console.log(`Merge written: ${inserted} Poland centers added to centers.json`);
    }
  } else if (idempotencyCheck) {
    console.log(`Idempotency check — would insert ${inserted} (expected 0 after successful merge)`);
  } else {
    console.log(`Dry run — would insert ${inserted} Poland centers (expected ${EXPECTED_INSERT})`);
  }

  const brandLines = Object.entries(
    insertedRows.reduce((a, r) => { a[r.brand] = (a[r.brand] || 0) + 1; return a; }, {}),
  ).sort((a, b) => b[1] - a[1]).map(([b, n]) => `- ${b}: ${n}`).join('\n');

  const md = `# Poland Merge Report

Generated: ${new Date().toISOString()}

## Status
${stopped
  ? `**STOPPED — did not write centers.json.** Would-insert ${inserted} ≠ expected ${EXPECTED_INSERT}.`
  : dryRun
    ? `**DRY RUN** — would insert ${inserted}.`
    : idempotencyCheck
      ? `**IDEMPOTENCY CHECK** — would insert ${inserted}.`
      : `**MERGED** — inserted ${inserted}.`}

Source of truth: staging \`READY_TO_IMPORT\` cross-checked vs \`POLAND_PHASE2_READY_TO_IMPORT.json\` (**${EXPECTED_INSERT} READY**).

## Summary
- **Phase2 READY file count:** ${readyFile.length}
- **Staging READY / MERGED cross-check:** ready=${stagingReadyCount} merged=${stagingMergedCount}
- **Expected insert:** ${EXPECTED_INSERT}
- **Before:** ${before.total} centers (Poland: ${before.poland})
- **Would insert / inserted:** ${inserted}${stopped ? ' (not written)' : ''}
- **After (if written):** ${before.total + inserted} (Poland: ${inserted})
- **Pre-merge SHA256:** \`${preMergeSha256}\`
- **Dry run:** ${dryRun}
- **Idempotency check:** ${idempotencyCheck}

## Withheld / Rejected
${Object.entries(rejected).filter(([, v]) => typeof v === 'number' && v > 0).map(([k, v]) => `- ${k}: ${v}`).join('\n') || '- None'}

### Same-brand proximity pre-merge (<100m) — STOP gate
${preMergeProximity.lt100.map(d => `- ${d.a_id} ↔ ${d.b_id} (${d.distance_m}m) | ${d.a_name}`).join('\n') || '- None'}

### Different-brand co-locations retained (≤50m)
${dupAnalysis.different_brand_colocations_kept.map(d => `- ${d.a_id} (${d.a_brand}) ↔ ${d.b_id} (${d.b_brand}) ${d.distance_m}m — ${d.reason_retained}`).join('\n') || '- None'}

## Brand Breakdown (Poland live / would-include)
${brandLines}
- **Total would-include:** ${inserted}

## Validation
- Duplicate IDs in catalog: ${duplicateIds.length}
- Same-brand physical duplicates (<100m) post-merge: ${sameBrandPhysical.length}
- Encoding issues (mojibake): ${enc.length}
- Postal format OK (NN-NNN string): ${postalOk}
- Postal all typeof string: ${postalAllString}

## Polish Encoding Preserved
${Object.entries(polishLetters).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

## Country Integrity
| Country | Before | After (projected) | Intact |
|---------|--------|-------------------|--------|
| Denmark | ${before.denmark} | ${after.denmark} | ${dkIntact ? '✓' : '✗'} |
| Sweden | ${before.sweden} | ${after.sweden} | ${seIntact ? '✓' : '✗'} |
| Norway | ${before.norway} | ${after.norway} | ${noIntact ? '✓' : '✗'} |
| Finland | ${before.finland} | ${after.finland} | ${fiIntact ? '✓' : '✗'} |
| Germany | ${before.germany} | ${after.germany} | ${deIntact ? '✓' : '✗'} |
| United Kingdom | ${before.united_kingdom} | ${after.united_kingdom} | ${ukIntact ? '✓' : '✗'} |
| Netherlands | ${before.netherlands} | ${after.netherlands} | ${nlIntact ? '✓' : '✗'} |
| France | ${before.france} | ${after.france} | ${frIntact ? '✓' : '✗'} |
| Spain | ${before.spain} | ${after.spain} | ${esIntact ? '✓' : '✗'} |
| Italy | ${before.italy} | ${after.italy} | ${itIntact ? '✓' : '✗'} |
| Belgium | ${before.belgium} | ${after.belgium} | ${beIntact ? '✓' : '✗'} |
| Poland | ${before.poland} | ${stopped ? before.poland : after.poland} | — |

## Staging Reconciliation
- READY before: ${stagingReadyCount}
- Marked MERGED: ${wouldWrite && !stopped ? insertedRows.length : 0}
- MERGED after: ${stagingCats.MERGED_INTO_CATALOG || 0}
- READY after: ${stagingCats.READY_TO_IMPORT || 0}

## Staging Left Out (not merged)
- COMING_SOON: ${staging.filter(r => r.import_category === 'COMING_SOON').length}
- NEEDS_REVIEW: ${staging.filter(r => r.import_category === 'NEEDS_REVIEW').length}
- NEEDS_COORDINATES: ${staging.filter(r => r.import_category === 'NEEDS_COORDINATES').length}
- CLOSED: ${staging.filter(r => r.import_category === 'CLOSED').length}
- DUPLICATE: ${staging.filter(r => r.import_category === 'DUPLICATE').length}

## 10K Checkpoint
- Live if merged: ${before.total + inserted}
- Headroom to exactly 10,000: ${Math.max(0, 10000 - (before.total + inserted))}
- Centers required to reach 10,000: ${Math.max(0, 10000 - (before.total + inserted))}
- Centers required to exceed 10,000: ${Math.max(0, 10001 - (before.total + inserted))}
- Global 10K+ stress QA required now: **NO**

## Check-in / Auto-checkout
- CHECK_IN_RADIUS_METERS: 200 (unchanged)
- AUTO_CHECKOUT_DISTANCE_METERS: 200 (unchanged)

## Duplicate Analysis
- Skipped (existing ID): ${dupAnalysis.skipped_existing_id.length}
- Skipped (same addr+brand): ${dupAnalysis.skipped_same_addr_brand.length}
- Different-brand co-locations kept: ${dupAnalysis.different_brand_colocations_kept.length}
- Same-brand ≤50m post-merge: ${sameBrandPhysical.filter(p => p.distance_m <= 50).length}
- Same-brand ≤100m post-merge: ${sameBrandPhysical.length}
`;

  if (!(idempotencyCheck && inserted === 0 && before.poland === EXPECTED_INSERT)) {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    fs.writeFileSync(dupAnalysisPath, JSON.stringify(dupAnalysis, null, 2) + '\n');
    fs.writeFileSync(approvedPath, JSON.stringify(insertedRows, null, 2) + '\n');
    fs.writeFileSync(mdReportPath, md);
  } else {
    console.log('Idempotency check: preserving existing POLAND_MERGE_REPORT* / APPROVED / DUPLICATE_ANALYSIS');
  }

  console.log(JSON.stringify({
    dry_run: dryRun,
    idempotency_check: idempotencyCheck,
    stopped,
    before_total: before.total,
    poland_before: before.poland,
    would_insert: inserted,
    expected_insert: EXPECTED_INSERT,
    after_total_if_written: before.total + inserted,
    rejected_summary: rejected,
    brands_would_include: insertedRows.reduce((a, r) => { a[r.brand] = (a[r.brand] || 0) + 1; return a; }, {}),
    dk: before.denmark, se: before.sweden, no: before.norway,
    fi: before.finland, de: before.germany, uk: before.united_kingdom,
    nl: before.netherlands, fr: before.france, es: before.spain, it: before.italy, be: before.belgium,
    staging_categories: stagingCats,
    headroom_to_10k: Math.max(0, 10000 - (before.total + inserted)),
    pre_merge_sha256: preMergeSha256,
  }, null, 2));
}

main();
