/**
 * Ireland production-safe merge (Phase 4 canonical READY).
 *
 * Source: data/ireland/IRELAND_PHASE4_READY_TO_IMPORT.json
 *
 * Usage:
 *   node scripts/import-ireland-merge.mjs --dry-run
 *   node scripts/import-ireland-merge.mjs
 *   node scripts/import-ireland-merge.mjs --idempotency-check
 *
 * Does not invent Eircodes. Does not promote Phase 4 NEEDS_REVIEW rows.
 * Final total = 10878 + actual READY count (not a stale hardcoded Ireland figure).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const stagingPath = path.join(root, 'data/ireland/ireland_centers_staging.json');
const readyPath = path.join(root, 'data/ireland/IRELAND_PHASE4_READY_TO_IMPORT.json');
const phase4ReportPath = path.join(root, 'data/ireland/IRELAND_PHASE4_READINESS_REPORT.json');
const rebrandPath = path.join(root, 'data/ireland/IRELAND_PHASE4_REBRAND_MAP.json');
const reportDir = path.join(root, 'data/ireland');
const reportPath = path.join(reportDir, 'IRELAND_MERGE_REPORT.json');
const mdReportPath = path.join(reportDir, 'IRELAND_MERGE_REPORT.md');
const dupAnalysisPath = path.join(reportDir, 'IRELAND_MERGE_DUPLICATE_ANALYSIS.json');
const approvedPath = path.join(reportDir, 'IRELAND_APPROVED_FOR_MERGE.json');
const idempotencyPath = path.join(reportDir, 'IRELAND_MERGE_IDEMPOTENCY.json');

const dryRun = process.argv.includes('--dry-run');
const idempotencyCheck = process.argv.includes('--idempotency-check');

const EXPECTED_TOTAL_BEFORE = 10878;
/** Mirrors IRELAND_EIRCODE_RE in src/utils/gymCountry.ts */
const IE_EIRCODE_RE = /^(?:[AC-FHKNPRTV-Y]\d{2}|D6W)\s?[0-9AC-FHKNPRTV-Y]{4}$/i;
const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE =
  /fallback|invented|centroid|city.?center|postcode.?centroid|capital.?fallback|town.?centroid/i;
const NI_TEXT_RE =
  /\b(belfast|derry|londonderry|newry|lisburn|bangor|armagh|enniskillen|coleraine|ballymena|northern ireland|co\.?\s*antrim|co\.?\s*down|BT\d{1,2})\b/i;
const LEGACY_BRAND_RE = /one escape|flyehub/i;

const EXPECTED_BRAND_BREAKDOWN = {
  'Anytime Fitness': 5,
  'Aura Leisure': 4,
  'Ben Dunne Gyms': 4,
  'Energie Fitness': 16,
  FLYEfit: 17,
  'Gym Plus': 7,
  'Iconic Health Clubs': 4,
  'Shoreline Leisure': 2,
  'West Wood Club': 6,
};

const BASELINE = {
  total: EXPECTED_TOTAL_BEFORE,
  ireland: 0,
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
};

const ENERGIE_TALLAGHT = 'ie_6930f99872';
const ENERGIE_CITYWEST = 'ie_2574437176';

/** Mirrors isPlausibleIrelandCoordinate in src/utils/gymCountry.ts */
function inIreland(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 51.35 || lat > 55.45 || lng < -10.7 || lng > -5.9) return false;
  if (lat >= 54.02 && lat <= 55.32 && lng >= -7.05 && lng <= -5.4) return false;
  if (lat >= 54.85 && lat <= 55.25 && lng >= -7.45 && lng <= -6.8) return false;
  return true;
}

