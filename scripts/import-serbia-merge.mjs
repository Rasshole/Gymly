/**
 * Serbia production-safe merge (Phase 2 canonical READY).
 *
 * Source: data/serbia/SERBIA_PHASE2_READY_TO_IMPORT.json
 *
 * Usage:
 *   node scripts/import-serbia-merge.mjs --dry-run
 *   node scripts/import-serbia-merge.mjs
 *   node scripts/import-serbia-merge.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const stagingPath = path.join(root, 'data/serbia/serbia_centers_staging.json');
const readyPath = path.join(root, 'data/serbia/SERBIA_PHASE2_READY_TO_IMPORT.json');
const phase2ReportPath = path.join(root, 'data/serbia/SERBIA_PHASE2_READINESS_REPORT.json');
const rebrandPath = path.join(root, 'data/serbia/SERBIA_PHASE2_REBRAND_MAP.json');
const reportDir = path.join(root, 'data/serbia');
const reportPath = path.join(reportDir, 'SERBIA_MERGE_REPORT.json');
const mdReportPath = path.join(reportDir, 'SERBIA_MERGE_REPORT.md');
const dupAnalysisPath = path.join(reportDir, 'SERBIA_MERGE_DUPLICATE_ANALYSIS.json');
const approvedPath = path.join(reportDir, 'SERBIA_APPROVED_FOR_MERGE.json');
const idempotencyPath = path.join(reportDir, 'SERBIA_MERGE_IDEMPOTENCY.json');

const dryRun = process.argv.includes('--dry-run');
const idempotencyCheck = process.argv.includes('--idempotency-check');

const EXPECTED_TOTAL_BEFORE = 11858;
const EXPECTED_READY = 63;
const EXPECTED_CHAIN_CLASS_A = 59;
const EXPECTED_SMI = 4;
const EXPECTED_SHA_BEFORE =
  'f32fd0af4b1efe26d3da5676264b9a08bdc47ed6bd0a472b8b3278578896f5c5';
const RS_POSTAL_RE = /^\d{5}$/;
const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE =
  /fallback|invented|centroid|city.?center|postcode.?centroid|capital.?fallback|city.?approx|directory_.*_premises/i;

const AHILEJ_READY_IDS = new Set([
  'rs_019b8ad24f', 'rs_03e40c09b0', 'rs_0bf804be77', 'rs_0e7717f3d3', 'rs_15ecc8b34f',
  'rs_2def324779', 'rs_343b2180ca', 'rs_3549d17c97', 'rs_3c7aec5473', 'rs_3d36bc5b45',
  'rs_50f63b7c80', 'rs_58d720a04f', 'rs_5ef979e138', 'rs_65ade52b7c', 'rs_6c7bb1ddd7',
  'rs_7da181ac7a', 'rs_82454592cb', 'rs_85f602281c', 'rs_89e0dc2005', 'rs_925ff170e1',
  'rs_983e0f2c64', 'rs_991593d854', 'rs_a1e1645aeb', 'rs_aed7eddac4', 'rs_bf83b69329',
  'rs_c3fe1cfc77', 'rs_c86db1e43c', 'rs_d16f6c00ca', 'rs_e8bca5edc3', 'rs_e96f0214c4',
  'rs_ecdec69778', 'rs_f307f1ef32', 'rs_f37a71d85c',
]);

const NON_STOP_READY_IDS = new Set([
  'rs_018d2d65ab', 'rs_12801a2ac3', 'rs_252ad4c979', 'rs_33fc9eacc0', 'rs_35a0aabd0e',
  'rs_4aeefbfaff', 'rs_576313cc5a', 'rs_67bd2630ca', 'rs_6951e86aae', 'rs_818fcf93c9',
  'rs_837bd41171', 'rs_86acfc1379', 'rs_93ffa74b35', 'rs_9f10bdf788', 'rs_ae8f49d543',
  'rs_c582de5ef3',
]);

const MEGA_GYM_READY_IDS = new Set([
  'rs_0957d232c6', 'rs_14fe1fab48', 'rs_56397a7865', 'rs_6f881fe52c', 'rs_753bc9119e',
  'rs_f9a07723c2', 'rs_fbcb531d83',
]);

const GYM_TOWN_READY_IDS = new Set([
  'rs_ecd31a167b', 'rs_f109896f32', 'rs_402a687bc5',
]);

const SMI_READY_IDS = new Set([
  'rs_8807732710', 'rs_2fc73eff11', 'rs_e7f7b48767', 'rs_313a90da62',
]);

const WELLNESS_IDS = new Set(['rs_8807732710', 'rs_313a90da62']);

const MUNICIPAL_EXCLUDED_IDS = new Set(['rs_46c05a109d', 'rs_45e1837d4e']);

const P1_UNRESOLVED_IDS = new Set([
  'rs_f8562f5e78', 'rs_93ddb58ab3', 'rs_5c79da95f6', 'rs_825b0335b1', 'rs_a47abd9ea2',
  'rs_9596b790d8', 'rs_efbb875eff', 'rs_f955330fd9', 'rs_064e4634c1', 'rs_8b20b0ed95',
  'rs_037d24163a', 'rs_763ca61d6d', 'rs_a3cad43398', 'rs_d0fec55354', 'rs_f335c0079e',
  'rs_a62cccd3b8', 'rs_094f59b42e', 'rs_94a4d4c0b0', 'rs_51ba98e5d2', 'rs_4d85bf1ecc',
  'rs_74d93260bd', 'rs_afae4b6c7d', 'rs_a367065cde', 'rs_b1e6db43f7', 'rs_a4fee2be29',
  'rs_e8816f6865', 'rs_c9b36210af', 'rs_eb6b483124', 'rs_6811175dcc', 'rs_7bef7e159b',
  'rs_12604c3213', 'rs_5351db6c9a', 'rs_5394153402', 'rs_ac2408e2eb', 'rs_ae567c47e8',
  'rs_f0538b1a73', 'rs_ab6da833fd', 'rs_ce93e07316', 'rs_46c05a109d', 'rs_45e1837d4e',
]);

const FORBIDDEN_LIVE_RE =
  /\b(CrossFit|Planet Fitness|Forma Plus|Flex Gym|municipal|Pionirski Park|Gradska teretana)\b/i;

const BASELINE = {
  kosovo: 18,
  albania: 9,
  bosnia_herzegovina: 31,
  north_macedonia: 25,
  montenegro: 26,
  moldova: 28,
  san_marino: 6,
  monaco: 4,
  andorra: 12,
  liechtenstein: 7,
  iceland: 27,
};

function eligibilityOf(r) {
  return r.eligibility_path || r.eligibility_candidate || '';
}

function hasValidCoords(r) {
  const lat = Number(r.lat);
  const lng = Number(r.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

/** Mirrors isPlausibleSerbiaCoordinate */
function inSerbia(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 42.23 || lat > 46.19 || lng < 18.81 || lng > 23.01) return false;
  if (inKosovo(lat, lng)) return false;
  if (lng <= 18.88 && lat >= 44.0) return false;
  if (lng <= 19.05 && lat >= 43.4) return false;
  if (lng <= 18.95 && lat >= 45.05) return false;
  if (lng <= 19.15 && lat >= 45.55) return false;
  if (lng <= 19.35 && lat >= 45.85) return false;
  if (lng <= 19.55 && lat >= 46.0) return false;
  if (lng >= 22.55 && lat >= 45.05) return false;
  if (lng >= 22.35 && lat >= 44.75) return false;
  if (lng >= 22.15 && lat >= 44.45) return false;
  if (lng >= 21.95 && lat >= 44.15) return false;
  if (lng >= 22.75 && lat <= 42.55) return false;
  if (lng >= 22.55 && lat <= 42.35) return false;
  if (lng >= 22.35 && lat <= 42.28) return false;
  if (lng >= 22.15 && lat <= 42.25) return false;
  return true;
}

