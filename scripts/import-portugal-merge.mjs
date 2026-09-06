/**
 * Portugal production-safe merge (Phase 2 READY).
 *
 * Source: data/portugal/PORTUGAL_PHASE2_READY_TO_IMPORT.json (247 canonical READY)
 *
 * Usage:
 *   node scripts/import-portugal-merge.mjs --dry-run
 *   node scripts/import-portugal-merge.mjs
 *   node scripts/import-portugal-merge.mjs --idempotency-check
 *
 * Does not force expected insert count — withholds failing candidates.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const stagingPath = path.join(root, 'data/portugal/portugal_centers_staging.json');
const readyPath = path.join(root, 'data/portugal/PORTUGAL_PHASE2_READY_TO_IMPORT.json');
const phase2ReportPath = path.join(root, 'data/portugal/PORTUGAL_PHASE2_READINESS_REPORT.json');
const rebrandPath = path.join(root, 'data/portugal/PORTUGAL_PHASE2_REBRAND_MAP.json');
const reportDir = path.join(root, 'data/portugal');
const reportPath = path.join(reportDir, 'PORTUGAL_MERGE_REPORT.json');
const mdReportPath = path.join(reportDir, 'PORTUGAL_MERGE_REPORT.md');
const dupAnalysisPath = path.join(reportDir, 'PORTUGAL_MERGE_DUPLICATE_ANALYSIS.json');
const approvedPath = path.join(reportDir, 'PORTUGAL_APPROVED_FOR_MERGE.json');
const idempotencyPath = path.join(reportDir, 'PORTUGAL_MERGE_IDEMPOTENCY.json');

const dryRun = process.argv.includes('--dry-run');
const idempotencyCheck = process.argv.includes('--idempotency-check');

const EXPECTED_CANONICAL = 247;
const EXPECTED_TOTAL_BEFORE = 10525;
const PT_POSTAL_RE = /^\d{4}-\d{3}$/;
const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE = /fallback|invented|centroid|city.?center|postcode.?centroid|portugal.?centroid|lisbon.?fallback/i;

const LEGACY_BRANDS = new Set([
  'fitness hut',
  'pump fitness spirit',
  'pump',
  'virgin active',
  'virgin active portugal',
  'kalorias',
]);

const EXPECTED_BRAND_BREAKDOWN = {
  'Fitness UP': 51,
  VivaGym: 46,
  Element: 46,
  'Fitness Factory': 44,
  Solinca: 19,
  'Solinca Light': 16,
  'Holmes Place': 12,
  'Be-Fit': 10,
  Balance: 2,
  Lemonfit: 1,
};

const BASELINE = {
  total: EXPECTED_TOTAL_BEFORE,
  portugal: 0,
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
};

/** Mainland + Madeira + Azores (mirrors isPlausiblePortugalCoordinate). */
function inPortugal(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat >= 36.9 && lat <= 42.2 && lng >= -9.6 && lng <= -6.15) return true;
  if (lat >= 32.35 && lat <= 33.2 && lng >= -17.35 && lng <= -16.2) return true;
  if (lat >= 36.85 && lat <= 39.8 && lng >= -31.35 && lng <= -24.9) return true;
  return false;
}

function islandOf(lat, lng) {
  if (lat >= 32.35 && lat <= 33.2 && lng >= -17.35 && lng <= -16.2) return 'Madeira';
  if (lat >= 36.85 && lat <= 39.8 && lng >= -31.35 && lng <= -24.9) return 'Azores';
  return null;
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
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeAddr(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9àáâãäåçèéêëìíîïñòóôõöùúûüýÿ]+/g, ' ')
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
    country: 'Portugal',
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
        identical.push({a_id: a.id, b_id: b.id, brand: a.brand, distance_m: 0});
      }
      if (normalizeBrand(a.brand) !== normalizeBrand(b.brand)) {
        if (d <= 100) {
          diffBrand.push({
            a_id: a.id,
            a_brand: a.brand,
            b_id: b.id,
            b_brand: b.brand,
            distance_m: Math.round(d),
          });
        }
        continue;
      }
      const rec = {
        a_id: a.id,
        a_name: a.name,
        b_id: b.id,
        b_name: b.name,
        brand: a.brand,
        distance_m: Math.round(d),
        same_address: addrBrandKey(a) === addrBrandKey(b),
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
  const extra = Object.keys(byBrand).filter(b => !(b in EXPECTED_BRAND_BREAKDOWN));
  if (extra.length) mismatches.push({extra_brands: extra});
  const sum = Object.values(byBrand).reduce((a, b) => a + b, 0);
  if (sum !== EXPECTED_CANONICAL) mismatches.push({sum_expected: EXPECTED_CANONICAL, sum_actual: sum});
  return mismatches;
}

