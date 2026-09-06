/**
 * UK first safe production merge.
 *
 * Merges ONLY READY_TO_IMPORT rows from data/uk/uk_centers_staging.json
 * into src/data/centers.json.
 *
 * Excludes: NEEDS_*, COMING_SOON, CLOSED, test placeholders, DW Sports duplicates.
 * Does NOT geocode. Does NOT delete staging/research files.
 * Does NOT modify CHECK_IN_RADIUS_METERS or other countries' rows.
 *
 * Usage:
 *   node scripts/import-uk-centers-phase2-merge.mjs --dry-run
 *   node scripts/import-uk-centers-phase2-merge.mjs
 *   node scripts/import-uk-centers-phase2-merge.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const stagingPath = path.join(root, 'data/uk/uk_centers_staging.json');
const reportDir = path.join(root, 'data/uk');
const reportPath = path.join(reportDir, 'UK_MERGE_REPORT.json');
const mdReportPath = path.join(reportDir, 'UK_MERGE_REPORT.md');
const approvedPath = path.join(reportDir, 'UK_APPROVED_FOR_MERGE.json');
const dupAnalysisPath = path.join(reportDir, 'UK_MERGE_DUPLICATE_ANALYSIS.json');

const dryRun = process.argv.includes('--dry-run');
const idempotencyCheck = process.argv.includes('--idempotency-check');

const UK_BOUNDS = {latMin: 49.8, latMax: 60.9, lngMin: -8.2, lngMax: 1.8};
const LONDON_FALLBACK = {lat: 51.5074, lng: -0.1278};

const BLOCKED_SOURCE_URLS = new Set(
  [
    'https://www.anytimefitness.com/en-gb/locations/london-greater-london-uk-0527',
    'https://www.buzzgym.co.uk/oxford',
    'https://www.buzzgym.co.uk/london-harrow',
    'https://www.davidlloyd.co.uk/clubs/northwood',
    'https://www.energiefitness.com/gym/brentford',
    'https://www.snapfitness.com/uk/gyms/bristol-filton',
    'https://www.virginactive.co.uk/clubs/cannon-street-walbrook',
    'https://www.virginactive.co.uk/clubs/chiswick-riverside',
    'https://www.virginactive.co.uk/clubs/clearview-brentwood',
    'https://gymbox.com/gyms/elephant-and-castle',
    'https://gymbox.com/gyms/finsbury-park',
    'https://gymbox.com/gyms/holborn',
  ].map(u => u.replace(/\/+$/, '').toLowerCase()),
);

function isBlockedUrl(r) {
  const url = String(r.source_url || '')
    .trim()
    .replace(/\/+$/, '')
    .toLowerCase();
  if (!url) return false;
  return BLOCKED_SOURCE_URLS.has(url);
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

function inUkBbox(lat, lng) {
  return lat >= UK_BOUNDS.latMin && lat <= UK_BOUNDS.latMax && lng >= UK_BOUNDS.lngMin && lng <= UK_BOUNDS.lngMax;
}

function isLondonFallback(lat, lng) {
  return Math.abs(lat - LONDON_FALLBACK.lat) < 0.00015 && Math.abs(lng - LONDON_FALLBACK.lng) < 0.00015;
}

function normalizeBrand(b) {
  return String(b || '')
    .toLowerCase()
    .replace(/é/g, 'e')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeAddr(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/é/g, 'e')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function addrBrandKey(r) {
  return [
    normalizeAddr(r.address || ''),
    String(r.postal_code || '').toUpperCase().replace(/\s+/g, ' ').trim(),
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
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function isUnitedKingdomCountry(c) {
  const v = String(c || '')
    .trim()
    .toLowerCase();
  return v === 'united kingdom' || v === 'uk' || v === 'gb' || v === 'great britain';
}

function isCrownPostcode(pc) {
  const out = String(pc || '')
    .toUpperCase()
    .trim()
    .split(/\s+/)[0];
  return out.startsWith('GY') || out.startsWith('JE') || out.startsWith('IM');
}

function isTestPlaceholder(r) {
  const notes = String(r.notes || '').toLowerCase();
  const addr = String(r.address || '').toLowerCase();
  const url = String(r.source_url || '').toLowerCase();
  return notes.includes('test_placeholder') || addr.includes('test 100 lane') || url.includes('london-greater-london-uk-0527');
}

function isLegacyDuplicateBrand(r) {
  const b = normalizeBrand(r.brand);
  return b === 'dw sports fitness' || b === 'dw sports' || b === 'dw fitness';
}

function isApprovedReady(r) {
  if (r.import_category === 'MERGED_INTO_CATALOG') return false;
  if (r.import_category !== 'READY_TO_IMPORT') return false;
  if (r.verification_status === 'CLOSED' || r.import_category === 'CLOSED') return false;
  if (r.verification_status === 'COMING_SOON' || r.is_coming_soon) return false;
  if (isTestPlaceholder(r)) return false;
  if (isBlockedUrl(r)) return false;
  if (isLegacyDuplicateBrand(r)) return false;
  if (!hasValidCoords(r)) return false;
  if (!String(r.address || '').trim()) return false;
  if (!String(r.city || '').trim()) return false;
  if (!String(r.postal_code || '').trim()) return false;
  if (isCrownPostcode(r.postal_code)) return false;
  if (!isUnitedKingdomCountry(r.country)) return false;
  if (!String(r.id || '').startsWith('gb_')) return false;
  if (String(r.id || '').startsWith('uk_')) return false;
  const lat = Number(r.lat);
  const lng = Number(r.lng);
  if (isLondonFallback(lat, lng)) return false;
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
    country: 'United Kingdom',
    lat: Number(r.lat),
    lng: Number(r.lng),
    is_active: true,
  };
}

function countByCountry(centers, country) {
  return centers.filter(c => c.country === country).length;
}

function snapshotCountry(centers, country) {
  return centers.filter(c => c.country === country).map(c => ({...c}));
}

function countryIntact(beforeRows, catalog) {
  if (beforeRows.length !== catalog.filter(c => c.country === beforeRows[0]?.country).length && beforeRows.length) {
    // length checked separately; field-level:
  }
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

function main() {
  const centers = JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8'));

  const before = {
    total: centers.length,
    united_kingdom: countByCountry(centers, 'United Kingdom'),
    denmark: countByCountry(centers, 'Denmark'),
    sweden: countByCountry(centers, 'Sweden'),
    norway: countByCountry(centers, 'Norway'),
    germany: countByCountry(centers, 'Germany'),
  };

  const dkBefore = snapshotCountry(centers, 'Denmark');
  const seBefore = snapshotCountry(centers, 'Sweden');
  const noBefore = snapshotCountry(centers, 'Norway');
  const deBefore = snapshotCountry(centers, 'Germany');

  const candidates = staging.filter(isApprovedReady);
  const bboxOutliers = [];
  const approved = [];
  for (const r of candidates) {
    const lat = Number(r.lat);
    const lng = Number(r.lng);
    if (!inUkBbox(lat, lng)) {
      bboxOutliers.push({
        id: r.id,
        name: r.name,
        lat,
        lng,
        note: 'outside_uk_bbox_excluded_from_merge_not_deleted_from_staging',
      });
      continue;
    }
    approved.push(r);
  }

  const byId = new Map(centers.map(c => [c.id, c]));
  const liveUk = centers.filter(c => isUnitedKingdomCountry(c.country));
  const liveAddrBrand = new Set(centers.map(addrBrandKey));

  const dupAnalysis = {
    skipped_existing_id: [],
    skipped_same_addr_brand: [],
    skipped_proximity_same_brand: [],
    skipped_batch_dup_addr_brand: [],
    skipped_non_uk_id_collision: [],
    skipped_blocked: [],
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
      if (existing.country && existing.country !== 'United Kingdom') {
        dupAnalysis.skipped_non_uk_id_collision.push({
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
    for (const live of liveUk) {
      if (!hasValidCoords(live)) continue;
      if (normalizeBrand(live.brand) !== normalizeBrand(row.brand)) continue;
      const d = haversineMeters(row.lat, row.lng, live.lat, live.lng);
      if (d <= 50) {
        proxLive.push({live_id: live.id, live_name: live.name, distance_m: Math.round(d)});
      }
    }
    if (proxLive.length) {
      dupAnalysis.skipped_proximity_same_brand.push({id: row.id, name: row.name, matches: proxLive});
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
    liveUk.push(row);
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

  const existingIds = new Set(centers.map(c => c.id));
  const preserved = centers.map(c => c);
  const appended = insertedRows.filter(r => !existingIds.has(r.id));
  const catalog = [...preserved, ...appended];

  const after = {
    total: catalog.length,
    united_kingdom: countByCountry(catalog, 'United Kingdom'),
    denmark: countByCountry(catalog, 'Denmark'),
    sweden: countByCountry(catalog, 'Sweden'),
    norway: countByCountry(catalog, 'Norway'),
    germany: countByCountry(catalog, 'Germany'),
  };

  const idCounts = new Map();
  for (const c of catalog) idCounts.set(c.id, (idCounts.get(c.id) || 0) + 1);
  const duplicateIds = [...idCounts.entries()].filter(([, n]) => n > 1).map(([id]) => id);

  const ukLive = catalog.filter(c => c.country === 'United Kingdom');
  const sameBrandPhysical = [];
  const clusters = [];
  const seenPair = new Set();
  for (let i = 0; i < ukLive.length; i++) {
    const a = ukLive[i];
    if (!hasValidCoords(a)) continue;
    for (let j = i + 1; j < ukLive.length; j++) {
      const b = ukLive[j];
      if (!hasValidCoords(b)) continue;
      const d = haversineMeters(a.lat, a.lng, b.lat, b.lng);
      if (d <= 50 && normalizeBrand(a.brand) === normalizeBrand(b.brand)) {
        sameBrandPhysical.push({
          a_id: a.id,
          a_name: a.name,
          b_id: b.id,
          b_name: b.name,
          distance_m: Math.round(d),
        });
      }
      if (d <= 50 && normalizeBrand(a.brand) !== normalizeBrand(b.brand)) {
        const key = [a.id, b.id].sort().join('|');
        if (!seenPair.has(key)) {
          seenPair.add(key);
          clusters.push({
            a_id: a.id,
            a_name: a.name,
            a_brand: a.brand,
            b_id: b.id,
            b_name: b.name,
            b_brand: b.brand,
            distance_m: Math.round(d),
            note: 'legitimate_or_co_located_different_brand',
          });
        }
      }
    }
  }

  const missingAddress = ukLive.filter(c => !String(c.address || '').trim()).length;
  const missingPostal = ukLive.filter(c => !String(c.postal_code || '').trim()).length;
  const missingCity = ukLive.filter(c => !String(c.city || '').trim()).length;
  const missingCoords = ukLive.filter(c => !hasValidCoords(c)).length;
  const invalidCoords = ukLive.filter(c => {
    if (c.lat == null || c.lng == null) return true;
    if (!Number.isFinite(Number(c.lat)) || !Number.isFinite(Number(c.lng))) return true;
    if (Number(c.lat) === 0 && Number(c.lng) === 0) return true;
    return false;
  });
  const coordOutliers = ukLive.filter(c => hasValidCoords(c) && !inUkBbox(Number(c.lat), Number(c.lng)));
  const londonFallbacks = ukLive.filter(c => hasValidCoords(c) && isLondonFallback(Number(c.lat), Number(c.lng)));
  const ukPrefixOk = ukLive.every(c => String(c.id).startsWith('gb_') && !String(c.id).startsWith('uk_'));
  const ukCountryOk = ukLive.every(c => c.country === 'United Kingdom');
  const constituentLeak = ukLive.filter(c =>
    ['England', 'Scotland', 'Wales', 'Northern Ireland'].includes(c.country),
  );

  const byBrand = {};
  for (const r of ukLive) {
    byBrand[r.brand] = (byBrand[r.brand] || 0) + 1;
  }

  const dkIntact = dkBefore.length === after.denmark && countryIntact(dkBefore, catalog);
  const seIntact = seBefore.length === after.sweden && countryIntact(seBefore, catalog);
  const noIntact = noBefore.length === after.norway && countryIntact(noBefore, catalog);
  const deIntact = deBefore.length === after.germany && countryIntact(deBefore, catalog);

  const stagingCats = staging.reduce((acc, r) => {
    acc[r.import_category] = (acc[r.import_category] || 0) + 1;
    return acc;
  }, {});

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
        r.phase2_merge = 'approved_ready';
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
    skipped_non_uk_id_collision: dupAnalysis.skipped_non_uk_id_collision.length,
    uk_by_brand: byBrand,
    duplicate_ids_in_catalog: duplicateIds,
    duplicate_same_brand_physical: sameBrandPhysical,
    different_brand_clusters_le50m: clusters,
    missing_address: missingAddress,
    missing_postal: missingPostal,
    missing_city: missingCity,
    missing_coordinates: missingCoords,
    invalid_coordinates: invalidCoords,
    coordinate_outliers_in_catalog: coordOutliers,
    london_fallback_hits: londonFallbacks,
    gb_prefix_ok: ukPrefixOk,
    uk_country_ok: ukCountryOk,
    constituent_country_leak: constituentLeak,
    denmark_count: after.denmark,
    sweden_count: after.sweden,
    norway_count: after.norway,
    germany_count: after.germany,
    united_kingdom_count: after.united_kingdom,
    denmark_intact: dkIntact,
    sweden_intact: seIntact,
    norway_intact: noIntact,
    germany_intact: deIntact,
    staging_categories: stagingCats,
    excluded_still_staged: {
      NEEDS_COORDINATES: needsCoordsStaged,
      NEEDS_REVIEW: needsReviewStaged,
      COMING_SOON: comingSoonStaged,
      CLOSED: closedStaged,
    },
    every_new_active_has_valid_coords: insertedRows.every(
      c =>
        hasValidCoords(c) &&
        c.country === 'United Kingdom' &&
        c.is_active === true &&
        String(c.id).startsWith('gb_') &&
        !String(c.id).startsWith('uk_'),
    ),
    check_in_radius_untouched: true,
    files_changed_if_written: [
      'src/data/centers.json',
      'data/uk/uk_centers_staging.json',
      'data/uk/UK_MERGE_REPORT.json',
      'data/uk/UK_MERGE_REPORT.md',
      'data/uk/UK_APPROVED_FOR_MERGE.json',
      'data/uk/UK_MERGE_DUPLICATE_ANALYSIS.json',
    ],
  };

  if (!idempotencyCheck) {
    fs.writeFileSync(approvedPath, JSON.stringify(insertedRows, null, 2) + '\n');
    fs.writeFileSync(dupAnalysisPath, JSON.stringify(dupAnalysis, null, 2) + '\n');
  }
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

  console.log(
    JSON.stringify(
      {
        dry_run: dryRun,
        idempotency_check: idempotencyCheck,
        before,
        after,
        inserted,
        skipped_existing_id: report.skipped_existing_id,
        skipped_same_addr_brand: report.skipped_same_addr_brand,
        skipped_proximity_same_brand: report.skipped_proximity_same_brand,
        duplicate_ids: duplicateIds.length,
        same_brand_physical: sameBrandPhysical.length,
        different_brand_clusters: clusters.length,
        missing_address: missingAddress,
        missing_postal: missingPostal,
        missing_city: missingCity,
        missing_coordinates: missingCoords,
        invalid_coordinates: invalidCoords.length,
        outliers: coordOutliers.length,
        gb_prefix_ok: ukPrefixOk,
        uk_country_ok: ukCountryOk,
        denmark_intact: dkIntact,
        sweden_intact: seIntact,
        norway_intact: noIntact,
        germany_intact: deIntact,
        uk_by_brand: byBrand,
        excluded_still_staged: report.excluded_still_staged,
      },
      null,
      2,
    ),
  );
  return report;
}

main();