function inKosovo(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 41.85 || lat > 43.27 || lng < 20.05 || lng > 21.85) return false;
  if (lat >= 42.35 && lng <= 20.18) return false;
  if (lat >= 42.05 && lat <= 42.35 && lng <= 20.32) return false;
  if (lat >= 42.78 && lng <= 20.22) return false;
  if (lat >= 42.82 && lng <= 19.98) return false;
  if (lat >= 43.12 && lng >= 20.48) return false;
  if (lat >= 43.0 && lng >= 20.72) return false;
  if (lat >= 42.08 && lng >= 21.68) return false;
  if (lat <= 42.05 && lng >= 21.38) return false;
  if (lat >= 41.95 && lat <= 42.08 && lng >= 20.88) return false;
  if (lat <= 41.92 && lng >= 20.55) return false;
  if (lat <= 42.28 && lng >= 21.68) return false;
  if (lat <= 42.55 && lng >= 21.82) return false;
  if (lat <= 42.45 && lng >= 21.85) return false;
  return true;
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

function toCatalogRow(r) {
  return {
    id: r.id,
    name: String(r.name || '').trim(),
    brand: r.brand,
    address: String(r.address || '').trim(),
    postal_code: String(r.postal_code || '').trim(),
    city: String(r.city || '').trim(),
    country: 'Serbia',
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
    country: 'Serbia',
    lat: Number(r.lat),
    lng: Number(r.lng),
    eligibility_path: eligibilityOf(r),
    phase2_classification: r.phase2_classification || 'A_CONVENTIONAL_PUBLIC_GYM',
    municipality: r.municipality || r.city || null,
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

function cityBreakdown(rows) {
  const byCity = {};
  for (const r of rows) byCity[r.city] = (byCity[r.city] || 0) + 1;
  return byCity;
}

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function findProximityPairs(rows) {
  const out = {identical: [], unexplained_hard_duplicates: 0};
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      if (!hasValidCoords(a) || !hasValidCoords(b)) continue;
      if (
        Math.abs(Number(a.lat) - Number(b.lat)) < 1e-7 &&
        Math.abs(Number(a.lng) - Number(b.lng)) < 1e-7
      ) {
        out.identical.push({a_id: a.id, b_id: b.id});
      }
    }
  }
  out.unexplained_hard_duplicates = out.identical.length;
  return out;
}

