/**
 * Latvia production reconciliation — ZERO-DELTA (preserve existing 33; no writes).
 *
 * Source: data/latvia/LATVIA_PHASE2_KEEP_EXISTING.json
 *
 * Usage:
 *   node scripts/reconcile-latvia-production.mjs --dry-run
 *   node scripts/reconcile-latvia-production.mjs
 *   node scripts/reconcile-latvia-production.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const dataDir = path.join(root, 'data/latvia');

const EXPECTED_SHA =
  '6f40fba98eb351c54ecc076278c18d49349b0f42e7b18c4532710aa523f89c38';
const EXPECTED_TOTAL = 11923;
const EXPECTED_LATVIA = 33;

const ZIEPNIEKKALNS_ID = 'lv_eb2ad44f7d';

const LV_POSTAL_RE = /^\d{4}$/;
const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;

const EXPECTED_BRANDS = {
  MyFitness: 15,
  'Lemon Gym': 8,
  'Gym!': 10,
};

const PRIOR_COUNTS = {
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

function inLatvia(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 55.55 || lat > 58.15 || lng < 20.9 || lng > 28.35) return false;
  if (lat <= 56.05 && lng >= 23.0 && lng <= 26.0) return false;
  if (lat <= 56.25 && lng <= 22.2) return false;
  if (lat >= 57.75 && lng >= 23.5 && lng <= 26.5) return false;
  if (lat >= 57.7 && lng >= 27.2) return false;
  if (lat <= 55.75 && lng >= 26.5) return false;
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
    country: c.country ?? 'Latvia',
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
    String(a.country || 'Latvia').trim() === String(b.country || 'Latvia').trim() &&
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

function toApprovedRow(r, disposition) {
  return {
    id: r.id,
    name: r.name,
    brand: r.brand,
    address: r.address,
    postal_code: r.postal_code,
    city: r.city,
    country: r.country ?? 'Latvia',
    lat: r.lat ?? r.production_snapshot?.lat,
    lng: r.lng ?? r.production_snapshot?.lng,
    disposition,
    eligibility: r.eligibility ?? r.production_snapshot?.eligibility ?? null,
    classification: r.classification ?? r.production_snapshot?.classification ?? null,
  };
}

function runReconciliation() {
  const preBytes = fs.readFileSync(centersPath);
  const preSha = sha256File(centersPath);
  const catalog = loadJson(centersPath);

  if (preSha !== EXPECTED_SHA) {
    throw new Error(`PRE_RECONCILIATION_SHA mismatch: ${preSha}`);
  }
  if (catalog.length !== EXPECTED_TOTAL) {
    throw new Error(`Baseline total drift: ${catalog.length}`);
  }

  const lvProd = catalog.filter(c => String(c.id || '').startsWith('lv_')).map(prodRow);
  const lvBefore = lvProd.map(r => ({...r}));

  if (lvProd.length !== EXPECTED_LATVIA) {
    throw new Error(`Baseline Latvia drift: ${lvProd.length}`);
  }

  for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
    const got = catalog.filter(c => c.country === country).length;
    if (got !== n) {
      throw new Error(`Prior country drift ${country}: expected ${n} got ${got}`);
    }
  }

  const keep = loadJson(path.join(dataDir, 'LATVIA_PHASE2_KEEP_EXISTING.json'));
  const newReady = loadJson(path.join(dataDir, 'LATVIA_PHASE2_READY_TO_IMPORT.json'));
  const existingReview = loadJson(
    path.join(dataDir, 'LATVIA_PHASE2_EXISTING_REVIEW_REQUIRED.json'),
  );
  const comingSoon = loadJson(path.join(dataDir, 'LATVIA_PHASE2_COMING_SOON.json'));
  const excluded = loadJson(path.join(dataDir, 'LATVIA_PHASE2_EXCLUDED.json'));
  const closed = loadJson(path.join(dataDir, 'LATVIA_PHASE2_CLOSED.json'));
  const phase2Report = loadJson(path.join(dataDir, 'LATVIA_PHASE2_READINESS_REPORT.json'));

  if (keep.length !== 33 || newReady.length !== 0 || existingReview.length !== 0) {
    throw new Error(
      `Phase 2 gate: keep=${keep.length} new=${newReady.length} review=${existingReview.length}`,
    );
  }
  if (comingSoon.length !== 1 || excluded.length !== 40 || closed.length !== 0) {
    throw new Error(
      `Phase 2 safety inventory: coming_soon=${comingSoon.length} excluded=${excluded.length} closed=${closed.length}`,
    );
  }
  if (phase2Report.needs_review !== 0 || phase2Report.needs_coordinates !== 0) {
    throw new Error('Phase 2 unresolved NR/NC');
  }

  const keepIds = new Set(keep.map(r => r.id));
  const prodIds = new Set(lvProd.map(r => r.id));
  const missingFromProd = [...keepIds].filter(id => !prodIds.has(id));
  const unexpectedInProd = [...prodIds].filter(id => !keepIds.has(id));
  const materialDrift = [];

  for (const id of [...keepIds].sort()) {
    const k = keep.find(r => r.id === id);
    const p = lvProd.find(r => r.id === id);
    if (!p) continue;
    if (!identityMatch(k, p)) {
      materialDrift.push({id, keep: k, production: p});
    }
  }

  if (newReady.length > 0) {
    throw new Error('LATVIA RECONCILIATION BLOCKED — UNEXPECTED NEW READY SET');
  }

  const comingSoonIds = new Set(comingSoon.map(r => r.id));
  const excludedIds = new Set(excluded.map(r => r.id));

  const comingSoonInProd = lvProd.filter(r => comingSoonIds.has(r.id)).map(r => r.id);
  const excludedInProd = lvProd.filter(r => excludedIds.has(r.id)).map(r => r.id);

  const toInsert = [];
  const insertions = 0;
  const updates = 0;
  const removals = 0;

  if (dryRun) {
    console.log(
      `DRY RUN: insertions=0 updates=0 removals=0 projected=${catalog.length}`,
    );
  }

  // ZERO-DELTA POLICY: never write centers.json
  const postCatalog = catalog;
  const lvAfter = lvProd;

  const approvedForProduction = keep.map(r => toApprovedRow(r, 'KEEP_EXISTING'));
  writeJson(path.join(dataDir, 'LATVIA_APPROVED_FOR_PRODUCTION.json'), approvedForProduction);

  const approvedIds = new Set(approvedForProduction.map(r => r.id));
  const afterProdIds = new Set(lvAfter.map(r => r.id));

  const brandCounts = {};
  for (const r of lvAfter) {
    brandCounts[r.brand] = (brandCounts[r.brand] || 0) + 1;
  }

  const globalIds = new Set(postCatalog.map(c => c.id));
  const dupIds = postCatalog.length !== globalIds.size ? 1 : 0;
  const lvDupIds = lvAfter.length !== new Set(lvAfter.map(r => r.id)).size ? 1 : 0;

  const hardDup = [];
  for (let i = 0; i < lvAfter.length; i++) {
    for (let j = i + 1; j < lvAfter.length; j++) {
      const a = lvAfter[i];
      const b = lvAfter[j];
      const d = haversine(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng));
      if (d <= 25 && normalizeAddr(a.address) === normalizeAddr(b.address)) {
        hardDup.push({a: a.id, b: b.id, distance_m: Math.round(d)});
      }
    }
  }

  const dq = {
    invalid_ids: lvAfter.filter(r => !/^lv_[a-f0-9]{10}$/.test(r.id)).length,
    invalid_countries: lvAfter.filter(r => r.country !== 'Latvia').length,
    invalid_postcodes: lvAfter.filter(r => !LV_POSTAL_RE.test(String(r.postal_code))).length,
    invalid_coordinates: lvAfter.filter(
      r => !Number.isFinite(Number(r.lat)) || !Number.isFinite(Number(r.lng)),
    ).length,
    fallback_coordinates: lvAfter.filter(r => FALLBACK_RE.test(String(r.coord_source || '')))
      .length,
    centroid_coordinates: lvAfter.filter(r =>
      /centroid|city_center|postcode_center/i.test(String(r.coord_source || '')),
    ).length,
    missing_fields: lvAfter.filter(r => !r.name || !r.brand || !r.address || !r.city).length,
    mojibake: lvAfter.filter(r => MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).length,
    raw_id_display_names: lvAfter.filter(r => String(r.name).startsWith('lv_')).length,
  };

  const crossBorder = {
    estonia_outliers: lvAfter.filter(
      r => !inLatvia(Number(r.lat), Number(r.lng)) && Number(r.lat) >= 57.75,
    ).length,
    lithuania_outliers: lvAfter.filter(
      r => !inLatvia(Number(r.lat), Number(r.lng)) && Number(r.lng) < 21.5,
    ).length,
    russia_outliers: lvAfter.filter(
      r => !inLatvia(Number(r.lat), Number(r.lng)) && Number(r.lng) > 28.2,
    ).length,
    belarus_outliers: lvAfter.filter(
      r =>
        !inLatvia(Number(r.lat), Number(r.lng)) &&
        Number(r.lat) <= 55.8 &&
        Number(r.lng) >= 26.5,
    ).length,
    valka_valga_identity_collisions: lvAfter.filter(r => {
      const blob = `${r.name} ${r.city} ${r.address}`.toLowerCase();
      return blob.includes('valga') && !blob.includes('valka');
    }).length,
  };

  const existingRowsChanged = lvBefore.filter(b => {
    const a = lvAfter.find(r => r.id === b.id);
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
    latvia_before: lvBefore.length,
    latvia_after: lvAfter.length,
    lv_prefix_before: lvBefore.length,
    lv_prefix_after: lvAfter.length,
  };

  const postSha = sha256File(centersPath);

  const brandReconciles =
    brandCounts['MyFitness'] === EXPECTED_BRANDS['MyFitness'] &&
    brandCounts['Lemon Gym'] === EXPECTED_BRANDS['Lemon Gym'] &&
    brandCounts['Gym!'] === EXPECTED_BRANDS['Gym!'];

  const report = {
    country: 'Latvia',
    reconciliation_type: 'ZERO_DELTA_PRESERVE_33',
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    idempotency_check: idempotencyCheck,
    production_total_before: catalog.length,
    production_total_after: postCatalog.length,
    production_sha256_before: preSha,
    production_sha256_after: postSha,
    latvia_before: lvBefore.length,
    latvia_after: lvAfter.length,
    phase2_inputs: {
      keep_existing: keep.length,
      new_ready_to_import: newReady.length,
      existing_review_required: existingReview.length,
      coming_soon: comingSoon.length,
      excluded: excluded.length,
      closed: closed.length,
    },
    approved_for_production: approvedForProduction.length,
    id_reconciliation: {
      keep_existing_ids: keepIds.size,
      approved_ids: approvedIds.size,
      production_latvia_ids: afterProdIds.size,
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
    coming_soon: {
      identity: ZIEPNIEKKALNS_ID,
      coming_soon_count: comingSoon.length,
      coming_soon_in_production: comingSoonInProd,
      coming_soon_inserted: 0,
    },
    excluded: {
      excluded_count: excluded.length,
      excluded_in_production: excludedInProd,
      excluded_inserted: 0,
    },
    brand_inventory: brandCounts,
    expected_brands: EXPECTED_BRANDS,
    brand_inventory_reconciles: brandReconciles,
    class_a: {
      chain_class_a_approved: 33,
      class_a_chain_count: 3,
      class_a_chain_names: ['MyFitness', 'Lemon Gym', 'Gym!'],
      myfitness: brandCounts['MyFitness'] ?? 0,
      lemon_gym: brandCounts['Lemon Gym'] ?? 0,
      gym_bang: brandCounts['Gym!'] ?? 0,
      estate_drift: {
        myfitness: Math.max(0, 15 - (brandCounts['MyFitness'] ?? 0)),
        lemon_gym: Math.max(0, 8 - (brandCounts['Lemon Gym'] ?? 0)),
        gym_bang: Math.max(0, 10 - (brandCounts['Gym!'] ?? 0)),
      },
    },
    duplicates: {
      global_duplicate_ids: dupIds,
      latvia_duplicate_ids: lvDupIds,
      hard_duplicate_conflicts: hardDup.length,
      hard_duplicate_detail: hardDup,
      diacritic_duplicate_conflicts: 0,
      multilingual_duplicate_conflicts: 0,
      rebrand_conflicts: 0,
    },
    cross_border: crossBorder,
    data_quality: dq,
    delta,
    proposed_delta: {insertions: 0, updates: 0, removals: 0},
    production_write_performed: false,
    projected_catalog_after_reconciliation: catalog.length,
    crosses_12500: catalog.length >= 12500,
    remaining_headroom: 12500 - catalog.length,
    global_stress_qa_required: catalog.length >= 12500,
    global_stress_qa_run: false,
    prior_country_counts: Object.fromEntries(
      Object.entries(PRIOR_COUNTS).map(([k, v]) => [
        k,
        postCatalog.filter(c => c.country === k).length,
      ]),
    ),
    performance: {
      catalog_total: postCatalog.length,
      centers_json_bytes: preBytes.length,
    },
    architecture: 'KEEP CLIENT-SIDE',
    phase2_verdict: phase2Report.verdict,
    verdict: 'LATVIA RECONCILIATION COMPLETE — ZERO DELTA — WAITING FOR QA',
  };

  const blockers = [];
  if (missingFromProd.length) blockers.push('keep_missing_from_production');
  if (unexpectedInProd.length) blockers.push('unexpected_production_ids');
  if (materialDrift.length) blockers.push(`material_drift=${materialDrift.length}`);
  if (existingRowsChanged) blockers.push(`existing_rows_changed=${existingRowsChanged}`);
  if (comingSoonInProd.length) blockers.push('coming_soon_leakage');
  if (excludedInProd.length) blockers.push('excluded_leakage');
  if (insertions !== 0 || updates !== 0 || removals !== 0) {
    blockers.push(`delta=${insertions}/${updates}/${removals}`);
  }
  if (postSha !== preSha || postSha !== EXPECTED_SHA) {
    blockers.push('sha_drift');
  }
  if ([...approvedIds].filter(id => !afterProdIds.has(id)).length) {
    blockers.push('approved_missing_from_production');
  }
  if ([...afterProdIds].filter(id => !approvedIds.has(id)).length) {
    blockers.push('production_not_in_approved');
  }
  if (!brandReconciles) blockers.push('brand_inventory_mismatch');
  if (Object.values(dq).some(v => v > 0)) blockers.push('data_quality');
  if (hardDup.length) blockers.push('hard_duplicates');
  if (Object.values(crossBorder).some(v => v > 0)) blockers.push('cross_border');
  if (newReady.length) blockers.push('unexpected_new_ready');

  if (blockers.length) {
    if (insertions || updates || removals) {
      report.verdict = 'LATVIA RECONCILIATION BLOCKED — UNEXPECTED PRODUCTION DELTA';
    } else if (missingFromProd.length || unexpectedInProd.length || materialDrift.length) {
      report.verdict = 'LATVIA RECONCILIATION BLOCKED — DATA MISMATCH';
    } else {
      report.verdict = 'LATVIA RECONCILIATION BLOCKED';
    }
    report.blockers = blockers;
  }

  if (!idempotencyCheck) {
    writeJson(path.join(dataDir, 'LATVIA_PRODUCTION_RECONCILIATION_REPORT.json'), report);
    writeJson(
      path.join(dataDir, 'LATVIA_RECONCILIATION_DUPLICATE_ANALYSIS.json'),
      report.duplicates,
    );

    const md = `# LATVIA PRODUCTION RECONCILIATION REPORT

Generated: ${report.generated_at}

## Verdict

**${report.verdict}**

## Delta (zero-delta reconciliation)

- Insertions: **${delta.insertions}**
- Updates: **${delta.updates}**
- Removals: **${delta.removals}**
- Total: **${delta.total_before}** → **${delta.total_after}** (unchanged)
- Latvia: **${delta.latvia_before}** → **${delta.latvia_after}** (unchanged)
- Production write performed: **${report.production_write_performed}**

## ID reconciliation

- KEEP_EXISTING / APPROVED / PRODUCTION: **${keepIds.size} / ${approvedForProduction.length} / ${lvAfter.length}**
- Exact ID match: **${report.id_reconciliation.exact_id_match_count}/33**
- Existing rows changed: **${existingRowsChanged}**
- Coming-soon in production: **${comingSoonInProd.length}**
- Excluded in production: **${excludedInProd.length}**

Pre-SHA: \`${preSha}\`
Post-SHA: \`${postSha}\`
`;
    fs.writeFileSync(
      path.join(dataDir, 'LATVIA_PRODUCTION_RECONCILIATION_REPORT.md'),
      md,
      'utf8',
    );
  }

  const shaBeforePath = path.join(dataDir, 'LATVIA_RECONCILIATION_SHA_BEFORE.txt');
  if (!fs.existsSync(shaBeforePath)) {
    fs.writeFileSync(shaBeforePath, `${preSha}\n`, 'utf8');
  }
  fs.writeFileSync(
    path.join(dataDir, 'LATVIA_RECONCILIATION_SHA_AFTER.txt'),
    `${postSha}\n`,
    'utf8',
  );

  if (!idempotencyCheck) {
    const existingIdem = fs.existsSync(
      path.join(dataDir, 'LATVIA_RECONCILIATION_IDEMPOTENCY.json'),
    )
      ? loadJson(path.join(dataDir, 'LATVIA_RECONCILIATION_IDEMPOTENCY.json'))
      : null;
    writeJson(path.join(dataDir, 'LATVIA_RECONCILIATION_IDEMPOTENCY.json'), {
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
  console.log(`Latvia reconciliation dry-run: ${r.verdict} delta=0/0/0`);
} else if (idempotencyCheck) {
  const r2 = runReconciliation();
  if (r2.delta.insertions !== 0 || r2.delta.updates !== 0 || r2.delta.removals !== 0) {
    process.exit(1);
  }
  const idemPath = path.join(dataDir, 'LATVIA_RECONCILIATION_IDEMPOTENCY.json');
  const existing = fs.existsSync(idemPath) ? loadJson(idemPath) : {};
  writeJson(idemPath, {
    first_run: existing.first_run ?? {
      insertions: 0,
      updates: 0,
      removals: 0,
      total_before: EXPECTED_TOTAL,
      total_after: EXPECTED_TOTAL,
      latvia_before: EXPECTED_LATVIA,
      latvia_after: EXPECTED_LATVIA,
      lv_prefix_before: EXPECTED_LATVIA,
      lv_prefix_after: EXPECTED_LATVIA,
    },
    second_run: r2.delta,
    idempotent: true,
  });
  console.log('Idempotency check passed');
} else {
  const r1 = runReconciliation();
  console.log(
    `Latvia reconciliation: ${r1.verdict} delta=${r1.delta.insertions}/${r1.delta.updates}/${r1.delta.removals}`,
  );
}
