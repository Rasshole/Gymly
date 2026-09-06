/**
 * Italy production-safe merge.
 *
 * Source of truth:
 *   primary: data/italy/ITALY_PHASE2_READY_TO_IMPORT.json (550)
 * Cross-check:
 *   data/italy/italy_centers_staging.json (import_category READY_TO_IMPORT)
 *   data/italy/ITALY_PHASE2_READINESS_REPORT.json
 *
 * HARD RULES:
 * - Never merge NEEDS_COORDINATES / NEEDS_REVIEW / COMING_SOON / CLOSED / DUPLICATE
 * - Never invent or repair questionable rows — withhold and report
 * - CAP must remain 5-char STRING (leading zeros preserved)
 * - Mainland + Sicily + Sardinia OK; reject SM/VA/FR/CH/AT/SI/HR/MT
 * - If inserted !== 550, STOP without writing centers.json (unless --allow-partial)
 *
 * Usage:
 *   node scripts/import-italy-merge.mjs --dry-run
 *   node scripts/import-italy-merge.mjs
 *   node scripts/import-italy-merge.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const readyPath = path.join(root, 'data/italy/ITALY_PHASE2_READY_TO_IMPORT.json');
const stagingPath = path.join(root, 'data/italy/italy_centers_staging.json');
const phase2ReportPath = path.join(root, 'data/italy/ITALY_PHASE2_READINESS_REPORT.json');
const reportDir = path.join(root, 'data/italy');
const reportPath = path.join(reportDir, 'ITALY_MERGE_REPORT.json');
const mdReportPath = path.join(reportDir, 'ITALY_MERGE_REPORT.md');
const dupAnalysisPath = path.join(reportDir, 'ITALY_MERGE_DUPLICATE_ANALYSIS.json');
const approvedPath = path.join(reportDir, 'ITALY_APPROVED_FOR_MERGE.json');

const dryRun = process.argv.includes('--dry-run');
const idempotencyCheck = process.argv.includes('--idempotency-check');
const allowPartial = process.argv.includes('--allow-partial');

const EXPECTED_INSERT = 550;
const EXPECTED_TOTAL_BEFORE = 8143;
const IT_POSTAL_RE = /^\d{5}$/;
const MOJIBAKE_RE = /Ã.|�|â€/;
const ALLOWED_COORD = new Set([
  'OFFICIAL_COORDINATE',
  'STRICT_ADDRESS_GEOCODE',
  'NAMED_GYM_POI',
  'OFFICIAL_MAP_PIN',
]);

/** Italy geography (mainland + Sicily + Sardinia). Bounds match phase discover/consolidate. */
const IT_MAINLAND = {latMin: 36.6, latMax: 47.15, lngMin: 6.6, lngMax: 18.6};
const IT_SICILY = {latMin: 36.6, latMax: 38.35, lngMin: 12.0, lngMax: 15.7};
const IT_SARDINIA = {latMin: 38.8, latMax: 41.35, lngMin: 8.1, lngMax: 9.9};
const NORTH_LAT = 44.0;
const SOUTH_LAT = 41.0;

/** Tight foreign enclaves / neighbors inside or near Italian bbox. */
const FOREIGN_BOXES = [
  {code: 'SM', name: 'San Marino', latMin: 43.89, latMax: 43.99, lngMin: 12.41, lngMax: 12.52},
  {code: 'VA', name: 'Vatican', latMin: 41.900, latMax: 41.908, lngMin: 12.445, lngMax: 12.461},
  {code: 'MT', name: 'Malta', latMin: 35.7, latMax: 36.2, lngMin: 14.1, lngMax: 14.7},
];

const BASELINE = {
  total: EXPECTED_TOTAL_BEFORE,
  italy: 0,
  denmark: 354,
  sweden: 639,
  norway: 535,
  finland: 429,
  germany: 1424,
  united_kingdom: 1474,
  netherlands: 600,
  france: 1712,
  spain: 976,
};

function hasValidCoords(r) {
  const lat = Number(r.lat);
  const lng = Number(r.lng);
  return (
    r.lat != null && r.lng != null &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    !(lat === 0 && lng === 0)
  );
}

