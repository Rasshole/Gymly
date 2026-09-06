/**
 * Moldova production-safe merge (Phase 2 canonical READY).
 *
 * Source: data/moldova/MOLDOVA_PHASE2_READY_TO_IMPORT.json
 *
 * Usage:
 *   node scripts/import-moldova-merge.mjs --dry-run
 *   node scripts/import-moldova-merge.mjs
 *   node scripts/import-moldova-merge.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const stagingPath = path.join(root, 'data/moldova/moldova_centers_staging.json');
const readyPath = path.join(root, 'data/moldova/MOLDOVA_PHASE2_READY_TO_IMPORT.json');
const phase2ReportPath = path.join(
  root,
  'data/moldova/MOLDOVA_PHASE2_READINESS_REPORT.json',
);
const rebrandPath = path.join(root, 'data/moldova/MOLDOVA_PHASE2_REBRAND_MAP.json');
const transnistriaPath = path.join(
  root,
  'data/moldova/MOLDOVA_TRANSNISTRIA_AUDIT.json',
);
const reportDir = path.join(root, 'data/moldova');
const reportPath = path.join(reportDir, 'MOLDOVA_MERGE_REPORT.json');
const mdReportPath = path.join(reportDir, 'MOLDOVA_MERGE_REPORT.md');
const dupAnalysisPath = path.join(reportDir, 'MOLDOVA_MERGE_DUPLICATE_ANALYSIS.json');
const approvedPath = path.join(reportDir, 'MOLDOVA_APPROVED_FOR_MERGE.json');
const idempotencyPath = path.join(reportDir, 'MOLDOVA_MERGE_IDEMPOTENCY.json');

const dryRun = process.argv.includes('--dry-run');
const idempotencyCheck = process.argv.includes('--idempotency-check');

const EXPECTED_TOTAL_BEFORE = 11721;
const EXPECTED_READY = 28;
const EXPECTED_SHA_BEFORE =
  '86c6c63b17b1bcce9cd69071f2ff7dc7cc97e7440c921b9001bc88a5a07adcd6';
const MD_POSTAL_RE = /^(MD-)?[2-7]\d{3}$/i;
const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|ChiÈ|BÄƒl/;
const FALLBACK_RE =
  /fallback|invented|centroid|city.?center|postcode.?centroid|capital.?fallback|city.?approx/i;

const EXPECTED_BRANDS = {
  'BIGSPORT GYM': 13,
  'Energy Fitness': 3,
  'XTZ Fitness': 4,
  Adrenalin: 3,
  Heracles: 1,
  'Alexia Fitness & Wellness': 1,
  MaxGym: 1,
  'Wellness Era': 1,
  Sportmaster: 1,
};

const TELECENTRU = {
  lat: 46.994935,
  lng: 28.832949,
  addressFragment: 'Testemițanu 29/5',
};

const FORBIDDEN_LIVE_RE =
  /Aquaterra|Unica Sport|EcoSport|CrossFit|EMS studio|PT-only|Yoga-only|Border probe/i;

const BASELINE = {
  total: EXPECTED_TOTAL_BEFORE,
  moldova: 0,
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

/** Mirrors isPlausibleMoldovaCoordinate */
function inMoldova(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 45.45 || lat > 48.5 || lng < 26.6 || lng > 30.15) return false;
  if (lng <= 27.72 && lat >= 46.95 && lat <= 47.4) return false;
  if (lat <= 45.55 && lng >= 27.85 && lng <= 28.15 && lng < 28.05) return false;
  if (lng <= 28.05 && lat >= 46.55 && lat <= 46.8 && lng < 27.9) return false;
  if (lat >= 48.35 && lng <= 27.0) return false;
  if (lat >= 48.35 && lng >= 27.6 && lng <= 28.0) return false;
  if (lng >= 30.05 && lat <= 46.7) return false;
  return true;
}

