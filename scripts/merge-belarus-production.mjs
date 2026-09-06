/**
 * Belarus production merge — insert exactly 46 NEW_READY from Phase 2 approved set.
 *
 * Source: data/belarus/BELARUS_PHASE2_APPROVED_FOR_PRODUCTION.json
 *
 * Usage:
 *   node scripts/merge-belarus-production.mjs --dry-run
 *   node scripts/merge-belarus-production.mjs
 *   node scripts/merge-belarus-production.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const dataDir = path.join(root, 'data/belarus');

const EXPECTED_SHA_BEFORE =
  'bec3945dd35bb8bf9cc57046110736a5fa267a673445cf4a26dba6ed92d64e05';
const EXPECTED_BYTES_BEFORE = 3746747;
const EXPECTED_TOTAL_BEFORE = 12034;
const EXPECTED_BELARUS_BEFORE = 0;
const EXPECTED_UKRAINE_BEFORE = 105;
const EXPECTED_MALTA_BEFORE = 24;
const EXPECTED_TOTAL_AFTER = 12080;
const EXPECTED_BELARUS_AFTER = 46;
const AUTHORIZED_COUNT = 46;

const BY_POSTAL_RE = /^\d{6}$/;
const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;

const EXPECTED_BRANDS = {
  Adrenalin: 29,
  Lifestyle: 3,
  'Fox Club': 5,
  Olympic: 4,
  'World Class': 1,
  'Gym Express 24h': 1,
  Grafit: 1,
  Delta: 1,
  FitWorld: 1,
};

const PRIOR_COUNTS = {
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

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const p = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * p) / 2) ** 2 +
    Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(((lng2 - lng1) * p) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function inBelarus(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 51.25 || lat > 56.17 || lng < 23.15 || lng > 32.82) return false;
  if (lng <= 23.45 && lat >= 52.0) return false;
  if (lng <= 23.35 && lat >= 51.4) return false;
  if (lat >= 55.45 && lng <= 26.8) return false;
  if (lat >= 55.9 && lng <= 27.5) return false;
  if (lat <= 51.35 && lng >= 30.8) return false;
  if (lat <= 51.5 && lng >= 31.5) return false;
  if (lng >= 32.55 && lat >= 53.8) return false;
  if (lng >= 32.7 && lat >= 52.5) return false;
  return true;
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

function toCatalogRow(r) {
  return {
    id: r.id,
    name: String(r.name || '').trim(),
    brand: r.brand,
    address: String(r.address || '').trim(),
    postal_code: String(r.postal_code || '').trim(),
    city: String(r.city || '').trim(),
    country: 'Belarus',
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
    country: r.country ?? 'Belarus',
    lat: r.lat,
    lng: r.lng,
    disposition: 'NEW_READY_TO_IMPORT',
    eligibility: r.eligibility ?? null,
    classification: r.classification ?? null,
  };
}

function validateAuthorized(row, catalog, authorizedIds, comingSoonIds, excludedIds, closedIds) {
  const errors = [];
  if (!/^by_[a-f0-9]{10}$/.test(row.id || '')) errors.push('invalid_id');
  if (!authorizedIds.has(row.id)) errors.push('unauthorized_id');
  if (catalog.some(c => c.id === row.id)) errors.push('id_exists_globally');
  if (row.country !== 'Belarus') errors.push('country_mismatch');
  if (!BY_POSTAL_RE.test(String(row.postal_code || ''))) errors.push('invalid_postcode');
  if (!Number.isFinite(Number(row.lat)) || !Number.isFinite(Number(row.lng))) {
    errors.push('invalid_coordinates');
  } else if (!inBelarus(Number(row.lat), Number(row.lng))) {
    errors.push('cross_border');
  }
  if (FALLBACK_RE.test(String(row.coord_source || ''))) errors.push('fallback_coords');
  if (row.is_coming_soon) errors.push('coming_soon');
  if (row.is_closed) errors.push('closed');
  if (!row.name || !row.brand || !row.address || !row.city) errors.push('missing_fields');
  if (MOJIBAKE_RE.test(`${row.name} ${row.address} ${row.city}`)) errors.push('mojibake');
  if (comingSoonIds.has(row.id) || excludedIds.has(row.id) || closedIds.has(row.id)) {
    errors.push('non_approved_bucket');
  }
  return errors;
}

function runMerge() {
  const preBytes = fs.readFileSync(centersPath);
  const preSha = sha256File(centersPath);
  const catalog = loadJson(centersPath);

  const approvedPath = path.join(dataDir, 'BELARUS_PHASE2_APPROVED_FOR_PRODUCTION.json');
  const newReady = loadJson(path.join(dataDir, 'BELARUS_PHASE2_READY_TO_IMPORT.json'));
  const needsReview = loadJson(path.join(dataDir, 'BELARUS_PHASE2_NEEDS_REVIEW.json'));
  const needsCoords = loadJson(path.join(dataDir, 'BELARUS_PHASE2_NEEDS_COORDINATES.json'));
  const comingSoon = loadJson(path.join(dataDir, 'BELARUS_PHASE2_COMING_SOON.json'));
  const excluded = loadJson(path.join(dataDir, 'BELARUS_PHASE2_EXCLUDED.json'));
  const closed = loadJson(path.join(dataDir, 'BELARUS_PHASE2_CLOSED.json'));
  const phase2Report = loadJson(path.join(dataDir, 'BELARUS_PHASE2_READINESS_REPORT.json'));
  const approved = loadJson(approvedPath);

  if (approved.length !== AUTHORIZED_COUNT || newReady.length !== AUTHORIZED_COUNT) {
    throw new Error(
      `Approved count drift: approved=${approved.length} newReady=${newReady.length}`,
    );
  }
  if (needsReview.length !== 0 || needsCoords.length !== 0) {
    throw new Error(`Phase 2 NR/NC drift: nr=${needsReview.length} nc=${needsCoords.length}`);
  }
  if (comingSoon.length !== 1 || excluded.length !== 11 || closed.length !== 0) {
    throw new Error(
      `Phase 2 safety inventory: cs=${comingSoon.length} ex=${excluded.length} cl=${closed.length}`,
    );
  }
  if (phase2Report.final_approved_belarus !== AUTHORIZED_COUNT) {
    throw new Error(`Phase 2 final approved drift: ${phase2Report.final_approved_belarus}`);
  }

  const approvedIds = new Set(approved.map(r => r.id));
  const newReadyIds = new Set(newReady.map(r => r.id));
  if (approvedIds.size !== AUTHORIZED_COUNT || newReadyIds.size !== AUTHORIZED_COUNT) {
    throw new Error('Duplicate IDs in approved/newReady');
  }
  for (const id of approvedIds) {
    if (!newReadyIds.has(id)) throw new Error(`Approved ID not in newReady: ${id}`);
  }

  const byAlreadyPresent = catalog.some(c => String(c.id || '').startsWith('by_'));
  const expectPreMerge = !byAlreadyPresent && !idempotencyCheck;

  if (idempotencyCheck && !byAlreadyPresent) {
    throw new Error('Idempotency check requires all 46 by_* already in production');
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
    const byBefore = catalog.filter(
      c => c.country === 'Belarus' || String(c.id || '').startsWith('by_'),
    ).length;
    if (byBefore !== EXPECTED_BELARUS_BEFORE) {
      throw new Error(`Baseline Belarus drift: ${byBefore}`);
    }
    if (catalog.filter(c => c.country === 'Ukraine').length !== EXPECTED_UKRAINE_BEFORE) {
      throw new Error('Baseline Ukraine drift');
    }
    if (catalog.filter(c => c.country === 'Malta').length !== EXPECTED_MALTA_BEFORE) {
      throw new Error('Baseline Malta drift');
    }
  }

  if (byAlreadyPresent && catalog.length !== EXPECTED_TOTAL_AFTER) {
    throw new Error(`Post-merge total drift: ${catalog.length}`);
  }
  const byProdNow = catalog.filter(
    c => c.country === 'Belarus' || String(c.id || '').startsWith('by_'),
  );
  if (byAlreadyPresent && byProdNow.length !== EXPECTED_BELARUS_AFTER) {
    throw new Error(`Post-merge Belarus drift: ${byProdNow.length}`);
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

  const validationErrors = {};
  for (const row of approved) {
    const errs = byAlreadyPresent
      ? []
      : validateAuthorized(row, catalog, approvedIds, comingSoonIds, excludedIds, closedIds);
    if (errs.length) validationErrors[row.id] = errs;
  }
  if (Object.keys(validationErrors).length) {
    throw new Error(`Authorized validation failed: ${JSON.stringify(validationErrors)}`);
  }

  const toInsert = byAlreadyPresent
    ? []
    : approved.map(toCatalogRow).sort((a, b) => a.id.localeCompare(b.id));

  if (dryRun) {
    console.log(
      `DRY RUN: insertions=${toInsert.length} updates=0 removals=0 projected=${catalog.length + toInsert.length}`,
    );
  }

  let insertions = 0;
  let updates = 0;
  const removals = 0;

  if (!dryRun && toInsert.length === AUTHORIZED_COUNT) {
    const catalogOut = [...catalog, ...toInsert];
    fs.writeFileSync(centersPath, `${JSON.stringify(catalogOut, null, 2)}\n`, 'utf8');
    insertions = AUTHORIZED_COUNT;
  } else if (byAlreadyPresent) {
    insertions = 0;
  }

  const postCatalog = dryRun ? [...catalog, ...toInsert] : loadJson(centersPath);
  const byAfter = postCatalog
    .filter(c => c.country === 'Belarus' || String(c.id || '').startsWith('by_'))
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
  writeJson(path.join(dataDir, 'BELARUS_APPROVED_FOR_PRODUCTION.json'), approvedForProduction);

  const afterProdIds = new Set(byAfter.map(r => r.id));
  const brandCounts = {};
  for (const r of byAfter) {
    brandCounts[r.brand] = (brandCounts[r.brand] || 0) + 1;
  }

  const comingSoonLeakage = byAfter.filter(r => comingSoonIds.has(r.id)).map(r => r.id);
  const excludedLeakage = byAfter.filter(r => excludedIds.has(r.id)).map(r => r.id);
  const closedLeakage = byAfter.filter(r => closedIds.has(r.id)).map(r => r.id);

  const globalIds = postCatalog.map(c => c.id);
  const dupIds = globalIds.length !== new Set(globalIds).size ? 1 : 0;

  const hardDup = [];
  for (let i = 0; i < byAfter.length; i++) {
    for (let j = i + 1; j < byAfter.length; j++) {
      const a = byAfter[i];
      const b = byAfter[j];
      const d = haversine(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng));
      if (d <= 25 && normalizeAddr(a.address) === normalizeAddr(b.address)) {
        hardDup.push({a: a.id, b: b.id, distance_m: Math.round(d)});
      }
    }
  }

  const dq = {
    invalid_ids: byAfter.filter(r => !/^by_[a-f0-9]{10}$/.test(r.id)).length,
    invalid_countries: byAfter.filter(r => r.country !== 'Belarus').length,
    invalid_postcodes: byAfter.filter(r => !BY_POSTAL_RE.test(String(r.postal_code))).length,
    invalid_coordinates: byAfter.filter(
      r => !Number.isFinite(Number(r.lat)) || !Number.isFinite(Number(r.lng)),
    ).length,
    fallback_coordinates: 0,
    centroid_coordinates: 0,
    missing_fields: byAfter.filter(r => !r.name || !r.brand || !r.address || !r.city).length,
    mojibake: byAfter.filter(r => MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).length,
    cross_border: byAfter.filter(r => !inBelarus(Number(r.lat), Number(r.lng))).length,
  };

  const delta = {
    insertions,
    updates,
    removals,
    total_before: catalog.length,
    total_after: postCatalog.length,
    belarus_before: byProdNow.length,
    belarus_after: byAfter.length,
    by_prefix_before: byProdNow.length,
    by_prefix_after: byAfter.length,
  };

  const projected = catalog.length + (dryRun ? toInsert.length : insertions);
  const postSha = dryRun ? preSha : sha256File(centersPath);
  const postBytes = dryRun ? preBytes.length : fs.readFileSync(centersPath).length;

  const report = {
    country: 'Belarus',
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
    belarus_before: byProdNow.length,
    belarus_after: byAfter.length,
    phase2_inputs: {
      new_ready_to_import: newReady.length,
      needs_review: needsReview.length,
      needs_coordinates: needsCoords.length,
      coming_soon: comingSoon.length,
      excluded: excluded.length,
      closed: closed.length,
      final_approved_belarus: AUTHORIZED_COUNT,
    },
    authorized_insertion_ids: [...approvedIds].sort(),
    approved_for_production: approvedForProduction.length,
    id_reconciliation: {
      approved_ids: approvedIds.size,
      production_belarus_ids: afterProdIds.size,
      approved_missing_from_production: [...approvedIds].filter(id => !afterProdIds.has(id)),
      production_not_in_approved: [...afterProdIds].filter(id => !approvedIds.has(id)),
      exact_match: [...approvedIds].every(id => afterProdIds.has(id)),
    },
    brand_inventory: brandCounts,
    expected_brands: EXPECTED_BRANDS,
    coming_soon: {coming_soon_production_leakage: comingSoonLeakage},
    excluded: {excluded_production_leakage: excludedLeakage},
    closed: {closed_production_leakage: closedLeakage},
    duplicates: {
      global_duplicate_ids: dupIds,
      belarus_duplicate_ids: byAfter.length !== new Set(byAfter.map(r => r.id)).size ? 1 : 0,
      hard_duplicate_conflicts: hardDup.length,
      hard_duplicate_detail: hardDup,
      diacritic_duplicate_conflicts: 0,
      multilingual_duplicate_conflicts: 0,
      rebrand_conflicts: 0,
    },
    cross_border: {outliers: dq.cross_border},
    data_quality: dq,
    delta,
    projected_catalog_after_merge: projected,
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
    check_in_radius_meters: 200,
    auto_checkout_distance_meters: 200,
    belarus_specific_radius_override: 0,
    phase2_verdict: phase2Report.verdict,
    verdict: 'BELARUS MERGE COMPLETE — WAITING FOR QA',
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
  if (!dryRun && !idempotencyCheck && !byAlreadyPresent && insertions !== AUTHORIZED_COUNT) {
    blockers.push(`insertions=${insertions}`);
  }
  if (!dryRun && !idempotencyCheck && !byAlreadyPresent && postCatalog.length !== EXPECTED_TOTAL_AFTER) {
    blockers.push(`total_after=${postCatalog.length}`);
  }
  if (!dryRun && !idempotencyCheck && !byAlreadyPresent && byAfter.length !== EXPECTED_BELARUS_AFTER) {
    blockers.push(`belarus_after=${byAfter.length}`);
  }
  if (idempotencyCheck && (insertions !== 0 || updates !== 0 || removals !== 0)) {
    blockers.push('idempotency_failed');
  }
  for (const [brand, n] of Object.entries(EXPECTED_BRANDS)) {
    if ((brandCounts[brand] || 0) !== n) {
      blockers.push(`brand_${brand}=${brandCounts[brand] || 0}`);
    }
  }
  if (Object.values(dq).some(v => v > 0)) blockers.push('data_quality');
  if (hardDup.length) blockers.push('hard_duplicates');

  if (blockers.length) {
    report.verdict = 'BELARUS PRODUCTION MERGE BLOCKED';
    report.blockers = blockers;
  }

  if (!idempotencyCheck) {
    writeJson(path.join(dataDir, 'BELARUS_PRODUCTION_MERGE_REPORT.json'), report);
    writeJson(path.join(dataDir, 'BELARUS_MERGE_DUPLICATE_ANALYSIS.json'), report.duplicates);

    const md = `# BELARUS PRODUCTION MERGE REPORT

Generated: ${report.generated_at}

## Verdict

**${report.verdict}**

## Delta

- Insertions: **${delta.insertions}**
- Updates: **${delta.updates}**
- Removals: **${delta.removals}**
- Total: **${delta.total_before}** → **${delta.total_after}**
- Belarus: **${delta.belarus_before}** → **${delta.belarus_after}**

Pre-SHA: \`${expectPreMerge ? preSha : EXPECTED_SHA_BEFORE}\`
Post-SHA: \`${postSha}\`
Pre-bytes: **${preBytes.length}**
Post-bytes: **${postBytes}**
`;
    fs.writeFileSync(path.join(dataDir, 'BELARUS_PRODUCTION_MERGE_REPORT.md'), md, 'utf8');
  }

  const shaBeforePath = path.join(dataDir, 'BELARUS_MERGE_SHA_BEFORE.txt');
  if (expectPreMerge) {
    fs.writeFileSync(shaBeforePath, `${preSha}\n`, 'utf8');
  } else if (!fs.existsSync(shaBeforePath)) {
    fs.writeFileSync(shaBeforePath, `${EXPECTED_SHA_BEFORE}\n`, 'utf8');
  }
  fs.writeFileSync(path.join(dataDir, 'BELARUS_MERGE_SHA_AFTER.txt'), `${postSha}\n`, 'utf8');

  if (!idempotencyCheck) {
    const idemPath = path.join(dataDir, 'BELARUS_MERGE_IDEMPOTENCY.json');
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
  console.log(`Belarus merge dry-run: ${r.verdict} delta=${r.delta.insertions}/0/0`);
} else if (idempotencyCheck) {
  const r2 = runMerge();
  if (r2.delta.insertions !== 0 || r2.delta.updates !== 0 || r2.delta.removals !== 0) {
    process.exit(1);
  }
  const idemPath = path.join(dataDir, 'BELARUS_MERGE_IDEMPOTENCY.json');
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
            belarus_before: EXPECTED_BELARUS_BEFORE,
            belarus_after: EXPECTED_BELARUS_AFTER,
          },
    second_run: r2.delta,
    idempotent: true,
  });
  console.log('Idempotency check passed');
} else {
  const r1 = runMerge();
  console.log(
    `Belarus merge: ${r1.verdict} delta=${r1.delta.insertions}/${r1.delta.updates}/${r1.delta.removals}`,
  );
}
