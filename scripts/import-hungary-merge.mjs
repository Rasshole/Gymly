/**
 * Hungary production-safe merge (Phase 2 canonical READY).
 *
 * Source: data/hungary/HUNGARY_PHASE2_READY_TO_IMPORT.json
 *
 * Usage:
 *   node scripts/import-hungary-merge.mjs --dry-run
 *   node scripts/import-hungary-merge.mjs
 *   node scripts/import-hungary-merge.mjs --idempotency-check
 *
 * Does not promote NEEDS_COORDINATES / NEEDS_REVIEW / COMING_SOON / LEGACY rows.
 * Final total = 11013 + 50 = 11063.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const stagingPath = path.join(root, 'data/hungary/hungary_centers_staging.json');
const readyPath = path.join(root, 'data/hungary/HUNGARY_PHASE2_READY_TO_IMPORT.json');
const phase2ReportPath = path.join(root, 'data/hungary/HUNGARY_PHASE2_READINESS_REPORT.json');
const rebrandPath = path.join(root, 'data/hungary/HUNGARY_PHASE2_REBRAND_MAP.json');
const reportDir = path.join(root, 'data/hungary');
const reportPath = path.join(reportDir, 'HUNGARY_MERGE_REPORT.json');
const mdReportPath = path.join(reportDir, 'HUNGARY_MERGE_REPORT.md');
const dupAnalysisPath = path.join(reportDir, 'HUNGARY_MERGE_DUPLICATE_ANALYSIS.json');
const approvedPath = path.join(reportDir, 'HUNGARY_APPROVED_FOR_MERGE.json');
const idempotencyPath = path.join(reportDir, 'HUNGARY_MERGE_IDEMPOTENCY.json');

const dryRun = process.argv.includes('--dry-run');
const idempotencyCheck = process.argv.includes('--idempotency-check');

const EXPECTED_TOTAL_BEFORE = 11013;
const EXPECTED_READY = 50;
const HU_POSTAL_RE = /^\d{4}$/;
const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE =
  /fallback|invented|centroid|city.?center|postcode.?centroid|capital.?fallback|town.?centroid/i;
const FOREIGN_TEXT_RE =
  /\b(austria|österreich|slovakia|szlovákia|romania|románia|serbia|szerbia|croatia|horvátország|slovenia|szlovénia|ukraine|ukrajna|wien|bratislava|vienna)\b/i;

const EXPECTED_BRAND_BREAKDOWN = {
  Fitness5: 16,
  '4% Fitness': 7,
  'Cutler Gym': 7,
  'Life1 Fitness': 6,
  'Chili Fitness': 5,
  'Thor Gym': 4,
  'Nr1 Fitness': 3,
  'Oxygen Wellness': 1,
  'Prestige Fitness': 1,
};

const BASELINE = {
  total: EXPECTED_TOTAL_BEFORE,
  hungary: 0,
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
};

/** Mirrors isPlausibleHungaryCoordinate in src/utils/gymCountry.ts */
function inHungary(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 45.74 || lat > 48.58 || lng < 16.45 || lng > 22.9) return false;
  if (lat >= 48.02 && lng <= 17.35) return false;
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

