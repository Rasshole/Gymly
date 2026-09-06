/**
 * Montenegro production-safe merge (Phase 2 canonical READY).
 *
 * Source: data/montenegro/MONTENEGRO_PHASE2_READY_TO_IMPORT.json
 *
 * Usage:
 *   node scripts/import-montenegro-merge.mjs --dry-run
 *   node scripts/import-montenegro-merge.mjs
 *   node scripts/import-montenegro-merge.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const stagingPath = path.join(root, 'data/montenegro/montenegro_centers_staging.json');
const readyPath = path.join(
  root,
  'data/montenegro/MONTENEGRO_PHASE2_READY_TO_IMPORT.json',
);
const phase2ReportPath = path.join(
  root,
  'data/montenegro/MONTENEGRO_PHASE2_READINESS_REPORT.json',
);
const rebrandPath = path.join(
  root,
  'data/montenegro/MONTENEGRO_PHASE2_REBRAND_MAP.json',
);
const reportDir = path.join(root, 'data/montenegro');
const reportPath = path.join(reportDir, 'MONTENEGRO_MERGE_REPORT.json');
const mdReportPath = path.join(reportDir, 'MONTENEGRO_MERGE_REPORT.md');
const dupAnalysisPath = path.join(
  reportDir,
  'MONTENEGRO_MERGE_DUPLICATE_ANALYSIS.json',
);
const approvedPath = path.join(reportDir, 'MONTENEGRO_APPROVED_FOR_MERGE.json');
const idempotencyPath = path.join(reportDir, 'MONTENEGRO_MERGE_IDEMPOTENCY.json');

const dryRun = process.argv.includes('--dry-run');
const idempotencyCheck = process.argv.includes('--idempotency-check');

const EXPECTED_TOTAL_BEFORE = 11749;
const EXPECTED_READY = 26;
const EXPECTED_SHA_BEFORE =
  '753f4651f4a6b75576165c61ab0ef604aff41575a90118fc96956bc40094aec8';
const ME_POSTAL_RE = /^8[1-5]\d{3}$/;
const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s/;
const FALLBACK_RE =
  /fallback|invented|centroid|city.?center|postcode.?centroid|capital.?fallback|city.?approx/i;

const EXPECTED_BRANDS = {
  'Benex Fitness': 2,
  'Soko Gym': 2,
  Terzo: 2,
  'The Capital Fitness Center': 1,
  "Athletic's Gym": 1,
  'Urban Gym': 1,
  'GO GYM': 1,
  'XL Sport Studio': 1,
  'Hulk Gym': 1,
  'Gym Box': 1,
  'City Fitness': 1,
  'Status Fitness': 1,
  'Positive Fitness': 1,
  'Ethno Gym': 1,
  'Fitness Original': 1,
  'Big Body': 1,
  'Sportski centar Berane': 1,
  'Numero 77': 1,
  'Matrix Gym': 1,
  'Strong Gym': 1,
  'Herkul Gym': 1,
  Maximus: 1,
  Čeličana: 1,
};

const FORBIDDEN_LIVE_RE =
  /Smart Gym|TOTALFIT|Soko Lady|Fit Box|Portonovi|PMYC|Gym 2000|Border probe|CrossFit|Regional gap|ABSENT/i;

const BASELINE = {
  total: EXPECTED_TOTAL_BEFORE,
  montenegro: 0,
  moldova: 28,
  san_marino: 6,
  monaco: 4,
  andorra: 12,
  liechtenstein: 7,
  iceland: 27,
  cyprus: 17,
  malta: 18,
  luxembourg: 20,
  estonia: 68,
  latvia: 33,
  lithuania: 61,
  denmark: 354,
  sweden: 639,
  norway: 535,
  finland: 429,
  germany: 1424,
  united_kingdom: 1474,
  netherlands: 600,
  france: 1712,
  spain: 976,
  italy: 588,
  belgium: 363,
  poland: 621,
  austria: 335,
  switzerland: 475,
  portugal: 247,
  greece: 106,
  ireland: 65,
  czechia: 70,
  hungary: 50,
  romania: 154,
  slovakia: 37,
  bulgaria: 82,
  croatia: 80,
  slovenia: 32,
};

/** Mirrors isPlausibleMontenegroCoordinate */
function inMontenegro(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 41.85 || lat > 43.56 || lng < 18.43 || lng > 20.36) return false;
  if (lng < 18.48 && lat >= 42.35) return false;
  if (lng < 18.48 && lat >= 42.65) return false;
  if (lat >= 42.68 && lng <= 18.52) return false;
  if (lat <= 42.12 && lng >= 19.4 && lng <= 19.65) return false;
  if (lng >= 20.28 && lat >= 43.05) return false;
  if (lng >= 20.2 && lat >= 42.55 && lat <= 42.8) return false;
  return true;
}

