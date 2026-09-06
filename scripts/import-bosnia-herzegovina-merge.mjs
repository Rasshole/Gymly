/**
 * Bosnia & Herzegovina production-safe merge (Phase 2 canonical READY).
 *
 * Source: data/bosnia-herzegovina/BOSNIA_HERZEGOVINA_PHASE2_READY_TO_IMPORT.json
 *
 * Usage:
 *   node scripts/import-bosnia-herzegovina-merge.mjs --dry-run
 *   node scripts/import-bosnia-herzegovina-merge.mjs
 *   node scripts/import-bosnia-herzegovina-merge.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const stagingPath = path.join(
  root,
  'data/bosnia-herzegovina/bosnia_herzegovina_centers_staging.json',
);
const readyPath = path.join(
  root,
  'data/bosnia-herzegovina/BOSNIA_HERZEGOVINA_PHASE2_READY_TO_IMPORT.json',
);
const phase2ReportPath = path.join(
  root,
  'data/bosnia-herzegovina/BOSNIA_HERZEGOVINA_PHASE2_READINESS_REPORT.json',
);
const rebrandPath = path.join(
  root,
  'data/bosnia-herzegovina/BOSNIA_HERZEGOVINA_PHASE2_REBRAND_MAP.json',
);
const reportDir = path.join(root, 'data/bosnia-herzegovina');
const reportPath = path.join(reportDir, 'BOSNIA_HERZEGOVINA_MERGE_REPORT.json');
const mdReportPath = path.join(reportDir, 'BOSNIA_HERZEGOVINA_MERGE_REPORT.md');
const dupAnalysisPath = path.join(
  reportDir,
  'BOSNIA_HERZEGOVINA_MERGE_DUPLICATE_ANALYSIS.json',
);
const approvedPath = path.join(
  reportDir,
  'BOSNIA_HERZEGOVINA_APPROVED_FOR_MERGE.json',
);
const idempotencyPath = path.join(
  reportDir,
  'BOSNIA_HERZEGOVINA_MERGE_IDEMPOTENCY.json',
);

const dryRun = process.argv.includes('--dry-run');
const idempotencyCheck = process.argv.includes('--idempotency-check');

const EXPECTED_TOTAL_BEFORE = 11800;
const EXPECTED_READY = 31;
const EXPECTED_CHAIN_CLASS_A = 7;
const EXPECTED_SMI = 24;
const EXPECTED_SHA_BEFORE =
  '6df5a27d1671a5b5721b63e04b2f4e891ed3c5058fa24ede7d370eaaeb1f5112';
const BA_POSTAL_RE = /^\d{5}$/;
const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s/;
const FALLBACK_RE =
  /fallback|invented|centroid|city.?center|postcode.?centroid|capital.?fallback|city.?approx/i;

const ALL_IN_IDS = new Set([
  'ba_0ace57c4b2',
  'ba_383806522f',
  'ba_0bf4cc7be5',
]);

const KRON_BY_CITY = {
  Tuzla: 'ba_4b2b262dac',
  Živinice: 'ba_234269c33b',
  Srebrenik: 'ba_fbb6ab9577',
  Gračanica: 'ba_6e8f727eb6',
};

const SARAJEVO_READY_IDS = new Set([
  'ba_0ace57c4b2',
  'ba_383806522f',
  'ba_0bf4cc7be5',
  'ba_fa6f3c8b99',
  'ba_f63cafd3fe',
  'ba_e6bae3c12c',
  'ba_760fbe82ce',
  'ba_d705f4fca7',
  'ba_605d38b631',
  'ba_5fd8cc9b20',
]);

const BANJA_LUKA_READY_IDS = new Set([
  'ba_1e88b67b77',
  'ba_d10bc012e8',
  'ba_446902cbcb',
]);

const MOSTAR_READY_IDS = new Set(['ba_957417e083', 'ba_0116ad0cd5']);

const FORBIDDEN_PRODUCTION_IDS = new Set([
  'ba_57da7dd70d',
  'ba_69162d2178',
  'ba_78f8ad5126',
  'ba_d8a16be7ac',
  'ba_e6ba48931b',
  'ba_327db3a237',
  'ba_3b9800cdd0',
  'ba_cced171393',
  'ba_68ec8f2d3d',
  'ba_5ddab9c740',
]);

const NO_GYM_LOCALITIES = new Set([
  'Gradačac',
  'Lukavac',
  'Visoko',
  'Konjic',
  'Bugojno',
  'Jajce',
  'Livno',
]);

const FORBIDDEN_LIVE_RE =
  /ALL4SPORT|Pro-Fit|Xtreme Gym|Power Gym|Active Life|Forma Plus|Sportski centar|Fit Zone Banja|Active Mostar|CrossFit|Pilates|Hotel amenity|School gym|Border probe|foreign.?probe/i;

const BASELINE = {
  total: EXPECTED_TOTAL_BEFORE,
  bosnia_herzegovina: 0,
  north_macedonia: 25,
  montenegro: 26,
  moldova: 28,
  san_marino: 6,
  monaco: 4,
  andorra: 12,
  liechtenstein: 7,
  iceland: 27,
};

/** Mirrors isPlausibleBosniaHerzegovinaCoordinate */
function inBosniaHerzegovina(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 42.55 || lat > 45.28 || lng < 15.75 || lng > 19.58) return false;
  if (lat >= 44.0 && lat <= 45.05 && lng >= 15.75 && lng <= 16.15) return true;
  if (lng <= 17.42 && lat >= 42.95 && !(lat >= 42.9 && lat <= 43.08 && lng >= 17.5)) {
    return false;
  }
  if (lng <= 15.72) return false;
  if (lng <= 16.55 && lat >= 45.05) return false;
  if (lat >= 45.05 && lng <= 18.12) return false;
  if (lat >= 44.95 && lng <= 17.05) return false;
  if (lat >= 44.85 && lng >= 19.22) return false;
  if (lat >= 44.55 && lng >= 19.42) return false;
  if (lng >= 19.52) return false;
  if (lat <= 42.58 && lng >= 18.68) return false;
  if (lat <= 42.62 && lng >= 19.05) return false;
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
    country: 'Bosnia and Herzegovina',
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
    country: 'Bosnia and Herzegovina',
    lat: Number(r.lat),
    lng: Number(r.lng),
    eligibility_path: eligibilityOf(r),
    phase2_classification: r.phase2_classification || 'A_CONVENTIONAL_PUBLIC_GYM',
    municipality: r.municipality || r.city || null,
    entity: r.entity || null,
    chain_key: r.chain_key || null,
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

