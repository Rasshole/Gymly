/**
 * Italy completeness production merge (Phase 3+4 READY only).
 *
 * Canonical source ONLY:
 *   data/italy/ITALY_COMPLETENESS_READY_TO_IMPORT.json (38)
 *
 * HARD RULES:
 * - Append-only — never modify existing 550 Italian production IDs
 * - Do NOT separately merge Phase 3/4 lists
 * - Never invent/repair coords — withhold genuine neighbour/soft-wrong pins
 * - CAP must remain 5-char STRING (leading zeros preserved)
 * - Same-brand <50/100m inspect vs self and vs live IT
 * - Preserve Phase 1–4 staging research rows
 *
 * Usage:
 *   node scripts/import-italy-completeness-merge.mjs --dry-run
 *   node scripts/import-italy-completeness-merge.mjs
 *   node scripts/import-italy-completeness-merge.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const readyPath = path.join(root, 'data/italy/ITALY_COMPLETENESS_READY_TO_IMPORT.json');
const stagingPath = path.join(root, 'data/italy/italy_centers_staging.json');
const reportDir = path.join(root, 'data/italy');
const reportPath = path.join(reportDir, 'ITALY_COMPLETENESS_MERGE_REPORT.json');
const mdReportPath = path.join(reportDir, 'ITALY_COMPLETENESS_MERGE_REPORT.md');
const dupAnalysisPath = path.join(reportDir, 'ITALY_COMPLETENESS_MERGE_DUPLICATE_ANALYSIS.json');
const approvedPath = path.join(reportDir, 'ITALY_COMPLETENESS_APPROVED_FOR_MERGE.json');
const phase3ReviewPath = path.join(reportDir, 'ITALY_PHASE3_GEOCODE_REVIEW.json');
const phase4ReviewPath = path.join(reportDir, 'ITALY_PHASE4_GEOCODE_REVIEW.json');

const dryRun = process.argv.includes('--dry-run');
const idempotencyCheck = process.argv.includes('--idempotency-check');

const READY_COUNT = 38;
const EXPECTED_TOTAL_BEFORE = 9056;
const EXPECTED_ITALY_BEFORE = 550;
const IT_POSTAL_RE = /^\d{5}$/;
const MOJIBAKE_RE = /Ã.|�|â€/;
const ALLOWED_COORD = new Set([
  'OFFICIAL_COORDINATE',
  'STRICT_ADDRESS_GEOCODE',
  'NAMED_GYM_POI',
  'OFFICIAL_MAP_PIN',
]);
const BLOCKED_CATEGORY = /^(COMING_SOON|CLOSED|NEEDS_COORDINATES|NEEDS_REVIEW|DUPLICATE)$/i;

const IT_MAINLAND = {latMin: 36.6, latMax: 47.15, lngMin: 6.6, lngMax: 18.6};
const IT_SICILY = {latMin: 36.6, latMax: 38.35, lngMin: 12.0, lngMax: 15.7};
const IT_SARDINIA = {latMin: 38.8, latMax: 41.35, lngMin: 8.1, lngMax: 9.9};
const NORTH_LAT = 44.0;
const SOUTH_LAT = 41.0;

const FOREIGN_BOXES = [
  {code: 'SM', name: 'San Marino', latMin: 43.89, latMax: 43.99, lngMin: 12.41, lngMax: 12.52},
  {code: 'VA', name: 'Vatican', latMin: 41.900, latMax: 41.908, lngMin: 12.445, lngMax: 12.461},
  {code: 'MT', name: 'Malta', latMin: 35.7, latMax: 36.2, lngMin: 14.1, lngMax: 14.7},
];

/** Known Milano suburb mis-geocodes (wrong comune / CAP 200xx for city CAP 201xx). */
const NEIGHBOUR_COMUNE_RE =
  /\b(pessano\s+con\s+bornago|peschiera\s+borromeo|cascina\s+pariana|cernusco\s+sul\s+naviglio|segrate|vimodrone|gessate|melzo|liscate)\b/i;

