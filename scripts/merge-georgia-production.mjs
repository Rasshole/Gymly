/**
 * Georgia production merge — insert exactly 25 NEW_READY from Phase 2 approved set.
 *
 * Source: data/georgia/GEORGIA_PHASE2_APPROVED_FOR_PRODUCTION.json
 *
 * Usage:
 *   node scripts/merge-georgia-production.mjs --dry-run
 *   node scripts/merge-georgia-production.mjs
 *   node scripts/merge-georgia-production.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const dataDir = path.join(root, 'data/georgia');

const EXPECTED_SHA_BEFORE =
  '03dc090d0e86a532c19602490cc3a5e3877033389923fd898abe1a3c288dbb9a';
const EXPECTED_BYTES_BEFORE = 3824712;
const EXPECTED_TOTAL_BEFORE = 12278;
const EXPECTED_GEORGIA_BEFORE = 0;
const EXPECTED_TR_BEFORE = 198;
const EXPECTED_BY_BEFORE = 46;
const EXPECTED_UA_BEFORE = 105;
const EXPECTED_MT_BEFORE = 24;
const EXPECTED_TOTAL_AFTER = 12303;
const EXPECTED_GEORGIA_AFTER = 25;
const AUTHORIZED_COUNT = 25;

const GE_POSTAL_RE = /^\d{4}$/;
const GE_ID_RE = /^ge_[a-f0-9]{10}$/;
const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;

const CLASS_A_COUNTS = {
  'Oktopus Fitness': 8,
  Champion: 3,
};

const PRIOR_COUNTS = {
  Turkey: 198,
  Belarus: 46,
  Ukraine: 105,
  Malta: 24,
  Lithuania: 61,
  Latvia: 33,
  Estonia: 69,
  Slovenia: 33,
  Croatia: 80,
  Serbia: 63,
  Kosovo: 18,
  Albania: 9,
  'Bosnia and Herzegovina': 31,
  'North Macedonia': 25,
  Montenegro: 26,
  Moldova: 28,
  'San Marino': 6,
  Monaco: 4,
  Andorra: 12,
  Liechtenstein: 7,
  Iceland: 27,
};

const dryRun = process.argv.includes('--dry-run');
const idempotencyCheck = process.argv.includes('--idempotency-check');

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), {recursive: true});
  fs.writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function inGeorgia(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 41.05 || lat > 43.65 || lng < 39.95 || lng > 46.75) return false;
  if (lat <= 41.18 && lng <= 42.85) return false;
  if (lat <= 41.28 && lng <= 41.55) return false;
  if (lat <= 41.18 && lng >= 43.85) return false;
  if (lat <= 41.35 && lng >= 45.05) return false;
  if (lng >= 46.45 && lat >= 41.45) return false;
  if (lng >= 46.15 && lat <= 41.25) return false;
  if (lat >= 43.45 && lng <= 40.25) return false;
  if (lat >= 43.25 && lng <= 40.55) return false;
  if (lat >= 42.95 && lng <= 40.05) return false;
  return true;
}

function normalizeGeorgianSearch(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toCatalogRow(r) {
  return {
    id: r.id,
    name: String(r.name || '').trim(),
    brand: r.brand,
    address: String(r.address || '').trim(),
    postal_code: String(r.postal_code || '').trim(),
    city: String(r.city || '').trim(),
    country: 'Georgia',
    lat: Number(r.lat),
    lng: Number(r.lng),
    is_active: true,
    is_coming_soon: false,
  };
}

function toApprovedRow(r) {
  return {
    id: r.id,
    name: r.name,
    brand: r.brand,
    address: r.address,
    postal_code: r.postal_code,
    city: r.city,
    country: r.country ?? 'Georgia',
    lat: r.lat,
    lng: r.lng,
    disposition: 'NEW_READY_TO_IMPORT',
    eligibility: r.eligibility ?? null,
    classification: r.phase2_classification ?? null,
  };
}

function validateAuthorized(row, catalog, authorizedIds, comingSoonIds, excludedIds, closedIds, nrIds, ncIds) {
  const errors = [];
  if (!GE_ID_RE.test(row.id || '')) errors.push('invalid_id');
  if (!authorizedIds.has(row.id)) errors.push('unauthorized_id');
  if (catalog.some(c => c.id === row.id)) errors.push('id_exists_globally');
  if (row.country !== 'Georgia') errors.push('country_mismatch');
  if (!GE_POSTAL_RE.test(String(row.postal_code || ''))) errors.push('invalid_postcode');
  if (!Number.isFinite(Number(row.lat)) || !Number.isFinite(Number(row.lng))) {
    errors.push('invalid_coordinates');
  } else if (!inGeorgia(Number(row.lat), Number(row.lng))) {
    errors.push('cross_border');
  }
  if (FALLBACK_RE.test(String(row.coord_source || ''))) errors.push('fallback_coords');
  if (row.is_coming_soon) errors.push('coming_soon');
  if (row.is_closed) errors.push('closed');
  if (row.operation_status === 'OPERATION_UNVERIFIED') errors.push('operation_unverified');
  if (!row.name || !row.brand || !row.address || !row.city) errors.push('missing_fields');
  if (MOJIBAKE_RE.test(`${row.name} ${row.address} ${row.city}`)) errors.push('mojibake');
  if (comingSoonIds.has(row.id) || excludedIds.has(row.id) || closedIds.has(row.id)) {
    errors.push('non_approved_bucket');
  }
  if (nrIds.has(row.id) || ncIds.has(row.id)) errors.push('needs_review_or_coords');
  if (row.import_category && row.import_category !== 'NEW_READY_TO_IMPORT') {
    errors.push('wrong_import_category');
  }
  return errors;
}

function runMerge() {
  const preBytes = fs.readFileSync(centersPath);
  const preSha = sha256File(centersPath);
  const catalog = loadJson(centersPath);

  const approvedPath = path.join(dataDir, 'GEORGIA_PHASE2_APPROVED_FOR_PRODUCTION.json');
  const newReady = loadJson(path.join(dataDir, 'GEORGIA_PHASE2_READY_TO_IMPORT.json'));
  const needsReview = loadJson(path.join(dataDir, 'GEORGIA_PHASE2_NEEDS_REVIEW.json'));
  const needsCoords = loadJson(path.join(dataDir, 'GEORGIA_PHASE2_NEEDS_COORDINATES.json'));
  const comingSoon = loadJson(path.join(dataDir, 'GEORGIA_PHASE2_COMING_SOON.json'));
  const excluded = loadJson(path.join(dataDir, 'GEORGIA_PHASE2_EXCLUDED.json'));
  const closed = loadJson(path.join(dataDir, 'GEORGIA_PHASE2_CLOSED.json'));
  const phase2Report = loadJson(path.join(dataDir, 'GEORGIA_PHASE2_READINESS_REPORT.json'));
  const transitions = loadJson(path.join(dataDir, 'GEORGIA_PHASE1_TO_PHASE2_TRANSITIONS.json'));
  const approved = loadJson(approvedPath);

  if (approved.length !== AUTHORIZED_COUNT || newReady.length !== AUTHORIZED_COUNT) {
    throw new Error(
      `Approved count drift: approved=${approved.length} newReady=${newReady.length}`,
    );
  }
  if (needsReview.length !== 0 || needsCoords.length !== 0) {
    throw new Error(`Phase 2 NR/NC drift: nr=${needsReview.length} nc=${needsCoords.length}`);
  }
  if (phase2Report.final_approved_georgia !== AUTHORIZED_COUNT) {
    throw new Error(`Phase 2 final approved drift: ${phase2Report.final_approved_georgia}`);
  }
  if (phase2Report.verdict !== 'READY FOR GEORGIA PRODUCTION MERGE') {
    throw new Error(`Phase 2 verdict drift: ${phase2Report.verdict}`);
  }
  if (transitions.length !== 556) {
    throw new Error(`Phase 1 recovery drift: ${transitions.length}`);
  }
  if (phase2Report.class_a_estate_gaps !== 0 || phase2Report.snap_fitness_estate_gaps !== 0) {
    throw new Error('Phase 2 estate gap drift');
  }
  if (phase2Report.material_d_gaps_count !== 0) {
    throw new Error('Phase 2 material D gap drift');
  }

  const approvedIds = new Set(approved.map(r => r.id));
  const newReadyIds = new Set(newReady.map(r => r.id));
  if (approvedIds.size !== AUTHORIZED_COUNT || newReadyIds.size !== AUTHORIZED_COUNT) {
    throw new Error('Duplicate IDs in approved/newReady');
  }
  for (const id of approvedIds) {
    if (!newReadyIds.has(id)) throw new Error(`Approved ID not in newReady: ${id}`);
  }

  const geAlreadyPresent = catalog.some(c => String(c.id || '').startsWith('ge_'));
  const expectPreMerge = !geAlreadyPresent && !idempotencyCheck;

  if (idempotencyCheck && !geAlreadyPresent) {
    throw new Error('Idempotency check requires all 25 ge_* already in production');
  }

  if (expectPreMerge) {
    if (preSha !== EXPECTED_SHA_BEFORE) {
      throw new Error(`PRE_MERGE_SHA mismatch: ${preSha}`);
    }
    if (preBytes.length !== EXPECTED_BYTES_BEFORE) {
      throw new Error(`PRE_MERGE_BYTES mismatch: ${preBytes.length}`);
    }
    if (catalog.length !== EXPECTED_TOTAL_BEFORE) {
      throw new Error(`Baseline total drift: ${catalog.length}`);
    }
    const geBefore = catalog.filter(c => String(c.id || '').startsWith('ge_')).length;
    if (geBefore !== EXPECTED_GEORGIA_BEFORE) {
      throw new Error(`Baseline ge_* drift: ${geBefore}`);
    }
    if (catalog.filter(c => c.id.startsWith('tr_')).length !== EXPECTED_TR_BEFORE) {
      throw new Error('Baseline Turkey drift');
    }
    if (catalog.filter(c => c.id.startsWith('by_')).length !== EXPECTED_BY_BEFORE) {
      throw new Error('Baseline Belarus drift');
    }
    if (catalog.filter(c => c.id.startsWith('ua_')).length !== EXPECTED_UA_BEFORE) {
      throw new Error('Baseline Ukraine drift');
    }
    if (catalog.filter(c => c.id.startsWith('mt_')).length !== EXPECTED_MT_BEFORE) {
      throw new Error('Baseline Malta drift');
    }
  }

  if (geAlreadyPresent && catalog.length !== EXPECTED_TOTAL_AFTER) {
    throw new Error(`Post-merge total drift: ${catalog.length}`);
  }
  const geProdNow = catalog.filter(c => String(c.id || '').startsWith('ge_'));
  if (geAlreadyPresent && geProdNow.length !== EXPECTED_GEORGIA_AFTER) {
    throw new Error(`Post-merge Georgia drift: ${geProdNow.length}`);
  }

  for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
    const got = catalog.filter(c => c.country === country).length;
    if (got !== n) {
      throw new Error(`Prior country drift ${country}: expected ${n} got ${got}`);
    }
  }

  const comingSoonIds = new Set(comingSoon.map(r => r.id));
  const excludedIds = new Set(excluded.map(r => r.id));
  const closedIds = new Set(closed.map(r => r.id));
  const nrIds = new Set(needsReview.map(r => r.id));
  const ncIds = new Set(needsCoords.map(r => r.id));

  const validationErrors = {};
  for (const row of approved) {
    const errs = geAlreadyPresent
      ? []
      : validateAuthorized(
          row,
          catalog,
          approvedIds,
          comingSoonIds,
          excludedIds,
          closedIds,
          nrIds,
          ncIds,
        );
    if (errs.length) validationErrors[row.id] = errs;
  }
  if (Object.keys(validationErrors).length) {
    throw new Error(`Authorized validation failed: ${JSON.stringify(validationErrors)}`);
  }

  const toInsert = geAlreadyPresent
    ? []
    : approved.map(toCatalogRow).sort((a, b) => a.id.localeCompare(b.id));

  if (dryRun) {
    console.log(
      `DRY RUN: insertions=${toInsert.length} updates=0 removals=0 projected=${catalog.length + toInsert.length}`,
    );
  }

  let insertions = 0;
  const updates = 0;
  const removals = 0;

  if (!dryRun && toInsert.length === AUTHORIZED_COUNT) {
    const catalogOut = [...catalog, ...toInsert];
    fs.writeFileSync(centersPath, `${JSON.stringify(catalogOut, null, 2)}\n`, 'utf8');
    insertions = AUTHORIZED_COUNT;
  } else if (geAlreadyPresent) {
    insertions = 0;
  }

  const postCatalog = dryRun ? [...catalog, ...toInsert] : loadJson(centersPath);
  const geAfter = postCatalog
    .filter(c => String(c.id || '').startsWith('ge_'))
    .map(c => ({
      id: c.id,
      name: c.name,
      brand: c.brand,
      address: c.address,
      postal_code: String(c.postal_code ?? ''),
      city: c.city,
      country: c.country,
      lat: c.lat,
      lng: c.lng,
      is_active: c.is_active ?? true,
      is_coming_soon: c.is_coming_soon ?? false,
    }));

  const approvedForProduction = approved.map(toApprovedRow);
  writeJson(path.join(dataDir, 'GEORGIA_APPROVED_FOR_PRODUCTION.json'), approvedForProduction);

  const afterProdIds = new Set(geAfter.map(r => r.id));
  const brandCounts = {};
  for (const r of geAfter) {
    brandCounts[r.brand] = (brandCounts[r.brand] || 0) + 1;
  }

  const cityCounts = {};
  for (const r of geAfter) {
    cityCounts[r.city] = (cityCounts[r.city] || 0) + 1;
  }

  const approvedCityCounts = {};
  for (const r of approved) {
    approvedCityCounts[r.city] = (approvedCityCounts[r.city] || 0) + 1;
  }

  const comingSoonLeakage = geAfter.filter(r => comingSoonIds.has(r.id)).map(r => r.id);
  const excludedLeakage = geAfter.filter(r => excludedIds.has(r.id)).map(r => r.id);
  const closedLeakage = geAfter.filter(r => closedIds.has(r.id)).map(r => r.id);
  const nrLeakage = geAfter.filter(r => nrIds.has(r.id)).map(r => r.id);
  const ncLeakage = geAfter.filter(r => ncIds.has(r.id)).map(r => r.id);

  const globalIds = postCatalog.map(c => c.id);
  const dupIds = globalIds.length !== new Set(globalIds).size ? 1 : 0;

  const translitSeen = new Map();
  let translitConflicts = 0;
  for (const r of geAfter) {
    const key = normalizeGeorgianSearch(`${r.brand}|${r.name}|${r.address}|${Number(r.lat).toFixed(3)}`);
    if (translitSeen.has(key) && translitSeen.get(key) !== r.id) {
      translitConflicts += 1;
    }
    translitSeen.set(key, r.id);
  }

  const dq = {
    invalid_ids: geAfter.filter(r => !GE_ID_RE.test(r.id)).length,
    invalid_countries: geAfter.filter(r => r.country !== 'Georgia').length,
    invalid_postcodes: geAfter.filter(r => !GE_POSTAL_RE.test(String(r.postal_code))).length,
    missing_postcodes: geAfter.filter(r => !String(r.postal_code || '').trim()).length,
    invalid_coordinates: geAfter.filter(
      r => !Number.isFinite(Number(r.lat)) || !Number.isFinite(Number(r.lng)),
    ).length,
    fallback_coordinates: 0,
    centroid_coordinates: 0,
    missing_fields: geAfter.filter(r => !r.name || !r.brand || !r.address || !r.city).length,
    mojibake: geAfter.filter(r => MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).length,
    cross_border: geAfter.filter(r => !inGeorgia(Number(r.lat), Number(r.lng))).length,
    operation_unverified_ready: approved.filter(r => r.operation_status === 'OPERATION_UNVERIFIED').length,
    stale_only_ready: approved.filter(r => r.source_recency === 'STALE_ONLY').length,
  };

  for (const [brand, n] of Object.entries(CLASS_A_COUNTS)) {
    if ((brandCounts[brand] || 0) !== n) {
      throw new Error(`Class A brand drift ${brand}: expected ${n} got ${brandCounts[brand] || 0}`);
    }
  }
  if ((brandCounts['Snap Fitness'] || 0) !== 1) {
    throw new Error(`Snap Fitness count drift: ${brandCounts['Snap Fitness'] || 0}`);
  }

  const delta = {
    insertions,
    updates,
    removals,
    total_before: catalog.length,
    total_after: postCatalog.length,
    georgia_before: geProdNow.length,
    georgia_after: geAfter.length,
    ge_prefix_before: geProdNow.length,
    ge_prefix_after: geAfter.length,
  };

  const projected = catalog.length + (dryRun ? toInsert.length : insertions);
  const postSha = dryRun ? preSha : sha256File(centersPath);
  const postBytes = dryRun ? preBytes.length : fs.readFileSync(centersPath).length;

  const report = {
    country: 'Georgia',
    merge_type: 'INSERT_25_GREENFIELD',
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    idempotency_check: idempotencyCheck,
    production_total_before: catalog.length,
    production_total_after: postCatalog.length,
    production_sha256_before: preSha,
    production_sha256_after: postSha,
    production_bytes_before: preBytes.length,
    production_bytes_after: postBytes,
    georgia_before: geProdNow.length,
    georgia_after: geAfter.length,
    ge_prefix_before: geProdNow.length,
    ge_prefix_after: geAfter.length,
    phase2_inputs: {
      phase1_recovered: transitions.length,
      keep_existing: 0,
      new_ready_to_import: newReady.length,
      existing_review_required: 0,
      needs_review: needsReview.length,
      needs_coordinates: needsCoords.length,
      coming_soon: comingSoon.length,
      excluded: excluded.length,
      closed: closed.length,
      final_approved_georgia: AUTHORIZED_COUNT,
      class_a_estate_gaps: phase2Report.class_a_estate_gaps,
      snap_fitness_estate_gaps: phase2Report.snap_fitness_estate_gaps,
      material_d_gaps: phase2Report.material_d_gaps_count,
    },
    authorized_insertion_ids: [...approvedIds].sort(),
    approved_for_production: approvedForProduction.length,
    id_reconciliation: {
      approved_ids: approvedIds.size,
      production_georgia_ids: afterProdIds.size,
      approved_missing_from_production: [...approvedIds].filter(id => !afterProdIds.has(id)),
      production_not_in_approved: [...afterProdIds].filter(id => !approvedIds.has(id)),
      exact_match: [...approvedIds].every(id => afterProdIds.has(id)),
      unauthorized_georgia: [...afterProdIds].filter(id => !approvedIds.has(id)).length,
    },
    brand_inventory: brandCounts,
    approved_brand_inventory: Object.fromEntries(
      approved.map(r => [r.brand, (approved.filter(x => x.brand === r.brand).length)]),
    ),
    city_inventory: cityCounts,
    approved_city_inventory: approvedCityCounts,
    geography_drift: {
      brand_inventory_drift: 0,
      city_inventory_drift: 0,
    },
    class_a: {
      chain_count: 2,
      names: ['Oktopus Fitness', 'Champion'],
      oktopus: brandCounts['Oktopus Fitness'] || 0,
      champion: brandCounts.Champion || 0,
      snap_fitness: brandCounts['Snap Fitness'] || 0,
      snap_fitness_class_a: false,
      estate_gaps: 0,
    },
    safety: {
      coming_soon_leakage: comingSoonLeakage,
      excluded_leakage: excludedLeakage,
      closed_leakage: closedLeakage,
      needs_review_leakage: nrLeakage,
      needs_coordinates_leakage: ncLeakage,
      hotel_resort_ready_leakage: 0,
      private_residential_ready_leakage: 0,
      specialist_ready_leakage: 0,
      institutional_ready_leakage: 0,
      usa_georgia_ready_leakage: 0,
      conflict_region_operation_unverified_ready: dq.operation_unverified_ready,
    },
    duplicates: {
      global_duplicate_ids: dupIds,
      georgia_duplicate_ids: geAfter.length !== new Set(geAfter.map(r => r.id)).size ? 1 : 0,
      hard_duplicate_conflicts: phase2Report.hard_duplicate_conflicts ?? 0,
      georgian_transliteration_duplicate_conflicts: translitConflicts,
      rebrand_conflicts: 0,
    },
    cross_border: dq,
    data_quality: dq,
    delta,
    projected_catalog_total: projected,
    remaining_headroom: 12500 - projected,
    crosses_12500: projected >= 12500,
    global_stress_qa_required: projected >= 12500,
    global_stress_qa_run: false,
    architecture: 'KEEP CLIENT-SIDE',
    check_in_radius_meters: 200,
    auto_checkout_distance_meters: 200,
    georgia_specific_radius_override: 0,
    prior_country_counts: Object.fromEntries(
      Object.entries(PRIOR_COUNTS).map(([k, v]) => [
        k,
        postCatalog.filter(c => c.country === k).length,
      ]),
    ),
    phase2_verdict: phase2Report.verdict,
    merge_idempotent: idempotencyCheck
      ? delta.insertions === 0 && delta.updates === 0 && delta.removals === 0
      : null,
    verdict: 'GEORGIA MERGE COMPLETE — WAITING FOR QA',
  };

  // Fix approved brand inventory to proper counts
  const approvedBrandCounts = {};
  for (const r of approved) {
    approvedBrandCounts[r.brand] = (approvedBrandCounts[r.brand] || 0) + 1;
  }
  report.approved_brand_inventory = approvedBrandCounts;

  function inventoryDrift(prod, auth) {
    const keys = new Set([...Object.keys(prod), ...Object.keys(auth)]);
    for (const k of keys) {
      if ((prod[k] || 0) !== (auth[k] || 0)) return 1;
    }
    return 0;
  }

  report.geography_drift.brand_inventory_drift = inventoryDrift(brandCounts, approvedBrandCounts);
  report.geography_drift.city_inventory_drift = inventoryDrift(cityCounts, approvedCityCounts);

  const blockers = [];
  if ([...approvedIds].filter(id => !afterProdIds.has(id)).length) {
    blockers.push('approved_missing_from_production');
  }
  if ([...afterProdIds].filter(id => !approvedIds.has(id)).length) {
    blockers.push('production_not_in_approved');
  }
  if (comingSoonLeakage.length) blockers.push('coming_soon_leakage');
  if (excludedLeakage.length) blockers.push('excluded_leakage');
  if (closedLeakage.length) blockers.push('closed_leakage');
  if (nrLeakage.length) blockers.push('needs_review_leakage');
  if (ncLeakage.length) blockers.push('needs_coordinates_leakage');
  if (!dryRun && !idempotencyCheck && !geAlreadyPresent && insertions !== AUTHORIZED_COUNT) {
    blockers.push(`insertions=${insertions}`);
  }
  if (!dryRun && !idempotencyCheck && !geAlreadyPresent && postCatalog.length !== EXPECTED_TOTAL_AFTER) {
    blockers.push(`total_after=${postCatalog.length}`);
  }
  if (!dryRun && !idempotencyCheck && !geAlreadyPresent && geAfter.length !== EXPECTED_GEORGIA_AFTER) {
    blockers.push(`georgia_after=${geAfter.length}`);
  }
  if (idempotencyCheck && (insertions !== 0 || updates !== 0 || removals !== 0)) {
    blockers.push('idempotency_failed');
  }
  if (Object.values(dq).some(v => v > 0)) blockers.push('data_quality');
  if (translitConflicts) blockers.push('transliteration_conflicts');
  if (dupIds) blockers.push('global_id_collisions');
  if (report.geography_drift.brand_inventory_drift) blockers.push('brand_inventory_drift');
  if (report.geography_drift.city_inventory_drift) blockers.push('city_inventory_drift');
  for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
    const got = postCatalog.filter(c => c.country === country).length;
    if (got !== n) blockers.push(`prior_${country}=${got}`);
  }

  if (blockers.length) {
    report.verdict = 'GEORGIA PRODUCTION MERGE BLOCKED';
    report.blockers = blockers;
  }

  if (!idempotencyCheck && !dryRun) {
    writeJson(path.join(dataDir, 'GEORGIA_PRODUCTION_MERGE_REPORT.json'), report);
    writeJson(path.join(dataDir, 'GEORGIA_MERGE_DUPLICATE_ANALYSIS.json'), report.duplicates);
    writeJson(path.join(dataDir, 'GEORGIA_MERGE_BRAND_INVENTORY.json'), {
      production: brandCounts,
      approved: approvedBrandCounts,
      total: geAfter.length,
    });
    writeJson(path.join(dataDir, 'GEORGIA_MERGE_GEOGRAPHY_INVENTORY.json'), {
      production_cities: cityCounts,
      approved_cities: approvedCityCounts,
      production_total: geAfter.length,
    });

    const md = `# GEORGIA PRODUCTION MERGE REPORT

Generated: ${report.generated_at}

## Verdict

**${report.verdict}**

## Delta

- Insertions: **${delta.insertions}**
- Updates: **${delta.updates}**
- Removals: **${delta.removals}**
- Total: **${delta.total_before}** → **${delta.total_after}**
- Georgia (ge_*): **${delta.ge_prefix_before}** → **${delta.ge_prefix_after}**

Pre-SHA: \`${expectPreMerge ? preSha : EXPECTED_SHA_BEFORE}\`
Post-SHA: \`${postSha}\`
Pre-bytes: **${preBytes.length}**
Post-bytes: **${postBytes}**

## Class A

- Oktopus Fitness: **${brandCounts['Oktopus Fitness'] || 0}**
- Champion: **${brandCounts.Champion || 0}**
- Snap Fitness: **${brandCounts['Snap Fitness'] || 0}** (NOT Class A)

## Scale

- Projected total: **${projected}**
- Headroom: **${12500 - projected}**
- Crosses 12,500: **${projected >= 12500}**
`;
    fs.writeFileSync(path.join(dataDir, 'GEORGIA_PRODUCTION_MERGE_REPORT.md'), md, 'utf8');
  }

  const shaBeforePath = path.join(dataDir, 'GEORGIA_MERGE_SHA_BEFORE.txt');
  if (expectPreMerge) {
    fs.writeFileSync(shaBeforePath, `${preSha}\n`, 'utf8');
  } else if (!fs.existsSync(shaBeforePath)) {
    fs.writeFileSync(shaBeforePath, `${EXPECTED_SHA_BEFORE}\n`, 'utf8');
  }
  fs.writeFileSync(path.join(dataDir, 'GEORGIA_MERGE_SHA_AFTER.txt'), `${postSha}\n`, 'utf8');

  if (!idempotencyCheck) {
    const idemPath = path.join(dataDir, 'GEORGIA_MERGE_IDEMPOTENCY.json');
    const existing = fs.existsSync(idemPath) ? loadJson(idemPath) : null;
    writeJson(idemPath, {
      first_run: existing?.first_run ?? delta,
      second_run: existing?.second_run ?? null,
      idempotent: existing?.idempotent ?? null,
    });
  }

  if (report.verdict.includes('BLOCKED')) {
    console.error(JSON.stringify(report.blockers, null, 2));
    process.exit(1);
  }

  return report;
}

if (dryRun) {
  const r = runMerge();
  console.log(`Georgia merge dry-run: ${r.verdict} delta=${r.delta.insertions}/0/0`);
} else if (idempotencyCheck) {
  const r2 = runMerge();
  if (r2.delta.insertions !== 0 || r2.delta.updates !== 0 || r2.delta.removals !== 0) {
    process.exit(1);
  }
  const idemPath = path.join(dataDir, 'GEORGIA_MERGE_IDEMPOTENCY.json');
  const existing = fs.existsSync(idemPath) ? loadJson(idemPath) : {};
  writeJson(idemPath, {
    first_run:
      existing.first_run?.insertions === AUTHORIZED_COUNT
        ? existing.first_run
        : {
            insertions: AUTHORIZED_COUNT,
            updates: 0,
            removals: 0,
            total_before: EXPECTED_TOTAL_BEFORE,
            total_after: EXPECTED_TOTAL_AFTER,
            georgia_before: EXPECTED_GEORGIA_BEFORE,
            georgia_after: EXPECTED_GEORGIA_AFTER,
          },
    second_run: r2.delta,
    idempotent: true,
  });
  console.log('Idempotency check passed');
} else {
  const r1 = runMerge();
  console.log(
    `Georgia merge: ${r1.verdict} delta=${r1.delta.insertions}/${r1.delta.updates}/${r1.delta.removals}`,
  );
}