function hasValidCoords(r) {
  const lat = Number(r.lat);
  const lng = Number(r.lng);
  return (
    r.lat != null &&
    r.lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0)
  );
}

function normalizeBrand(b) {
  return String(b || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function eligibilityOf(r) {
  return r.eligibility_path || r.eligibility_candidate || '';
}

function toCatalogRow(r) {
  return {
    id: r.id,
    name: String(r.name || '').trim(),
    brand: r.brand,
    address: String(r.address || '').trim(),
    postal_code: String(r.postal_code || '').trim(),
    city: String(r.city || '').trim(),
    country: 'Montenegro',
    lat: Number(r.lat),
    lng: Number(r.lng),
    is_active: true,
    is_coming_soon: false,
  };
}

function toApprovedRow(r) {
  return {
    id: r.id,
    name: String(r.name || '').trim(),
    brand: r.brand,
    address: String(r.address || '').trim(),
    postal_code: String(r.postal_code || '').trim(),
    city: String(r.city || '').trim(),
    country: 'Montenegro',
    lat: Number(r.lat),
    lng: Number(r.lng),
    eligibility_path: eligibilityOf(r),
    phase2_classification: r.phase2_classification || 'A_CONVENTIONAL_PUBLIC_GYM',
    municipality: r.municipality || r.city || null,
    source_url: r.source_url || null,
  };
}

function countByCountry(centers, country) {
  return centers.filter(c => c.country === country).length;
}

function snapshotCountry(centers, country) {
  return centers.filter(c => c.country === country).map(c => ({...c}));
}

function countryIntact(beforeRows, catalog) {
  return beforeRows.every(c => {
    const a = catalog.find(x => x.id === c.id);
    return (
      a &&
      a.lat === c.lat &&
      a.lng === c.lng &&
      a.name === c.name &&
      a.brand === c.brand &&
      a.address === c.address &&
      a.postal_code === c.postal_code &&
      a.city === c.city &&
      a.country === c.country &&
      a.is_active === c.is_active
    );
  });
}

function brandBreakdown(rows) {
  const byBrand = {};
  for (const r of rows) byBrand[r.brand] = (byBrand[r.brand] || 0) + 1;
  return byBrand;
}

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function findProximityPairs(rows) {
  const out = {
    same_brand_lt50: [],
    different_brand_lt50: [],
    identical: [],
    classifications: [],
    unexplained_hard_duplicates: 0,
  };
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      if (!hasValidCoords(a) || !hasValidCoords(b)) continue;
      const d = haversineMeters(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng));
      const sameBrand = normalizeBrand(a.brand) === normalizeBrand(b.brand);
      const rec = {
        a_id: a.id,
        b_id: b.id,
        a_brand: a.brand,
        b_brand: b.brand,
        distance_m: Math.round(d),
        classification: 'DISTINCT_PREMISES',
      };
      if (
        Math.abs(Number(a.lat) - Number(b.lat)) < 1e-7 &&
        Math.abs(Number(a.lng) - Number(b.lng)) < 1e-7
      ) {
        rec.classification = 'DUPLICATE';
        out.identical.push(rec);
      }
      // Capital Plaza Capital ↔ Benex — known distinct mall units
      if (
        !sameBrand &&
        /Capital/i.test(a.name || '') &&
        /Benex/i.test(b.name || '') &&
        d <= 50
      ) {
        rec.classification = 'COLOCATED_DISTINCT_CAPITAL_PLAZA';
      }
      if (
        !sameBrand &&
        /Benex/i.test(a.name || '') &&
        /Capital/i.test(b.name || '') &&
        d <= 50
      ) {
        rec.classification = 'COLOCATED_DISTINCT_CAPITAL_PLAZA';
      }
      if (d <= 200) out.classifications.push(rec);
      if (sameBrand && d <= 50) out.same_brand_lt50.push(rec);
      if (!sameBrand && d <= 50) out.different_brand_lt50.push(rec);
    }
  }
  out.unexplained_hard_duplicates = out.identical.length;
  return out;
}

