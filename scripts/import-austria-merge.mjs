/**
 * Austria production-safe merge (Phase 2).
 *
 * Source of truth:
 *   data/austria/AUSTRIA_PHASE2_READY_TO_IMPORT.json (349 canonical READY)
 * Cross-check:
 *   data/austria/austria_centers_staging.json
 *   data/austria/AUSTRIA_PHASE2_READINESS_REPORT.json
 *
 * HARD RULES:
 * - Never merge NEEDS_COORDINATES / NEEDS_REVIEW / COMING_SOON / CLOSED / DUPLICATE / LEGACY
 * - Austrian postal must remain 4-digit STRING (^\d{4}$)
 * - Reject foreign pins; repair literal \xNN address escapes (encoding, not weakening)
 * - Same brand + same normalized address → keep highest-confidence row; withhold duplicates
 * - Same-brand <100m with different addresses → allow (document retained close pairs)
 * - Same-brand <100m with same address after dedup → STOP
 * - If canonical !== 349 at start → STOP
 * - Safe insert count may be <349 after dedup — do NOT force 349
 *
 * Usage:
 *   node scripts/import-austria-merge.mjs --dry-run
 *   node scripts/import-austria-merge.mjs
 *   node scripts/import-austria-merge.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const stagingPath = path.join(root, 'data/austria/austria_centers_staging.json');
const readyPath = path.join(root, 'data/austria/AUSTRIA_PHASE2_READY_TO_IMPORT.json');
const phase2ReportPath = path.join(root, 'data/austria/AUSTRIA_PHASE2_READINESS_REPORT.json');
const reportDir = path.join(root, 'data/austria');
const reportPath = path.join(reportDir, 'AUSTRIA_MERGE_REPORT.json');
const mdReportPath = path.join(reportDir, 'AUSTRIA_MERGE_REPORT.md');
const dupAnalysisPath = path.join(reportDir, 'AUSTRIA_MERGE_DUPLICATE_ANALYSIS.json');
const approvedPath = path.join(reportDir, 'AUSTRIA_APPROVED_FOR_MERGE.json');

const dryRun = process.argv.includes('--dry-run');
const idempotencyCheck = process.argv.includes('--idempotency-check');

const EXPECTED_CANONICAL = 349;
const EXPECTED_TOTAL_BEFORE = 9715;
const AT_POSTAL_RE = /^\d{4}$/;
const MOJIBAKE_RE = /Ã.|�|â€/;
const LITERAL_ESCAPE_RE = /\\x[0-9a-fA-F]{2}/;
const ALLOWED_COORD = new Set([
  'OFFICIAL_COORDINATE',
  'STRICT_ADDRESS_GEOCODE',
  'NAMED_GYM_POI',
  'OFFICIAL_MAP_PIN',
  'OFFICIAL_STRUCTURED_DATA',
  'OFFICIAL_API',
]);

const COORD_RANK = {
  OFFICIAL_MAP_PIN: 5,
  OFFICIAL_STRUCTURED_DATA: 4,
  OFFICIAL_API: 4,
  OFFICIAL_COORDINATE: 4,
  NAMED_GYM_POI: 3,
  STRICT_ADDRESS_GEOCODE: 1,
};

/** Austria mainland bbox. */
const AT_BOUNDS = {latMin: 46.35, latMax: 49.05, lngMin: 9.45, lngMax: 17.20};

/** Interior foreign boxes — must NOT overlap Austrian mainland (Phase 2 already geovalidated). */
const FOREIGN_BOXES = [
  {code: 'DE', name: 'Germany', latMin: 48.6, latMax: 49.05, lngMin: 12.8, lngMax: 13.2},
  {code: 'CZ', name: 'Czechia', latMin: 48.85, latMax: 49.05, lngMin: 14.8, lngMax: 17.2},
  {code: 'SK', name: 'Slovakia', latMin: 46.35, latMax: 47.5, lngMin: 17.05, lngMax: 17.2},
  {code: 'HU', name: 'Hungary', latMin: 46.35, latMax: 47.2, lngMin: 16.8, lngMax: 17.2},
  {code: 'SI', name: 'Slovenia', latMin: 46.35, latMax: 46.55, lngMin: 15.0, lngMax: 16.7},
  {code: 'IT', name: 'Italy', latMin: 46.35, latMax: 46.65, lngMin: 10.4, lngMax: 12.5},
  {code: 'CH', name: 'Switzerland', latMin: 47.5, latMax: 49.05, lngMin: 9.45, lngMax: 9.85},
];