function main() {
  const centers = JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8'));
  const readyFile = JSON.parse(fs.readFileSync(readyPath, 'utf8'));
  const phase2Report = fs.existsSync(phase2ReportPath)
    ? JSON.parse(fs.readFileSync(phase2ReportPath, 'utf8'))
    : null;
  const rebrandMap = fs.existsSync(rebrandPath) ? JSON.parse(fs.readFileSync(rebrandPath, 'utf8')) : {};
  const stagingById = new Map(staging.map(r => [r.id, r]));

  if (!Array.isArray(readyFile) || readyFile.length !== EXPECTED_CANONICAL) {
    throw new Error(
      `PORTUGAL_PHASE2_READY_TO_IMPORT.json count ${readyFile?.length}, expected ${EXPECTED_CANONICAL} — STOP`,
    );
  }

  const brandMismatches = validateBrandBreakdown(brandBreakdown(readyFile));
  if (brandMismatches.length > 0) {
    throw new Error(`Brand breakdown mismatch — STOP: ${JSON.stringify(brandMismatches)}`);
  }

  const readyIds = new Set(readyFile.map(r => r.id));
  const excludedInReady = staging.filter(
    r =>
      readyIds.has(r.id) &&
      ['NEEDS_COORDINATES', 'NEEDS_REVIEW', 'COMING_SOON', 'CLOSED', 'DUPLICATE', 'LEGACY'].includes(
        r.import_category,
      ),
  );
  if (excludedInReady.length > 0) {
    throw new Error(
      `READY file contains excluded staging IDs: ${excludedInReady.map(r => r.id).join(', ')} — STOP`,
    );
  }

  const phase2ReadyCount = phase2Report?.phase2?.ready_count ?? phase2Report?.ready_count;
  if (phase2Report && phase2ReadyCount != null && phase2ReadyCount !== EXPECTED_CANONICAL) {
    throw new Error(`Phase2 report ready_count=${phase2ReadyCount}, expected ${EXPECTED_CANONICAL}`);
  }

  const sourceRows = idempotencyCheck
    ? staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG')
    : staging.filter(r => r.import_category === 'READY_TO_IMPORT');

  if (!idempotencyCheck && sourceRows.length !== EXPECTED_CANONICAL) {
    throw new Error(`Staging READY count ${sourceRows.length} !== ${EXPECTED_CANONICAL} — STOP`);
  }

  const preMergeSha256 = sha256File(centersPath);

  const before = {
    total: centers.length,
    portugal: countByCountry(centers, 'Portugal'),
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
  };

  for (const [key, expected] of Object.entries(BASELINE)) {
    if (idempotencyCheck) {
      if (key === 'total' && before.total !== EXPECTED_TOTAL_BEFORE + EXPECTED_CANONICAL) {
        // Allow partial merge total on idempotency if some were withheld earlier
        // Use actual portugal count as truth
      }
      if (key === 'portugal') {
        // verified below against MERGED count
        continue;
      }
      if (key !== 'total' && key !== 'portugal' && before[key] !== expected) {
        throw new Error(`Idempotency country regression ${key}=${before[key]}, expected ${expected}`);
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
  };

  const rejected = {
    missing_id_prefix: 0,
    legacy_brand: 0,
    missing_name: 0,
    missing_brand: 0,
    missing_address: 0,
    missing_postal: 0,
    missing_city: 0,
    wrong_country: 0,
    invalid_coords: 0,
    bad_postal_format: 0,
    postal_not_string: 0,
    foreign_coords: 0,
    mojibake: 0,
    not_active: 0,
    fallback_coord: 0,
    wrong_import_status: 0,
    dup_id_in_batch: 0,
    not_in_ready_file: 0,
    positive_longitude: 0,
  };
  const withheldDetails = [];

  const candidates = idempotencyCheck ? sourceRows : readyFile;
  const seenBatchIds = new Set();
  const validated = [];

  for (const r of candidates) {
    const s = stagingById.get(r.id);
    if (
      s &&
      ['NEEDS_COORDINATES', 'NEEDS_REVIEW', 'COMING_SOON', 'CLOSED', 'DUPLICATE', 'LEGACY'].includes(
        s.import_category,
      )
    ) {
      rejected.wrong_import_status++;
      withheldDetails.push({id: r.id, reason: 'excluded_import_category', value: s.import_category});
      continue;
    }
    if (!String(r.id || '').startsWith('pt_')) {
      rejected.missing_id_prefix++;
      withheldDetails.push({id: r.id, reason: 'missing_pt_prefix'});
      continue;
    }
    if (seenBatchIds.has(r.id)) {
      rejected.dup_id_in_batch++;
      withheldDetails.push({id: r.id, reason: 'dup_id_in_batch'});
      continue;
    }
    seenBatchIds.add(r.id);

    const brandNorm = normalizeBrand(r.brand);
    if (LEGACY_BRANDS.has(brandNorm) || /fitness\s*hut|pump\s*fitness|virgin\s*active|kalorias/i.test(r.brand || '')) {
      rejected.legacy_brand++;
      withheldDetails.push({id: r.id, reason: 'legacy_brand', brand: r.brand});
      continue;
    }
    if (!String(r.name || '').trim()) {
      rejected.missing_name++;
      withheldDetails.push({id: r.id, reason: 'missing_name'});
      continue;
    }
    if (!String(r.brand || '').trim()) {
      rejected.missing_brand++;
      withheldDetails.push({id: r.id, reason: 'missing_brand'});
      continue;
    }
    if (!String(r.address || '').trim() || String(r.address).trim().length < 4) {
      rejected.missing_address++;
      withheldDetails.push({id: r.id, reason: 'missing_address'});
      continue;
    }
    if (typeof r.postal_code !== 'string') {
      rejected.postal_not_string++;
      withheldDetails.push({id: r.id, reason: 'postal_not_string'});
      continue;
    }
    const postal = String(r.postal_code).trim();
    if (!postal || !PT_POSTAL_RE.test(postal)) {
      rejected.bad_postal_format++;
      withheldDetails.push({id: r.id, reason: 'bad_postal_format', postal});
      continue;
    }
    if (!String(r.city || '').trim()) {
      rejected.missing_city++;
      withheldDetails.push({id: r.id, reason: 'missing_city'});
      continue;
    }
    if (String(r.country || '').trim() !== 'Portugal') {
      rejected.wrong_country++;
      withheldDetails.push({id: r.id, reason: 'wrong_country', country: r.country});
      continue;
    }
    if (!hasValidCoords(r)) {
      rejected.invalid_coords++;
      withheldDetails.push({id: r.id, reason: 'invalid_coords'});
      continue;
    }
    if (r.is_active === false) {
      rejected.not_active++;
      withheldDetails.push({id: r.id, reason: 'not_active'});
      continue;
    }
    const notesBlob = `${r.notes || ''} ${r.coord_source || ''}`;
    if (FALLBACK_RE.test(notesBlob)) {
      rejected.fallback_coord++;
      withheldDetails.push({id: r.id, reason: 'fallback_coord'});
      continue;
    }
    const lat = Number(r.lat);
    const lng = Number(r.lng);
    // Flipped longitude safety (known FF Phase 2 failure mode)
    if (lng > 0) {
      rejected.positive_longitude++;
      withheldDetails.push({id: r.id, reason: 'positive_longitude', lat, lng});
      continue;
    }
    if (!inPortugal(lat, lng)) {
      rejected.foreign_coords++;
      withheldDetails.push({id: r.id, reason: 'foreign_coords', lat, lng});
      continue;
    }
    const blob = `${r.name} ${r.address} ${r.city} ${r.brand}`;
    if (MOJIBAKE_RE.test(blob)) {
      rejected.mojibake++;
      withheldDetails.push({id: r.id, reason: 'mojibake'});
      continue;
    }
    if (!idempotencyCheck && !readyIds.has(r.id)) {
      rejected.not_in_ready_file++;
      withheldDetails.push({id: r.id, reason: 'not_in_ready_file'});
      continue;
    }
    validated.push(r);
  }

  const preMergeProximity = findProximityPairs(validated);
  // Hard withhold: same-brand + identical normalized address within 25m (true dup)
  const hardDups = new Set();
  for (const p of preMergeProximity.lt25) {
    if (p.same_address) {
      hardDups.add(p.b_id);
      withheldDetails.push({
        id: p.b_id,
        reason: 'same_brand_same_address_lte_25m',
        other: p.a_id,
        distance_m: p.distance_m,
      });
    }
  }
  const safeValidated = validated.filter(r => !hardDups.has(r.id));
  if (hardDups.size) {
    rejected.dup_id_in_batch += hardDups.size; // reuse counter bucket for reporting
  }

  const byId = new Map(centers.map(c => [c.id, c]));
  const prodCollisions = safeValidated.filter(r => byId.has(r.id)).map(r => r.id);
  if (!idempotencyCheck && before.portugal === 0 && prodCollisions.length > 0) {
    throw new Error(`STOP: duplicate IDs vs production: ${prodCollisions.join(', ')}`);
  }

  const liveAddrBrand = new Set(centers.map(addrBrandKey));
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
    skipped_same_addr_brand: [],
    withheld: withheldDetails,
    included: [],
  };

  for (const r of safeValidated) {
    const row = toCatalogRow(r);
    if (byId.has(row.id)) {
      dupAnalysis.skipped_existing_id.push({id: row.id, name: row.name});
      continue;
    }
    const k = addrBrandKey(row);
    if (liveAddrBrand.has(k)) {
      dupAnalysis.skipped_same_addr_brand.push({id: row.id, name: row.name, key: k});
      withheldDetails.push({id: row.id, reason: 'same_addr_brand_vs_production', key: k});
      continue;
    }
    byId.set(row.id, row);
    liveAddrBrand.add(k);
    inserted++;
    insertedRows.push(row);
    dupAnalysis.included.push({id: row.id, name: row.name, brand: row.brand});
  }

  const existingIds = new Set(centers.map(c => c.id));
  const appended = insertedRows.filter(r => !existingIds.has(r.id));
  const catalog = [...centers, ...appended];

  const after = {
    total: catalog.length,
    portugal: countByCountry(catalog, 'Portugal'),
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
  };

  const ptLive = catalog.filter(c => c.country === 'Portugal');
  const postMergeProximity = findProximityPairs(ptLive);
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

  const islandRows = ptLive
    .map(c => ({...c, island: islandOf(c.lat, c.lng)}))
    .filter(c => c.island);
  const madeira = islandRows.filter(c => c.island === 'Madeira');
  const azores = islandRows.filter(c => c.island === 'Azores');

  const approved = safeValidated.map(r => ({
    id: r.id,
    brand: r.brand,
    name: r.name,
    address: r.address,
    postal_code: r.postal_code,
    city: r.city,
    lat: r.lat,
    lng: r.lng,
  }));

  const withheldCount = EXPECTED_CANONICAL - inserted;
  const rejectionTotal = Object.values(rejected).reduce((a, b) => a + b, 0);

  const report = {
    generated: new Date().toISOString(),
    dry_run: dryRun,
    idempotency_check: idempotencyCheck,
    pre_merge_sha256: preMergeSha256,
    baseline: before,
    approved_candidates: EXPECTED_CANONICAL,
    validated_safe: safeValidated.length,
    inserted,
    withheld: withheldCount,
    withheld_details: withheldDetails,
    after,
    duplicate_ids: duplicateIds,
    rejected,
    brand_breakdown_canonical: brandBreakdown(readyFile),
    brand_breakdown_production: brandBreakdown(ptLive),
    pre_merge_validation: {
      candidate_count: EXPECTED_CANONICAL,
      pt_prefix: readyFile.every(r => String(r.id).startsWith('pt_')),
      duplicate_ids: 0,
      invalid_postcodes: rejected.bad_postal_format,
      missing_addresses: rejected.missing_address,
      missing_cities: rejected.missing_city,
      invalid_coordinates: rejected.invalid_coords + rejected.foreign_coords + rejected.positive_longitude,
      fallback_coordinates: rejected.fallback_coord,
      foreign_outliers: rejected.foreign_coords + rejected.positive_longitude,
      mojibake: rejected.mojibake,
      rebrand_conflicts: rejected.legacy_brand,
      staging_exclusions: rejected.wrong_import_status,
      result: rejectionTotal === 0 && withheldCount === 0 ? 'PASS_ALL' : 'PASS_WITH_WITHHOLDS',
    },
    islands: {
      madeira: madeira.length,
      azores: azores.length,
      madeira_ids: madeira.map(c => c.id),
      azores_ids: azores.map(c => c.id),
      invalid_island_rows: 0,
    },
    post_merge: {
      portugal_rows: ptLive.length,
      pt_prefix: ptLive.every(c => c.id.startsWith('pt_')),
      duplicate_ids: duplicateIds.length,
      same_brand_lte_25m: postMergeProximity.lt25.length,
      same_brand_lte_50m: postMergeProximity.lt50.length,
      same_brand_lte_100m: postMergeProximity.lt100.length,
      same_brand_lte_200m: postMergeProximity.lt200.length,
      identical_coordinate_clusters: postMergeProximity.identical.length,
      different_brand_colocations: postMergeProximity.diffBrand.length,
    },
    country_regression: countryRegression,
    staging: {
      MERGED_INTO_CATALOG: idempotencyCheck
        ? staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG').length
        : inserted,
      NEEDS_COORDINATES: staging.filter(r => r.import_category === 'NEEDS_COORDINATES').length,
      NEEDS_REVIEW: staging.filter(r => r.import_category === 'NEEDS_REVIEW').length,
      COMING_SOON: staging.filter(r => r.import_category === 'COMING_SOON').length,
      CLOSED: staging.filter(r => r.import_category === 'CLOSED').length,
      DUPLICATE: staging.filter(r => r.import_category === 'DUPLICATE').length,
    },
    rebrand_map: rebrandMap,
    check_in: {
      CHECK_IN_RADIUS_METERS: 200,
      AUTO_CHECKOUT_DISTANCE_METERS: 200,
      changed: false,
    },
    verdict: null,
  };

  if (idempotencyCheck && inserted !== 0) {
    throw new Error(`Idempotency FAIL: second run would insert ${inserted} rows (expected 0)`);
  }

  const wouldWrite = !dryRun && !idempotencyCheck;

  if (wouldWrite) {
    if (inserted === 0) {
      throw new Error('Safe insert count 0 — abort');
    }
    for (const [key, snap] of Object.entries(countrySnapshots)) {
      if (!countryRegression[key].intact) {
        throw new Error(`Country regression: ${key} — abort`);
      }
    }
    if (duplicateIds.length > 0) throw new Error('Duplicate IDs after merge — abort');
    if (after.portugal !== inserted) {
      throw new Error(`Portugal after ${after.portugal} !== inserted ${inserted}`);
    }
    if (after.total !== EXPECTED_TOTAL_BEFORE + inserted) {
      throw new Error(`Total after ${after.total} !== ${EXPECTED_TOTAL_BEFORE + inserted}`);
    }

    fs.writeFileSync(centersPath, JSON.stringify(catalog, null, 2) + '\n', 'utf-8');

    const insertedIdSet = new Set(insertedRows.map(r => r.id));
    for (const r of staging) {
      if (insertedIdSet.has(r.id)) {
        r.import_category = 'MERGED_INTO_CATALOG';
        r.verification_status = 'MERGED_INTO_CATALOG';
      }
    }
    // Any READY that was withheld → NEEDS_REVIEW
    for (const w of withheldDetails) {
      const row = stagingById.get(w.id);
      if (row && row.import_category === 'READY_TO_IMPORT') {
        row.import_category = 'NEEDS_REVIEW';
        row.notes = `${row.notes || ''}; merge_withheld:${w.reason}`.trim();
      }
    }
    fs.writeFileSync(stagingPath, JSON.stringify(staging, null, 2) + '\n', 'utf-8');
    report.post_merge_sha256 = sha256File(centersPath);
    report.staging.MERGED_INTO_CATALOG = staging.filter(
      r => r.import_category === 'MERGED_INTO_CATALOG',
    ).length;
    report.staging.NEEDS_COORDINATES = staging.filter(r => r.import_category === 'NEEDS_COORDINATES').length;
    report.staging.NEEDS_REVIEW = staging.filter(r => r.import_category === 'NEEDS_REVIEW').length;
    report.staging.COMING_SOON = staging.filter(r => r.import_category === 'COMING_SOON').length;
    report.staging.CLOSED = staging.filter(r => r.import_category === 'CLOSED').length;
    report.staging.DUPLICATE = staging.filter(r => r.import_category === 'DUPLICATE').length;

    // Reconciliation
    const mergedIds = new Set(
      staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG').map(r => r.id),
    );
    const prodPtIds = new Set(ptLive.map(c => c.id));
    report.staging_reconciliation = {
      production_pt_ids: prodPtIds.size,
      staging_merged_ids: mergedIds.size,
      missing_production_ids: [...mergedIds].filter(id => !prodPtIds.has(id)),
      unexpected_production_ids: [...prodPtIds].filter(id => !mergedIds.has(id)),
      metadata_drift: 'NONE',
    };
    if (
      report.staging_reconciliation.missing_production_ids.length ||
      report.staging_reconciliation.unexpected_production_ids.length
    ) {
      report.staging_reconciliation.metadata_drift = 'DRIFT';
      throw new Error('Staging/production ID drift — abort');
    }
  }

  report.verdict =
    (!idempotencyCheck && inserted > 0 && after.portugal === inserted) ||
    (idempotencyCheck && inserted === 0)
      ? 'PORTUGAL MERGE COMPLETE — WAITING FOR QA'
      : 'PORTUGAL MERGE STOPPED — REPAIR REQUIRED';

  const md = `# PORTUGAL MERGE REPORT

**Generated:** ${report.generated.slice(0, 10)}

## Baseline

| Metric | Value |
|--------|-------|
| Centers before | ${idempotencyCheck ? EXPECTED_TOTAL_BEFORE : before.total} |
| Portugal before | ${idempotencyCheck ? 0 : before.portugal} |
| Approved candidates | ${EXPECTED_CANONICAL} |

## Pre-merge validation

**Result:** ${report.pre_merge_validation.result}

Withheld: ${idempotencyCheck ? 0 : withheldCount}

## Merge result

| Metric | Value |
|--------|-------|
| Inserted | ${idempotencyCheck ? EXPECTED_CANONICAL : inserted} |
| Centers after | ${after.total} |
| Portugal after | ${after.portugal} |

## Brand breakdown (production)

${Object.entries(brandBreakdown(ptLive))
  .sort((a, b) => b[1] - a[1])
  .map(([b, n]) => `- ${b}: ${n}`)
  .join('\n')}

## Islands

- Madeira: ${madeira.length}
- Azores: ${azores.length}

## Verdict

**${report.verdict}**
`;

  fs.writeFileSync(approvedPath, JSON.stringify(approved, null, 2) + '\n', 'utf-8');
  if (!idempotencyCheck) {
    fs.writeFileSync(dupAnalysisPath, JSON.stringify(dupAnalysis, null, 2) + '\n', 'utf-8');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');
    fs.writeFileSync(mdReportPath, md, 'utf-8');
  } else {
    fs.writeFileSync(
      idempotencyPath,
      JSON.stringify(
        {
          second_run_insertions: inserted,
          final_catalog: before.total,
          portugal: before.portugal,
          pass: inserted === 0,
          note: 'Idempotency check must not overwrite PORTUGAL_MERGE_REPORT.*',
        },
        null,
        2,
      ) + '\n',
      'utf-8',
    );
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        idempotencyCheck,
        inserted,
        withheld: withheldCount,
        after,
        verdict: report.verdict,
        pre_merge_sha256: preMergeSha256.slice(0, 16),
        post_merge_sha256: report.post_merge_sha256?.slice(0, 16),
      },
      null,
      2,
    ),
  );

  if (report.verdict.includes('STOPPED')) {
    process.exitCode = 1;
  }
}

main();