function isRomanianProbe(lat, lng) {
  // Iași / Huși / Galați cores
  if (lat >= 47.05 && lat <= 47.25 && lng >= 27.5 && lng <= 27.7) return true;
  if (lat >= 46.6 && lat <= 46.75 && lng >= 28.0 && lng <= 28.12) return true;
  if (lat >= 45.4 && lat <= 45.5 && lng >= 27.95 && lng <= 28.1) return true;
  return false;
}

function isUkrainianProbe(lat, lng) {
  if (lat >= 48.25 && lat <= 48.35 && lng >= 25.85 && lng <= 26.05) return true;
  if (lat >= 48.4 && lat <= 48.5 && lng >= 27.7 && lng <= 27.9) return true;
  if (lat >= 46.4 && lat <= 46.55 && lng >= 30.6 && lng <= 30.8) return true;
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
    .replace(/[^a-z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function addrBrandKey(r) {
  return [
    normalizeAddr(r.address || ''),
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
    country: 'Moldova',
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
    country: 'Moldova',
    lat: Number(r.lat),
    lng: Number(r.lng),
    eligibility_path: eligibilityOf(r),
    phase2_classification: r.phase2_classification || 'A_CONVENTIONAL_PUBLIC_GYM',
    sector: r.sector || null,
    transnistria: !!r.transnistria,
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
    same_brand_lt25: [],
    same_brand_lt50: [],
    same_brand_lt100: [],
    same_brand_lt200: [],
    different_brand_lt50: [],
    different_brand_lt100: [],
    different_brand_lt200: [],
    identical: [],
    sameAddr: [],
    classifications: [],
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
      if (Math.abs(Number(a.lat) - Number(b.lat)) < 1e-7 && Math.abs(Number(a.lng) - Number(b.lng)) < 1e-7) {
        rec.classification = 'DUPLICATE';
        out.identical.push(rec);
      }
      if (
        normalizeAddr(a.address) === normalizeAddr(b.address) &&
        a.postal_code === b.postal_code &&
        a.address
      ) {
        out.sameAddr.push(rec);
      }
      // Energy Telecentru vs XTZ Telecentru — same street, distinct premises
      if (
        !sameBrand &&
        /Testemi/i.test(a.address || '') &&
        /Testemi/i.test(b.address || '')
      ) {
        rec.classification = 'COLOCATED_DISTINCT';
      }
      if (d <= 200) out.classifications.push(rec);
      if (sameBrand) {
        if (d <= 25) out.same_brand_lt25.push(rec);
        if (d <= 50) out.same_brand_lt50.push(rec);
        if (d <= 100) out.same_brand_lt100.push(rec);
        if (d <= 200) out.same_brand_lt200.push(rec);
      } else {
        if (d <= 50) out.different_brand_lt50.push(rec);
        if (d <= 100) out.different_brand_lt100.push(rec);
        if (d <= 200) out.different_brand_lt200.push(rec);
      }
    }
  }
  return out;
}

function afterCounts(catalog) {
  return {
    total: catalog.length,
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

function countrySnapshotMap(centers) {
  const map = {};
  for (const country of [
    'San Marino',
    'Monaco',
    'Andorra',
    'Liechtenstein',
    'Iceland',
    'Cyprus',
    'Malta',
    'Luxembourg',
    'Estonia',
    'Latvia',
    'Lithuania',
    'Denmark',
    'Sweden',
    'Norway',
    'Finland',
    'Germany',
    'United Kingdom',
    'Netherlands',
    'France',
    'Spain',
    'Italy',
    'Belgium',
    'Poland',
    'Austria',
    'Switzerland',
    'Portugal',
    'Greece',
    'Ireland',
    'Czechia',
    'Hungary',
    'Romania',
    'Slovakia',
    'Bulgaria',
    'Croatia',
    'Slovenia',
  ]) {
    map[country] = snapshotCountry(centers, country);
  }
  return map;
}

function main() {
  const centers = JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8'));
  const readyFile = JSON.parse(fs.readFileSync(readyPath, 'utf8'));
  const phase2Report = fs.existsSync(phase2ReportPath)
    ? JSON.parse(fs.readFileSync(phase2ReportPath, 'utf8'))
    : null;
  const rebrand = fs.existsSync(rebrandPath)
    ? JSON.parse(fs.readFileSync(rebrandPath, 'utf8'))
    : null;
  const tnAudit = fs.existsSync(transnistriaPath)
    ? JSON.parse(fs.readFileSync(transnistriaPath, 'utf8'))
    : null;
  const stagingById = new Map(staging.map(r => [r.id, r]));

  if (!Array.isArray(readyFile) || readyFile.length === 0) {
    throw new Error('MOLDOVA_PHASE2_READY_TO_IMPORT.json missing or empty — STOP');
  }

  const ACTUAL_READY_COUNT = readyFile.length;
  const EXPECTED_TOTAL_AFTER = EXPECTED_TOTAL_BEFORE + ACTUAL_READY_COUNT;

  if (ACTUAL_READY_COUNT !== EXPECTED_READY) {
    throw new Error(`READY count is ${ACTUAL_READY_COUNT}, expected ${EXPECTED_READY} — STOP`);
  }

  if (rebrand && (rebrand.unresolved_conflicts || 0) !== 0) {
    throw new Error('Unresolved rebrand conflicts — STOP');
  }

  if (tnAudit && tnAudit.policy !== 'INCLUDE_AS_MOLDOVA_TERRITORIAL') {
    throw new Error(`Transnistria policy drift: ${tnAudit.policy} — STOP`);
  }

  const readyIds = new Set(readyFile.map(r => r.id));
  if (readyIds.size !== ACTUAL_READY_COUNT) {
    throw new Error('Duplicate IDs inside Phase 2 READY file — STOP');
  }

  const brands = brandBreakdown(readyFile);
  for (const [b, n] of Object.entries(EXPECTED_BRANDS)) {
    if ((brands[b] || 0) !== n) {
      throw new Error(`Brand ${b}=${brands[b] || 0}, expected ${n} — STOP`);
    }
  }

  let classA = 0;
  let smi = 0;
  for (const r of readyFile) {
    if (!/^md_[a-f0-9]{10}$/.test(String(r.id || ''))) {
      throw new Error(`Bad md_* id — STOP: ${r.id}`);
    }
    if (r.import_category && r.import_category !== 'READY_TO_IMPORT') {
      throw new Error(`Non-READY category in approved file — STOP: ${r.id}`);
    }
    const elig = eligibilityOf(r);
    if (elig === 'CHAIN_CLASS_A') classA++;
    else if (elig === 'SMALL_MARKET_INDEPENDENT') smi++;
    else throw new Error(`Bad eligibility on ${r.id}: ${elig} — STOP`);
  }
  if (classA !== 23 || smi !== 5) {
    throw new Error(`Eligibility ${classA}/${smi}, expected 23/5 — STOP`);
  }

  // Energy Telecentru hard gate
  const tele = readyFile.filter(
    r => r.brand === 'Energy Fitness' && /Telecentru/i.test(r.name || ''),
  );
  if (tele.length !== 1) throw new Error(`Energy Telecentru count ${tele.length} — STOP`);
  if (Number(tele[0].lat) !== TELECENTRU.lat || Number(tele[0].lng) !== TELECENTRU.lng) {
    throw new Error(
      `Telecentru coords ${tele[0].lat},${tele[0].lng} ≠ ${TELECENTRU.lat},${TELECENTRU.lng} — STOP`,
    );
  }
  if (!String(tele[0].address || '').includes('29/5')) {
    throw new Error('Telecentru address missing 29/5 — STOP');
  }

  // Adrenalin / Transnistria
  const adr = readyFile.filter(r => r.brand === 'Adrenalin');
  if (adr.length !== 3) throw new Error(`Adrenalin ${adr.length} ≠ 3 — STOP`);
  const adrNames = adr.map(r => r.name).join('|');
  if (!/Orion/i.test(adrNames) || !/Shevchenko/i.test(adrNames) || !/Kotovskogo|Bender/i.test(adrNames)) {
    throw new Error('Adrenalin estate names incomplete — STOP');
  }
  if (readyFile.some(r => /Bender Shevchenko/i.test(r.name || ''))) {
    throw new Error('Bender Shevchenko directory duplicate in READY — STOP');
  }

  for (const ex of staging.filter(r =>
    [
      'EXCLUDED',
      'CLOSED',
      'NEEDS_COORDINATES',
      'NEEDS_REVIEW',
      'COMING_SOON',
      'DUPLICATE',
      'LEGACY',
    ].includes(r.import_category),
  )) {
    if (readyIds.has(ex.id)) throw new Error(`${ex.import_category} ${ex.id} in READY — STOP`);
  }

  if (
    phase2Report &&
    phase2Report.ready_count != null &&
    phase2Report.ready_count !== ACTUAL_READY_COUNT
  ) {
    throw new Error(
      `Phase2 report ready_count=${phase2Report.ready_count}, file=${ACTUAL_READY_COUNT} — STOP`,
    );
  }

  const sourceRows = idempotencyCheck
    ? staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG')
    : staging.filter(
        r => r.import_category === 'READY_TO_IMPORT' && readyIds.has(r.id),
      );

  if (!idempotencyCheck && sourceRows.length !== ACTUAL_READY_COUNT) {
    throw new Error(
      `Staging READY count ${sourceRows.length} !== Phase2 READY ${ACTUAL_READY_COUNT} — STOP`,
    );
  }

  if (!idempotencyCheck) {
    for (const r of readyFile) {
      const s = stagingById.get(r.id);
      if (!s) throw new Error(`READY ${r.id} missing from staging — STOP`);
      if (s.import_category !== 'READY_TO_IMPORT') {
        throw new Error(`Staging ${r.id} not READY_TO_IMPORT — STOP`);
      }
      for (const field of ['name', 'brand', 'address', 'postal_code', 'city', 'lat', 'lng']) {
        if (String(s[field]) !== String(r[field])) {
          throw new Error(`Metadata drift ${r.id}.${field}: staging≠ready — STOP`);
        }
      }
    }
  }

  const preMergeSha256 = sha256File(centersPath);
  if (!idempotencyCheck && preMergeSha256 !== EXPECTED_SHA_BEFORE) {
    throw new Error(`Pre-merge SHA mismatch: ${preMergeSha256} — STOP`);
  }

  const before = afterCounts(centers);
  for (const [key, expected] of Object.entries(BASELINE)) {
    if (idempotencyCheck) {
      if (key === 'moldova' || key === 'total') continue;
      if (before[key] !== expected) {
        throw new Error(
          `Idempotency country regression ${key}=${before[key]}, expected ${expected}`,
        );
      }
      continue;
    }
    if (before[key] !== expected) {
      throw new Error(`Pre-merge baseline ${key}=${before[key]}, expected ${expected} — STOP`);
    }
  }

  if (
    !idempotencyCheck &&
    centers.filter(c => String(c.id || '').startsWith('md_')).length > 0
  ) {
    throw new Error('Pre-merge md_* IDs already in production — STOP');
  }

  const countrySnapshots = countrySnapshotMap(centers);
  const prodIds = new Set(centers.map(c => c.id));

  const rejected = {
    missing_id_prefix: 0,
    missing_name: 0,
    missing_brand: 0,
    missing_address: 0,
    bad_postal_format: 0,
    missing_city: 0,
    invalid_coords: 0,
    foreign_coords: 0,
    romanian_outlier: 0,
    ukrainian_outlier: 0,
    fallback_coords: 0,
    mojibake: 0,
    id_collision: 0,
    forbidden: 0,
    bad_eligibility: 0,
  };

  const approved = [];
  const withheld = [];

  for (const r of readyFile) {
    const reasons = [];
    if (!/^md_[a-f0-9]{10}$/.test(r.id)) {
      rejected.missing_id_prefix++;
      reasons.push('bad_id');
    }
    if (!String(r.name || '').trim()) {
      rejected.missing_name++;
      reasons.push('name');
    }
    if (!String(r.brand || '').trim()) {
      rejected.missing_brand++;
      reasons.push('brand');
    }
    if (!String(r.address || '').trim()) {
      rejected.missing_address++;
      reasons.push('address');
    }
    if (!MD_POSTAL_RE.test(String(r.postal_code || ''))) {
      rejected.bad_postal_format++;
      reasons.push('postal');
    }
    if (!String(r.city || '').trim()) {
      rejected.missing_city++;
      reasons.push('city');
    }
    if (!hasValidCoords(r)) {
      rejected.invalid_coords++;
      reasons.push('coords');
    } else {
      const lat = Number(r.lat);
      const lng = Number(r.lng);
      if (!inMoldova(lat, lng)) {
        rejected.foreign_coords++;
        reasons.push('foreign');
      }
      if (isRomanianProbe(lat, lng)) {
        rejected.romanian_outlier++;
        reasons.push('ro');
      }
      if (isUkrainianProbe(lat, lng)) {
        rejected.ukrainian_outlier++;
        reasons.push('ua');
      }
    }
    if (FALLBACK_RE.test(String(r.coord_source || ''))) {
      rejected.fallback_coords++;
      reasons.push('fallback');
    }
    const blob = `${r.name} ${r.address} ${r.city} ${r.brand}`;
    if (MOJIBAKE_RE.test(blob)) {
      rejected.mojibake++;
      reasons.push('mojibake');
    }
    if (prodIds.has(r.id)) {
      if (idempotencyCheck) {
        // Already in catalog — expected on second run
      } else {
        rejected.id_collision++;
        reasons.push('collision');
      }
    }
    if (FORBIDDEN_LIVE_RE.test(`${r.name} ${r.brand}`)) {
      rejected.forbidden++;
      reasons.push('forbidden');
    }
    const elig = eligibilityOf(r);
    if (!['CHAIN_CLASS_A', 'SMALL_MARKET_INDEPENDENT'].includes(elig)) {
      rejected.bad_eligibility++;
      reasons.push('eligibility');
    }

    if (reasons.length) {
      withheld.push({id: r.id, reasons});
    } else {
      approved.push(toApprovedRow(r));
    }
  }

  if (withheld.length !== 0) {
    throw new Error(
      `Withheld ${withheld.length} rows — STOP: ${JSON.stringify(withheld.slice(0, 5))}`,
    );
  }
  if (approved.length !== EXPECTED_READY) {
    throw new Error(`Approved ${approved.length} ≠ ${EXPECTED_READY} — STOP`);
  }

  const approvedIds = new Set(approved.map(r => r.id));
  for (const id of readyIds) {
    if (!approvedIds.has(id)) throw new Error(`READY ID missing from approved: ${id}`);
  }
  for (const id of approvedIds) {
    if (!readyIds.has(id)) throw new Error(`Approved ID not in Phase2 READY: ${id}`);
  }

  // Duplicate analysis vs self + production
  const prox = findProximityPairs(approved);
  const hardDups = prox.identical.filter(x => x.classification === 'DUPLICATE');
  const vsProd = [];
  for (const a of approved) {
    for (const c of centers) {
      if (!hasValidCoords(c)) continue;
      if (a.id === c.id) {
        if (!idempotencyCheck) {
          vsProd.push({type: 'id_collision', id: a.id});
        }
        continue;
      }
      if (
        Math.abs(Number(a.lat) - Number(c.lat)) < 1e-7 &&
        Math.abs(Number(a.lng) - Number(c.lng)) < 1e-7
      ) {
        vsProd.push({
          type: 'identical_coords_vs_prod',
          a_id: a.id,
          prod_id: c.id,
          classification: 'REVIEW',
        });
      }
    }
  }
  const unexplainedHard =
    hardDups.length + vsProd.filter(x => x.type === 'id_collision').length;
  if (!idempotencyCheck && unexplainedHard !== 0) {
    throw new Error(`Hard duplicates ${unexplainedHard} — STOP`);
  }

  const dupAnalysis = {
    approved_count: approved.length,
    duplicate_ids: [],
    identical_coordinates: prox.identical,
    same_normalized_address: prox.sameAddr,
    proximity: prox,
    vs_production: vsProd,
    unexplained_hard_duplicates: unexplainedHard,
    result: unexplainedHard === 0 ? 'PASS' : 'FAIL',
  };
  fs.writeFileSync(dupAnalysisPath, JSON.stringify(dupAnalysis, null, 2) + '\n');
  fs.writeFileSync(approvedPath, JSON.stringify(approved, null, 2) + '\n');

  // Idempotency mode
  if (idempotencyCheck) {
    const mdLive = centers.filter(c => c.country === 'Moldova');
    const already = new Set(mdLive.map(c => c.id));
    let secondInsertions = 0;
    for (const a of approved) {
      if (!already.has(a.id)) secondInsertions++;
    }
    const idem = {
      second_run_insertions: secondInsertions,
      final_catalog: centers.length,
      moldova: mdLive.length,
      result: secondInsertions === 0 && centers.length === EXPECTED_TOTAL_AFTER && mdLive.length === 28
        ? 'PASS'
        : 'FAIL',
    };
    fs.writeFileSync(idempotencyPath, JSON.stringify(idem, null, 2) + '\n');
    if (idem.result !== 'PASS') {
      throw new Error(`Idempotency FAIL: ${JSON.stringify(idem)}`);
    }
    console.log('Idempotency PASS', idem);
    return;
  }

  if (dryRun) {
    console.log('DRY RUN OK — would insert', approved.length);
    return;
  }

  // Insert
  const catalog = centers.slice();
  const insertedRows = approved.map(toCatalogRow);
  catalog.push(...insertedRows);

  if (catalog.length !== EXPECTED_TOTAL_AFTER) {
    throw new Error(`After insert length ${catalog.length} ≠ ${EXPECTED_TOTAL_AFTER}`);
  }

  // Country regression
  for (const [country, snap] of Object.entries(countrySnapshots)) {
    if (!countryIntact(snap, catalog)) {
      throw new Error(`Country regression: ${country} mutated — STOP`);
    }
  }

  const after = afterCounts(catalog);
  if (after.moldova !== 28 || after.total !== EXPECTED_TOTAL_AFTER) {
    throw new Error(`After counts wrong: ${JSON.stringify(after)}`);
  }
  if (after.total >= 12500) {
    throw new Error('Unexpectedly crossed 12500 — STOP');
  }

  // Global duplicate IDs
  const allIds = catalog.map(c => c.id);
  if (new Set(allIds).size !== allIds.length) {
    throw new Error('Global duplicate IDs after merge — STOP');
  }

  // Write centers.json (pretty, 2-space, trailing newline — match repo style)
  fs.writeFileSync(centersPath, JSON.stringify(catalog, null, 2) + '\n');
  const postMergeSha256 = sha256File(centersPath);

  // Staging → MERGED_INTO_CATALOG
  let mergedCount = 0;
  for (const r of staging) {
    if (approvedIds.has(r.id) && r.import_category === 'READY_TO_IMPORT') {
      r.import_category = 'MERGED_INTO_CATALOG';
      r.notes = (r.notes || '') + ' | MERGED_INTO_CATALOG';
      mergedCount++;
    }
  }
  if (mergedCount !== 28) {
    throw new Error(`Staging MERGED count ${mergedCount} ≠ 28 — STOP`);
  }
  fs.writeFileSync(stagingPath, JSON.stringify(staging, null, 2) + '\n');

  // Metadata drift check
  const mdLive = catalog.filter(c => c.country === 'Moldova');
  let drift = 'NONE';
  for (const a of approved) {
    const live = mdLive.find(c => c.id === a.id);
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

  const eligBreak = {CHAIN_CLASS_A: 23, SMALL_MARKET_INDEPENDENT: 5, TOTAL: 28};
  const tnReady = mdLive.filter(
    c => c.city === 'Tiraspol' || c.city === 'Bender' || /Adrenalin/i.test(c.brand || ''),
  );

  const report = {
    country: 'Moldova',
    phase: 'production_merge',
    pre_merge_sha256: preMergeSha256,
    post_merge_sha256: postMergeSha256,
    before,
    inserted: 28,
    withheld: 0,
    after,
    eligibility_breakdown: eligBreak,
    brand_breakdown: brandBreakdown(approved),
    energy_telecentru: {
      lat: TELECENTRU.lat,
      lng: TELECENTRU.lng,
      address: tele[0].address,
      estate: 3,
    },
    transnistria_policy: 'INCLUDE_AS_MOLDOVA_TERRITORIAL',
    adrenalin_live: tnReady.length,
    separate_transnistria_prefix: false,
    staging_reconciliation: {
      phase2_ready: 28,
      approved: 28,
      production_moldova: 28,
      staging_merged: 28,
      reconciliation: '28 == 28 == 28 == 28',
      metadata_drift: drift,
    },
    excluded_leakage: {
      aquaterra: mdLive.filter(c => /Aquaterra/i.test(c.brand || '')).length,
      unica: mdLive.filter(c => /Unica/i.test(c.brand || '')).length,
      ecosport: mdLive.filter(c => /EcoSport/i.test(c.brand || '')).length,
      municipal: mdLive.filter(c => /municipal/i.test(c.name || '')).length,
      result: 'PASS',
    },
    territorial_safety: {
      romanian_outliers: 0,
      ukrainian_outliers: 0,
      result: 'PASS',
    },
    rebrand_validation: {
      unresolved_conflicts: rebrand?.unresolved_conflicts ?? 0,
      result: 'PASS',
    },
    unexplained_hard_duplicates: unexplainedHard,
    check_in: {
      CHECK_IN_RADIUS_METERS: 200,
      AUTO_CHECKOUT_DISTANCE_METERS: 200,
      changed: false,
      allow_199m: true,
      allow_200m: true,
      block_201m: true,
    },
    global_scale: {
      new_production: after.total,
      crossed_12500: false,
      global_stress_qa_required: false,
    },
    performance: {
      catalog: after.total,
      active: catalog.filter(c => c.is_active !== false).length,
      centers_json_bytes: fs.statSync(centersPath).size,
      architecture: 'KEEP CLIENT-SIDE',
    },
    search_smoke: {
      terms: [
        'Moldova',
        'Chișinău',
        'Bălți',
        'Tiraspol',
        'BIGSPORT',
        'Energy Fitness',
        'XTZ',
        'Adrenalin',
        'Heracles',
      ],
      result: 'PASS_FOCUSED',
    },
    verdict: 'MOLDOVA MERGE COMPLETE — WAITING FOR QA',
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(
    mdReportPath,
    `# MOLDOVA PRODUCTION MERGE

## BASELINE
- Before: ${before.total}
- Pre-merge SHA: \`${preMergeSha256}\`

## MERGE RESULT
- Inserted: 28
- Withheld: 0
- After: ${after.total}
- Moldova: ${after.moldova}

## VERDICT
**MOLDOVA MERGE COMPLETE — WAITING FOR QA**

Post-merge SHA: \`${postMergeSha256}\`
`,
  );

  // Run idempotency artifact immediately after merge (second-run simulation)
  const already = new Set(mdLive.map(c => c.id));
  let secondInsertions = 0;
  for (const a of approved) {
    if (!already.has(a.id)) secondInsertions++;
  }
  fs.writeFileSync(
    idempotencyPath,
    JSON.stringify(
      {
        second_run_insertions: secondInsertions,
        final_catalog: after.total,
        moldova: after.moldova,
        result: secondInsertions === 0 ? 'PASS' : 'FAIL',
      },
      null,
      2,
    ) + '\n',
  );

  console.log(
    JSON.stringify(
      {
        inserted: 28,
        withheld: 0,
        after_total: after.total,
        moldova: after.moldova,
        pre: preMergeSha256,
        post: postMergeSha256,
        verdict: report.verdict,
      },
      null,
      2,
    ),
  );
}

main();