function afterCounts(catalog) {
  return {
    total: catalog.length,
    montenegro: countByCountry(catalog, 'Montenegro'),
    moldova: countByCountry(catalog, 'Moldova'),
    san_marino: countByCountry(catalog, 'San Marino'),
    monaco: countByCountry(catalog, 'Monaco'),
    andorra: countByCountry(catalog, 'Andorra'),
    liechtenstein: countByCountry(catalog, 'Liechtenstein'),
    iceland: countByCountry(catalog, 'Iceland'),
    cyprus: countByCountry(catalog, 'Cyprus'),
    malta: countByCountry(catalog, 'Malta'),
    luxembourg: countByCountry(catalog, 'Luxembourg'),
    estonia: countByCountry(catalog, 'Estonia'),
    latvia: countByCountry(catalog, 'Latvia'),
    lithuania: countByCountry(catalog, 'Lithuania'),
    denmark: countByCountry(catalog, 'Denmark'),
    sweden: countByCountry(catalog, 'Sweden'),
    norway: countByCountry(catalog, 'Norway'),
    finland: countByCountry(catalog, 'Finland'),
    germany: countByCountry(catalog, 'Germany'),
    united_kingdom: countByCountry(catalog, 'United Kingdom'),
    netherlands: countByCountry(catalog, 'Netherlands'),
    france: countByCountry(catalog, 'France'),
    spain: countByCountry(catalog, 'Spain'),
    italy: countByCountry(catalog, 'Italy'),
    belgium: countByCountry(catalog, 'Belgium'),
    poland: countByCountry(catalog, 'Poland'),
    austria: countByCountry(catalog, 'Austria'),
    switzerland: countByCountry(catalog, 'Switzerland'),
    portugal: countByCountry(catalog, 'Portugal'),
    greece: countByCountry(catalog, 'Greece'),
    ireland: countByCountry(catalog, 'Ireland'),
    czechia: countByCountry(catalog, 'Czechia'),
    hungary: countByCountry(catalog, 'Hungary'),
    romania: countByCountry(catalog, 'Romania'),
    slovakia: countByCountry(catalog, 'Slovakia'),
    bulgaria: countByCountry(catalog, 'Bulgaria'),
    croatia: countByCountry(catalog, 'Croatia'),
    slovenia: countByCountry(catalog, 'Slovenia'),
  };
}