function inNorthernIreland(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat >= 54.02 && lat <= 55.32 && lng >= -7.05 && lng <= -5.4) return true;
  if (lat >= 54.85 && lat <= 55.25 && lng >= -7.45 && lng <= -6.8) return true;
  return false;
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
    .replace(/[^a-z0-9àáâãäåçèéêëìíîïñòóôõöùúûüýÿ]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function addrBrandKey(r) {
  return [
    normalizeAddr(r.address || ''),
    String(r.postal_code || '').trim().toUpperCase().replace(/\s+/g, ' '),
    normalizeAddr(r.city || ''),
    normalizeBrand(r.brand || ''),
  ].join('|');
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
    postal_code: String(r.postal_code || '').trim().toUpperCase().replace(/\s+/g, ' '),
    city: String(r.city || '').trim(),
    country: 'Ireland',
    lat: Number(r.lat),
    lng: Number(r.lng),
    is_active: true,
    is_coming_soon: false,
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
  const lt25 = [];
  const lt50 = [];
  const lt100 = [];
  const lt200 = [];
  const identical = [];
  const diffBrand = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      if (!hasValidCoords(a) || !hasValidCoords(b)) continue;
      const d = haversineMeters(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng));
      if (d === 0) {
        identical.push({a_id: a.id, b_id: b.id, brand: a.brand, distance_m: 0});
      }
      if (normalizeBrand(a.brand) !== normalizeBrand(b.brand)) {
        if (d <= 100) {
          diffBrand.push({
            a_id: a.id,
            a_brand: a.brand,
            b_id: b.id,
            b_brand: b.brand,
            distance_m: Math.round(d),
          });
        }
        continue;
      }
      const rec = {
        a_id: a.id,
        a_name: a.name,
        a_address: a.address,
        a_postal: a.postal_code,
        b_id: b.id,
        b_name: b.name,
        b_address: b.address,
        b_postal: b.postal_code,
        brand: a.brand,
        distance_m: Math.round(d),
        same_address: addrBrandKey(a) === addrBrandKey(b),
      };
      if (d <= 25) lt25.push(rec);
      if (d <= 50) lt50.push(rec);
      if (d <= 100) lt100.push(rec);
      if (d <= 200) lt200.push(rec);
    }
  }
  return {lt25, lt50, lt100, lt200, identical, diffBrand};
}

function classifyProximityPairs(pairs) {
  return pairs.map(p => {
    const energiePair =
      (p.a_id === ENERGIE_TALLAGHT && p.b_id === ENERGIE_CITYWEST) ||
      (p.a_id === ENERGIE_CITYWEST && p.b_id === ENERGIE_TALLAGHT);
    if (energiePair) {
      return {
        ...p,
        classification: 'A',
        action: 'retain_both',
        evidence:
          'Energie Tallaght vs Citywest — distinct clubs (~3.6 km); Phase 3/4 A_legitimate',
      };
    }
    if (p.same_address && p.distance_m <= 25) {
      return {
        ...p,
        classification: 'B',
        action: 'withhold_b',
        evidence: 'Same brand + identical normalized address within 25 m',
      };
    }
    if (!p.same_address && p.a_postal && p.b_postal && p.a_postal !== p.b_postal) {
      return {
        ...p,
        classification: 'A',
        action: 'retain_both',
        evidence: 'Different Eircodes and addresses — treat as separate clubs',
      };
    }
    if (!p.same_address) {
      return {
        ...p,
        classification: 'A',
        action: 'retain_both',
        evidence: 'Different addresses — retain unless stronger duplicate evidence',
      };
    }
    return {
      ...p,
      classification: 'C',
      action: 'withhold_uncertain',
      evidence: 'Same normalized address near duplicate — uncertain',
    };
  });
}

function validateBrandBreakdown(byBrand, expectedCanonical) {
  const mismatches = [];
  for (const [brand, expected] of Object.entries(EXPECTED_BRAND_BREAKDOWN)) {
    if ((byBrand[brand] || 0) !== expected) {
      mismatches.push({brand, expected, actual: byBrand[brand] || 0});
    }
  }
  const extra = Object.keys(byBrand).filter(b => !(b in EXPECTED_BRAND_BREAKDOWN));
  if (extra.length) mismatches.push({extra_brands: extra});
  const sum = Object.values(byBrand).reduce((a, b) => a + b, 0);
  if (sum !== expectedCanonical) {
    mismatches.push({sum_expected: expectedCanonical, sum_actual: sum});
  }
  return mismatches;
}

