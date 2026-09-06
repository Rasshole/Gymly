/**
 * Germany first (and final) safe production merge.
 *
 * Merges ONLY READY_TO_IMPORT rows from data/germany/germany_centers_staging.json
 * into src/data/centers.json.
 *
 * Excludes: NEEDS_*, COMING_SOON, CLOSED, EMS-only, hubs, FitnessLOFT, wellyou.
 *
 * Usage:
 *   node scripts/import-germany-centers-phase3-merge.mjs --dry-run
 *   node scripts/import-germany-centers-phase3-merge.mjs
 *   node scripts/import-germany-centers-phase3-merge.mjs --idempotency-check
 *
 * Does NOT geocode. Does NOT delete staging/research files.
 */
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const stagingPath = path.join(root, 'data/germany/germany_centers_staging.json');
const reportDir = path.join(root, 'data/germany/phase3');
const reportPath = path.join(reportDir, 'GERMANY_MERGE_REPORT.json');
const mdReportPath = path.join(root, 'data/germany/GERMANY_MERGE_REPORT.md');
const approvedPath = path.join(reportDir, 'GERMANY_APPROVED_FOR_MERGE.json');
const dupAnalysisPath = path.join(reportDir, 'GERMANY_MERGE_DUPLICATE_ANALYSIS.json');

const dryRun = process.argv.includes('--dry-run');
const idempotencyCheck = process.argv.includes('--idempotency-check');

const DE_BOUNDS = {latMin: 47.0, latMax: 55.15, lngMin: 5.7, lngMax: 15.1};

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

function inGermanyBbox(lat, lng) {
  return lat >= DE_BOUNDS.latMin && lat <= DE_BOUNDS.latMax && lng >= DE_BOUNDS.lngMin && lng <= DE_BOUNDS.lngMax;
}

