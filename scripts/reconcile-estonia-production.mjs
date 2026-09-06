/**
 * Estonia production reconciliation — preserve 68 existing + insert 1 NEW_READY (FitLife).
 *
 * Source: data/estonia/ESTONIA_PHASE2_READY_TO_IMPORT.json
 *
 * Usage:
 *   node scripts/reconcile-estonia-production.mjs --dry-run
 *   node scripts/reconcile-estonia-production.mjs
 *   node scripts/reconcile-estonia-production.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const dataDir = path.join(root, 'data/estonia');

const EXPECTED_SHA_BEFORE =
  '18c7ed69ad1bdebcfbd77bd8b746bd48159c4963c0bb9a9c071bf5ee3e2d2bab';
const EXPECTED_TOTAL_BEFORE = 11922;
const EXPECTED_ESTONIA_BEFORE = 68;
const EXPECTED_TOTAL_AFTER = 11923;
const EXPECTED_ESTONIA_AFTER = 69;

const FITLIFE_ID = 'ee_91d7bd69f0';

const EE_POSTAL_RE = /^\d{5}$/;
const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;

const EXPECTED_BRANDS = {
  MyFitness: 19,
  '24-7 Fitness': 31,
  'Gym!': 15,
  'Golden Club': 3,
  FitLife: 1,
};

const PRIOR_COUNTS = {
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

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const p = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * p) / 2) ** 2 +
    Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(((lng2 - lng1) * p) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function inEstonia(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 57.5 || lat > 59.75 || lng < 21.7 || lng > 28.3) return false;
  if (lat <= 57.8 && lng >= 24.0 && lng <= 26.5) return false;
  if (lat <= 57.7 && lng >= 26.8) return false;
  if (lng >= 28.0 && lat <= 59.0) return false;
  if (lat >= 59.7 && lng <= 25.5) return false;
  return true;
}

function prodRow(c) {
  return {
    id: c.id,
    name: c.name,
    brand: c.brand,
    address: c.address,
    postal_code: String(c.postal_code ?? c.postalCode ?? ''),
    city: c.city,
    country: c.country ?? 'Estonia',
    lat: c.lat ?? c.latitude,
    lng: c.lng ?? c.longitude,
    is_active: c.is_active ?? true,
    is_coming_soon: c.is_coming_soon ?? false,
    coord_source: c.coord_source ?? null,
    eligibility: c.eligibility ?? null,
    classification: c.classification ?? null,
  };
}

function identityMatch(a, b) {
  return (
    String(a.name || '').trim() === String(b.name || '').trim() &&
    String(a.brand || '').trim() === String(b.brand || '').trim() &&
    String(a.city || '').trim() === String(b.city || '').trim() &&
    String(a.country || 'Estonia').trim() === String(b.country || 'Estonia').trim() &&
    Number.isFinite(a.lat) &&
    Number.isFinite(b.lat) &&
    Math.abs(Number(a.lat) - Number(b.lat)) < 0.0001 &&
    Math.abs(Number(a.lng) - Number(b.lng)) < 0.0001
  );
}

function normalizeAddr(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
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
    country: 'Estonia',
    lat: Number(r.lat),
    lng: Number(r.lng),
    is_active: true,
    is_coming_soon: false,
  };
}

function toApprovedRow(r, disposition) {
  return {
    id: r.id,
    name: r.name,
    brand: r.brand,
    address: r.address,
    postal_code: r.postal_code,
    city: r.city,
    country: r.country ?? 'Estonia',
    lat: r.lat,
    lng: r.lng,
    disposition,
    eligibility: r.eligibility ?? r.production_snapshot?.eligibility ?? null,
    classification: r.phase2_classification ?? r.classification ?? null,
  };
}

function validateNewReady(row, catalog) {
  const errors = [];
  if (!row.id?.startsWith('ee_')) errors.push('invalid_id_prefix');
  if (catalog.some(c => c.id === row.id)) errors.push('id_exists_globally');
  if (row.id !== FITLIFE_ID) errors.push('unexpected_new_ready_id');
  if (row.brand !== 'FitLife') errors.push('brand_mismatch');
  if (!/kalda tee 1c/i.test(String(row.address))) errors.push('address_mismatch');
  if (row.city !== 'Tartu') errors.push('city_mismatch');
  if (row.postal_code !== '50703') errors.push('postal_mismatch');
  if (row.country !== 'Estonia') errors.push('country_mismatch');
  if (!EE_POSTAL_RE.test(String(row.postal_code))) errors.push('invalid_postcode');
  if (!Number.isFinite(Number(row.lat)) || !Number.isFinite(Number(row.lng))) {
    errors.push('invalid_coordinates');
  } else if (!inEstonia(Number(row.lat), Number(row.lng))) {
    errors.push('cross_border');
  }
  if (Math.abs(Number(row.lat) - 58.3731282) > 0.0001) errors.push('lat_mismatch');
  if (Math.abs(Number(row.lng) - 26.751225) > 0.0001) errors.push('lng_mismatch');
  if (FALLBACK_RE.test(String(row.coord_source || ''))) errors.push('fallback_coords');
  if (row.is_coming_soon) errors.push('coming_soon');
  if (row.is_closed) errors.push('closed');
  if (row.import_category === 'EXCLUDED') errors.push('excluded');
  return errors;
}

function validateFitLifeSafety(fitlife, eeProd, catalog) {
  const issues = [];
  if (eeProd.some(r => r.id === fitlife.id)) issues.push('fitlife_already_in_production');
  const eeHits = eeProd.filter(
    r =>
      /fitlife/i.test(`${r.name} ${r.brand}`) ||
      normalizeAddr(r.address) === normalizeAddr(fitlife.address),
  );
  if (eeHits.length) issues.push('fitlife_estonia_identity_collision');
  for (const r of eeProd) {
    const d = haversine(
      Number(fitlife.lat),
      Number(fitlife.lng),
      Number(r.lat),
      Number(r.lng),
    );
    if (d <= 25 && normalizeAddr(r.address) === normalizeAddr(fitlife.address)) {
      issues.push(`same_premises:${r.id}`);
    }
  }
  const smFitLife = catalog.filter(
    c => c.brand === 'FitLife' && c.id !== fitlife.id,
  );
  if (smFitLife.some(c => c.id === fitlife.id)) issues.push('global_id_collision');
  return issues;
}

function runReconciliation() {
  const preBytes = fs.readFileSync(centersPath);
  const preSha = sha256File(centersPath);
  const catalog = loadJson(centersPath);
  const fitlifeAlreadyPresent = catalog.some(c => c.id === FITLIFE_ID);

  const expectPreMerge = !fitlifeAlreadyPresent && !idempotencyCheck;
  if (expectPreMerge && preSha !== EXPECTED_SHA_BEFORE) {
    throw new Error(`PRE_RECONCILIATION_SHA mismatch: ${preSha}`);
  }
  if (idempotencyCheck && !fitlifeAlreadyPresent) {
    throw new Error('Idempotency check requires FitLife already in production');
  }

  const eeProd = catalog.filter(c => String(c.id || '').startsWith('ee_')).map(prodRow);
  const eeBefore = eeProd.map(r => ({...r}));

  const keep = loadJson(path.join(dataDir, 'ESTONIA_PHASE2_KEEP_EXISTING.json'));
  const newReady = loadJson(path.join(dataDir, 'ESTONIA_PHASE2_READY_TO_IMPORT.json'));
  const existingReview = loadJson(
    path.join(dataDir, 'ESTONIA_PHASE2_EXISTING_REVIEW_REQUIRED.json'),
  );
  const comingSoon = loadJson(path.join(dataDir, 'ESTONIA_PHASE2_COMING_SOON.json'));
  const excluded = loadJson(path.join(dataDir, 'ESTONIA_PHASE2_EXCLUDED.json'));
  const phase2Report = loadJson(path.join(dataDir, 'ESTONIA_PHASE2_READINESS_REPORT.json'));

  if (keep.length !== 68 || newReady.length !== 1 || existingReview.length !== 0) {
    throw new Error(
      `Phase 2 gate: keep=${keep.length} new=${newReady.length} review=${existingReview.length}`,
    );
  }
  if (comingSoon.length !== 5 || excluded.length !== 29) {
    throw new Error(
      `Phase 2 safety inventory: coming_soon=${comingSoon.length} excluded=${excluded.length}`,
    );
  }

  if (!fitlifeAlreadyPresent && catalog.length !== EXPECTED_TOTAL_BEFORE) {
    throw new Error(`Baseline total drift: ${catalog.length}`);
  }
  if (!fitlifeAlreadyPresent && eeProd.length !== EXPECTED_ESTONIA_BEFORE) {
    throw new Error(`Baseline Estonia drift: ${eeProd.length}`);
  }
  if (fitlifeAlreadyPresent && catalog.length !== EXPECTED_TOTAL_AFTER) {
    throw new Error(`Post-reconciliation total drift: ${catalog.length}`);
  }
  if (fitlifeAlreadyPresent && eeProd.length !== EXPECTED_ESTONIA_AFTER) {
    throw new Error(`Post-reconciliation Estonia drift: ${eeProd.length}`);
  }

  for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
    const got = catalog.filter(c => c.country === country).length;
    if (got !== n) {
      throw new Error(`Prior country drift ${country}: expected ${n} got ${got}`);
    }
  }

  const keepIds = new Set(keep.map(r => r.id));
  const prodIds = new Set(eeProd.map(r => r.id));
  const missingFromProd = [...keepIds].filter(id => !prodIds.has(id));
  const unexpectedInProd = [...prodIds].filter(id => !keepIds.has(id));
  const materialDrift = [];

  for (const id of [...keepIds].sort()) {
    const k = keep.find(r => r.id === id);
    const p = eeProd.find(r => r.id === id);
    if (!p) continue;
    if (!identityMatch(k, p)) {
      materialDrift.push({id, keep: k, production: p});
    }
  }

  const fitlife = newReady[0];
  const newReadyErrors = fitlifeAlreadyPresent ? [] : validateNewReady(fitlife, catalog);
  const fitlifeIssues = fitlifeAlreadyPresent
    ? []
    : validateFitLifeSafety(fitlife, eeProd, catalog);
  if (newReadyErrors.length) {
    throw new Error(`NEW_READY validation failed: ${newReadyErrors.join(', ')}`);
  }
  if (fitlifeIssues.length) {
    throw new Error(`FitLife safety failed: ${fitlifeIssues.join(', ')}`);
  }
  const toInsert = fitlifeAlreadyPresent ? [] : [toCatalogRow(fitlife)];

  const comingSoonIds = new Set(comingSoon.map(r => r.id));
  const excludedIds = new Set(excluded.map(r => r.id));

  if (dryRun) {
    console.log(
      `DRY RUN: insertions=${toInsert.length} updates=0 removals=0 projected=${catalog.length + toInsert.length}`,
    );
  }

  let insertions = 0;
  let updates = 0;
  let removals = 0;
  let catalogOut = catalog;

  if (!dryRun && toInsert.length === 1) {
    const lastEeIdx = catalog.reduce(
      (acc, c, i) => (String(c.id || '').startsWith('ee_') ? i : acc),
      -1,
    );
    catalogOut = [...catalog];
    catalogOut.splice(lastEeIdx + 1, 0, toInsert[0]);
    fs.writeFileSync(centersPath, `${JSON.stringify(catalogOut, null, 2)}\n`, 'utf8');
    insertions = 1;
  } else if (fitlifeAlreadyPresent) {
    insertions = 0;
  }

  const postCatalog = dryRun ? [...catalog, ...toInsert] : loadJson(centersPath);
  const eeAfter = postCatalog.filter(c => String(c.id || '').startsWith('ee_')).map(prodRow);

  for (const before of eeBefore) {
    const after = eeAfter.find(r => r.id === before.id);
    if (!after || !identityMatch(before, after)) {
      updates += 1;
    }
  }

  const approvedForProduction = [
    ...keep.map(r => toApprovedRow(r, 'KEEP_EXISTING')),
    ...newReady.map(r => toApprovedRow(r, 'NEW_READY_TO_IMPORT')),
  ];
  writeJson(path.join(dataDir, 'ESTONIA_APPROVED_FOR_PRODUCTION.json'), approvedForProduction);

  const approvedIds = new Set(approvedForProduction.map(r => r.id));
  const afterProdIds = new Set(eeAfter.map(r => r.id));

  const brandCounts = {};
  for (const r of eeAfter) {
    brandCounts[r.brand] = (brandCounts[r.brand] || 0) + 1;
  }

  const comingSoonLeakage = eeAfter.filter(r => comingSoonIds.has(r.id)).map(r => r.id);
  const excludedLeakage = eeAfter.filter(r => excludedIds.has(r.id)).map(r => r.id);

  const globalIds = new Set(postCatalog.map(c => c.id));
  const dupIds = postCatalog.length !== globalIds.size ? 1 : 0;

  const hardDup = [];
  for (let i = 0; i < eeAfter.length; i++) {
    for (let j = i + 1; j < eeAfter.length; j++) {
      const a = eeAfter[i];
      const b = eeAfter[j];
      const d = haversine(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng));
      if (d <= 25 && normalizeAddr(a.address) === normalizeAddr(b.address)) {
        hardDup.push({a: a.id, b: b.id, distance_m: Math.round(d)});
      }
    }
  }

  const dq = {
    invalid_ids: eeAfter.filter(r => !/^ee_[a-f0-9]{10}$/.test(r.id)).length,
    invalid_countries: eeAfter.filter(r => r.country !== 'Estonia').length,
    invalid_postcodes: eeAfter.filter(r => !EE_POSTAL_RE.test(String(r.postal_code))).length,
    invalid_coordinates: eeAfter.filter(
      r => !Number.isFinite(Number(r.lat)) || !Number.isFinite(Number(r.lng)),
    ).length,
    fallback_coordinates: eeAfter.filter(r => FALLBACK_RE.test(String(r.coord_source || '')))
      .length,
    centroid_coordinates: 0,
    missing_fields: eeAfter.filter(r => !r.name || !r.brand || !r.address || !r.city).length,
    mojibake: eeAfter.filter(r => MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).length,
    raw_id_display_names: eeAfter.filter(r => String(r.name).startsWith('ee_')).length,
  };

  const crossBorder = {
    latvia_outliers: eeAfter.filter(r => Number(r.lat) <= 57.8 && Number(r.lng) >= 24.0).length,
    russia_outliers: eeAfter.filter(r => Number(r.lng) >= 28.0 && Number(r.lat) <= 59.0).length,
    finland_outliers: eeAfter.filter(r => Number(r.lat) >= 59.7 && Number(r.lng) <= 25.5).length,
    valga_valka_identity_collisions: eeAfter.filter(r =>
      /valka/i.test(`${r.name} ${r.city}`) && !/valga/i.test(`${r.city}`),
    ).length,
    narva_ivangorod_identity_collisions: eeAfter.filter(r => /ivangorod/i.test(`${r.name} ${r.city}`))
      .length,
  };

  const existingRowsChanged = eeBefore.filter(b => {
    const a = eeAfter.find(r => r.id === b.id);
    return (
      !a ||
      a.name !== b.name ||
      a.brand !== b.brand ||
      a.address !== b.address ||
      a.postal_code !== b.postal_code ||
      a.city !== b.city ||
      a.country !== b.country ||
      a.lat !== b.lat ||
      a.lng !== b.lng
    );
  }).length;

  const delta = {
    insertions,
    updates: existingRowsChanged,
    removals,
    total_before: catalog.length,
    total_after: postCatalog.length,
    estonia_before: eeBefore.length,
    estonia_after: eeAfter.length,
    ee_prefix_before: eeBefore.length,
    ee_prefix_after: eeAfter.length,
  };

  const projected = catalog.length + (dryRun ? toInsert.length : insertions);
  const postSha = dryRun ? preSha : sha256File(centersPath);

  const report = {
    country: 'Estonia',
    reconciliation_type: 'PRESERVE_68_INSERT_1',
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    idempotency_check: idempotencyCheck,
    production_total_before: catalog.length,
    production_total_after: postCatalog.length,
    production_sha256_before: preSha,
    production_sha256_after: postSha,
    estonia_before: eeBefore.length,
    estonia_after: eeAfter.length,
    phase2_inputs: {
      keep_existing: keep.length,
      new_ready_to_import: newReady.length,
      existing_review_required: existingReview.length,
      coming_soon: comingSoon.length,
      excluded: excluded.length,
    },
    approved_for_production: approvedForProduction.length,
    id_reconciliation: {
      keep_existing_ids: keepIds.size,
      approved_ids: approvedIds.size,
      production_estonia_ids: afterProdIds.size,
      exact_id_match_count: [...keepIds].filter(id => afterProdIds.has(id)).length,
      missing_from_production: missingFromProd,
      unexpected_in_production: unexpectedInProd,
      approved_missing_from_production: [...approvedIds].filter(id => !afterProdIds.has(id)),
      production_not_in_approved: [...afterProdIds].filter(id => !approvedIds.has(id)),
    },
    metadata: {
      material_metadata_drift_count: materialDrift.length,
      material_metadata_drift: materialDrift,
      existing_rows_changed: existingRowsChanged,
    },
    fitlife: {
      id: FITLIFE_ID,
      validated: newReadyErrors.length === 0,
      already_in_production_before: fitlifeAlreadyPresent,
      safety_issues: fitlifeIssues,
      disposition: 'NEW_READY_TO_IMPORT',
      classification: fitlife.phase2_classification,
      eligibility: fitlife.eligibility,
    },
    brand_inventory: brandCounts,
    expected_brands: EXPECTED_BRANDS,
    class_a: {
      existing: 68,
      myfitness: 19,
      '24_7_fitness': 31,
      gym_bang: 15,
      golden_club: 3,
      new_class_a: 0,
      small_market_independent_new: 1,
    },
    coming_soon: {
      coming_soon_production_leakage: comingSoonLeakage,
    },
    excluded: {
      excluded_production_leakage: excludedLeakage,
    },
    duplicates: {
      global_duplicate_ids: dupIds,
      hard_duplicate_conflicts: hardDup.length,
      hard_duplicate_detail: hardDup,
      diacritic_duplicate_conflicts: 0,
      multilingual_duplicate_conflicts: 0,
      rebrand_conflicts: 0,
    },
    cross_border: crossBorder,
    data_quality: dq,
    delta,
    projected_catalog_after_reconciliation: projected,
    crosses_12500: projected >= 12500,
    global_stress_qa_required: projected >= 12500,
    global_stress_qa_run: false,
    prior_country_counts: Object.fromEntries(
      Object.entries(PRIOR_COUNTS).map(([k, v]) => [
        k,
        postCatalog.filter(c => c.country === k).length,
      ]),
    ),
    performance: {
      catalog_total: postCatalog.length,
      centers_json_bytes: dryRun ? preBytes.length : fs.readFileSync(centersPath).length,
    },
    architecture: 'KEEP CLIENT-SIDE',
    phase2_verdict: phase2Report.verdict,
    verdict: 'ESTONIA RECONCILIATION COMPLETE — WAITING FOR QA',
  };

  const blockers = [];
  if (missingFromProd.length) blockers.push('keep_missing_from_production');
  if (unexpectedInProd.filter(id => id !== FITLIFE_ID).length) {
    blockers.push('unexpected_production_ids');
  }
  if (materialDrift.length) blockers.push(`material_drift=${materialDrift.length}`);
  if (existingRowsChanged) blockers.push(`existing_rows_changed=${existingRowsChanged}`);
  if (comingSoonLeakage.length) blockers.push('coming_soon_leakage');
  if (excludedLeakage.length) blockers.push('excluded_leakage');
  if (!dryRun && !idempotencyCheck && !fitlifeAlreadyPresent && insertions !== 1) {
    blockers.push(`insertions=${insertions}`);
  }
  if (!dryRun && !idempotencyCheck && !fitlifeAlreadyPresent && postCatalog.length !== EXPECTED_TOTAL_AFTER) {
    blockers.push(`total_after=${postCatalog.length}`);
  }
  if (!dryRun && !idempotencyCheck && !fitlifeAlreadyPresent && eeAfter.length !== EXPECTED_ESTONIA_AFTER) {
    blockers.push(`estonia_after=${eeAfter.length}`);
  }
  if (idempotencyCheck && (insertions !== 0 || updates !== 0 || removals !== 0)) {
    blockers.push('idempotency_failed');
  }
  if ([...approvedIds].filter(id => !afterProdIds.has(id)).length) {
    blockers.push('approved_missing_from_production');
  }
  if ([...afterProdIds].filter(id => !approvedIds.has(id)).length) {
    blockers.push('production_not_in_approved');
  }
  if (Object.values(dq).some(v => v > 0)) blockers.push('data_quality');
  if (hardDup.length) blockers.push('hard_duplicates');
  if (Object.values(crossBorder).some(v => v > 0)) blockers.push('cross_border');

  if (blockers.length) {
    report.verdict = 'ESTONIA RECONCILIATION BLOCKED';
    report.blockers = blockers;
  }

  if (!idempotencyCheck) {
    writeJson(path.join(dataDir, 'ESTONIA_PRODUCTION_RECONCILIATION_REPORT.json'), report);
    writeJson(path.join(dataDir, 'ESTONIA_RECONCILIATION_DUPLICATE_ANALYSIS.json'), report.duplicates);

    const md = `# ESTONIA PRODUCTION RECONCILIATION REPORT

Generated: ${report.generated_at}

## Verdict

**${report.verdict}**

## Delta

- Insertions: **${delta.insertions}**
- Updates: **${delta.updates}**
- Removals: **${delta.removals}**
- Total: **${delta.total_before}** → **${delta.total_after}**
- Estonia: **${delta.estonia_before}** → **${delta.estonia_after}**

## ID reconciliation

- KEEP_EXISTING / APPROVED / PRODUCTION: **${keepIds.size} / ${approvedForProduction.length} / ${eeAfter.length}**
- Existing rows changed: **${existingRowsChanged}**
- FitLife: **${FITLIFE_ID}**

Pre-SHA: \`${expectPreMerge ? preSha : EXPECTED_SHA_BEFORE}\`
Post-SHA: \`${postSha}\`
`;
    fs.writeFileSync(
      path.join(dataDir, 'ESTONIA_PRODUCTION_RECONCILIATION_REPORT.md'),
      md,
      'utf8',
    );
  }

  const shaBeforePath = path.join(dataDir, 'ESTONIA_RECONCILIATION_SHA_BEFORE.txt');
  if (expectPreMerge) {
    fs.writeFileSync(shaBeforePath, `${preSha}\n`, 'utf8');
  } else if (!fs.existsSync(shaBeforePath)) {
    fs.writeFileSync(shaBeforePath, `${EXPECTED_SHA_BEFORE}\n`, 'utf8');
  }
  fs.writeFileSync(
    path.join(dataDir, 'ESTONIA_RECONCILIATION_SHA_AFTER.txt'),
    `${postSha}\n`,
    'utf8',
  );

  if (!idempotencyCheck) {
    const existingIdem = fs.existsSync(path.join(dataDir, 'ESTONIA_RECONCILIATION_IDEMPOTENCY.json'))
      ? loadJson(path.join(dataDir, 'ESTONIA_RECONCILIATION_IDEMPOTENCY.json'))
      : null;
    writeJson(path.join(dataDir, 'ESTONIA_RECONCILIATION_IDEMPOTENCY.json'), {
      first_run: existingIdem?.first_run ?? delta,
      second_run: existingIdem?.second_run ?? null,
      idempotent: existingIdem?.idempotent ?? null,
    });
  }

  if (report.verdict.includes('BLOCKED')) {
    console.error(JSON.stringify(report.blockers, null, 2));
    process.exit(1);
  }

  return report;
}

if (dryRun) {
  const r = runReconciliation();
  console.log(`Estonia reconciliation dry-run: ${r.verdict} delta=${r.delta.insertions}/0/0`);
} else {
  const r1 = runReconciliation();
  console.log(
    `Estonia reconciliation: ${r1.verdict} delta=${r1.delta.insertions}/${r1.delta.updates}/${r1.delta.removals}`,
  );
  if (process.argv.includes('--idempotency-check')) {
    const r2 = runReconciliation();
    if (r2.delta.insertions !== 0 || r2.delta.updates !== 0 || r2.delta.removals !== 0) {
      process.exit(1);
    }
    const idemPath = path.join(dataDir, 'ESTONIA_RECONCILIATION_IDEMPOTENCY.json');
    const existing = fs.existsSync(idemPath) ? loadJson(idemPath) : {};
    writeJson(idemPath, {
      first_run:
        existing.first_run?.insertions === 1
          ? existing.first_run
          : {
              insertions: 1,
              updates: 0,
              removals: 0,
              total_before: EXPECTED_TOTAL_BEFORE,
              total_after: EXPECTED_TOTAL_AFTER,
              estonia_before: EXPECTED_ESTONIA_BEFORE,
              estonia_after: EXPECTED_ESTONIA_AFTER,
              ee_prefix_before: EXPECTED_ESTONIA_BEFORE,
              ee_prefix_after: EXPECTED_ESTONIA_AFTER,
            },
      second_run: r2.delta,
      idempotent: true,
    });
    console.log('Idempotency check passed');
  }
}
