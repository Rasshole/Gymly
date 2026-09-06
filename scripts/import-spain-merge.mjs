/**
 * Spain production-safe merge.
 *
 * Source of truth (post repair):
 *   primary: data/spain/SPAIN_FINAL_SAFE_TO_MERGE.json (976)
 * Cross-check:
 *   data/spain/spain_centers_staging.json (import_category)
 *   data/spain/SPAIN_PHASE4_READY_TO_IMPORT.json (must match FINAL set)
 *
 * HARD RULES:
 * - Never merge NEEDS_COORDINATES / NEEDS_REVIEW / COMING_SOON / CLOSED / DUPLICATE
 * - Never invent or repair questionable rows — withhold and report
 * - Do NOT include Mesa y López (COMING_SOON) or Forus Porto (Portugal)
 * - If inserted !== 976, STOP without writing centers.json (unless --allow-partial)
 * - Refer to FINAL 976 — the superseded 978 candidate set is obsolete
 *
 * Usage:
 *   node scripts/import-spain-merge.mjs --dry-run
 *   node scripts/import-spain-merge.mjs
 *   node scripts/import-spain-merge.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const readyPath = path.join(root, 'data/spain/SPAIN_FINAL_SAFE_TO_MERGE.json');
const phase4ReadyPath = path.join(root, 'data/spain/SPAIN_PHASE4_READY_TO_IMPORT.json');
const stagingPath = path.join(root, 'data/spain/spain_centers_staging.json');
const reportDir = path.join(root, 'data/spain');
const reportPath = path.join(reportDir, 'SPAIN_MERGE_REPORT.json');
const mdReportPath = path.join(reportDir, 'SPAIN_MERGE_REPORT.md');
const dupAnalysisPath = path.join(reportDir, 'SPAIN_MERGE_DUPLICATE_ANALYSIS.json');
const approvedPath = path.join(reportDir, 'SPAIN_APPROVED_FOR_MERGE.json');

const dryRun = process.argv.includes('--dry-run');
const idempotencyCheck = process.argv.includes('--idempotency-check');
const allowPartial = process.argv.includes('--allow-partial');

// FINAL safe set after pre-merge repair (SPAIN_PREMERGE_REPAIR_REPORT):
// superseded 978 − Mesa y López (COMING_SOON) − Forus Porto (Portugal) = 976.
const EXPECTED_INSERT = 976;
const EXCLUDED_MESA_ID = 'es_e13a21a4c1';
const EXCLUDED_FORUS_PORTO_ID = 'es_42caeb0614';
const ES_POSTAL_RE = /^\d{5}$/;
const MOJIBAKE_RE = /Ã.|�|â€/;

/** Spain geography (mainland + autonomous cities + islands). */
const ES_MAINLAND = {latMin: 35.9, latMax: 43.9, lngMin: -9.5, lngMax: 3.5};
const ES_BALEARIC = {latMin: 38.5, latMax: 40.2, lngMin: 0.8, lngMax: 4.5};
const ES_CANARY = {latMin: 27.5, latMax: 29.5, lngMin: -18.5, lngMax: -13.0};
const ES_CEUTA = {latMin: 35.85, latMax: 35.95, lngMin: -5.40, lngMax: -5.25};
const ES_MELILLA = {latMin: 35.25, latMax: 35.35, lngMin: -2.98, lngMax: -2.90};

function hasValidCoords(r) {
  const lat = Number(r.lat);
  const lng = Number(r.lng);
  return (
    r.lat != null && r.lng != null &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    !(lat === 0 && lng === 0)
  );
}

function spainRegion(lat, lng) {
  if (lat >= ES_CANARY.latMin && lat <= ES_CANARY.latMax &&
      lng >= ES_CANARY.lngMin && lng <= ES_CANARY.lngMax) return 'canary';
  if (lat >= ES_BALEARIC.latMin && lat <= ES_BALEARIC.latMax &&
      lng >= ES_BALEARIC.lngMin && lng <= ES_BALEARIC.lngMax) return 'balearic';
  if (lat >= ES_CEUTA.latMin && lat <= ES_CEUTA.latMax &&
      lng >= ES_CEUTA.lngMin && lng <= ES_CEUTA.lngMax) return 'ceuta';
  if (lat >= ES_MELILLA.latMin && lat <= ES_MELILLA.latMax &&
      lng >= ES_MELILLA.lngMin && lng <= ES_MELILLA.lngMax) return 'melilla';
  if (lat >= ES_MAINLAND.latMin && lat <= ES_MAINLAND.latMax &&
      lng >= ES_MAINLAND.lngMin && lng <= ES_MAINLAND.lngMax) return 'mainland';
  return null;
}