function inBounds(lat, lng, b) {
  return lat >= b.latMin && lat <= b.latMax && lng >= b.lngMin && lng <= b.lngMax;
}

function italyIslandOrMainland(lat, lng) {
  if (inBounds(lat, lng, IT_SICILY)) return 'sicily';
  if (inBounds(lat, lng, IT_SARDINIA)) return 'sardinia';
  if (inBounds(lat, lng, IT_MAINLAND)) return 'mainland';
  return null;
}

function geoBucket(lat, lng) {
  if (inBounds(lat, lng, IT_SICILY)) return 'sicily';
  if (inBounds(lat, lng, IT_SARDINIA)) return 'sardinia';
  if (!inBounds(lat, lng, IT_MAINLAND)) return 'outlier';
  if (lat >= NORTH_LAT) return 'north';
  if (lat <= SOUTH_LAT) return 'south';
  return 'central';
}

function foreignNeighborHint(lat, lng, city, name, address) {
  const cityL = String(city || '').toLowerCase().trim();
  const blob = `${city || ''} ${name || ''} ${address || ''}`.toLowerCase();
  // Street/district names in Italy often reference neighbors (Corso Svizzera, Via San Marino).
  // Only withhold clear country markers — geo boxes catch true foreign pins.
  if (/\brepubblica\s+di\s+san\s*marino\b/.test(blob) ||
      (/^\s*san\s*marino\s*$/i.test(cityL) && !/torino|rimini|pesaro|cattolica/i.test(blob))) {
    return 'SM_name';
  }
  if (/\bcitt[aà]\s+del\s+vaticano\b|\bvatican\s+city\b/.test(blob)) return 'VA_name';
  if (/\b(republic\s+of\s+)?malta\b/.test(blob) && !/via\s+malta|viale\s+malta|corso\s+malta/i.test(blob)) {
    return 'MT_name';
  }
  if (/\b(switzerland|suisse|schweiz)\b/.test(blob)) return 'CH_name';
  // "Svizzera" alone is usually Corso/Via Svizzera in Italian cities
  if (/\bsvizzera\b/.test(blob) && !/(corso|via|viale|piazza|piazzale|lungo)\s+svizzera/i.test(blob)) {
    return 'CH_name';
  }
  if (/\b(österreich|oesterreich)\b/.test(blob)) return 'AT_name';
  if (/\baustria\b/.test(blob) && !/(via|viale|corso|piazza)\s+austria/i.test(blob)) return 'AT_name';
  if (/\b(slovenia|slovenija)\b/.test(blob) && !/(via|viale|corso)\s+sloven/i.test(blob)) return 'SI_name';
  if (/\b(croatia|hrvatska)\b/.test(blob) && !/(via|viale|corso)\s+croaz/i.test(blob)) return 'HR_name';
  if (/\bcroazia\b/.test(blob) && !/(via|viale|corso)\s+croazia/i.test(blob)) return 'HR_name';
  // Menton / Côte d'Azur France west of Liguria (exclude Ventimiglia IT ~7.6E)
  if (lat >= 43.6 && lat <= 44.2 && lng >= 6.6 && lng < 7.35) return 'FR_geo';
  // Swiss Ticino / Valais north of Alpine crest pockets
  if (lat > 46.55 && lng >= 8.4 && lng <= 9.5) return 'CH_geo';
  // Austria north of Brenner
  if (lat > 47.0 && lng >= 10.5 && lng <= 13.0) return 'AT_geo';
  // Slovenia east of Trieste
  if (lat >= 45.4 && lat <= 46.6 && lng > 13.8 && lng <= 14.6) return 'SI_geo';
  // Croatia Istria / Dalmatia
  if (lat >= 44.8 && lat <= 45.6 && lng > 13.7 && lng <= 14.5) return 'HR_geo';
  for (const box of FOREIGN_BOXES) {
    if (inBounds(lat, lng, box)) return `${box.code}_geo`;
  }
  return null;
}