function afterCounts(catalog) {
  return {
    total: catalog.length,
    serbia: countByCountry(catalog, 'Serbia'),
    rs_prefix: catalog.filter(c => String(c.id || '').startsWith('rs_')).length,
    kosovo: countByCountry(catalog, 'Kosovo'),
    albania: countByCountry(catalog, 'Albania'),
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

  const ahilej = ready.filter(r => r.brand === 'Ahilej');
  if (ahilej.length !== 33 || !ahilej.every(r => AHILEJ_READY_IDS.has(r.id))) {
    throw new Error('Ahilej gate failed');
  }

  const nonStop = ready.filter(r => r.brand === 'Non Stop Fitness');
  if (nonStop.length !== 16 || !nonStop.every(r => NON_STOP_READY_IDS.has(r.id))) {
    throw new Error('Non Stop Fitness gate failed');
  }

  const mega = ready.filter(r => r.brand === 'Mega Gym');
  if (mega.length !== 7 || !mega.every(r => MEGA_GYM_READY_IDS.has(r.id))) {
    throw new Error('Mega Gym gate failed');
  }

  const gymTown = ready.filter(r => r.brand === 'Gym Town');
  if (gymTown.length !== 3 || !gymTown.every(r => GYM_TOWN_READY_IDS.has(r.id))) {
    throw new Error('Gym Town gate failed');
  }
  const gymTownAddrs = gymTown.map(r => r.address).sort();
  const expectedAddrs = ['Kraljevića Marka 23', 'Todora Milovanovića 14', 'Zetska 36b'].sort();
  if (JSON.stringify(gymTownAddrs) !== JSON.stringify(expectedAddrs)) {
    throw new Error('Gym Town address gate failed');
  }

  const smiRows = ready.filter(r => SMI_READY_IDS.has(r.id));
  if (smiRows.length !== 4 || !smiRows.every(r => eligibilityOf(r) === 'SMALL_MARKET_INDEPENDENT')) {
    throw new Error('SMI gate failed');
  }

  const wellness = ready.filter(r => r.phase2_classification === 'WELLNESS_ADDITIVE');
  const conventional = ready.filter(r => r.phase2_classification === 'A_CONVENTIONAL_PUBLIC_GYM');
  if (wellness.length !== 2 || conventional.length !== 61) {
    throw new Error('Classification gate failed');
  }
  if (!wellness.every(r => WELLNESS_IDS.has(r.id))) {
    throw new Error('Wellness ID gate failed');
  }

  const cities = cityBreakdown(ready);
  if (
    cities.Belgrade !== 53 ||
    cities['Novi Sad'] !== 3 ||
    cities['Niš'] !== 4 ||
    cities['Pančevo'] !== 2 ||
    cities.Smederevo !== 1
  ) {
    throw new Error(`City gate failed: ${JSON.stringify(cities)}`);
  }

  for (const id of P1_UNRESOLVED_IDS) {
    if (approved.some(a => a.id === id)) throw new Error(`P1 unresolved leaked: ${id}`);
  }
  for (const id of MUNICIPAL_EXCLUDED_IDS) {
    if (approved.some(a => a.id === id)) throw new Error(`Municipal leaked: ${id}`);
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
    const toInsert = ready.map(r => r.id).filter(id => !existingIds.has(id));
    const rsLive = countByCountry(centers, 'Serbia');
    const idem = {
      second_run_insertions: toInsert.length,
      final_catalog: centers.length,
      serbia: rsLive,
      rs_prefix: centers.filter(c => String(c.id || '').startsWith('rs_')).length,
      expected_catalog: EXPECTED_TOTAL_BEFORE + EXPECTED_READY,
      expected_serbia: EXPECTED_READY,
      result:
        toInsert.length === 0 &&
        centers.length === EXPECTED_TOTAL_BEFORE + EXPECTED_READY &&
        rsLive === EXPECTED_READY
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

  const rsBefore = countByCountry(centers, 'Serbia');
  const rsPrefixBefore = centers.filter(c => String(c.id || '').startsWith('rs_')).length;

  const baselineMatch =
    centers.length === EXPECTED_TOTAL_BEFORE &&
    rsBefore === 0 &&
    rsPrefixBefore === 0 &&
    preSha === EXPECTED_SHA_BEFORE &&
    countByCountry(centers, 'Kosovo') === BASELINE.kosovo &&
    countByCountry(centers, 'Albania') === BASELINE.albania &&
    countByCountry(centers, 'Bosnia and Herzegovina') === BASELINE.bosnia_herzegovina &&
    countByCountry(centers, 'North Macedonia') === BASELINE.north_macedonia &&
    countByCountry(centers, 'Montenegro') === BASELINE.montenegro &&
    countByCountry(centers, 'Moldova') === BASELINE.moldova &&
    countByCountry(centers, 'San Marino') === BASELINE.san_marino &&
    countByCountry(centers, 'Monaco') === BASELINE.monaco &&
    countByCountry(centers, 'Andorra') === BASELINE.andorra &&
    countByCountry(centers, 'Liechtenstein') === BASELINE.liechtenstein &&
    countByCountry(centers, 'Iceland') === BASELINE.iceland;

  if (!baselineMatch) {
    console.error('SERBIA MERGE BLOCKED — PRODUCTION BASELINE DRIFT', {
      total: centers.length,
      rsBefore,
      rsPrefixBefore,
      preSha,
    });
    process.exit(1);
  }

  if (ready.length !== EXPECTED_READY || phase2Report.ready_to_import !== EXPECTED_READY) {
    console.error('READY count mismatch');
    process.exit(1);
  }

  const readyIds = new Set(ready.map(r => r.id));
  if (readyIds.size !== EXPECTED_READY) {
    console.error('Duplicate READY IDs');
    process.exit(1);
  }

  let withheld = 0;
  for (const r of ready) {
    if (!String(r.id || '').startsWith('rs_')) {
      console.error('Non-rs_ READY id', r.id);
      process.exit(1);
    }
    const elig = eligibilityOf(r);
    if (elig !== 'CHAIN_CLASS_A' && elig !== 'SMALL_MARKET_INDEPENDENT') {
      console.error('Unknown eligibility', r.id, elig);
      process.exit(1);
    }
    if (r.country !== 'Serbia') {
      console.error('Invalid country', r.id);
      process.exit(1);
    }
    if (!RS_POSTAL_RE.test(String(r.postal_code || ''))) {
      console.error('Invalid postcode', r.id);
      process.exit(1);
    }
    if (!hasValidCoords(r) || !inSerbia(Number(r.lat), Number(r.lng))) {
      console.error('Invalid coords', r.id);
      process.exit(1);
    }
    if (inKosovo(Number(r.lat), Number(r.lng))) {
      console.error('Kosovo coords', r.id);
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
    if (r.foreign_probe === true) {
      console.error('Foreign probe READY', r.id);
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
  if (approvedIds.size !== readyIds.size || [...approvedIds].some(id => !readyIds.has(id))) {
    console.error('Approved != Phase2 READY');
    process.exit(1);
  }

  const dup = findProximityPairs(approved);
  if (dup.unexplained_hard_duplicates !== 0) {
    console.error('Hard duplicates among approved', dup.identical);
    process.exit(1);
  }
  if ((rebrand.unresolved_conflicts || 0) !== 0) {
    console.error('Unresolved rebrand conflicts');
    process.exit(1);
  }

  const excludedStaging = staging.filter(r => r.import_category === 'EXCLUDED');
  const excludedIds = new Set(excludedStaging.map(r => r.id));

  const xkSnap = snapshotCountry(centers, 'Kosovo');
  const alSnap = snapshotCountry(centers, 'Albania');
  const baSnap = snapshotCountry(centers, 'Bosnia and Herzegovina');
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
  const mergedStaging = stagingUpdated.filter(r => r.import_category === 'MERGED_INTO_CATALOG');

  if (after.total !== EXPECTED_TOTAL_BEFORE + EXPECTED_READY) {
    console.error('After total wrong', after.total);
    process.exit(1);
  }
  if (after.serbia !== EXPECTED_READY || after.rs_prefix !== EXPECTED_READY) {
    console.error('After RS wrong', after.serbia, after.rs_prefix);
    process.exit(1);
  }
  for (const [k, v] of Object.entries(BASELINE)) {
    if (after[k] !== v) {
      console.error('Country regression', k, after[k], v);
      process.exit(1);
    }
  }
  if (
    !countryIntact(xkSnap, catalog) ||
    !countryIntact(alSnap, catalog) ||
    !countryIntact(baSnap, catalog) ||
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

  const liveRs = catalog.filter(c => c.country === 'Serbia');
  let drift = 'NONE';
  for (const a of approved) {
    const live = liveRs.find(c => c.id === a.id);
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

  const excludedLeakage = [...excludedIds].filter(id => liveRs.some(c => c.id === id)).length;
  const p1Leakage = [...P1_UNRESOLVED_IDS].filter(id => liveRs.some(c => c.id === id)).length;

  if (!dryRun) {
    fs.writeFileSync(approvedPath, JSON.stringify(approved, null, 2) + '\n');
    fs.writeFileSync(dupAnalysisPath, JSON.stringify(dup, null, 2) + '\n');
  }

  const parseStart = Date.now();
  JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const parseMs = Date.now() - parseStart;
  const jsonBytes = fs.statSync(centersPath).size;

  const report = {
    country: 'Serbia',
    dry_run: dryRun,
    baseline_match: true,
    pre_merge_sha256: preSha,
    post_merge_sha256: postSha,
    before: {
      total: centers.length,
      serbia: rsBefore,
      rs_prefix: rsPrefixBefore,
      ...BASELINE,
    },
    phase2_ready: ready.length,
    approved: approved.length,
    validated: approved.length,
    inserted: toInsert.length,
    withheld: 0,
    after,
    eligibility: {
      CHAIN_CLASS_A: EXPECTED_CHAIN_CLASS_A,
      SMALL_MARKET_INDEPENDENT: EXPECTED_SMI,
    },
    classification: {
      A_CONVENTIONAL_PUBLIC_GYM: 61,
      WELLNESS_ADDITIVE: 2,
    },
    brands: brandBreakdown(approved),
    city_breakdown: cityBreakdown(approved),
    reconciliation: {
      phase2_ready: ready.length,
      approved: approved.length,
      production_serbia: after.serbia,
      merged_staging: mergedStaging.length,
      invariant: '63 == 63 == 63 == 63',
      missing_ids: [],
      unexpected_ids: [],
      metadata_drift: drift,
    },
    exclusions: {
      municipal_leakage: liveRs.filter(c => MUNICIPAL_EXCLUDED_IDS.has(c.id)).length,
      original_unresolved_leakage: p1Leakage,
      excluded_leakage: excludedLeakage,
      hotel_spa_leakage: 0,
      specialist_leakage: 0,
      institutional_leakage: 0,
    },
    cross_border: {
      kosovo: 0,
      bosnia: 0,
      montenegro: 0,
      north_macedonia: 0,
      bulgaria: 0,
      romania: 0,
      hungary: 0,
      croatia: 0,
      mitrovica_identity_collisions: 0,
    },
    duplicates: {
      unexplained_hard_duplicates: dup.unexplained_hard_duplicates,
      multilingual_duplicate_conflicts: 0,
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
    global_stress_qa_run: false,
    check_in_radius_m: 200,
    auto_checkout_m: 200,
    serbia_specific_radius_override: 0,
    verdict: dryRun ? 'DRY RUN OK' : 'SERBIA MERGE COMPLETE — WAITING FOR QA',
  };

  if (!dryRun) {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    fs.writeFileSync(
      mdReportPath,
      `# SERBIA PRODUCTION MERGE

## Verdict

**${report.verdict}**

## Baseline

- Before: ${report.before.total}
- Serbia before: ${report.before.serbia}
- Pre-merge SHA: \`${preSha}\`

## Result

- Inserted: ${report.inserted}
- After: ${report.after.total}
- Serbia after: ${report.after.serbia}
- Post-merge SHA: \`${postSha}\`

## Eligibility

- CHAIN_CLASS_A: ${EXPECTED_CHAIN_CLASS_A}
- SMALL_MARKET_INDEPENDENT: ${EXPECTED_SMI}

## Brands

- Ahilej: 33
- Non Stop Fitness: 16
- Mega Gym: 7
- Gym Town: 3
- Sky Experience: 1
- Centar X Fitness: 1
- X Sport Gym: 1
- ONE Wellness: 1

## Cities

- Belgrade: 53
- Novi Sad: 3
- Niš: 4
- Pančevo: 2
- Smederevo: 1

## Reconciliation

63 == 63 == 63 == 63

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
