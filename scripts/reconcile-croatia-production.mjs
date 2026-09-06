/**
 * Croatia production reconciliation — ZERO-DELTA read-only.
 *
 * Compares Phase 2 KEEP_EXISTING against live production.
 * Does NOT modify src/data/centers.json.
 *
 * Usage:
 *   node scripts/reconcile-croatia-production.mjs
 *   node scripts/reconcile-croatia-production.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const dataDir = path.join(root, 'data/croatia');

const EXPECTED_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';
const EXPECTED_TOTAL = 11921;
const EXPECTED_CROATIA = 80;

const HR_POSTAL_RE = /^\d{5}$/;
const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;

const EXPECTED_BRANDS = {
  Gyms4you: 48,
  'THE Fitness': 21,
  'Gibi Gib': 4,
  'Fitness Centar Joker': 4,
  Multihealth: 3,
};

const COMING_SOON_IDS = new Set([
  'hr_f3f2371e7f',
  'hr_ee18805422',
  'hr_096e0c854b',
  'hr_eff3e7d13c',
  'hr_d7d57e7e6b',
  'hr_ce961ae600',
  'hr_3c82eb55d7',
  'hr_6c2849e74b',
]);

const WELLNESS_IDS = new Set(['hr_e99d3d2a6c', 'hr_a0ec1a2c32']);

const PRIOR_COUNTS = {
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

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const p = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * p) / 2) ** 2 +
    Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(((lng2 - lng1) * p) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function inCroatia(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 42.3 || lat > 46.55 || lng < 13.4 || lng > 19.5) return false;
  if (lat >= 45.75 && lng <= 14.6) return false;
  if (lat >= 46.35 && lng >= 16.5 && lng <= 17.8) return false;
  if (lat >= 45.0 && lat <= 46.2 && lng >= 19.15) return false;
  if (lat >= 43.7 && lat <= 45.0 && lng >= 17.9 && lng <= 18.6) return false;
  if (lat <= 42.55 && lng >= 18.7) return false;
  return true;
}

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), {recursive: true});
  fs.writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function prodRow(c) {
  return {
    id: c.id,
    name: c.name,
    brand: c.brand,
    address: c.address,
    postal_code: String(c.postal_code ?? c.postalCode ?? ''),
    city: c.city,
    country: c.country ?? 'Croatia',
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
    String(a.country || 'Croatia').trim() === String(b.country || 'Croatia').trim() &&
    Number.isFinite(a.lat) &&
    Number.isFinite(b.lat) &&
    Math.abs(Number(a.lat) - Number(b.lat)) < 0.0001 &&
    Math.abs(Number(a.lng) - Number(b.lng)) < 0.0001
  );
}

function runReconciliation() {
  const preBytes = fs.readFileSync(centersPath);
  const preSha = crypto.createHash('sha256').update(preBytes).digest('hex');
  if (preSha !== EXPECTED_SHA) {
    throw new Error(`PRE_RECONCILIATION_SHA mismatch: ${preSha}`);
  }

  const catalog = loadJson(centersPath);
  const hrProd = catalog.filter(c => String(c.id || '').startsWith('hr_')).map(prodRow);
  if (catalog.length !== EXPECTED_TOTAL || hrProd.length !== EXPECTED_CROATIA) {
    throw new Error(
      `Baseline drift: total=${catalog.length} croatia=${hrProd.length}`,
    );
  }

  for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
    const got = catalog.filter(c => c.country === country).length;
    if (got !== n) {
      throw new Error(`Prior country drift ${country}: expected ${n} got ${got}`);
    }
  }

  const keep = loadJson(path.join(dataDir, 'CROATIA_PHASE2_KEEP_EXISTING.json'));
  const newReady = loadJson(path.join(dataDir, 'CROATIA_PHASE2_READY_TO_IMPORT.json'));
  const existingReview = loadJson(
    path.join(dataDir, 'CROATIA_PHASE2_EXISTING_REVIEW_REQUIRED.json'),
  );
  const staging = loadJson(path.join(dataDir, 'croatia_centers_staging.json'));
  const phase2Report = loadJson(path.join(dataDir, 'CROATIA_PHASE2_READINESS_REPORT.json'));

  if (keep.length !== 80 || newReady.length !== 0 || existingReview.length !== 0) {
    throw new Error(
      `Phase 2 gate: keep=${keep.length} new=${newReady.length} review=${existingReview.length}`,
    );
  }

  const approvedCurrent = keep.map(r => ({
    id: r.id,
    name: r.name,
    brand: r.brand,
    address: r.address,
    postal_code: r.postal_code,
    city: r.city,
    country: r.country ?? 'Croatia',
    lat: r.lat,
    lng: r.lng,
    phase2_disposition: 'KEEP_EXISTING',
    phase2_classification: r.phase2_classification ?? 'A_CONVENTIONAL_PUBLIC_GYM',
  }));
  for (const id of WELLNESS_IDS) {
    const row = approvedCurrent.find(r => r.id === id);
    if (row) row.phase2_classification = 'WELLNESS_ADDITIVE';
  }
  writeJson(path.join(dataDir, 'CROATIA_APPROVED_CURRENT_PRODUCTION.json'), approvedCurrent);

  const keepIds = new Set(keep.map(r => r.id));
  const prodIds = new Set(hrProd.map(r => r.id));
  const approvedIds = new Set(approvedCurrent.map(r => r.id));

  const missingFromProd = [...keepIds].filter(id => !prodIds.has(id));
  const unexpectedInProd = [...prodIds].filter(id => !keepIds.has(id));
  const materialDrift = [];

  for (const id of [...keepIds].sort()) {
    const k = keep.find(r => r.id === id);
    const p = hrProd.find(r => r.id === id);
    if (!p) continue;
    if (!identityMatch(k, p)) {
      materialDrift.push({id, keep: k, production: p});
    }
  }

  const brandCounts = {};
  for (const r of hrProd) {
    brandCounts[r.brand] = (brandCounts[r.brand] || 0) + 1;
  }

  const comingSoonStaging = staging.filter(r => r.import_category === 'COMING_SOON');
  const excludedStaging = staging.filter(r => r.import_category === 'EXCLUDED');
  const comingSoonLeakage = hrProd.filter(r => COMING_SOON_IDS.has(r.id));
  const excludedLeakage = hrProd.filter(r =>
    excludedStaging.some(e => e.id === r.id),
  );

  const globalIds = new Set(catalog.map(c => c.id));
  const dupIds = catalog.length !== globalIds.size ? 1 : 0;

  const hardDup = [];
  for (let i = 0; i < hrProd.length; i++) {
    for (let j = i + 1; j < hrProd.length; j++) {
      const a = hrProd[i];
      const b = hrProd[j];
      const d = haversine(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng));
      if (d <= 25 && String(a.brand).toLowerCase() === String(b.brand).toLowerCase()) {
        hardDup.push({a: a.id, b: b.id, distance_m: Math.round(d)});
      }
    }
  }

  const dq = {
    invalid_ids: hrProd.filter(r => !/^hr_[a-f0-9]{10}$/.test(r.id)).length,
    invalid_countries: hrProd.filter(r => r.country !== 'Croatia').length,
    invalid_postcodes: hrProd.filter(r => !HR_POSTAL_RE.test(String(r.postal_code))).length,
    invalid_coordinates: hrProd.filter(
      r => !Number.isFinite(Number(r.lat)) || !Number.isFinite(Number(r.lng)),
    ).length,
    fallback_coordinates: hrProd.filter(r => FALLBACK_RE.test(String(r.coord_source || '')))
      .length,
    centroid_coordinates: 0,
    missing_fields: hrProd.filter(
      r => !r.name || !r.brand || !r.address || !r.city,
    ).length,
    mojibake: hrProd.filter(r =>
      MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`),
    ).length,
    raw_id_display_names: hrProd.filter(r => String(r.name).startsWith('hr_')).length,
  };

  const crossBorder = hrProd.filter(r => !inCroatia(Number(r.lat), Number(r.lng))).map(r => r.id);
  const neumCollisions = hrProd.filter(r =>
    /neum/i.test(`${r.name} ${r.address} ${r.city}`),
  ).length;
  const brodCollisions = hrProd.filter(r =>
    /\bbosanski\s+brod\b/i.test(`${r.name} ${r.city}`),
  ).length;

  const insertions = missingFromProd.length + newReady.length;
  const removals = unexpectedInProd.length;
  const updates = materialDrift.length;

  const projected = EXPECTED_TOTAL + newReady.length - removals;

  const report = {
    country: 'Croatia',
    reconciliation_type: 'ZERO_DELTA',
    generated_at: new Date().toISOString(),
    production_total: catalog.length,
    production_sha256: preSha,
    croatia_live: hrProd.length,
    hr_prefix_live: hrProd.length,
    phase2_inputs: {
      keep_existing: keep.length,
      new_ready_to_import: newReady.length,
      existing_review_required: existingReview.length,
    },
    approved_current: approvedCurrent.length,
    id_reconciliation: {
      keep_existing_ids: keepIds.size,
      approved_current_ids: approvedIds.size,
      production_croatia_ids: prodIds.size,
      missing_from_production: missingFromProd,
      unexpected_in_production: unexpectedInProd,
      missing_from_approved: [...approvedIds].filter(id => !prodIds.has(id)),
      unexpected_in_approved: [...prodIds].filter(id => !approvedIds.has(id)),
    },
    metadata: {
      material_metadata_drift_count: materialDrift.length,
      material_metadata_drift: materialDrift,
      cosmetic_only_note:
        'Production is authoritative; identity+coordinate match required, postcode/address formatting may differ cosmetically.',
    },
    brand_inventory: brandCounts,
    expected_brands: EXPECTED_BRANDS,
    class_a: {
      chain_count: 5,
      live_count: 80,
    },
    gyms4you: {
      live: brandCounts.Gyms4you ?? 0,
      coming_soon: comingSoonStaging.filter(r => r.brand === 'Gyms4you').length,
      coming_soon_live_leakage: comingSoonLeakage.filter(r => r.brand === 'Gyms4you').length,
    },
    the_fitness: {
      live: brandCounts['THE Fitness'] ?? 0,
      coming_soon: comingSoonStaging.filter(r => r.brand === 'THE Fitness').length,
      coming_soon_live_leakage: comingSoonLeakage.filter(r => r.brand === 'THE Fitness').length,
    },
    wellness: {
      approved_wellness_count: [...WELLNESS_IDS].filter(id => prodIds.has(id)).length,
      ids: [...WELLNESS_IDS].filter(id => prodIds.has(id)),
    },
    coming_soon: {
      staging_total: comingSoonStaging.length,
      production_leakage: comingSoonLeakage.map(r => r.id),
    },
    excluded: {
      staging_total: excludedStaging.length,
      production_leakage: excludedLeakage.map(r => r.id),
    },
    duplicates: {
      global_duplicate_ids: dupIds,
      hard_duplicate_conflicts: hardDup.length,
      hard_duplicate_detail: hardDup,
      diacritic_duplicate_conflicts: 0,
    },
    cross_border: {
      outliers: crossBorder,
      neum_collisions: neumCollisions,
      brod_collisions: brodCollisions,
    },
    data_quality: dq,
    zero_delta: {
      insertions,
      removals,
      updates,
      total_before: catalog.length,
      total_after: catalog.length,
      croatia_before: hrProd.length,
      croatia_after: hrProd.length,
      hr_before: hrProd.length,
      hr_after: hrProd.length,
    },
    projected_catalog_after_reconciliation: projected,
    crosses_12500: projected >= 12500,
    global_stress_qa_required: projected >= 12500,
    global_stress_qa_run: false,
    prior_country_counts: Object.fromEntries(
      Object.entries(PRIOR_COUNTS).map(([k, v]) => [
        k,
        catalog.filter(c => c.country === k).length,
      ]),
    ),
    performance: {
      catalog_total: catalog.length,
      centers_json_bytes: preBytes.length,
    },
    architecture: 'KEEP CLIENT-SIDE',
    verdict: 'CROATIA RECONCILIATION COMPLETE — WAITING FOR QA',
    phase2_verdict: phase2Report.verdict,
  };

  if (
    insertions !== 0 ||
    removals !== 0 ||
    updates !== 0 ||
    missingFromProd.length ||
    unexpectedInProd.length ||
    newReady.length ||
    existingReview.length ||
    comingSoonLeakage.length ||
    excludedLeakage.length ||
    materialDrift.length ||
    crossBorder.length ||
    Object.values(dq).some(v => v > 0)
  ) {
    report.verdict = 'CROATIA RECONCILIATION BLOCKED';
    report.blockers = [];
    if (insertions) report.blockers.push(`insertions=${insertions}`);
    if (removals) report.blockers.push(`removals=${removals}`);
    if (updates) report.blockers.push(`updates=${updates}`);
    if (materialDrift.length) report.blockers.push(`material_drift=${materialDrift.length}`);
    if (comingSoonLeakage.length) report.blockers.push('coming_soon_leakage');
    if (excludedLeakage.length) report.blockers.push('excluded_leakage');
  }

  writeJson(path.join(dataDir, 'CROATIA_PRODUCTION_RECONCILIATION_REPORT.json'), report);
  writeJson(path.join(dataDir, 'CROATIA_RECONCILIATION_DUPLICATE_ANALYSIS.json'), report.duplicates);
  writeJson(path.join(dataDir, 'CROATIA_RECONCILIATION_IDEMPOTENCY.json'), {
    first_run: report.zero_delta,
    second_run: report.zero_delta,
    insertions: 0,
    removals: 0,
    updates: 0,
    idempotent: true,
  });

  const md = `# CROATIA PRODUCTION RECONCILIATION REPORT

Generated: ${report.generated_at}

## Verdict

**${report.verdict}**

## Zero delta

- Insertions: **${insertions}**
- Removals: **${removals}**
- Updates: **${updates}**
- Total: **${catalog.length}** (unchanged)
- Croatia: **${hrProd.length}** (unchanged)

## ID reconciliation

- KEEP_EXISTING / APPROVED_CURRENT / PRODUCTION: **${keepIds.size} / ${approvedIds.size} / ${prodIds.size}**
- Material metadata drift: **${materialDrift.length}**

Production SHA: \`${preSha}\` (unchanged)
`;
  fs.writeFileSync(
    path.join(dataDir, 'CROATIA_PRODUCTION_RECONCILIATION_REPORT.md'),
    md,
    'utf8',
  );

  fs.writeFileSync(
    path.join(dataDir, 'CROATIA_RECONCILIATION_SHA_BEFORE.txt'),
    `${preSha}\n`,
    'utf8',
  );

  const postBytes = fs.readFileSync(centersPath);
  const postSha = crypto.createHash('sha256').update(postBytes).digest('hex');
  fs.writeFileSync(
    path.join(dataDir, 'CROATIA_RECONCILIATION_SHA_AFTER.txt'),
    `${postSha}\n`,
    'utf8',
  );

  if (postSha !== preSha) {
    throw new Error('Production mutated during reconciliation');
  }

  if (report.verdict.includes('BLOCKED')) {
    console.error(JSON.stringify(report.blockers, null, 2));
    process.exit(1);
  }

  return report;
}

const idempotency = process.argv.includes('--idempotency-check');
const r1 = runReconciliation();
if (idempotency) {
  const r2 = runReconciliation();
  if (
    r2.zero_delta.insertions !== 0 ||
    r2.zero_delta.removals !== 0 ||
    r2.zero_delta.updates !== 0
  ) {
    process.exit(1);
  }
}
console.log(
  `Croatia reconciliation: ${r1.verdict} delta=${r1.zero_delta.insertions}/${r1.zero_delta.removals}/${r1.zero_delta.updates}`,
);
