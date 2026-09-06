/**
 * Safe Phase 2 merge: only high-confidence READY_TO_IMPORT Norway centers.
 *
 * Excludes:
 * - soft postal match / geocode_suspicious
 * - ambiguous / needs coords / needs review / incomplete
 * - coming soon
 *
 * Usage:
 *   node scripts/import-norway-centers-phase2-merge.mjs
 *   node scripts/import-norway-centers-phase2-merge.mjs --dry-run
 *
 * Does NOT run geocode. Does NOT delete unresolved staging.
 */
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const stagingPath = path.join(root, 'data/norway/norway_centers_staging.json');
const phase2Path = path.join(root, 'data/norway/phase2_new_centers_staging.json');
const reportPath = path.join(root, 'data/norway/phase2_merge_report.json');
const approvedPath = path.join(root, 'data/norway/phase2_APPROVED_FOR_MERGE.json');
const withheldPath = path.join(root, 'data/norway/phase2_SOFT_POSTAL_WITHHELD.json');

const dryRun = process.argv.includes('--dry-run');

function isSoftPostal(r) {
  const reasons = r.geocode_reasons || [];
  if (r.geocode_suspicious) return true;
  return reasons.some(x => String(x).includes('postal_mismatch_soft'));
}

function hasValidCoords(r) {
  return (
    r.lat != null &&
    r.lng != null &&
    Number.isFinite(r.lat) &&
    Number.isFinite(r.lng) &&
    !(r.lat === 0 && r.lng === 0)
  );
}

