/**
 * Norway Phase 3 final safe merge.
 *
 * Merges all READY_TO_IMPORT rows with valid coords from:
 *   - data/norway/norway_centers_staging.json
 *   - data/norway/phase2_new_centers_staging.json
 *   - data/norway/phase3/phase3_new_centers_staging.json
 *
 * Includes previously soft-postal rows that are READY_TO_IMPORT (Phase 3 approved).
 * Excludes unresolved, coming-soon, Feelgood, NEXT-as-separate-brand.
 *
 * Usage:
 *   node scripts/import-norway-centers-phase3-merge.mjs --dry-run
 *   node scripts/import-norway-centers-phase3-merge.mjs
 *   node scripts/import-norway-centers-phase3-merge.mjs --idempotency-check
 *
 * Does NOT geocode. Does NOT delete unresolved staging.
 */
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const stagingPath = path.join(root, 'data/norway/norway_centers_staging.json');
const phase2Path = path.join(root, 'data/norway/phase2_new_centers_staging.json');
const phase3Path = path.join(root, 'data/norway/phase3/phase3_new_centers_staging.json');
const reportPath = path.join(root, 'data/norway/phase3/phase3_merge_report.json');
const approvedPath = path.join(root, 'data/norway/phase3/phase3_APPROVED_FOR_MERGE.json');
const dupAnalysisPath = path.join(root, 'data/norway/phase3/phase3_merge_duplicate_analysis.json');

const dryRun = process.argv.includes('--dry-run');
const idempotencyCheck = process.argv.includes('--idempotency-check');

const BLOCKED_BRANDS = new Set(['feelgood', 'next']);

function hasValidCoords(r) {
  return (
    r.lat != null &&
    r.lng != null &&
    Number.isFinite(r.lat) &&
    Number.isFinite(r.lng) &&
    !(r.lat === 0 && r.lng === 0)
  );
}

