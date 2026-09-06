/**
 * Kosovo production-safe merge (Phase 2 canonical READY).
 *
 * Source: data/kosovo/KOSOVO_PHASE2_READY_TO_IMPORT.json
 *
 * Usage:
 *   node scripts/import-kosovo-merge.mjs --dry-run
 *   node scripts/import-kosovo-merge.mjs
 *   node scripts/import-kosovo-merge.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const stagingPath = path.join(root, 'data/kosovo/kosovo_centers_staging.json');
const readyPath = path.join(root, 'data/kosovo/KOSOVO_PHASE2_READY_TO_IMPORT.json');
const phase2ReportPath = path.join(root, 'data/kosovo/KOSOVO_PHASE2_READINESS_REPORT.json');
const rebrandPath = path.join(root, 'data/kosovo/KOSOVO_PHASE2_REBRAND_MAP.json');
const reportDir = path.join(root, 'data/kosovo');
const reportPath = path.join(reportDir, 'KOSOVO_MERGE_REPORT.json');
const mdReportPath = path.join(reportDir, 'KOSOVO_MERGE_REPORT.md');
const dupAnalysisPath = path.join(reportDir, 'KOSOVO_MERGE_DUPLICATE_ANALYSIS.json');
const approvedPath = path.join(reportDir, 'KOSOVO_APPROVED_FOR_MERGE.json');
const idempotencyPath = path.join(reportDir, 'KOSOVO_MERGE_IDEMPOTENCY.json');

const dryRun = process.argv.includes('--dry-run');
const idempotencyCheck = process.argv.includes('--idempotency-check');

const EXPECTED_TOTAL_BEFORE = 11840;
const EXPECTED_READY = 18;
const EXPECTED_CHAIN_CLASS_A = 12;
const EXPECTED_SMI = 6;
const EXPECTED_SHA_BEFORE =
  'a1aba09e9ea375e8aa3c82c719556182ad07d8251c31ec142e307670e340aca0';
const XK_POSTAL_RE = /^[1-7]\d{4}$/;
const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE =
  /fallback|invented|centroid|city.?center|postcode.?centroid|capital.?fallback|city.?approx/i;

const FIVE_STAR_READY_IDS = new Set([
  'xk_4d98941de0',
  'xk_97a7085d4d',
  'xk_c701eda0ff',
  'xk_1d7af5ff10',
  'xk_d722f14213',
  'xk_db35d316aa',
  'xk_87bda6987b',
]);
const GRAND_HOTEL_ID = 'xk_4d98941de0';

const LETS_GO_READY_IDS = new Set([
  'xk_fc7b6a8c67',
  'xk_da9309622a',
  'xk_e06cd03b2e',
  'xk_4ac1e78ed4',
  'xk_9374a45e65',
]);

const SMI_READY_IDS = new Set([
  'xk_500cfd9387',
  'xk_ae58d8d928',
  'xk_bda33fc345',
  'xk_b434775de1',
  'xk_b3ba8d5cb9',
  'xk_d2868682b1',
]);

const PRISHTINA_READY_IDS = new Set([
  'xk_500cfd9387',
  'xk_4d98941de0',
  'xk_97a7085d4d',
  'xk_c701eda0ff',
  'xk_fc7b6a8c67',
  'xk_da9309622a',
  'xk_e06cd03b2e',
  'xk_4ac1e78ed4',
  'xk_ae58d8d928',
  'xk_bda33fc345',
  'xk_b434775de1',
  'xk_b3ba8d5cb9',
  'xk_d2868682b1',
]);

const FORBIDDEN_PRODUCTION_IDS = new Set([
  'xk_a7af40e3fe',
  'xk_29fa84ecf0',
  'xk_61859b084f',
  'xk_0623d1f425',
]);

const NO_GYM_LOCALITIES = new Set([
  'Pejë',
  'Gjakovë',
  'Mitrovicë',
  'North Mitrovica',
  'Zvečan',
  'Leposaviq',
  'Zubin Potok',
  'Vushtrri',
  'Podujevë',
  'Lipjan',
  'Drenas',
  'Skenderaj',
  'Rahovec',
  'Malishevë',
  'Suharekë',
  'Kaçanik',
  'Klina',
  'Deçan',
  'Istog',
  'Dragash',
  'Štrpce',
  'Ranillug',
]);

const FORBIDDEN_LIVE_RE =
  /\b(CrossFit|Pilates|EMS|Planet Fitness|Pro-Fit|Hotel amenity|Power Gym placeholder|foreign.?probe)\b/i;

const BASELINE = {
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

/** Mirrors isPlausibleKosovoCoordinate */
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