const BASELINE = {
  total: EXPECTED_TOTAL_BEFORE,
  italy: EXPECTED_ITALY_BEFORE,
  denmark: 354,
  sweden: 639,
  norway: 535,
  finland: 429,
  germany: 1424,
  united_kingdom: 1474,
  netherlands: 600,
  france: 1712,
  spain: 976,
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
  if (/\brepubblica\s+di\s+san\s*marino\b/.test(blob) ||
      (/^\s*san\s*marino\s*$/i.test(cityL) && !/torino|rimini|pesaro|cattolica/i.test(blob))) {
    return 'SM_name';
  }
  if (/\bcitt[aà]\s+del\s+vaticano\b|\bvatican\s+city\b/.test(blob)) return 'VA_name';
  if (/\b(republic\s+of\s+)?malta\b/.test(blob) && !/via\s+malta|viale\s+malta|corso\s+malta/i.test(blob)) {
    return 'MT_name';
  }
  if (/\b(switzerland|suisse|schweiz)\b/.test(blob)) return 'CH_name';
  if (/\bsvizzera\b/.test(blob) && !/(corso|via|viale|piazza|piazzale|lungo)\s+svizzera/i.test(blob)) {
    return 'CH_name';
  }
  if (/\b(österreich|oesterreich)\b/.test(blob)) return 'AT_name';
  if (/\baustria\b/.test(blob) && !/(via|viale|corso|piazza)\s+austria/i.test(blob)) return 'AT_name';
  if (/\b(slovenia|slovenija)\b/.test(blob) && !/(via|viale|corso)\s+sloven/i.test(blob)) return 'SI_name';
  if (/\b(croatia|hrvatska)\b/.test(blob) && !/(via|viale|corso)\s+croaz/i.test(blob)) return 'HR_name';
  if (/\bcroazia\b/.test(blob) && !/(via|viale|corso)\s+croazia/i.test(blob)) return 'HR_name';
  if (lat >= 43.6 && lat <= 44.2 && lng >= 6.6 && lng < 7.35) return 'FR_geo';
  if (lat > 46.55 && lng >= 8.4 && lng <= 9.5) return 'CH_geo';
  if (lat > 47.0 && lng >= 10.5 && lng <= 13.0) return 'AT_geo';
  if (lat >= 45.4 && lat <= 46.6 && lng > 13.8 && lng <= 14.6) return 'SI_geo';
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

function loadGeocodeBestById() {
  const map = new Map();
  for (const p of [phase3ReviewPath, phase4ReviewPath]) {
    if (!fs.existsSync(p)) continue;
    const arr = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!Array.isArray(arr)) continue;
    for (const row of arr) {
      if (row?.id && row.best) map.set(row.id, String(row.best));
    }
  }
  return map;
}

/**
 * Withhold Milano city clubs whose geocode landed in a different comune
 * (CAP 200xx suburb vs declared 201xx city), or notes flag postal_soft + suburb.
 */
function neighbourGeocodeReason(r, geocodeBest) {
  const city = String(r.city || '').trim().toLowerCase();
  const postal = String(r.postal_code || '').trim();
  const notes = String(r.notes || '');
  const best = geocodeBest.get(r.id) || '';

  if (city === 'milano' && /^201\d{2}$/.test(postal) && best) {
    if (NEIGHBOUR_COMUNE_RE.test(best)) {
      return {
        reason: 'neighbour_suburb_geocode',
        best: best.slice(0, 140),
        note: 'OSM best match is outside Comune di Milano',
      };
    }
    const m = best.match(/\b(20\d{3})\b/);
    if (m && /^200\d{2}$/.test(m[1]) && m[1] !== postal && /postal_soft/i.test(notes)) {
      return {
        reason: 'neighbour_postal_mismatch',
        geocode_postal: m[1],
        declared_postal: postal,
        best: best.slice(0, 140),
      };
    }
  }

  if (/fallback|centroid|invented|city.?center/i.test(notes)) {
    return {reason: 'fallback_or_centroid_notes', notes: notes.slice(0, 120)};
  }
  return null;
}