function normalizeBrand(b) {
  return String(b || '')
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeAddr(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function addrBrandKey(r) {
  return [
    normalizeAddr(r.address || ''),
    String(r.postal_code || r.postal_code || ''),
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

function isBlockedBrand(r) {
  const b = normalizeBrand(r.brand);
  const n = normalizeBrand(r.name);
  if (BLOCKED_BRANDS.has(b)) return true;
  // Feelgood / NEXT as primary brand name only — do not block Feel24 Feelgood Harstad style if already DUPLICATE
  if (b === 'feelgood' || b.startsWith('feelgood ')) return true;
  if (b === 'next' || b === 'next trening') return true;
  if (n.startsWith('feelgood ') && !n.includes('feel24')) return true;
  return false;
}

function isApprovedReady(r) {
  if (r.import_category !== 'READY_TO_IMPORT') return false;
  if (r.is_coming_soon) return false;
  if (String(r.import_category || '').includes('COMING_SOON')) return false;
  if (!hasValidCoords(r)) return false;
  if (!r.address || !String(r.address).trim()) return false;
  if (!r.city || !String(r.city).trim()) return false;
  // postal preferred but soft-postal approved rows have postal; require it for production
  if (!r.postal_code || !String(r.postal_code).trim()) return false;
  if ((r.country || 'Norway') !== 'Norway') return false;
  if (isBlockedBrand(r)) return false;
  return true;
}

function toCatalogRow(r) {
  return {
    id: r.id,
    name: r.name,
    brand: r.brand,
    address: r.address || '',
    postal_code: r.postal_code || '',
    city: r.city,
    country: 'Norway',
    lat: r.lat,
    lng: r.lng,
    is_active: true,
  };
}

function collectCandidates(staging, phase2, phase3) {
  const pools = [
    ...staging.filter(r => r.import_category !== 'MERGED_INTO_CATALOG'),
    ...phase2.filter(r => r.import_category !== 'MERGED_INTO_CATALOG'),
    ...phase3.filter(r => r.import_category !== 'MERGED_INTO_CATALOG'),
  ];
  const byId = new Map();
  for (const r of pools) {
    if (!isApprovedReady(r)) continue;
    if (!byId.has(r.id)) byId.set(r.id, r);
  }
  return [...byId.values()];
}

function findProximityDupes(candidate, liveNo, thresholdM = 50) {
  const hits = [];
  for (const live of liveNo) {
    if (!hasValidCoords(live)) continue;
    if (normalizeBrand(live.brand) !== normalizeBrand(candidate.brand)) continue;
    const d = haversineMeters(candidate.lat, candidate.lng, live.lat, live.lng);
    if (d <= thresholdM) {
      hits.push({
        live_id: live.id,
        live_name: live.name,
        live_address: live.address,
        distance_m: Math.round(d),
      });
    }
  }
  return hits;
}

function main() {
  const centers = JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8'));
  const phase2 = JSON.parse(fs.readFileSync(phase2Path, 'utf8'));
  const phase3 = fs.existsSync(phase3Path)
    ? JSON.parse(fs.readFileSync(phase3Path, 'utf8'))
    : [];

  const before = {
    total: centers.length,
    norway: centers.filter(c => c.country === 'Norway').length,
    denmark: centers.filter(c => c.country === 'Denmark').length,
    sweden: centers.filter(c => c.country === 'Sweden').length,
  };

  let approved = collectCandidates(staging, phase2, phase3);

  // Snapshot DK/SE for integrity
  const dkBefore = centers.filter(c => c.country === 'Denmark');
  const seBefore = centers.filter(c => c.country === 'Sweden');

  const byId = new Map(centers.map(c => [c.id, c]));
  const liveNo = centers.filter(c => c.country === 'Norway');
  const liveAddrBrand = new Set(liveNo.map(addrBrandKey));
  // Also index live Norway by id
  const liveNoIds = new Set(liveNo.map(c => c.id));

  const dupAnalysis = {
    skipped_existing_id: [],
    skipped_same_addr_brand: [],
    skipped_proximity_same_brand: [],
    skipped_non_norway_id_collision: [],
    skipped_batch_dup_addr_brand: [],
    allowed_colocated_different_brand: [],
    included: [],
  };

  let inserted = 0;
  const insertedRows = [];
  const batchAddrBrand = new Set();

  for (const r of approved) {
    const row = toCatalogRow(r);

    if (byId.has(row.id)) {
      const existing = byId.get(row.id);
      if (existing.country && existing.country !== 'Norway') {
        dupAnalysis.skipped_non_norway_id_collision.push({
          id: row.id,
          name: row.name,
          existing_country: existing.country,
        });
        continue;
      }
      // Already in catalog (idempotent / already merged)
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

    // Same-brand proximity against live
    const prox = findProximityDupes(row, liveNo, 50);
    if (prox.length) {
      // If address text differs substantially, still skip same-brand <50m as likely duplicate
      dupAnalysis.skipped_proximity_same_brand.push({
        id: row.id,
        name: row.name,
        address: row.address,
        matches: prox,
      });
      continue;
    }

    // Also check against already-accepted batch rows (same brand proximity)
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
        address: row.address,
        matches: [batchProxHit],
        within_batch: true,
      });
      continue;
    }

    byId.set(row.id, row);
    liveAddrBrand.add(k);
    batchAddrBrand.add(k);
    liveNo.push(row); // so later candidates see it for proximity
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
      soft_postal_approved: Boolean(
        r.phase3_soft_postal_decision === 'approved' ||
          (r.geocode_reasons || []).some(x => String(x).includes('postal_mismatch_soft')),
      ),
    });
  }

  const next = [...byId.values()];
  const after = {
    total: next.length,
    norway: next.filter(c => c.country === 'Norway').length,
    denmark: next.filter(c => c.country === 'Denmark').length,
    sweden: next.filter(c => c.country === 'Sweden').length,
  };

  // Duplicate IDs in catalog
  const ids = next.map(c => c.id);
  const idCounts = new Map();
  for (const id of ids) idCounts.set(id, (idCounts.get(id) || 0) + 1);
  const duplicateIds = [...idCounts.entries()].filter(([, n]) => n > 1).map(([id]) => id);

  // Same-brand physical dups among NEW only vs live (should be 0 after filters)
  const sameBrandPhysical = [];
  for (const neu of insertedRows) {
    for (const live of centers.filter(c => c.country === 'Norway')) {
      if (normalizeBrand(live.brand) !== normalizeBrand(neu.brand)) continue;
      if (!hasValidCoords(live)) continue;
      const d = haversineMeters(neu.lat, neu.lng, live.lat, live.lng);
      if (d <= 50) {
        sameBrandPhysical.push({
          new_id: neu.id,
          new_name: neu.name,
          live_id: live.id,
          live_name: live.name,
          distance_m: Math.round(d),
        });
      }
    }
  }

  // Mark staging merged
  const insertedIdSet = new Set(insertedRows.map(r => r.id));
  const markMerged = (rows, source) => {
    for (const r of rows) {
      if (insertedIdSet.has(r.id)) {
        r.import_category = 'MERGED_INTO_CATALOG';
        r.is_active = true;
        r.phase3_merge = 'approved_ready';
        r.phase3_merge_source = source;
      }
    }
  };
  markMerged(staging, 'norway_centers_staging');
  markMerged(phase2, 'phase2_new_centers_staging');
  markMerged(phase3, 'phase3_new_centers_staging');

  const unresolvedCats = new Set([
    'NEEDS_COORDINATES',
    'NEEDS_REVIEW',
    'SOFT_POSTAL_WITHHELD',
    'SKIP_INCOMPLETE',
    'COMING_SOON',
    'DUPLICATE_EXISTING',
    'LEGACY_DUPLICATE',
    'CLOSED',
  ]);
  const unresolvedRemaining = [...staging, ...phase2, ...phase3].filter(
    r =>
      r.import_category !== 'MERGED_INTO_CATALOG' &&
      (unresolvedCats.has(r.import_category) ||
        r.import_category === 'READY_TO_IMPORT'), // any READY left = skipped dupes still staged
  );

  const byBrand = {};
  for (const r of insertedRows) {
    byBrand[r.brand] = (byBrand[r.brand] || 0) + 1;
  }

  const invalidNew = insertedRows.filter(
    c =>
      c.lat == null ||
      c.lng == null ||
      !Number.isFinite(c.lat) ||
      !Number.isFinite(c.lng) ||
      (c.lat === 0 && c.lng === 0) ||
      c.country !== 'Norway' ||
      c.is_active !== true,
  );

  // DK/SE byte-level identity check (IDs + lat/lng)
  const dkAfter = next.filter(c => c.country === 'Denmark');
  const seAfter = next.filter(c => c.country === 'Sweden');
  const dkIntact =
    dkBefore.length === dkAfter.length &&
    dkBefore.every((c, i) => {
      const a = dkAfter.find(x => x.id === c.id);
      return a && a.lat === c.lat && a.lng === c.lng && a.name === c.name && a.brand === c.brand;
    });
  const seIntact =
    seBefore.length === seAfter.length &&
    seBefore.every(c => {
      const a = seAfter.find(x => x.id === c.id);
      return a && a.lat === c.lat && a.lng === c.lng && a.name === c.name && a.brand === c.brand;
    });

  const softIncluded = dupAnalysis.included.filter(x => x.soft_postal_approved).length;

  const report = {
    dry_run: dryRun,
    idempotency_check: idempotencyCheck,
    before,
    after,
    approved_candidates: approved.length,
    inserted,
    skipped_existing_id: dupAnalysis.skipped_existing_id.length,
    skipped_same_addr_brand: dupAnalysis.skipped_same_addr_brand.length,
    skipped_proximity_same_brand: dupAnalysis.skipped_proximity_same_brand.length,
    skipped_batch_dup_addr_brand: dupAnalysis.skipped_batch_dup_addr_brand.length,
    skipped_non_norway_id_collision: dupAnalysis.skipped_non_norway_id_collision.length,
    soft_postal_included: softIncluded,
    by_brand_added: byBrand,
    duplicate_ids_in_catalog: duplicateIds,
    duplicate_same_brand_physical_new_vs_live: sameBrandPhysical,
    every_new_has_valid_coords: invalidNew.length === 0,
    invalid_new: invalidNew,
    denmark_count: after.denmark,
    sweden_count: after.sweden,
    denmark_intact: dkIntact,
    sweden_intact: seIntact,
    unresolved_remaining: unresolvedRemaining.length,
    unresolved_by_category: unresolvedRemaining.reduce((acc, r) => {
      acc[r.import_category] = (acc[r.import_category] || 0) + 1;
      return acc;
    }, {}),
    feelgood_excluded: true,
    next_chain_excluded: true,
    coming_soon_not_activated: true,
    files_changed_if_written: [
      'src/data/centers.json',
      'data/norway/norway_centers_staging.json',
      'data/norway/phase2_new_centers_staging.json',
      'data/norway/phase3/phase3_new_centers_staging.json',
      'data/norway/phase3/phase3_merge_report.json',
      'data/norway/phase3/phase3_APPROVED_FOR_MERGE.json',
      'data/norway/phase3/phase3_merge_duplicate_analysis.json',
    ],
  };

  fs.writeFileSync(approvedPath, JSON.stringify(insertedRows, null, 2) + '\n');
  fs.writeFileSync(dupAnalysisPath, JSON.stringify(dupAnalysis, null, 2) + '\n');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

  if (!dryRun && !idempotencyCheck) {
    fs.writeFileSync(centersPath, JSON.stringify(next, null, 2) + '\n');
    fs.writeFileSync(stagingPath, JSON.stringify(staging, null, 2) + '\n');
    fs.writeFileSync(phase2Path, JSON.stringify(phase2, null, 2) + '\n');
    fs.writeFileSync(phase3Path, JSON.stringify(phase3, null, 2) + '\n');
    console.log('Merge written to centers.json');
  } else if (idempotencyCheck) {
    // Re-run candidate collection against already-merged staging; do not write centers
    console.log('Idempotency check — no centers.json write.');
  } else {
    console.log('Dry run — centers.json not written.');
  }

  console.log(JSON.stringify(report, null, 2));
  return report;
}

main();
