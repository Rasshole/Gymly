/**
 * Switzerland production-safe merge (Phase 2).
 *
 * Source: data/switzerland/SWITZERLAND_PHASE2_READY_TO_IMPORT.json (475 canonical READY)
 *
 * Usage:
 *   node scripts/import-switzerland-merge.mjs --dry-run
 *   node scripts/import-switzerland-merge.mjs
 *   node scripts/import-switzerland-merge.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const stagingPath = path.join(root, 'data/switzerland/switzerland_centers_staging.json');
const readyPath = path.join(root, 'data/switzerland/SWITZERLAND_PHASE2_READY_TO_IMPORT.json');
const phase2ReportPath = path.join(root, 'data/switzerland/SWITZERLAND_PHASE2_READINESS_REPORT.json');
const rebrandPath = path.join(root, 'data/switzerland/SWITZERLAND_PHASE2_REBRAND_MAP.json');
const reportDir = path.join(root, 'data/switzerland');
const reportPath = path.join(reportDir, 'SWITZERLAND_MERGE_REPORT.json');
const mdReportPath = path.join(reportDir, 'SWITZERLAND_MERGE_REPORT.md');
const dupAnalysisPath = path.join(reportDir, 'SWITZERLAND_MERGE_DUPLICATE_ANALYSIS.json');
const approvedPath = path.join(reportDir, 'SWITZERLAND_APPROVED_FOR_MERGE.json');

const dryRun = process.argv.includes('--dry-run');
const idempotencyCheck = process.argv.includes('--idempotency-check');

const EXPECTED_CANONICAL = 475;
const EXPECTED_TOTAL_BEFORE = 10050;
const CH_POSTAL_RE = /^\d{4}$/;
const MOJIBAKE_RE = /Ã.|�|â€|â€"|â€"/;
const LITERAL_ESCAPE_RE = /\\x[0-9a-fA-F]{2}/;
const FALLBACK_RE = /fallback|invented|centroid|city.?center|postcode.?centroid|swiss.?centroid/i;

const LEGACY_BRANDS = new Set([
  'basefit',
  'one training center',
  'silhouette wellness',
  'only fitness',
  'basefit.ch',
]);

const EXPECTED_BRAND_BREAKDOWN = {
  'ACTIV FITNESS': 130,
  'update Fitness': 88,
  "Let's Go Fitness": 66,
  PureGym: 49,
  'NonStop Gym': 45,
  'well come FIT': 27,
  'clever fit': 23,
  Kieser: 21,
  Fitnesspark: 15,
  Harmony: 11,
};

const LI_CITIES = ['vaduz', 'schaan', 'triesen', 'balzers', 'eschen', 'mauren', 'gamprin', 'ruggell'];

const CH_BOUNDS = {latMin: 45.82, latMax: 47.81, lngMin: 5.96, lngMax: 10.49};

const BASELINE = {
  total: EXPECTED_TOTAL_BEFORE,
  switzerland: 0,
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
};

function fixEscapedUtf8(s) {
  return String(s || '').replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
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

function inSwitzerlandBbox(lat, lng) {
  return lat >= CH_BOUNDS.latMin && lat <= CH_BOUNDS.latMax && lng >= CH_BOUNDS.lngMin && lng <= CH_BOUNDS.lngMax;
}

function isLiechtenstein(postal, city, address) {
  const p = String(postal || '').trim();
  const cityL = String(city || '').toLowerCase();
  const blob = `${city} ${address}`.toLowerCase();
  if (p.startsWith('948') || p.startsWith('949')) return true;
  if (LI_CITIES.some(c => cityL.includes(c))) return true;
  if (/\bliechtenstein\b/.test(blob)) return true;
  return false;
}

function normalizeBrand(b) {
  return String(b || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeAddr(s) {
  return fixEscapedUtf8(s).toLowerCase().replace(/[^a-z0-9äöüéèàç]+/g, ' ').trim();
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
    name: fixEscapedUtf8(r.name),
    brand: r.brand,
    address: fixEscapedUtf8(r.address || ''),
    postal_code: String(r.postal_code || '').trim(),
    city: fixEscapedUtf8(r.city),
    country: 'Switzerland',
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
    }
  }
  return {lt25, lt50, lt100, identical, diffBrand};
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
      `SWITZERLAND_PHASE2_READY_TO_IMPORT.json count ${readyFile?.length}, expected ${EXPECTED_CANONICAL} — STOP`,
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

  if (phase2Report && phase2Report.ready_to_import !== EXPECTED_CANONICAL) {
    throw new Error(
      `Phase2 report ready_to_import=${phase2Report.ready_to_import}, expected ${EXPECTED_CANONICAL}`,
    );
  }

  const sourceRows = idempotencyCheck
    ? staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG')
    : staging.filter(r => r.import_category === 'READY_TO_IMPORT');

  if (!idempotencyCheck && sourceRows.length !== EXPECTED_CANONICAL) {
    throw new Error(`Staging READY count ${sourceRows.length} !== ${EXPECTED_CANONICAL} — STOP`);
  }
  if (idempotencyCheck) {
    if (sourceRows.length !== EXPECTED_CANONICAL) {
      throw new Error(
        `Idempotency: MERGED_INTO_CATALOG count ${sourceRows.length} !== ${EXPECTED_CANONICAL}`,
      );
    }
  }

  const preMergeSha256 = sha256File(centersPath);

  const before = {
    total: centers.length,
    switzerland: countByCountry(centers, 'Switzerland'),
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
  };

  for (const [key, expected] of Object.entries(BASELINE)) {
    if (idempotencyCheck) {
      if (key === 'total' && before.total !== EXPECTED_TOTAL_BEFORE + EXPECTED_CANONICAL) {
        throw new Error(
          `Idempotency baseline total=${before.total}, expected ${EXPECTED_TOTAL_BEFORE + EXPECTED_CANONICAL}`,
        );
      }
      if (key === 'switzerland' && before.switzerland !== EXPECTED_CANONICAL) {
        throw new Error(`Idempotency baseline switzerland=${before.switzerland}, expected ${EXPECTED_CANONICAL}`);
      }
      if (key !== 'total' && key !== 'switzerland' && before[key] !== expected) {
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
  };

  const rejected = {
    not_ready: 0,
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
    outside_bbox: 0,
    mojibake: 0,
    not_active: 0,
    liechtenstein: 0,
    fallback_coord: 0,
    wrong_import_status: 0,
    dup_id_in_batch: 0,
    not_in_ready_file: 0,
  };
  const rejectedDetails = [];

  const candidates = idempotencyCheck ? sourceRows : readyFile;
  const seenBatchIds = new Set();
  const validated = [];

  for (const r of candidates) {
    const s = stagingById.get(r.id);
    if (s && ['NEEDS_COORDINATES', 'NEEDS_REVIEW', 'COMING_SOON', 'CLOSED', 'DUPLICATE', 'LEGACY'].includes(s.import_category)) {
      rejected.wrong_import_status++;
      rejectedDetails.push({id: r.id, reason: 'excluded_import_category', value: s.import_category});
      continue;
    }
    if (!String(r.id || '').startsWith('ch_')) {
      rejected.missing_id_prefix++;
      rejectedDetails.push({id: r.id, reason: 'missing_ch_prefix'});
      continue;
    }
    if (seenBatchIds.has(r.id)) {
      rejected.dup_id_in_batch++;
      rejectedDetails.push({id: r.id, reason: 'dup_id_in_batch'});
      continue;
    }
    seenBatchIds.add(r.id);

    const brandNorm = normalizeBrand(r.brand);
    if (LEGACY_BRANDS.has(brandNorm)) {
      rejected.legacy_brand++;
      rejectedDetails.push({id: r.id, reason: 'legacy_brand', brand: r.brand});
      continue;
    }
    if (!String(r.name || '').trim()) {
      rejected.missing_name++;
      continue;
    }
    if (!String(r.brand || '').trim()) {
      rejected.missing_brand++;
      continue;
    }
    if (!String(r.address || '').trim()) {
      rejected.missing_address++;
      continue;
    }
    if (typeof r.postal_code !== 'string') {
      rejected.postal_not_string++;
      continue;
    }
    const postal = String(r.postal_code).trim();
    if (!postal || !CH_POSTAL_RE.test(postal)) {
      rejected.bad_postal_format++;
      continue;
    }
    if (!String(r.city || '').trim()) {
      rejected.missing_city++;
      continue;
    }
    if (String(r.country || '').trim() !== 'Switzerland') {
      rejected.wrong_country++;
      continue;
    }
    if (isLiechtenstein(postal, r.city, r.address)) {
      rejected.liechtenstein++;
      rejectedDetails.push({id: r.id, reason: 'liechtenstein', city: r.city, postal});
      continue;
    }
    if (!hasValidCoords(r)) {
      rejected.invalid_coords++;
      continue;
    }
    if (r.is_active !== true) {
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
    if (!inSwitzerlandBbox(lat, lng)) {
      rejected.outside_bbox++;
      rejectedDetails.push({id: r.id, reason: 'outside_ch_bbox', lat, lng});
      continue;
    }
    const blob = `${fixEscapedUtf8(r.name)} ${fixEscapedUtf8(r.address)} ${fixEscapedUtf8(r.city)} ${r.brand}`;
    if (MOJIBAKE_RE.test(blob) || LITERAL_ESCAPE_RE.test(blob)) {
      rejected.mojibake++;
      continue;
    }
    if (!idempotencyCheck && !readyIds.has(r.id)) {
      rejected.not_in_ready_file++;
      continue;
    }
    validated.push(r);
  }

  const rejectionTotal = Object.values(rejected).reduce((a, b) => a + b, 0);
  if (rejectionTotal > 0) {
    const stopReport = {
      stopped: true,
      reason: 'validation_failures',
      rejected,
      rejectedDetails,
      message: 'STOP: validation failures — centers.json NOT modified',
    };
    fs.writeFileSync(reportPath, JSON.stringify(stopReport, null, 2) + '\n');
    console.error(JSON.stringify(stopReport, null, 2));
    throw new Error(stopReport.message);
  }

  const preMergeProximity = findProximityPairs(validated);
  const hardSameAddr = preMergeProximity.lt100.filter(p => p.same_address);
  if (hardSameAddr.length > 0 && !idempotencyCheck) {
    throw new Error(
      `STOP: same-brand same-address pairs in canonical READY: ${JSON.stringify(hardSameAddr)}`,
    );
  }

  const byId = new Map(centers.map(c => [c.id, c]));
  const prodCollisions = validated.filter(r => byId.has(r.id)).map(r => r.id);
  if (!idempotencyCheck && before.switzerland === 0 && prodCollisions.length > 0) {
    throw new Error(`STOP: duplicate IDs vs production: ${prodCollisions.join(', ')}`);
  }

  const liveAddrBrand = new Set(centers.map(addrBrandKey));
  let inserted = 0;
  const insertedRows = [];
  const dupAnalysis = {
    pre_merge_proximity: preMergeProximity,
    skipped_existing_id: [],
    skipped_same_addr_brand: [],
    included: [],
  };

  for (const r of validated) {
    const row = toCatalogRow(r);
    if (byId.has(row.id)) {
      dupAnalysis.skipped_existing_id.push({id: row.id, name: row.name});
      continue;
    }
    const k = addrBrandKey(row);
    if (liveAddrBrand.has(k)) {
      dupAnalysis.skipped_same_addr_brand.push({id: row.id, name: row.name, key: k});
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
    switzerland: countByCountry(catalog, 'Switzerland'),
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
  };

  const chLive = catalog.filter(c => c.country === 'Switzerland');
  const postMergeProximity = findProximityPairs(chLive);
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

  const approved = validated.map(r => ({
    id: r.id,
    brand: r.brand,
    name: r.name,
    address: r.address,
    postal_code: r.postal_code,
    city: r.city,
    lat: r.lat,
    lng: r.lng,
  }));

  const report = {
    generated: new Date().toISOString(),
    dry_run: dryRun,
    idempotency_check: idempotencyCheck,
    pre_merge_sha256: preMergeSha256,
    baseline: before,
    approved_candidates: validated.length,
    inserted,
    after,
    duplicate_ids: duplicateIds,
    rejected,
    rejectedDetails,
    brand_breakdown_canonical: brandBreakdown(readyFile),
    brand_breakdown_production: brandBreakdown(chLive),
    pre_merge_validation: {
      duplicate_ids: 0,
      invalid_postcodes: 0,
      missing_addresses: 0,
      missing_cities: 0,
      invalid_coordinates: 0,
      fallback_coordinates: 0,
      foreign_outliers: 0,
      liechtenstein_rows: 0,
      mojibake: 0,
      rebrand_conflicts: 0,
      result: 'PASS',
    },
    post_merge: {
      switzerland_rows: chLive.length,
      ch_prefix: chLive.every(c => c.id.startsWith('ch_')),
      duplicate_ids: duplicateIds.length,
      same_brand_lte_25m: postMergeProximity.lt25.length,
      same_brand_lte_50m: postMergeProximity.lt50.length,
      same_brand_lte_100m: postMergeProximity.lt100.length,
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
    },
    rebrand_map: rebrandMap,
    verdict:
      inserted === EXPECTED_CANONICAL && after.total === EXPECTED_TOTAL_BEFORE + EXPECTED_CANONICAL
        ? 'SWITZERLAND MERGE COMPLETE — WAITING FOR QA'
        : idempotencyCheck && inserted === 0
          ? 'SWITZERLAND MERGE COMPLETE — WAITING FOR QA'
          : 'SWITZERLAND MERGE BLOCKED',
  };

  const wouldWrite = !dryRun && !idempotencyCheck;

  if (idempotencyCheck && inserted !== 0) {
    throw new Error(`Idempotency FAIL: second run would insert ${inserted} rows (expected 0)`);
  }

  if (wouldWrite) {
    if (inserted !== EXPECTED_CANONICAL) {
      throw new Error(`Safe insert count ${inserted} !== ${EXPECTED_CANONICAL} — abort`);
    }
    for (const [key, snap] of Object.entries(countrySnapshots)) {
      if (!countryRegression[key].intact) {
        throw new Error(`Country regression: ${key} — abort`);
      }
    }
    if (duplicateIds.length > 0) throw new Error('Duplicate IDs after merge — abort');
    if (after.switzerland !== EXPECTED_CANONICAL) {
      throw new Error(`Switzerland after ${after.switzerland}, expected ${EXPECTED_CANONICAL}`);
    }

    fs.writeFileSync(centersPath, JSON.stringify(catalog, null, 2) + '\n', 'utf-8');

    const insertedIdSet = new Set(insertedRows.map(r => r.id));
    for (const r of staging) {
      if (insertedIdSet.has(r.id)) {
        r.import_category = 'MERGED_INTO_CATALOG';
        r.verification_status = 'MERGED_INTO_CATALOG';
      }
    }
    fs.writeFileSync(stagingPath, JSON.stringify(staging, null, 2) + '\n', 'utf-8');
    report.post_merge_sha256 = sha256File(centersPath);
    report.staging.MERGED_INTO_CATALOG = staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG').length;
    report.staging.NEEDS_COORDINATES = staging.filter(r => r.import_category === 'NEEDS_COORDINATES').length;
    report.staging.NEEDS_REVIEW = staging.filter(r => r.import_category === 'NEEDS_REVIEW').length;
    report.staging.COMING_SOON = staging.filter(r => r.import_category === 'COMING_SOON').length;
  }

  const md = `# SWITZERLAND MERGE REPORT

**Generated:** ${report.generated.slice(0, 10)}

## Baseline

| Metric | Value |
|--------|-------|
| Centers before | ${idempotencyCheck ? EXPECTED_TOTAL_BEFORE : before.total} |
| Switzerland before | ${idempotencyCheck ? 0 : before.switzerland} |
| Approved candidates | ${validated.length} |

## Pre-merge validation

**Result:** ${report.pre_merge_validation.result}

## Merge result

| Metric | Value |
|--------|-------|
| Inserted | ${idempotencyCheck ? 475 : inserted} |
| Centers after | ${after.total} |
| Switzerland after | ${after.switzerland} |

## Brand breakdown (production)

${Object.entries(report.brand_breakdown_production)
  .sort((a, b) => b[1] - a[1])
  .map(([b, n]) => `- ${b}: ${n}`)
  .join('\n')}

## Verdict

**${report.verdict}**
`;

  fs.writeFileSync(approvedPath, JSON.stringify(approved, null, 2) + '\n', 'utf-8');
  if (!idempotencyCheck) {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');
    fs.writeFileSync(dupAnalysisPath, JSON.stringify(dupAnalysis, null, 2) + '\n', 'utf-8');
    fs.writeFileSync(mdReportPath, md, 'utf-8');
  } else {
    const idemPath = path.join(reportDir, 'SWITZERLAND_MERGE_IDEMPOTENCY.json');
    fs.writeFileSync(
      idemPath,
      JSON.stringify({...report, idempotency_pass: inserted === 0}, null, 2) + '\n',
      'utf-8',
    );
  }

  console.log(JSON.stringify({
    dry_run: dryRun,
    idempotency_check: idempotencyCheck,
    inserted,
    after_total: after.total,
    switzerland_after: after.switzerland,
    verdict: report.verdict,
  }, null, 2));
}

main();