function main() {
  const centers = JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8'));
  const readyFile = JSON.parse(fs.readFileSync(readyPath, 'utf8'));
  const phase4Report = fs.existsSync(phase4ReportPath)
    ? JSON.parse(fs.readFileSync(phase4ReportPath, 'utf8'))
    : null;
  const rebrandMap = fs.existsSync(rebrandPath)
    ? JSON.parse(fs.readFileSync(rebrandPath, 'utf8'))
    : {};
  const stagingById = new Map(staging.map(r => [r.id, r]));

  if (!Array.isArray(readyFile) || readyFile.length === 0) {
    throw new Error('IRELAND_PHASE4_READY_TO_IMPORT.json missing or empty — STOP');
  }

  const ACTUAL_READY_COUNT = readyFile.length;
  const EXPECTED_TOTAL_AFTER = EXPECTED_TOTAL_BEFORE + ACTUAL_READY_COUNT;

  const brandMismatches = validateBrandBreakdown(brandBreakdown(readyFile), ACTUAL_READY_COUNT);
  if (brandMismatches.length > 0) {
    throw new Error(`Brand breakdown mismatch — STOP: ${JSON.stringify(brandMismatches)}`);
  }

  const readyIds = new Set(readyFile.map(r => r.id));
  if (readyIds.size !== ACTUAL_READY_COUNT) {
    throw new Error(`Duplicate IDs inside Phase 4 READY file — STOP`);
  }

  const excludedInReady = staging.filter(
    r =>
      readyIds.has(r.id) &&
      [
        'NEEDS_COORDINATES',
        'NEEDS_REVIEW',
        'COMING_SOON',
        'CLOSED',
        'DUPLICATE',
        'LEGACY',
        'EXCLUDED',
      ].includes(r.import_category),
  );
  if (excludedInReady.length > 0) {
    throw new Error(
      `READY file contains excluded staging IDs: ${excludedInReady.map(r => r.id).join(', ')} — STOP`,
    );
  }

  if (phase4Report && phase4Report.ready_count != null && phase4Report.ready_count !== ACTUAL_READY_COUNT) {
    throw new Error(
      `Phase4 report ready_count=${phase4Report.ready_count}, file=${ACTUAL_READY_COUNT} — STOP`,
    );
  }

  const sourceRows = idempotencyCheck
    ? staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG')
    : staging.filter(r => r.import_category === 'READY_TO_IMPORT');

  if (!idempotencyCheck && sourceRows.length !== ACTUAL_READY_COUNT) {
    throw new Error(
      `Staging READY count ${sourceRows.length} !== Phase4 READY ${ACTUAL_READY_COUNT} — STOP`,
    );
  }

  const stagingReadyIds = new Set(sourceRows.map(r => r.id));
  if (!idempotencyCheck) {
    for (const id of readyIds) {
      if (!stagingReadyIds.has(id)) {
        throw new Error(`Phase4 READY id ${id} missing from staging READY — STOP`);
      }
    }
  }

  // Never promote unresolved Eircode-debt rows
  const unresolvedPromoted = staging.filter(
    r =>
      ['NEEDS_REVIEW', 'NEEDS_COORDINATES', 'EXCLUDED'].includes(r.import_category) &&
      readyIds.has(r.id),
  );
  if (unresolvedPromoted.length) {
    throw new Error('Unresolved staging rows present in READY file — STOP');
  }

  const preMergeSha256 = sha256File(centersPath);

  const before = {
    total: centers.length,
    ireland: countByCountry(centers, 'Ireland'),
    denmark: countByCountry(centers, 'Denmark'),
    sweden: countByCountry(centers, 'Sweden'),
    norway: countByCountry(centers, 'Norway'),
    finland: countByCountry(centers, 'Finland'),
    germany: countByCountry(centers, 'Germany'),
    united_kingdom: countByCountry(centers, 'United Kingdom'),
    netherlands: countByCountry(centers, 'Netherlands'),
    france: countByCountry(centers, 'France'),
    spain: countByCountry(centers, 'Spain'),
    italy: countByCountry(centers, 'Italy'),
    belgium: countByCountry(centers, 'Belgium'),
    poland: countByCountry(centers, 'Poland'),
    austria: countByCountry(centers, 'Austria'),
    switzerland: countByCountry(centers, 'Switzerland'),
    portugal: countByCountry(centers, 'Portugal'),
    greece: countByCountry(centers, 'Greece'),
  };

  for (const [key, expected] of Object.entries(BASELINE)) {
    if (idempotencyCheck) {
      if (key === 'ireland' || key === 'total') continue;
      if (before[key] !== expected) {
        throw new Error(`Idempotency country regression ${key}=${before[key]}, expected ${expected}`);
      }
      continue;
    }
    if (before[key] !== expected) {
      throw new Error(`Pre-merge baseline ${key}=${before[key]}, expected ${expected} — STOP`);
    }
  }

  const countrySnapshots = {
    denmark: snapshotCountry(centers, 'Denmark'),
    sweden: snapshotCountry(centers, 'Sweden'),
    norway: snapshotCountry(centers, 'Norway'),
    finland: snapshotCountry(centers, 'Finland'),
    germany: snapshotCountry(centers, 'Germany'),
    united_kingdom: snapshotCountry(centers, 'United Kingdom'),
    netherlands: snapshotCountry(centers, 'Netherlands'),
    france: snapshotCountry(centers, 'France'),
    spain: snapshotCountry(centers, 'Spain'),
    italy: snapshotCountry(centers, 'Italy'),
    belgium: snapshotCountry(centers, 'Belgium'),
    poland: snapshotCountry(centers, 'Poland'),
    austria: snapshotCountry(centers, 'Austria'),
    switzerland: snapshotCountry(centers, 'Switzerland'),
    portugal: snapshotCountry(centers, 'Portugal'),
    greece: snapshotCountry(centers, 'Greece'),
  };

  const rejected = {
    missing_id_prefix: 0,
    missing_name: 0,
    missing_brand: 0,
    missing_address: 0,
    missing_postal: 0,
    missing_city: 0,
    wrong_country: 0,
    invalid_coords: 0,
    bad_postal_format: 0,
    postal_not_string: 0,
    foreign_coords: 0,
    northern_ireland: 0,
    mojibake: 0,
    not_active: 0,
    coming_soon: 0,
    closed: 0,
    fallback_coord: 0,
    wrong_import_status: 0,
    dup_id_in_batch: 0,
    not_in_ready_file: 0,
    legacy_brand: 0,
  };
  const withheldDetails = [];

  const candidates = idempotencyCheck ? sourceRows : readyFile;
  const seenBatchIds = new Set();
  const validated = [];

  for (const r of candidates) {
    const s = stagingById.get(r.id);
    if (
      s &&
      [
        'NEEDS_COORDINATES',
        'NEEDS_REVIEW',
        'COMING_SOON',
        'CLOSED',
        'DUPLICATE',
        'LEGACY',
        'EXCLUDED',
      ].includes(s.import_category)
    ) {
      rejected.wrong_import_status++;
      withheldDetails.push({id: r.id, reason: 'excluded_import_category', value: s.import_category});
      continue;
    }
    if (!/^ie_[a-f0-9]{10}$/.test(String(r.id || ''))) {
      rejected.missing_id_prefix++;
      withheldDetails.push({id: r.id, reason: 'missing_ie_prefix'});
      continue;
    }
    if (seenBatchIds.has(r.id)) {
      rejected.dup_id_in_batch++;
      withheldDetails.push({id: r.id, reason: 'dup_id_in_batch'});
      continue;
    }
    seenBatchIds.add(r.id);

    if (!String(r.name || '').trim()) {
      rejected.missing_name++;
      withheldDetails.push({id: r.id, reason: 'missing_name'});
      continue;
    }
    if (!String(r.brand || '').trim()) {
      rejected.missing_brand++;
      withheldDetails.push({id: r.id, reason: 'missing_brand'});
      continue;
    }
    if (LEGACY_BRAND_RE.test(`${r.brand} ${r.name}`)) {
      rejected.legacy_brand++;
      withheldDetails.push({id: r.id, reason: 'legacy_brand_one_escape_or_flyehub'});
      continue;
    }
    if (!String(r.address || '').trim() || String(r.address).trim().length < 4) {
      rejected.missing_address++;
      withheldDetails.push({id: r.id, reason: 'missing_address'});
      continue;
    }
    if (typeof r.postal_code !== 'string') {
      rejected.postal_not_string++;
      withheldDetails.push({id: r.id, reason: 'postal_not_string'});
      continue;
    }
    const postal = String(r.postal_code).trim().toUpperCase().replace(/\s+/g, ' ');
    if (!postal || !IE_EIRCODE_RE.test(postal)) {
      rejected.bad_postal_format++;
      withheldDetails.push({id: r.id, reason: 'bad_eircode_format', postal});
      continue;
    }
    if (!String(r.city || '').trim()) {
      rejected.missing_city++;
      withheldDetails.push({id: r.id, reason: 'missing_city'});
      continue;
    }
    if (String(r.country || '').trim() !== 'Ireland') {
      rejected.wrong_country++;
      withheldDetails.push({id: r.id, reason: 'wrong_country', country: r.country});
      continue;
    }
    if (!hasValidCoords(r)) {
      rejected.invalid_coords++;
      withheldDetails.push({id: r.id, reason: 'invalid_coords'});
      continue;
    }
    if (r.is_coming_soon === true) {
      rejected.coming_soon++;
      withheldDetails.push({id: r.id, reason: 'coming_soon'});
      continue;
    }
    if (r.is_closed === true) {
      rejected.closed++;
      withheldDetails.push({id: r.id, reason: 'closed'});
      continue;
    }
    if (r.is_active === false) {
      rejected.not_active++;
      withheldDetails.push({id: r.id, reason: 'not_active'});
      continue;
    }
    const notesBlob = `${r.notes || ''} ${r.coord_source || ''}`;
    if (FALLBACK_RE.test(notesBlob)) {
      rejected.fallback_coord++;
      withheldDetails.push({id: r.id, reason: 'fallback_coord'});
      continue;
    }
    const lat = Number(r.lat);
    const lng = Number(r.lng);
    if (inNorthernIreland(lat, lng)) {
      rejected.northern_ireland++;
      withheldDetails.push({id: r.id, reason: 'northern_ireland_coords', lat, lng});
      continue;
    }
    if (!inIreland(lat, lng)) {
      rejected.foreign_coords++;
      withheldDetails.push({id: r.id, reason: 'foreign_coords', lat, lng});
      continue;
    }
    const blob = `${r.name} ${r.address} ${r.city} ${r.brand} ${r.source_url || ''}`;
    if (MOJIBAKE_RE.test(blob)) {
      rejected.mojibake++;
      withheldDetails.push({id: r.id, reason: 'mojibake'});
      continue;
    }
    if (NI_TEXT_RE.test(blob)) {
      rejected.northern_ireland++;
      withheldDetails.push({id: r.id, reason: 'northern_ireland_text'});
      continue;
    }
    if (!idempotencyCheck && !readyIds.has(r.id)) {
      rejected.not_in_ready_file++;
      withheldDetails.push({id: r.id, reason: 'not_in_ready_file'});
      continue;
    }
    validated.push({...r, postal_code: postal});
  }

  // Hard stop: any Phase 4 READY failure must block write
  if (!idempotencyCheck && validated.length !== ACTUAL_READY_COUNT) {
    throw new Error(
      `STOP BEFORE WRITE: validated ${validated.length}/${ACTUAL_READY_COUNT}. Withheld: ${JSON.stringify(withheldDetails)}`,
    );
  }

  const preMergeProximity = findProximityPairs(validated);
  const classifiedLt200 = classifyProximityPairs(preMergeProximity.lt200);
  const hardDups = new Set();
  for (const p of classifiedLt200) {
    if (p.classification === 'B' && p.action === 'withhold_b') {
      hardDups.add(p.b_id);
      withheldDetails.push({
        id: p.b_id,
        reason: 'same_brand_same_address_lte_25m',
        other: p.a_id,
        distance_m: p.distance_m,
      });
    }
    if (p.classification === 'C' && p.action === 'withhold_uncertain') {
      hardDups.add(p.b_id);
      withheldDetails.push({
        id: p.b_id,
        reason: 'uncertain_proximity_duplicate',
        other: p.a_id,
        distance_m: p.distance_m,
      });
    }
  }
  if (hardDups.size && !idempotencyCheck) {
    throw new Error(
      `STOP BEFORE WRITE: hard proximity duplicates ${[...hardDups].join(', ')}`,
    );
  }
  const safeValidated = validated.filter(r => !hardDups.has(r.id));

  const byId = new Map(centers.map(c => [c.id, c]));
  const prodCollisions = safeValidated.filter(r => byId.has(r.id)).map(r => r.id);
  if (!idempotencyCheck && before.ireland === 0 && prodCollisions.length > 0) {
    throw new Error(`STOP: duplicate IDs vs production: ${prodCollisions.join(', ')}`);
  }

  // Cross-check vs all production for same-brand proximity (Ireland candidates only vs full catalog)
  const crossProdLt25 = [];
  for (const r of safeValidated) {
    for (const c of centers) {
      if (!hasValidCoords(c) || !hasValidCoords(r)) continue;
      if (normalizeBrand(c.brand) !== normalizeBrand(r.brand)) continue;
      const d = haversineMeters(Number(r.lat), Number(r.lng), Number(c.lat), Number(c.lng));
      if (d <= 25) {
        crossProdLt25.push({ie_id: r.id, prod_id: c.id, brand: r.brand, distance_m: Math.round(d)});
      }
    }
  }
  if (!idempotencyCheck && crossProdLt25.length > 0) {
    throw new Error(`STOP: same-brand <=25m vs production: ${JSON.stringify(crossProdLt25)}`);
  }

  const liveAddrBrand = new Set(centers.map(addrBrandKey));
  let inserted = 0;
  const insertedRows = [];
  const dupAnalysis = {
    pre_merge_proximity: {
      lt25: preMergeProximity.lt25,
      lt50: preMergeProximity.lt50,
      lt100: preMergeProximity.lt100,
      lt200: preMergeProximity.lt200,
      identical: preMergeProximity.identical,
      diffBrand: preMergeProximity.diffBrand,
    },
    proximity_classifications: classifiedLt200,
    cross_production_same_brand_lte_25m: crossProdLt25,
    energie_tallaght_citywest: (() => {
      const a = safeValidated.find(r => r.id === ENERGIE_TALLAGHT);
      const b = safeValidated.find(r => r.id === ENERGIE_CITYWEST);
      if (!a || !b) return null;
      const d = haversineMeters(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng));
      return {
        tallaght: ENERGIE_TALLAGHT,
        citywest: ENERGIE_CITYWEST,
        distance_m: Math.round(d * 10) / 10,
        classification: 'A_legitimate',
        action: 'retain_both',
      };
    })(),
    skipped_existing_id: [],
    skipped_same_addr_brand: [],
    withheld: withheldDetails,
    included: [],
  };

  for (const r of safeValidated) {
    const row = toCatalogRow(r);
    if (byId.has(row.id)) {
      dupAnalysis.skipped_existing_id.push({id: row.id, name: row.name});
      continue;
    }
    const k = addrBrandKey(row);
    if (liveAddrBrand.has(k)) {
      dupAnalysis.skipped_same_addr_brand.push({id: row.id, name: row.name, key: k});
      withheldDetails.push({id: row.id, reason: 'same_addr_brand_vs_production', key: k});
      continue;
    }
    byId.set(row.id, row);
    liveAddrBrand.add(k);
    inserted++;
    insertedRows.push(row);
    dupAnalysis.included.push({id: row.id, name: row.name, brand: row.brand});
  }

  if (!idempotencyCheck && inserted !== ACTUAL_READY_COUNT) {
    throw new Error(
      `STOP BEFORE WRITE: inserted would be ${inserted}, expected ${ACTUAL_READY_COUNT}. Withheld: ${JSON.stringify(withheldDetails)}`,
    );
  }

  insertedRows.sort((a, b) => {
    const bb = String(a.brand).localeCompare(String(b.brand));
    if (bb !== 0) return bb;
    const nn = String(a.name).localeCompare(String(b.name), 'en');
    if (nn !== 0) return nn;
    return String(a.id).localeCompare(String(b.id));
  });

  const existingIds = new Set(centers.map(c => c.id));
  const appended = insertedRows.filter(r => !existingIds.has(r.id));
  const catalog = [...centers, ...appended];

  const after = {
    total: catalog.length,
    ireland: countByCountry(catalog, 'Ireland'),
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
  };

  const ieLive = catalog.filter(c => c.country === 'Ireland');
  const postMergeProximity = findProximityPairs(ieLive);
  const idCounts = new Map();
  for (const c of catalog) idCounts.set(c.id, (idCounts.get(c.id) || 0) + 1);
  const duplicateIds = [...idCounts.entries()].filter(([, n]) => n > 1).map(([id]) => id);

  const countryRegression = {};
  for (const [key, rows] of Object.entries(countrySnapshots)) {
    countryRegression[key] = {
      before: rows.length,
      after: after[key],
      intact: rows.length === after[key] && countryIntact(rows, catalog),
    };
  }

  const approved = safeValidated.map(r => ({
    id: r.id,
    brand: r.brand,
    name: r.name,
    address: r.address,
    postal_code: r.postal_code,
    city: r.city,
    lat: r.lat,
    lng: r.lng,
    source_url: r.source_url || null,
  }));

  const withheldCount = ACTUAL_READY_COUNT - inserted;
  const rejectionTotal = Object.values(rejected).reduce((a, b) => a + b, 0);

  const iconicMerged = ieLive.filter(c => normalizeBrand(c.brand) === 'iconic health clubs');
  const flyefitMerged = ieLive.filter(c => normalizeBrand(c.brand) === 'flyefit');

  const report = {
    generated: new Date().toISOString(),
    dry_run: dryRun,
    idempotency_check: idempotencyCheck,
    pre_merge_sha256: preMergeSha256,
    baseline: before,
    approved_candidates: ACTUAL_READY_COUNT,
    validated_safe: safeValidated.length,
    inserted,
    withheld: withheldCount,
    withheld_details: withheldDetails,
    after,
    duplicate_ids: duplicateIds,
    rejected,
    brand_breakdown_canonical: brandBreakdown(readyFile),
    brand_breakdown_production: brandBreakdown(ieLive),
    rebrand_validation: {
      one_escape_absent: ieLive.every(c => !/one escape/i.test(`${c.brand} ${c.name}`)),
      flyehub_absent: ieLive.every(c => !/flyehub/i.test(`${c.brand} ${c.name}`)),
      iconic_smithfield_present: !!ieLive.find(
        c => c.id === (rebrandMap.one_escape_to_iconic_smithfield?.id || 'ie_42999953b2'),
      ),
      iconic_count: iconicMerged.length,
      flyefit_count: flyefitMerged.length,
    },
    energie_tallaght_citywest: dupAnalysis.energie_tallaght_citywest,
    pre_merge_validation: {
      candidate_count: ACTUAL_READY_COUNT,
      ie_prefix: readyFile.every(r => /^ie_[a-f0-9]{10}$/.test(String(r.id))),
      duplicate_ids: 0,
      invalid_eircodes: rejected.bad_postal_format,
      missing_addresses: rejected.missing_address,
      missing_cities: rejected.missing_city,
      invalid_coordinates: rejected.invalid_coords + rejected.foreign_coords,
      fallback_coordinates: rejected.fallback_coord,
      northern_ireland_contamination: rejected.northern_ireland,
      mojibake: rejected.mojibake,
      rebrand_conflicts: rejected.legacy_brand,
      staging_exclusions: rejected.wrong_import_status,
      result: rejectionTotal === 0 && withheldCount === 0 ? 'PASS_ALL' : 'PASS_WITH_WITHHOLDS',
    },
    post_merge: {
      ireland_rows: ieLive.length,
      ie_prefix: ieLive.every(c => c.id.startsWith('ie_')),
      duplicate_ids: duplicateIds.length,
      same_brand_lte_25m: postMergeProximity.lt25.length,
      same_brand_lte_50m: postMergeProximity.lt50.length,
      same_brand_lte_100m: postMergeProximity.lt100.length,
      same_brand_lte_200m: postMergeProximity.lt200.length,
      identical_coordinate_clusters: postMergeProximity.identical.length,
      different_brand_colocations: postMergeProximity.diffBrand.length,
    },
    country_regression: countryRegression,
    staging: {
      MERGED_INTO_CATALOG: idempotencyCheck
        ? staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG').length
        : inserted,
      NEEDS_COORDINATES: staging.filter(r => r.import_category === 'NEEDS_COORDINATES').length,
      NEEDS_REVIEW: staging.filter(r => r.import_category === 'NEEDS_REVIEW').length,
      COMING_SOON: staging.filter(r => r.import_category === 'COMING_SOON').length,
      CLOSED: staging.filter(r => r.import_category === 'CLOSED').length,
      EXCLUDED: staging.filter(r => r.import_category === 'EXCLUDED').length,
      DUPLICATE_LEGACY: staging.filter(r =>
        ['DUPLICATE', 'LEGACY'].includes(r.import_category),
      ).length,
    },
    rebrand_map: rebrandMap,
    check_in: {
      CHECK_IN_RADIUS_METERS: 200,
      AUTO_CHECKOUT_DISTANCE_METERS: 200,
      changed: false,
    },
    global_scale: {
      previous_production: EXPECTED_TOTAL_BEFORE,
      new_production: after.total,
      crossed_12500: after.total > 12500,
      global_stress_qa_required_now: false,
    },
    verdict: null,
  };

  if (idempotencyCheck && inserted !== 0) {
    throw new Error(`Idempotency FAIL: second run would insert ${inserted} rows (expected 0)`);
  }

  const wouldWrite = !dryRun && !idempotencyCheck;

  if (wouldWrite) {
    if (inserted === 0) {
      throw new Error('Safe insert count 0 — abort');
    }
    for (const [key, snap] of Object.entries(countrySnapshots)) {
      if (!countryRegression[key].intact) {
        throw new Error(`Country regression: ${key} — abort`);
      }
    }
    if (duplicateIds.length > 0) throw new Error('Duplicate IDs after merge — abort');
    if (after.ireland !== inserted) {
      throw new Error(`Ireland after ${after.ireland} !== inserted ${inserted}`);
    }
    if (after.total !== EXPECTED_TOTAL_AFTER) {
      throw new Error(`Total after ${after.total} !== ${EXPECTED_TOTAL_AFTER}`);
    }
    if (postMergeProximity.lt25.length > 0) {
      throw new Error('Same-brand <=25m after merge — abort');
    }

    fs.writeFileSync(centersPath, JSON.stringify(catalog, null, 2) + '\n', 'utf-8');

    const insertedIdSet = new Set(insertedRows.map(r => r.id));
    for (const r of staging) {
      if (insertedIdSet.has(r.id)) {
        r.import_category = 'MERGED_INTO_CATALOG';
        r.verification_status = 'MERGED_INTO_CATALOG';
      }
      // unresolved / excluded statuses preserved as-is
    }
    for (const w of withheldDetails) {
      const row = stagingById.get(w.id);
      if (row && row.import_category === 'READY_TO_IMPORT') {
        row.import_category = 'NEEDS_REVIEW';
        row.notes = `${row.notes || ''}; merge_withheld:${w.reason}`.trim();
      }
    }
    fs.writeFileSync(stagingPath, JSON.stringify(staging, null, 2) + '\n', 'utf-8');
    report.post_merge_sha256 = sha256File(centersPath);
    report.staging.MERGED_INTO_CATALOG = staging.filter(
      r => r.import_category === 'MERGED_INTO_CATALOG',
    ).length;
    report.staging.NEEDS_COORDINATES = staging.filter(
      r => r.import_category === 'NEEDS_COORDINATES',
    ).length;
    report.staging.NEEDS_REVIEW = staging.filter(r => r.import_category === 'NEEDS_REVIEW').length;
    report.staging.COMING_SOON = staging.filter(r => r.import_category === 'COMING_SOON').length;
    report.staging.CLOSED = staging.filter(r => r.import_category === 'CLOSED').length;
    report.staging.EXCLUDED = staging.filter(r => r.import_category === 'EXCLUDED').length;
    report.staging.DUPLICATE_LEGACY = staging.filter(r =>
      ['DUPLICATE', 'LEGACY'].includes(r.import_category),
    ).length;

    const mergedIds = new Set(
      staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG').map(r => r.id),
    );
    const prodIeIds = new Set(ieLive.map(c => c.id));
    report.staging_reconciliation = {
      production_ie_ids: prodIeIds.size,
      staging_merged_ids: mergedIds.size,
      missing_production_ids: [...mergedIds].filter(id => !prodIeIds.has(id)),
      unexpected_production_ids: [...prodIeIds].filter(id => !mergedIds.has(id)),
      metadata_drift: 'NONE',
    };
    if (
      report.staging_reconciliation.missing_production_ids.length ||
      report.staging_reconciliation.unexpected_production_ids.length
    ) {
      report.staging_reconciliation.metadata_drift = 'DRIFT';
      throw new Error('Staging/production ID drift — abort');
    }
  }

  report.verdict =
    (!idempotencyCheck && inserted === ACTUAL_READY_COUNT && after.ireland === inserted) ||
    (idempotencyCheck && inserted === 0)
      ? 'IRELAND MERGE COMPLETE — WAITING FOR QA'
      : 'IRELAND MERGE BLOCKED';

  const md = `# IRELAND MERGE REPORT

**Generated:** ${report.generated.slice(0, 10)}

## Baseline

| Metric | Value |
|--------|-------|
| Centers before | ${idempotencyCheck ? EXPECTED_TOTAL_AFTER : before.total} |
| Ireland before | ${idempotencyCheck ? ACTUAL_READY_COUNT : before.ireland} |
| Approved candidates | ${ACTUAL_READY_COUNT} |
| Pre-merge SHA256 | \`${preMergeSha256}\` |

## Pre-merge validation

**Result:** ${report.pre_merge_validation.result}

Withheld: ${idempotencyCheck ? 0 : withheldCount}

## Merge result

| Metric | Value |
|--------|-------|
| Inserted | ${idempotencyCheck ? ACTUAL_READY_COUNT : inserted} |
| Centers after | ${after.total} |
| Ireland after | ${after.ireland} |
| Post-merge SHA256 | \`${report.post_merge_sha256 || '(idempotency / dry-run)'}\` |

## Brand breakdown (production)

${Object.entries(brandBreakdown(ieLive))
  .sort((a, b) => b[1] - a[1])
  .map(([b, n]) => `- ${b}: ${n}`)
  .join('\n')}

## Energie Tallaght vs Citywest

${
  report.energie_tallaght_citywest
    ? `- Classification: **${report.energie_tallaght_citywest.classification}**