function isApprovedReady(r) {
  if (r.import_category !== 'READY_TO_IMPORT') return false;
  if (r.is_coming_soon) return false;
  if (!hasValidCoords(r)) return false;
  if (isSoftPostal(r)) return false;
  if (!r.address || !r.postal_code || !r.city) return false;
  if ((r.country || 'Norway') !== 'Norway') return false;
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

function normalizeAddr(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function addrKey(r) {
  return [
    normalizeAddr(r.address || r.address),
    String(r.postal_code || r.postal_code || ''),
    normalizeAddr(r.city || ''),
    normalizeAddr(r.brand || ''),
  ].join('|');
}

function main() {
  const centers = JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8'));
  const phase2 = JSON.parse(fs.readFileSync(phase2Path, 'utf8'));

  const before = {
    total: centers.length,
    norway: centers.filter(c => c.country === 'Norway').length,
    denmark: centers.filter(c => c.country === 'Denmark').length,
    sweden: centers.filter(c => c.country === 'Sweden').length,
  };

  const p1Candidates = staging.filter(
    r => r.import_category !== 'MERGED_INTO_CATALOG' && isApprovedReady(r),
  );
  const p2Candidates = phase2.filter(r => isApprovedReady(r));
  const softWithheld = [
    ...staging.filter(
      r =>
        r.import_category === 'READY_TO_IMPORT' &&
        hasValidCoords(r) &&
        isSoftPostal(r) &&
        r.import_category !== 'MERGED_INTO_CATALOG',
    ),
    ...phase2.filter(
      r => r.import_category === 'READY_TO_IMPORT' && hasValidCoords(r) && isSoftPostal(r),
    ),
  ];

  let approved = [...p1Candidates, ...p2Candidates];

  // Deduplicate approved list by id (prefer first)
  const seenIds = new Set();
  approved = approved.filter(r => {
    if (seenIds.has(r.id)) return false;
    seenIds.add(r.id);
    return true;
  });

  const byId = new Map(centers.map(c => [c.id, c]));
  const liveNo = centers.filter(c => c.country === 'Norway');
  const liveAddrBrand = new Set(liveNo.map(addrKey));

  let inserted = 0;
  let skippedExistingId = 0;
  let skippedSameAddrBrand = 0;
  let skippedNonNorwayIdCollision = 0;
  const insertedRows = [];
  const skipped = [];

  for (const r of approved) {
    const row = toCatalogRow(r);
    if (byId.has(row.id)) {
      const existing = byId.get(row.id);
      if (existing.country && existing.country !== 'Norway') {
        skippedNonNorwayIdCollision++;
        skipped.push({id: row.id, name: row.name, reason: 'id_collision_non_norway'});
        continue;
      }
      skippedExistingId++;
      skipped.push({id: row.id, name: row.name, reason: 'id_already_in_catalog'});
      continue;
    }
    const k = addrKey(row);
    if (liveAddrBrand.has(k)) {
      // same brand+address already live — do not duplicate
      skippedSameAddrBrand++;
      skipped.push({id: row.id, name: row.name, reason: 'same_address_brand_as_live'});
      continue;
    }
    byId.set(row.id, row);
    liveAddrBrand.add(k);
    inserted++;
    insertedRows.push(row);
  }

  const next = [...byId.values()];
  const after = {
    total: next.length,
    norway: next.filter(c => c.country === 'Norway').length,
    denmark: next.filter(c => c.country === 'Denmark').length,
    sweden: next.filter(c => c.country === 'Sweden').length,
  };

  const ids = next.map(c => c.id);
  const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);

  // Mark staging rows merged / withheld
  const insertedIdSet = new Set(insertedRows.map(r => r.id));
  const softIdSet = new Set(softWithheld.map(r => r.id));

  for (const r of staging) {
    if (insertedIdSet.has(r.id)) {
      r.import_category = 'MERGED_INTO_CATALOG';
      r.is_active = true;
      r.phase2_merge = 'approved_high_confidence';
    } else if (softIdSet.has(r.id) && r.import_category === 'READY_TO_IMPORT') {
      r.import_category = 'SOFT_POSTAL_WITHHELD';
      r.phase2_merge = 'withheld_soft_postal';
    }
  }
  for (const r of phase2) {
    if (insertedIdSet.has(r.id)) {
      r.import_category = 'MERGED_INTO_CATALOG';
      r.is_active = true;
      r.phase2_merge = 'approved_high_confidence';
    } else if (softIdSet.has(r.id) && r.import_category === 'READY_TO_IMPORT') {
      r.import_category = 'SOFT_POSTAL_WITHHELD';
      r.phase2_merge = 'withheld_soft_postal';
    }
  }

  const unresolvedStaged =
    staging.filter(r => r.import_category !== 'MERGED_INTO_CATALOG').length +
    phase2.filter(r => r.import_category !== 'MERGED_INTO_CATALOG').length;

  const byBrand = {};
  for (const r of insertedRows) {
    byBrand[r.brand] = (byBrand[r.brand] || 0) + 1;
  }

  const newNo = insertedRows;
  const invalidNew = newNo.filter(
    c =>
      c.lat == null ||
      c.lng == null ||
      !Number.isFinite(c.lat) ||
      !Number.isFinite(c.lng) ||
      (c.lat === 0 && c.lng === 0) ||
      c.country !== 'Norway' ||
      c.is_active !== true,
  );

  const report = {
    dry_run: dryRun,
    before,
    after,
    approved_candidates: approved.length,
    soft_postal_withheld: softWithheld.length,
    inserted,
    skipped_existing_id: skippedExistingId,
    skipped_same_addr_brand: skippedSameAddrBrand,
    skipped_non_norway_id_collision: skippedNonNorwayIdCollision,
    skipped,
    by_brand_added: byBrand,
    duplicate_ids_in_catalog: dupIds,
    denmark_unchanged: before.denmark === after.denmark,
    sweden_unchanged: before.sweden === after.sweden,
    every_new_has_valid_coords: invalidNew.length === 0,
    invalid_new: invalidNew,
    unresolved_rows_still_staged: unresolvedStaged,
    soft_withheld_ids: softWithheld.map(r => ({id: r.id, name: r.name, brand: r.brand})),
  };

  fs.writeFileSync(approvedPath, JSON.stringify(approved.map(toCatalogRow), null, 2) + '\n');
  fs.writeFileSync(
    withheldPath,
    JSON.stringify(
      softWithheld.map(r => ({
        id: r.id,
        name: r.name,
        brand: r.brand,
        address: r.address,
        postal_code: r.postal_code,
        city: r.city,
        lat: r.lat,
        lng: r.lng,
        geocode_reasons: r.geocode_reasons,
        geocode_display: r.geocode_display,
      })),
      null,
      2,
    ) + '\n',
  );

  if (!dryRun) {
    fs.writeFileSync(centersPath, JSON.stringify(next, null, 2) + '\n');
    fs.writeFileSync(stagingPath, JSON.stringify(staging, null, 2) + '\n');
    fs.writeFileSync(phase2Path, JSON.stringify(phase2, null, 2) + '\n');
  }

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (dryRun) {
    console.log('\nDry run — centers.json not written.');
  } else {
    console.log('\nMerge written to centers.json');
  }
}

main();