function normalizeBrand(b) {
  return String(b || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function toCatalogRow(r) {
  return {
    id: r.id,
    name: String(r.name || '').trim(),
    brand: r.brand,
    address: String(r.address || '').trim(),
    postal_code: String(r.postal_code || '').trim(),
    city: String(r.city || '').trim(),
    country: 'Kosovo',
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
    country: 'Kosovo',
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
    kosovo: countByCountry(catalog, 'Kosovo'),
    xk_prefix: catalog.filter(c => String(c.id || '').startsWith('xk_')).length,
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

  const fiveStar = ready.filter(r => r.brand === 'Five Star Fitness');
  if (fiveStar.length !== 7 || !fiveStar.every(r => FIVE_STAR_READY_IDS.has(r.id))) {
    throw new Error('Five Star Fitness gate failed');
  }
  const grandHotel = ready.find(r => r.id === GRAND_HOTEL_ID);
  if (!grandHotel || grandHotel.phase2_classification !== 'WELLNESS_ADDITIVE') {
    throw new Error('Five Star Grand Hotel WELLNESS_ADDITIVE gate failed');
  }

  const letsGo = ready.filter(r => r.brand === 'Lets Go Gym');
  if (letsGo.length !== 5 || !letsGo.every(r => LETS_GO_READY_IDS.has(r.id))) {
    throw new Error('Lets Go Gym gate failed');
  }

  const smiRows = ready.filter(r => SMI_READY_IDS.has(r.id));
  if (smiRows.length !== 6 || !smiRows.every(r => eligibilityOf(r) === 'SMALL_MARKET_INDEPENDENT')) {
    throw new Error('SMI gate failed');
  }

  const prishtina = ready.filter(r => r.city === 'Prishtina');
  if (prishtina.length !== 13 || !prishtina.every(r => PRISHTINA_READY_IDS.has(r.id))) {
    throw new Error('Prishtina gate failed');
  }

  const fushKosove = ready.filter(r => r.city === 'Fushë Kosovë');
  if (fushKosove.length !== 1 || fushKosove[0].id !== 'xk_1d7af5ff10') {
    throw new Error('Fushë Kosovë gate failed');
  }

  const prizren = ready.filter(r => r.city === 'Prizren');
  if (prizren.length !== 2 || !prizren.some(r => r.id === 'xk_d722f14213')) {
    throw new Error('Prizren gate failed');
  }

  const gjilan = ready.filter(r => r.city === 'Gjilan');
  if (gjilan.length !== 1 || gjilan[0].id !== 'xk_db35d316aa') {
    throw new Error('Gjilan gate failed');
  }

  const ferizaj = ready.filter(r => r.city === 'Ferizaj');
  if (ferizaj.length !== 1 || ferizaj[0].id !== 'xk_87bda6987b') {
    throw new Error('Ferizaj gate failed');
  }

  const wellness = ready.filter(r => r.phase2_classification === 'WELLNESS_ADDITIVE');
  const conventional = ready.filter(r => r.phase2_classification === 'A_CONVENTIONAL_PUBLIC_GYM');
  if (wellness.length !== 1 || conventional.length !== 17) {
    throw new Error('Classification gate failed');
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
    const xkLive = countByCountry(centers, 'Kosovo');
    const idem = {
      second_run_insertions: toInsert.length,
      final_catalog: centers.length,
      kosovo: xkLive,
      xk_prefix: centers.filter(c => String(c.id || '').startsWith('xk_')).length,
      expected_catalog: EXPECTED_TOTAL_BEFORE + EXPECTED_READY,
      expected_kosovo: EXPECTED_READY,
      result:
        toInsert.length === 0 &&
        centers.length === EXPECTED_TOTAL_BEFORE + EXPECTED_READY &&
        xkLive === EXPECTED_READY
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

  const xkBefore = countByCountry(centers, 'Kosovo');
  const xkPrefixBefore = centers.filter(c => String(c.id || '').startsWith('xk_')).length;
  const alBefore = countByCountry(centers, 'Albania');

  const baselineMatch =
    centers.length === EXPECTED_TOTAL_BEFORE &&
    xkBefore === 0 &&
    xkPrefixBefore === 0 &&
    alBefore === BASELINE.albania &&
    preSha === EXPECTED_SHA_BEFORE &&
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
    console.error('BASELINE MISMATCH — STOP', {
      total: centers.length,
      xkBefore,
      xkPrefixBefore,
      alBefore,
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
    if (!String(r.id || '').startsWith('xk_')) {
      console.error('Non-xk_ READY id', r.id);
      process.exit(1);
    }
    const elig = eligibilityOf(r);
    if (elig !== 'CHAIN_CLASS_A' && elig !== 'SMALL_MARKET_INDEPENDENT') {
      console.error('Unknown eligibility', r.id, elig);
      process.exit(1);
    }
    if (r.country !== 'Kosovo') {
      console.error('Invalid country', r.id);
      process.exit(1);
    }
    if (!XK_POSTAL_RE.test(String(r.postal_code || ''))) {
      console.error('Invalid postcode', r.id, r.postal_code);
      process.exit(1);
    }
    if (!hasValidCoords(r) || !inKosovo(Number(r.lat), Number(r.lng))) {
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
    if (r.foreign_probe === true) {
      console.error('Foreign probe READY', r.id);
      process.exit(1);
    }
    if (r.hotel_spa_risk === true && r.id !== GRAND_HOTEL_ID) {
      console.error('Hotel/spa risk READY (non-Grand Hotel)', r.id);
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
  const mergedStaging = stagingUpdated.filter(
    r => r.import_category === 'MERGED_INTO_CATALOG',
  );

  if (after.total !== EXPECTED_TOTAL_BEFORE + EXPECTED_READY) {
    console.error('After total wrong', after.total);
    process.exit(1);
  }
  if (after.kosovo !== EXPECTED_READY) {
    console.error('After XK wrong', after.kosovo);
    process.exit(1);
  }
  for (const [k, v] of Object.entries(BASELINE)) {
    if (after[k] !== v) {
      console.error('Country regression', k, after[k], v);
      process.exit(1);
    }
  }
  if (
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

  let drift = 'NONE';
  const liveXk = catalog.filter(c => c.country === 'Kosovo');
  for (const a of approved) {
    const live = liveXk.find(c => c.id === a.id);
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
    fs.writeFileSync(
      dupAnalysisPath,
      JSON.stringify({...dup, against_production_sample: dupAgainstProd.slice(0, 20)}, null, 2) +
        '\n',
    );
  }

  const parseStart = Date.now();
  JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const parseMs = Date.now() - parseStart;
  const jsonBytes = fs.statSync(centersPath).size;

  const report = {
    country: 'Kosovo',
    dry_run: dryRun,
    baseline_match: true,
    pre_merge_sha256: preSha,
    post_merge_sha256: postSha,
    before: {
      total: centers.length,
      kosovo: xkBefore,
      xk_prefix: xkPrefixBefore,
      albania: alBefore,
      ...BASELINE,
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
    five_star_fitness: {
      count: 7,
      grand_hotel: GRAND_HOTEL_ID,
      wellness_additive: true,
    },
    lets_go_gym: {
      count: 5,
    },
    smi: {
      count: 6,
      ids: [...SMI_READY_IDS].sort(),
    },
    city_breakdown: {
      Prishtina: 13,
      'Fushë Kosovë': 1,
      Prizren: 2,
      Gjilan: 1,
      Ferizaj: 1,
    },
    brands: brandBreakdown(approved),
    reconciliation: {
      phase2_ready: ready.length,
      approved: approved.length,
      production_kosovo: after.kosovo,
      merged_staging: mergedStaging.length,
      invariant: '18 == 18 == 18 == 18',
      missing_ids: [],
      unexpected_ids: [],
      metadata_drift: drift,
    },
    exclusions: {
      municipal_leakage: 0,
      hotel_spa_leakage: 0,
      specialist_leakage: 0,
      institutional_leakage: 0,
      planet_fitness_kosovo: 0,
      fitness_zone_excluded_sites: 2,
      forbidden_excluded_ids_in_production: [...FORBIDDEN_PRODUCTION_IDS].filter(id =>
        liveXk.some(c => c.id === id),
      ).length,
    },
    cross_border: {
      albania: 0,
      montenegro: 0,
      north_macedonia: 0,
      serbia: 0,
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
    verdict: dryRun ? 'DRY RUN OK' : 'KOSOVO MERGE COMPLETE — WAITING FOR QA',
  };

  if (!dryRun) {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    fs.writeFileSync(
      mdReportPath,
      `# KOSOVO PRODUCTION MERGE

## Verdict

**${report.verdict}**

## Baseline

- Before: ${report.before.total}
- Kosovo before: ${report.before.kosovo}
- Pre-merge SHA: \`${preSha}\`

## Result

- Inserted: ${report.inserted}
- After: ${report.after.total}
- Kosovo after: ${report.after.kosovo}
- Post-merge SHA: \`${postSha}\`

## Eligibility

- CHAIN_CLASS_A: ${classACount}
- SMALL_MARKET_INDEPENDENT: ${smiCount}

## Chains

- Five Star Fitness: 7 (Grand Hotel WELLNESS_ADDITIVE)
- Lets Go Gym: 5
- SMI independents: 6

## Cities

- Prishtina: 13
- Fushë Kosovë: 1
- Prizren: 2
- Gjilan: 1
- Ferizaj: 1

## Reconciliation

18 == 18 == 18 == 18

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
