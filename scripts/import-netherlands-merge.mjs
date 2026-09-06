/**
 * Netherlands production-safe merge.
 *
 * Merges ONLY READY_TO_IMPORT rows from data/netherlands/netherlands_centers_staging.json
 * into src/data/centers.json.
 *
 * Usage:
 *   node scripts/import-netherlands-merge.mjs --dry-run
 *   node scripts/import-netherlands-merge.mjs
 *   node scripts/import-netherlands-merge.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const stagingPath = path.join(root, 'data/netherlands/netherlands_centers_staging.json');
const reportDir = path.join(root, 'data/netherlands');
const reportPath = path.join(reportDir, 'NETHERLANDS_MERGE_REPORT.json');
const mdReportPath = path.join(reportDir, 'NETHERLANDS_MERGE_REPORT.md');
const dupAnalysisPath = path.join(reportDir, 'NETHERLANDS_MERGE_DUPLICATE_ANALYSIS.json');

const dryRun = process.argv.includes('--dry-run');
const idempotencyCheck = process.argv.includes('--idempotency-check');

const NL_BOUNDS = {latMin: 50.75, latMax: 53.55, lngMin: 3.35, lngMax: 7.25};
const DUTCH_POSTAL_RE = /^\d{4}\s[A-Z]{2}$/;
const MOJIBAKE_RE = /Ã.|�|â€/;

const SPORTCITY_ALIASES = ['sportcity', 'fit for free'];
const TRAINMORE_BRAND = 'trainmore';

function hasValidCoords(r) {
  const lat = Number(r.lat);
  const lng = Number(r.lng);
  return (
    r.lat != null && r.lng != null &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    !(lat === 0 && lng === 0)
  );
}

function inNlBbox(lat, lng) {
  return lat >= NL_BOUNDS.latMin && lat <= NL_BOUNDS.latMax &&
         lng >= NL_BOUNDS.lngMin && lng <= NL_BOUNDS.lngMax;
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

function isSportCityAlias(brand) {
  const nb = normalizeBrand(brand);
  return SPORTCITY_ALIASES.includes(nb);
}

function isApprovedReady(r) {
  if (r.import_category !== 'READY_TO_IMPORT') return false;
  if (!String(r.id || '').startsWith('nl_')) return false;
  if (!String(r.name || '').trim()) return false;
  if (!String(r.brand || '').trim()) return false;
  if (!String(r.address || '').trim()) return false;
  if (!String(r.postal_code || '').trim()) return false;
  if (!String(r.city || '').trim()) return false;
  if (String(r.country || '').trim() !== 'Netherlands') return false;
  if (!hasValidCoords(r)) return false;
  if (!DUTCH_POSTAL_RE.test(String(r.postal_code || '').trim())) return false;
  const lat = Number(r.lat);
  const lng = Number(r.lng);
  if (!inNlBbox(lat, lng)) return false;
  const blob = `${r.name} ${r.address} ${r.city} ${r.brand}`;
  if (hasMojibake(blob)) return false;
  if (r.is_active === false) return false;
  return true;
}

function toCatalogRow(r) {
  return {
    id: r.id,
    name: r.name,
    brand: r.brand,
    address: r.address || '',
    postal_code: String(r.postal_code || '').trim(),
    city: r.city,
    country: 'Netherlands',
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

function countDutchLetters(rows) {
  let counts = {e_acute: 0, e_diaeresis: 0, i_diaeresis: 0, o_diaeresis: 0, u_diaeresis: 0, a_acute: 0};
  for (const r of rows) {
    const blob = `${r.name}${r.address}${r.city}`;
    counts.e_acute += (blob.match(/é/gi) || []).length;
    counts.e_diaeresis += (blob.match(/ë/gi) || []).length;
    counts.i_diaeresis += (blob.match(/ï/gi) || []).length;
    counts.o_diaeresis += (blob.match(/ö/gi) || []).length;
    counts.u_diaeresis += (blob.match(/ü/gi) || []).length;
    counts.a_acute += (blob.match(/á/gi) || []).length;
  }
  return counts;
}

function main() {
  const centers = JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8'));

  const before = {
    total: centers.length,
    netherlands: countByCountry(centers, 'Netherlands'),
    denmark: countByCountry(centers, 'Denmark'),
    sweden: countByCountry(centers, 'Sweden'),
    norway: countByCountry(centers, 'Norway'),
    finland: countByCountry(centers, 'Finland'),
    germany: countByCountry(centers, 'Germany'),
    united_kingdom: countByCountry(centers, 'United Kingdom'),
  };

  const dkBefore = snapshotCountry(centers, 'Denmark');
  const seBefore = snapshotCountry(centers, 'Sweden');
  const noBefore = snapshotCountry(centers, 'Norway');
  const fiBefore = snapshotCountry(centers, 'Finland');
  const deBefore = snapshotCountry(centers, 'Germany');
  const ukBefore = snapshotCountry(centers, 'United Kingdom');

  // Validation tracking
  const rejected = {
    not_ready: 0, missing_id_prefix: 0, missing_name: 0, missing_brand: 0,
    missing_address: 0, missing_postal: 0, missing_city: 0,
    wrong_country: 0, invalid_coords: 0, bad_postal_format: 0,
    outside_bbox: 0, mojibake: 0, not_active: 0,
    sportcity_fitforfree_dup: [], trainmore_tier_dup: [],
  };

  const candidates = staging.filter(r => r.import_category === 'READY_TO_IMPORT');
  const approved = [];
  const rejectedDetails = [];

  for (const r of candidates) {
    if (!String(r.id || '').startsWith('nl_')) { rejected.missing_id_prefix++; rejectedDetails.push({id: r.id, reason: 'missing_nl_prefix'}); continue; }
    if (!String(r.name || '').trim()) { rejected.missing_name++; rejectedDetails.push({id: r.id, reason: 'missing_name'}); continue; }
    if (!String(r.brand || '').trim()) { rejected.missing_brand++; rejectedDetails.push({id: r.id, reason: 'missing_brand'}); continue; }
    if (!String(r.address || '').trim()) { rejected.missing_address++; rejectedDetails.push({id: r.id, reason: 'missing_address'}); continue; }
    if (!String(r.postal_code || '').trim()) { rejected.missing_postal++; rejectedDetails.push({id: r.id, reason: 'missing_postal'}); continue; }
    if (!String(r.city || '').trim()) { rejected.missing_city++; rejectedDetails.push({id: r.id, reason: 'missing_city'}); continue; }
    if (String(r.country || '').trim() !== 'Netherlands') { rejected.wrong_country++; rejectedDetails.push({id: r.id, reason: 'wrong_country', value: r.country}); continue; }
    if (!hasValidCoords(r)) { rejected.invalid_coords++; rejectedDetails.push({id: r.id, reason: 'invalid_coords'}); continue; }
    if (!DUTCH_POSTAL_RE.test(String(r.postal_code || '').trim())) { rejected.bad_postal_format++; rejectedDetails.push({id: r.id, reason: 'bad_postal_format', value: r.postal_code}); continue; }
    const lat = Number(r.lat); const lng = Number(r.lng);
    if (!inNlBbox(lat, lng)) { rejected.outside_bbox++; rejectedDetails.push({id: r.id, reason: 'outside_bbox', lat, lng}); continue; }
    const blob = `${r.name} ${r.address} ${r.city} ${r.brand}`;
    if (hasMojibake(blob)) { rejected.mojibake++; rejectedDetails.push({id: r.id, reason: 'mojibake', snippet: blob.slice(0,80)}); continue; }
    if (r.is_active === false) { rejected.not_active++; rejectedDetails.push({id: r.id, reason: 'not_active'}); continue; }
    approved.push(r);
  }

  // SportCity / Fit For Free dedup: group by normalized address, keep SportCity, reject Fit For Free at same location
  const sportCityByAddr = new Map();
  for (const r of approved) {
    if (isSportCityAlias(r.brand)) {
      const key = normalizeAddr(r.address) + '|' + normalizeAddr(r.city);
      if (!sportCityByAddr.has(key)) sportCityByAddr.set(key, []);
      sportCityByAddr.get(key).push(r);
    }
  }
  const fitForFreeRejectIds = new Set();
  for (const [, group] of sportCityByAddr) {
    if (group.length > 1) {
      const hasSportCity = group.some(r => normalizeBrand(r.brand) === 'sportcity');
      if (hasSportCity) {
        for (const r of group) {
          if (normalizeBrand(r.brand) !== 'sportcity') {
            fitForFreeRejectIds.add(r.id);
            rejected.sportcity_fitforfree_dup.push({id: r.id, name: r.name, brand: r.brand});
          }
        }
      }
    }
  }

  // TrainMore dedup: one physical location = one center (reject tier duplicates via proximity)
  const trainMoreRows = approved.filter(r => normalizeBrand(r.brand) === TRAINMORE_BRAND && !fitForFreeRejectIds.has(r.id));
  const trainMoreRejectIds = new Set();
  const tmSeen = [];
  for (const r of trainMoreRows) {
    const lat = Number(r.lat); const lng = Number(r.lng);
    let isDup = false;
    for (const s of tmSeen) {
      if (haversineMeters(lat, lng, s.lat, s.lng) < 100) {
        isDup = true;
        trainMoreRejectIds.add(r.id);
        rejected.trainmore_tier_dup.push({id: r.id, name: r.name, kept: s.id});
        break;
      }
    }
    if (!isDup) tmSeen.push({id: r.id, lat, lng});
  }

  const finalApproved = approved.filter(r => !fitForFreeRejectIds.has(r.id) && !trainMoreRejectIds.has(r.id));

  // Duplicate detection against production
  const byId = new Map(centers.map(c => [c.id, c]));
  const liveNl = centers.filter(c => c.country === 'Netherlands');
  const liveAddrBrand = new Set(centers.map(addrBrandKey));

  const dupAnalysis = {
    skipped_existing_id: [], skipped_same_addr_brand: [],
    skipped_proximity_same_brand: [], skipped_batch_dup: [],
    included: [],
  };

  let inserted = 0;
  const insertedRows = [];
  const batchAddrBrand = new Set();

  for (const r of finalApproved) {
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

    // Proximity check against existing NL + all production
    let proxHit = false;
    for (const live of [...liveNl, ...insertedRows]) {
      if (!hasValidCoords(live)) continue;
      if (normalizeBrand(live.brand) !== normalizeBrand(row.brand)) continue;
      const d = haversineMeters(row.lat, row.lng, Number(live.lat), Number(live.lng));
      if (d < 100) {
        dupAnalysis.skipped_proximity_same_brand.push({id: row.id, name: row.name, match_id: live.id, distance_m: Math.round(d)});
        proxHit = true;
        break;
      }
    }
    if (proxHit) continue;

    byId.set(row.id, row);
    liveAddrBrand.add(k);
    batchAddrBrand.add(k);
    liveNl.push(row);
    inserted++;
    insertedRows.push(row);
    dupAnalysis.included.push({id: row.id, name: row.name, brand: row.brand});
  }

  const existingIds = new Set(centers.map(c => c.id));
  const appended = insertedRows.filter(r => !existingIds.has(r.id));
  const catalog = [...centers, ...appended];

  const after = {
    total: catalog.length,
    netherlands: countByCountry(catalog, 'Netherlands'),
    denmark: countByCountry(catalog, 'Denmark'),
    sweden: countByCountry(catalog, 'Sweden'),
    norway: countByCountry(catalog, 'Norway'),
    finland: countByCountry(catalog, 'Finland'),
    germany: countByCountry(catalog, 'Germany'),
    united_kingdom: countByCountry(catalog, 'United Kingdom'),
  };

  // Post-merge validation
  const idCounts = new Map();
  for (const c of catalog) idCounts.set(c.id, (idCounts.get(c.id) || 0) + 1);
  const duplicateIds = [...idCounts.entries()].filter(([, n]) => n > 1).map(([id]) => id);

  const nlLive = catalog.filter(c => c.country === 'Netherlands');
  const sameBrandPhysical = [];
  for (let i = 0; i < nlLive.length; i++) {
    for (let j = i + 1; j < nlLive.length; j++) {
      const a = nlLive[i], b = nlLive[j];
      if (!hasValidCoords(a) || !hasValidCoords(b)) continue;
      if (normalizeBrand(a.brand) !== normalizeBrand(b.brand)) continue;
      const d = haversineMeters(a.lat, a.lng, b.lat, b.lng);
      if (d < 100) {
        sameBrandPhysical.push({a_id: a.id, a_name: a.name, b_id: b.id, b_name: b.name, distance_m: Math.round(d)});
      }
    }
  }

  const enc = encodingIssues(nlLive);
  const dutchLetters = countDutchLetters(nlLive);
  const coordOutliers = nlLive.filter(c => hasValidCoords(c) && !inNlBbox(Number(c.lat), Number(c.lng)));
  const postalOk = nlLive.every(c => DUTCH_POSTAL_RE.test(String(c.postal_code || '')));
  const missingAddr = nlLive.filter(c => !String(c.address || '').trim()).length;
  const missingPostal = nlLive.filter(c => !String(c.postal_code || '').trim()).length;
  const missingCity = nlLive.filter(c => !String(c.city || '').trim()).length;

  const dkIntact = dkBefore.length === after.denmark && countryIntact(dkBefore, catalog);
  const seIntact = seBefore.length === after.sweden && countryIntact(seBefore, catalog);
  const noIntact = noBefore.length === after.norway && countryIntact(noBefore, catalog);
  const fiIntact = fiBefore.length === after.finland && countryIntact(fiBefore, catalog);
  const deIntact = deBefore.length === after.germany && countryIntact(deBefore, catalog);
  const ukIntact = ukBefore.length === after.united_kingdom && countryIntact(ukBefore, catalog);

  const byBrand = {};
  for (const r of nlLive) byBrand[r.brand] = (byBrand[r.brand] || 0) + 1;
  const brandSum = Object.values(byBrand).reduce((a, b) => a + b, 0);

  // Update staging
  if (!dryRun && !idempotencyCheck) {
    const insertedIdSet = new Set(insertedRows.map(r => r.id));
    for (const r of staging) {
      if (insertedIdSet.has(r.id)) {
        r.import_category = 'MERGED_INTO_CATALOG';
        r.is_active = true;
      }
    }
  }

  const stagingCats = staging.reduce((acc, r) => {
    acc[r.import_category] = (acc[r.import_category] || 0) + 1;
    return acc;
  }, {});

  const report = {
    dry_run: dryRun, idempotency_check: idempotencyCheck,
    before, after, inserted,
    rejected,
    netherlands_by_brand: byBrand, brand_sum: brandSum,
    duplicate_ids_in_catalog: duplicateIds,
    duplicate_same_brand_physical: sameBrandPhysical,
    missing_address: missingAddr, missing_postal: missingPostal, missing_city: missingCity,
    encoding_issues: enc, dutch_letter_counts: dutchLetters,
    coordinate_outliers: coordOutliers,
    postal_format_ok: postalOk,
    countries_intact: {dk: dkIntact, se: seIntact, no: noIntact, fi: fiIntact, de: deIntact, uk: ukIntact},
    staging_categories: stagingCats,
    excluded_still_staged: {
      NEEDS_COORDINATES: staging.filter(r => r.import_category === 'NEEDS_COORDINATES').length,
      NEEDS_REVIEW: staging.filter(r => r.import_category === 'NEEDS_REVIEW').length,
      COMING_SOON: staging.filter(r => r.import_category === 'COMING_SOON').length,
      CLOSED: staging.filter(r => r.import_category === 'CLOSED').length,
    },
    dupAnalysis_summary: {
      skipped_existing_id: dupAnalysis.skipped_existing_id.length,
      skipped_same_addr_brand: dupAnalysis.skipped_same_addr_brand.length,
      skipped_proximity_same_brand: dupAnalysis.skipped_proximity_same_brand.length,
    },
  };

  // Safety checks before writing
  if (!dryRun && !idempotencyCheck) {
    if (after.denmark !== 354) throw new Error(`Denmark count ${after.denmark}, expected 354`);
    if (after.sweden !== 639) throw new Error(`Sweden count ${after.sweden}, expected 639`);
    if (after.norway !== 535) throw new Error(`Norway count ${after.norway}, expected 535`);
    if (after.finland !== 429) throw new Error(`Finland count ${after.finland}, expected 429`);
    if (after.germany !== 1424) throw new Error(`Germany count ${after.germany}, expected 1424`);
    if (after.united_kingdom !== 1474) throw new Error(`UK count ${after.united_kingdom}, expected 1474`);
    if (duplicateIds.length > 0) throw new Error(`Duplicate IDs found: ${duplicateIds.join(', ')}`);

    fs.writeFileSync(centersPath, JSON.stringify(catalog, null, 2) + '\n');
    fs.writeFileSync(stagingPath, JSON.stringify(staging, null, 2) + '\n');
    console.log(`Merge written: ${inserted} Netherlands centers added to centers.json`);
  } else if (idempotencyCheck) {
    console.log(`Idempotency check — would insert ${inserted} (expected 0)`);
  } else {
    console.log(`Dry run — would insert ${inserted} Netherlands centers`);
  }

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(dupAnalysisPath, JSON.stringify(dupAnalysis, null, 2) + '\n');

  console.log(JSON.stringify({
    dry_run: dryRun, idempotency_check: idempotencyCheck,
    before_total: before.total, after_total: after.total,
    netherlands_before: before.netherlands, netherlands_after: after.netherlands,
    inserted, brand_sum: brandSum,
    brands: byBrand,
    duplicate_ids: duplicateIds.length,
    same_brand_physical_dups: sameBrandPhysical.length,
    encoding_issues: enc.length,
    coord_outliers: coordOutliers.length,
    postal_ok: postalOk,
    dk: after.denmark, se: after.sweden, no: after.norway,
    fi: after.finland, de: after.germany, uk: after.united_kingdom,
    sportcity_fitforfree_dups: rejected.sportcity_fitforfree_dup.length,
    trainmore_tier_dups: rejected.trainmore_tier_dup.length,
    staging_categories: stagingCats,
    excluded_still_staged: report.excluded_still_staged,
  }, null, 2));
}

main();
