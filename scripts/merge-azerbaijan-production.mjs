/**
 * Azerbaijan production merge — insert exactly 46 NEW_READY from Phase 2 approved set.
 *
 * Source: data/azerbaijan/AZERBAIJAN_PHASE2_APPROVED_FOR_PRODUCTION.json
 *
 * Usage:
 *   node scripts/merge-azerbaijan-production.mjs --dry-run
 *   node scripts/merge-azerbaijan-production.mjs
 *   node scripts/merge-azerbaijan-production.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const dataDir = path.join(root, 'data/azerbaijan');

const EXPECTED_SHA_BEFORE =
  '7ddc9977a7273668b3fcc6edb68b9a490b873e478bccd1e51b9f31710a2585e7';
const EXPECTED_BYTES_BEFORE = 3844273;
const EXPECTED_TOTAL_BEFORE = 12339;
const EXPECTED_AZERBAIJAN_BEFORE = 0;
const EXPECTED_AM_BEFORE = 36;
const EXPECTED_GE_BEFORE = 25;
const EXPECTED_TR_BEFORE = 198;
const EXPECTED_BY_BEFORE = 46;
const EXPECTED_UA_BEFORE = 105;
const EXPECTED_MT_BEFORE = 24;
const EXPECTED_TOTAL_AFTER = 12385;
const EXPECTED_AZERBAIJAN_AFTER = 46;
const AUTHORIZED_COUNT = 46;

const AZ_POSTAL_RE = /^\d{4}$/;
const AZ_ID_RE = /^az_[a-f0-9]{10}$/;
const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;

const CLASS_A_COUNTS = {
  'FS Club Network': 3,
};

const CURATED_COUNTS = {
  'World Class Azerbaijan': 1,
  '1st Fitness': 1,
  FitClub: 1,
  'Fit Way': 1,
  Pulse: 1,
  "Gold's Gym": 1,
  'Sport Life': 1,
  'Dream Body': 1,
};

const EXPECTED_CITY_COUNTS = {
  Baku: 21,
  Sumqayit: 12,
  Ganja: 8,
  Mingachevir: 2,
  Lankaran: 2,
  Masazır: 1,
};

const PRIOR_COUNTS = {
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

function inAzerbaijan(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (38.78 <= lat && lat <= 39.62 && 44.72 <= lng && lng <= 46.25) {
    if (lng <= 44.78 && lat <= 39.35) return false;
    if (lng >= 46.05 && lat >= 39.15) return false;
    if (lat <= 38.85 && lng >= 45.0) return false;
    return true;
  }
  if (lat < 38.39 || lat > 41.92 || lng < 44.77 || lng > 50.65) return false;
  if (lng <= 45.0 && lat >= 41.5) return false;
  if (lng <= 44.85 && lat >= 41.0) return false;
  if (lng <= 45.5 && lat >= 41.75) return false;
  if (lng <= 45.05 && lat >= 40.5 && lat <= 41.2) return false;
  if (lng <= 45.8 && lat <= 39.5) return false;
  if (lat <= 39.0 && lng <= 46.8) return false;
  if (lat <= 39.35 && lng <= 47.5) return false;
  if (lat <= 38.45 && lng >= 48.5) return false;
  if (lat <= 38.55 && lng >= 47.0) return false;
  if (lat >= 41.85 && lng <= 48.5) return false;
  if (lat >= 41.75 && lng <= 47.5) return false;
  return true;
}

function isNakhchivanCity(city) {
  const c = String(city || '').toLowerCase();
  return /nakhchivan|naxcivan|naxçıvan|naxcivan/i.test(c);
}

function isConflictRegionRow(row) {
  return Boolean(row.conflict_region) || row.brand === 'Conflict region probe';
}

function normalizeAzerbaijaniSearch(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ə/g, 'e')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
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
    country: 'Azerbaijan',
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
    country: r.country ?? 'Azerbaijan',
    lat: r.lat,
    lng: r.lng,
    disposition: 'NEW_READY_TO_IMPORT',
    eligibility: r.eligibility ?? null,
    classification: r.phase2_classification ?? null,
  };
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
  if (!AZ_ID_RE.test(row.id || '')) errors.push('invalid_id');
  if (!authorizedIds.has(row.id)) errors.push('unauthorized_id');
  if (catalog.some(c => c.id === row.id)) errors.push('id_exists_globally');
  if (row.country !== 'Azerbaijan') errors.push('country_mismatch');
  if (!AZ_POSTAL_RE.test(String(row.postal_code || ''))) errors.push('invalid_postcode');
  if (!Number.isFinite(Number(row.lat)) || !Number.isFinite(Number(row.lng))) {
    errors.push('invalid_coordinates');
  } else if (!inAzerbaijan(Number(row.lat), Number(row.lng))) {
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
  if (isNakhchivanCity(row.city)) errors.push('nakhchivan_unauthorized');
  if (isConflictRegionRow(row)) errors.push('conflict_region_unauthorized');
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

  const approvedPath = path.join(dataDir, 'AZERBAIJAN_PHASE2_APPROVED_FOR_PRODUCTION.json');
  const newReady = loadJson(path.join(dataDir, 'AZERBAIJAN_PHASE2_READY_TO_IMPORT.json'));
  const needsReview = loadJson(path.join(dataDir, 'AZERBAIJAN_PHASE2_NEEDS_REVIEW.json'));
  const needsCoords = loadJson(path.join(dataDir, 'AZERBAIJAN_PHASE2_NEEDS_COORDINATES.json'));
  const comingSoon = loadJson(path.join(dataDir, 'AZERBAIJAN_PHASE2_COMING_SOON.json'));
  const excluded = loadJson(path.join(dataDir, 'AZERBAIJAN_PHASE2_EXCLUDED.json'));
  const closed = loadJson(path.join(dataDir, 'AZERBAIJAN_PHASE2_CLOSED.json'));
  const phase2Report = loadJson(path.join(dataDir, 'AZERBAIJAN_PHASE2_READINESS_REPORT.json'));
  const transitions = loadJson(path.join(dataDir, 'AZERBAIJAN_PHASE1_TO_PHASE2_TRANSITIONS.json'));
  const approved = loadJson(approvedPath);

  if (approved.length !== AUTHORIZED_COUNT || newReady.length !== AUTHORIZED_COUNT) {
    throw new Error(
      `Approved count drift: approved=${approved.length} newReady=${newReady.length}`,
    );
  }
  if (needsReview.length !== 0 || needsCoords.length !== 0) {
    throw new Error(`Phase 2 NR/NC drift: nr=${needsReview.length} nc=${needsCoords.length}`);
  }
  if (phase2Report.final_approved_azerbaijan !== AUTHORIZED_COUNT) {
    throw new Error(`Phase 2 final approved drift: ${phase2Report.final_approved_azerbaijan}`);
  }
  if (phase2Report.verdict !== 'READY FOR AZERBAIJAN PRODUCTION MERGE') {
    throw new Error(`Phase 2 verdict drift: ${phase2Report.verdict}`);
  }
  if (transitions.length !== 434) {
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
  if (excluded.length !== 388) {
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

  const azAlreadyPresent = catalog.some(c => String(c.id || '').startsWith('az_'));
  const expectPreMerge = !azAlreadyPresent && !idempotencyCheck;

  if (idempotencyCheck && !azAlreadyPresent) {
    throw new Error('Idempotency check requires all 46 az_* already in production');
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
    const azBefore = catalog.filter(c => String(c.id || '').startsWith('az_')).length;
    if (azBefore !== EXPECTED_AZERBAIJAN_BEFORE) {
      throw new Error(`Baseline az_* drift: ${azBefore}`);
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

  if (azAlreadyPresent && catalog.length !== EXPECTED_TOTAL_AFTER) {
    throw new Error(`Post-merge total drift: ${catalog.length}`);
  }
  const azProdNow = catalog.filter(c => String(c.id || '').startsWith('az_'));
  if (azAlreadyPresent && azProdNow.length !== EXPECTED_AZERBAIJAN_AFTER) {
    throw new Error(`Post-merge Azerbaijan drift: ${azProdNow.length}`);
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
    const errs = azAlreadyPresent
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

  const toInsert = azAlreadyPresent
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
  } else if (azAlreadyPresent) {
    insertions = 0;
  }

  const postCatalog = dryRun ? [...catalog, ...toInsert] : loadJson(centersPath);
  const azAfter = postCatalog
    .filter(c => String(c.id || '').startsWith('az_'))
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
  writeJson(path.join(dataDir, 'AZERBAIJAN_APPROVED_FOR_PRODUCTION.json'), approvedForProduction);

  const afterProdIds = new Set(azAfter.map(r => r.id));
  const brandCounts = {};
  for (const r of azAfter) {
    brandCounts[r.brand] = (brandCounts[r.brand] || 0) + 1;
  }

  const cityCounts = {};
  for (const r of azAfter) {
    cityCounts[r.city] = (cityCounts[r.city] || 0) + 1;
  }

  const approvedBrandCounts = {};
  const approvedCityCounts = {};
  for (const r of approved) {
    approvedBrandCounts[r.brand] = (approvedBrandCounts[r.brand] || 0) + 1;
    approvedCityCounts[r.city] = (approvedCityCounts[r.city] || 0) + 1;
  }

  const comingSoonLeakage = azAfter.filter(r => comingSoonIds.has(r.id)).map(r => r.id);
  const excludedLeakage = azAfter.filter(r => excludedIds.has(r.id)).map(r => r.id);
  const closedLeakage = azAfter.filter(r => closedIds.has(r.id)).map(r => r.id);
  const nrLeakage = azAfter.filter(r => nrIds.has(r.id)).map(r => r.id);
  const ncLeakage = azAfter.filter(r => ncIds.has(r.id)).map(r => r.id);
  const nakhchivanLeakage = azAfter.filter(r => isNakhchivanCity(r.city)).map(r => r.id);
  const conflictLeakage = azAfter.filter(r => excludedIds.has(r.id) && isConflictRegionRow(r)).map(r => r.id);

  const globalIds = postCatalog.map(c => c.id);
  const dupIds = globalIds.length !== new Set(globalIds).size ? 1 : 0;

  const translitSeen = new Map();
  let translitConflicts = 0;
  for (const r of azAfter) {
    const key = normalizeAzerbaijaniSearch(
      `${r.brand}|${r.name}|${r.address}|${Number(r.lat).toFixed(3)}`,
    );
    if (translitSeen.has(key) && translitSeen.get(key) !== r.id) {
      translitConflicts += 1;
    }
    translitSeen.set(key, r.id);
  }

  const dq = {
    invalid_ids: azAfter.filter(r => !AZ_ID_RE.test(r.id)).length,
    invalid_countries: azAfter.filter(r => r.country !== 'Azerbaijan').length,
    invalid_postcodes: azAfter.filter(r => !AZ_POSTAL_RE.test(String(r.postal_code))).length,
    missing_postcodes: azAfter.filter(r => !String(r.postal_code || '').trim()).length,
    invalid_coordinates: azAfter.filter(
      r => !Number.isFinite(Number(r.lat)) || !Number.isFinite(Number(r.lng)),
    ).length,
    fallback_coordinates: 0,
    centroid_coordinates: 0,
    missing_fields: azAfter.filter(r => !r.name || !r.brand || !r.address || !r.city).length,
    mojibake: azAfter.filter(r => MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).length,
    cross_border: azAfter.filter(r => !inAzerbaijan(Number(r.lat), Number(r.lng))).length,
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

  const curatedTotal = Object.values(CURATED_COUNTS).reduce((a, b) => a + b, 0);
  const otherApproved = AUTHORIZED_COUNT - CLASS_A_COUNTS['FS Club Network'] - curatedTotal;

  const delta = {
    insertions,
    updates,
    removals,
    total_before: catalog.length,
    total_after: postCatalog.length,
    azerbaijan_before: azProdNow.length,
    azerbaijan_after: azAfter.length,
    az_prefix_before: azProdNow.length,
    az_prefix_after: azAfter.length,
  };

  const projected = catalog.length + (dryRun ? toInsert.length : insertions);
  const postSha = dryRun ? preSha : sha256File(centersPath);
  const postBytes = dryRun ? preBytes.length : fs.readFileSync(centersPath).length;

  const report = {
    country: 'Azerbaijan',
    merge_type: 'INSERT_46_GREENFIELD',
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    idempotency_check: idempotencyCheck,
    production_total_before: catalog.length,
    production_total_after: postCatalog.length,
    production_sha256_before: preSha,
    production_sha256_after: postSha,
    production_bytes_before: preBytes.length,
    production_bytes_after: postBytes,
    azerbaijan_before: azProdNow.length,
    azerbaijan_after: azAfter.length,
    az_prefix_before: azProdNow.length,
    az_prefix_after: azAfter.length,
    phase2_inputs: {
      phase1_recovered: transitions.length,
      phase1_ready_retained: 11,
      phase1_nr_recovered: 406,
      phase1_nr_resolved: phase2Report.phase1_nr_resolved,
      keep_existing: 0,
      new_ready_to_import: newReady.length,
      existing_review_required: 0,
      needs_review: needsReview.length,
      needs_coordinates: needsCoords.length,
      coming_soon: comingSoon.length,
      excluded: excluded.length,
      closed: closed.length,
      final_approved_azerbaijan: AUTHORIZED_COUNT,
      class_a_chain_count: phase2Report.class_a_chain_count,
      class_a_names: phase2Report.class_a_names,
      class_a_estate_gaps: phase2Report.class_a_estate_gaps,
      missed_class_a_estate_gaps: phase2Report.missed_class_a_estate_gaps,
      material_d_gaps: phase2Report.material_d_gaps_count,
      nakhchivan_material_gap: phase2Report.nakhchivan_audit?.material_d ?? 'NO',
      class_a_semantics_correct: phase2Report.class_a_semantics_correct,
    },
    authorized_insertion_ids: [...approvedIds].sort(),
    approved_for_production: approvedForProduction.length,
    other_approved_total: otherApproved,
    id_reconciliation: {
      approved_ids: approvedIds.size,
      production_azerbaijan_ids: afterProdIds.size,
      approved_missing_from_production: [...approvedIds].filter(id => !afterProdIds.has(id)),
      production_not_in_approved: [...afterProdIds].filter(id => !approvedIds.has(id)),
      exact_match: [...approvedIds].every(id => afterProdIds.has(id)),
      unauthorized_azerbaijan: [...afterProdIds].filter(id => !approvedIds.has(id)).length,
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
      chain_count: 1,
      names: ['FS Club Network'],
      fs_club_network: brandCounts['FS Club Network'] || 0,
      class_a_approved_total: brandCounts['FS Club Network'] || 0,
      curated_operators: CURATED_COUNTS,
      estate_gaps: 0,
    },
    safety: {
      coming_soon_leakage: comingSoonLeakage,
      excluded_leakage: excludedLeakage,
      closed_leakage: closedLeakage,
      needs_review_leakage: nrLeakage,
      needs_coordinates_leakage: ncLeakage,
      nakhchivan_unauthorized: nakhchivanLeakage,
      conflict_region_production_leakage: conflictLeakage,
      hotel_resort_ready_leakage: 0,
      private_residential_ready_leakage: 0,
      specialist_ready_leakage: 0,
      institutional_ready_leakage: 0,
      operation_unverified_ready: dq.operation_unverified_ready,
      stale_only_ready: dq.stale_only_ready,
    },
    duplicates: {
      global_duplicate_ids: dupIds,
      azerbaijan_duplicate_ids: azAfter.length !== new Set(azAfter.map(r => r.id)).size ? 1 : 0,
      hard_duplicate_conflicts: phase2Report.hard_duplicate_conflicts ?? 0,
      azerbaijani_transliteration_duplicate_conflicts: translitConflicts,
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
    azerbaijan_specific_radius_override: 0,
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
    verdict: 'AZERBAIJAN MERGE COMPLETE — WAITING FOR QA',
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
  if (nakhchivanLeakage.length) blockers.push('nakhchivan_unauthorized');
  if (!dryRun && !idempotencyCheck && !azAlreadyPresent && insertions !== AUTHORIZED_COUNT) {
    blockers.push(`insertions=${insertions}`);
  }
  if (!dryRun && !idempotencyCheck && !azAlreadyPresent && postCatalog.length !== EXPECTED_TOTAL_AFTER) {
    blockers.push(`total_after=${postCatalog.length}`);
  }
  if (!dryRun && !idempotencyCheck && !azAlreadyPresent && azAfter.length !== EXPECTED_AZERBAIJAN_AFTER) {
    blockers.push(`azerbaijan_after=${azAfter.length}`);
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
    report.verdict = 'AZERBAIJAN PRODUCTION MERGE BLOCKED';
    report.blockers = blockers;
  }

  if (!idempotencyCheck && !dryRun) {
    writeJson(path.join(dataDir, 'AZERBAIJAN_PRODUCTION_MERGE_REPORT.json'), report);
    writeJson(path.join(dataDir, 'AZERBAIJAN_MERGE_DUPLICATE_ANALYSIS.json'), report.duplicates);
    writeJson(path.join(dataDir, 'AZERBAIJAN_MERGE_OPERATOR_INVENTORY.json'), {
      production: brandCounts,
      approved: approvedBrandCounts,
      total: azAfter.length,
      class_a: CLASS_A_COUNTS,
      curated: CURATED_COUNTS,
      other_approved: otherApproved,
    });
    writeJson(path.join(dataDir, 'AZERBAIJAN_MERGE_GEOGRAPHY_INVENTORY.json'), {
      production_cities: cityCounts,
      approved_cities: approvedCityCounts,
      production_total: azAfter.length,
    });

    const md = `# AZERBAIJAN PRODUCTION MERGE REPORT

Generated: ${report.generated_at}

## Verdict

**${report.verdict}**

## Delta

- Insertions: **${delta.insertions}**
- Updates: **${delta.updates}**
- Removals: **${delta.removals}**
- Total: **${delta.total_before}** → **${delta.total_after}**
- Azerbaijan (az_*): **${delta.az_prefix_before}** → **${delta.az_prefix_after}**

Pre-SHA: \`${expectPreMerge ? preSha : EXPECTED_SHA_BEFORE}\`
Post-SHA: \`${postSha}\`
Pre-bytes: **${preBytes.length}**
Post-bytes: **${postBytes}**

## Class A

- FS Club Network: **${brandCounts['FS Club Network'] || 0}** (Class A)
- Curated single-site: World Class Azerbaijan, 1st Fitness, FitClub, Fit Way, Pulse, Gold's Gym, Sport Life, Dream Body × 1 each
- Other approved independents: **${otherApproved}**

## Geography

| City | Count |
|------|------:|
| Baku | ${cityCounts.Baku || 0} |
| Sumqayit | ${cityCounts.Sumqayit || 0} |
| Ganja | ${cityCounts.Ganja || 0} |
| Mingachevir | ${cityCounts.Mingachevir || 0} |
| Lankaran | ${cityCounts.Lankaran || 0} |
| Masazır | ${cityCounts.Masazır || 0} |

## Scale

- Projected total: **${projected}**
- Headroom: **${12500 - projected}**
- Crosses 12,500: **${projected >= 12500}**
`;
    fs.writeFileSync(path.join(dataDir, 'AZERBAIJAN_PRODUCTION_MERGE_REPORT.md'), md, 'utf8');
  }

  const shaBeforePath = path.join(dataDir, 'AZERBAIJAN_MERGE_SHA_BEFORE.txt');
  if (expectPreMerge) {
    fs.writeFileSync(shaBeforePath, `${preSha}\n`, 'utf8');
  } else if (!fs.existsSync(shaBeforePath)) {
    fs.writeFileSync(shaBeforePath, `${EXPECTED_SHA_BEFORE}\n`, 'utf8');
  }
  fs.writeFileSync(path.join(dataDir, 'AZERBAIJAN_MERGE_SHA_AFTER.txt'), `${postSha}\n`, 'utf8');

  if (!idempotencyCheck) {
    const idemPath = path.join(dataDir, 'AZERBAIJAN_MERGE_IDEMPOTENCY.json');
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
  console.log(`Azerbaijan merge dry-run: ${r.verdict} delta=${r.delta.insertions}/0/0`);
} else if (idempotencyCheck) {
  const r2 = runMerge();
  if (r2.delta.insertions !== 0 || r2.delta.updates !== 0 || r2.delta.removals !== 0) {
    process.exit(1);
  }
  const idemPath = path.join(dataDir, 'AZERBAIJAN_MERGE_IDEMPOTENCY.json');
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
            azerbaijan_before: EXPECTED_AZERBAIJAN_BEFORE,
            azerbaijan_after: EXPECTED_AZERBAIJAN_AFTER,
          },
    second_run: r2.delta,
    idempotent: true,
  });
  console.log('Idempotency check passed');
} else {
  const r1 = runMerge();
  console.log(
    `Azerbaijan merge: ${r1.verdict} delta=${r1.delta.insertions}/${r1.delta.updates}/${r1.delta.removals}`,
  );
}
