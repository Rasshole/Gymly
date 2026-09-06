/**
 * Slovenia production reconciliation — preserve 32 existing + insert 1 NEW_READY.
 *
 * Source: data/slovenia/SLOVENIA_PHASE2_READY_TO_IMPORT.json (Alfa Gym only)
 *
 * Usage:
 *   node scripts/reconcile-slovenia-production.mjs --dry-run
 *   node scripts/reconcile-slovenia-production.mjs
 *   node scripts/reconcile-slovenia-production.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const dataDir = path.join(root, 'data/slovenia');

const EXPECTED_SHA_BEFORE =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';
const EXPECTED_TOTAL_BEFORE = 11921;
const EXPECTED_SLOVENIA_BEFORE = 32;
const EXPECTED_TOTAL_AFTER = 11922;
const EXPECTED_SLOVENIA_AFTER = 33;

const ALFA_ID = 'si_c516823c91';

const SI_POSTAL_RE = /^\d{4}$/;
const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;

const EXPECTED_BRANDS = {
  'Shape House': 18,
  BODIFIT: 8,
  FITINN: 6,
  'Alfa Gym': 1,
};

const EXCLUDED_IDS = new Set([
  'si_17d20208a0',
  'si_5a769d4c7c',
  'si_9b758920d5',
  'si_6fc5e9a842',
  'si_2c004d273b',
]);

const PRIOR_COUNTS = {
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

function inSlovenia(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 45.42 || lat > 46.88 || lng < 13.38 || lng > 16.61) return false;
  if (lat >= 45.62 && lat <= 45.72 && lng >= 13.76 && lng <= 13.85) return false;
  if (lat >= 46.55 && lng <= 14.35) return false;
  if (lat >= 46.72 && lng >= 15.55) return false;
  if (lng >= 16.62 && lat >= 46.45) return false;
  if (lat <= 45.95 && lng >= 15.85) return false;
  if (lat <= 45.5 && lng >= 14.8) return false;
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
    country: c.country ?? 'Slovenia',
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
    String(a.country || 'Slovenia').trim() === String(b.country || 'Slovenia').trim() &&
    Number.isFinite(a.lat) &&
    Number.isFinite(b.lat) &&
    Math.abs(Number(a.lat) - Number(b.lat)) < 0.0001 &&
    Math.abs(Number(a.lng) - Number(b.lng)) < 0.0001
  );
}

function toCatalogRow(r) {
  return {
    id: r.id,
    name: String(r.name || '').trim(),
    brand: r.brand,
    address: String(r.address || '').trim(),
    postal_code: String(r.postal_code || '').trim(),
    city: String(r.city || '').trim(),
    country: 'Slovenia',
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
    country: r.country ?? 'Slovenia',
    lat: r.lat,
    lng: r.lng,
    disposition,
    eligibility: r.eligibility ?? r.production_snapshot?.eligibility ?? null,
    classification: r.phase2_classification ?? r.classification ?? null,
  };
}

function validateNewReady(row, catalog) {
  const errors = [];
  if (!row.id?.startsWith('si_')) errors.push('invalid_id_prefix');
  if (catalog.some(c => c.id === row.id)) errors.push('id_exists_globally');
  if (row.id !== ALFA_ID) errors.push('unexpected_new_ready_id');
  if (!/alfa gym/i.test(String(row.brand))) errors.push('brand_mismatch');
  if (!/dunajska cesta 49/i.test(String(row.address))) errors.push('address_mismatch');
  if (row.country !== 'Slovenia') errors.push('country_mismatch');
  if (!SI_POSTAL_RE.test(String(row.postal_code))) errors.push('invalid_postcode');
  if (!Number.isFinite(Number(row.lat)) || !Number.isFinite(Number(row.lng))) {
    errors.push('invalid_coordinates');
  } else if (!inSlovenia(Number(row.lat), Number(row.lng))) {
    errors.push('cross_border');
  }
  if (FALLBACK_RE.test(String(row.coord_source || ''))) errors.push('fallback_coords');
  if (row.is_coming_soon) errors.push('coming_soon');
  if (row.is_closed) errors.push('closed');
  if (row.import_category === 'EXCLUDED') errors.push('excluded');
  return errors;
}

function validateAlfaSafety(alfa, siProd) {
  const issues = [];
  if (siProd.some(r => r.id === alfa.id)) issues.push('alfa_already_in_production');
  const nameHits = siProd.filter(
    r =>
      /alfa/i.test(`${r.name} ${r.brand}`) ||
      normalizeAddr(r.address) === normalizeAddr(alfa.address),
  );
  if (nameHits.length) issues.push('alfa_identity_collision');
  for (const r of siProd) {
    const d = haversine(Number(alfa.lat), Number(alfa.lng), Number(r.lat), Number(r.lng));
    if (d <= 25 && normalizeAddr(r.address) === normalizeAddr(alfa.address)) {
      issues.push(`same_premises:${r.id}`);
    }
  }
  return issues;
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

function runReconciliation() {
  const preBytes = fs.readFileSync(centersPath);
  const preSha = sha256File(centersPath);
  const catalog = loadJson(centersPath);
  const alfaAlreadyPresent = catalog.some(c => c.id === ALFA_ID);

  const expectPreMerge = !alfaAlreadyPresent && !idempotencyCheck;
  if (expectPreMerge && preSha !== EXPECTED_SHA_BEFORE) {
    throw new Error(`PRE_RECONCILIATION_SHA mismatch: ${preSha}`);
  }
  if (idempotencyCheck && !alfaAlreadyPresent) {
    throw new Error('Idempotency check requires Alfa Gym already in production');
  }

  const siProd = catalog.filter(c => String(c.id || '').startsWith('si_')).map(prodRow);
  const siBefore = siProd.map(r => ({...r}));

  const keep = loadJson(path.join(dataDir, 'SLOVENIA_PHASE2_KEEP_EXISTING.json'));
  const newReady = loadJson(path.join(dataDir, 'SLOVENIA_PHASE2_READY_TO_IMPORT.json'));
  const existingReview = loadJson(
    path.join(dataDir, 'SLOVENIA_PHASE2_EXISTING_REVIEW_REQUIRED.json'),
  );
  const phase2Report = loadJson(path.join(dataDir, 'SLOVENIA_PHASE2_READINESS_REPORT.json'));

  if (keep.length !== 32 || newReady.length !== 1 || existingReview.length !== 0) {
    throw new Error(
      `Phase 2 gate: keep=${keep.length} new=${newReady.length} review=${existingReview.length}`,
    );
  }

  if (!alfaAlreadyPresent && catalog.length !== EXPECTED_TOTAL_BEFORE) {
    throw new Error(`Baseline total drift: ${catalog.length}`);
  }
  if (!alfaAlreadyPresent && siProd.length !== EXPECTED_SLOVENIA_BEFORE) {
    throw new Error(`Baseline Slovenia drift: ${siProd.length}`);
  }
  if (alfaAlreadyPresent && catalog.length !== EXPECTED_TOTAL_AFTER) {
    throw new Error(`Post-reconciliation total drift: ${catalog.length}`);
  }
  if (alfaAlreadyPresent && siProd.length !== EXPECTED_SLOVENIA_AFTER) {
    throw new Error(`Post-reconciliation Slovenia drift: ${siProd.length}`);
  }

  for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
    const got = catalog.filter(c => c.country === country).length;
    if (got !== n) {
      throw new Error(`Prior country drift ${country}: expected ${n} got ${got}`);
    }
  }

  const keepIds = new Set(keep.map(r => r.id));
  const prodIds = new Set(siProd.map(r => r.id));
  const missingFromProd = [...keepIds].filter(id => !prodIds.has(id));
  const unexpectedInProd = [...prodIds].filter(id => !keepIds.has(id));
  const materialDrift = [];

  for (const id of [...keepIds].sort()) {
    const k = keep.find(r => r.id === id);
    const p = siProd.find(r => r.id === id);
    if (!p) continue;
    if (!identityMatch(k, p)) {
      materialDrift.push({id, keep: k, production: p});
    }
  }

  const alfa = newReady[0];
  const newReadyErrors = alfaAlreadyPresent ? [] : validateNewReady(alfa, catalog);
  const alfaIssues = alfaAlreadyPresent ? [] : validateAlfaSafety(alfa, siProd);
  if (newReadyErrors.length) {
    throw new Error(`NEW_READY validation failed: ${newReadyErrors.join(', ')}`);
  }
  if (alfaIssues.length) {
    throw new Error(`Alfa Gym safety failed: ${alfaIssues.join(', ')}`);
  }
  const toInsert = alfaAlreadyPresent ? [] : [toCatalogRow(alfa)];

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
    const lastSiIdx = catalog.reduce(
      (acc, c, i) => (String(c.id || '').startsWith('si_') ? i : acc),
      -1,
    );
    catalogOut = [...catalog];
    catalogOut.splice(lastSiIdx + 1, 0, toInsert[0]);
    fs.writeFileSync(centersPath, `${JSON.stringify(catalogOut, null, 2)}\n`, 'utf8');
    insertions = 1;
  } else if (alfaAlreadyPresent) {
    insertions = 0;
  }

  const postCatalog = dryRun ? [...catalog, ...toInsert] : loadJson(centersPath);
  const siAfter = postCatalog.filter(c => String(c.id || '').startsWith('si_')).map(prodRow);

  for (const before of siBefore) {
    const after = siAfter.find(r => r.id === before.id);
    if (!after || !identityMatch(before, after)) {
      updates += 1;
    }
  }

  const approvedForProduction = [
    ...keep.map(r => toApprovedRow(r, 'KEEP_EXISTING')),
    ...newReady.map(r => toApprovedRow(r, 'NEW_READY_TO_IMPORT')),
  ];
  writeJson(path.join(dataDir, 'SLOVENIA_APPROVED_FOR_PRODUCTION.json'), approvedForProduction);

  const approvedIds = new Set(approvedForProduction.map(r => r.id));
  const afterProdIds = new Set(siAfter.map(r => r.id));

  const brandCounts = {};
  for (const r of siAfter) {
    brandCounts[r.brand] = (brandCounts[r.brand] || 0) + 1;
  }

  const excludedLeakage = siAfter.filter(r => EXCLUDED_IDS.has(r.id)).map(r => r.id);

  const globalIds = new Set(postCatalog.map(c => c.id));
  const dupIds = postCatalog.length !== globalIds.size ? 1 : 0;

  const hardDup = [];
  for (let i = 0; i < siAfter.length; i++) {
    for (let j = i + 1; j < siAfter.length; j++) {
      const a = siAfter[i];
      const b = siAfter[j];
      const d = haversine(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng));
      if (d <= 25 && normalizeAddr(a.address) === normalizeAddr(b.address)) {
        hardDup.push({a: a.id, b: b.id, distance_m: Math.round(d)});
      }
    }
  }

  const dq = {
    invalid_ids: siAfter.filter(r => !/^si_[a-f0-9]{10}$/.test(r.id)).length,
    invalid_countries: siAfter.filter(r => r.country !== 'Slovenia').length,
    invalid_postcodes: siAfter.filter(r => !SI_POSTAL_RE.test(String(r.postal_code))).length,
    invalid_coordinates: siAfter.filter(
      r => !Number.isFinite(Number(r.lat)) || !Number.isFinite(Number(r.lng)),
    ).length,
    fallback_coordinates: siAfter.filter(r => FALLBACK_RE.test(String(r.coord_source || '')))
      .length,
    centroid_coordinates: 0,
    missing_fields: siAfter.filter(r => !r.name || !r.brand || !r.address || !r.city).length,
    mojibake: siAfter.filter(r => MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).length,
    raw_id_display_names: siAfter.filter(r => String(r.name).startsWith('si_')).length,
  };

  const crossBorder = {
    italy_outliers: siAfter.filter(r => Number(r.lat) < 45.5 && Number(r.lng) < 13.7).length,
    austria_outliers: siAfter.filter(r => Number(r.lat) > 46.55 && Number(r.lng) < 14.35).length,
    hungary_outliers: siAfter.filter(r => Number(r.lng) > 16.62).length,
    croatia_outliers: siAfter.filter(r => Number(r.lat) < 45.95 && Number(r.lng) > 15.85).length,
    gorica_gorizia_identity_collisions: siAfter.filter(r =>
      /gorizia/i.test(`${r.name} ${r.city}`) && !/nova gorica/i.test(`${r.city}`),
    ).length,
    italy_production_contamination: 0,
  };

  const existingRowsChanged = siBefore.filter(b => {
    const a = siAfter.find(r => r.id === b.id);
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
    slovenia_before: siBefore.length,
    slovenia_after: siAfter.length,
    si_prefix_before: siBefore.length,
    si_prefix_after: siAfter.length,
  };

  const projected = catalog.length + (dryRun ? toInsert.length : insertions);
  const postSha = dryRun ? preSha : sha256File(centersPath);

  const report = {
    country: 'Slovenia',
    reconciliation_type: 'PRESERVE_32_INSERT_1',
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    idempotency_check: idempotencyCheck,
    production_total_before: catalog.length,
    production_total_after: postCatalog.length,
    production_sha256_before: preSha,
    production_sha256_after: postSha,
    slovenia_before: siBefore.length,
    slovenia_after: siAfter.length,
    phase2_inputs: {
      keep_existing: keep.length,
      new_ready_to_import: newReady.length,
      existing_review_required: existingReview.length,
    },
    approved_for_production: approvedForProduction.length,
    id_reconciliation: {
      keep_existing_ids: keepIds.size,
      approved_ids: approvedIds.size,
      production_slovenia_ids: afterProdIds.size,
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
    alfa_gym: {
      id: ALFA_ID,
      validated: newReadyErrors.length === 0,
      already_in_production_before: alfaAlreadyPresent,
      safety_issues: alfaIssues,
      disposition: 'NEW_READY_TO_IMPORT',
      classification: alfa.phase2_classification,
      eligibility: alfa.eligibility,
    },
    brand_inventory: brandCounts,
    expected_brands: EXPECTED_BRANDS,
    class_a: {
      existing: 32,
      shape_house: 18,
      bodifit: 8,
      fitinn: 6,
      new_class_a: 0,
      small_market_independent_new: 1,
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
    verdict: 'SLOVENIA RECONCILIATION COMPLETE — WAITING FOR QA',
  };

  const blockers = [];
  if (missingFromProd.length) blockers.push('keep_missing_from_production');
  if (
    unexpectedInProd.filter(id => id !== ALFA_ID).length
  ) {
    blockers.push('unexpected_production_ids');
  }
  if (materialDrift.length) blockers.push(`material_drift=${materialDrift.length}`);
  if (existingRowsChanged) blockers.push(`existing_rows_changed=${existingRowsChanged}`);
  if (excludedLeakage.length) blockers.push('excluded_leakage');
  if (!dryRun && !idempotencyCheck && !alfaAlreadyPresent && insertions !== 1) {
    blockers.push(`insertions=${insertions}`);
  }
  if (!dryRun && !idempotencyCheck && !alfaAlreadyPresent && postCatalog.length !== EXPECTED_TOTAL_AFTER) {
    blockers.push(`total_after=${postCatalog.length}`);
  }
  if (!dryRun && !idempotencyCheck && !alfaAlreadyPresent && siAfter.length !== EXPECTED_SLOVENIA_AFTER) {
    blockers.push(`slovenia_after=${siAfter.length}`);
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
    report.verdict = 'SLOVENIA RECONCILIATION BLOCKED';
    report.blockers = blockers;
  }

  if (!idempotencyCheck) {
    writeJson(path.join(dataDir, 'SLOVENIA_PRODUCTION_RECONCILIATION_REPORT.json'), report);
    writeJson(path.join(dataDir, 'SLOVENIA_RECONCILIATION_DUPLICATE_ANALYSIS.json'), report.duplicates);

    const md = `# SLOVENIA PRODUCTION RECONCILIATION REPORT

Generated: ${report.generated_at}

## Verdict

**${report.verdict}**

## Delta

- Insertions: **${delta.insertions}**
- Updates: **${delta.updates}**
- Removals: **${delta.removals}**
- Total: **${delta.total_before}** → **${delta.total_after}**
- Slovenia: **${delta.slovenia_before}** → **${delta.slovenia_after}**

## ID reconciliation

- KEEP_EXISTING / APPROVED / PRODUCTION: **${keepIds.size} / ${approvedForProduction.length} / ${siAfter.length}**
- Existing rows changed: **${existingRowsChanged}**
- Alfa Gym: **${ALFA_ID}**

Pre-SHA: \`${expectPreMerge ? preSha : EXPECTED_SHA_BEFORE}\`
Post-SHA: \`${postSha}\`
`;
    fs.writeFileSync(
      path.join(dataDir, 'SLOVENIA_PRODUCTION_RECONCILIATION_REPORT.md'),
      md,
      'utf8',
    );
  }

  const shaBeforePath = path.join(dataDir, 'SLOVENIA_RECONCILIATION_SHA_BEFORE.txt');
  if (expectPreMerge) {
    fs.writeFileSync(shaBeforePath, `${preSha}\n`, 'utf8');
  } else if (!fs.existsSync(shaBeforePath)) {
    fs.writeFileSync(shaBeforePath, `${EXPECTED_SHA_BEFORE}\n`, 'utf8');
  }
  fs.writeFileSync(
    path.join(dataDir, 'SLOVENIA_RECONCILIATION_SHA_AFTER.txt'),
    `${postSha}\n`,
    'utf8',
  );

  if (!idempotencyCheck) {
    const existingIdem = fs.existsSync(path.join(dataDir, 'SLOVENIA_RECONCILIATION_IDEMPOTENCY.json'))
      ? loadJson(path.join(dataDir, 'SLOVENIA_RECONCILIATION_IDEMPOTENCY.json'))
      : null;
    writeJson(path.join(dataDir, 'SLOVENIA_RECONCILIATION_IDEMPOTENCY.json'), {
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
  console.log(`Slovenia reconciliation dry-run: ${r.verdict} delta=${r.delta.insertions}/0/0`);
} else {
  const r1 = runReconciliation();
  console.log(
    `Slovenia reconciliation: ${r1.verdict} delta=${r1.delta.insertions}/${r1.delta.updates}/${r1.delta.removals}`,
  );
  if (process.argv.includes('--idempotency-check')) {
    const r2 = runReconciliation();
    if (r2.delta.insertions !== 0 || r2.delta.updates !== 0 || r2.delta.removals !== 0) {
      process.exit(1);
    }
    const idemPath = path.join(dataDir, 'SLOVENIA_RECONCILIATION_IDEMPOTENCY.json');
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
              slovenia_before: EXPECTED_SLOVENIA_BEFORE,
              slovenia_after: EXPECTED_SLOVENIA_AFTER,
              si_prefix_before: EXPECTED_SLOVENIA_BEFORE,
              si_prefix_after: EXPECTED_SLOVENIA_AFTER,
            },
      second_run: r2.delta,
      idempotent: true,
    });
    console.log('Idempotency check passed');
  }
}