function normalizeBrand(b) {
  return String(b || '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeAddr(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function addrBrandKey(r) {
  return [
    normalizeAddr(r.address || ''),
    String(r.postal_code || ''),
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

function isEmsOnly(r) {
  const name = String(r.name || '');
  const brand = String(r.brand || '');
  const notes = String(r.notes || '');
  if (/ems_only/i.test(notes)) return true;
  if (/\bEMS\b/i.test(name)) return true;
  if (/easyfitness/i.test(brand) && /\bems\b/i.test(name)) return true;
  return false;
}

function isBlockedBrand(r) {
  const b = normalizeBrand(r.brand);
  const n = normalizeBrand(r.name);
  if (b.includes('fitnessloft') || n.includes('fitnessloft')) return true;
  if (b === 'wellyou' || b.startsWith('wellyou ') || n.startsWith('wellyou ')) return true;
  return false;
}

function isHub(r) {
  const name = String(r.name || '');
  const notes = String(r.notes || '');
  if (name.includes('{{')) return true;
  if (/listing_hub_not_a_club/i.test(notes)) return true;
  if (/\d+\s*x\s+in\s+/i.test(name)) return true;
  if (/entdecke dein/i.test(name)) return true;
  return false;
}

function isGermanyCountry(c) {
  const v = String(c || '')
    .trim()
    .toLowerCase();
  return v === 'germany' || v === 'de' || v === 'deutschland' || v === 'tyskland';
}

function isApprovedReady(r) {
  if (r.import_category === 'MERGED_INTO_CATALOG') return false;
  if (r.import_category !== 'READY_TO_IMPORT') return false;
  if (r.verification_status === 'CLOSED' || r.import_category === 'CLOSED') return false;
  if (r.verification_status === 'COMING_SOON' || r.is_coming_soon) return false;
  if (isEmsOnly(r)) return false;
  if (isBlockedBrand(r)) return false;
  if (isHub(r)) return false;
  if (!hasValidCoords(r)) return false;
  if (!String(r.address || '').trim()) return false;
  if (!String(r.city || '').trim()) return false;
  if (!String(r.postal_code || '').trim()) return false;
  if (!isGermanyCountry(r.country)) return false;
  if (!String(r.id || '').startsWith('de_')) return false;
  return true;
}

function toCatalogRow(r) {
  return {
    id: r.id,
    name: r.name,
    brand: r.brand,
    address: r.address || '',
    postal_code: String(r.postal_code || ''),
    city: r.city,
    country: 'Germany',
    lat: Number(r.lat),
    lng: Number(r.lng),
    is_active: true,
  };
}

function germanCharIntegrity(text) {
  // Flag replacement chars / classic mojibake, not absence of umlauts
  const s = String(text || '');
  if (s.includes('\uFFFD')) return false;
  if (/Ã¤|Ã¶|Ã¼|ÃŸ|Ã„|Ã–|Ãœ/.test(s)) return false;
  return true;
}

function countByCountry(centers, country) {
  return centers.filter(c => c.country === country).length;
}

function main() {
  const centers = JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8'));

  const before = {
    total: centers.length,
    germany: countByCountry(centers, 'Germany'),
    denmark: countByCountry(centers, 'Denmark'),
    sweden: countByCountry(centers, 'Sweden'),
    norway: countByCountry(centers, 'Norway'),
  };

  const dkBefore = centers.filter(c => c.country === 'Denmark').map(c => ({...c}));
  const seBefore = centers.filter(c => c.country === 'Sweden').map(c => ({...c}));
  const noBefore = centers.filter(c => c.country === 'Norway').map(c => ({...c}));

  const candidates = staging.filter(isApprovedReady);
  const bboxOutliers = [];
  const approved = [];
  for (const r of candidates) {
    const lat = Number(r.lat);
    const lng = Number(r.lng);
    if (!inGermanyBbox(lat, lng)) {
      bboxOutliers.push({
        id: r.id,
        name: r.name,
        lat,
        lng,
        note: 'outside_de_bbox_excluded_from_merge_not_deleted_from_staging',
      });
      continue;
    }
    approved.push(r);
  }

  const byId = new Map(centers.map(c => [c.id, c]));
  const liveDe = centers.filter(c => isGermanyCountry(c.country));
  const liveAddrBrand = new Set(centers.map(addrBrandKey));

  const dupAnalysis = {
    skipped_existing_id: [],
    skipped_same_addr_brand: [],
    skipped_proximity_same_brand: [],
    skipped_batch_dup_addr_brand: [],
    skipped_non_germany_id_collision: [],
    allowed_colocated_different_brand: [],
    bbox_outliers_excluded: bboxOutliers,
    included: [],
  };

  let inserted = 0;
  const insertedRows = [];
  const batchAddrBrand = new Set();

  for (const r of approved) {
    const row = toCatalogRow(r);

    if (byId.has(row.id)) {
      const existing = byId.get(row.id);
      if (existing.country && existing.country !== 'Germany') {
        dupAnalysis.skipped_non_germany_id_collision.push({
          id: row.id,
          name: row.name,
          existing_country: existing.country,
        });
        continue;
      }
      dupAnalysis.skipped_existing_id.push({id: row.id, name: row.name});
      continue;
    }

    const k = addrBrandKey(row);
    if (liveAddrBrand.has(k) || batchAddrBrand.has(k)) {
      const target = liveAddrBrand.has(k)
        ? dupAnalysis.skipped_same_addr_brand
        : dupAnalysis.skipped_batch_dup_addr_brand;
      target.push({id: row.id, name: row.name, key: k});
      continue;
    }

    const proxLive = [];
    for (const live of liveDe) {
      if (!hasValidCoords(live)) continue;
      if (normalizeBrand(live.brand) !== normalizeBrand(row.brand)) continue;
      const d = haversineMeters(row.lat, row.lng, live.lat, live.lng);
      if (d <= 50) {
        proxLive.push({live_id: live.id, live_name: live.name, distance_m: Math.round(d)});
      }
    }
    if (proxLive.length) {
      dupAnalysis.skipped_proximity_same_brand.push({
        id: row.id,
        name: row.name,
        matches: proxLive,
      });
      continue;
    }

    let batchProxHit = null;
    for (const acc of insertedRows) {
      if (normalizeBrand(acc.brand) !== normalizeBrand(row.brand)) continue;
      const d = haversineMeters(row.lat, row.lng, acc.lat, acc.lng);
      if (d <= 50) {
        batchProxHit = {id: acc.id, name: acc.name, distance_m: Math.round(d)};
        break;
      }
    }
    if (batchProxHit) {
      dupAnalysis.skipped_proximity_same_brand.push({
        id: row.id,
        name: row.name,
        matches: [batchProxHit],
        within_batch: true,
      });
      continue;
    }

    byId.set(row.id, row);
    liveAddrBrand.add(k);
    batchAddrBrand.add(k);
    liveDe.push(row);
    inserted++;
    insertedRows.push(row);
    dupAnalysis.included.push({
      id: row.id,
      name: row.name,
      brand: row.brand,
      address: row.address,
      postal_code: row.postal_code,
      city: row.city,
      lat: row.lat,
      lng: row.lng,
    });
  }

  const next = [...centers.filter(c => !insertedRows.some(r => r.id === c.id)), ...insertedRows];
  // Keep original order for existing rows, append Germany at end (same as Norway pattern used Map values which reordered).
  // Prefer: existing centers unchanged order + appended new Germany rows.
  const existingIds = new Set(centers.map(c => c.id));
  const preserved = centers.map(c => c); // identity, no field rewrite
  const appended = insertedRows.filter(r => !existingIds.has(r.id));
  const catalog = [...preserved, ...appended];

  const after = {
    total: catalog.length,
    germany: countByCountry(catalog, 'Germany'),
    denmark: countByCountry(catalog, 'Denmark'),
    sweden: countByCountry(catalog, 'Sweden'),
    norway: countByCountry(catalog, 'Norway'),
  };

  const idCounts = new Map();
  for (const c of catalog) idCounts.set(c.id, (idCounts.get(c.id) || 0) + 1);
  const duplicateIds = [...idCounts.entries()].filter(([, n]) => n > 1).map(([id]) => id);

  const germanyLive = catalog.filter(c => c.country === 'Germany');
  const sameBrandPhysical = [];
  for (let i = 0; i < germanyLive.length; i++) {
    const a = germanyLive[i];
    if (!hasValidCoords(a)) continue;
    for (let j = i + 1; j < germanyLive.length; j++) {
      const b = germanyLive[j];
      if (!hasValidCoords(b)) continue;
      if (normalizeBrand(a.brand) !== normalizeBrand(b.brand)) continue;
      const d = haversineMeters(a.lat, a.lng, b.lat, b.lng);
      if (d <= 50) {
        sameBrandPhysical.push({
          a_id: a.id,
          a_name: a.name,
          b_id: b.id,
          b_name: b.name,
          distance_m: Math.round(d),
        });
      }
    }
  }

  const missingAddress = germanyLive.filter(c => !String(c.address || '').trim()).length;
  const missingPostal = germanyLive.filter(c => !String(c.postal_code || '').trim()).length;
  const missingCity = germanyLive.filter(c => !String(c.city || '').trim()).length;
  const missingCoords = germanyLive.filter(c => !hasValidCoords(c)).length;
  const invalidCoords = germanyLive.filter(c => {
    if (c.lat == null || c.lng == null) return true;
    if (!Number.isFinite(Number(c.lat)) || !Number.isFinite(Number(c.lng))) return true;
    if (Number(c.lat) === 0 && Number(c.lng) === 0) return true;
    return false;
  });
  const coordOutliers = germanyLive.filter(c => hasValidCoords(c) && !inGermanyBbox(Number(c.lat), Number(c.lng)));

  const germanCharFail = germanyLive.filter(
    c =>
      !germanCharIntegrity(c.name) ||
      !germanCharIntegrity(c.address) ||
      !germanCharIntegrity(c.city) ||
      !germanCharIntegrity(c.brand),
  );

  const umlautPresent = germanyLive.filter(c => /[äöüÄÖÜß]/.test(`${c.name} ${c.address} ${c.city}`)).length;

  const byBrand = {};
  for (const r of germanyLive) {
    byBrand[r.brand] = (byBrand[r.brand] || 0) + 1;
  }

  const dkIntact =
    dkBefore.length === after.denmark &&
    dkBefore.every(c => {
      const a = catalog.find(x => x.id === c.id);
      return a && a.lat === c.lat && a.lng === c.lng && a.name === c.name && a.brand === c.brand && a.address === c.address;
    });
  const seIntact =
    seBefore.length === after.sweden &&
    seBefore.every(c => {
      const a = catalog.find(x => x.id === c.id);
      return a && a.lat === c.lat && a.lng === c.lng && a.name === c.name && a.brand === c.brand && a.address === c.address;
    });
  const noIntact =
    noBefore.length === after.norway &&
    noBefore.every(c => {
      const a = catalog.find(x => x.id === c.id);
      return a && a.lat === c.lat && a.lng === c.lng && a.name === c.name && a.brand === c.brand && a.address === c.address;
    });

  const stagingCats = staging.reduce((acc, r) => {
    acc[r.import_category] = (acc[r.import_category] || 0) + 1;
    return acc;
  }, {});

  const emsStaged = staging.filter(isEmsOnly).length;
  const comingSoonStaged = staging.filter(r => r.import_category === 'COMING_SOON').length;
  const closedStaged = staging.filter(r => r.import_category === 'CLOSED').length;
  const needsCoordsStaged = staging.filter(r => r.import_category === 'NEEDS_COORDINATES').length;
  const needsReviewStaged = staging.filter(r => r.import_category === 'NEEDS_REVIEW').length;

  if (!dryRun && !idempotencyCheck) {
    const insertedIdSet = new Set(insertedRows.map(r => r.id));
    for (const r of staging) {
      if (insertedIdSet.has(r.id)) {
        r.import_category = 'MERGED_INTO_CATALOG';
        r.is_active = true;
        r.phase3_merge = 'approved_ready';
      }
    }
  }

  const report = {
    dry_run: dryRun,
    idempotency_check: idempotencyCheck,
    before,
    after,
    approved_candidates: approved.length,
    bbox_outliers_excluded: bboxOutliers.length,
    inserted,
    skipped_existing_id: dupAnalysis.skipped_existing_id.length,
    skipped_same_addr_brand: dupAnalysis.skipped_same_addr_brand.length,
    skipped_proximity_same_brand: dupAnalysis.skipped_proximity_same_brand.length,
    skipped_batch_dup_addr_brand: dupAnalysis.skipped_batch_dup_addr_brand.length,
    skipped_non_germany_id_collision: dupAnalysis.skipped_non_germany_id_collision.length,
    germany_by_brand: byBrand,
    duplicate_ids_in_catalog: duplicateIds,
    duplicate_same_brand_physical: sameBrandPhysical,
    missing_address: missingAddress,
    missing_postal: missingPostal,
    missing_city: missingCity,
    missing_coordinates: missingCoords,
    invalid_coordinates: invalidCoords,
    coordinate_outliers_in_catalog: coordOutliers,
    german_character_failures: germanCharFail.length,
    german_umlaut_rows: umlautPresent,
    denmark_count: after.denmark,
    sweden_count: after.sweden,
    norway_count: after.norway,
    denmark_intact: dkIntact,
    sweden_intact: seIntact,
    norway_intact: noIntact,
    staging_categories_before_mark: stagingCats,
    excluded_still_staged: {
      NEEDS_COORDINATES: needsCoordsStaged,
      NEEDS_REVIEW: needsReviewStaged,
      COMING_SOON: comingSoonStaged,
      CLOSED: closedStaged,
      EMS_only: emsStaged,
    },
    every_new_active_has_valid_coords: insertedRows.every(
      c => hasValidCoords(c) && c.country === 'Germany' && c.is_active === true && String(c.id).startsWith('de_'),
    ),
    files_changed_if_written: [
      'src/data/centers.json',
      'data/germany/germany_centers_staging.json',
      'data/germany/phase3/GERMANY_MERGE_REPORT.json',
      'data/germany/phase3/GERMANY_APPROVED_FOR_MERGE.json',
      'data/germany/phase3/GERMANY_MERGE_DUPLICATE_ANALYSIS.json',
      'data/germany/GERMANY_MERGE_REPORT.md',
      'src/utils/gymCountry.ts',
      'src/data/centerRegistry.ts',
      'src/data/danishGyms.ts',
    ],
  };

  fs.mkdirSync(reportDir, {recursive: true});
  fs.writeFileSync(approvedPath, JSON.stringify(insertedRows, null, 2) + '\n');
  fs.writeFileSync(dupAnalysisPath, JSON.stringify(dupAnalysis, null, 2) + '\n');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

  if (!dryRun && !idempotencyCheck) {
    fs.writeFileSync(centersPath, JSON.stringify(catalog, null, 2) + '\n');
    fs.writeFileSync(stagingPath, JSON.stringify(staging, null, 2) + '\n');
    console.log('Merge written to centers.json');
  } else if (idempotencyCheck) {
    console.log('Idempotency check — no centers.json write.');
  } else {
    console.log('Dry run — centers.json not written.');
  }

  console.log(JSON.stringify(report, null, 2));
  return report;
}

main();