function main() {
  let centers = JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const readyFile = JSON.parse(fs.readFileSync(readyPath, 'utf8'));
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8'));
  const geocodeBest = loadGeocodeBestById();

  if (!Array.isArray(readyFile) || readyFile.length !== READY_COUNT) {
    throw new Error(
      `ITALY_COMPLETENESS_READY_TO_IMPORT.json count ${readyFile?.length}, expected ${READY_COUNT} — STOP BEFORE WRITE`,
    );
  }

  // Pre-compute neighbour withholds from ready file (used for repair of a prior force-38 merge).
  const neighbourWithholdIds = new Set();
  for (const r of readyFile) {
    const n = neighbourGeocodeReason(r, geocodeBest);
    if (n) neighbourWithholdIds.add(r.id);
  }

  /**
   * If a prior run forced neighbour pins into production, strip ONLY those
   * completeness ready IDs (never touch the original 550 IT set).
   */
  const repairRemoved = [];
  if (neighbourWithholdIds.size > 0) {
    const beforeRepair = centers.length;
    centers = centers.filter(c => {
      if (!neighbourWithholdIds.has(c.id)) return true;
      repairRemoved.push({id: c.id, name: c.name, lat: c.lat, lng: c.lng});
      return false;
    });
    if (repairRemoved.length) {
      console.log(
        `Repair: removed ${repairRemoved.length} neighbour-geocode completeness IDs ` +
        `(${beforeRepair} → ${centers.length})`,
      );
    }
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
    belgium: countByCountry(centers, 'Belgium'),
  };

  // Accept pristine baseline (9056/550) OR post-repair state after stripping neighbour pins
  // from a prior incomplete force-merge (9094 − N).
  const otherOk = Object.entries(BASELINE).every(([k, v]) => {
    if (k === 'total' || k === 'italy') return true;
    return before[k] === v;
  });
  if (!otherOk) {
    throw new Error(`Non-Italy country baseline mismatch — STOP: ${JSON.stringify(before)}`);
  }

  const readyIds = new Set(readyFile.map(r => r.id));
  const alreadySafeInCatalog = centers.filter(
    c => readyIds.has(c.id) && !neighbourWithholdIds.has(c.id),
  ).length;
  const pristineBaseline = before.total === BASELINE.total && before.italy === BASELINE.italy;
  const repairedBaseline =
    repairRemoved.length > 0 &&
    before.total === BASELINE.total + alreadySafeInCatalog &&
    before.italy === BASELINE.italy + alreadySafeInCatalog;
  const postMergeBaseline =
    before.total === BASELINE.total + alreadySafeInCatalog &&
    before.italy === BASELINE.italy + alreadySafeInCatalog &&
    alreadySafeInCatalog > 0;

  if (!pristineBaseline && !repairedBaseline && !postMergeBaseline) {
    throw new Error(
      `Unexpected baseline total=${before.total} italy=${before.italy} ` +
      `(expected ${BASELINE.total}/${BASELINE.italy} or post-safe-merge) — STOP`,
    );
  }

  const dkBefore = snapshotCountry(centers, 'Denmark');
  const seBefore = snapshotCountry(centers, 'Sweden');
  const noBefore = snapshotCountry(centers, 'Norway');
  const fiBefore = snapshotCountry(centers, 'Finland');
  const deBefore = snapshotCountry(centers, 'Germany');
  const ukBefore = snapshotCountry(centers, 'United Kingdom');
  const nlBefore = snapshotCountry(centers, 'Netherlands');
  const frBefore = snapshotCountry(centers, 'France');
  const esBefore = snapshotCountry(centers, 'Spain');
  const beBefore = snapshotCountry(centers, 'Belgium');
  const itBefore = snapshotCountry(centers, 'Italy');

  const rejected = {
    not_ready: 0, missing_id_prefix: 0, missing_name: 0, missing_brand: 0,
    missing_address: 0, missing_postal: 0, missing_city: 0,
    wrong_country: 0, invalid_coords: 0, bad_postal_format: 0,
    postal_not_string: 0, outside_bbox: 0, mojibake: 0, not_active: 0,
    questionable_city: 0, foreign_neighbor: 0,
    dup_id_in_batch: 0, bad_coord_source: 0, fallback_coord: 0,
    blocked_category: 0, neighbour_geocode: 0,
  };
  const rejectedDetails = [];
  const seenBatchIds = new Set();
  const approved = [];

  for (const r of readyFile) {
    if (BLOCKED_CATEGORY.test(String(r.import_category || ''))) {
      rejected.blocked_category++;
      rejectedDetails.push({id: r.id, reason: 'blocked_category', value: r.import_category});
      continue;
    }
    if (String(r.import_category || '') !== 'READY_TO_IMPORT' &&
        String(r.import_category || '') !== 'MERGED_INTO_CATALOG') {
      rejected.not_ready++;
      rejectedDetails.push({id: r.id, reason: 'not_ready', value: r.import_category});
      continue;
    }
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
    if (!coordSrc || !ALLOWED_COORD.has(coordSrc)) {
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

    const neighbour = neighbourGeocodeReason(r, geocodeBest);
    if (neighbour) {
      rejected.neighbour_geocode++;
      rejectedDetails.push({id: r.id, name: r.name, ...neighbour});
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
    approved.push(r);
  }

  const byId = new Map(centers.map(c => [c.id, c]));
  const liveIt = centers.filter(c => c.country === 'Italy');
  const liveAddrBrand = new Set(centers.map(addrBrandKey));

  const dupAnalysis = {
    skipped_existing_id: [],
    skipped_same_addr_brand: [],
    skipped_proximity_same_brand: [],
    skipped_batch_dup: [],
    inspected_proximity_lt50: [],
    inspected_proximity_lt100: [],
    different_brand_colocations_kept: [],
    withheld_neighbour_geocode: rejectedDetails.filter(d =>
      d.reason === 'neighbour_suburb_geocode' || d.reason === 'neighbour_postal_mismatch'),
    withheld_questionable: rejectedDetails.filter(d =>
      ['missing_postal', 'questionable_city', 'foreign_neighbor', 'outside_italy_bbox',
        'fallback_coord', 'neighbour_suburb_geocode', 'neighbour_postal_mismatch'].includes(d.reason)),
    included: [],
  };

  let inserted = 0;
  const insertedRows = [];
  const batchAddrBrand = new Set();

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

  // Inspect same-brand <50 / <100 within batch (record; <100 still withheld)
  for (let i = 0; i < approved.length; i++) {
    for (let j = i + 1; j < approved.length; j++) {
      const a = approved[i], b = approved[j];
      if (normalizeBrand(a.brand) !== normalizeBrand(b.brand)) continue;
      const d = haversineMeters(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng));
      if (d < 50) {
        dupAnalysis.inspected_proximity_lt50.push({
          a_id: a.id, a_name: a.name, b_id: b.id, b_name: b.name, distance_m: Math.round(d), scope: 'batch',
        });
      } else if (d < 100) {
        dupAnalysis.inspected_proximity_lt100.push({
          a_id: a.id, a_name: a.name, b_id: b.id, b_name: b.name, distance_m: Math.round(d), scope: 'batch',
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
      if (d < 50) {
        dupAnalysis.inspected_proximity_lt50.push({
          id: row.id, name: row.name, match_id: live.id, match_name: live.name,
          distance_m: Math.round(d), scope: 'vs_live_or_batch',
        });
      }
      if (d < 100) {
        dupAnalysis.inspected_proximity_lt100.push({
          id: row.id, name: row.name, match_id: live.id, match_name: live.name,
          distance_m: Math.round(d), scope: 'vs_live_or_batch',
        });
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
    dupAnalysis.included.push({id: row.id, name: row.name, brand: row.brand, city: row.city});
  }

  const existingIds = new Set(centers.map(c => c.id));
  const appended = insertedRows.filter(r => !existingIds.has(r.id));
  // Preserve existing 550 IT IDs byte-for-byte (append-only)
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
    belgium: countByCountry(catalog, 'Belgium'),
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
  const geographySource = insertedRows.length
    ? insertedRows
    : catalog.filter(c => readyIds.has(c.id) && !neighbourWithholdIds.has(c.id));
  const italianLetters = countItalianLetters(geographySource);

  const geography = {north: 0, central: 0, south: 0, sicily: 0, sardinia: 0, outlier: 0};
  const geoOutliers = [];
  for (const c of geographySource) {
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

  const postalLeadingZero = geographySource.filter(c => String(c.postal_code).startsWith('0')).length;
  const postalOk = geographySource.every(c =>
    typeof c.postal_code === 'string' && IT_POSTAL_RE.test(String(c.postal_code || '')));
  const postalAllString = geographySource.every(c => typeof c.postal_code === 'string');

  const dkIntact = dkBefore.length === after.denmark && countryIntact(dkBefore, catalog);
  const seIntact = seBefore.length === after.sweden && countryIntact(seBefore, catalog);
  const noIntact = noBefore.length === after.norway && countryIntact(noBefore, catalog);
  const fiIntact = fiBefore.length === after.finland && countryIntact(fiBefore, catalog);
  const deIntact = deBefore.length === after.germany && countryIntact(deBefore, catalog);
  const ukIntact = ukBefore.length === after.united_kingdom && countryIntact(ukBefore, catalog);
  const nlIntact = nlBefore.length === after.netherlands && countryIntact(nlBefore, catalog);
  const frIntact = frBefore.length === after.france && countryIntact(frBefore, catalog);
  const esIntact = esBefore.length === after.spain && countryIntact(esBefore, catalog);
  const beIntact = beBefore.length === after.belgium && countryIntact(beBefore, catalog);
  const priorItIntact = countryIntact(itBefore, catalog);

  const byBrand = {};
  for (const r of insertedRows) byBrand[r.brand] = (byBrand[r.brand] || 0) + 1;
  const brandSum = Object.values(byBrand).reduce((a, b) => a + b, 0);

  const safeTarget = READY_COUNT - neighbourWithholdIds.size;
  const completenessInCatalogAfter =
    centers.filter(c => readyIds.has(c.id) && !neighbourWithholdIds.has(c.id)).length + inserted;
  const genuinePartial =
    neighbourWithholdIds.size > 0 &&
    rejected.neighbour_geocode === neighbourWithholdIds.size &&
    dupAnalysis.skipped_proximity_same_brand.length === 0 &&
    dupAnalysis.skipped_same_addr_brand.length === 0 &&
    Object.entries(rejected).every(([k, v]) => k === 'neighbour_geocode' || v === 0);

  const wouldWrite = !dryRun && !idempotencyCheck;
  const insertMismatch = completenessInCatalogAfter !== READY_COUNT;
  const needsRepairWrite = repairRemoved.length > 0;
  const needsAppendWrite = inserted > 0;
  const needsStagingSync =
    completenessInCatalogAfter === safeTarget &&
    staging.filter(r => readyIds.has(r.id) && r.import_category === 'MERGED_INTO_CATALOG').length < safeTarget;
  const integrityUncertain = !genuinePartial && insertMismatch && inserted > 0;
  const stopped = wouldWrite && integrityUncertain;
  const shouldWrite =
    wouldWrite && !stopped && (needsRepairWrite || needsAppendWrite || needsStagingSync);

  const mergedIdSet = new Set([
    ...insertedRows.map(r => r.id),
    ...centers.filter(c => readyIds.has(c.id) && !neighbourWithholdIds.has(c.id)).map(c => c.id),
  ]);

  if (shouldWrite) {
    const stagingById = new Map(staging.map(r => [r.id, r]));
    for (const row of readyFile) {
      if (!mergedIdSet.has(row.id)) continue;
      const existing = stagingById.get(row.id);
      if (existing) {
        existing.import_category = 'MERGED_INTO_CATALOG';
        existing.lat = row.lat;
        existing.lng = row.lng;
        existing.coord_source = row.coord_source;
        existing.notes = row.notes;
        existing.verification_status = row.verification_status || existing.verification_status;
      } else {
        staging.push({
          ...row,
          import_category: 'MERGED_INTO_CATALOG',
        });
      }
    }
    for (const r of staging) {
      if (neighbourWithholdIds.has(r.id) && r.import_category === 'MERGED_INTO_CATALOG') {
        r.import_category = 'NEEDS_COORDINATES';
        const tag = 'completeness_merge_withheld_neighbour_geocode';
        if (!String(r.notes || '').includes(tag)) {
          r.notes = `${r.notes || ''}; ${tag}`.replace(/^; /, '');
        }
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
    source_of_truth: 'data/italy/ITALY_COMPLETENESS_READY_TO_IMPORT.json',
    ready_file_count: readyFile.length,
    expected_insert_if_all_pass: READY_COUNT,
    projected_if_all_38: {total: 9094, italy: 588},
    actual_safe_target: {
      total: BASELINE.total + safeTarget,
      italy: BASELINE.italy + safeTarget,
      safe_count: safeTarget,
    },
    note: 'SAFE append of completeness READY only. Existing 550 IT IDs untouched. Neighbour/wrong-comune geocodes withheld (no invent/repair of coords).',
    repair_removed_neighbour_from_catalog: repairRemoved,
    already_safe_in_catalog: alreadySafeInCatalog,
    stopped_short_of_expected: insertMismatch && !idempotencyCheck,
    genuine_partial_ok: genuinePartial,
    stop_reason: stopped
      ? 'integrity uncertain — centers.json NOT modified'
      : (insertMismatch
        ? `safe completeness in catalog ${completenessInCatalogAfter} of ${READY_COUNT}; genuine neighbour withholds = ${neighbourWithholdIds.size} (not forced to 38)`
        : null),
    pre_merge_sha256: preMergeSha256,
    before: {
      ...before,
      total_on_disk_before_repair: before.total + repairRemoved.length,
      italy_on_disk_before_repair: before.italy + repairRemoved.length,
    },
    after: shouldWrite ? after : before,
    inserted: shouldWrite ? inserted : 0,
    would_have_inserted: inserted,
    effective_completeness_in_catalog: completenessInCatalogAfter,
    withheld: neighbourWithholdIds.size,
    rejected,
    rejected_details: rejectedDetails,
    italy_inserted_by_brand: stopped ? {} : byBrand,
    brand_sum: stopped ? 0 : brandSum,
    duplicate_ids_in_catalog: duplicateIds,
    duplicate_same_brand_physical_post_merge: sameBrandPhysical,
    encoding_issues: enc,
    italian_letter_counts_inserted: italianLetters,
    geography_inserted: stopped ? null : geography,
    geography_outliers: geoOutliers,
    postal_format_ok: postalOk,
    postal_all_string: postalAllString,
    postal_leading_zero_count: postalLeadingZero,
    prior_550_italy_intact: priorItIntact,
    countries_intact: {
      dk: dkIntact, se: seIntact, no: noIntact, fi: fiIntact,
      de: deIntact, uk: ukIntact, nl: nlIntact, fr: frIntact,
      es: esIntact, be: beIntact,
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
      inspected_proximity_lt50: dupAnalysis.inspected_proximity_lt50.length,
      inspected_proximity_lt100: dupAnalysis.inspected_proximity_lt100.length,
      different_brand_colocations_kept: dupAnalysis.different_brand_colocations_kept.length,
      withheld_neighbour_geocode: dupAnalysis.withheld_neighbour_geocode.length,
      would_include: dupAnalysis.included.length,
    },
    checkpoint_10k: {
      live_after_if_merged: shouldWrite ? after.total : before.total + repairRemoved.length,
      headroom_to_10k: Math.max(
        0,
        10000 - (shouldWrite ? after.total : before.total + repairRemoved.length),
      ),
      stress_qa: 'NO',
    },
    check_in_radius_meters: 200,
    auto_checkout_unchanged: true,
  };

  if (wouldWrite) {
    if (stopped || !shouldWrite) {
      if (stopped) {
        console.error(`STOP: integrity uncertain (would=${inserted}). centers.json NOT modified.`);
      } else {
        console.log(`No write needed (inserted=${inserted}, repair=${repairRemoved.length}, staging sync=${needsStagingSync}).`);
      }
    } else {
      // Original 550 must remain; after = baseline + safe completeness count
      if (after.italy !== BASELINE.italy + completenessInCatalogAfter) {
        throw new Error(
          `Italy after ${after.italy}, expected ${BASELINE.italy + completenessInCatalogAfter}`,
        );
      }
      if (after.total !== BASELINE.total + completenessInCatalogAfter) {
        throw new Error(
          `Total after ${after.total}, expected ${BASELINE.total + completenessInCatalogAfter}`,
        );
      }
      if (!dkIntact || !seIntact || !noIntact || !fiIntact || !deIntact ||
          !ukIntact || !nlIntact || !frIntact || !esIntact || !beIntact) {
        throw new Error('Country regression detected — abort write');
      }
      if (after.denmark !== BASELINE.denmark) throw new Error(`Denmark ${after.denmark}`);
      if (after.sweden !== BASELINE.sweden) throw new Error(`Sweden ${after.sweden}`);
      if (after.norway !== BASELINE.norway) throw new Error(`Norway ${after.norway}`);
      if (after.finland !== BASELINE.finland) throw new Error(`Finland ${after.finland}`);
      if (after.germany !== BASELINE.germany) throw new Error(`Germany ${after.germany}`);
      if (after.united_kingdom !== BASELINE.united_kingdom) throw new Error(`UK ${after.united_kingdom}`);
      if (after.netherlands !== BASELINE.netherlands) throw new Error(`NL ${after.netherlands}`);
      if (after.france !== BASELINE.france) throw new Error(`France ${after.france}`);
      if (after.spain !== BASELINE.spain) throw new Error(`Spain ${after.spain}`);
      if (after.belgium !== BASELINE.belgium) throw new Error(`Belgium ${after.belgium}`);
      if (duplicateIds.length > 0) throw new Error(`Duplicate IDs: ${duplicateIds.join(', ')}`);
      // Ensure no neighbour withhold IDs remain in catalog
      for (const id of neighbourWithholdIds) {
        if (catalog.some(c => c.id === id)) {
          throw new Error(`Neighbour withhold ${id} still in catalog — abort`);
        }
      }

      fs.writeFileSync(centersPath, JSON.stringify(catalog, null, 2) + '\n');
      fs.writeFileSync(stagingPath, JSON.stringify(staging, null, 2) + '\n');
      console.log(
        `Merge written: +${inserted} new, repair-removed ${repairRemoved.length}, ` +
        `completeness in catalog ${completenessInCatalogAfter}/${READY_COUNT} ` +
        `(${neighbourWithholdIds.size} neighbour withheld).`,
      );
    }
  } else if (idempotencyCheck) {
    console.log(`Idempotency check — would insert ${inserted} (expected 0 after successful merge)`);
  } else {
    console.log(
      `Dry run — would insert ${inserted} of ${READY_COUNT} ` +
      `(neighbour withheld ${neighbourWithholdIds.size}, already safe ${alreadySafeInCatalog}, repair ${repairRemoved.length})`,
    );
  }

  // Approved = newly inserted, or existing safe completeness rows when repairing/syncing
  const approvedForFile = insertedRows.length
    ? insertedRows
    : catalog.filter(c => readyIds.has(c.id) && !neighbourWithholdIds.has(c.id));

  const approvedBrand = {};
  for (const r of approvedForFile) approvedBrand[r.brand] = (approvedBrand[r.brand] || 0) + 1;
  const brandLines = Object.entries(approvedBrand)
    .sort((a, b) => b[1] - a[1])
    .map(([b, n]) => `- ${b}: ${n}`)
    .join('\n');

  const withheldLines = rejectedDetails.map(d =>
    `- ${d.id} | ${d.name || ''} | ${d.reason}${d.best ? ` | ${d.best}` : ''}`,
  ).join('\n') || '- None';

  const statusLine = stopped
    ? `**STOPPED — did not write centers.json.** Would-insert ${inserted}; integrity uncertain.`
    : dryRun
      ? `**DRY RUN** — would insert ${inserted} of ${READY_COUNT}.`
      : idempotencyCheck
        ? `**IDEMPOTENCY CHECK** — would insert ${inserted}.`
        : shouldWrite
          ? `**MERGED** — completeness in catalog ${completenessInCatalogAfter} of ${READY_COUNT} (withheld ${neighbourWithholdIds.size} neighbour geocodes; +${inserted} new this run; repair-removed ${repairRemoved.length}).`
          : `**NO-OP** — already at safe state.`;

  const md = `# Italy Completeness Merge Report

Generated: ${new Date().toISOString()}

## Status
${statusLine}

Source of truth: \`ITALY_COMPLETENESS_READY_TO_IMPORT.json\` (**${READY_COUNT} READY**). Phase 3/4 lists not merged separately.

## Summary
- **Ready file count:** ${readyFile.length}
- **Expected if all pass:** ${READY_COUNT} → catalog 9094 / Italy 588
- **Actual safe count:** ${completenessInCatalogAfter} → catalog ${BASELINE.total + completenessInCatalogAfter} / Italy ${BASELINE.italy + completenessInCatalogAfter}
- **Neighbour withheld:** ${neighbourWithholdIds.size}
- **Repair removed from prior force-merge:** ${repairRemoved.length}
- **New inserts this run:** ${inserted}
- **Disk before repair:** ${before.total + repairRemoved.length} (Italy: ${before.italy + repairRemoved.length})
- **After (if written):** ${shouldWrite ? after.total : before.total} (Italy: ${shouldWrite ? after.italy : before.italy})
- **Pre-merge SHA256:** \`${preMergeSha256}\`
- **Prior Italy rows intact this run:** ${priorItIntact ? 'YES' : 'NO'}
- **Genuine partial OK:** ${genuinePartial}
- **Dry run:** ${dryRun}
- **Idempotency check:** ${idempotencyCheck}

## Withheld / Rejected
${Object.entries(rejected).filter(([, v]) => typeof v === 'number' && v > 0).map(([k, v]) => `- ${k}: ${v}`).join('\n') || '- None'}

### Details
${withheldLines}

### Same-brand proximity <100m withheld
${dupAnalysis.skipped_proximity_same_brand.map(d => `- ${d.id} ↔ ${d.match_id} (${d.distance_m}m) | ${d.name}`).join('\n') || '- None'}

### Inspected same-brand <50m
${dupAnalysis.inspected_proximity_lt50.map(d => `- ${d.id || d.a_id} ↔ ${d.match_id || d.b_id} (${d.distance_m}m)`).join('\n') || '- None'}

### Different-brand co-locations kept
${dupAnalysis.different_brand_colocations_kept.map(d => `- ${d.a_id} (${d.a_brand}) ↔ ${d.b_id} (${d.b_brand}) ${d.distance_m}m`).join('\n') || '- None'}

## Brand Breakdown (approved / in catalog)
${brandLines || '- None'}
- **Total approved:** ${approvedForFile.length}

## Validation
- Duplicate IDs in catalog: ${duplicateIds.length}
- Same-brand physical duplicates (<100m) post-merge IT: ${sameBrandPhysical.length}
- Encoding issues (mojibake): ${enc.length}
- CAP format OK (5-char string): ${postalOk}
- CAP all typeof string: ${postalAllString}
- Leading-zero CAP count (inserted): ${postalLeadingZero}

## Geography (inserted)
${Object.entries(geography).map(([k, v]) => `- ${k}: ${v}`).join('\n')}
- Outliers: ${geoOutliers.length}

## Italian Encoding Preserved (inserted)
${Object.entries(italianLetters).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

## Country Integrity
| Country | Before | After | Intact |
|---------|--------|-------|--------|
| Denmark | ${before.denmark} | ${after.denmark} | ${dkIntact ? '✓' : '✗'} |
| Sweden | ${before.sweden} | ${after.sweden} | ${seIntact ? '✓' : '✗'} |
| Norway | ${before.norway} | ${after.norway} | ${noIntact ? '✓' : '✗'} |
| Finland | ${before.finland} | ${after.finland} | ${fiIntact ? '✓' : '✗'} |
| Germany | ${before.germany} | ${after.germany} | ${deIntact ? '✓' : '✗'} |
| United Kingdom | ${before.united_kingdom} | ${after.united_kingdom} | ${ukIntact ? '✓' : '✗'} |
| Netherlands | ${before.netherlands} | ${after.netherlands} | ${nlIntact ? '✓' : '✗'} |
| France | ${before.france} | ${after.france} | ${frIntact ? '✓' : '✗'} |
| Spain | ${before.spain} | ${after.spain} | ${esIntact ? '✓' : '✗'} |
| Belgium | ${before.belgium} | ${after.belgium} | ${beIntact ? '✓' : '✗'} |
| Italy | ${before.italy} | ${stopped ? before.italy : after.italy} | prior 550 ${priorItIntact ? '✓' : '✗'} |

## Staging Categories
${Object.entries(stagingCats).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

## Staging Left Out (research preserved)
- COMING_SOON: ${staging.filter(r => r.import_category === 'COMING_SOON').length}
- NEEDS_REVIEW: ${staging.filter(r => r.import_category === 'NEEDS_REVIEW').length}
- NEEDS_COORDINATES: ${staging.filter(r => r.import_category === 'NEEDS_COORDINATES').length}
- CLOSED: ${staging.filter(r => r.import_category === 'CLOSED').length}
- DUPLICATE: ${staging.filter(r => r.import_category === 'DUPLICATE').length}

## 10K Checkpoint
- Live if merged: ${shouldWrite ? after.total : before.total + repairRemoved.length}
- Headroom to 10k: ${Math.max(0, 10000 - (shouldWrite ? after.total : before.total + repairRemoved.length))}
- Stress QA: NO

## Check-in / Auto-checkout
- CHECK_IN_RADIUS_METERS: 200 (unchanged)
- AUTO_CHECKOUT_DISTANCE_METERS: 200 (unchanged)

## Duplicate Analysis
- Skipped (existing ID): ${dupAnalysis.skipped_existing_id.length}
- Skipped (same addr+brand): ${dupAnalysis.skipped_same_addr_brand.length}
- Skipped (proximity <100m): ${dupAnalysis.skipped_proximity_same_brand.length}
- Neighbour geocode withheld: ${dupAnalysis.withheld_neighbour_geocode.length}
- Different-brand co-locations kept: ${dupAnalysis.different_brand_colocations_kept.length}
`;

  // Write reports unless idempotency-check against an already-correct successful merge report
  const preserveIdempotency =
    idempotencyCheck &&
    inserted === 0 &&
    repairRemoved.length === 0 &&
    completenessInCatalogAfter === safeTarget &&
    fs.existsSync(reportPath) &&
    !JSON.parse(fs.readFileSync(reportPath, 'utf8')).idempotency_check;

  if (!preserveIdempotency) {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    fs.writeFileSync(dupAnalysisPath, JSON.stringify(dupAnalysis, null, 2) + '\n');
    fs.writeFileSync(approvedPath, JSON.stringify(approvedForFile, null, 2) + '\n');
    fs.writeFileSync(mdReportPath, md);
  } else {
    console.log('Idempotency check: preserving existing ITALY_COMPLETENESS_MERGE_* reports');
  }

  console.log(JSON.stringify({
    dry_run: dryRun,
    idempotency_check: idempotencyCheck,
    stopped,
    should_write: shouldWrite,
    genuine_partial_ok: genuinePartial,
    before_total: before.total,
    italy_before: before.italy,
    repair_removed: repairRemoved.length,
    already_safe: alreadySafeInCatalog,
    would_insert: inserted,
    ready_count: READY_COUNT,
    safe_target: safeTarget,
    completeness_in_catalog: completenessInCatalogAfter,
    withheld_neighbour: neighbourWithholdIds.size,
    after_total: shouldWrite ? after.total : before.total,
    italy_after: shouldWrite ? after.italy : before.italy,
    rejected_summary: rejected,
    neighbour_withheld: dupAnalysis.withheld_neighbour_geocode,
    brands_approved: approvedBrand,
    geography,
    countries: {
      dk: before.denmark, se: before.sweden, no: before.norway,
      fi: before.finland, de: before.germany, uk: before.united_kingdom,
      nl: before.netherlands, fr: before.france, es: before.spain, be: before.belgium,
    },
    staging_categories: stagingCats,
    checkpoint_10k: report.checkpoint_10k,
    pre_merge_sha256: preMergeSha256,
  }, null, 2));
}

main();
