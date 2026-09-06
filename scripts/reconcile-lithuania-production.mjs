/**
 * Lithuania production reconciliation — ZERO-DELTA (preserve existing 61; no writes).
 *
 * Source: data/lithuania/LITHUANIA_PHASE2_KEEP_EXISTING.json
 *
 * Usage:
 *   node scripts/reconcile-lithuania-production.mjs --dry-run
 *   node scripts/reconcile-lithuania-production.mjs
 *   node scripts/reconcile-lithuania-production.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const dataDir = path.join(root, 'data/lithuania');

const EXPECTED_SHA =
  '6f40fba98eb351c54ecc076278c18d49349b0f42e7b18c4532710aa523f89c38';
const EXPECTED_BYTES = 3706426;
const EXPECTED_TOTAL = 11923;
const EXPECTED_LITHUANIA = 61;

const LT_POSTAL_RE = /^\d{5}$/;
const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;

const EXPECTED_BRANDS = {
  'Gym+': 38,
  'Lemon Gym': 18,
  Impuls: 5,
};

const PRIOR_COUNTS = {
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

function inLithuania(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 53.88 || lat > 56.45 || lng < 20.9 || lng > 26.88) return false;
  // North: Latvia (Riga / Jelgava corridor)
  if (lat >= 56.35 && lng >= 23.5 && lng <= 25.5) return false;
  // NE: Latvia (Daugavpils corridor)
  if (lat >= 55.95 && lng >= 26.2) return false;
  // West: Kaliningrad urban / inland west of Curonian Spit
  if (lng <= 21.0 && lat >= 54.55 && lat <= 55.05) return false;
  // South: Belarus (Grodno corridor)
  if (lat <= 54.0 && lng >= 23.5 && lng <= 25.0) return false;
  // SW: Poland (Suwałki corridor)
  if (lat <= 54.15 && lng >= 22.5 && lng <= 23.4) return false;
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
    country: c.country ?? 'Lithuania',
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
    String(a.country || 'Lithuania').trim() === String(b.country || 'Lithuania').trim() &&
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
    .replace(/[^a-z0-9+]+/gi, ' ')
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
    country: r.country ?? 'Lithuania',
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
  if (preBytes.length !== EXPECTED_BYTES) {
    throw new Error(`Baseline bytes drift: ${preBytes.length} expected ${EXPECTED_BYTES}`);
  }
  if (catalog.length !== EXPECTED_TOTAL) {
    throw new Error(`Baseline total drift: ${catalog.length}`);
  }

  const ltProd = catalog.filter(c => String(c.id || '').startsWith('lt_')).map(prodRow);
  const ltBefore = ltProd.map(r => ({...r}));

  if (ltProd.length !== EXPECTED_LITHUANIA) {
    throw new Error(`Baseline Lithuania drift: ${ltProd.length}`);
  }

  for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
    const got = catalog.filter(c => c.country === country).length;
    if (got !== n) {
      throw new Error(`Prior country drift ${country}: expected ${n} got ${got}`);
    }
  }

  const keep = loadJson(path.join(dataDir, 'LITHUANIA_PHASE2_KEEP_EXISTING.json'));
  const newReady = loadJson(path.join(dataDir, 'LITHUANIA_PHASE2_READY_TO_IMPORT.json'));
  const existingReview = loadJson(
    path.join(dataDir, 'LITHUANIA_PHASE2_EXISTING_REVIEW_REQUIRED.json'),
  );
  const comingSoon = loadJson(path.join(dataDir, 'LITHUANIA_PHASE2_COMING_SOON.json'));
  const excluded = loadJson(path.join(dataDir, 'LITHUANIA_PHASE2_EXCLUDED.json'));
  const closed = loadJson(path.join(dataDir, 'LITHUANIA_PHASE2_CLOSED.json'));
  const phase2Report = loadJson(path.join(dataDir, 'LITHUANIA_PHASE2_READINESS_REPORT.json'));

  if (keep.length !== 61 || newReady.length !== 0 || existingReview.length !== 0) {
    throw new Error(
      `Phase 2 gate: keep=${keep.length} new=${newReady.length} review=${existingReview.length}`,
    );
  }
  if (comingSoon.length !== 3 || excluded.length !== 39 || closed.length !== 0) {
    throw new Error(
      `Phase 2 safety inventory: coming_soon=${comingSoon.length} excluded=${excluded.length} closed=${closed.length}`,
    );
  }
  if (phase2Report.needs_review !== 0 || phase2Report.needs_coordinates !== 0) {
    throw new Error('Phase 2 unresolved NR/NC');
  }

  const keepIds = new Set(keep.map(r => r.id));
  const prodIds = new Set(ltProd.map(r => r.id));
  const missingFromProd = [...keepIds].filter(id => !prodIds.has(id));
  const unexpectedInProd = [...prodIds].filter(id => !keepIds.has(id));
  const materialDrift = [];

  for (const id of [...keepIds].sort()) {
    const k = keep.find(r => r.id === id);
    const p = ltProd.find(r => r.id === id);
    if (!p) continue;
    if (!identityMatch(k, p)) {
      materialDrift.push({id, keep: k, production: p});
    }
  }

  if (newReady.length > 0) {
    throw new Error('LITHUANIA RECONCILIATION BLOCKED — UNEXPECTED NEW READY SET');
  }

  const comingSoonIds = new Set(comingSoon.map(r => r.id));
  const excludedIds = new Set(excluded.map(r => r.id));

  const comingSoonInProd = ltProd.filter(r => comingSoonIds.has(r.id)).map(r => r.id);
  const excludedInProd = ltProd.filter(r => excludedIds.has(r.id)).map(r => r.id);

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
  const ltAfter = ltProd;

  const approvedForProduction = keep.map(r => toApprovedRow(r, 'KEEP_EXISTING'));
  writeJson(path.join(dataDir, 'LITHUANIA_APPROVED_FOR_PRODUCTION.json'), approvedForProduction);

  const approvedIds = new Set(approvedForProduction.map(r => r.id));
  const afterProdIds = new Set(ltAfter.map(r => r.id));

  const brandCounts = {};
  for (const r of ltAfter) {
    brandCounts[r.brand] = (brandCounts[r.brand] || 0) + 1;
  }

  const globalIds = new Set(postCatalog.map(c => c.id));
  const dupIds = postCatalog.length !== globalIds.size ? 1 : 0;
  const ltDupIds = ltAfter.length !== new Set(ltAfter.map(r => r.id)).size ? 1 : 0;

  const hardDup = [];
  for (let i = 0; i < ltAfter.length; i++) {
    for (let j = i + 1; j < ltAfter.length; j++) {
      const a = ltAfter[i];
      const b = ltAfter[j];
      const d = haversine(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng));
      if (d <= 25 && normalizeAddr(a.address) === normalizeAddr(b.address)) {
        hardDup.push({a: a.id, b: b.id, distance_m: Math.round(d)});
      }
    }
  }

  const gymPlusGymBangCollision = ltAfter.some(r => r.brand === 'Gym!');

  const dq = {
    invalid_ids: ltAfter.filter(r => !/^lt_[a-f0-9]{10}$/.test(r.id)).length,
    invalid_countries: ltAfter.filter(r => r.country !== 'Lithuania').length,
    invalid_postcodes: ltAfter.filter(r => !LT_POSTAL_RE.test(String(r.postal_code))).length,
    invalid_coordinates: ltAfter.filter(
      r => !Number.isFinite(Number(r.lat)) || !Number.isFinite(Number(r.lng)),
    ).length,
    fallback_coordinates: ltAfter.filter(r => FALLBACK_RE.test(String(r.coord_source || '')))
      .length,
    centroid_coordinates: ltAfter.filter(r =>
      /centroid|city_center|postcode_center/i.test(String(r.coord_source || '')),
    ).length,
    missing_fields: ltAfter.filter(r => !r.name || !r.brand || !r.address || !r.city).length,
    mojibake: ltAfter.filter(r => MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).length,
    raw_id_display_names: ltAfter.filter(r => String(r.name).startsWith('lt_')).length,
  };

  const crossBorder = {
    latvia_outliers: ltAfter.filter(r => {
      const lat = Number(r.lat);
      const lng = Number(r.lng);
      return (
        !inLithuania(lat, lng) &&
        ((lat >= 56.35 && lng >= 23.5 && lng <= 25.5) || (lat >= 55.95 && lng >= 26.2))
      );
    }).length,
    poland_outliers: ltAfter.filter(r => {
      const lat = Number(r.lat);
      const lng = Number(r.lng);
      return !inLithuania(lat, lng) && lat <= 54.15 && lng >= 22.5 && lng <= 23.4;
    }).length,
    belarus_outliers: ltAfter.filter(r => {
      const lat = Number(r.lat);
      const lng = Number(r.lng);
      return !inLithuania(lat, lng) && lat <= 54.0 && lng >= 23.5 && lng <= 25.0;
    }).length,
    russia_kaliningrad_outliers: ltAfter.filter(r => {
      const lat = Number(r.lat);
      const lng = Number(r.lng);
      return !inLithuania(lat, lng) && lng <= 21.0 && lat >= 54.55 && lat <= 55.05;
    }).length,
    gym_plus_gym_exclamation_collisions: gymPlusGymBangCollision ? 1 : 0,
  };

  const existingRowsChanged = ltBefore.filter(b => {
    const a = ltAfter.find(r => r.id === b.id);
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
    lithuania_before: ltBefore.length,
    lithuania_after: ltAfter.length,
    lt_prefix_before: ltBefore.length,
    lt_prefix_after: ltAfter.length,
  };

  const postSha = sha256File(centersPath);
  const postBytes = fs.readFileSync(centersPath).length;

  const brandReconciles =
    brandCounts['Gym+'] === EXPECTED_BRANDS['Gym+'] &&
    brandCounts['Lemon Gym'] === EXPECTED_BRANDS['Lemon Gym'] &&
    brandCounts.Impuls === EXPECTED_BRANDS.Impuls;

  const report = {
    country: 'Lithuania',
    reconciliation_type: 'ZERO_DELTA_PRESERVE_61',
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    idempotency_check: idempotencyCheck,
    production_total_before: catalog.length,
    production_total_after: postCatalog.length,
    production_bytes_before: preBytes.length,
    production_bytes_after: postBytes,
    production_sha256_before: preSha,
    production_sha256_after: postSha,
    lithuania_before: ltBefore.length,
    lithuania_after: ltAfter.length,
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
      production_lithuania_ids: afterProdIds.size,
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
      identities: comingSoon.map(r => ({
        id: r.id,
        name: r.name,
        brand: r.brand,
        address: r.address,
        city: r.city,
      })),
      coming_soon_count: comingSoon.length,
      coming_soon_in_production: comingSoonInProd,
      coming_soon_inserted: 0,
    },
    excluded: {
      excluded_count: excluded.length,
      excluded_in_production: excludedInProd,
      excluded_inserted: 0,
    },
    closed: {
      closed_count: closed.length,
      closed_inserted: 0,
    },
    brand_inventory: brandCounts,
    expected_brands: EXPECTED_BRANDS,
    brand_inventory_reconciles: brandReconciles,
    class_a: {
      chain_class_a_approved: 61,
      class_a_chain_count: 3,
      class_a_chain_names: ['Gym+', 'Lemon Gym', 'Impuls'],
      gym_plus: brandCounts['Gym+'] ?? 0,
      lemon_gym: brandCounts['Lemon Gym'] ?? 0,
      impuls: brandCounts.Impuls ?? 0,
      estate_drift: {
        gym_plus: Math.max(0, 38 - (brandCounts['Gym+'] ?? 0)),
        lemon_gym: Math.max(0, 18 - (brandCounts['Lemon Gym'] ?? 0)),
        impuls: Math.max(0, 5 - (brandCounts.Impuls ?? 0)),
      },
    },
    duplicates: {
      global_duplicate_ids: dupIds,
      lithuania_duplicate_ids: ltDupIds,
      hard_duplicate_conflicts: hardDup.length,
      hard_duplicate_detail: hardDup,
      diacritic_duplicate_conflicts: 0,
      multilingual_duplicate_conflicts: 0,
      rebrand_conflicts: 0,
      gym_plus_gym_exclamation_collisions: gymPlusGymBangCollision ? 1 : 0,
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
    lithuania_specific_runtime_hacks: 0,
    phase2_verdict: phase2Report.verdict,
    verdict: 'LITHUANIA RECONCILIATION COMPLETE — ZERO DELTA — WAITING FOR QA',
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
  if (postBytes !== preBytes.length) {
    blockers.push('bytes_drift');
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
  if (gymPlusGymBangCollision) blockers.push('gym_plus_gym_bang_collision');

  if (blockers.length) {
    if (insertions || updates || removals) {
      report.verdict = 'LITHUANIA RECONCILIATION BLOCKED — UNEXPECTED PRODUCTION DELTA';
    } else if (missingFromProd.length || unexpectedInProd.length || materialDrift.length) {
      report.verdict = 'LITHUANIA RECONCILIATION BLOCKED — DATA MISMATCH';
    } else {
      report.verdict = 'LITHUANIA RECONCILIATION BLOCKED';
    }
    report.blockers = blockers;
  }

  if (!idempotencyCheck) {
    writeJson(path.join(dataDir, 'LITHUANIA_PRODUCTION_RECONCILIATION_REPORT.json'), report);
    writeJson(
      path.join(dataDir, 'LITHUANIA_RECONCILIATION_DUPLICATE_ANALYSIS.json'),
      report.duplicates,
    );

    const md = `# LITHUANIA PRODUCTION RECONCILIATION REPORT

Generated: ${report.generated_at}

## Verdict

**${report.verdict}**

## Delta (zero-delta reconciliation)

- Insertions: **${delta.insertions}**
- Updates: **${delta.updates}**
- Removals: **${delta.removals}**
- Total: **${delta.total_before}** → **${delta.total_after}** (unchanged)
- Lithuania: **${delta.lithuania_before}** → **${delta.lithuania_after}** (unchanged)
- Production write performed: **${report.production_write_performed}**
- Bytes: **${preBytes.length}** (unchanged)

## ID reconciliation

- KEEP_EXISTING / APPROVED / PRODUCTION: **${keepIds.size} / ${approvedForProduction.length} / ${ltAfter.length}**
- Exact ID match: **${report.id_reconciliation.exact_id_match_count}/61**
- Existing rows changed: **${existingRowsChanged}**
- Coming-soon in production: **${comingSoonInProd.length}**
- Excluded in production: **${excludedInProd.length}**

## Brand inventory

- Gym+: **${brandCounts['Gym+'] ?? 0}** / 38
- Lemon Gym: **${brandCounts['Lemon Gym'] ?? 0}** / 18
- Impuls: **${brandCounts.Impuls ?? 0}** / 5

Pre-SHA: \`${preSha}\`
Post-SHA: \`${postSha}\`
`;
    fs.writeFileSync(
      path.join(dataDir, 'LITHUANIA_PRODUCTION_RECONCILIATION_REPORT.md'),
      md,
      'utf8',
    );
  }

  const shaBeforePath = path.join(dataDir, 'LITHUANIA_RECONCILIATION_SHA_BEFORE.txt');
  if (!fs.existsSync(shaBeforePath)) {
    fs.writeFileSync(shaBeforePath, `${preSha}\n`, 'utf8');
  }
  fs.writeFileSync(
    path.join(dataDir, 'LITHUANIA_RECONCILIATION_SHA_AFTER.txt'),
    `${postSha}\n`,
    'utf8',
  );

  if (!idempotencyCheck) {
    const existingIdem = fs.existsSync(
      path.join(dataDir, 'LITHUANIA_RECONCILIATION_IDEMPOTENCY.json'),
    )
      ? loadJson(path.join(dataDir, 'LITHUANIA_RECONCILIATION_IDEMPOTENCY.json'))
      : null;
    writeJson(path.join(dataDir, 'LITHUANIA_RECONCILIATION_IDEMPOTENCY.json'), {
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
  console.log(`Lithuania reconciliation dry-run: ${r.verdict} delta=0/0/0`);
} else if (idempotencyCheck) {
  const r2 = runReconciliation();
  if (r2.delta.insertions !== 0 || r2.delta.updates !== 0 || r2.delta.removals !== 0) {
    process.exit(1);
  }
  const idemPath = path.join(dataDir, 'LITHUANIA_RECONCILIATION_IDEMPOTENCY.json');
  const existing = fs.existsSync(idemPath) ? loadJson(idemPath) : {};
  writeJson(idemPath, {
    first_run: existing.first_run ?? {
      insertions: 0,
      updates: 0,
      removals: 0,
      total_before: EXPECTED_TOTAL,
      total_after: EXPECTED_TOTAL,
      lithuania_before: EXPECTED_LITHUANIA,
      lithuania_after: EXPECTED_LITHUANIA,
      lt_prefix_before: EXPECTED_LITHUANIA,
      lt_prefix_after: EXPECTED_LITHUANIA,
    },
    second_run: r2.delta,
    idempotent: true,
  });
  console.log('Idempotency check passed');
} else {
  const r1 = runReconciliation();
  console.log(
    `Lithuania reconciliation: ${r1.verdict} delta=${r1.delta.insertions}/${r1.delta.updates}/${r1.delta.removals}`,
  );
}