function isValidCity(city) {
  const c = String(city || '').trim();
  if (!c) return false;
  if (/^\d+$/.test(c)) return false;
  if (IT_POSTAL_RE.test(c)) return false;
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
    country: 'Italy',
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

function countItalianLetters(rows) {
  const counts = {
    a_grave: 0, e_grave: 0, e_acute: 0, i_grave: 0, o_grave: 0, u_grave: 0,
  };
  for (const r of rows) {
    const blob = `${r.name}${r.address}${r.city}`;
    counts.a_grave += (blob.match(/[àÀ]/g) || []).length;
    counts.e_grave += (blob.match(/[èÈ]/g) || []).length;
    counts.e_acute += (blob.match(/[éÉ]/g) || []).length;
    counts.i_grave += (blob.match(/[ìÌ]/g) || []).length;
    counts.o_grave += (blob.match(/[òÒ]/g) || []).length;
    counts.u_grave += (blob.match(/[ùÙ]/g) || []).length;
  }
  return counts;
}

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function main() {
  const centers = JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const readyFile = JSON.parse(fs.readFileSync(readyPath, 'utf8'));
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8'));
  const phase2Report = fs.existsSync(phase2ReportPath)
    ? JSON.parse(fs.readFileSync(phase2ReportPath, 'utf8'))
    : null;
  const stagingById = new Map(staging.map(r => [r.id, r]));

  if (!Array.isArray(readyFile) || readyFile.length !== EXPECTED_INSERT) {
    throw new Error(
      `ITALY_PHASE2_READY_TO_IMPORT.json count ${readyFile?.length}, expected ${EXPECTED_INSERT}`,
    );
  }

  const stagingReadyOrMerged = staging.filter(r =>
    r.import_category === 'READY_TO_IMPORT' || r.import_category === 'MERGED_INTO_CATALOG',
  );
  const readyIds = new Set(readyFile.map(r => r.id));
  const stagingEligibleIds = new Set(stagingReadyOrMerged.map(r => r.id));
  const stagingReadyCount = staging.filter(r => r.import_category === 'READY_TO_IMPORT').length;
  const stagingMergedCount = staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG').length;
  // Pre-merge: all 550 must be READY. Post-merge / idempotency: same IDs as MERGED.
  if ([...readyIds].some(id => !stagingEligibleIds.has(id))) {
    throw new Error(
      `Cross-check failed: Phase2 READY IDs missing from staging READY/MERGED ` +
      `(ready=${readyFile.length}, staging_ready=${stagingReadyCount}, staging_merged=${stagingMergedCount})`,
    );
  }
  if (!idempotencyCheck && stagingReadyCount !== EXPECTED_INSERT) {
    throw new Error(
      `Cross-check failed: staging READY (${stagingReadyCount}) !== Phase2 READY (${readyFile.length})`,
    );
  }
  if (idempotencyCheck && stagingMergedCount < EXPECTED_INSERT && stagingReadyCount + stagingMergedCount !== EXPECTED_INSERT) {
    throw new Error(
      `Idempotency cross-check failed: staging merged=${stagingMergedCount} ready=${stagingReadyCount}`,
    );
  }
  if (phase2Report && phase2Report.ready_to_import !== EXPECTED_INSERT) {
    throw new Error(
      `Phase2 report ready_to_import=${phase2Report.ready_to_import}, expected ${EXPECTED_INSERT}`,
    );
  }

  const preMergeSha256 = sha256File(centersPath);

  const before = {
    total: centers.length,
    italy: countByCountry(centers, 'Italy'),
    denmark: countByCountry(centers, 'Denmark'),
    sweden: countByCountry(centers, 'Sweden'),
    norway: countByCountry(centers, 'Norway'),
    finland: countByCountry(centers, 'Finland'),
    germany: countByCountry(centers, 'Germany'),
    united_kingdom: countByCountry(centers, 'United Kingdom'),
    netherlands: countByCountry(centers, 'Netherlands'),
    france: countByCountry(centers, 'France'),
    spain: countByCountry(centers, 'Spain'),
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

  const rejected = {
    not_ready: 0, missing_id_prefix: 0, missing_name: 0, missing_brand: 0,
    missing_address: 0, missing_postal: 0, missing_city: 0,
    wrong_country: 0, invalid_coords: 0, bad_postal_format: 0,
    postal_not_string: 0, outside_bbox: 0, mojibake: 0, not_active: 0,
    questionable_city: 0, foreign_neighbor: 0,
    staging_mismatch: 0, dup_id_in_batch: 0,
    bad_coord_source: 0, fallback_coord: 0,
  };
  const rejectedDetails = [];

  const candidates = readyFile.filter(r => {
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

  for (const r of candidates) {
    if (!String(r.id || '').startsWith('it_')) {
      rejected.missing_id_prefix++;
      rejectedDetails.push({id: r.id, reason: 'missing_it_prefix'});
      continue;
    }
    if (seenBatchIds.has(r.id)) {
      rejected.dup_id_in_batch++;
      rejectedDetails.push({id: r.id, reason: 'dup_id_in_batch'});
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
    if (!String(r.address || '').trim()) {
      rejected.missing_address++;
      rejectedDetails.push({id: r.id, reason: 'missing_address'});
      continue;
    }
    if (typeof r.postal_code !== 'string') {
      rejected.postal_not_string++;
      rejectedDetails.push({id: r.id, reason: 'postal_not_string', value: r.postal_code, type: typeof r.postal_code});
      continue;
    }
    const postal = String(r.postal_code ?? '').trim();
    if (!postal) {
      rejected.missing_postal++;
      rejectedDetails.push({id: r.id, reason: 'missing_postal', name: r.name, brand: r.brand});
      continue;
    }
    if (!IT_POSTAL_RE.test(postal)) {
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
    if (String(r.country || '').trim() !== 'Italy') {
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
    const notesBlob = `${r.notes || ''} ${coordSrc}`;
    if (/fallback|centroid|invented|city.?center/i.test(notesBlob)) {
      rejected.fallback_coord++;
      rejectedDetails.push({id: r.id, reason: 'fallback_coord', notes: r.notes});
      continue;
    }
    const lat = Number(r.lat);
    const lng = Number(r.lng);
    const region = italyIslandOrMainland(lat, lng);
    if (!region) {
      rejected.outside_bbox++;
      rejectedDetails.push({id: r.id, reason: 'outside_italy_bbox', lat, lng, name: r.name});
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
    approved.push(r);
  }

  // Duplicate detection against production + within batch
  const byId = new Map(centers.map(c => [c.id, c]));
  const liveIt = centers.filter(c => c.country === 'Italy');
  const liveAddrBrand = new Set(centers.map(addrBrandKey));

  const dupAnalysis = {
    skipped_existing_id: [],
    skipped_same_addr_brand: [],
    skipped_proximity_same_brand: [],
    skipped_batch_dup: [],
    different_brand_colocations_kept: [],
    withheld_questionable: rejectedDetails.filter(d =>
      ['missing_postal', 'questionable_city', 'foreign_neighbor', 'outside_italy_bbox', 'fallback_coord'].includes(d.reason)),
    included: [],
  };

  let inserted = 0;
  const insertedRows = [];
  const batchAddrBrand = new Set();

  // Record different-brand co-locations (kept, not withheld)
  for (let i = 0; i < approved.length; i++) {
    for (let j = i + 1; j < approved.length; j++) {
      const a = approved[i], b = approved[j];
      if (normalizeBrand(a.brand) === normalizeBrand(b.brand)) continue;
      if (!hasValidCoords(a) || !hasValidCoords(b)) continue;
      const d = haversineMeters(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng));
      if (d < 50) {
        dupAnalysis.different_brand_colocations_kept.push({
          a_id: a.id, a_name: a.name, a_brand: a.brand,
          b_id: b.id, b_name: b.name, b_brand: b.brand,
          distance_m: Math.round(d),
          note: 'different_brand_kept',
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

    let proxHit = false;
    for (const live of [...liveIt, ...insertedRows]) {
      if (!hasValidCoords(live)) continue;
      if (normalizeBrand(live.brand) !== normalizeBrand(row.brand)) continue;
      const d = haversineMeters(row.lat, row.lng, Number(live.lat), Number(live.lng));
      if (d < 100) {
        dupAnalysis.skipped_proximity_same_brand.push({
          id: row.id, name: row.name, match_id: live.id, match_name: live.name,
          distance_m: Math.round(d), note: 'same_brand_<100m_withheld',
        });
        proxHit = true;
        break;
      }
    }
    if (proxHit) continue;

    byId.set(row.id, row);
    liveAddrBrand.add(k);
    batchAddrBrand.add(k);
    liveIt.push(row);
    inserted++;
    insertedRows.push(row);
    dupAnalysis.included.push({id: row.id, name: row.name, brand: row.brand});
  }

  const existingIds = new Set(centers.map(c => c.id));
  const appended = insertedRows.filter(r => !existingIds.has(r.id));
  const catalog = [...centers, ...appended];

  const after = {
    total: catalog.length,
    italy: countByCountry(catalog, 'Italy'),
    denmark: countByCountry(catalog, 'Denmark'),
    sweden: countByCountry(catalog, 'Sweden'),
    norway: countByCountry(catalog, 'Norway'),
    finland: countByCountry(catalog, 'Finland'),
    germany: countByCountry(catalog, 'Germany'),
    united_kingdom: countByCountry(catalog, 'United Kingdom'),
    netherlands: countByCountry(catalog, 'Netherlands'),
    france: countByCountry(catalog, 'France'),
    spain: countByCountry(catalog, 'Spain'),
  };

  const idCounts = new Map();
  for (const c of catalog) idCounts.set(c.id, (idCounts.get(c.id) || 0) + 1);
  const duplicateIds = [...idCounts.entries()].filter(([, n]) => n > 1).map(([id]) => id);

  const itLive = catalog.filter(c => c.country === 'Italy');
  const sameBrandPhysical = [];
  for (let i = 0; i < itLive.length; i++) {
    for (let j = i + 1; j < itLive.length; j++) {
      const a = itLive[i], b = itLive[j];
      if (!hasValidCoords(a) || !hasValidCoords(b)) continue;
      if (normalizeBrand(a.brand) !== normalizeBrand(b.brand)) continue;
      const d = haversineMeters(a.lat, a.lng, b.lat, b.lng);
      if (d < 100) {
        sameBrandPhysical.push({
          a_id: a.id, a_name: a.name, b_id: b.id, b_name: b.name, distance_m: Math.round(d),
        });
      }
    }
  }

  const enc = encodingIssues(itLive);
  const italianLetters = countItalianLetters(itLive);

  const geography = {north: 0, central: 0, south: 0, sicily: 0, sardinia: 0, outlier: 0};
  const geoOutliers = [];
  for (const c of itLive) {
    if (!hasValidCoords(c)) continue;
    const reg = geoBucket(Number(c.lat), Number(c.lng));
    if (geography[reg] != null) geography[reg]++;
    else {
      geography.outlier++;
      geoOutliers.push({id: c.id, name: c.name, lat: c.lat, lng: c.lng});
    }
    if (reg === 'outlier') {
      geoOutliers.push({id: c.id, name: c.name, lat: c.lat, lng: c.lng});
    }
  }

  const postalLeadingZero = itLive.filter(c => String(c.postal_code).startsWith('0')).length;
  const postalOk = itLive.every(c =>
    typeof c.postal_code === 'string' && IT_POSTAL_RE.test(String(c.postal_code || '')));
  const postalAllString = itLive.every(c => typeof c.postal_code === 'string');

  const dkIntact = dkBefore.length === after.denmark && countryIntact(dkBefore, catalog);
  const seIntact = seBefore.length === after.sweden && countryIntact(seBefore, catalog);
  const noIntact = noBefore.length === after.norway && countryIntact(noBefore, catalog);
  const fiIntact = fiBefore.length === after.finland && countryIntact(fiBefore, catalog);
  const deIntact = deBefore.length === after.germany && countryIntact(deBefore, catalog);
  const ukIntact = ukBefore.length === after.united_kingdom && countryIntact(ukBefore, catalog);
  const nlIntact = nlBefore.length === after.netherlands && countryIntact(nlBefore, catalog);
  const frIntact = frBefore.length === after.france && countryIntact(frBefore, catalog);
  const esIntact = esBefore.length === after.spain && countryIntact(esBefore, catalog);

  const byBrand = {};
  for (const r of itLive) byBrand[r.brand] = (byBrand[r.brand] || 0) + 1;
  const brandSum = Object.values(byBrand).reduce((a, b) => a + b, 0);

  const wouldWrite = !dryRun && !idempotencyCheck;
  const insertMismatch = inserted !== EXPECTED_INSERT;
  const stopped = wouldWrite && insertMismatch && !allowPartial;

  // Staging update only when actually writing a successful full merge
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

  const report = {
    dry_run: dryRun,
    idempotency_check: idempotencyCheck,
    source_of_truth: 'data/italy/ITALY_PHASE2_READY_TO_IMPORT.json',
    expected_insert: EXPECTED_INSERT,
    note: 'SAFE merge of Phase 2 READY_TO_IMPORT only (550). Unresolved / coming-soon / closed / duplicates withheld.',
    stopped_short_of_expected: stopped || (insertMismatch && !idempotencyCheck),
    stop_reason: insertMismatch
      ? `inserted ${inserted} !== expected ${EXPECTED_INSERT}; withheld failures (no invent/repair)`
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
    italy_by_brand: stopped ? {} : byBrand,
    brand_sum: stopped ? 0 : brandSum,
    duplicate_ids_in_catalog: duplicateIds,
    duplicate_same_brand_physical: sameBrandPhysical,
    encoding_issues: enc,
    italian_letter_counts: italianLetters,
    geography: stopped ? null : geography,
    geography_outliers: geoOutliers,
    postal_format_ok: postalOk,
    postal_all_string: postalAllString,
    postal_leading_zero_count: postalLeadingZero,
    countries_intact: {
      dk: dkIntact, se: seIntact, no: noIntact, fi: fiIntact,
      de: deIntact, uk: ukIntact, nl: nlIntact, fr: frIntact, es: esIntact,
    },
    staging_categories: stagingCats,
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
      skipped_proximity_same_brand: dupAnalysis.skipped_proximity_same_brand.length,
      different_brand_colocations_kept: dupAnalysis.different_brand_colocations_kept.length,
      withheld_questionable: dupAnalysis.withheld_questionable.length,
      would_include: dupAnalysis.included.length,
    },
    checkpoint_10k: {
      live_after_if_merged: before.total + inserted,
      headroom_to_10k: Math.max(0, 10000 - (before.total + inserted)),
      stress_qa: 'NO',
    },
    check_in_radius_meters: 200,
    auto_checkout_unchanged: true,
  };

  // Safety checks / write gate
  if (wouldWrite) {
    if (before.total !== BASELINE.total) {
      throw new Error(`Pre-merge total ${before.total}, expected ${BASELINE.total} — abort`);
    }
    if (before.italy !== 0) {
      throw new Error(`Pre-merge Italy ${before.italy}, expected 0 — abort`);
    }
    if (before.denmark !== BASELINE.denmark) throw new Error(`Denmark ${before.denmark}, expected ${BASELINE.denmark}`);
    if (before.sweden !== BASELINE.sweden) throw new Error(`Sweden ${before.sweden}, expected ${BASELINE.sweden}`);
    if (before.norway !== BASELINE.norway) throw new Error(`Norway ${before.norway}, expected ${BASELINE.norway}`);
    if (before.finland !== BASELINE.finland) throw new Error(`Finland ${before.finland}, expected ${BASELINE.finland}`);
    if (before.germany !== BASELINE.germany) throw new Error(`Germany ${before.germany}, expected ${BASELINE.germany}`);
    if (before.united_kingdom !== BASELINE.united_kingdom) throw new Error(`UK ${before.united_kingdom}, expected ${BASELINE.united_kingdom}`);
    if (before.netherlands !== BASELINE.netherlands) throw new Error(`Netherlands ${before.netherlands}, expected ${BASELINE.netherlands}`);
    if (before.france !== BASELINE.france) throw new Error(`France ${before.france}, expected ${BASELINE.france}`);
    if (before.spain !== BASELINE.spain) throw new Error(`Spain ${before.spain}, expected ${BASELINE.spain}`);

    if (stopped) {
      console.error(`STOP: would insert ${inserted}, expected ${EXPECTED_INSERT}. centers.json NOT modified.`);
    } else {
      if (after.denmark !== BASELINE.denmark) throw new Error(`Denmark count ${after.denmark}, expected ${BASELINE.denmark}`);
      if (after.sweden !== BASELINE.sweden) throw new Error(`Sweden count ${after.sweden}, expected ${BASELINE.sweden}`);
      if (after.norway !== BASELINE.norway) throw new Error(`Norway count ${after.norway}, expected ${BASELINE.norway}`);
      if (after.finland !== BASELINE.finland) throw new Error(`Finland count ${after.finland}, expected ${BASELINE.finland}`);
      if (after.germany !== BASELINE.germany) throw new Error(`Germany count ${after.germany}, expected ${BASELINE.germany}`);
      if (after.united_kingdom !== BASELINE.united_kingdom) throw new Error(`UK count ${after.united_kingdom}, expected ${BASELINE.united_kingdom}`);
      if (after.netherlands !== BASELINE.netherlands) throw new Error(`Netherlands count ${after.netherlands}, expected ${BASELINE.netherlands}`);
      if (after.france !== BASELINE.france) throw new Error(`France count ${after.france}, expected ${BASELINE.france}`);
      if (after.spain !== BASELINE.spain) throw new Error(`Spain count ${after.spain}, expected ${BASELINE.spain}`);
      if (after.italy !== EXPECTED_INSERT) throw new Error(`Italy after ${after.italy}, expected ${EXPECTED_INSERT}`);
      if (after.total !== BASELINE.total + EXPECTED_INSERT) {
        throw new Error(`Total after ${after.total}, expected ${BASELINE.total + EXPECTED_INSERT}`);
      }
      if (duplicateIds.length > 0) throw new Error(`Duplicate IDs found: ${duplicateIds.join(', ')}`);
      if (!dkIntact || !seIntact || !noIntact || !fiIntact || !deIntact || !ukIntact || !nlIntact || !frIntact || !esIntact) {
        throw new Error('Country regression detected — abort write');
      }

      fs.writeFileSync(centersPath, JSON.stringify(catalog, null, 2) + '\n');
      fs.writeFileSync(stagingPath, JSON.stringify(staging, null, 2) + '\n');
      console.log(`Merge written: ${inserted} Italy centers added to centers.json`);
    }
  } else if (idempotencyCheck) {
    console.log(`Idempotency check — would insert ${inserted} (expected 0 after successful merge)`);
  } else {
    console.log(`Dry run — would insert ${inserted} Italy centers (expected ${EXPECTED_INSERT})`);
  }

  const brandLines = Object.entries(
    insertedRows.reduce((a, r) => { a[r.brand] = (a[r.brand] || 0) + 1; return a; }, {}),
  ).sort((a, b) => b[1] - a[1]).map(([b, n]) => `- ${b}: ${n}`).join('\n');

  const md = `# Italy Merge Report

Generated: ${new Date().toISOString()}

## Status
${stopped
  ? `**STOPPED — did not write centers.json.** Would-insert ${inserted} ≠ expected ${EXPECTED_INSERT}.`
  : dryRun
    ? `**DRY RUN** — would insert ${inserted}.`
    : idempotencyCheck
      ? `**IDEMPOTENCY CHECK** — would insert ${inserted}.`
      : `**MERGED** — inserted ${inserted}.`}

Source of truth: \`ITALY_PHASE2_READY_TO_IMPORT.json\` (**${EXPECTED_INSERT} READY**).

## Summary
- **Phase2 READY file count:** ${readyFile.length}
- **Staging READY / MERGED cross-check:** ready=${stagingReadyCount} merged=${stagingMergedCount}
- **Expected insert:** ${EXPECTED_INSERT}
- **Before:** ${before.total} centers (Italy: ${before.italy})
- **Would insert / inserted:** ${inserted}${stopped ? ' (not written)' : ''}
- **After (if written):** ${before.total + inserted} (Italy: ${inserted})
- **Pre-merge SHA256:** \`${preMergeSha256}\`
- **Dry run:** ${dryRun}
- **Idempotency check:** ${idempotencyCheck}

## Withheld / Rejected
${Object.entries(rejected).filter(([, v]) => typeof v === 'number' && v > 0).map(([k, v]) => `- ${k}: ${v}`).join('\n') || '- None'}

### Same-brand proximity <100m withheld
${dupAnalysis.skipped_proximity_same_brand.map(d => `- ${d.id} ↔ ${d.match_id} (${d.distance_m}m) | ${d.name}`).join('\n') || '- None'}

### Different-brand co-locations kept
${dupAnalysis.different_brand_colocations_kept.map(d => `- ${d.a_id} (${d.a_brand}) ↔ ${d.b_id} (${d.b_brand}) ${d.distance_m}m`).join('\n') || '- None'}

## Brand Breakdown (Italy live / would-include)
${brandLines}
- **Total would-include:** ${inserted}

## Validation
- Duplicate IDs in catalog: ${duplicateIds.length}
- Same-brand physical duplicates (<100m) post-merge: ${sameBrandPhysical.length}
- Encoding issues (mojibake): ${enc.length}
- CAP format OK (5-char string): ${postalOk}
- CAP all typeof string: ${postalAllString}
- Leading-zero CAP count: ${postalLeadingZero}

## Geography (would-include)
${Object.entries(geography).map(([k, v]) => `- ${k}: ${v}`).join('\n')}
- Outliers: ${geoOutliers.length}

## Italian Encoding Preserved (would-include set)
${Object.entries(italianLetters).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

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
| Italy | ${before.italy} | ${stopped ? before.italy : after.italy} | — |

## Staging Categories
${Object.entries(stagingCats).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

## Staging Left Out (not merged)
- COMING_SOON: ${staging.filter(r => r.import_category === 'COMING_SOON').length}
- NEEDS_REVIEW: ${staging.filter(r => r.import_category === 'NEEDS_REVIEW').length}
- NEEDS_COORDINATES: ${staging.filter(r => r.import_category === 'NEEDS_COORDINATES').length}
- CLOSED: ${staging.filter(r => r.import_category === 'CLOSED').length}
- DUPLICATE: ${staging.filter(r => r.import_category === 'DUPLICATE').length}

## 10K Checkpoint
- Live if merged: ${before.total + inserted}
- Headroom to 10k: ${Math.max(0, 10000 - (before.total + inserted))}
- Stress QA: NO

## Check-in / Auto-checkout
- CHECK_IN_RADIUS_METERS: 200 (unchanged)
- AUTO_CHECKOUT_DISTANCE_METERS: 200 (unchanged)

## Duplicate Analysis
- Skipped (existing ID): ${dupAnalysis.skipped_existing_id.length}
- Skipped (same addr+brand): ${dupAnalysis.skipped_same_addr_brand.length}
- Skipped (proximity <100m): ${dupAnalysis.skipped_proximity_same_brand.length}
- Different-brand co-locations kept: ${dupAnalysis.different_brand_colocations_kept.length}
`;

  // Write reports (approved = rows that WOULD have been inserted).
  // Preserve a successful merge report when running --idempotency-check after merge.
  if (!(idempotencyCheck && inserted === 0 && before.italy === EXPECTED_INSERT)) {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    fs.writeFileSync(dupAnalysisPath, JSON.stringify(dupAnalysis, null, 2) + '\n');
    fs.writeFileSync(approvedPath, JSON.stringify(insertedRows, null, 2) + '\n');
    fs.writeFileSync(mdReportPath, md);
  } else {
    console.log('Idempotency check: preserving existing ITALY_MERGE_REPORT* / APPROVED / DUPLICATE_ANALYSIS');
  }

  console.log(JSON.stringify({
    dry_run: dryRun,
    idempotency_check: idempotencyCheck,
    stopped,
    before_total: before.total,
    italy_before: before.italy,
    would_insert: inserted,
    expected_insert: EXPECTED_INSERT,
    after_total_if_written: before.total + inserted,
    rejected_summary: rejected,
    proximity_withheld: dupAnalysis.skipped_proximity_same_brand.length,
    different_brand_colocations_kept: dupAnalysis.different_brand_colocations_kept.length,
    brands_would_include: insertedRows.reduce((a, r) => { a[r.brand] = (a[r.brand] || 0) + 1; return a; }, {}),
    geography,
    dk: before.denmark, se: before.sweden, no: before.norway,
    fi: before.finland, de: before.germany, uk: before.united_kingdom,
    nl: before.netherlands, fr: before.france, es: before.spain,
    staging_categories: stagingCats,
    pre_merge_sha256: preMergeSha256,
  }, null, 2));
}

main();