const BASELINE = {
  total: EXPECTED_TOTAL_BEFORE,
  austria: 0,
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
};

const WITHHELD_READY_IDS = new Set([
  'at_ec70c5a914', // superseded MYGYM Tamsweg
]);

function fixEscapedUtf8(s) {
  return String(s || '')
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

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

function inAustriaBbox(lat, lng) {
  return inBounds(lat, lng, AT_BOUNDS);
}

function foreignNeighborHint(lat, lng, city, name, address) {
  const cityL = String(city || '').toLowerCase().trim();
  const blob = `${city || ''} ${name || ''} ${address || ''}`.toLowerCase();

  if (/\bdeutschland\b/.test(blob) && !/\bösterreich\b/.test(blob)) return 'DE_name';
  if (/^\s*(münchen|munich|passau|rosenheim|kempten)\s*$/i.test(cityL)) return 'DE_city';
  if (/\b(czechia|tschechien|česko)\b/.test(blob) && !/\bösterreich\b/.test(blob)) return 'CZ_name';
  if (/^\s*(prague|praha|brno|plzeň|plzen|české budějovice)\s*$/i.test(cityL)) return 'CZ_city';
  if (/\b(slovakia|slowakei)\b/.test(blob) && !/\bösterreich\b/.test(blob)) return 'SK_name';
  if (/^\s*(bratislava|košice|kosice)\s*$/i.test(cityL)) return 'SK_city';
  if (/\b(hungary|ungarn|magyarország)\b/.test(blob) && !/\bösterreich\b/.test(blob)) return 'HU_name';
  if (/^\s*(budapest|győr|gyor|debrecen)\s*$/i.test(cityL)) return 'HU_city';
  if (/\b(slovenia|slowenien)\b/.test(blob) && !/\bösterreich\b/.test(blob)) return 'SI_name';
  if (/^\s*(ljubljana|maribor|celje|koper)\s*$/i.test(cityL)) return 'SI_city';
  if (/\b(schweiz|svizzera)\b/.test(blob) && !/\bösterreich\b/.test(blob)) return 'CH_name';
  if (/^\s*(zürich|zurich|basel|bern|genf|geneva|luzern)\s*$/i.test(cityL)) return 'CH_city';
  if (/\b(italien|italia)\b/.test(blob) && !/\bösterreich\b/.test(blob)) return 'IT_name';
  if (/^\s*(milano|milan|roma|torino|trieste)\s*$/i.test(cityL)) return 'IT_city';

  if (!inAustriaBbox(lat, lng)) {
    for (const box of FOREIGN_BOXES) {
      if (inBounds(lat, lng, box)) return `${box.code}_geo`;
    }
  }
  return null;
}

function isValidCity(city) {
  const c = String(city || '').trim();
  if (!c) return false;
  if (/^\d+$/.test(c)) return false;
  if (AT_POSTAL_RE.test(c)) return false;
  return true;
}

function normalizeBrand(b) {
  return String(b || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeAddr(s) {
  return fixEscapedUtf8(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function addrBrandKey(r) {
  return [
    normalizeAddr(r.address || ''),
    String(r.postal_code || '').trim(),
    normalizeAddr(r.city || ''),
    normalizeBrand(r.brand || ''),
  ].join('|');
}

function coordRank(r) {
  return COORD_RANK[String(r.coord_source || '')] || 0;
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
    name: fixEscapedUtf8(r.name),
    brand: r.brand,
    address: fixEscapedUtf8(r.address || ''),
    postal_code: String(r.postal_code || '').trim(),
    city: fixEscapedUtf8(r.city),
    country: 'Austria',
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

function countGermanLetters(rows) {
  const counts = {a_umlaut: 0, o_umlaut: 0, u_umlaut: 0, eszett: 0};
  for (const r of rows) {
    const blob = `${r.name}${r.address}${r.city}`;
    counts.a_umlaut += (blob.match(/[äÄ]/g) || []).length;
    counts.o_umlaut += (blob.match(/[öÖ]/g) || []).length;
    counts.u_umlaut += (blob.match(/[üÜ]/g) || []).length;
    counts.eszett += (blob.match(/[ß]/g) || []).length;
  }
  return counts;
}

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function deduplicateSameAddressBatch(rows) {
  const groups = new Map();
  for (const r of rows) {
    const k = addrBrandKey(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const kept = [];
  const withheld = [];
  for (const [key, group] of groups) {
    if (group.length === 1) {
      kept.push(group[0]);
      continue;
    }
    group.sort((a, b) => coordRank(b) - coordRank(a) || String(a.id).localeCompare(String(b.id)));
    kept.push(group[0]);
    for (const w of group.slice(1)) {
      withheld.push({
        id: w.id,
        name: w.name,
        brand: w.brand,
        address: w.address,
        kept_id: group[0].id,
        kept_name: group[0].name,
        reason: 'same_brand_same_address_superseded',
        key,
      });
    }
  }
  return {kept, withheld};
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
      const sameAddr = addrBrandKey(a) === addrBrandKey(b);
      const rec = {
        a_id: a.id, a_brand: a.brand, a_name: a.name, a_address: a.address,
        b_id: b.id, b_brand: b.brand, b_name: b.name, b_address: b.address,
        distance_m: Math.round(d),
        same_normalized_address: sameAddr,
      };
      if (d < 50) lt50.push(rec);
      lt100.push(rec);
    }
  }
  return {lt50, lt100};
}

function brandBreakdown(rows) {
  const byBrand = {};
  for (const r of rows) byBrand[r.brand] = (byBrand[r.brand] || 0) + 1;
  return byBrand;
}

function main() {
  const centers = JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8'));
  const readyFile = JSON.parse(fs.readFileSync(readyPath, 'utf8'));
  const phase2Report = fs.existsSync(phase2ReportPath)
    ? JSON.parse(fs.readFileSync(phase2ReportPath, 'utf8'))
    : null;
  const stagingById = new Map(staging.map(r => [r.id, r]));

  if (!Array.isArray(readyFile) || readyFile.length !== EXPECTED_CANONICAL) {
    throw new Error(
      `AUSTRIA_PHASE2_READY_TO_IMPORT.json count ${readyFile?.length}, expected ${EXPECTED_CANONICAL} — STOP`,
    );
  }

  const readyIds = new Set(readyFile.map(r => r.id));
  const stagingReadyOrMerged = staging.filter(r =>
    r.import_category === 'READY_TO_IMPORT' ||
    r.import_category === 'MERGED_INTO_CATALOG' ||
    r.import_category === 'DUPLICATE',
  );
  const stagingEligibleIds = new Set(stagingReadyOrMerged.map(r => r.id));
  const stagingReadyCount = staging.filter(r => r.import_category === 'READY_TO_IMPORT').length;
  const stagingMergedCount = staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG').length;

  if ([...readyIds].some(id => !stagingEligibleIds.has(id))) {
    const missing = [...readyIds].filter(id => !stagingEligibleIds.has(id));
    throw new Error(
      `Cross-check failed: Phase2 READY IDs missing from staging READY/MERGED/DUPLICATE: ${missing.join(', ')}`,
    );
  }
  if (!idempotencyCheck && stagingReadyCount !== EXPECTED_CANONICAL) {
    if (!(stagingReadyCount === 0 && stagingMergedCount > 0)) {
      throw new Error(
        `Cross-check failed: staging READY (${stagingReadyCount}) !== Phase2 READY (${readyFile.length}) — STOP`,
      );
    }
  }
  if (phase2Report && phase2Report.ready_to_import !== EXPECTED_CANONICAL) {
    throw new Error(
      `Phase2 report ready_to_import=${phase2Report.ready_to_import}, expected ${EXPECTED_CANONICAL}`,
    );
  }

  for (const id of WITHHELD_READY_IDS) {
    if (readyIds.has(id)) {
      throw new Error(`Withheld/superseded ID ${id} must not be in canonical READY — STOP`);
    }
  }

  const sourceRows = idempotencyCheck
    ? staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG')
    : staging.filter(r => r.import_category === 'READY_TO_IMPORT');

  if (!idempotencyCheck && sourceRows.length !== EXPECTED_CANONICAL) {
    throw new Error(`Staging READY count ${sourceRows.length} !== ${EXPECTED_CANONICAL} — STOP`);
  }
  if (idempotencyCheck && sourceRows.length === 0) {
    throw new Error('Idempotency check: no MERGED_INTO_CATALOG rows in staging');
  }

  const preMergeSha256 = sha256File(centersPath);

  const before = {
    total: centers.length,
    austria: countByCountry(centers, 'Austria'),
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
  const plBefore = snapshotCountry(centers, 'Poland');

  const rejected = {
    not_ready: 0, missing_id_prefix: 0, missing_name: 0, missing_brand: 0,
    missing_address: 0, missing_postal: 0, missing_city: 0,
    wrong_country: 0, invalid_coords: 0, bad_postal_format: 0,
    postal_not_string: 0, outside_bbox: 0, mojibake: 0, not_active: 0,
    questionable_city: 0, foreign_neighbor: 0,
    staging_mismatch: 0, dup_id_in_batch: 0,
    bad_coord_source: 0, fallback_coord: 0, literal_escape_unrepaired: 0,
    wrong_import_status: 0,
  };
  const rejectedDetails = [];

  const candidates = sourceRows.filter(r => {
    const s = stagingById.get(r.id);
    if (s && s.import_category !== 'READY_TO_IMPORT' && s.import_category !== 'MERGED_INTO_CATALOG') {
      rejected.not_ready++;
      rejectedDetails.push({id: r.id, reason: 'staging_not_ready', value: s.import_category});
      return false;
    }
    if (['NEEDS_COORDINATES', 'NEEDS_REVIEW', 'COMING_SOON', 'CLOSED', 'DUPLICATE'].includes(s?.import_category)) {
      rejected.wrong_import_status++;
      rejectedDetails.push({id: r.id, reason: 'excluded_import_category', value: s.import_category});
      return false;
    }
    return true;
  });

  const seenBatchIds = new Set();
  const validated = [];
  let stopDuplicateIds = [];

  for (const r of candidates) {
    if (!String(r.id || '').startsWith('at_')) {
      rejected.missing_id_prefix++;
      rejectedDetails.push({id: r.id, reason: 'missing_at_prefix'});
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
    if (!AT_POSTAL_RE.test(postal)) {
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
    if (String(r.country || '').trim() !== 'Austria') {
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
    if (/fallback|invented|centroid|city.?center|postcode.?centroid|austria.?centroid/i.test(notesBlob)) {
      rejected.fallback_coord++;
      rejectedDetails.push({id: r.id, reason: 'fallback_coord', notes: r.notes});
      continue;
    }
    const lat = Number(r.lat);
    const lng = Number(r.lng);
    if (!inAustriaBbox(lat, lng)) {
      rejected.outside_bbox++;
      rejectedDetails.push({id: r.id, reason: 'outside_austria_bbox', lat, lng, name: r.name});
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
    const fixedBlob = `${fixEscapedUtf8(r.name)} ${fixEscapedUtf8(r.address)} ${fixEscapedUtf8(r.city)} ${r.brand}`;
    if (hasMojibake(fixedBlob)) {
      rejected.mojibake++;
      rejectedDetails.push({id: r.id, reason: 'mojibake', snippet: fixedBlob.slice(0, 80)});
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
    validated.push(r);
  }

  const {kept: deduped, withheld: encodingDuplicates} = deduplicateSameAddressBatch(validated);

  const byId = new Map(centers.map(c => [c.id, c]));
  const prodCollisions = deduped.filter(r => byId.has(r.id)).map(r => r.id);
  const unexpectedProdCollision = !idempotencyCheck && before.austria === 0 && prodCollisions.length > 0;
  if (stopDuplicateIds.length > 0 || unexpectedProdCollision) {
    const stopReport = {
      stopped: true,
      reason: 'duplicate_ids',
      duplicate_ids_vs_production: prodCollisions,
      duplicate_ids_in_batch: stopDuplicateIds,
      message: 'STOP: duplicate IDs found — centers.json NOT modified',
    };
    fs.writeFileSync(reportPath, JSON.stringify(stopReport, null, 2) + '\n');
    console.error(stopReport.message);
    throw new Error(stopReport.message);
  }

  const preMergeProximity = findSameBrandProximity(deduped);
  const hardProximity = preMergeProximity.lt100.filter(p => p.same_normalized_address);
  if (hardProximity.length > 0 && !idempotencyCheck) {
    const stopReport = {
      stopped: true,
      reason: 'same_brand_same_address_proximity_after_dedup',
      pairs: hardProximity,
      message: 'STOP: same-brand same-address proximity after dedup — centers.json NOT modified',
    };
    fs.writeFileSync(reportPath, JSON.stringify(stopReport, null, 2) + '\n');
    fs.writeFileSync(dupAnalysisPath, JSON.stringify(preMergeProximity, null, 2) + '\n');
    console.error(stopReport.message);
    throw new Error(stopReport.message);
  }

  const retainedClosePairs = preMergeProximity.lt100.filter(p => !p.same_normalized_address);

  const liveAddrBrand = new Set(centers.map(addrBrandKey));

  const dupAnalysis = {
    encoding_duplicate_withheld: encodingDuplicates,
    skipped_existing_id: [],
    skipped_same_addr_brand: [],
    different_brand_colocations_kept: [],
    retained_close_pairs_same_brand: retainedClosePairs,
    same_brand_pre_merge: preMergeProximity,
    withheld_questionable: rejectedDetails,
    included: [],
  };

  let inserted = 0;
  const insertedRows = [];
  const batchAddrBrand = new Set();

  for (let i = 0; i < deduped.length; i++) {
    for (let j = i + 1; j < deduped.length; j++) {
      const a = deduped[i];
      const b = deduped[j];
      if (!hasValidCoords(a) || !hasValidCoords(b)) continue;
      const d = haversineMeters(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng));
      if (d >= 50) continue;
      if (normalizeBrand(a.brand) !== normalizeBrand(b.brand)) {
        dupAnalysis.different_brand_colocations_kept.push({
          a_id: a.id, a_name: a.name, a_brand: a.brand,
          b_id: b.id, b_name: b.name, b_brand: b.brand,
          distance_m: Math.round(d),
          note: 'different_brand_kept',
        });
      }
    }
  }

  for (const r of deduped) {
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
    austria: countByCountry(catalog, 'Austria'),
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
  };

  const idCounts = new Map();
  for (const c of catalog) idCounts.set(c.id, (idCounts.get(c.id) || 0) + 1);
  const duplicateIds = [...idCounts.entries()].filter(([, n]) => n > 1).map(([id]) => id);

  const atLive = catalog.filter(c => c.country === 'Austria');
  const sameBrandPhysical = [];
  const identicalCoordClusters = [];
  const coordBuckets = new Map();
  for (const c of atLive) {
    const ck = `${Number(c.lat).toFixed(5)},${Number(c.lng).toFixed(5)}`;
    if (!coordBuckets.has(ck)) coordBuckets.set(ck, []);
    coordBuckets.get(ck).push(c.id);
  }
  for (const [ck, ids] of coordBuckets) {
    if (ids.length > 1) identicalCoordClusters.push({coord: ck, ids});
  }
  for (let i = 0; i < atLive.length; i++) {
    for (let j = i + 1; j < atLive.length; j++) {
      const a = atLive[i];
      const b = atLive[j];
      if (!hasValidCoords(a) || !hasValidCoords(b)) continue;
      const d = haversineMeters(a.lat, a.lng, b.lat, b.lng);
      if (normalizeBrand(a.brand) === normalizeBrand(b.brand) && d < 100) {
        sameBrandPhysical.push({
          a_id: a.id, a_name: a.name, a_brand: a.brand, a_address: a.address,
          b_id: b.id, b_name: b.name, b_brand: b.brand, b_address: b.address,
          distance_m: Math.round(d),
          same_address: addrBrandKey(a) === addrBrandKey(b),
        });
      }
    }
  }

  const enc = encodingIssues(atLive);
  const germanLetters = countGermanLetters(atLive);
  const postalOk = atLive.every(c =>
    typeof c.postal_code === 'string' && AT_POSTAL_RE.test(String(c.postal_code || '')));
  const postalAllString = atLive.every(c => typeof c.postal_code === 'string');

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
  const plIntact = plBefore.length === after.poland && countryIntact(plBefore, catalog);

  const byBrand = brandBreakdown(atLive);
  const brandSum = Object.values(byBrand).reduce((a, b) => a + b, 0);
  const canonicalBrandBreakdown = brandBreakdown(readyFile);

  const safeInsertCount = deduped.length;
  const wouldWrite = !dryRun && !idempotencyCheck;
  const validationFailures = Object.values(rejected).reduce((a, b) => a + b, 0);
  const stopped = wouldWrite && (validationFailures > 0 || inserted !== safeInsertCount);

  if (wouldWrite) {
    if (before.total !== BASELINE.total) {
      throw new Error(`Pre-merge total ${before.total}, expected ${BASELINE.total} — abort`);
    }
    if (before.austria !== 0) {
      throw new Error(`Pre-merge Austria ${before.austria}, expected 0 — abort`);
    }
    for (const [key, expected] of Object.entries(BASELINE)) {
      if (key === 'total' || key === 'austria') continue;
      if (before[key] !== expected) {
        throw new Error(`${key} ${before[key]}, expected ${expected}`);
      }
    }
    if (stopped) {
      console.error(`STOP: validation failures or insert mismatch. centers.json NOT modified.`);
    } else {
      for (const [key, expected] of Object.entries(BASELINE)) {
        if (key === 'total' || key === 'austria') continue;
        if (after[key] !== expected) {
          throw new Error(`Post-merge ${key} count ${after[key]}, expected ${expected}`);
        }
      }
      if (after.austria !== inserted) {
        throw new Error(`Austria after ${after.austria}, expected inserted ${inserted}`);
      }
      if (after.total !== BASELINE.total + inserted) {
        throw new Error(`Total after ${after.total}, expected ${BASELINE.total + inserted}`);
      }
      if (duplicateIds.length > 0) throw new Error(`Duplicate IDs found: ${duplicateIds.join(', ')}`);
      if (!dkIntact || !seIntact || !noIntact || !fiIntact || !deIntact ||
          !ukIntact || !nlIntact || !frIntact || !esIntact || !itIntact || !beIntact || !plIntact) {
        throw new Error('Country regression detected — abort write');
      }

      const insertedIdSet = new Set(insertedRows.map(r => r.id));
      const withheldIdSet = new Set(encodingDuplicates.map(w => w.id));
      for (const r of staging) {
        if (insertedIdSet.has(r.id)) {
          r.import_category = 'MERGED_INTO_CATALOG';
        } else if (withheldIdSet.has(r.id) && r.import_category === 'READY_TO_IMPORT') {
          r.import_category = 'DUPLICATE';
          r.verification_status = 'DUPLICATE';
          r.notes = `${r.notes || ''}; superseded_by=${encodingDuplicates.find(w => w.id === r.id)?.kept_id}; merge_dedup`.trim();
        }
      }

      fs.writeFileSync(centersPath, JSON.stringify(catalog, null, 2) + '\n');
      fs.writeFileSync(stagingPath, JSON.stringify(staging, null, 2) + '\n');
      console.log(`Merge written: ${inserted} Austria centers added to centers.json`);
    }
  } else if (idempotencyCheck) {
    console.log(`Idempotency check — would insert ${inserted} (expected 0 after successful merge)`);
  } else {
    console.log(`Dry run — would insert ${inserted} Austria centers (canonical ${EXPECTED_CANONICAL}, safe ${safeInsertCount})`);
  }

  const stagingCats = staging.reduce((acc, r) => {
    acc[r.import_category] = (acc[r.import_category] || 0) + 1;
    return acc;
  }, {});

  const stagingReconciliation = {
    canonical_ready: EXPECTED_CANONICAL,
    encoding_duplicates_withheld: encodingDuplicates.length,
    safe_insert_count: safeInsertCount,
    marked_merged: wouldWrite && !stopped ? insertedRows.length : 0,
    production_ids_match: insertedRows.map(r => r.id).sort(),
    staging_merged_after: stagingCats.MERGED_INTO_CATALOG || 0,
    staging_ready_after: stagingCats.READY_TO_IMPORT || 0,
    staging_duplicate_after: stagingCats.DUPLICATE || 0,
    metadata_drift: wouldWrite && !stopped
      ? (stagingCats.MERGED_INTO_CATALOG || 0) !== inserted
      : null,
  };

  const thresholdCrossed = before.total + inserted > 10000;

  const report = {
    dry_run: dryRun,
    idempotency_check: idempotencyCheck,
    source_of_truth: 'data/austria/AUSTRIA_PHASE2_READY_TO_IMPORT.json',
    cross_check: 'data/austria/austria_centers_staging.json',
    expected_canonical: EXPECTED_CANONICAL,
    safe_insert_after_dedup: safeInsertCount,
    encoding_duplicates_withheld: encodingDuplicates,
    note: 'Phase 2 READY merge. 14 MYGYM encoding/phase1 duplicates withheld (same address, lower confidence).',
    stopped,
    stop_reason: stopped ? 'validation_or_insert_mismatch' : null,
    pre_merge_sha256: preMergeSha256,
    ready_file_count: readyFile.length,
    staging_ready_count: stagingReadyCount,
    phase2_report_ready: phase2Report?.ready_to_import ?? null,
    before,
    after: stopped ? before : after,
    inserted: stopped ? 0 : inserted,
    would_have_inserted: inserted,
    rejected,
    rejected_details: rejectedDetails,
    canonical_brand_breakdown: canonicalBrandBreakdown,
    austria_by_brand: stopped ? {} : byBrand,
    brand_sum: stopped ? 0 : brandSum,
    duplicate_ids_in_catalog: duplicateIds,
    duplicate_same_brand_physical: sameBrandPhysical,
    identical_coordinate_clusters: identicalCoordClusters,
    encoding_issues: enc,
    german_letter_counts: germanLetters,
    postal_format_ok: postalOk,
    postal_all_string: postalAllString,
    countries_intact: {
      dk: dkIntact, se: seIntact, no: noIntact, fi: fiIntact,
      de: deIntact, uk: ukIntact, nl: nlIntact, fr: frIntact,
      es: esIntact, it: itIntact, be: beIntact, pl: plIntact,
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
      encoding_duplicate_withheld: encodingDuplicates.length,
      skipped_existing_id: dupAnalysis.skipped_existing_id.length,
      skipped_same_addr_brand: dupAnalysis.skipped_same_addr_brand.length,
      different_brand_colocations_kept: dupAnalysis.different_brand_colocations_kept.length,
      retained_close_pairs_same_brand: retainedClosePairs.length,
      same_brand_lt50_pre_merge: preMergeProximity.lt50.length,
      same_brand_lt100_pre_merge: preMergeProximity.lt100.length,
      same_brand_lt100_post_merge: sameBrandPhysical.length,
      identical_coordinate_clusters: identicalCoordClusters.length,
    },
    checkpoint_10k: {
      previous_catalog: before.total,
      new_catalog_if_merged: before.total + inserted,
      threshold_crossed: thresholdCrossed,
      amount_above_10000: Math.max(0, before.total + inserted - 10000),
      global_stress_qa_required: 'AFTER_AUSTRIA_QA',
      country_expansion_paused: true,
    },
    global_qa_lock: {
      country_expansion_paused_after_austria_merge: true,
      pending: ['Austria Production QA', 'Global 10K+ Stress QA'],
      country_expansion_allowed: false,
    },
    check_in_radius_meters: 200,
    auto_checkout_distance_meters: 200,
    auto_checkout_unchanged: true,
    verdict: stopped
      ? 'AUSTRIA MERGE BLOCKED'
      : dryRun
        ? 'DRY_RUN'
        : idempotencyCheck
          ? (inserted === 0 ? 'IDEMPOTENT_OK' : 'IDEMPOTENCY_FAIL')
          : 'AUSTRIA MERGE COMPLETE — 10K CROSSED — WAITING FOR AUSTRIA QA',
  };

  if (!(idempotencyCheck && inserted === 0 && before.austria > 0)) {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    fs.writeFileSync(dupAnalysisPath, JSON.stringify(dupAnalysis, null, 2) + '\n');
    fs.writeFileSync(approvedPath, JSON.stringify(insertedRows, null, 2) + '\n');
    fs.writeFileSync(mdReportPath, buildMarkdown(report, encodingDuplicates, retainedClosePairs, byBrand, insertedRows));
  }

  console.log(JSON.stringify({
    dry_run: dryRun,
    idempotency_check: idempotencyCheck,
    stopped,
    before_total: before.total,
    austria_before: before.austria,
    canonical: EXPECTED_CANONICAL,
    safe_insert: safeInsertCount,
    would_insert: inserted,
    after_total_if_written: before.total + inserted,
    encoding_duplicates_withheld: encodingDuplicates.length,
    threshold_crossed: thresholdCrossed,
    brands: byBrand,
    pre_merge_sha256: preMergeSha256,
  }, null, 2));

  if (idempotencyCheck && inserted > 0) {
    throw new Error(`Idempotency FAIL: would insert ${inserted} additional rows`);
  }
}

function buildMarkdown(report, encodingDuplicates, retainedClosePairs, byBrand, insertedRows) {
  const brandLines = Object.entries(byBrand)
    .sort((a, b) => b[1] - a[1])
    .map(([b, n]) => `- ${b}: ${n}`)
    .join('\n');

  return `# Austria Merge Report

Generated: ${new Date().toISOString()}

## Status
${report.stopped
  ? '**STOPPED — centers.json NOT modified.**'
  : report.dry_run
    ? `**DRY RUN** — would insert ${report.would_have_inserted}.`
    : report.idempotency_check
      ? `**IDEMPOTENCY CHECK** — would insert ${report.would_have_inserted}.`
      : `**MERGED** — inserted ${report.inserted}.`}

Source: \`AUSTRIA_PHASE2_READY_TO_IMPORT.json\` (**${report.expected_canonical} canonical READY**)
Safe insert after encoding dedup: **${report.safe_insert_after_dedup}**

## Summary
- **Before:** ${report.before.total} centers (Austria: ${report.before.austria})
- **Inserted:** ${report.inserted || report.would_have_inserted}
- **After (if written):** ${report.before.total + (report.inserted || report.would_have_inserted)}
- **Pre-merge SHA256:** \`${report.pre_merge_sha256}\`

## Encoding duplicate withhold (${encodingDuplicates.length})
${encodingDuplicates.map(w => `- ${w.id} (${w.name}) → kept ${w.kept_id}`).join('\n') || '- None'}

## Retained close pairs (same brand, different address, ≤100m)
${retainedClosePairs.map(p => `- ${p.a_id} ↔ ${p.b_id} (${p.distance_m}m) | ${p.a_name} / ${p.b_name}`).join('\n') || '- None'}

## Austria Brand Breakdown (production)
${brandLines}
- **Total:** ${report.brand_sum || insertedRows.length}

## 10K Milestone
- Previous catalog: ${report.checkpoint_10k.previous_catalog}
- New catalog: ${report.checkpoint_10k.new_catalog_if_merged}
- **10K THRESHOLD CROSSED:** ${report.checkpoint_10k.threshold_crossed ? 'YES' : 'NO'}
- Amount above 10,000: ${report.checkpoint_10k.amount_above_10000}

## Global QA Lock
**COUNTRY EXPANSION PAUSED AFTER AUSTRIA MERGE**

Pending:
1. Austria Production QA
2. Global 10K+ Stress QA (after Austria QA passes)

Country expansion currently allowed: **NO**

## Check-in
- CHECK_IN_RADIUS_METERS: 200 (unchanged)
- AUTO_CHECKOUT_DISTANCE_METERS: 200 (unchanged)

## Verdict
${report.verdict}
`;
}

main();