- Distance: ${report.energie_tallaght_citywest.distance_m} m
- Action: retain both`
    : '- Not found in merge set'
}

## Rebrand safety

- One Escape absent: ${report.rebrand_validation.one_escape_absent}
- FLYEHUB absent: ${report.rebrand_validation.flyehub_absent}
- Iconic Smithfield present: ${report.rebrand_validation.iconic_smithfield_present}

## Check-in

- Radius: 200 m
- Auto-checkout: 200 m
- Changed: **no**

## Global scale

- Previous: ${EXPECTED_TOTAL_BEFORE}
- New: ${after.total}
- 12,500 crossed: **${after.total > 12500 ? 'yes' : 'no'}**
- Global Stress QA required now: **NO**

## Verdict

**${report.verdict}**
`;

  fs.writeFileSync(approvedPath, JSON.stringify(approved, null, 2) + '\n', 'utf-8');
  if (!idempotencyCheck) {
    fs.writeFileSync(dupAnalysisPath, JSON.stringify(dupAnalysis, null, 2) + '\n', 'utf-8');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');
    fs.writeFileSync(mdReportPath, md, 'utf-8');
  } else {
    fs.writeFileSync(
      idempotencyPath,
      JSON.stringify(
        {
          second_run_insertions: inserted,
          final_catalog: before.total,
          ireland: before.ireland,
          pass: inserted === 0,
          note: 'Idempotency check must not overwrite IRELAND_MERGE_REPORT.*',
        },
        null,
        2,
      ) + '\n',
      'utf-8',
    );
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        idempotencyCheck,
        actual_ready_count: ACTUAL_READY_COUNT,
        inserted,
        withheld: withheldCount,
        after,
        verdict: report.verdict,
        pre_merge_sha256: preMergeSha256.slice(0, 16),
        post_merge_sha256: report.post_merge_sha256?.slice(0, 16),
        energie_pair_m: report.energie_tallaght_citywest?.distance_m,
      },
      null,
      2,
    ),
  );

  if (report.verdict.includes('BLOCKED')) {
    process.exitCode = 1;
  }
}

main();