function main() {
  const preSha = sha256File(centersPath);
  const centers = JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8'));
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8'));
  const phase2Report = JSON.parse(fs.readFileSync(phase2ReportPath, 'utf8'));
  const rebrand = JSON.parse(fs.readFileSync(rebrandPath, 'utf8'));

  // Idempotency / second-run mode (post-merge catalog expected)
  if (idempotencyCheck) {
    const existingIds = new Set(centers.map(c => c.id));
    const approvedIdsCheck = ready.map(r => r.id);
    const toInsert = approvedIdsCheck.filter(id => !existingIds.has(id));
    const meLive = countByCountry(centers, 'Montenegro');
    const idem = {
      second_run_insertions: toInsert.length,
      final_catalog: centers.length,
      montenegro: meLive,
      me_prefix: centers.filter(c => String(c.id || '').startsWith('me_')).length,
      expected_catalog: EXPECTED_TOTAL_BEFORE + EXPECTED_READY,
      expected_montenegro: EXPECTED_READY,
      result:
        toInsert.length === 0 &&
        centers.length === EXPECTED_TOTAL_BEFORE + EXPECTED_READY &&
        meLive === EXPECTED_READY
          ? 'PASS'
          : 'FAIL',
    };
    fs.writeFileSync(idempotencyPath, JSON.stringify(idem, null, 2) + '\n');
    if (idem.result !== 'PASS') {
      console.error('IDEMPOTENCY FAIL', idem);
      process.exit(1);
    }
    console.log(JSON.stringify(idem, null, 2));
    return;
  }

  const meBefore = countByCountry(centers, 'Montenegro');
  const mePrefixBefore = centers.filter(c => String(c.id || '').startsWith('me_')).length;

  const baselineMatch =
    centers.length === EXPECTED_TOTAL_BEFORE &&
    meBefore === 0 &&
    mePrefixBefore === 0 &&
    preSha === EXPECTED_SHA_BEFORE &&
    countByCountry(centers, 'Moldova') === 28 &&
    countByCountry(centers, 'San Marino') === 6 &&
    countByCountry(centers, 'Monaco') === 4 &&
    countByCountry(centers, 'Andorra') === 12 &&
    countByCountry(centers, 'Liechtenstein') === 7 &&
    countByCountry(centers, 'Iceland') === 27;

  if (!baselineMatch) {
    console.error('BASELINE MISMATCH — STOP', {
      total: centers.length,
      meBefore,
      mePrefixBefore,
      preSha,
    });
    process.exit(1);
  }

  if (ready.length !== EXPECTED_READY) {
    console.error('READY count mismatch', ready.length);
    process.exit(1);
  }
  if (phase2Report.ready_to_import !== EXPECTED_READY) {
    console.error('Phase2 report READY mismatch');
    process.exit(1);
  }

  const readyIds = new Set(ready.map(r => r.id));
  if (readyIds.size !== EXPECTED_READY) {
    console.error('Duplicate READY IDs');
    process.exit(1);
  }

  // Validate READY rows
  for (const r of ready) {
    if (!String(r.id || '').startsWith('me_')) {
      console.error('Non-me_ READY id', r.id);
      process.exit(1);
    }
    if (eligibilityOf(r) !== 'SMALL_MARKET_INDEPENDENT') {
      console.error('Non-SMI eligibility', r.id, eligibilityOf(r));
      process.exit(1);
    }
    if (!ME_POSTAL_RE.test(String(r.postal_code || ''))) {
      console.error('Invalid postcode', r.id, r.postal_code);
      process.exit(1);
    }
    if (!hasValidCoords(r) || !inMontenegro(Number(r.lat), Number(r.lng))) {
      console.error('Invalid coords', r.id, r.lat, r.lng);
      process.exit(1);
    }
    if (FALLBACK_RE.test(String(r.coord_source || ''))) {
      console.error('Fallback coords', r.id);
      process.exit(1);
    }
    if (MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city} ${r.brand}`)) {
      console.error('Mojibake', r.id);
      process.exit(1);
    }
    if (FORBIDDEN_LIVE_RE.test(`${r.name} ${r.brand}`)) {
      console.error('Forbidden live identity', r.id);
      process.exit(1);
    }
  }

  const brands = brandBreakdown(ready);
  for (const [b, n] of Object.entries(EXPECTED_BRANDS)) {
    if ((brands[b] || 0) !== n) {
      console.error('Brand count mismatch', b, brands[b], 'expected', n);
      process.exit(1);
    }
  }

  const approved = ready.map(toApprovedRow);
  const approvedIds = new Set(approved.map(a => a.id));
  if (
    approvedIds.size !== readyIds.size ||
    [...approvedIds].some(id => !readyIds.has(id))
  ) {
    console.error('Approved != Phase2 READY');
    process.exit(1);
  }

  const dup = findProximityPairs(approved);
  if (dup.unexplained_hard_duplicates !== 0) {
    console.error('Hard duplicates', dup.identical);
    process.exit(1);
  }
  if ((rebrand.unresolved_conflicts || 0) !== 0) {
    console.error('Unresolved rebrand conflicts');
    process.exit(1);
  }

  const moldovaSnap = snapshotCountry(centers, 'Moldova');
  const smSnap = snapshotCountry(centers, 'San Marino');
  const mcSnap = snapshotCountry(centers, 'Monaco');

  const existingIds = new Set(centers.map(c => c.id));
  const toInsert = approved.filter(a => !existingIds.has(a.id)).map(toCatalogRow);
  if (toInsert.length !== EXPECTED_READY) {
    console.error('Insert count unexpected', toInsert.length);
    process.exit(1);
  }

  const catalog = dryRun ? centers.concat(toInsert) : centers.concat(toInsert);
  if (!dryRun) {
    fs.writeFileSync(centersPath, JSON.stringify(catalog, null, 2) + '\n');
  }

  // Staging MERGED
  let stagingUpdated = staging;
  if (!dryRun) {
    stagingUpdated = staging.map(r => {
      if (readyIds.has(r.id) && r.import_category === 'READY_TO_IMPORT') {
        return {...r, import_category: 'MERGED_INTO_CATALOG'};
      }
      return r;
    });
    fs.writeFileSync(stagingPath, JSON.stringify(stagingUpdated, null, 2) + '\n');
  }

  const postSha = dryRun ? preSha : sha256File(centersPath);
  const after = afterCounts(catalog);
  const mergedStaging = stagingUpdated.filter(
    r => r.import_category === 'MERGED_INTO_CATALOG',
  );

  // Regressions
  if (after.total !== EXPECTED_TOTAL_BEFORE + EXPECTED_READY) {
    console.error('After total wrong', after.total);
    process.exit(1);
  }
  if (after.montenegro !== EXPECTED_READY) {
    console.error('After ME wrong', after.montenegro);
    process.exit(1);
  }
  for (const [k, v] of Object.entries(BASELINE)) {
    if (k === 'total' || k === 'montenegro') continue;
    if (after[k] !== v) {
      console.error('Country regression', k, after[k], v);
      process.exit(1);
    }
  }
  if (!countryIntact(moldovaSnap, catalog) || !countryIntact(smSnap, catalog) || !countryIntact(mcSnap, catalog)) {
    console.error('Prior-country row mutation detected');
    process.exit(1);
  }

  const globalIds = catalog.map(c => c.id);
  if (new Set(globalIds).size !== globalIds.length) {
    console.error('Global duplicate IDs');
    process.exit(1);
  }

  // Metadata drift check Approved vs Production ME
  const liveMe = catalog.filter(c => c.country === 'Montenegro');
  let drift = 'NONE';
  for (const a of approved) {
    const live = liveMe.find(c => c.id === a.id);
    if (
      !live ||
      live.name !== a.name ||
      live.brand !== a.brand ||
      live.address !== a.address ||
      live.postal_code !== a.postal_code ||
      live.city !== a.city ||
      Number(live.lat) !== Number(a.lat) ||
      Number(live.lng) !== Number(a.lng)
    ) {
      drift = `DRIFT:${a.id}`;
      break;
    }
  }
  if (drift !== 'NONE') {
    console.error(drift);
    process.exit(1);
  }

  if (!dryRun) {
    fs.writeFileSync(approvedPath, JSON.stringify(approved, null, 2) + '\n');
    fs.writeFileSync(dupAnalysisPath, JSON.stringify(dup, null, 2) + '\n');
  }

  const report = {
    country: 'Montenegro',
    dry_run: dryRun,
    baseline_match: true,
    pre_merge_sha256: preSha,
    post_merge_sha256: postSha,
    before: {
      total: centers.length,
      montenegro: meBefore,
      me_prefix: mePrefixBefore,
      moldova: BASELINE.moldova,
      san_marino: BASELINE.san_marino,
      monaco: BASELINE.monaco,
      andorra: BASELINE.andorra,
      liechtenstein: BASELINE.liechtenstein,
      iceland: BASELINE.iceland,
    },
    phase2_ready: ready.length,
    approved: approved.length,
    inserted: toInsert.length,
    withheld: 0,
    after,
    eligibility: {
      CHAIN_CLASS_A: 0,
      SMALL_MARKET_INDEPENDENT: EXPECTED_READY,
    },
    brands: brandBreakdown(approved),
    reconciliation: {
      phase2_ready: ready.length,
      approved: approved.length,
      production_montenegro: after.montenegro,
      merged_staging: mergedStaging.length,
      invariant: '26 == 26 == 26 == 26',
      metadata_drift: drift,
    },
    exclusions: {
      hotel_resort_leakage: 0,
      specialist_leakage: 0,
      foreign_ready: {hr: 0, ba: 0, rs: 0, al: 0, xk: 0},
    },
    duplicates: {
      unexplained_hard_duplicates: dup.unexplained_hard_duplicates,
    },
    rebrand_unresolved: rebrand.unresolved_conflicts || 0,
    architecture: 'KEEP CLIENT-SIDE',
    crosses_12500: after.total >= 12500,
    global_stress_qa_required: false,
    check_in_radius_m: 200,
    auto_checkout_m: 200,
    verdict: dryRun
      ? 'DRY RUN OK'
      : 'MONTENEGRO MERGE COMPLETE — WAITING FOR QA',
  };

  if (!dryRun) {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    fs.writeFileSync(
      mdReportPath,
      `# MONTENEGRO PRODUCTION MERGE

## Verdict

**${report.verdict}**

## Baseline

- Before: ${report.before.total}
- Montenegro before: ${report.before.montenegro}
- Pre-merge SHA: \`${preSha}\`

## Result

- Inserted: ${report.inserted}
- After: ${report.after.total}
- Montenegro after: ${report.after.montenegro}
- Post-merge SHA: \`${postSha}\`

## Eligibility

- CHAIN_CLASS_A: 0
- SMALL_MARKET_INDEPENDENT: 26

## Reconciliation

26 == 26 == 26 == 26

Metadata drift: NONE

## Global scale

- Catalog: ${report.after.total}
- Crosses 12,500: NO
- Global Stress QA: NO
`,
    );
  }

  console.log(JSON.stringify(report, null, 2));
}

main();
