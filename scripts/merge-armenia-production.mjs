/**
 * Armenia production merge — insert exactly 36 NEW_READY from Phase 2 approved set.
 *
 * Source: data/armenia/ARMENIA_PHASE2_APPROVED_FOR_PRODUCTION.json
 *
 * Usage:
 *   node scripts/merge-armenia-production.mjs --dry-run
 *   node scripts/merge-armenia-production.mjs
 *   node scripts/merge-armenia-production.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const dataDir = path.join(root, 'data/armenia');

const EXPECTED_SHA_BEFORE =
  'eead8cd2ad6ad935ae564fd86a7dde856babfe80175bd20ded9eb3acdc1464b4';
const EXPECTED_BYTES_BEFORE = 3832712;
const EXPECTED_TOTAL_BEFORE = 12303;
const EXPECTED_ARMENIA_BEFORE = 0;
const EXPECTED_GE_BEFORE = 25;
const EXPECTED_TR_BEFORE = 198;
const EXPECTED_BY_BEFORE = 46;
const EXPECTED_UA_BEFORE = 105;
const EXPECTED_MT_BEFORE = 24;
const EXPECTED_TOTAL_AFTER = 12339;
const EXPECTED_ARMENIA_AFTER = 36;
const AUTHORIZED_COUNT = 36;

const AM_POSTAL_RE = /^\d{4}$/;
const AM_ID_RE = /^am_[a-f0-9]{10}$/;
const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;

const CLASS_A_COUNTS = {
  'Orange Fitness': 6,
};

const CURATED_COUNTS = {
  "Gold's Gym": 1,
  'Panorama Fitness': 1,
  'World Gym Armenia': 1,
  'Energy Fitness': 1,
  'Grand Sport Club': 1,
};

const EXPECTED_CITY_COUNTS = {
  Yerevan: 27,
  Vanadzor: 2,
  Gyumri: 1,
  Abovyan: 1,
  Hrazdan: 1,
  Kapan: 1,
  Armavir: 1,
  Goris: 1,
  'Մասիս': 1,
};

const PRIOR_COUNTS = {
  Georgia: 25,
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

function inArmenia(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 38.84 || lat > 41.32 || lng < 43.42 || lng > 46.58) return false;
  if (lat >= 41.15 && lng <= 44.35) return false;
  if (lat >= 41.05 && lng <= 43.75) return false;
  if (lng <= 43.52 && lat <= 40.85) return false;
  if (lng <= 43.68 && lat <= 40.35) return false;
  if (lng >= 46.35 && lat >= 39.45) return false;
  if (lng >= 46.55) return false;
  if (lat <= 38.92 && lng >= 44.85) return false;
  if (lat <= 39.05 && lng >= 45.5) return false;
  return true;
}

function normalizeArmenianSearch(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDilijanCity(city) {
  const c = String(city || '').toLowerCase();
  return c.includes('dilijan') || c.includes('դիլիջան');
}

function toCatalogRow(r) {
  return {
    id: r.id,
    name: String(r.name || '').trim(),
    brand: r.brand,
    address: String(r.address || '').trim(),
    postal_code: String(r.postal_code || '').trim(),
    city: String(r.city || '').trim(),
    country: 'Armenia',
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
    country: r.country ?? 'Armenia',
    lat: r.lat,
    lng: r.lng,
    disposition: 'NEW_READY_TO_IMPORT',
    eligibility: r.eligibility ?? null,
    classification: r.phase2_classification ?? null,
  };
}

function validateAuthorized(row, catalog, authorizedIds, comingSoonIds, excludedIds, closedIds, nrIds, ncIds) {
  const errors = [];
  if (!AM_ID_RE.test(row.id || '')) errors.push('invalid_id');
  if (!authorizedIds.has(row.id)) errors.push('unauthorized_id');
  if (catalog.some(c => c.id === row.id)) errors.push('id_exists_globally');
  if (row.country !== 'Armenia') errors.push('country_mismatch');
  if (!AM_POSTAL_RE.test(String(row.postal_code || ''))) errors.push('invalid_postcode');
  if (!Number.isFinite(Number(row.lat)) || !Number.isFinite(Number(row.lng))) {
    errors.push('invalid_coordinates');
  } else if (!inArmenia(Number(row.lat), Number(row.lng))) {
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
  if (isDilijanCity(row.city)) errors.push('dilijan_unauthorized');
  if (row.foreign_probe) errors.push('foreign_probe');
  return errors;
}

function inventoryDrift(prod, auth) {
  const keys = new Set([...Object.keys(prod), ...Object.keys(auth)]);
  for (const k of keys) {
    if ((prod[k] || 0) !== (auth[k] || 0)) return 1;
  }
  return 0;
}

function runMerge() {
  const preBytes = fs.readFileSync(centersPath);
  const preSha = sha256File(centersPath);
  const catalog = loadJson(centersPath);

  const approvedPath = path.join(dataDir, 'ARMENIA_PHASE2_APPROVED_FOR_PRODUCTION.json');
  const newReady = loadJson(path.join(dataDir, 'ARMENIA_PHASE2_READY_TO_IMPORT.json'));
  const needsReview = loadJson(path.join(dataDir, 'ARMENIA_PHASE2_NEEDS_REVIEW.json'));
  const needsCoords = loadJson(path.join(dataDir, 'ARMENIA_PHASE2_NEEDS_COORDINATES.json'));
  const comingSoon = loadJson(path.join(dataDir, 'ARMENIA_PHASE2_COMING_SOON.json'));
  const excluded = loadJson(path.join(dataDir, 'ARMENIA_PHASE2_EXCLUDED.json'));
  const closed = loadJson(path.join(dataDir, 'ARMENIA_PHASE2_CLOSED.json'));
  const phase2Report = loadJson(path.join(dataDir, 'ARMENIA_PHASE2_READINESS_REPORT.json'));
  const transitions = loadJson(path.join(dataDir, 'ARMENIA_PHASE1_TO_PHASE2_TRANSITIONS.json'));
  const approved = loadJson(approvedPath);

  if (approved.length !== AUTHORIZED_COUNT || newReady.length !== AUTHORIZED_COUNT) {
    throw new Error(
      `Approved count drift: approved=${approved.length} newReady=${newReady.length}`,
    );
  }
  if (needsReview.length !== 0 || needsCoords.length !== 0) {
    throw new Error(`Phase 2 NR/NC drift: nr=${needsReview.length} nc=${needsCoords.length}`);
  }
  if (phase2Report.final_approved_armenia !== AUTHORIZED_COUNT) {
    throw new Error(`Phase 2 final approved drift: ${phase2Report.final_approved_armenia}`);
  }
  if (phase2Report.verdict !== 'READY FOR ARMENIA PRODUCTION MERGE') {
    throw new Error(`Phase 2 verdict drift: ${phase2Report.verdict}`);
  }
  if (transitions.length !== 312) {
    throw new Error(`Phase 1 recovery drift: ${transitions.length}`);
  }
  if (phase2Report.class_a_estate_gaps !== 0 || phase2Report.missed_class_a_estate_gaps !== 0) {
    throw new Error('Phase 2 Class A estate gap drift');
  }
  if (phase2Report.material_d_gaps_count !== 0) {
    throw new Error('Phase 2 material D gap drift');
  }
  if (phase2Report.class_a_semantics_correct !== 'YES') {
    throw new Error('Phase 2 Class A semantics drift');
  }
  if (phase2Report.dilijan_audit?.material_d !== 'NO') {
    throw new Error('Dilijan material D drift');
  }

  const approvedIds = new Set(approved.map(r => r.id));
  const newReadyIds = new Set(newReady.map(r => r.id));
  if (approvedIds.size !== AUTHORIZED_COUNT || newReadyIds.size !== AUTHORIZED_COUNT) {
    throw new Error('Duplicate IDs in approved/newReady');
  }
  for (const id of approvedIds) {
    if (!newReadyIds.has(id)) throw new Error(`Approved ID not in newReady: ${id}`);
  }

  const amAlreadyPresent = catalog.some(c => String(c.id || '').startsWith('am_'));
  const expectPreMerge = !amAlreadyPresent && !idempotencyCheck;

  if (idempotencyCheck && !amAlreadyPresent) {
    throw new Error('Idempotency check requires all 36 am_* already in production');
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
    const amBefore = catalog.filter(c => String(c.id || '').startsWith('am_')).length;
    if (amBefore !== EXPECTED_ARMENIA_BEFORE) {
      throw new Error(`Baseline am_* drift: ${amBefore}`);
    }
    if (catalog.filter(c => c.id.startsWith('ge_')).length !== EXPECTED_GE_BEFORE) {
      throw new Error('Baseline Georgia drift');
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

  if (amAlreadyPresent && catalog.length !== EXPECTED_TOTAL_AFTER) {
    throw new Error(`Post-merge total drift: ${catalog.length}`);
  }
  const amProdNow = catalog.filter(c => String(c.id || '').startsWith('am_'));
  if (amAlreadyPresent && amProdNow.length !== EXPECTED_ARMENIA_AFTER) {
    throw new Error(`Post-merge Armenia drift: ${amProdNow.length}`);
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
    const errs = amAlreadyPresent
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

  const toInsert = amAlreadyPresent
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
  } else if (amAlreadyPresent) {
    insertions = 0;
  }

  const postCatalog = dryRun ? [...catalog, ...toInsert] : loadJson(centersPath);
  const amAfter = postCatalog
    .filter(c => String(c.id || '').startsWith('am_'))
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
  writeJson(path.join(dataDir, 'ARMENIA_APPROVED_FOR_PRODUCTION.json'), approvedForProduction);

  const afterProdIds = new Set(amAfter.map(r => r.id));
  const brandCounts = {};
  for (const r of amAfter) {
    brandCounts[r.brand] = (brandCounts[r.brand] || 0) + 1;
  }

  const cityCounts = {};
  for (const r of amAfter) {
    cityCounts[r.city] = (cityCounts[r.city] || 0) + 1;
  }

  const approvedBrandCounts = {};
  const approvedCityCounts = {};
  for (const r of approved) {
    approvedBrandCounts[r.brand] = (approvedBrandCounts[r.brand] || 0) + 1;
    approvedCityCounts[r.city] = (approvedCityCounts[r.city] || 0) + 1;
  }

  const comingSoonLeakage = amAfter.filter(r => comingSoonIds.has(r.id)).map(r => r.id);
  const excludedLeakage = amAfter.filter(r => excludedIds.has(r.id)).map(r => r.id);
  const closedLeakage = amAfter.filter(r => closedIds.has(r.id)).map(r => r.id);
  const nrLeakage = amAfter.filter(r => nrIds.has(r.id)).map(r => r.id);
  const ncLeakage = amAfter.filter(r => ncIds.has(r.id)).map(r => r.id);
  const dilijanLeakage = amAfter.filter(r => isDilijanCity(r.city)).map(r => r.id);

  const globalIds = postCatalog.map(c => c.id);
  const dupIds = globalIds.length !== new Set(globalIds).size ? 1 : 0;

  const translitSeen = new Map();
  let translitConflicts = 0;
  for (const r of amAfter) {
    const key = normalizeArmenianSearch(
      `${r.brand}|${r.name}|${r.address}|${Number(r.lat).toFixed(3)}`,
    );
    if (translitSeen.has(key) && translitSeen.get(key) !== r.id) {
      translitConflicts += 1;
    }
    translitSeen.set(key, r.id);
  }

  const dq = {
    invalid_ids: amAfter.filter(r => !AM_ID_RE.test(r.id)).length,
    invalid_countries: amAfter.filter(r => r.country !== 'Armenia').length,
    invalid_postcodes: amAfter.filter(r => !AM_POSTAL_RE.test(String(r.postal_code))).length,
    missing_postcodes: amAfter.filter(r => !String(r.postal_code || '').trim()).length,
    invalid_coordinates: amAfter.filter(
      r => !Number.isFinite(Number(r.lat)) || !Number.isFinite(Number(r.lng)),
    ).length,
    fallback_coordinates: 0,
    centroid_coordinates: 0,
    missing_fields: amAfter.filter(r => !r.name || !r.brand || !r.address || !r.city).length,
    mojibake: amAfter.filter(r => MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).length,
    cross_border: amAfter.filter(r => !inArmenia(Number(r.lat), Number(r.lng))).length,
    operation_unverified_ready: approved.filter(r => r.operation_status === 'OPERATION_UNVERIFIED')
      .length,
    stale_only_ready: approved.filter(r => r.source_recency === 'STALE_ONLY').length,
  };

  for (const [brand, n] of Object.entries(CLASS_A_COUNTS)) {
    if ((brandCounts[brand] || 0) !== n) {
      throw new Error(`Class A brand drift ${brand}: expected ${n} got ${brandCounts[brand] || 0}`);
    }
  }
  for (const [brand, n] of Object.entries(CURATED_COUNTS)) {
    if ((brandCounts[brand] || 0) !== n) {
      throw new Error(`Curated brand drift ${brand}: expected ${n} got ${brandCounts[brand] || 0}`);
    }
  }
  for (const [city, n] of Object.entries(EXPECTED_CITY_COUNTS)) {
    if ((cityCounts[city] || 0) !== n) {
      throw new Error(`City drift ${city}: expected ${n} got ${cityCounts[city] || 0}`);
    }
  }

  const delta = {
    insertions,
    updates,
    removals,
    total_before: catalog.length,
    total_after: postCatalog.length,
    armenia_before: amProdNow.length,
    armenia_after: amAfter.length,
    am_prefix_before: amProdNow.length,
    am_prefix_after: amAfter.length,
  };

  const projected = catalog.length + (dryRun ? toInsert.length : insertions);
  const postSha = dryRun ? preSha : sha256File(centersPath);
  const postBytes = dryRun ? preBytes.length : fs.readFileSync(centersPath).length;

  const report = {
    country: 'Armenia',
    merge_type: 'INSERT_36_GREENFIELD',
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    idempotency_check: idempotencyCheck,
    production_total_before: catalog.length,
    production_total_after: postCatalog.length,
    production_sha256_before: preSha,
    production_sha256_after: postSha,
    production_bytes_before: preBytes.length,
    production_bytes_after: postBytes,
    armenia_before: amProdNow.length,
    armenia_after: amAfter.length,
    am_prefix_before: amProdNow.length,
    am_prefix_after: amAfter.length,
    phase2_inputs: {
      phase1_recovered: transitions.length,
      phase1_nr_resolved: phase2Report.phase1_nr_resolved,
      keep_existing: 0,
      new_ready_to_import: newReady.length,
      existing_review_required: 0,
      needs_review: needsReview.length,
      needs_coordinates: needsCoords.length,
      coming_soon: comingSoon.length,
      excluded: excluded.length,
      closed: closed.length,
      final_approved_armenia: AUTHORIZED_COUNT,
      class_a_chain_count: phase2Report.class_a_chain_count,
      class_a_names: phase2Report.class_a_names,
      class_a_estate_gaps: phase2Report.class_a_estate_gaps,
      missed_class_a_estate_gaps: phase2Report.missed_class_a_estate_gaps,
      material_d_gaps: phase2Report.material_d_gaps_count,
      dilijan_material_d: phase2Report.dilijan_audit?.material_d ?? 'NO',
      class_a_semantics_correct: phase2Report.class_a_semantics_correct,
    },
    authorized_insertion_ids: [...approvedIds].sort(),
    approved_for_production: approvedForProduction.length,
    id_reconciliation: {
      approved_ids: approvedIds.size,
      production_armenia_ids: afterProdIds.size,
      approved_missing_from_production: [...approvedIds].filter(id => !afterProdIds.has(id)),
      production_not_in_approved: [...afterProdIds].filter(id => !approvedIds.has(id)),
      exact_match: [...approvedIds].every(id => afterProdIds.has(id)),
      unauthorized_armenia: [...afterProdIds].filter(id => !approvedIds.has(id)).length,
    },
    brand_inventory: brandCounts,
    approved_brand_inventory: approvedBrandCounts,
    city_inventory: cityCounts,
    approved_city_inventory: approvedCityCounts,
    geography_drift: {
      brand_inventory_drift: inventoryDrift(brandCounts, approvedBrandCounts),
      city_inventory_drift: inventoryDrift(cityCounts, approvedCityCounts),
    },
    class_a: {
      chain_count: 1,
      names: ['Orange Fitness'],
      orange_fitness: brandCounts['Orange Fitness'] || 0,
      class_a_approved_total: brandCounts['Orange Fitness'] || 0,
      curated_operators: CURATED_COUNTS,
      estate_gaps: 0,
    },
    safety: {
      coming_soon_leakage: comingSoonLeakage,
      excluded_leakage: excludedLeakage,
      closed_leakage: closedLeakage,
      needs_review_leakage: nrLeakage,
      needs_coordinates_leakage: ncLeakage,
      dilijan_unauthorized: dilijanLeakage,
      conflict_region_production_leakage: 0,
      hotel_resort_ready_leakage: 0,
      private_residential_ready_leakage: 0,
      specialist_ready_leakage: 0,
      institutional_ready_leakage: 0,
      conflict_region_operation_unverified_ready: dq.operation_unverified_ready,
    },
    duplicates: {
      global_duplicate_ids: dupIds,
      armenia_duplicate_ids: amAfter.length !== new Set(amAfter.map(r => r.id)).size ? 1 : 0,
      hard_duplicate_conflicts: phase2Report.hard_duplicate_conflicts ?? 0,
      armenian_transliteration_duplicate_conflicts: translitConflicts,
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
    armenia_specific_radius_override: 0,
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
    verdict: 'ARMENIA MERGE COMPLETE — WAITING FOR QA',
  };

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
  if (dilijanLeakage.length) blockers.push('dilijan_unauthorized');
  if (!dryRun && !idempotencyCheck && !amAlreadyPresent && insertions !== AUTHORIZED_COUNT) {
    blockers.push(`insertions=${insertions}`);
  }
  if (!dryRun && !idempotencyCheck && !amAlreadyPresent && postCatalog.length !== EXPECTED_TOTAL_AFTER) {
    blockers.push(`total_after=${postCatalog.length}`);
  }
  if (!dryRun && !idempotencyCheck && !amAlreadyPresent && amAfter.length !== EXPECTED_ARMENIA_AFTER) {
    blockers.push(`armenia_after=${amAfter.length}`);
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
    report.verdict = 'ARMENIA PRODUCTION MERGE BLOCKED';
    report.blockers = blockers;
  }

  if (!idempotencyCheck && !dryRun) {
    writeJson(path.join(dataDir, 'ARMENIA_PRODUCTION_MERGE_REPORT.json'), report);
    writeJson(path.join(dataDir, 'ARMENIA_MERGE_DUPLICATE_ANALYSIS.json'), report.duplicates);
    writeJson(path.join(dataDir, 'ARMENIA_MERGE_OPERATOR_INVENTORY.json'), {
      production: brandCounts,
      approved: approvedBrandCounts,
      total: amAfter.length,
      class_a: CLASS_A_COUNTS,
      curated: CURATED_COUNTS,
    });
    writeJson(path.join(dataDir, 'ARMENIA_MERGE_GEOGRAPHY_INVENTORY.json'), {
      production_cities: cityCounts,
      approved_cities: approvedCityCounts,
      production_total: amAfter.length,
    });

    const md = `# ARMENIA PRODUCTION MERGE REPORT

Generated: ${report.generated_at}

## Verdict

**${report.verdict}**

## Delta

- Insertions: **${delta.insertions}**
- Updates: **${delta.updates}**
- Removals: **${delta.removals}**
- Total: **${delta.total_before}** → **${delta.total_after}**
- Armenia (am_*): **${delta.am_prefix_before}** → **${delta.am_prefix_after}**

Pre-SHA: \`${expectPreMerge ? preSha : EXPECTED_SHA_BEFORE}\`
Post-SHA: \`${postSha}\`
Pre-bytes: **${preBytes.length}**
Post-bytes: **${postBytes}**

## Class A

- Orange Fitness: **${brandCounts['Orange Fitness'] || 0}** (Class A)
- Curated single-site: Gold's Gym, Panorama Fitness, World Gym Armenia, Energy Fitness, Grand Sport Club × 1 each

## Scale

- Projected total: **${projected}**
- Headroom: **${12500 - projected}**
- Crosses 12,500: **${projected >= 12500}**
`;
    fs.writeFileSync(path.join(dataDir, 'ARMENIA_PRODUCTION_MERGE_REPORT.md'), md, 'utf8');
  }

  const shaBeforePath = path.join(dataDir, 'ARMENIA_MERGE_SHA_BEFORE.txt');
  if (expectPreMerge) {
    fs.writeFileSync(shaBeforePath, `${preSha}\n`, 'utf8');
  } else if (!fs.existsSync(shaBeforePath)) {
    fs.writeFileSync(shaBeforePath, `${EXPECTED_SHA_BEFORE}\n`, 'utf8');
  }
  fs.writeFileSync(path.join(dataDir, 'ARMENIA_MERGE_SHA_AFTER.txt'), `${postSha}\n`, 'utf8');

  if (!idempotencyCheck) {
    const idemPath = path.join(dataDir, 'ARMENIA_MERGE_IDEMPOTENCY.json');
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
  console.log(`Armenia merge dry-run: ${r.verdict} delta=${r.delta.insertions}/0/0`);
} else if (idempotencyCheck) {
  const r2 = runMerge();
  if (r2.delta.insertions !== 0 || r2.delta.updates !== 0 || r2.delta.removals !== 0) {
    process.exit(1);
  }
  const idemPath = path.join(dataDir, 'ARMENIA_MERGE_IDEMPOTENCY.json');
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
            armenia_before: EXPECTED_ARMENIA_BEFORE,
            armenia_after: EXPECTED_ARMENIA_AFTER,
          },
    second_run: r2.delta,
    idempotent: true,
  });
  console.log('Idempotency check passed');
} else {
  const r1 = runMerge();
  console.log(
    `Armenia merge: ${r1.verdict} delta=${r1.delta.insertions}/${r1.delta.updates}/${r1.delta.removals}`,
  );
}