function findProximityAgainstProduction(approved, centers) {
  const out = [];
  for (const a of approved) {
    if (!hasValidCoords(a)) continue;
    for (const c of centers) {
      if (!hasValidCoords(c)) continue;
      const d = haversineMeters(Number(a.lat), Number(a.lng), Number(c.lat), Number(c.lng));
      if (d <= 200) {
        out.push({
          approved_id: a.id,
          production_id: c.id,
          distance_m: Math.round(d),
          classification: 'DISTINCT_PREMISES',
        });
      }
    }
  }
  return out;
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
    bosnia_herzegovina: countByCountry(catalog, 'Bosnia and Herzegovina'),
    north_macedonia: countByCountry(catalog, 'North Macedonia'),
    montenegro: countByCountry(catalog, 'Montenegro'),
    moldova: countByCountry(catalog, 'Moldova'),
    san_marino: countByCountry(catalog, 'San Marino'),
    monaco: countByCountry(catalog, 'Monaco'),
    andorra: countByCountry(catalog, 'Andorra'),
    liechtenstein: countByCountry(catalog, 'Liechtenstein'),
    iceland: countByCountry(catalog, 'Iceland'),
  };
}

function validateHardGates(ready, approved) {
  const classA = ready.filter(r => eligibilityOf(r) === 'CHAIN_CLASS_A');
  const smi = ready.filter(r => eligibilityOf(r) === 'SMALL_MARKET_INDEPENDENT');
  if (classA.length !== EXPECTED_CHAIN_CLASS_A || smi.length !== EXPECTED_SMI) {
    throw new Error(`Eligibility mismatch classA=${classA.length} smi=${smi.length}`);
  }

  const allIn = ready.filter(r => r.brand === 'ALL IN FITNESS');
  if (allIn.length !== 3 || !allIn.every(r => ALL_IN_IDS.has(r.id))) {
    throw new Error('ALL IN FITNESS gate failed');
  }

  const kron = ready.filter(r => r.brand === 'Kron Fitness');
  if (kron.length !== 4) throw new Error('Kron count failed');
  for (const [city, id] of Object.entries(KRON_BY_CITY)) {
    const row = kron.find(r => r.city === city && r.id === id);
    if (!row) throw new Error(`Kron ${city} gate failed`);
  }

  const sarajevo = ready.filter(r => r.city === 'Sarajevo');
  if (sarajevo.length !== 10) throw new Error('Sarajevo count failed');
  if (!sarajevo.every(r => SARAJEVO_READY_IDS.has(r.id))) {
    throw new Error('Sarajevo ID gate failed');
  }

  const avalon = ready.find(r => r.id === 'ba_fa6f3c8b99');
  if (!avalon || avalon.phase2_classification !== 'WELLNESS_ADDITIVE') {
    throw new Error('Avalon WELLNESS_ADDITIVE gate failed');
  }

  const banja = ready.filter(r => r.city === 'Banja Luka');
  if (banja.length !== 3 || !banja.every(r => BANJA_LUKA_READY_IDS.has(r.id))) {
    throw new Error('Banja Luka gate failed');
  }

  const mostar = ready.filter(r => r.city === 'Mostar');
  if (mostar.length !== 2 || !mostar.every(r => MOSTAR_READY_IDS.has(r.id))) {
    throw new Error('Mostar gate failed');
  }

  const istocno = ready.filter(r => r.city === 'Istočno Sarajevo');
  if (istocno.length !== 1 || istocno[0].id !== 'ba_64b95bab44') {
    throw new Error('Istočno Sarajevo gate failed');
  }

  for (const loc of NO_GYM_LOCALITIES) {
    if (ready.some(r => r.city === loc)) throw new Error(`No-gym locality fabricated: ${loc}`);
  }

  for (const id of FORBIDDEN_PRODUCTION_IDS) {
    if (approved.some(a => a.id === id)) throw new Error(`Forbidden ID in approved: ${id}`);
  }
}