function foreignNeighborHint(lat, lng, city, name) {
  const blob = `${city || ''} ${name || ''}`.toLowerCase();
  // True foreign markers (not Spanish streets named "Portugal" / city Portugalete)
  if (/\bportugal\b/.test(blob) && !/portugalete|avenida de portugal|av\.?\s*de portugal|avd\.?\s*portugal|avenida portugal/.test(blob)) {
    return 'portugal_name';
  }
  if (/\bgibraltar\b/.test(blob)) return 'gibraltar_name';
  if (/\bandorra\b/.test(blob)) return 'andorra_name';
  if (/\b(morocco|maroc|tanger|tangier)\b/.test(blob)) return 'morocco_name';
  // Rough Portugal mainland west of Spanish border
  if (lat >= 36.8 && lat <= 42.2 && lng >= -9.6 && lng <= -6.1 && lng < -9.3) return 'portugal_geo';
  // France north of Pyrenees
  if (lat > 43.0 && lng > -2.0 && lng < 3.5 && lat > 43.75) return 'france_geo';
  // Morocco south of Ceuta/Melilla (not Canaries)
  if (lat < 35.2 && lng > -10 && lng < 0 && !(lat >= ES_CANARY.latMin)) return 'morocco_geo';
  return null;
}

function normalizeBrand(b) {
  return String(b || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeAddr(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
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
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function hasMojibake(text) {
  return MOJIBAKE_RE.test(text);
}

function toCatalogRow(r) {
  return {
    id: r.id,
    name: r.name,
    brand: r.brand,
    address: r.address || '',
    postal_code: String(r.postal_code || '').trim(),
    city: r.city,
    country: 'Spain',
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
    return a && a.lat === c.lat && a.lng === c.lng && a.name === c.name &&
      a.brand === c.brand && a.address === c.address &&
      a.postal_code === c.postal_code && a.city === c.city &&
      a.country === c.country && a.is_active === c.is_active;
  });
}

function encodingIssues(rows) {
  const bad = [];
  for (const r of rows) {
    const blob = `${r.name} ${r.address} ${r.city} ${r.brand}`;
    if (hasMojibake(blob)) {
      bad.push({id: r.id, name: r.name, snippet: blob.slice(0, 80)});
    }
  }
  return bad;
}

function countSpanishLetters(rows) {
  const counts = {
    a_acute: 0, e_acute: 0, i_acute: 0, o_acute: 0, u_acute: 0,
    u_diaeresis: 0, n_tilde: 0, c_cedilla: 0,
  };
  for (const r of rows) {
    const blob = `${r.name}${r.address}${r.city}`;
    counts.a_acute += (blob.match(/[áÁ]/g) || []).length;
    counts.e_acute += (blob.match(/[éÉ]/g) || []).length;
    counts.i_acute += (blob.match(/[íÍ]/g) || []).length;
    counts.o_acute += (blob.match(/[óÓ]/g) || []).length;
    counts.u_acute += (blob.match(/[úÚ]/g) || []).length;
    counts.u_diaeresis += (blob.match(/[üÜ]/g) || []).length;
    counts.n_tilde += (blob.match(/[ñÑ]/g) || []).length;
    counts.c_cedilla += (blob.match(/[çÇ]/g) || []).length;
  }
  return counts;
}

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function main() {
  const centers = JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const readyFile = JSON.parse(fs.readFileSync(readyPath, 'utf8'));
  const phase4Ready = fs.existsSync(phase4ReadyPath)
    ? JSON.parse(fs.readFileSync(phase4ReadyPath, 'utf8'))
    : [];
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8'));
  const stagingById = new Map(staging.map(r => [r.id, r]));

  if (!Array.isArray(readyFile) || readyFile.length !== EXPECTED_INSERT) {
    throw new Error(
      `SPAIN_FINAL_SAFE_TO_MERGE.json count ${readyFile?.length}, expected ${EXPECTED_INSERT}`,
    );
  }

  // Cross-check: Phase-4 READY must equal FINAL safe set (do not use superseded 978 blindly)
  const finalIds = new Set(readyFile.map(r => r.id));
  const phase4Ids = new Set(phase4Ready.map(r => r.id));
  if (phase4Ready.length && (phase4Ready.length !== readyFile.length ||
      [...finalIds].some(id => !phase4Ids.has(id)) ||
      [...phase4Ids].some(id => !finalIds.has(id)))) {
    throw new Error(
      `Cross-check failed: Phase4 READY (${phase4Ready.length}) ≠ FINAL safe (${readyFile.length})`,
    );
  }
  if (finalIds.has(EXCLUDED_MESA_ID) || finalIds.has(EXCLUDED_FORUS_PORTO_ID)) {
    throw new Error('FINAL safe set must not include Mesa y López or Forus Porto');
  }

  const preMergeSha256 = sha256File(centersPath);

  const before = {
    total: centers.length,
    spain: countByCountry(centers, 'Spain'),
    denmark: countByCountry(centers, 'Denmark'),
    sweden: countByCountry(centers, 'Sweden'),
    norway: countByCountry(centers, 'Norway'),
    finland: countByCountry(centers, 'Finland'),
    germany: countByCountry(centers, 'Germany'),
    united_kingdom: countByCountry(centers, 'United Kingdom'),
    netherlands: countByCountry(centers, 'Netherlands'),
    france: countByCountry(centers, 'France'),
  };

  const dkBefore = snapshotCountry(centers, 'Denmark');
  const seBefore = snapshotCountry(centers, 'Sweden');
  const noBefore = snapshotCountry(centers, 'Norway');
  const fiBefore = snapshotCountry(centers, 'Finland');
  const deBefore = snapshotCountry(centers, 'Germany');
  const ukBefore = snapshotCountry(centers, 'United Kingdom');
  const nlBefore = snapshotCountry(centers, 'Netherlands');
  const frBefore = snapshotCountry(centers, 'France');

  const rejected = {
    not_ready: 0, missing_id_prefix: 0, missing_name: 0, missing_brand: 0,
    missing_address: 0, missing_postal: 0, missing_city: 0,
    wrong_country: 0, invalid_coords: 0, bad_postal_format: 0,
    outside_bbox: 0, mojibake: 0, not_active: 0,
    questionable_city: 0, foreign_neighbor: 0,
    staging_mismatch: 0, dup_id_in_batch: 0,
    excluded_mesa_lopez: 0, excluded_forus_porto: 0,
  };
  const rejectedDetails = [];

  // Primary source: SPAIN_FINAL_SAFE_TO_MERGE.json (976). Never merge non-READY staging.
  const readyIdsInFile = new Set(readyFile.map(r => r.id));
  const candidates = readyFile.filter(r => {
    if (r.id === EXCLUDED_MESA_ID) {
      rejected.excluded_mesa_lopez++;
      rejectedDetails.push({id: r.id, reason: 'excluded_mesa_lopez_coming_soon'});
      return false;
    }
    if (r.id === EXCLUDED_FORUS_PORTO_ID) {
      rejected.excluded_forus_porto++;
      rejectedDetails.push({id: r.id, reason: 'excluded_forus_porto_portugal'});
      return false;
    }
    const s = stagingById.get(r.id);
    if (s && s.import_category !== 'READY_TO_IMPORT' && s.import_category !== 'MERGED_INTO_CATALOG') {
      rejected.not_ready++;
      rejectedDetails.push({id: r.id, reason: 'staging_not_ready', value: s.import_category});
      return false;
    }
    return true;
  });

  const seenBatchIds = new Set();
  const approved = [];

  for (const r of candidates) {
    if (!String(r.id || '').startsWith('es_')) {
      rejected.missing_id_prefix++;
      rejectedDetails.push({id: r.id, reason: 'missing_es_prefix'});
      continue;
    }
    if (seenBatchIds.has(r.id)) {
      rejected.dup_id_in_batch++;
      rejectedDetails.push({id: r.id, reason: 'dup_id_in_batch'});
      continue;
    }
    seenBatchIds.add(r.id);

    if (!String(r.name || '').trim()) {
      rejected.missing_name++;
      rejectedDetails.push({id: r.id, reason: 'missing_name'});
      continue;
    }
    if (!String(r.brand || '').trim()) {
      rejected.missing_brand++;
      rejectedDetails.push({id: r.id, reason: 'missing_brand'});
      continue;
    }
    if (!String(r.address || '').trim()) {
      rejected.missing_address++;
      rejectedDetails.push({id: r.id, reason: 'missing_address'});
      continue;
    }
    const postal = String(r.postal_code ?? '').trim();
    if (!postal) {
      rejected.missing_postal++;
      rejectedDetails.push({id: r.id, reason: 'missing_postal', name: r.name, brand: r.brand});
      continue;
    }
    if (!ES_POSTAL_RE.test(postal)) {
      rejected.bad_postal_format++;
      rejectedDetails.push({id: r.id, reason: 'bad_postal_format', value: r.postal_code});
      continue;
    }
    if (!String(r.city || '').trim()) {
      rejected.missing_city++;
      rejectedDetails.push({id: r.id, reason: 'missing_city'});
      continue;
    }
    // House-number leaked into city — withhold, do not repair
    if (/^\d+$/.test(String(r.city).trim())) {
      rejected.questionable_city++;
      rejectedDetails.push({id: r.id, reason: 'questionable_city_numeric', value: r.city, name: r.name});
      continue;
    }
    if (String(r.country || '').trim() !== 'Spain') {
      rejected.wrong_country++;
      rejectedDetails.push({id: r.id, reason: 'wrong_country', value: r.country});
      continue;
    }
    if (!hasValidCoords(r)) {
      rejected.invalid_coords++;
      rejectedDetails.push({id: r.id, reason: 'invalid_coords'});
      continue;
    }
    if (r.is_active !== true) {
      rejected.not_active++;
      rejectedDetails.push({id: r.id, reason: 'not_active'});
      continue;
    }
    const lat = Number(r.lat);
    const lng = Number(r.lng);
    const region = spainRegion(lat, lng);
    if (!region) {
      rejected.outside_bbox++;
      rejectedDetails.push({id: r.id, reason: 'outside_spain_bbox', lat, lng, name: r.name});
      continue;
    }
    const foreign = foreignNeighborHint(lat, lng, r.city, r.name);
    // Only withhold clear foreign markers — not Spanish "Avenida Portugal" / Portugalete
    if (foreign && (foreign.endsWith('_geo') || foreign === 'portugal_name' && /porto\b/i.test(`${r.city} ${r.name}`) && !/porto pi/i.test(`${r.city} ${r.name}`))) {
      rejected.foreign_neighbor++;
      rejectedDetails.push({id: r.id, reason: 'foreign_neighbor', hint: foreign, lat, lng, name: r.name, city: r.city});
      continue;
    }
    const blob = `${r.name} ${r.address} ${r.city} ${r.brand}`;
    if (hasMojibake(blob)) {
      rejected.mojibake++;
      rejectedDetails.push({id: r.id, reason: 'mojibake', snippet: blob.slice(0, 80)});
      continue;
    }
    const s = stagingById.get(r.id);
    if (!s) {
      rejected.staging_mismatch++;
      rejectedDetails.push({id: r.id, reason: 'not_in_staging'});
      continue;
    }
    approved.push(r);
  }

  // Duplicate detection against production + within batch
  const byId = new Map(centers.map(c => [c.id, c]));
  const liveEs = centers.filter(c => c.country === 'Spain');
  const liveAddrBrand = new Set(centers.map(addrBrandKey));

  const dupAnalysis = {
    skipped_existing_id: [],
    skipped_same_addr_brand: [],
    skipped_proximity_same_brand: [],
    skipped_batch_dup: [],
    withheld_questionable: rejectedDetails.filter(d =>
      ['missing_postal', 'questionable_city_numeric', 'foreign_neighbor', 'outside_spain_bbox'].includes(d.reason)),
    included: [],
  };

  let inserted = 0;
  const insertedRows = [];
  const batchAddrBrand = new Set();

  for (const r of approved) {
    const row = toCatalogRow(r);

    if (byId.has(row.id)) {
      dupAnalysis.skipped_existing_id.push({id: row.id, name: row.name});
      continue;
    }

    const k = addrBrandKey(row);
    if (liveAddrBrand.has(k) || batchAddrBrand.has(k)) {
      dupAnalysis.skipped_same_addr_brand.push({id: row.id, name: row.name, key: k});
      continue;
    }

    let proxHit = false;
    for (const live of [...liveEs, ...insertedRows]) {
      if (!hasValidCoords(live)) continue;
      if (normalizeBrand(live.brand) !== normalizeBrand(row.brand)) continue;
      const d = haversineMeters(row.lat, row.lng, Number(live.lat), Number(live.lng));
      if (d < 100) {
        dupAnalysis.skipped_proximity_same_brand.push({
          id: row.id, name: row.name, match_id: live.id, match_name: live.name,
          distance_m: Math.round(d), note: 'same_brand_<100m_withheld',
        });
        proxHit = true;
        break;
      }
    }
    if (proxHit) continue;

    byId.set(row.id, row);
    liveAddrBrand.add(k);
    batchAddrBrand.add(k);
    liveEs.push(row);
    inserted++;
    insertedRows.push(row);
    dupAnalysis.included.push({id: row.id, name: row.name, brand: row.brand});
  }

  const existingIds = new Set(centers.map(c => c.id));
  const appended = insertedRows.filter(r => !existingIds.has(r.id));
  const catalog = [...centers, ...appended];

  const after = {
    total: catalog.length,
    spain: countByCountry(catalog, 'Spain'),
    denmark: countByCountry(catalog, 'Denmark'),
    sweden: countByCountry(catalog, 'Sweden'),
    norway: countByCountry(catalog, 'Norway'),
    finland: countByCountry(catalog, 'Finland'),
    germany: countByCountry(catalog, 'Germany'),
    united_kingdom: countByCountry(catalog, 'United Kingdom'),
    netherlands: countByCountry(catalog, 'Netherlands'),
    france: countByCountry(catalog, 'France'),
  };

  const idCounts = new Map();
  for (const c of catalog) idCounts.set(c.id, (idCounts.get(c.id) || 0) + 1);
  const duplicateIds = [...idCounts.entries()].filter(([, n]) => n > 1).map(([id]) => id);

  const esLive = catalog.filter(c => c.country === 'Spain');
  const sameBrandPhysical = [];
  for (let i = 0; i < esLive.length; i++) {
    for (let j = i + 1; j < esLive.length; j++) {
      const a = esLive[i], b = esLive[j];
      if (!hasValidCoords(a) || !hasValidCoords(b)) continue;
      if (normalizeBrand(a.brand) !== normalizeBrand(b.brand)) continue;
      const d = haversineMeters(a.lat, a.lng, b.lat, b.lng);
      if (d < 100) {
        sameBrandPhysical.push({
          a_id: a.id, a_name: a.name, b_id: b.id, b_name: b.name, distance_m: Math.round(d),
        });
      }
    }
  }

  const enc = encodingIssues(esLive);
  const spanishLetters = countSpanishLetters(esLive);

  const geography = {mainland: 0, balearic: 0, canary: 0, ceuta: 0, melilla: 0, outlier: 0};
  const geoOutliers = [];
  for (const c of esLive) {
    if (!hasValidCoords(c)) continue;
    const reg = spainRegion(Number(c.lat), Number(c.lng));
    if (reg) geography[reg]++;
    else {
      geography.outlier++;
      geoOutliers.push({id: c.id, name: c.name, lat: c.lat, lng: c.lng});
    }
  }

  const postalLeadingZero = esLive.filter(c => String(c.postal_code).startsWith('0')).length;
  const postalOk = esLive.every(c => ES_POSTAL_RE.test(String(c.postal_code || '')));

  const dkIntact = dkBefore.length === after.denmark && countryIntact(dkBefore, catalog);
  const seIntact = seBefore.length === after.sweden && countryIntact(seBefore, catalog);
  const noIntact = noBefore.length === after.norway && countryIntact(noBefore, catalog);
  const fiIntact = fiBefore.length === after.finland && countryIntact(fiBefore, catalog);
  const deIntact = deBefore.length === after.germany && countryIntact(deBefore, catalog);
  const ukIntact = ukBefore.length === after.united_kingdom && countryIntact(ukBefore, catalog);
  const nlIntact = nlBefore.length === after.netherlands && countryIntact(nlBefore, catalog);
  const frIntact = frBefore.length === after.france && countryIntact(frBefore, catalog);

  const byBrand = {};
  for (const r of esLive) byBrand[r.brand] = (byBrand[r.brand] || 0) + 1;
  const brandSum = Object.values(byBrand).reduce((a, b) => a + b, 0);

  const wouldWrite = !dryRun && !idempotencyCheck;
  const insertMismatch = inserted !== EXPECTED_INSERT;
  const stopped = wouldWrite && insertMismatch && !allowPartial;

  // Staging update only when actually writing a successful full merge
  if (wouldWrite && !stopped) {
    const insertedIdSet = new Set(insertedRows.map(r => r.id));
    for (const r of staging) {
      if (insertedIdSet.has(r.id)) {
        r.import_category = 'MERGED_INTO_CATALOG';
      }
    }
  }

  const stagingCats = staging.reduce((acc, r) => {
    acc[r.import_category] = (acc[r.import_category] || 0) + 1;
    return acc;
  }, {});

  const mesaStaging = staging.find(r => r.id === EXCLUDED_MESA_ID);
  const forusStaging = staging.find(r => r.id === EXCLUDED_FORUS_PORTO_ID);
  const mesaInCatalog = catalog.some(c =>
    c.id === EXCLUDED_MESA_ID || /mesa\s*y\s*l[oó]pez/i.test(c.name || ''));
  const forusPortoInSpain = catalog.some(c =>
    c.id === EXCLUDED_FORUS_PORTO_ID ||
    (c.country === 'Spain' && /forus/i.test(c.brand || '') && /porto/i.test(c.name || '')));

  const report = {
    dry_run: dryRun,
    idempotency_check: idempotencyCheck,
    source_of_truth: 'data/spain/SPAIN_FINAL_SAFE_TO_MERGE.json',
    expected_insert: EXPECTED_INSERT,
    superseded_candidate_set: 978,
    note: 'FINAL 976 = superseded 978 − Mesa y López (COMING_SOON) − Forus Porto (Portugal)',
    stopped_short_of_expected: stopped || (insertMismatch && !idempotencyCheck),
    stop_reason: insertMismatch
      ? `inserted ${inserted} !== expected ${EXPECTED_INSERT}; withheld failures (no invent/repair)`
      : null,
    pre_merge_sha256: preMergeSha256,
    ready_file_count: readyFile.length,
    ready_ids_in_file: readyIdsInFile.size,
    phase4_ready_count: phase4Ready.length,
    before,
    after: stopped ? before : after,
    inserted: stopped ? 0 : inserted,
    would_have_inserted: inserted,
    rejected,
    rejected_details: rejectedDetails,
    exclusions: {
      mesa_y_lopez: {
        id: EXCLUDED_MESA_ID,
        in_final_safe: finalIds.has(EXCLUDED_MESA_ID),
        in_catalog: mesaInCatalog,
        staging_category: mesaStaging?.import_category || null,
        staging_name: mesaStaging?.name || null,
        status: 'COMING_SOON — not merged',
      },
      forus_porto: {
        id: EXCLUDED_FORUS_PORTO_ID,
        in_final_safe: finalIds.has(EXCLUDED_FORUS_PORTO_ID),
        in_spain_catalog: forusPortoInSpain,
        staging_category: forusStaging?.import_category || null,
        staging_name: forusStaging?.name || null,
        staging_country: forusStaging?.country || null,
        status: 'Portugal / NEEDS_REVIEW — not merged into Spain',
      },
    },
    spain_by_brand: stopped ? {} : byBrand,
    brand_sum: stopped ? 0 : brandSum,
    duplicate_ids_in_catalog: duplicateIds,
    duplicate_same_brand_physical: sameBrandPhysical,
    encoding_issues: enc,
    spanish_letter_counts: spanishLetters,
    geography: stopped ? null : geography,
    geography_outliers: geoOutliers,
    postal_format_ok: postalOk,
    postal_leading_zero_count: postalLeadingZero,
    countries_intact: {
      dk: dkIntact, se: seIntact, no: noIntact, fi: fiIntact,
      de: deIntact, uk: ukIntact, nl: nlIntact, fr: frIntact,
    },
    staging_categories: stagingCats,
    excluded_still_staged: {
      NEEDS_COORDINATES: staging.filter(r => r.import_category === 'NEEDS_COORDINATES').length,
      NEEDS_REVIEW: staging.filter(r => r.import_category === 'NEEDS_REVIEW').length,
      COMING_SOON: staging.filter(r => r.import_category === 'COMING_SOON').length,
      CLOSED: staging.filter(r => r.import_category === 'CLOSED').length,
      DUPLICATE: staging.filter(r => r.import_category === 'DUPLICATE').length,
      READY_TO_IMPORT: staging.filter(r => r.import_category === 'READY_TO_IMPORT').length,
      MERGED_INTO_CATALOG: staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG').length,
    },
    dupAnalysis_summary: {
      skipped_existing_id: dupAnalysis.skipped_existing_id.length,
      skipped_same_addr_brand: dupAnalysis.skipped_same_addr_brand.length,
      skipped_proximity_same_brand: dupAnalysis.skipped_proximity_same_brand.length,
      withheld_questionable: dupAnalysis.withheld_questionable.length,
      would_include: dupAnalysis.included.length,
    },
    checkpoint_10k: {
      live_after_if_merged: before.total + inserted,
      headroom_to_10k: Math.max(0, 10000 - (before.total + inserted)),
      stress_qa: 'NO',
    },
    check_in_radius_meters: 200,
    auto_checkout_unchanged: true,
  };

  // Safety checks / write gate
  if (wouldWrite) {
    if (before.total !== 7167) {
      throw new Error(`Pre-merge total ${before.total}, expected 7167 — abort`);
    }
    if (before.spain !== 0) {
      throw new Error(`Pre-merge Spain ${before.spain}, expected 0 — abort`);
    }
    if (before.denmark !== 354) throw new Error(`Denmark ${before.denmark}, expected 354`);
    if (before.sweden !== 639) throw new Error(`Sweden ${before.sweden}, expected 639`);
    if (before.norway !== 535) throw new Error(`Norway ${before.norway}, expected 535`);
    if (before.finland !== 429) throw new Error(`Finland ${before.finland}, expected 429`);
    if (before.germany !== 1424) throw new Error(`Germany ${before.germany}, expected 1424`);
    if (before.united_kingdom !== 1474) throw new Error(`UK ${before.united_kingdom}, expected 1474`);
    if (before.netherlands !== 600) throw new Error(`Netherlands ${before.netherlands}, expected 600`);
    if (before.france !== 1712) throw new Error(`France ${before.france}, expected 1712`);

    if (stopped) {
      console.error(`STOP: would insert ${inserted}, expected ${EXPECTED_INSERT}. centers.json NOT modified.`);
    } else {
      if (after.denmark !== 354) throw new Error(`Denmark count ${after.denmark}, expected 354`);
      if (after.sweden !== 639) throw new Error(`Sweden count ${after.sweden}, expected 639`);
      if (after.norway !== 535) throw new Error(`Norway count ${after.norway}, expected 535`);
      if (after.finland !== 429) throw new Error(`Finland count ${after.finland}, expected 429`);
      if (after.germany !== 1424) throw new Error(`Germany count ${after.germany}, expected 1424`);
      if (after.united_kingdom !== 1474) throw new Error(`UK count ${after.united_kingdom}, expected 1474`);
      if (after.netherlands !== 600) throw new Error(`Netherlands count ${after.netherlands}, expected 600`);
      if (after.france !== 1712) throw new Error(`France count ${after.france}, expected 1712`);
      if (after.spain !== EXPECTED_INSERT) throw new Error(`Spain after ${after.spain}, expected ${EXPECTED_INSERT}`);
      if (after.total !== 7167 + EXPECTED_INSERT) throw new Error(`Total after ${after.total}, expected ${7167 + EXPECTED_INSERT}`);
      if (duplicateIds.length > 0) throw new Error(`Duplicate IDs found: ${duplicateIds.join(', ')}`);

      fs.writeFileSync(centersPath, JSON.stringify(catalog, null, 2) + '\n');
      fs.writeFileSync(stagingPath, JSON.stringify(staging, null, 2) + '\n');
      console.log(`Merge written: ${inserted} Spain centers added to centers.json`);
    }
  } else if (idempotencyCheck) {
    console.log(`Idempotency check — would insert ${inserted} (expected 0 after successful merge)`);
  } else {
    console.log(`Dry run — would insert ${inserted} Spain centers (expected ${EXPECTED_INSERT})`);
  }

  const md = `# Spain Merge Report

Generated: ${new Date().toISOString()}

## Status
${stopped
  ? `**STOPPED — did not write centers.json.** Would-insert ${inserted} ≠ expected ${EXPECTED_INSERT}.`
  : dryRun
    ? `**DRY RUN** — would insert ${inserted}.`
    : idempotencyCheck
      ? `**IDEMPOTENCY CHECK** — would insert ${inserted}.`
      : `**MERGED** — inserted ${inserted}.`}

Source of truth: \`SPAIN_FINAL_SAFE_TO_MERGE.json\` (**FINAL 976**, not the superseded 978 candidate set).

## Summary
- **Final safe file count:** ${readyFile.length}
- **Phase4 READY cross-check:** ${phase4Ready.length}
- **Expected insert:** ${EXPECTED_INSERT}
- **Before:** ${before.total} centers (Spain: ${before.spain})
- **Would insert / inserted:** ${inserted}${stopped ? ' (not written)' : ''}
- **After (if written):** ${before.total + inserted} (Spain: ${inserted})
- **Pre-merge SHA256:** \`${preMergeSha256}\`
- **Dry run:** ${dryRun}
- **Idempotency check:** ${idempotencyCheck}

## Exclusions (must NOT be in Spain production)
- **Mesa y López** (\`${EXCLUDED_MESA_ID}\`): staging=${mesaStaging?.import_category || 'missing'}; in_catalog=${mesaInCatalog}; in_final_safe=${finalIds.has(EXCLUDED_MESA_ID)}
- **Forus Porto** (\`${EXCLUDED_FORUS_PORTO_ID}\`): staging=${forusStaging?.import_category || 'missing'} country=${forusStaging?.country || 'n/a'}; in_spain_catalog=${forusPortoInSpain}; in_final_safe=${finalIds.has(EXCLUDED_FORUS_PORTO_ID)}

## Withheld / Rejected
${Object.entries(rejected).filter(([, v]) => typeof v === 'number' && v > 0).map(([k, v]) => `- ${k}: ${v}`).join('\n') || '- None'}

### Missing postal (sample)
${rejectedDetails.filter(d => d.reason === 'missing_postal').slice(0, 20).map(d => `- ${d.id} | ${d.brand} | ${d.name}`).join('\n') || '- None'}

### Questionable numeric city
${rejectedDetails.filter(d => d.reason === 'questionable_city_numeric').map(d => `- ${d.id} | city=${d.value} | ${d.name}`).join('\n') || '- None'}

### Same-brand proximity <100m withheld
${dupAnalysis.skipped_proximity_same_brand.map(d => `- ${d.id} ↔ ${d.match_id} (${d.distance_m}m) | ${d.name}`).join('\n') || '- None'}

## Brand Breakdown (would-include / Spain live)
${Object.entries(insertedRows.reduce((a, r) => { a[r.brand] = (a[r.brand] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]).map(([b, n]) => `- ${b}: ${n}`).join('\n')}
- **Total would-include:** ${inserted}

## Validation
- Duplicate IDs in catalog: ${duplicateIds.length}
- Same-brand physical duplicates (<100m) post-merge: ${sameBrandPhysical.length}
- Encoding issues (mojibake): ${enc.length}
- Postal format OK (would-include): ${postalOk}
- Leading-zero postcodes: ${postalLeadingZero}

## Geography (would-include)
${Object.entries(geography).map(([k, v]) => `- ${k}: ${v}`).join('\n')}
- Outliers: ${geoOutliers.length}

## Spanish Encoding Preserved (would-include set)
${Object.entries(spanishLetters).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

## Country Integrity
| Country | Before | After (projected) | Intact |
|---------|--------|-------------------|--------|
| Denmark | ${before.denmark} | ${after.denmark} | ${dkIntact ? '✓' : '✗'} |
| Sweden | ${before.sweden} | ${after.sweden} | ${seIntact ? '✓' : '✗'} |
| Norway | ${before.norway} | ${after.norway} | ${noIntact ? '✓' : '✗'} |
| Finland | ${before.finland} | ${after.finland} | ${fiIntact ? '✓' : '✗'} |
| Germany | ${before.germany} | ${after.germany} | ${deIntact ? '✓' : '✗'} |
| United Kingdom | ${before.united_kingdom} | ${after.united_kingdom} | ${ukIntact ? '✓' : '✗'} |
| Netherlands | ${before.netherlands} | ${after.netherlands} | ${nlIntact ? '✓' : '✗'} |
| France | ${before.france} | ${after.france} | ${frIntact ? '✓' : '✗'} |
| Spain | ${before.spain} | ${stopped ? before.spain : after.spain} | — |

## Staging Categories
${Object.entries(stagingCats).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

## 10K Checkpoint
- Live if merged: ${before.total + inserted}
- Headroom to 10k: ${Math.max(0, 10000 - (before.total + inserted))}
- Stress QA: NO

## Check-in / Auto-checkout
- CHECK_IN_RADIUS_METERS: 200 (unchanged)
- AUTO_CHECKOUT: unchanged

## Duplicate Analysis
- Skipped (existing ID): ${dupAnalysis.skipped_existing_id.length}
- Skipped (same addr+brand): ${dupAnalysis.skipped_same_addr_brand.length}
- Skipped (proximity <100m): ${dupAnalysis.skipped_proximity_same_brand.length}
`;

  // Write reports (approved = rows that WOULD have been inserted).
  // Preserve a successful merge report when running --idempotency-check after merge.
  if (!(idempotencyCheck && inserted === 0 && before.spain === EXPECTED_INSERT)) {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    fs.writeFileSync(dupAnalysisPath, JSON.stringify(dupAnalysis, null, 2) + '\n');
    fs.writeFileSync(approvedPath, JSON.stringify(insertedRows, null, 2) + '\n');
    fs.writeFileSync(mdReportPath, md);
  } else {
    console.log('Idempotency check: preserving existing SPAIN_MERGE_REPORT* / APPROVED / DUPLICATE_ANALYSIS');
  }

  console.log(JSON.stringify({
    dry_run: dryRun,
    idempotency_check: idempotencyCheck,
    stopped,
    before_total: before.total,
    spain_before: before.spain,
    would_insert: inserted,
    expected_insert: EXPECTED_INSERT,
    after_total_if_written: before.total + inserted,
    rejected_summary: rejected,
    proximity_withheld: dupAnalysis.skipped_proximity_same_brand.length,
    brands_would_include: insertedRows.reduce((a, r) => { a[r.brand] = (a[r.brand] || 0) + 1; return a; }, {}),
    geography,
    dk: before.denmark, se: before.sweden, no: before.norway,
    fi: before.finland, de: before.germany, uk: before.united_kingdom,
    nl: before.netherlands, fr: before.france,
    staging_categories: stagingCats,
    pre_merge_sha256: preMergeSha256,
  }, null, 2));
}

main();
