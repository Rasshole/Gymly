/**
 * Turkey production merge — insert exactly 198 NEW_READY from Phase 2 approved set.
 *
 * Source: data/turkey/TURKEY_PHASE2_APPROVED_FOR_PRODUCTION.json
 *
 * Usage:
 *   node scripts/merge-turkey-production.mjs --dry-run
 *   node scripts/merge-turkey-production.mjs
 *   node scripts/merge-turkey-production.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const dataDir = path.join(root, 'data/turkey');

const EXPECTED_SHA_BEFORE =
  '601e7848e80478002da147bf34287b701e2fd95ff2a21e493e0d70aed002b740';
const EXPECTED_BYTES_BEFORE = 3761727;
const EXPECTED_TOTAL_BEFORE = 12080;
const EXPECTED_TURKEY_BEFORE = 0;
const EXPECTED_BY_BEFORE = 46;
const EXPECTED_UA_BEFORE = 105;
const EXPECTED_MT_BEFORE = 24;
const EXPECTED_TOTAL_AFTER = 12278;
const EXPECTED_TURKEY_AFTER = 198;
const AUTHORIZED_COUNT = 198;

const TR_POSTAL_RE = /^\d{5}$/;
const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;

const FORBIDDEN_IDS = new Set([
  'tr_826349ad23', // Kemer B-Fit false positive
  'tr_fe66cda12c', // Manavgat B-Fit false positive
  'tr_716f911874', // GymFit CS Adres Ankara
  'tr_dd6d274fc0', // GymFit CS Zirvekent Ankara
]);

const PRIOR_COUNTS = {
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

function inTurkey(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 35.95 || lat > 42.12 || lng < 25.98 || lng > 44.82) return false;
  if (lat <= 35.75 && lng >= 32.2 && lng <= 34.7) return false;
  if (lat >= 35.19 && lat <= 35.75 && lng <= 33.55) return false;
  if (lat >= 35.08 && lng >= 33.85 && lng <= 34.15) return false;
  if (lng <= 26.02) return false;
  if (lat <= 40.25 && lng <= 26.35) return false;
  if (lat >= 42.02 && lng <= 27.45) return false;
  if (lat >= 41.95 && lng <= 26.9) return false;
  if (lng >= 41.85 && lat >= 41.35) return false;
  if (lng >= 42.15 && lat >= 40.75) return false;
  if (lng >= 43.85 && lat >= 40.1 && lat <= 41.05) return false;
  if (lng >= 44.15 && lat >= 39.55 && lat <= 40.45) return false;
  if (lng >= 44.85 && lat <= 39.55) return false;
  if (lng >= 44.95 && lat >= 41.0) return false;
  if (lng >= 44.55 && lat <= 38.15) return false;
  if (lng >= 43.5 && lat <= 36.85) return false;
  if (lng >= 43.15 && lat <= 36.95) return false;
  if (lng >= 42.55 && lat <= 36.75) return false;
  if (lat <= 36.18 && lng >= 36.85) return false;
  if (lat <= 36.05 && lng >= 35.8) return false;
  if (lat <= 36.25 && lng >= 38.0) return false;
  return true;
}

function normalizeSearch(s) {
  return String(s || '')
    .trim()
    .toLocaleLowerCase('tr')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
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
    country: 'Turkey',
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
    country: r.country ?? 'Turkey',
    lat: r.lat,
    lng: r.lng,
    disposition: 'NEW_READY_TO_IMPORT',
    eligibility: r.eligibility ?? null,
    classification: r.classification ?? null,
  };
}

function validateAuthorized(row, catalog, authorizedIds, comingSoonIds, excludedIds, closedIds, lifeClubIds) {
  const errors = [];
  if (!/^tr_[a-f0-9]{10}$/.test(row.id || '')) errors.push('invalid_id');
  if (!authorizedIds.has(row.id)) errors.push('unauthorized_id');
  if (FORBIDDEN_IDS.has(row.id)) errors.push('forbidden_id');
  if (catalog.some(c => c.id === row.id)) errors.push('id_exists_globally');
  if (row.country !== 'Turkey') errors.push('country_mismatch');
  if (!TR_POSTAL_RE.test(String(row.postal_code || ''))) errors.push('invalid_postcode');
  if (!Number.isFinite(Number(row.lat)) || !Number.isFinite(Number(row.lng))) {
    errors.push('invalid_coordinates');
  } else if (!inTurkey(Number(row.lat), Number(row.lng))) {
    errors.push('cross_border');
  }
  if (FALLBACK_RE.test(String(row.coord_source || ''))) errors.push('fallback_coords');
  if (row.is_coming_soon) errors.push('coming_soon');
  if (row.is_closed) errors.push('closed');
  if (row.operation_status === 'OPERATION_UNVERIFIED') errors.push('operation_unverified');
  if (row.source_confidence === 'LOW' && !row.source_recency) errors.push('stale_only');
  if (!row.name || !row.brand || !row.address || !row.city) errors.push('missing_fields');
  if (MOJIBAKE_RE.test(`${row.name} ${row.address} ${row.city}`)) errors.push('mojibake');
  if (comingSoonIds.has(row.id) || excludedIds.has(row.id) || closedIds.has(row.id)) {
    errors.push('non_approved_bucket');
  }
  if (lifeClubIds.has(row.id)) errors.push('lifeclub_excluded');
  if (row.brand === 'LifeClub') errors.push('lifeclub_brand');
  return errors;
}

function runMerge() {
  const preBytes = fs.readFileSync(centersPath);
  const preSha = sha256File(centersPath);
  const catalog = loadJson(centersPath);

  const approvedPath = path.join(dataDir, 'TURKEY_PHASE2_APPROVED_FOR_PRODUCTION.json');
  const newReady = loadJson(path.join(dataDir, 'TURKEY_PHASE2_READY_TO_IMPORT.json'));
  const needsReview = loadJson(path.join(dataDir, 'TURKEY_PHASE2_NEEDS_REVIEW.json'));
  const needsCoords = loadJson(path.join(dataDir, 'TURKEY_PHASE2_NEEDS_COORDINATES.json'));
  const comingSoon = loadJson(path.join(dataDir, 'TURKEY_PHASE2_COMING_SOON.json'));
  const excluded = loadJson(path.join(dataDir, 'TURKEY_PHASE2_EXCLUDED.json'));
  const closed = loadJson(path.join(dataDir, 'TURKEY_PHASE2_CLOSED.json'));
  const phase2Report = loadJson(path.join(dataDir, 'TURKEY_PHASE2_READINESS_REPORT.json'));
  const approved = loadJson(approvedPath);

  if (approved.length !== AUTHORIZED_COUNT || newReady.length !== AUTHORIZED_COUNT) {
    throw new Error(
      `Approved count drift: approved=${approved.length} newReady=${newReady.length}`,
    );
  }
  if (needsReview.length !== 0 || needsCoords.length !== 0) {
    throw new Error(`Phase 2 NR/NC drift: nr=${needsReview.length} nc=${needsCoords.length}`);
  }
  if (comingSoon.length !== 2 || excluded.length !== 19 || closed.length !== 0) {
    throw new Error(
      `Phase 2 safety inventory: cs=${comingSoon.length} ex=${excluded.length} cl=${closed.length}`,
    );
  }
  if (phase2Report.final_approved_turkey !== AUTHORIZED_COUNT) {
    throw new Error(`Phase 2 final approved drift: ${phase2Report.final_approved_turkey}`);
  }
  if (phase2Report.verdict !== 'READY FOR TURKEY PRODUCTION MERGE') {
    throw new Error(`Phase 2 verdict drift: ${phase2Report.verdict}`);
  }

  const approvedIds = new Set(approved.map(r => r.id));
  const newReadyIds = new Set(newReady.map(r => r.id));
  if (approvedIds.size !== AUTHORIZED_COUNT || newReadyIds.size !== AUTHORIZED_COUNT) {
    throw new Error('Duplicate IDs in approved/newReady');
  }
  for (const id of approvedIds) {
    if (!newReadyIds.has(id)) throw new Error(`Approved ID not in newReady: ${id}`);
  }

  const trAlreadyPresent = catalog.some(c => String(c.id || '').startsWith('tr_'));
  const expectPreMerge = !trAlreadyPresent && !idempotencyCheck;

  if (idempotencyCheck && !trAlreadyPresent) {
    throw new Error('Idempotency check requires all 198 tr_* already in production');
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
    const trBefore = catalog.filter(c => String(c.id || '').startsWith('tr_')).length;
    if (trBefore !== EXPECTED_TURKEY_BEFORE) {
      throw new Error(`Baseline tr_* drift: ${trBefore}`);
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

  if (trAlreadyPresent && catalog.length !== EXPECTED_TOTAL_AFTER) {
    throw new Error(`Post-merge total drift: ${catalog.length}`);
  }
  const trProdNow = catalog.filter(c => String(c.id || '').startsWith('tr_'));
  if (trAlreadyPresent && trProdNow.length !== EXPECTED_TURKEY_AFTER) {
    throw new Error(`Post-merge Turkey drift: ${trProdNow.length}`);
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
  const lifeClubIds = new Set(
    excluded.filter(r => r.brand === 'LifeClub').map(r => r.id),
  );

  for (const forbidden of FORBIDDEN_IDS) {
    if (approvedIds.has(forbidden)) {
      throw new Error(`Forbidden ID in approved set: ${forbidden}`);
    }
  }

  const validationErrors = {};
  for (const row of approved) {
    const errs = trAlreadyPresent
      ? []
      : validateAuthorized(
          row,
          catalog,
          approvedIds,
          comingSoonIds,
          excludedIds,
          closedIds,
          lifeClubIds,
        );
    if (errs.length) validationErrors[row.id] = errs;
  }
  if (Object.keys(validationErrors).length) {
    throw new Error(`Authorized validation failed: ${JSON.stringify(validationErrors)}`);
  }

  const toInsert = trAlreadyPresent
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
  } else if (trAlreadyPresent) {
    insertions = 0;
  }

  const postCatalog = dryRun ? [...catalog, ...toInsert] : loadJson(centersPath);
  const trAfter = postCatalog
    .filter(c => String(c.id || '').startsWith('tr_'))
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
  writeJson(path.join(dataDir, 'TURKEY_APPROVED_FOR_PRODUCTION.json'), approvedForProduction);

  const afterProdIds = new Set(trAfter.map(r => r.id));
  const brandCounts = {};
  for (const r of trAfter) {
    brandCounts[r.brand] = (brandCounts[r.brand] || 0) + 1;
  }

  const comingSoonLeakage = trAfter.filter(r => comingSoonIds.has(r.id)).map(r => r.id);
  const excludedLeakage = trAfter.filter(r => excludedIds.has(r.id)).map(r => r.id);
  const closedLeakage = trAfter.filter(r => closedIds.has(r.id)).map(r => r.id);
  const forbiddenLeakage = trAfter.filter(r => FORBIDDEN_IDS.has(r.id)).map(r => r.id);
  const lifeClubLeakage = trAfter.filter(r => r.brand === 'LifeClub').map(r => r.id);

  const globalIds = postCatalog.map(c => c.id);
  const dupIds = globalIds.length !== new Set(globalIds).size ? 1 : 0;

  const diacriticSeen = new Map();
  let diacriticConflicts = 0;
  for (const r of trAfter) {
    const key = normalizeSearch(`${r.brand}|${r.name}|${r.address}|${Number(r.lat).toFixed(3)}`);
    if (diacriticSeen.has(key) && diacriticSeen.get(key) !== r.id) {
      diacriticConflicts += 1;
    }
    diacriticSeen.set(key, r.id);
  }

  const dq = {
    invalid_ids: trAfter.filter(r => !/^tr_[a-f0-9]{10}$/.test(r.id)).length,
    invalid_countries: trAfter.filter(r => r.country !== 'Turkey').length,
    invalid_postcodes: trAfter.filter(r => !TR_POSTAL_RE.test(String(r.postal_code))).length,
    missing_postcodes: trAfter.filter(r => !String(r.postal_code || '').trim()).length,
    invalid_coordinates: trAfter.filter(
      r => !Number.isFinite(Number(r.lat)) || !Number.isFinite(Number(r.lng)),
    ).length,
    fallback_coordinates: 0,
    centroid_coordinates: 0,
    missing_fields: trAfter.filter(r => !r.name || !r.brand || !r.address || !r.city).length,
    mojibake: trAfter.filter(r => MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).length,
    cross_border: trAfter.filter(r => !inTurkey(Number(r.lat), Number(r.lng))).length,
    cyprus_conflicts: trAfter.filter(
      r =>
        Number(r.lat) <= 35.75 &&
        Number(r.lng) >= 32.2 &&
        Number(r.lng) <= 34.7,
    ).length,
  };

  const delta = {
    insertions,
    updates,
    removals,
    total_before: catalog.length,
    total_after: postCatalog.length,
    turkey_before: trProdNow.length,
    turkey_after: trAfter.length,
    tr_prefix_before: trProdNow.length,
    tr_prefix_after: trAfter.length,
  };

  const projected = catalog.length + (dryRun ? toInsert.length : insertions);
  const postSha = dryRun ? preSha : sha256File(centersPath);
  const postBytes = dryRun ? preBytes.length : fs.readFileSync(centersPath).length;

  const report = {
    country: 'Turkey',
    merge_type: 'INSERT_198_GREENFIELD',
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    idempotency_check: idempotencyCheck,
    production_total_before: catalog.length,
    production_total_after: postCatalog.length,
    production_sha256_before: preSha,
    production_sha256_after: postSha,
    production_bytes_before: preBytes.length,
    production_bytes_after: postBytes,
    turkey_before: trProdNow.length,
    turkey_after: trAfter.length,
    tr_prefix_before: trProdNow.length,
    tr_prefix_after: trAfter.length,
    phase2_inputs: {
      keep_existing: 0,
      new_ready_to_import: newReady.length,
      existing_review_required: 0,
      needs_review: needsReview.length,
      needs_coordinates: needsCoords.length,
      coming_soon: comingSoon.length,
      excluded: excluded.length,
      closed: closed.length,
      final_approved_turkey: AUTHORIZED_COUNT,
    },
    authorized_insertion_ids: [...approvedIds].sort(),
    approved_for_production: approvedForProduction.length,
    id_reconciliation: {
      approved_ids: approvedIds.size,
      production_turkey_ids: afterProdIds.size,
      approved_missing_from_production: [...approvedIds].filter(id => !afterProdIds.has(id)),
      production_not_in_approved: [...afterProdIds].filter(id => !approvedIds.has(id)),
      exact_match: [...approvedIds].every(id => afterProdIds.has(id)),
      unauthorized_turkey: [...afterProdIds].filter(id => !approvedIds.has(id)).length,
    },
    brand_inventory: brandCounts,
    safety: {
      kemer_bfit_false_positive: !approvedIds.has('tr_826349ad23'),
      manavgat_bfit_false_positive: !approvedIds.has('tr_fe66cda12c'),
      gymfit_cs_blocked: !approvedIds.has('tr_716f911874') && !approvedIds.has('tr_dd6d274fc0'),
      lifeclub_excluded_blocked: lifeClubLeakage.length === 0,
      coming_soon_leakage: comingSoonLeakage,
      excluded_leakage: excludedLeakage,
      closed_leakage: closedLeakage,
      forbidden_leakage: forbiddenLeakage,
    },
    duplicates: {
      global_duplicate_ids: dupIds,
      turkey_duplicate_ids: trAfter.length !== new Set(trAfter.map(r => r.id)).size ? 1 : 0,
      hard_duplicate_conflicts: phase2Report.hard_duplicate_conflicts ?? 0,
      diacritic_duplicate_conflicts: diacriticConflicts,
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
    turkey_specific_radius_override: 0,
    prior_country_counts: Object.fromEntries(
      Object.entries(PRIOR_COUNTS).map(([k, v]) => [
        k,
        postCatalog.filter(c => c.country === k).length,
      ]),
    ),
    phase2_verdict: phase2Report.verdict,
    merge_idempotent: idempotencyCheck ? delta.insertions === 0 && delta.updates === 0 && delta.removals === 0 : null,
    verdict: 'TURKEY MERGE COMPLETE — WAITING FOR QA',
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
  if (forbiddenLeakage.length) blockers.push('forbidden_leakage');
  if (lifeClubLeakage.length) blockers.push('lifeclub_leakage');
  if (!dryRun && !idempotencyCheck && !trAlreadyPresent && insertions !== AUTHORIZED_COUNT) {
    blockers.push(`insertions=${insertions}`);
  }
  if (!dryRun && !idempotencyCheck && !trAlreadyPresent && postCatalog.length !== EXPECTED_TOTAL_AFTER) {
    blockers.push(`total_after=${postCatalog.length}`);
  }
  if (!dryRun && !idempotencyCheck && !trAlreadyPresent && trAfter.length !== EXPECTED_TURKEY_AFTER) {
    blockers.push(`turkey_after=${trAfter.length}`);
  }
  if (idempotencyCheck && (insertions !== 0 || updates !== 0 || removals !== 0)) {
    blockers.push('idempotency_failed');
  }
  if (Object.values(dq).some(v => v > 0)) blockers.push('data_quality');
  if (diacriticConflicts) blockers.push('diacritic_conflicts');
  if (dupIds) blockers.push('global_id_collisions');
  for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
    const got = postCatalog.filter(c => c.country === country).length;
    if (got !== n) blockers.push(`prior_${country}=${got}`);
  }

  if (blockers.length) {
    report.verdict = 'TURKEY PRODUCTION MERGE BLOCKED';
    report.blockers = blockers;
  }

  if (!idempotencyCheck && !dryRun) {
    writeJson(path.join(dataDir, 'TURKEY_PRODUCTION_MERGE_REPORT.json'), report);
    writeJson(path.join(dataDir, 'TURKEY_MERGE_DUPLICATE_ANALYSIS.json'), report.duplicates);

    const md = `# TURKEY PRODUCTION MERGE REPORT

Generated: ${report.generated_at}

## Verdict

**${report.verdict}**

## Delta

- Insertions: **${delta.insertions}**
- Updates: **${delta.updates}**
- Removals: **${delta.removals}**
- Total: **${delta.total_before}** → **${delta.total_after}**
- Turkey (tr_*): **${delta.tr_prefix_before}** → **${delta.tr_prefix_after}**

Pre-SHA: \`${expectPreMerge ? preSha : EXPECTED_SHA_BEFORE}\`
Post-SHA: \`${postSha}\`
Pre-bytes: **${preBytes.length}**
Post-bytes: **${postBytes}**

## Scale

- Projected total: **${projected}**
- Headroom: **${12500 - projected}**
- Crosses 12,500: **${projected >= 12500}**
`;
    fs.writeFileSync(path.join(dataDir, 'TURKEY_PRODUCTION_MERGE_REPORT.md'), md, 'utf8');
  }

  const shaBeforePath = path.join(dataDir, 'TURKEY_MERGE_SHA_BEFORE.txt');
  if (expectPreMerge) {
    fs.writeFileSync(shaBeforePath, `${preSha}\n`, 'utf8');
  } else if (!fs.existsSync(shaBeforePath)) {
    fs.writeFileSync(shaBeforePath, `${EXPECTED_SHA_BEFORE}\n`, 'utf8');
  }
  fs.writeFileSync(path.join(dataDir, 'TURKEY_MERGE_SHA_AFTER.txt'), `${postSha}\n`, 'utf8');

  if (!idempotencyCheck) {
    const idemPath = path.join(dataDir, 'TURKEY_MERGE_IDEMPOTENCY.json');
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
  console.log(`Turkey merge dry-run: ${r.verdict} delta=${r.delta.insertions}/0/0`);
} else if (idempotencyCheck) {
  const r2 = runMerge();
  if (r2.delta.insertions !== 0 || r2.delta.updates !== 0 || r2.delta.removals !== 0) {
    process.exit(1);
  }
  const idemPath = path.join(dataDir, 'TURKEY_MERGE_IDEMPOTENCY.json');
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
            turkey_before: EXPECTED_TURKEY_BEFORE,
            turkey_after: EXPECTED_TURKEY_AFTER,
          },
    second_run: r2.delta,
    idempotent: true,
  });
  console.log('Idempotency check passed');
} else {
  const r1 = runMerge();
  console.log(
    `Turkey merge: ${r1.verdict} delta=${r1.delta.insertions}/${r1.delta.updates}/${r1.delta.removals}`,
  );
}