function addrBrandKey(r) {
  // Strip parenthetical product suffixes so Garden/OnlyGirls share key intentionally
  // for co-location analysis, but catalog rows keep distinct IDs via distinct addresses.
  return [
    normalizeAddr(String(r.address || '').replace(/\([^)]*\)/g, '')),
    String(r.postal_code || '').trim(),
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
    postal_code: String(r.postal_code || '').trim(),
    city: String(r.city || '').trim(),
    country: 'Hungary',
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

function isGardenOnlyGirlsPair(a, b) {
  const names = [a.name, b.name].map(n => String(n || '').toUpperCase());
  const hasGarden = names.some(n => n.includes('GARDEN'));
  const hasOnly = names.some(n => n.includes('ONLYGIRLS') || n.includes('ONLY GIRLS'));
  return hasGarden && hasOnly && normalizeBrand(a.brand) === '4 fitness';
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
        identical.push({
          a_id: a.id,
          b_id: b.id,
          a_brand: a.brand,
          b_brand: b.brand,
          a_name: a.name,
          b_name: b.name,
          distance_m: 0,
        });
      }
      if (normalizeBrand(a.brand) !== normalizeBrand(b.brand)) {
        if (d <= 100) {
          diffBrand.push({
            a_id: a.id,
            a_brand: a.brand,
            a_name: a.name,
            b_id: b.id,
            b_brand: b.brand,
            b_name: b.name,
            distance_m: Math.round(d),
            classification: 'A_legitimate_different_brand_colocation',
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
    if (
      isGardenOnlyGirlsPair(
        {name: p.a_name, brand: p.brand},
        {name: p.b_name, brand: p.brand},
      )
    ) {
      return {
        ...p,
        classification: 'A_legitimate',
        action: 'retain_both',
        evidence: '4% GARDEN + ONLYGIRLS same building / product co-location (Phase 2)',
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
    if (!p.same_address) {
      return {
        ...p,
        classification: 'A',
        action: 'retain_both',
        evidence: 'Different addresses — dense urban retention',
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

function isAllowedSameBrandLt25(pair) {
  return (
    pair.classification === 'A_legitimate' ||
    isGardenOnlyGirlsPair(
      {name: pair.a_name, brand: pair.brand},
      {name: pair.b_name, brand: pair.brand},
    )
  );
}

function main() {
  const centers = JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8'));
  const readyFile = JSON.parse(fs.readFileSync(readyPath, 'utf8'));
  const phase2Report = fs.existsSync(phase2ReportPath)
    ? JSON.parse(fs.readFileSync(phase2ReportPath, 'utf8'))
    : null;
  const rebrandMap = fs.existsSync(rebrandPath)
    ? JSON.parse(fs.readFileSync(rebrandPath, 'utf8'))
    : {};
  const stagingById = new Map(staging.map(r => [r.id, r]));

  if (!Array.isArray(readyFile) || readyFile.length === 0) {
    throw new Error('HUNGARY_PHASE2_READY_TO_IMPORT.json missing or empty — STOP');
  }

  const ACTUAL_READY_COUNT = readyFile.length;
  const EXPECTED_TOTAL_AFTER = EXPECTED_TOTAL_BEFORE + ACTUAL_READY_COUNT;

  if (ACTUAL_READY_COUNT !== EXPECTED_READY) {
    throw new Error(`READY count is ${ACTUAL_READY_COUNT}, expected ${EXPECTED_READY} — STOP`);
  }

  const brandMismatches = validateBrandBreakdown(brandBreakdown(readyFile), ACTUAL_READY_COUNT);
  if (brandMismatches.length > 0) {
    throw new Error(`Brand breakdown mismatch — STOP: ${JSON.stringify(brandMismatches)}`);
  }

  const readyIds = new Set(readyFile.map(r => r.id));
  if (readyIds.size !== ACTUAL_READY_COUNT) {
    throw new Error('Duplicate IDs inside Phase 2 READY file — STOP');
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

  // Explicit unresolved names must not appear in READY
  const forbiddenNameRe =
    /crush|lotus|rákóczi|rakoczi|vágóhíd|vagohid|miskolc|szolnok|tatabánya|tatabanya|esztergom|coming soon|gilda/i;
  for (const r of readyFile) {
    if (forbiddenNameRe.test(`${r.name} ${r.notes || ''}`) && /lotus|crush|rákóczi|vágóhíd|miskolc|szolnok|tatabánya|gilda|esztergom|sopron|veszprém/i.test(r.name)) {
      // Crush/Lotus etc must not be READY — fail if they slipped in
      if (/4% CRUSH|4% LOTUS|Rákóczi|Vágóhíd|Miskolc|Szolnok|Tatabánya|Gilda|Esztergom|Fitness5 Sopron|Fitness5 Veszprém/i.test(r.name)) {
        throw new Error(`Forbidden unresolved name in READY: ${r.name} — STOP`);
      }
    }
  }

  if (phase2Report && phase2Report.ready_count != null && phase2Report.ready_count !== ACTUAL_READY_COUNT) {
    throw new Error(
      `Phase2 report ready_count=${phase2Report.ready_count}, file=${ACTUAL_READY_COUNT} — STOP`,
    );
  }

  const sourceRows = idempotencyCheck
    ? staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG')
    : staging.filter(r => r.import_category === 'READY_TO_IMPORT');

  if (!idempotencyCheck && sourceRows.length !== ACTUAL_READY_COUNT) {
    throw new Error(
      `Staging READY count ${sourceRows.length} !== Phase2 READY ${ACTUAL_READY_COUNT} — STOP`,
    );
  }

  const stagingReadyIds = new Set(sourceRows.map(r => r.id));
  if (!idempotencyCheck) {
    for (const id of readyIds) {
      if (!stagingReadyIds.has(id)) {
        throw new Error(`Phase2 READY id ${id} missing from staging READY — STOP`);
      }
    }
  }

  if (readyFile.some(r => /gilda/i.test(`${r.brand} ${r.name}`))) {
    throw new Error('Gilda Max present in READY — STOP');
  }

  const preMergeSha256 = sha256File(centersPath);

  const before = {
    total: centers.length,
    hungary: countByCountry(centers, 'Hungary'),
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
    ireland: countByCountry(centers, 'Ireland'),
    czechia: countByCountry(centers, 'Czechia'),
  };

  for (const [key, expected] of Object.entries(BASELINE)) {
    if (idempotencyCheck) {
      if (key === 'hungary' || key === 'total') continue;
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
    ireland: snapshotCountry(centers, 'Ireland'),
    czechia: snapshotCountry(centers, 'Czechia'),
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
    foreign_text: 0,
    mojibake: 0,
    not_active: 0,
    coming_soon: 0,
    closed: 0,
    fallback_coord: 0,
    wrong_import_status: 0,
    dup_id_in_batch: 0,
    not_in_ready_file: 0,
    gilda: 0,
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
    if (!/^hu_[a-f0-9]{10}$/.test(String(r.id || ''))) {
      rejected.missing_id_prefix++;
      withheldDetails.push({id: r.id, reason: 'missing_hu_prefix'});
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
    if (/gilda/i.test(`${r.brand} ${r.name}`)) {
      rejected.gilda++;
      withheldDetails.push({id: r.id, reason: 'gilda_excluded'});
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
    const postal = String(r.postal_code).trim();
    if (!postal || !HU_POSTAL_RE.test(postal)) {
      rejected.bad_postal_format++;
      withheldDetails.push({id: r.id, reason: 'bad_postal_format', postal});
      continue;
    }
    if (!String(r.city || '').trim()) {
      rejected.missing_city++;
      withheldDetails.push({id: r.id, reason: 'missing_city'});
      continue;
    }
    if (String(r.country || '').trim() !== 'Hungary') {
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
    if (!inHungary(lat, lng)) {
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
    if (FOREIGN_TEXT_RE.test(blob)) {
      rejected.foreign_text++;
      withheldDetails.push({id: r.id, reason: 'foreign_text'});
      continue;
    }
    if (!idempotencyCheck && !readyIds.has(r.id)) {
      rejected.not_in_ready_file++;
      withheldDetails.push({id: r.id, reason: 'not_in_ready_file'});
      continue;
    }
    validated.push({...r, postal_code: postal});
  }

  if (!idempotencyCheck && validated.length !== ACTUAL_READY_COUNT) {
    throw new Error(
      `STOP BEFORE WRITE: validated ${validated.length}/${ACTUAL_READY_COUNT}. Withheld: ${JSON.stringify(withheldDetails)}`,
    );
  }

  const preMergeProximity = findProximityPairs(validated);
  const classifiedLt200 = classifyProximityPairs(preMergeProximity.lt200);
  const hardDups = new Set();
  for (const p of classifiedLt200) {
    if (isAllowedSameBrandLt25(p)) continue;
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
  if (!idempotencyCheck && before.hungary === 0 && prodCollisions.length > 0) {
    throw new Error(`STOP: duplicate IDs vs production: ${prodCollisions.join(', ')}`);
  }

  const crossProdLt25 = [];
  for (const r of safeValidated) {
    for (const c of centers) {
      if (!hasValidCoords(c) || !hasValidCoords(r)) continue;
      if (normalizeBrand(c.brand) !== normalizeBrand(r.brand)) continue;
      const d = haversineMeters(Number(r.lat), Number(r.lng), Number(c.lat), Number(c.lng));
      if (d <= 25) {
        crossProdLt25.push({hu_id: r.id, prod_id: c.id, brand: r.brand, distance_m: Math.round(d)});
      }
    }
  }
  if (!idempotencyCheck && crossProdLt25.length > 0) {
    throw new Error(`STOP: same-brand <=25m vs production: ${JSON.stringify(crossProdLt25)}`);
  }

  // For Hungary insert: Garden/OnlyGirls share normalized addr+brand after stripping parens —
  // allow both by using id-aware live set, not addrBrandKey blocking between them.
  const liveIds = new Set(centers.map(c => c.id));
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
    known_legitimate: {
      garden_onlygirls: 'A_legitimate',
      fitness5_thor_savoya: 'A_legitimate_different_brand_colocation',
    },
    cross_production_same_brand_lte_25m: crossProdLt25,
    skipped_existing_id: [],
    withheld: withheldDetails,
    included: [],
  };

  for (const r of safeValidated) {
    const row = toCatalogRow(r);
    if (liveIds.has(row.id) || byId.has(row.id)) {
      dupAnalysis.skipped_existing_id.push({id: row.id, name: row.name});
      continue;
    }
    byId.set(row.id, row);
    liveIds.add(row.id);
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
    const nn = String(a.name).localeCompare(String(b.name), 'hu');
    if (nn !== 0) return nn;
    return String(a.id).localeCompare(String(b.id));
  });

  const existingIds = new Set(centers.map(c => c.id));
  const appended = insertedRows.filter(r => !existingIds.has(r.id));
  const catalog = [...centers, ...appended];

  const after = {
    total: catalog.length,
    hungary: countByCountry(catalog, 'Hungary'),
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
  };

  const huLive = catalog.filter(c => c.country === 'Hungary');
  const postMergeProximity = findProximityPairs(huLive);
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

  const prestigeFay = huLive.find(c => c.id === 'hu_cb9223a0d5');
  const gildaLive = huLive.filter(c => /gilda/i.test(`${c.brand} ${c.name}`));
  const polus = huLive.find(c => /pólus|polus/i.test(`${c.name}`));

  const disallowedLt25 = postMergeProximity.lt25.filter(
    p =>
      !isGardenOnlyGirlsPair(
        {name: p.a_name, brand: p.brand},
        {name: p.b_name, brand: p.brand},
      ),
  );

  const report = {
    generated: new Date().toISOString(),
    dry_run: dryRun,
    idempotency_check: idempotencyCheck,
    pre_merge_sha256: preMergeSha256,
    // Always record the canonical pre-merge baseline (not post-merge live counts).
    baseline: {...BASELINE},
    approved_candidates: ACTUAL_READY_COUNT,
    validated_safe: safeValidated.length,
    inserted,
    withheld: withheldCount,
    withheld_details: withheldDetails,
    after,
    duplicate_ids: duplicateIds,
    rejected,
    brand_breakdown_canonical: brandBreakdown(readyFile),
    brand_breakdown_production: brandBreakdown(huLive),
    rebrand_validation: {
      gilda_max_live: gildaLive.length,
      prestige_fay_id: prestigeFay?.id || null,
      prestige_fay_brand: prestigeFay?.brand || null,
      prestige_fay_address: prestigeFay?.address || null,
      polus_as_fitness5: polus ? polus.brand === 'Fitness5' : null,
      polus_name: polus?.name || null,
      result:
        gildaLive.length === 0 &&
        prestigeFay?.brand === 'Prestige Fitness' &&
        (polus == null || polus.brand === 'Fitness5')
          ? 'PASS'
          : 'FAIL',
    },
    pre_merge_validation: {
      candidate_count: ACTUAL_READY_COUNT,
      hu_prefix: readyFile.every(r => /^hu_[a-f0-9]{10}$/.test(String(r.id))),
      duplicate_ids: 0,
      invalid_postcodes: rejected.bad_postal_format,
      missing_addresses: rejected.missing_address,
      missing_cities: rejected.missing_city,
      invalid_coordinates: rejected.invalid_coords + rejected.foreign_coords,
      fallback_coordinates: rejected.fallback_coord,
      foreign_outliers: rejected.foreign_coords + rejected.foreign_text,
      mojibake: rejected.mojibake,
      rebrand_conflicts: rejected.gilda,
      staging_exclusions: rejected.wrong_import_status,
      result: rejectionTotal === 0 && withheldCount === 0 ? 'PASS_ALL' : 'PASS_WITH_WITHHOLDS',
    },
    post_merge: {
      hungary_rows: huLive.length,
      hu_prefix: huLive.every(c => c.id.startsWith('hu_')),
      duplicate_ids: duplicateIds.length,
      same_brand_lte_25m: postMergeProximity.lt25.length,
      same_brand_lte_25m_disallowed: disallowedLt25.length,
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
    if (after.hungary !== inserted) {
      throw new Error(`Hungary after ${after.hungary} !== inserted ${inserted}`);
    }
    if (after.total !== EXPECTED_TOTAL_AFTER) {
      throw new Error(`Total after ${after.total} !== ${EXPECTED_TOTAL_AFTER}`);
    }
    if (disallowedLt25.length > 0) {
      throw new Error('Disallowed same-brand <=25m after merge — abort');
    }
    if (gildaLive.length !== 0) {
      throw new Error('Gilda Max present after merge — abort');
    }
    if (!prestigeFay || prestigeFay.brand !== 'Prestige Fitness') {
      throw new Error('Prestige Fáy identity missing/wrong after merge — abort');
    }

    fs.writeFileSync(centersPath, JSON.stringify(catalog, null, 2) + '\n', 'utf-8');

    const insertedIdSet = new Set(insertedRows.map(r => r.id));
    for (const r of staging) {
      if (insertedIdSet.has(r.id)) {
        r.import_category = 'MERGED_INTO_CATALOG';
        r.verification_status = 'MERGED_INTO_CATALOG';
      }
    }
    fs.writeFileSync(stagingPath, JSON.stringify(staging, null, 2) + '\n', 'utf-8');
    fs.writeFileSync(approvedPath, JSON.stringify(approved, null, 2) + '\n', 'utf-8');

    // Reconciliation
    const prodHuIds = new Set(huLive.map(c => c.id));
    const approvedIds = new Set(approved.map(a => a.id));
    const mergedIds = new Set(
      staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG').map(r => r.id),
    );
    const missing = [...approvedIds].filter(id => !prodHuIds.has(id) || !mergedIds.has(id));
    const unexpected = [...prodHuIds].filter(id => !approvedIds.has(id));
    let metadataDrift = 'NONE';
    for (const a of approved) {
      const live = huLive.find(c => c.id === a.id);
      if (
        !live ||
        live.brand !== a.brand ||
        live.address !== a.address ||
        live.postal_code !== a.postal_code ||
        live.city !== a.city
      ) {
        metadataDrift = 'DETECTED';
        break;
      }
    }
    report.staging_reconciliation = {
      production_hu_ids: prodHuIds.size,
      staging_merged_ids: mergedIds.size,
      approved_ids: approvedIds.size,
      missing_production_ids: missing,
      unexpected_production_ids: unexpected,
      metadata_drift: metadataDrift,
    };
    report.staging.MERGED_INTO_CATALOG = mergedIds.size;
    report.staging.NEEDS_COORDINATES = staging.filter(
      r => r.import_category === 'NEEDS_COORDINATES',
    ).length;
    report.staging.NEEDS_REVIEW = staging.filter(r => r.import_category === 'NEEDS_REVIEW').length;
    report.staging.COMING_SOON = staging.filter(r => r.import_category === 'COMING_SOON').length;
    report.staging.DUPLICATE_LEGACY = staging.filter(r =>
      ['DUPLICATE', 'LEGACY'].includes(r.import_category),
    ).length;

    report.post_merge_sha256 = sha256File(centersPath);
    report.verdict = 'HUNGARY MERGE COMPLETE — WAITING FOR QA';
  } else if (idempotencyCheck) {
    // Do not overwrite the primary merge report; write idempotency artifact only.
    fs.writeFileSync(
      idempotencyPath,
      JSON.stringify(
        {
          second_run_insertions: inserted,
          pass: inserted === 0,
          final_catalog: centers.length,
          hungary: countByCountry(centers, 'Hungary'),
        },
        null,
        2,
      ) + '\n',
      'utf-8',
    );
    console.log(
      JSON.stringify(
        {
          verdict: 'IDEMPOTENCY PASS',
          inserted,
          after_total: centers.length,
          after_hungary: countByCountry(centers, 'Hungary'),
          dry_run: dryRun,
          idempotency_check: true,
        },
        null,
        2,
      ),
    );
    return;
  } else {
    report.verdict = 'DRY RUN — no write';
  }

  // Performance snapshot (lightweight, comparable)
  const jsonSize = fs.statSync(centersPath).size;
  const tParse0 = Date.now();
  JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const parseMs = Date.now() - tParse0;
  report.performance = {
    catalog: after.total,
    active: catalog.filter(c => c.is_active !== false).length,
    json_size_mb: +(jsonSize / 1024 / 1024).toFixed(2),
    parse_ms: parseMs,
    note: 'Full cold-index/search timings deferred to Production QA; merge-time parse only.',
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');
  fs.writeFileSync(dupAnalysisPath, JSON.stringify(dupAnalysis, null, 2) + '\n', 'utf-8');

  const md = [
    '# HUNGARY MERGE REPORT',
    '',
    `Generated: ${report.generated}`,
    '',
    `## Verdict`,
    '',
    `**${report.verdict}**`,
    '',
    `## Baseline`,
    '',
    `- Centers before: ${before.total}`,
    `- Hungary before: ${before.hungary}`,
    `- Approved candidates: ${ACTUAL_READY_COUNT}`,
    `- Pre-merge SHA256: ${preMergeSha256}`,
    '',
    `## Merge result`,
    '',
    `- Inserted: ${inserted}`,
    `- Withheld: ${withheldCount}`,
    `- Centers after: ${after.total}`,
    `- Hungary after: ${after.hungary}`,
    report.post_merge_sha256 ? `- Post-merge SHA256: ${report.post_merge_sha256}` : '',
    '',
    `## Brand breakdown (production Hungary)`,
    '',
    ...Object.entries(report.brand_breakdown_production || {})
      .sort((a, b) => b[1] - a[1])
      .map(([b, n]) => `- ${b}: ${n}`),
    '',
    `## Rebrand validation`,
    '',
    `- Gilda Max live: ${report.rebrand_validation.gilda_max_live}`,
    `- Prestige Fáy: ${report.rebrand_validation.prestige_fay_brand} (${report.rebrand_validation.prestige_fay_id})`,
    `- Pólus: ${report.rebrand_validation.polus_name || 'n/a'}`,
    `- Result: ${report.rebrand_validation.result}`,
    '',
    `## Check-in`,
    '',
    `- Radius: 200 m`,
    `- Auto-checkout: 200 m`,
    `- Changed: false`,
    '',
  ]
    .filter(Boolean)
    .join('\n');
  fs.writeFileSync(mdReportPath, md + '\n', 'utf-8');

  console.log(
    JSON.stringify(
      {
        verdict: report.verdict,
        inserted,
        after_total: after.total,
        after_hungary: after.hungary,
        dry_run: dryRun,
        idempotency_check: idempotencyCheck,
        pre_merge_sha256: preMergeSha256,
        post_merge_sha256: report.post_merge_sha256 || null,
      },
      null,
      2,
    ),
  );
}

main();
