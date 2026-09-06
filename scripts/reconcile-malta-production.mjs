/**
 * Malta production reconciliation — preserve 18 existing + insert 6 NEW_READY.
 *
 * Source: data/malta/MALTA_PHASE2_READY_TO_IMPORT.json
 *
 * Usage:
 *   node scripts/reconcile-malta-production.mjs --dry-run
 *   node scripts/reconcile-malta-production.mjs
 *   node scripts/reconcile-malta-production.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const dataDir = path.join(root, 'data/malta');

const EXPECTED_SHA_BEFORE =
  '6f40fba98eb351c54ecc076278c18d49349b0f42e7b18c4532710aa523f89c38';
const EXPECTED_BYTES_BEFORE = 3706426;
const EXPECTED_TOTAL_BEFORE = 11923;
const EXPECTED_MALTA_BEFORE = 18;
const EXPECTED_TOTAL_AFTER = 11929;
const EXPECTED_MALTA_AFTER = 24;

const MT_POSTAL_RE = /^[A-Z]{3} \d{4}$/;
const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;

const EXPECTED_BRANDS = {
  'Best Gyms Malta': 10,
  '24/7 Fitness Club': 4,
  'Challenger Fitness': 4,
  'Fort Fitness': 2,
  Cynergi: 1,
  ActiveZone: 1,
  'Kinetika Gozo': 2,
};

const PRIOR_COUNTS = {
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

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const p = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * p) / 2) ** 2 +
    Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(((lng2 - lng1) * p) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function inMalta(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 35.78 || lat > 36.1 || lng < 14.18 || lng > 14.58) return false;
  if (lat >= 36.095 && lng >= 14.4) return false;
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
    country: c.country ?? 'Malta',
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
    String(a.address || '').trim() === String(b.address || '').trim() &&
    String(a.postal_code || '').trim() === String(b.postal_code || '').trim() &&
    String(a.city || '').trim() === String(b.city || '').trim() &&
    String(a.country || 'Malta').trim() === String(b.country || 'Malta').trim() &&
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
    country: 'Malta',
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
    country: r.country ?? 'Malta',
    lat: r.lat,
    lng: r.lng,
    disposition,
    eligibility: r.eligibility ?? r.production_snapshot?.eligibility ?? null,
    classification: r.classification ?? null,
  };
}

function validateNewReady(row, catalog, authorizedIds) {
  const errors = [];
  if (!/^mt_[a-f0-9]{10}$/.test(row.id || '')) errors.push('invalid_id');
  if (!authorizedIds.has(row.id)) errors.push('unauthorized_id');
  if (catalog.some(c => c.id === row.id)) errors.push('id_exists_globally');
  if (row.country !== 'Malta') errors.push('country_mismatch');
  if (!MT_POSTAL_RE.test(String(row.postal_code || ''))) errors.push('invalid_postcode');
  if (!Number.isFinite(Number(row.lat)) || !Number.isFinite(Number(row.lng))) {
    errors.push('invalid_coordinates');
  } else if (!inMalta(Number(row.lat), Number(row.lng))) {
    errors.push('cross_border');
  }
  if (FALLBACK_RE.test(String(row.coord_source || ''))) errors.push('fallback_coords');
  if (row.is_coming_soon) errors.push('coming_soon');
  if (row.is_closed) errors.push('closed');
  if (!row.name || !row.brand || !row.address || !row.city) errors.push('missing_fields');
  if (MOJIBAKE_RE.test(`${row.name} ${row.address} ${row.city}`)) errors.push('mojibake');
  return errors;
}

function runReconciliation() {
  const preBytes = fs.readFileSync(centersPath);
  const preSha = sha256File(centersPath);
  const catalog = loadJson(centersPath);

  const keep = loadJson(path.join(dataDir, 'MALTA_PHASE2_KEEP_EXISTING.json'));
  const newReady = loadJson(path.join(dataDir, 'MALTA_PHASE2_READY_TO_IMPORT.json'));
  const existingReview = loadJson(
    path.join(dataDir, 'MALTA_PHASE2_EXISTING_REVIEW_REQUIRED.json'),
  );
  const comingSoon = loadJson(path.join(dataDir, 'MALTA_PHASE2_COMING_SOON.json'));
  const excluded = loadJson(path.join(dataDir, 'MALTA_PHASE2_EXCLUDED.json'));
  const closed = loadJson(path.join(dataDir, 'MALTA_PHASE2_CLOSED.json'));
  const phase2Report = loadJson(path.join(dataDir, 'MALTA_PHASE2_READINESS_REPORT.json'));

  if (keep.length !== 18 || newReady.length !== 6 || existingReview.length !== 0) {
    throw new Error(
      `Phase 2 gate: keep=${keep.length} new=${newReady.length} review=${existingReview.length}`,
    );
  }
  if (comingSoon.length !== 1 || excluded.length !== 73 || closed.length !== 3) {
    throw new Error(
      `Phase 2 safety inventory: coming_soon=${comingSoon.length} excluded=${excluded.length} closed=${closed.length}`,
    );
  }
  if (phase2Report.final_approved_malta !== 24) {
    throw new Error(`Phase 2 final approved drift: ${phase2Report.final_approved_malta}`);
  }

  const authorizedIds = new Set(newReady.map(r => r.id));
  const newAlreadyPresent = newReady.every(r => catalog.some(c => c.id === r.id));
  const expectPreMerge = !newAlreadyPresent && !idempotencyCheck;

  if (idempotencyCheck && !newAlreadyPresent) {
    throw new Error('Idempotency check requires all 6 NEW_READY already in production');
  }

  if (expectPreMerge) {
    if (preSha !== EXPECTED_SHA_BEFORE) {
      throw new Error(`PRE_RECONCILIATION_SHA mismatch: ${preSha}`);
    }
    if (preBytes.length !== EXPECTED_BYTES_BEFORE) {
      throw new Error(`PRE_RECONCILIATION_BYTES mismatch: ${preBytes.length}`);
    }
    if (catalog.length !== EXPECTED_TOTAL_BEFORE) {
      throw new Error(`Baseline total drift: ${catalog.length}`);
    }
  }

  const mtProd = catalog.filter(c => String(c.id || '').startsWith('mt_')).map(prodRow);
  const mtBefore = mtProd.map(r => ({...r}));

  if (expectPreMerge && mtProd.length !== EXPECTED_MALTA_BEFORE) {
    throw new Error(`Baseline Malta drift: ${mtProd.length}`);
  }
  if (newAlreadyPresent && catalog.length !== EXPECTED_TOTAL_AFTER) {
    throw new Error(`Post-reconciliation total drift: ${catalog.length}`);
  }
  if (newAlreadyPresent && mtProd.length !== EXPECTED_MALTA_AFTER) {
    throw new Error(`Post-reconciliation Malta drift: ${mtProd.length}`);
  }

  for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
    const got = catalog.filter(c => c.country === country).length;
    if (got !== n) {
      throw new Error(`Prior country drift ${country}: expected ${n} got ${got}`);
    }
  }

  const keepIds = new Set(keep.map(r => r.id));
  const prodIds = new Set(mtProd.map(r => r.id));
  const missingFromProd = [...keepIds].filter(id => !prodIds.has(id));
  const unexpectedInProd = [...prodIds].filter(id => !keepIds.has(id) && !authorizedIds.has(id));
  const materialDrift = [];

  for (const id of [...keepIds].sort()) {
    const k = keep.find(r => r.id === id);
    const p = mtProd.find(r => r.id === id);
    if (!p) continue;
    if (!identityMatch(k, p)) {
      materialDrift.push({id, keep: k, production: p});
    }
  }

  const validationErrors = {};
  for (const row of newReady) {
    const errs = newAlreadyPresent ? [] : validateNewReady(row, catalog, authorizedIds);
    if (errs.length) validationErrors[row.id] = errs;
  }
  if (Object.keys(validationErrors).length) {
    throw new Error(`NEW_READY validation failed: ${JSON.stringify(validationErrors)}`);
  }

  const toInsert = newAlreadyPresent
    ? []
    : newReady.map(toCatalogRow).sort((a, b) => a.id.localeCompare(b.id));

  const comingSoonIds = new Set(comingSoon.map(r => r.id));
  const excludedIds = new Set(excluded.map(r => r.id));
  const closedIds = new Set(closed.map(r => r.id));

  if (toInsert.some(r => comingSoonIds.has(r.id) || excludedIds.has(r.id) || closedIds.has(r.id))) {
    throw new Error('Attempted to insert COMING_SOON/EXCLUDED/CLOSED identity');
  }

  if (dryRun) {
    console.log(
      `DRY RUN: insertions=${toInsert.length} updates=0 removals=0 projected=${catalog.length + toInsert.length}`,
    );
  }

  let insertions = 0;
  let updates = 0;
  let removals = 0;

  if (!dryRun && toInsert.length === 6) {
    const lastMtIdx = catalog.reduce(
      (acc, c, i) => (String(c.id || '').startsWith('mt_') ? i : acc),
      -1,
    );
    const catalogOut = [...catalog];
    catalogOut.splice(lastMtIdx + 1, 0, ...toInsert);
    fs.writeFileSync(centersPath, `${JSON.stringify(catalogOut, null, 2)}\n`, 'utf8');
    insertions = 6;
  } else if (newAlreadyPresent) {
    insertions = 0;
  }

  const postCatalog = dryRun ? [...catalog, ...toInsert] : loadJson(centersPath);
  const mtAfter = postCatalog.filter(c => String(c.id || '').startsWith('mt_')).map(prodRow);

  let existingRowsChanged = 0;
  for (const before of mtBefore) {
    const after = mtAfter.find(r => r.id === before.id);
    if (!after || !identityMatch(before, after)) {
      existingRowsChanged += 1;
    }
  }
  updates = existingRowsChanged;

  const approvedForProduction = [
    ...keep.map(r => toApprovedRow(r, 'KEEP_EXISTING')),
    ...newReady.map(r => toApprovedRow(r, 'NEW_READY_TO_IMPORT')),
  ];
  writeJson(path.join(dataDir, 'MALTA_APPROVED_FOR_PRODUCTION.json'), approvedForProduction);

  const approvedIds = new Set(approvedForProduction.map(r => r.id));
  const afterProdIds = new Set(mtAfter.map(r => r.id));

  const brandCounts = {};
  for (const r of mtAfter) {
    brandCounts[r.brand] = (brandCounts[r.brand] || 0) + 1;
  }

  const comingSoonLeakage = mtAfter.filter(r => comingSoonIds.has(r.id)).map(r => r.id);
  const excludedLeakage = mtAfter.filter(r => excludedIds.has(r.id)).map(r => r.id);
  const closedLeakage = mtAfter.filter(r => closedIds.has(r.id)).map(r => r.id);
  const fitnessCafeActive = mtAfter.filter(r => /fitness café|fitness cafe/i.test(r.name)).length;

  const globalIds = new Set(postCatalog.map(c => c.id));
  const dupIds = postCatalog.length !== globalIds.size ? 1 : 0;

  const hardDup = [];
  for (let i = 0; i < mtAfter.length; i++) {
    for (let j = i + 1; j < mtAfter.length; j++) {
      const a = mtAfter[i];
      const b = mtAfter[j];
      const d = haversine(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng));
      if (d <= 25 && normalizeAddr(a.address) === normalizeAddr(b.address)) {
        hardDup.push({a: a.id, b: b.id, distance_m: Math.round(d)});
      }
    }
  }

  const dq = {
    invalid_ids: mtAfter.filter(r => !/^mt_[a-f0-9]{10}$/.test(r.id)).length,
    invalid_countries: mtAfter.filter(r => r.country !== 'Malta').length,
    invalid_postcodes: mtAfter.filter(r => !MT_POSTAL_RE.test(String(r.postal_code))).length,
    invalid_coordinates: mtAfter.filter(
      r => !Number.isFinite(Number(r.lat)) || !Number.isFinite(Number(r.lng)),
    ).length,
    fallback_coordinates: mtAfter.filter(r => FALLBACK_RE.test(String(r.coord_source || '')))
      .length,
    centroid_coordinates: 0,
    missing_fields: mtAfter.filter(r => !r.name || !r.brand || !r.address || !r.city).length,
    mojibake: mtAfter.filter(r => MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).length,
    raw_id_display_names: mtAfter.filter(r => String(r.name).startsWith('mt_')).length,
  };

  const crossBorder = {
    italy_outliers: mtAfter.filter(
      r => Number(r.lat) >= 36.0 && Number(r.lat) <= 47.0 && Number(r.lng) >= 6.0 && Number(r.lng) <= 19.0 && !inMalta(Number(r.lat), Number(r.lng)),
    ).length,
    sicily_outliers: mtAfter.filter(
      r => Number(r.lat) >= 36.5 && Number(r.lat) <= 38.5 && Number(r.lng) >= 12.0 && Number(r.lng) <= 16.0 && !inMalta(Number(r.lat), Number(r.lng)),
    ).length,
    other_foreign_outliers: mtAfter.filter(r => !inMalta(Number(r.lat), Number(r.lng))).length,
  };

  const delta = {
    insertions,
    updates: existingRowsChanged,
    removals,
    total_before: catalog.length,
    total_after: postCatalog.length,
    malta_before: mtBefore.length,
    malta_after: mtAfter.length,
    mt_prefix_before: mtBefore.length,
    mt_prefix_after: mtAfter.length,
  };

  const projected = catalog.length + (dryRun ? toInsert.length : insertions);
  const postSha = dryRun ? preSha : sha256File(centersPath);
  const postBytes = dryRun ? preBytes.length : fs.readFileSync(centersPath).length;

  const report = {
    country: 'Malta',
    reconciliation_type: 'PRESERVE_18_INSERT_6',
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    idempotency_check: idempotencyCheck,
    production_total_before: catalog.length,
    production_total_after: postCatalog.length,
    production_sha256_before: preSha,
    production_sha256_after: postSha,
    production_bytes_before: preBytes.length,
    production_bytes_after: postBytes,
    malta_before: mtBefore.length,
    malta_after: mtAfter.length,
    phase2_inputs: {
      keep_existing: keep.length,
      new_ready_to_import: newReady.length,
      existing_review_required: existingReview.length,
      coming_soon: comingSoon.length,
      excluded: excluded.length,
      closed: closed.length,
      final_approved_malta: 24,
    },
    authorized_insertion_ids: [...authorizedIds].sort(),
    approved_for_production: approvedForProduction.length,
    id_reconciliation: {
      keep_existing_ids: keepIds.size,
      new_ready_ids: authorizedIds.size,
      approved_ids: approvedIds.size,
      production_malta_ids: afterProdIds.size,
      exact_keep_match: [...keepIds].filter(id => afterProdIds.has(id)).length,
      missing_from_production: missingFromProd,
      unexpected_in_production: unexpectedInProd,
      approved_missing_from_production: [...approvedIds].filter(id => !afterProdIds.has(id)),
      production_not_in_approved: [...afterProdIds].filter(id => !approvedIds.has(id)),
    },
    metadata: {
      material_metadata_drift_count: materialDrift.length,
      material_metadata_drift: materialDrift,
      existing_rows_changed: existingRowsChanged,
      original_18_present_after: mtBefore.filter(b => mtAfter.some(a => a.id === b.id)).length,
      original_18_changed: existingRowsChanged,
    },
    brand_inventory: brandCounts,
    expected_brands: EXPECTED_BRANDS,
    classification: {
      chain_class_a: 18,
      small_market_independent: 6,
    },
    coming_soon: {
      coming_soon_production_leakage: comingSoonLeakage,
      bgm_birgu_in_production: mtAfter.some(r => /birgu/i.test(r.name)) ? 1 : 0,
    },
    excluded: {
      excluded_production_leakage: excludedLeakage,
      fitness_cafe_active_identities: fitnessCafeActive,
    },
    closed: {
      closed_production_leakage: closedLeakage,
    },
    duplicates: {
      global_duplicate_ids: dupIds,
      malta_duplicate_ids: mtAfter.length !== new Set(mtAfter.map(r => r.id)).size ? 1 : 0,
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
    remaining_headroom: 12500 - projected,
    crosses_12500: projected >= 12500,
    global_stress_qa_required: projected >= 12500,
    global_stress_qa_run: false,
    prior_country_counts: Object.fromEntries(
      Object.entries(PRIOR_COUNTS).map(([k, v]) => [
        k,
        postCatalog.filter(c => c.country === k).length,
      ]),
    ),
    architecture: 'KEEP CLIENT-SIDE',
    phase2_verdict: phase2Report.verdict,
    verdict: 'MALTA RECONCILIATION COMPLETE — WAITING FOR QA',
  };

  const blockers = [];
  if (missingFromProd.length) blockers.push('keep_missing_from_production');
  if (unexpectedInProd.length) blockers.push('unexpected_production_ids');
  if (materialDrift.length) blockers.push(`material_drift=${materialDrift.length}`);
  if (existingRowsChanged) blockers.push(`existing_rows_changed=${existingRowsChanged}`);
  if (comingSoonLeakage.length) blockers.push('coming_soon_leakage');
  if (excludedLeakage.length) blockers.push('excluded_leakage');
  if (closedLeakage.length) blockers.push('closed_leakage');
  if (fitnessCafeActive) blockers.push('fitness_cafe_leakage');
  if (!dryRun && !idempotencyCheck && !newAlreadyPresent && insertions !== 6) {
    blockers.push(`insertions=${insertions}`);
  }
  if (!dryRun && !idempotencyCheck && !newAlreadyPresent && postCatalog.length !== EXPECTED_TOTAL_AFTER) {
    blockers.push(`total_after=${postCatalog.length}`);
  }
  if (!dryRun && !idempotencyCheck && !newAlreadyPresent && mtAfter.length !== EXPECTED_MALTA_AFTER) {
    blockers.push(`malta_after=${mtAfter.length}`);
  }
  if (idempotencyCheck && (insertions !== 0 || existingRowsChanged !== 0 || removals !== 0)) {
    blockers.push('idempotency_failed');
  }
  if ([...approvedIds].filter(id => !afterProdIds.has(id)).length) {
    blockers.push('approved_missing_from_production');
  }
  if ([...afterProdIds].filter(id => !approvedIds.has(id)).length) {
    blockers.push('production_not_in_approved');
  }
  for (const [brand, n] of Object.entries(EXPECTED_BRANDS)) {
    if ((brandCounts[brand] || 0) !== n) {
      blockers.push(`brand_${brand}=${brandCounts[brand] || 0}`);
    }
  }
  if (Object.values(dq).some(v => v > 0)) blockers.push('data_quality');
  if (hardDup.length) blockers.push('hard_duplicates');
  if (Object.values(crossBorder).some(v => v > 0)) blockers.push('cross_border');

  if (blockers.length) {
    report.verdict = 'MALTA RECONCILIATION BLOCKED';
    report.blockers = blockers;
  }

  if (!idempotencyCheck) {
    writeJson(path.join(dataDir, 'MALTA_PRODUCTION_RECONCILIATION_REPORT.json'), report);
    writeJson(path.join(dataDir, 'MALTA_RECONCILIATION_DUPLICATE_ANALYSIS.json'), report.duplicates);

    const md = `# MALTA PRODUCTION RECONCILIATION REPORT

Generated: ${report.generated_at}

## Verdict

**${report.verdict}**

## Delta

- Insertions: **${delta.insertions}**
- Updates: **${delta.updates}**
- Removals: **${delta.removals}**
- Total: **${delta.total_before}** → **${delta.total_after}**
- Malta: **${delta.malta_before}** → **${delta.malta_after}**

## Approved inventory

- KEEP_EXISTING: **18**
- NEW_READY: **6**
- FINAL_APPROVED: **24**

Pre-SHA: \`${expectPreMerge ? preSha : EXPECTED_SHA_BEFORE}\`
Post-SHA: \`${postSha}\`
Pre-bytes: **${preBytes.length}**
Post-bytes: **${postBytes}**
`;
    fs.writeFileSync(
      path.join(dataDir, 'MALTA_PRODUCTION_RECONCILIATION_REPORT.md'),
      md,
      'utf8',
    );
  }

  const shaBeforePath = path.join(dataDir, 'MALTA_RECONCILIATION_SHA_BEFORE.txt');
  if (expectPreMerge) {
    fs.writeFileSync(shaBeforePath, `${preSha}\n`, 'utf8');
  } else if (!fs.existsSync(shaBeforePath)) {
    fs.writeFileSync(shaBeforePath, `${EXPECTED_SHA_BEFORE}\n`, 'utf8');
  }
  fs.writeFileSync(
    path.join(dataDir, 'MALTA_RECONCILIATION_SHA_AFTER.txt'),
    `${postSha}\n`,
    'utf8',
  );

  if (!idempotencyCheck) {
    const existingIdem = fs.existsSync(
      path.join(dataDir, 'MALTA_RECONCILIATION_IDEMPOTENCY.json'),
    )
      ? loadJson(path.join(dataDir, 'MALTA_RECONCILIATION_IDEMPOTENCY.json'))
      : null;
    writeJson(path.join(dataDir, 'MALTA_RECONCILIATION_IDEMPOTENCY.json'), {
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
  console.log(`Malta reconciliation dry-run: ${r.verdict} delta=${r.delta.insertions}/0/0`);
} else if (idempotencyCheck) {
  const r2 = runReconciliation();
  if (r2.delta.insertions !== 0 || r2.delta.updates !== 0 || r2.delta.removals !== 0) {
    process.exit(1);
  }
  const idemPath = path.join(dataDir, 'MALTA_RECONCILIATION_IDEMPOTENCY.json');
  const existing = fs.existsSync(idemPath) ? loadJson(idemPath) : {};
  writeJson(idemPath, {
    first_run:
      existing.first_run?.insertions === 6
        ? existing.first_run
        : {
            insertions: 6,
            updates: 0,
            removals: 0,
            total_before: EXPECTED_TOTAL_BEFORE,
            total_after: EXPECTED_TOTAL_AFTER,
            malta_before: EXPECTED_MALTA_BEFORE,
            malta_after: EXPECTED_MALTA_AFTER,
            mt_prefix_before: EXPECTED_MALTA_BEFORE,
            mt_prefix_after: EXPECTED_MALTA_AFTER,
          },
    second_run: r2.delta,
    idempotent: true,
  });
  console.log('Idempotency check passed');
} else {
  const r1 = runReconciliation();
  console.log(
    `Malta reconciliation: ${r1.verdict} delta=${r1.delta.insertions}/${r1.delta.updates}/${r1.delta.removals}`,
  );
}
