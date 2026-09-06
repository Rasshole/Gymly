/**
 * France production-safe merge.
 *
 * Merges ONLY READY_TO_IMPORT rows from data/france/france_centers_staging.json
 * into src/data/centers.json.
 *
 * Usage:
 *   node scripts/import-france-merge.mjs --dry-run
 *   node scripts/import-france-merge.mjs
 *   node scripts/import-france-merge.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const stagingPath = path.join(root, 'data/france/france_centers_staging.json');
const reportDir = path.join(root, 'data/france');
const reportPath = path.join(reportDir, 'FRANCE_MERGE_REPORT.json');
const mdReportPath = path.join(reportDir, 'FRANCE_MERGE_REPORT.md');
const dupAnalysisPath = path.join(reportDir, 'FRANCE_MERGE_DUPLICATE_ANALYSIS.json');
const approvedPath = path.join(reportDir, 'FRANCE_APPROVED_FOR_MERGE.json');

const dryRun = process.argv.includes('--dry-run');
const idempotencyCheck = process.argv.includes('--idempotency-check');

// Metropolitan France bounds
const FR_METRO = {latMin: 41.3, latMax: 51.1, lngMin: -5.2, lngMax: 9.6};
// Overseas territories bounds
const FR_OVERSEAS = [
  {name: 'Réunion', latMin: -21.5, latMax: -20.8, lngMin: 55.2, lngMax: 55.9},
  {name: 'Martinique', latMin: 14.3, latMax: 14.9, lngMin: -61.3, lngMax: -60.8},
  {name: 'Guadeloupe', latMin: 15.8, latMax: 16.6, lngMin: -61.9, lngMax: -61.0},
  {name: 'Guyane', latMin: 2.1, latMax: 5.8, lngMin: -54.6, lngMax: -51.6},
  {name: 'Mayotte', latMin: -13.1, latMax: -12.6, lngMin: 44.9, lngMax: 45.4},
  {name: 'Nouvelle-Calédonie', latMin: -23.0, latMax: -19.5, lngMin: 163.5, lngMax: 169.0},
  {name: 'Polynésie française', latMin: -28.0, latMax: -7.0, lngMin: -155.0, lngMax: -134.0},
];

const FR_POSTAL_RE = /^\d{5}$/;
const MOJIBAKE_RE = /Ã.|�|â€/;

function hasValidCoords(r) {
  const lat = Number(r.lat);
  const lng = Number(r.lng);
  return (
    r.lat != null && r.lng != null &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    !(lat === 0 && lng === 0)
  );
}

function inFrBbox(lat, lng) {
  if (lat >= FR_METRO.latMin && lat <= FR_METRO.latMax &&
      lng >= FR_METRO.lngMin && lng <= FR_METRO.lngMax) return 'metropolitan';
  for (const ov of FR_OVERSEAS) {
    if (lat >= ov.latMin && lat <= ov.latMax && lng >= ov.lngMin && lng <= ov.lngMax) return ov.name;
  }
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
    country: 'France',
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

function countFrenchLetters(rows) {
  let counts = {e_acute: 0, e_grave: 0, e_circ: 0, e_diaeresis: 0, a_grave: 0, a_circ: 0, c_cedilla: 0, i_circ: 0, i_diaeresis: 0, o_circ: 0, u_grave: 0, u_circ: 0, oe: 0, ae: 0};
  for (const r of rows) {
    const blob = `${r.name}${r.address}${r.city}`;
    counts.e_acute += (blob.match(/é/g) || []).length;
    counts.e_grave += (blob.match(/è/g) || []).length;
    counts.e_circ += (blob.match(/ê/g) || []).length;
    counts.e_diaeresis += (blob.match(/ë/g) || []).length;
    counts.a_grave += (blob.match(/à/g) || []).length;
    counts.a_circ += (blob.match(/â/g) || []).length;
    counts.c_cedilla += (blob.match(/ç/g) || []).length;
    counts.i_circ += (blob.match(/î/g) || []).length;
    counts.i_diaeresis += (blob.match(/ï/g) || []).length;
    counts.o_circ += (blob.match(/ô/g) || []).length;
    counts.u_grave += (blob.match(/ù/g) || []).length;
    counts.u_circ += (blob.match(/û/g) || []).length;
    counts.oe += (blob.match(/œ/g) || []).length;
    counts.ae += (blob.match(/æ/g) || []).length;
  }
  return counts;
}

function main() {
  const centers = JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8'));

  const before = {
    total: centers.length,
    france: countByCountry(centers, 'France'),
    denmark: countByCountry(centers, 'Denmark'),
    sweden: countByCountry(centers, 'Sweden'),
    norway: countByCountry(centers, 'Norway'),
    finland: countByCountry(centers, 'Finland'),
    germany: countByCountry(centers, 'Germany'),
    united_kingdom: countByCountry(centers, 'United Kingdom'),
    netherlands: countByCountry(centers, 'Netherlands'),
  };

  const dkBefore = snapshotCountry(centers, 'Denmark');
  const seBefore = snapshotCountry(centers, 'Sweden');
  const noBefore = snapshotCountry(centers, 'Norway');
  const fiBefore = snapshotCountry(centers, 'Finland');
  const deBefore = snapshotCountry(centers, 'Germany');
  const ukBefore = snapshotCountry(centers, 'United Kingdom');
  const nlBefore = snapshotCountry(centers, 'Netherlands');

  const rejected = {
    not_ready: 0, missing_id_prefix: 0, missing_name: 0, missing_brand: 0,
    missing_address: 0, missing_postal: 0, missing_city: 0,
    wrong_country: 0, invalid_coords: 0, bad_postal_format: 0,
    outside_bbox: 0, mojibake: 0, not_active: 0,
  };
  const rejectedDetails = [];

  const candidates = staging.filter(r => r.import_category === 'READY_TO_IMPORT');
  rejected.not_ready = staging.length - candidates.length;

  const approved = [];
  for (const r of candidates) {
    if (!String(r.id || '').startsWith('fr_')) { rejected.missing_id_prefix++; rejectedDetails.push({id: r.id, reason: 'missing_fr_prefix'}); continue; }
    if (!String(r.name || '').trim()) { rejected.missing_name++; rejectedDetails.push({id: r.id, reason: 'missing_name'}); continue; }
    if (!String(r.brand || '').trim()) { rejected.missing_brand++; rejectedDetails.push({id: r.id, reason: 'missing_brand'}); continue; }
    if (!String(r.address || '').trim()) { rejected.missing_address++; rejectedDetails.push({id: r.id, reason: 'missing_address'}); continue; }
    if (!String(r.postal_code || '').trim()) { rejected.missing_postal++; rejectedDetails.push({id: r.id, reason: 'missing_postal'}); continue; }
    if (!String(r.city || '').trim()) { rejected.missing_city++; rejectedDetails.push({id: r.id, reason: 'missing_city'}); continue; }
    if (String(r.country || '').trim() !== 'France') { rejected.wrong_country++; rejectedDetails.push({id: r.id, reason: 'wrong_country', value: r.country}); continue; }
    if (!hasValidCoords(r)) { rejected.invalid_coords++; rejectedDetails.push({id: r.id, reason: 'invalid_coords'}); continue; }
    if (r.is_active !== true) { rejected.not_active++; rejectedDetails.push({id: r.id, reason: 'not_active'}); continue; }
    if (!FR_POSTAL_RE.test(String(r.postal_code || '').trim())) { rejected.bad_postal_format++; rejectedDetails.push({id: r.id, reason: 'bad_postal_format', value: r.postal_code}); continue; }
    const lat = Number(r.lat); const lng = Number(r.lng);
    const region = inFrBbox(lat, lng);
    if (!region) { rejected.outside_bbox++; rejectedDetails.push({id: r.id, reason: 'outside_bbox', lat, lng}); continue; }
    const blob = `${r.name} ${r.address} ${r.city} ${r.brand}`;
    if (hasMojibake(blob)) { rejected.mojibake++; rejectedDetails.push({id: r.id, reason: 'mojibake', snippet: blob.slice(0,80)}); continue; }
    approved.push(r);
  }

  // Duplicate detection against production + within batch
  const byId = new Map(centers.map(c => [c.id, c]));
  const liveFr = centers.filter(c => c.country === 'France');
  const liveAddrBrand = new Set(centers.map(addrBrandKey));

  const dupAnalysis = {
    skipped_existing_id: [], skipped_same_addr_brand: [],
    skipped_proximity_same_brand: [], skipped_batch_dup: [],
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

    // Proximity check against existing France + inserted batch
    let proxHit = false;
    for (const live of [...liveFr, ...insertedRows]) {
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
    liveFr.push(row);
    inserted++;
    insertedRows.push(row);
    dupAnalysis.included.push({id: row.id, name: row.name, brand: row.brand});
  }

  const existingIds = new Set(centers.map(c => c.id));
  const appended = insertedRows.filter(r => !existingIds.has(r.id));
  const catalog = [...centers, ...appended];

  const after = {
    total: catalog.length,
    france: countByCountry(catalog, 'France'),
    denmark: countByCountry(catalog, 'Denmark'),
    sweden: countByCountry(catalog, 'Sweden'),
    norway: countByCountry(catalog, 'Norway'),
    finland: countByCountry(catalog, 'Finland'),
    germany: countByCountry(catalog, 'Germany'),
    united_kingdom: countByCountry(catalog, 'United Kingdom'),
    netherlands: countByCountry(catalog, 'Netherlands'),
  };

  // Post-merge validation
  const idCounts = new Map();
  for (const c of catalog) idCounts.set(c.id, (idCounts.get(c.id) || 0) + 1);
  const duplicateIds = [...idCounts.entries()].filter(([, n]) => n > 1).map(([id]) => id);

  const frLive = catalog.filter(c => c.country === 'France');
  const sameBrandPhysical = [];
  for (let i = 0; i < frLive.length; i++) {
    for (let j = i + 1; j < frLive.length; j++) {
      const a = frLive[i], b = frLive[j];
      if (!hasValidCoords(a) || !hasValidCoords(b)) continue;
      if (normalizeBrand(a.brand) !== normalizeBrand(b.brand)) continue;
      const d = haversineMeters(a.lat, a.lng, b.lat, b.lng);
      if (d < 100) {
        sameBrandPhysical.push({a_id: a.id, a_name: a.name, b_id: b.id, b_name: b.name, distance_m: Math.round(d)});
      }
    }
  }

  const enc = encodingIssues(frLive);
  const frenchLetters = countFrenchLetters(frLive);

  // Coordinate analysis
  const metroOutliers = [];
  const overseasEntries = [];
  for (const c of frLive) {
    if (!hasValidCoords(c)) continue;
    const region = inFrBbox(Number(c.lat), Number(c.lng));
    if (region === 'metropolitan') continue;
    if (region) {
      overseasEntries.push({id: c.id, name: c.name, territory: region, lat: c.lat, lng: c.lng});
    } else {
      metroOutliers.push({id: c.id, name: c.name, lat: c.lat, lng: c.lng});
    }
  }

  // Close clusters (same brand, <200m but >0m)
  const closeClusters = [];
  for (let i = 0; i < frLive.length; i++) {
    for (let j = i + 1; j < frLive.length; j++) {
      const a = frLive[i], b = frLive[j];
      if (!hasValidCoords(a) || !hasValidCoords(b)) continue;
      if (normalizeBrand(a.brand) !== normalizeBrand(b.brand)) continue;
      const d = haversineMeters(a.lat, a.lng, b.lat, b.lng);
      if (d >= 100 && d < 200) {
        closeClusters.push({a_id: a.id, a_name: a.name, b_id: b.id, b_name: b.name, distance_m: Math.round(d), brand: a.brand});
      }
    }
  }

  const dkIntact = dkBefore.length === after.denmark && countryIntact(dkBefore, catalog);
  const seIntact = seBefore.length === after.sweden && countryIntact(seBefore, catalog);
  const noIntact = noBefore.length === after.norway && countryIntact(noBefore, catalog);
  const fiIntact = fiBefore.length === after.finland && countryIntact(fiBefore, catalog);
  const deIntact = deBefore.length === after.germany && countryIntact(deBefore, catalog);
  const ukIntact = ukBefore.length === after.united_kingdom && countryIntact(ukBefore, catalog);
  const nlIntact = nlBefore.length === after.netherlands && countryIntact(nlBefore, catalog);

  const byBrand = {};
  for (const r of frLive) byBrand[r.brand] = (byBrand[r.brand] || 0) + 1;
  const brandSum = Object.values(byBrand).reduce((a, b) => a + b, 0);

  // Update staging
  if (!dryRun && !idempotencyCheck) {
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

  const report = {
    dry_run: dryRun, idempotency_check: idempotencyCheck,
    before, after, inserted,
    rejected, rejected_details: rejectedDetails,
    france_by_brand: byBrand, brand_sum: brandSum,
    duplicate_ids_in_catalog: duplicateIds,
    duplicate_same_brand_physical: sameBrandPhysical,
    close_clusters_100_200m: closeClusters,
    missing_address: frLive.filter(c => !String(c.address || '').trim()).length,
    missing_postal: frLive.filter(c => !String(c.postal_code || '').trim()).length,
    missing_city: frLive.filter(c => !String(c.city || '').trim()).length,
    encoding_issues: enc, french_letter_counts: frenchLetters,
    metropolitan_outliers: metroOutliers,
    overseas_entries: overseasEntries,
    countries_intact: {dk: dkIntact, se: seIntact, no: noIntact, fi: fiIntact, de: deIntact, uk: ukIntact, nl: nlIntact},
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
    if (after.netherlands !== 600) throw new Error(`Netherlands count ${after.netherlands}, expected 600`);
    if (duplicateIds.length > 0) throw new Error(`Duplicate IDs found: ${duplicateIds.join(', ')}`);

    fs.writeFileSync(centersPath, JSON.stringify(catalog, null, 2) + '\n');
    fs.writeFileSync(stagingPath, JSON.stringify(staging, null, 2) + '\n');
    console.log(`Merge written: ${inserted} France centers added to centers.json`);
  } else if (idempotencyCheck) {
    console.log(`Idempotency check — would insert ${inserted} (expected 0)`);
  } else {
    console.log(`Dry run — would insert ${inserted} France centers`);
  }

  // Write reports
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(dupAnalysisPath, JSON.stringify(dupAnalysis, null, 2) + '\n');
  fs.writeFileSync(approvedPath, JSON.stringify(insertedRows, null, 2) + '\n');

  // Write markdown report
  const md = `# France Merge Report

## Summary
- **Before:** ${before.total} centers (France: ${before.france})
- **After:** ${after.total} centers (France: ${after.france})
- **Inserted:** ${inserted}
- **Dry run:** ${dryRun}
- **Idempotency check:** ${idempotencyCheck}

## Brand Breakdown
${Object.entries(byBrand).sort((a,b) => b[1]-a[1]).map(([b,n]) => `- ${b}: ${n}`).join('\n')}
- **Total:** ${brandSum}

## Validation
- Duplicate IDs in catalog: ${duplicateIds.length}
- Same-brand physical duplicates (<100m): ${sameBrandPhysical.length}
- Close clusters (100-200m): ${closeClusters.length}
- Encoding issues (mojibake): ${enc.length}
- Metropolitan outliers: ${metroOutliers.length}
- Overseas entries: ${overseasEntries.length}${overseasEntries.length ? ' (' + [...new Set(overseasEntries.map(e => e.territory))].join(', ') + ')' : ''}

## French Encoding Preserved
${Object.entries(frenchLetters).map(([k,v]) => `- ${k}: ${v}`).join('\n')}

## Country Integrity
| Country | Before | After | Intact |
|---------|--------|-------|--------|
| Denmark | ${before.denmark} | ${after.denmark} | ${dkIntact ? '✓' : '✗'} |
| Sweden | ${before.sweden} | ${after.sweden} | ${seIntact ? '✓' : '✗'} |
| Norway | ${before.norway} | ${after.norway} | ${noIntact ? '✓' : '✗'} |
| Finland | ${before.finland} | ${after.finland} | ${fiIntact ? '✓' : '✗'} |
| Germany | ${before.germany} | ${after.germany} | ${deIntact ? '✓' : '✗'} |
| United Kingdom | ${before.united_kingdom} | ${after.united_kingdom} | ${ukIntact ? '✓' : '✗'} |
| Netherlands | ${before.netherlands} | ${after.netherlands} | ${nlIntact ? '✓' : '✗'} |

## Rejected
${Object.entries(rejected).filter(([,v]) => typeof v === 'number' && v > 0).map(([k,v]) => `- ${k}: ${v}`).join('\n') || '- None'}

## Staging Categories After Merge
${Object.entries(stagingCats).map(([k,v]) => `- ${k}: ${v}`).join('\n')}

## Duplicate Analysis
- Skipped (existing ID): ${dupAnalysis.skipped_existing_id.length}
- Skipped (same addr+brand): ${dupAnalysis.skipped_same_addr_brand.length}
- Skipped (proximity <100m): ${dupAnalysis.skipped_proximity_same_brand.length}
`;
  fs.writeFileSync(mdReportPath, md);

  console.log(JSON.stringify({
    dry_run: dryRun, idempotency_check: idempotencyCheck,
    before_total: before.total, after_total: after.total,
    france_before: before.france, france_after: after.france,
    inserted, brand_sum: brandSum,
    brands: byBrand,
    duplicate_ids: duplicateIds.length,
    same_brand_physical_dups: sameBrandPhysical.length,
    close_clusters: closeClusters.length,
    encoding_issues: enc.length,
    metro_outliers: metroOutliers.length,
    overseas: overseasEntries.length,
    overseas_territories: [...new Set(overseasEntries.map(e => e.territory))],
    french_letters: frenchLetters,
    dk: after.denmark, se: after.sweden, no: after.norway,
    fi: after.finland, de: after.germany, uk: after.united_kingdom, nl: after.netherlands,
    staging_categories: stagingCats,
    excluded_still_staged: report.excluded_still_staged,
    rejected_summary: rejected,
  }, null, 2));
}

main();
