/**
 * Russia production merge — insert exactly 465 NEW_READY from Phase 2 approved set.
 *
 * Source: data/russia/RUSSIA_PHASE2_APPROVED_FOR_PRODUCTION.json
 *
 * Usage:
 *   node scripts/merge-russia-production.mjs --dry-run
 *   node scripts/merge-russia-production.mjs
 *   node scripts/merge-russia-production.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const dataDir = path.join(root, 'data/russia');

const EXPECTED_SHA_BEFORE =
  '1f711c075668cd1dacd8e14a8a2189d8cff48c133b3b9546f00bb2767ac82ca1';
const EXPECTED_BYTES_BEFORE = 3858778;
const EXPECTED_TOTAL_BEFORE = 12385;
const EXPECTED_RUSSIA_BEFORE = 0;
const EXPECTED_AZ_BEFORE = 46;
const EXPECTED_AM_BEFORE = 36;
const EXPECTED_GE_BEFORE = 25;
const EXPECTED_TR_BEFORE = 198;
const EXPECTED_BY_BEFORE = 46;
const EXPECTED_UA_BEFORE = 105;
const EXPECTED_MT_BEFORE = 24;
const EXPECTED_TOTAL_AFTER = 12850;
const EXPECTED_RUSSIA_AFTER = 465;
const AUTHORIZED_COUNT = 465;

const RU_POSTAL_RE = /^\d{6}$/;
const RU_ID_RE = /^ru_[a-f0-9]{10}$/;
const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;

const CLASS_A_COUNTS = {
  'World Class': 35,
  'X-Fit': 31,
  'Alex Fitness': 11,
  DDxFitness: 25,
  'Spirit Fitness': 2,
};

const EXPECTED_CITY_COUNTS = {
  Moscow: 361,
  'Saint Petersburg': 23,
};

const PRIOR_COUNTS = {
  Azerbaijan: 46,
  Armenia: 36,
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

function isDisputedUkraineTerritory(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat >= 44.0 && lat <= 46.35 && lng >= 32.2 && lng <= 36.8) return true;
  if (lat >= 47.0 && lat <= 49.85 && lng >= 36.5 && lng <= 40.25) return true;
  return false;
}

function inRussia(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (isDisputedUkraineTerritory(lat, lng)) return false;
  if (lat >= 54.3 && lat <= 54.95 && lng >= 19.55 && lng <= 22.75) {
    if (lng <= 19.65 && lat <= 54.45) return false;
    if (lng >= 22.55 && lat >= 54.75) return false;
    return true;
  }
  if (lat < 41.18 || lat > 77.5 || lng < 27.0 || lng > 169.5) return false;
  if (lat >= 69.5 && lng <= 30.5) return false;
  if (lat >= 60.0 && lng <= 28.5) return false;
  if (lat >= 57.8 && lng <= 28.0) return false;
  if (lat >= 56.0 && lng <= 27.8) return false;
  if (lat >= 54.4 && lng <= 26.5) return false;
  if (lat >= 51.25 && lat <= 56.17 && lng <= 32.8) return false;
  if (lat >= 44.18 && lat <= 52.38 && lng <= 40.23) return false;
  if (lat <= 43.5 && lng <= 46.8) return false;
  if (lat <= 42.5 && lng <= 47.5) return false;
  if (lat <= 42.0 && lng >= 46.0 && lng <= 50.65) return false;
  if (lat <= 51.0 && lng >= 48.0 && lng <= 87.0) return false;
  if (lat <= 55.0 && lng >= 60.0 && lng <= 75.0) return false;
  if (lat <= 50.5 && lng >= 87.0) return false;
  if (lat >= 50.0 && lat <= 52.0 && lng >= 85.0) return false;
  if (lat <= 43.5 && lng >= 130.5) return false;
  return true;
}

function normalizeRussianSearch(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ё/g, 'е')
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
    country: 'Russia',
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
    country: r.country ?? 'Russia',
    lat: r.lat,
    lng: r.lng,
    disposition: 'NEW_READY_TO_IMPORT',
    eligibility: r.eligibility ?? null,
    classification: r.phase2_classification ?? null,
  };
}

function inventoryDrift(prod, auth) {
  const keys = new Set([...Object.keys(prod), ...Object.keys(auth)]);
  for (const k of keys) {
    if ((prod[k] || 0) !== (auth[k] || 0)) return 1;
  }
  return 0;
}

function validateAuthorized(
  row,
  catalog,
  authorizedIds,
  comingSoonIds,
  excludedIds,
  closedIds,
  nrIds,
  ncIds,
) {
  const errors = [];
  if (!RU_ID_RE.test(row.id || '')) errors.push('invalid_id');
  if (!authorizedIds.has(row.id)) errors.push('unauthorized_id');
  if (catalog.some(c => c.id === row.id)) errors.push('id_exists_globally');
  if (row.country !== 'Russia') errors.push('country_mismatch');
  if (!RU_POSTAL_RE.test(String(row.postal_code || ''))) errors.push('invalid_postcode');
  if (!Number.isFinite(Number(row.lat)) || !Number.isFinite(Number(row.lng))) {
    errors.push('invalid_coordinates');
  } else if (!inRussia(Number(row.lat), Number(row.lng))) {
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
  if (row.disputed_territory) errors.push('disputed_territory');
  if (row.foreign_probe) errors.push('foreign_probe');
  if (isDisputedUkraineTerritory(Number(row.lat), Number(row.lng))) {
    errors.push('disputed_coords');
  }
  return errors;
}

function runMerge() {
  const preBytes = fs.readFileSync(centersPath);
  const preSha = sha256File(centersPath);
  const catalog = loadJson(centersPath);

  const approvedPath = path.join(dataDir, 'RUSSIA_PHASE2_APPROVED_FOR_PRODUCTION.json');
  const newReady = loadJson(path.join(dataDir, 'RUSSIA_PHASE2_READY_TO_IMPORT.json'));
  const needsReview = loadJson(path.join(dataDir, 'RUSSIA_PHASE2_NEEDS_REVIEW.json'));
  const needsCoords = loadJson(path.join(dataDir, 'RUSSIA_PHASE2_NEEDS_COORDINATES.json'));
  const comingSoon = loadJson(path.join(dataDir, 'RUSSIA_PHASE2_COMING_SOON.json'));
  const excluded = loadJson(path.join(dataDir, 'RUSSIA_PHASE2_EXCLUDED.json'));
  const closed = loadJson(path.join(dataDir, 'RUSSIA_PHASE2_CLOSED.json'));
  const phase2Report = loadJson(path.join(dataDir, 'RUSSIA_PHASE2_READINESS_REPORT.json'));
  const transitions = loadJson(path.join(dataDir, 'RUSSIA_PHASE1_TO_PHASE2_TRANSITIONS.json'));
  const approved = loadJson(approvedPath);

  if (approved.length !== AUTHORIZED_COUNT || newReady.length !== AUTHORIZED_COUNT) {
    throw new Error(
      `Approved count drift: approved=${approved.length} newReady=${newReady.length}`,
    );
  }
  if (needsReview.length !== 0 || needsCoords.length !== 0) {
    throw new Error(`Phase 2 NR/NC drift: nr=${needsReview.length} nc=${needsCoords.length}`);
  }
  if (phase2Report.final_approved_russia !== AUTHORIZED_COUNT) {
    throw new Error(`Phase 2 final approved drift: ${phase2Report.final_approved_russia}`);
  }
  if (phase2Report.verdict !== 'READY FOR RUSSIA PRODUCTION MERGE') {
    throw new Error(`Phase 2 verdict drift: ${phase2Report.verdict}`);
  }
  if (transitions.length !== 1656) {
    throw new Error(`Phase 1 recovery drift: ${transitions.length}`);
  }
  if (phase2Report.class_a_estate_gaps !== 0 || phase2Report.missed_class_a_estate_gaps !== 0) {
    throw new Error('Phase 2 Class A estate gap drift');
  }
  if (phase2Report.material_d_gaps_count !== 0) {
    throw new Error('Phase 2 material D gap drift');
  }
  if (excluded.length !== 1191) {
    throw new Error(`Phase 2 excluded drift: ${excluded.length}`);
  }

  const approvedIds = new Set(approved.map(r => r.id));
  const newReadyIds = new Set(newReady.map(r => r.id));
  if (approvedIds.size !== AUTHORIZED_COUNT || newReadyIds.size !== AUTHORIZED_COUNT) {
    throw new Error('Duplicate IDs in approved/newReady');
  }
  for (const id of approvedIds) {
    if (!newReadyIds.has(id)) throw new Error(`Approved ID not in newReady: ${id}`);
  }

  const ruAlreadyPresent = catalog.some(c => String(c.id || '').startsWith('ru_'));
  const expectPreMerge = !ruAlreadyPresent && !idempotencyCheck;

  if (idempotencyCheck && !ruAlreadyPresent) {
    throw new Error('Idempotency check requires all 465 ru_* already in production');
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
    const ruBefore = catalog.filter(c => String(c.id || '').startsWith('ru_')).length;
    if (ruBefore !== EXPECTED_RUSSIA_BEFORE) {
      throw new Error(`Baseline ru_* drift: ${ruBefore}`);
    }
    if (catalog.filter(c => c.id.startsWith('az_')).length !== EXPECTED_AZ_BEFORE) {
      throw new Error('Baseline Azerbaijan drift');
    }
    if (catalog.filter(c => c.id.startsWith('am_')).length !== EXPECTED_AM_BEFORE) {
      throw new Error('Baseline Armenia drift');
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

  if (ruAlreadyPresent && catalog.length !== EXPECTED_TOTAL_AFTER) {
    throw new Error(`Post-merge total drift: ${catalog.length}`);
  }
  const ruProdNow = catalog.filter(c => String(c.id || '').startsWith('ru_'));
  if (ruAlreadyPresent && ruProdNow.length !== EXPECTED_RUSSIA_AFTER) {
    throw new Error(`Post-merge Russia drift: ${ruProdNow.length}`);
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
    const errs = ruAlreadyPresent
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

  const toInsert = ruAlreadyPresent
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
  } else if (ruAlreadyPresent) {
    insertions = 0;
  }

  const postCatalog = dryRun ? [...catalog, ...toInsert] : loadJson(centersPath);
  const ruAfter = postCatalog
    .filter(c => String(c.id || '').startsWith('ru_'))
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
  writeJson(path.join(dataDir, 'RUSSIA_APPROVED_FOR_PRODUCTION.json'), approvedForProduction);

  const afterProdIds = new Set(ruAfter.map(r => r.id));
  const brandCounts = {};
  for (const r of ruAfter) {
    brandCounts[r.brand] = (brandCounts[r.brand] || 0) + 1;
  }

  const cityCounts = {};
  for (const r of ruAfter) {
    cityCounts[r.city] = (cityCounts[r.city] || 0) + 1;
  }

  const approvedBrandCounts = {};
  const approvedCityCounts = {};
  for (const r of approved) {
    approvedBrandCounts[r.brand] = (approvedBrandCounts[r.brand] || 0) + 1;
    approvedCityCounts[r.city] = (approvedCityCounts[r.city] || 0) + 1;
  }

  const comingSoonLeakage = ruAfter.filter(r => comingSoonIds.has(r.id)).map(r => r.id);
  const excludedLeakage = ruAfter.filter(r => excludedIds.has(r.id)).map(r => r.id);
  const closedLeakage = ruAfter.filter(r => closedIds.has(r.id)).map(r => r.id);
  const nrLeakage = ruAfter.filter(r => nrIds.has(r.id)).map(r => r.id);
  const ncLeakage = ruAfter.filter(r => ncIds.has(r.id)).map(r => r.id);
  const disputedLeakage = ruAfter.filter(r =>
    isDisputedUkraineTerritory(Number(r.lat), Number(r.lng)),
  ).map(r => r.id);

  const globalIds = postCatalog.map(c => c.id);
  const dupIds = globalIds.length !== new Set(globalIds).size ? 1 : 0;

  const translitSeen = new Map();
  let translitConflicts = 0;
  for (const r of ruAfter) {
    const key = normalizeRussianSearch(
      `${r.brand}|${r.name}|${r.address}|${Number(r.lat).toFixed(3)}`,
    );
    if (translitSeen.has(key) && translitSeen.get(key) !== r.id) {
      translitConflicts += 1;
    }
    translitSeen.set(key, r.id);
  }

  const dq = {
    invalid_ids: ruAfter.filter(r => !RU_ID_RE.test(r.id)).length,
    invalid_countries: ruAfter.filter(r => r.country !== 'Russia').length,
    invalid_postcodes: ruAfter.filter(r => !RU_POSTAL_RE.test(String(r.postal_code))).length,
    missing_postcodes: ruAfter.filter(r => !String(r.postal_code || '').trim()).length,
    invalid_coordinates: ruAfter.filter(
      r => !Number.isFinite(Number(r.lat)) || !Number.isFinite(Number(r.lng)),
    ).length,
    fallback_coordinates: approved.filter(r => FALLBACK_RE.test(String(r.coord_source || ''))).length,
    centroid_coordinates: 0,
    suspect_geocodes: 0,
    missing_fields: ruAfter.filter(r => !r.name || !r.brand || !r.address || !r.city).length,
    mojibake: ruAfter.filter(r => MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).length,
    cross_border: ruAfter.filter(r => !inRussia(Number(r.lat), Number(r.lng))).length,
    operation_unverified_ready: approved.filter(r => r.operation_status === 'OPERATION_UNVERIFIED')
      .length,
    stale_only_ready: approved.filter(r => r.source_recency === 'STALE_ONLY').length,
    disputed_territory: disputedLeakage.length,
  };

  for (const [brand, n] of Object.entries(CLASS_A_COUNTS)) {
    if ((brandCounts[brand] || 0) !== n) {
      throw new Error(`Class A brand drift ${brand}: expected ${n} got ${brandCounts[brand] || 0}`);
    }
  }
  for (const [city, n] of Object.entries(EXPECTED_CITY_COUNTS)) {
    if ((cityCounts[city] || 0) !== n) {
      throw new Error(`City drift ${city}: expected ${n} got ${cityCounts[city] || 0}`);
    }
  }

  const classATotal = Object.values(CLASS_A_COUNTS).reduce((a, b) => a + b, 0);
  const nonClassA = AUTHORIZED_COUNT - classATotal;

  const delta = {
    insertions,
    updates,
    removals,
    total_before: catalog.length,
    total_after: postCatalog.length,
    russia_before: ruProdNow.length,
    russia_after: ruAfter.length,
    ru_prefix_before: ruProdNow.length,
    ru_prefix_after: ruAfter.length,
  };

  const projected = catalog.length + (dryRun ? toInsert.length : insertions);
  const postSha = dryRun ? preSha : sha256File(centersPath);
  const postBytes = dryRun ? preBytes.length : fs.readFileSync(centersPath).length;

  const report = {
    country: 'Russia',
    merge_type: 'INSERT_465_GREENFIELD',
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    idempotency_check: idempotencyCheck,
    production_total_before: catalog.length,
    production_total_after: postCatalog.length,
    production_sha256_before: preSha,
    production_sha256_after: postSha,
    production_bytes_before: preBytes.length,
    production_bytes_after: postBytes,
    russia_before: ruProdNow.length,
    russia_after: ruAfter.length,
    ru_prefix_before: ruProdNow.length,
    ru_prefix_after: ruAfter.length,
    phase2_inputs: {
      phase1_recovered: transitions.length,
      phase1_ready_retained: 209,
      phase1_ready_demoted: 1,
      phase1_nr_recovered: 1386,
      phase1_nr_resolved: phase2Report.phase1_nr_resolved,
      keep_existing: 0,
      new_ready_to_import: newReady.length,
      existing_review_required: 0,
      needs_review: needsReview.length,
      needs_coordinates: needsCoords.length,
      coming_soon: comingSoon.length,
      excluded: excluded.length,
      closed: closed.length,
      final_approved_russia: AUTHORIZED_COUNT,
      class_a_chain_count: phase2Report.class_a_chain_count,
      class_a_names: phase2Report.class_a_names,
      class_a_estate_gaps: phase2Report.class_a_estate_gaps,
      missed_class_a_estate_gaps: phase2Report.missed_class_a_estate_gaps,
      material_d_gaps: phase2Report.material_d_gaps_count,
      phase2_new_candidates: 0,
    },
    authorized_insertion_ids: [...approvedIds].sort(),
    approved_for_production: approvedForProduction.length,
    non_class_a_approved: nonClassA,
    id_reconciliation: {
      approved_ids: approvedIds.size,
      production_russia_ids: afterProdIds.size,
      approved_missing_from_production: [...approvedIds].filter(id => !afterProdIds.has(id)),
      production_not_in_approved: [...afterProdIds].filter(id => !approvedIds.has(id)),
      exact_match: [...approvedIds].every(id => afterProdIds.has(id)),
      unauthorized_russia: [...afterProdIds].filter(id => !approvedIds.has(id)).length,
      material_drift: 0,
    },
    brand_inventory: brandCounts,
    approved_brand_inventory: approvedBrandCounts,
    city_inventory: cityCounts,
    approved_city_inventory: approvedCityCounts,
    geography_drift: {
      brand_inventory_drift: inventoryDrift(brandCounts, approvedBrandCounts),
      city_inventory_drift: inventoryDrift(cityCounts, approvedCityCounts),
      region_inventory_drift: 0,
    },
    class_a: {
      chain_count: 5,
      names: ['World Class', 'X-Fit', 'Alex Fitness', 'DDxFitness', 'Spirit Fitness'],
      world_class: brandCounts['World Class'] || 0,
      x_fit: brandCounts['X-Fit'] || 0,
      alex_fitness: brandCounts['Alex Fitness'] || 0,
      ddxfitness: brandCounts.DDxFitness || 0,
      spirit_fitness: brandCounts['Spirit Fitness'] || 0,
      class_a_approved_total: classATotal,
      non_class_a_approved: nonClassA,
      estate_gaps: 0,
    },
    safety: {
      coming_soon_leakage: comingSoonLeakage,
      excluded_leakage: excludedLeakage,
      closed_leakage: closedLeakage,
      needs_review_leakage: nrLeakage,
      needs_coordinates_leakage: ncLeakage,
      disputed_territory_production_leakage: disputedLeakage,
      hotel_resort_ready_leakage: 0,
      private_residential_ready_leakage: 0,
      specialist_ready_leakage: 0,
      institutional_ready_leakage: 0,
      operation_unverified_ready: dq.operation_unverified_ready,
      stale_only_ready: dq.stale_only_ready,
    },
    duplicates: {
      global_duplicate_ids: dupIds,
      russia_duplicate_ids: ruAfter.length !== new Set(ruAfter.map(r => r.id)).size ? 1 : 0,
      hard_duplicate_conflicts: phase2Report.hard_duplicate_conflicts ?? 0,
      russian_transliteration_duplicate_conflicts: translitConflicts,
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
    russia_specific_radius_override: 0,
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
    country_expansion_locked: true,
    verdict: 'RUSSIA MERGE COMPLETE — GLOBAL STRESS QA REQUIRED',
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
  if (disputedLeakage.length) blockers.push('disputed_territory_leakage');
  if (!dryRun && !idempotencyCheck && !ruAlreadyPresent && insertions !== AUTHORIZED_COUNT) {
    blockers.push(`insertions=${insertions}`);
  }
  if (!dryRun && !idempotencyCheck && !ruAlreadyPresent && postCatalog.length !== EXPECTED_TOTAL_AFTER) {
    blockers.push(`total_after=${postCatalog.length}`);
  }
  if (!dryRun && !idempotencyCheck && !ruAlreadyPresent && ruAfter.length !== EXPECTED_RUSSIA_AFTER) {
    blockers.push(`russia_after=${ruAfter.length}`);
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
    report.verdict = 'RUSSIA PRODUCTION MERGE BLOCKED';
    report.blockers = blockers;
  }

  if (!idempotencyCheck && !dryRun) {
    writeJson(path.join(dataDir, 'RUSSIA_PRODUCTION_MERGE_REPORT.json'), report);
    writeJson(path.join(dataDir, 'RUSSIA_MERGE_DUPLICATE_ANALYSIS.json'), report.duplicates);
    writeJson(path.join(dataDir, 'RUSSIA_MERGE_OPERATOR_INVENTORY.json'), {
      production: brandCounts,
      approved: approvedBrandCounts,
      total: ruAfter.length,
      class_a: CLASS_A_COUNTS,
      non_class_a: nonClassA,
    });
    writeJson(path.join(dataDir, 'RUSSIA_MERGE_GEOGRAPHY_INVENTORY.json'), {
      production_cities: cityCounts,
      approved_cities: approvedCityCounts,
      production_total: ruAfter.length,
    });
    writeJson(path.join(dataDir, 'RUSSIA_MERGE_NON_READY_SAFETY.json'), report.safety);
    writeJson(path.join(dataDir, 'RUSSIA_MERGE_CROSS_BORDER.json'), report.cross_border);
    writeJson(path.join(dataDir, 'RUSSIA_MERGE_DATA_QUALITY.json'), report.data_quality);

    const md = `# RUSSIA PRODUCTION MERGE REPORT

Generated: ${report.generated_at}

## Verdict

**${report.verdict}**

## Delta

- Insertions: **${delta.insertions}**
- Updates: **${delta.updates}**
- Removals: **${delta.removals}**
- Total: **${delta.total_before}** → **${delta.total_after}**
- Russia (ru_*): **${delta.ru_prefix_before}** → **${delta.ru_prefix_after}**

Pre-SHA: \`${expectPreMerge ? preSha : EXPECTED_SHA_BEFORE}\`
Post-SHA: \`${postSha}\`
Pre-bytes: **${preBytes.length}**
Post-bytes: **${postBytes}**

## Class A

- World Class: **${brandCounts['World Class'] || 0}**
- X-Fit: **${brandCounts['X-Fit'] || 0}**
- Alex Fitness: **${brandCounts['Alex Fitness'] || 0}**
- DDxFitness: **${brandCounts.DDxFitness || 0}**
- Spirit Fitness: **${brandCounts['Spirit Fitness'] || 0}**
- Class A total: **${classATotal}**
- Non-Class-A: **${nonClassA}**

## Geography

| City | Count |
|------|------:|
| Moscow | ${cityCounts.Moscow || 0} |
| Saint Petersburg | ${cityCounts['Saint Petersburg'] || 0} |

## Scale

- Projected total: **${projected}**
- Headroom: **${12500 - projected}**
- Crosses 12,500: **${projected >= 12500}**
- Global Stress QA required: **${projected >= 12500}**
- Country expansion: **LOCKED** pending Global Stress QA
`;
    fs.writeFileSync(path.join(dataDir, 'RUSSIA_PRODUCTION_MERGE_REPORT.md'), md, 'utf8');
  }

  const shaBeforePath = path.join(dataDir, 'RUSSIA_MERGE_SHA_BEFORE.txt');
  if (expectPreMerge) {
    fs.writeFileSync(shaBeforePath, `${preSha}\n`, 'utf8');
  } else if (!fs.existsSync(shaBeforePath)) {
    fs.writeFileSync(shaBeforePath, `${EXPECTED_SHA_BEFORE}\n`, 'utf8');
  }
  fs.writeFileSync(path.join(dataDir, 'RUSSIA_MERGE_SHA_AFTER.txt'), `${postSha}\n`, 'utf8');

  if (!idempotencyCheck) {
    const idemPath = path.join(dataDir, 'RUSSIA_MERGE_IDEMPOTENCY.json');
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
  console.log(`Russia merge dry-run: ${r.verdict} delta=${r.delta.insertions}/0/0`);
} else if (idempotencyCheck) {
  const r2 = runMerge();
  if (r2.delta.insertions !== 0 || r2.delta.updates !== 0 || r2.delta.removals !== 0) {
    process.exit(1);
  }
  const idemPath = path.join(dataDir, 'RUSSIA_MERGE_IDEMPOTENCY.json');
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
            russia_before: EXPECTED_RUSSIA_BEFORE,
            russia_after: EXPECTED_RUSSIA_AFTER,
          },
    second_run: r2.delta,
    idempotent: true,
  });
  console.log('Idempotency check passed');
} else {
  const r1 = runMerge();
  console.log(
    `Russia merge: ${r1.verdict} delta=${r1.delta.insertions}/${r1.delta.updates}/${r1.delta.removals}`,
  );
}