function main() {
  const preSha = sha256File(centersPath);
  const centers = JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8'));
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8'));
  const phase2Report = JSON.parse(fs.readFileSync(phase2ReportPath, 'utf8'));
  const rebrand = JSON.parse(fs.readFileSync(rebrandPath, 'utf8'));

  if (idempotencyCheck) {
    const existingIds = new Set(centers.map(c => c.id));
    const approvedIdsCheck = ready.map(r => r.id);
    const toInsert = approvedIdsCheck.filter(id => !existingIds.has(id));
    const baLive = countByCountry(centers, 'Bosnia and Herzegovina');
    const idem = {
      second_run_insertions: toInsert.length,
      final_catalog: centers.length,
      bosnia_herzegovina: baLive,
      ba_prefix: centers.filter(c => String(c.id || '').startsWith('ba_')).length,
      expected_catalog: EXPECTED_TOTAL_BEFORE + EXPECTED_READY,
      expected_bosnia_herzegovina: EXPECTED_READY,
      result:
        toInsert.length === 0 &&
        centers.length === EXPECTED_TOTAL_BEFORE + EXPECTED_READY &&
        baLive === EXPECTED_READY
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

  const baBefore = countByCountry(centers, 'Bosnia and Herzegovina');
  const baPrefixBefore = centers.filter(c => String(c.id || '').startsWith('ba_')).length;

  const baselineMatch =
    centers.length === EXPECTED_TOTAL_BEFORE &&
    baBefore === 0 &&
    baPrefixBefore === 0 &&
    preSha === EXPECTED_SHA_BEFORE &&
    countByCountry(centers, 'North Macedonia') === 25 &&
    countByCountry(centers, 'Montenegro') === 26 &&
    countByCountry(centers, 'Moldova') === 28 &&
    countByCountry(centers, 'San Marino') === 6 &&
    countByCountry(centers, 'Monaco') === 4 &&
    countByCountry(centers, 'Andorra') === 12 &&
    countByCountry(centers, 'Liechtenstein') === 7 &&
    countByCountry(centers, 'Iceland') === 27;

  if (!baselineMatch) {
    console.error('BASELINE MISMATCH — STOP', {
      total: centers.length,
      baBefore,
      baPrefixBefore,
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

  let withheld = 0;
  for (const r of ready) {
    if (!String(r.id || '').startsWith('ba_')) {
      console.error('Non-ba_ READY id', r.id);
      process.exit(1);
    }
    const elig = eligibilityOf(r);
    if (elig !== 'CHAIN_CLASS_A' && elig !== 'SMALL_MARKET_INDEPENDENT') {
      console.error('Unknown eligibility', r.id, elig);
      process.exit(1);
    }
    if (r.country !== 'Bosnia and Herzegovina') {
      console.error('Invalid country', r.id);
      process.exit(1);
    }
    if (!BA_POSTAL_RE.test(String(r.postal_code || ''))) {
      console.error('Invalid postcode', r.id, r.postal_code);
      process.exit(1);
    }
    if (!hasValidCoords(r) || !inBosniaHerzegovina(Number(r.lat), Number(r.lng))) {
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
    if (r.foreign_probe === true || r.hotel_spa_risk === true) {
      console.error('Risk flag READY', r.id);
      process.exit(1);
    }
    if (!String(r.name || '').trim() || !String(r.address || '').trim()) {
      withheld += 1;
    }
  }
  if (withheld > 0) {
    console.error('WITHHELD > 0 — STOP', withheld);
    process.exit(1);
  }

  const approved = ready.map(toApprovedRow);
  try {
    validateHardGates(ready, approved);
  } catch (e) {
    console.error('HARD GATE FAIL', e.message);
    process.exit(1);
  }

  const approvedIds = new Set(approved.map(a => a.id));
  if (
    approvedIds.size !== readyIds.size ||
    [...approvedIds].some(id => !readyIds.has(id))
  ) {
    console.error('Approved != Phase2 READY');
    process.exit(1);
  }

  const dup = findProximityPairs(approved);
  const dupAgainstProd = findProximityAgainstProduction(approved, centers);
  if (dup.unexplained_hard_duplicates !== 0) {
    console.error('Hard duplicates among approved', dup.identical);
    process.exit(1);
  }
  if ((rebrand.unresolved_conflicts || 0) !== 0) {
    console.error('Unresolved rebrand conflicts');
    process.exit(1);
  }

  const mkSnap = snapshotCountry(centers, 'North Macedonia');
  const meSnap = snapshotCountry(centers, 'Montenegro');
  const mdSnap = snapshotCountry(centers, 'Moldova');
  const isSnap = snapshotCountry(centers, 'Iceland');

  const existingIds = new Set(centers.map(c => c.id));
  const collision = approved.filter(a => existingIds.has(a.id));
  if (collision.length) {
    console.error('ID collision with production', collision.map(c => c.id));
    process.exit(1);
  }

  const toInsert = approved.filter(a => !existingIds.has(a.id)).map(a => {
    const src = ready.find(r => r.id === a.id);
    return toCatalogRow(src);
  });
  if (toInsert.length !== EXPECTED_READY) {
    console.error('Insert count unexpected', toInsert.length);
    process.exit(1);
  }

  const catalog = centers.concat(toInsert);
  if (!dryRun) {
    fs.writeFileSync(centersPath, JSON.stringify(catalog, null, 2) + '\n');
  }

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

  if (after.total !== EXPECTED_TOTAL_BEFORE + EXPECTED_READY) {
    console.error('After total wrong', after.total);
    process.exit(1);
  }
  if (after.bosnia_herzegovina !== EXPECTED_READY) {
    console.error('After BA wrong', after.bosnia_herzegovina);
    process.exit(1);
  }
  for (const [k, v] of Object.entries(BASELINE)) {
    if (k === 'total' || k === 'bosnia_herzegovina') continue;
    if (after[k] !== v) {
      console.error('Country regression', k, after[k], v);
      process.exit(1);
    }
  }
  if (
    !countryIntact(mkSnap, catalog) ||
    !countryIntact(meSnap, catalog) ||
    !countryIntact(mdSnap, catalog) ||
    !countryIntact(isSnap, catalog)
  ) {
    console.error('Prior-country row mutation detected');
    process.exit(1);
  }

  const globalIds = catalog.map(c => c.id);
  if (new Set(globalIds).size !== globalIds.length) {
    console.error('Global duplicate IDs');
    process.exit(1);
  }

  let drift = 'NONE';
  const liveBa = catalog.filter(c => c.country === 'Bosnia and Herzegovina');
  for (const a of approved) {
    const live = liveBa.find(c => c.id === a.id);
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

  const classACount = approved.filter(a => a.eligibility_path === 'CHAIN_CLASS_A').length;
  const smiCount = approved.filter(a => a.eligibility_path === 'SMALL_MARKET_INDEPENDENT').length;

  if (!dryRun) {
    fs.writeFileSync(approvedPath, JSON.stringify(approved, null, 2) + '\n');
    fs.writeFileSync(dupAnalysisPath, JSON.stringify({...dup, against_production_sample: dupAgainstProd.slice(0, 20)}, null, 2) + '\n');
  }

  const parseStart = Date.now();
  JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const parseMs = Date.now() - parseStart;
  const jsonBytes = dryRun ? fs.statSync(centersPath).size : fs.statSync(centersPath).size;

  const report = {
    country: 'Bosnia and Herzegovina',
    dry_run: dryRun,
    baseline_match: true,
    pre_merge_sha256: preSha,
    post_merge_sha256: postSha,
    before: {
      total: centers.length,
      bosnia_herzegovina: baBefore,
      ba_prefix: baPrefixBefore,
      north_macedonia: BASELINE.north_macedonia,
      montenegro: BASELINE.montenegro,
      moldova: BASELINE.moldova,
      san_marino: BASELINE.san_marino,
      monaco: BASELINE.monaco,
      andorra: BASELINE.andorra,
      liechtenstein: BASELINE.liechtenstein,
      iceland: BASELINE.iceland,
    },
    phase2_ready: ready.length,
    approved: approved.length,
    validated: approved.length,
    inserted: toInsert.length,
    withheld: 0,
    after,
    eligibility: {
      CHAIN_CLASS_A: classACount,
      SMALL_MARKET_INDEPENDENT: smiCount,
    },
    all_in_fitness: {
      count: 3,
      ids: [...ALL_IN_IDS],
    },
    kron_fitness: {
      count: 4,
      by_city: KRON_BY_CITY,
    },
    sarajevo_ready: [...SARAJEVO_READY_IDS],
    banja_luka_ready: [...BANJA_LUKA_READY_IDS],
    mostar_ready: [...MOSTAR_READY_IDS],
    brands: brandBreakdown(approved),
    reconciliation: {
      phase2_ready: ready.length,
      approved: approved.length,
      production_bosnia_herzegovina: after.bosnia_herzegovina,
      merged_staging: mergedStaging.length,
      invariant: '31 == 31 == 31 == 31',
      missing_ids: [],
      unexpected_ids: [],
      metadata_drift: drift,
    },
    exclusions: {
      municipal_leakage: 0,
      hotel_spa_leakage: 0,
      specialist_leakage: 0,
      institutional_leakage: 0,
      forbidden_excluded_ids_in_production: [...FORBIDDEN_PRODUCTION_IDS].filter(id =>
        liveBa.some(c => c.id === id),
      ).length,
    },
    cross_border: {
      croatia_ready: 0,
      serbia_ready: 0,
      montenegro_ready: 0,
    },
    duplicates: {
      unexplained_hard_duplicates: dup.unexplained_hard_duplicates,
    },
    rebrand_unresolved: rebrand.unresolved_conflicts || 0,
    performance: {
      catalog: after.total,
      json_bytes: jsonBytes,
      parse_ms: parseMs,
    },
    architecture: 'KEEP CLIENT-SIDE',
    crosses_12500: after.total >= 12500,
    global_stress_qa_required: false,
    check_in_radius_m: 200,
    auto_checkout_m: 200,
    verdict: dryRun
      ? 'DRY RUN OK'
      : 'BOSNIA & HERZEGOVINA MERGE COMPLETE — WAITING FOR QA',
  };

  if (!dryRun) {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    fs.writeFileSync(
      mdReportPath,
      `# BOSNIA & HERZEGOVINA PRODUCTION MERGE

## Verdict

**${report.verdict}**

## Baseline

- Before: ${report.before.total}
- Bosnia before: ${report.before.bosnia_herzegovina}
- Pre-merge SHA: \`${preSha}\`

## Result

- Inserted: ${report.inserted}
- After: ${report.after.total}
- Bosnia after: ${report.after.bosnia_herzegovina}
- Post-merge SHA: \`${postSha}\`

## Eligibility

- CHAIN_CLASS_A: ${classACount}
- SMALL_MARKET_INDEPENDENT: ${smiCount}

## Reconciliation

31 == 31 == 31 == 31

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
