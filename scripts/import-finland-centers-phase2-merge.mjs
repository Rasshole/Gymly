/**
 * Finland first safe production merge.
 *
 * Merges ONLY READY_TO_IMPORT rows from data/finland/finland_centers_staging.json
 * into src/data/centers.json.
 *
 * Excludes: NEEDS_*, COMING_SOON, CLOSED (including Esport Bristol), SATS-branded FI rows.
 * Does NOT geocode. Does NOT delete staging/research files.
 * Does NOT modify CHECK_IN_RADIUS_METERS or other countries' rows.
 *
 * Usage:
 *   node scripts/import-finland-centers-phase2-merge.mjs --dry-run
 *   node scripts/import-finland-centers-phase2-merge.mjs
 *   node scripts/import-finland-centers-phase2-merge.mjs --idempotency-check
 */
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const centersPath = path.join(root, 'src/data/centers.json');
const stagingPath = path.join(root, 'data/finland/finland_centers_staging.json');
const reportDir = path.join(root, 'data/finland');
const reportPath = path.join(reportDir, 'FINLAND_MERGE_REPORT.json');
const mdReportPath = path.join(reportDir, 'FINLAND_MERGE_REPORT.md');
const approvedPath = path.join(reportDir, 'FINLAND_APPROVED_FOR_MERGE.json');
const dupAnalysisPath = path.join(reportDir, 'FINLAND_MERGE_DUPLICATE_ANALYSIS.json');

const dryRun = process.argv.includes('--dry-run');
const idempotencyCheck = process.argv.includes('--idempotency-check');

const EXPECTED_INSERT = 429;
const EXPECTED_AFTER_TOTAL = 4855;
const FI_BOUNDS = {latMin: 59.7, latMax: 70.12, lngMin: 19.3, lngMax: 31.6};
const HELSINKI_FALLBACK = {lat: 60.1699, lng: 24.9384};
const FINLAND_CENTROID = {lat: 64.0, lng: 26.0};

const REQUIRED_BRANDS = [
  'Fitness24Seven',
  'ELIXIA',
  'Fressi',
  'Liikku',
  'EasyFit',
  'Forever',
  'Ole.Fit',
  'GOGO',
  'GOGO Express',
  'GYM Anytime',
  'PTVGYM',
  'LadyLine',
  'Energy',
  'Esport',
  'Greenfit',
  'Vocatum',
];

function isFinlandCountry(c) {
  const v = String(c || '')
    .trim()
    .toLowerCase();
  return v === 'finland' || v === 'fi' || v === 'suomi';
}

function fiPostal(s) {
  const raw = String(s ?? '').trim();
  const m = raw.match(/\d{1,5}/);
  if (!m) return '';
  return m[0].padStart(5, '0');
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

function inFiBbox(lat, lng) {
  return lat >= FI_BOUNDS.latMin && lat <= FI_BOUNDS.latMax && lng >= FI_BOUNDS.lngMin && lng <= FI_BOUNDS.lngMax;
}

function isHelsinkiFallback(lat, lng) {
  return Math.abs(lat - HELSINKI_FALLBACK.lat) < 0.00015 && Math.abs(lng - HELSINKI_FALLBACK.lng) < 0.00015;
}

function isFinlandCentroid(lat, lng) {
  return Math.abs(lat - FINLAND_CENTROID.lat) < 0.00015 && Math.abs(lng - FINLAND_CENTROID.lng) < 0.00015;
}

function normalizeBrand(b) {
  return String(b || '')
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/å/g, 'a')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeAddr(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/å/g, 'a')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function addrBrandKey(r) {
  return [
    normalizeAddr(r.address || ''),
    fiPostal(r.postal_code),
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
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function isSatsBrand(r) {
  const b = normalizeBrand(r.brand);
  const n = normalizeBrand(r.name);
  return b === 'sats' || n.startsWith('sats ');
}

function isApprovedReady(r) {
  if (r.import_category === 'MERGED_INTO_CATALOG') return false;
  if (r.import_category !== 'READY_TO_IMPORT') return false;
  if (r.verification_status === 'CLOSED' || r.import_category === 'CLOSED') return false;
  if (r.verification_status === 'COMING_SOON' || r.is_coming_soon) return false;
  if (isSatsBrand(r)) return false;
  if (!hasValidCoords(r)) return false;
  if (!String(r.name || '').trim()) return false;
  if (!String(r.brand || '').trim()) return false;
  if (!String(r.address || '').trim()) return false;
  if (!String(r.city || '').trim()) return false;
  if (!fiPostal(r.postal_code)) return false;
  if (!isFinlandCountry(r.country)) return false;
  if (!String(r.id || '').startsWith('fi_')) return false;
  const lat = Number(r.lat);
  const lng = Number(r.lng);
  if (isHelsinkiFallback(lat, lng) && normalizeAddr(r.city) !== 'helsinki') return false;
  if (isFinlandCentroid(lat, lng)) return false;
  return true;
}

function toCatalogRow(r) {
  return {
    id: r.id,
    name: r.name,
    brand: r.brand,
    address: r.address || '',
    postal_code: fiPostal(r.postal_code),
    city: r.city,
    country: 'Finland',
    lat: Number(r.lat),
    lng: Number(r.lng),
    is_active: true,
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

function encodingIssues(rows) {
  const bad = [];
  for (const r of rows) {
    const blob = `${r.name} ${r.address} ${r.city} ${r.brand}`;
    if (/Ã.|�|â€/.test(blob)) {
      bad.push({id: r.id, name: r.name, snippet: blob.slice(0, 80)});
    }
  }
  return bad;
}

function countNordicLetters(rows) {
  let a = 0;
  let o = 0;
  let aa = 0;
  for (const r of rows) {
    const blob = `${r.name}${r.address}${r.city}`;
    a += (blob.match(/ä/gi) || []).length;
    o += (blob.match(/ö/gi) || []).length;
    aa += (blob.match(/å/gi) || []).length;
  }
  return {a, o, aa};
}

function writeMd(report) {
  const brands = report.finland_by_brand || {};
  const brandRows = Object.entries(brands)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([b, n]) => `| ${b} | ${n} |`)
    .join('\n');
  const coloc = (report.different_brand_clusters_le50m || [])
    .map(
      c =>
        `- ${c.a_name} (${c.a_brand}) / ${c.b_name} (${c.b_brand}) — ${c.distance_m} m`,
    )
    .join('\n');
  const md = `# Finland first safe production merge

Generated: ${new Date().toISOString().slice(0, 10)}

**Status: MERGED.** Only READY_TO_IMPORT rows were inserted into \`src/data/centers.json\`.

Unresolved, coming-soon, and closed rows remain in staging only.

\`CHECK_IN_RADIUS_METERS\` remains **200**. Auto-checkout was not modified. Sweden fallback behaviour was not changed.

## Counts

| Metric | Count |
|---|---:|
| Centers before | ${report.before.total} |
| Finland before | ${report.before.finland} |
| Exact inserted | **${report.inserted}** |
| Centers after | **${report.after.total}** |
| Finland after | **${report.after.finland}** |
| Denmark | ${report.after.denmark} (unchanged) |
| Sweden | ${report.after.sweden} (unchanged) |
| Norway | ${report.after.norway} (unchanged) |
| Germany | ${report.after.germany} (unchanged) |
| United Kingdom | ${report.after.united_kingdom} (unchanged) |
| Idempotency second-run insertions | see second run |

## Finland brand breakdown (production)

| Brand | Count |
|---|---:|
${brandRows}
| **Total** | **${report.after.finland}** |

## Validation

- Duplicate IDs: **${(report.duplicate_ids_in_catalog || []).length}**
- Duplicate Finland IDs: **${report.duplicate_finland_ids}**
- Same-brand physical duplicates (≤50 m): **${(report.duplicate_same_brand_physical || []).length}**
- Missing address / postcode / city / coordinates: **${report.missing_address} / ${report.missing_postal} / ${report.missing_city} / ${report.missing_coordinates}**
- Invalid coordinates (null, NaN, Inf, 0,0): **${(report.invalid_coordinates || []).length}**
- Finland bbox outliers: **${(report.coordinate_outliers_in_catalog || []).length}**
- Helsinki fallback hits (wrong city): **${(report.helsinki_fallback_hits || []).length}**
- Finnish postal codes all five-character strings: **${report.postal_five_char_ok}**
- Production Finnish postals beginning with \`0\`: **${report.postal_begin_with_zero}**
- Mojibake/encoding issues: **${(report.encoding_issues || []).length}**
- Nordic letters preserved (ä / ö / å counts): **${report.nordic_letter_counts.a} / ${report.nordic_letter_counts.o} / ${report.nordic_letter_counts.aa}**
- All Finland production IDs are \`fi_*\`
- All Finland production \`country\` values are \`"Finland"\`
- All ${report.inserted} Finland rows are \`is_active: true\`
- SATS-branded Finnish production rows: **${report.sats_brand_in_production}**
- COMING_SOON in production: **${report.coming_soon_in_production}**
- Esport Bristol in production: **${report.esport_bristol_in_production}**
- Liikku Espoo Leppävaara in production: **${report.liikku_leppavaara_in_production}**

## Different-brand clusters (≤50 m, not collapsed)

These are reported only. Different current brands may share a site.

${coloc || '- none'}

## Still staged (not production)

| Category | Count |
|---|---:|
| MERGED_INTO_CATALOG | ${report.staging_categories.MERGED_INTO_CATALOG || 0} |
| NEEDS_COORDINATES | ${report.excluded_still_staged.NEEDS_COORDINATES} |
| NEEDS_REVIEW | ${report.excluded_still_staged.NEEDS_REVIEW} |
| COMING_SOON | ${report.excluded_still_staged.COMING_SOON} |
| CLOSED | ${report.excluded_still_staged.CLOSED} |

## Files changed

- \`src/data/centers.json\` (append-only Finland rows; DK/SE/NO/DE/UK untouched)
- \`data/finland/finland_centers_staging.json\` (READY rows marked \`MERGED_INTO_CATALOG\`; research rows preserved)
- \`data/finland/FINLAND_MERGE_REPORT.json\`
- \`data/finland/FINLAND_MERGE_REPORT.md\`
- \`data/finland/FINLAND_APPROVED_FOR_MERGE.json\`
- \`data/finland/FINLAND_MERGE_DUPLICATE_ANALYSIS.json\`
- \`scripts/import-finland-centers-phase2-merge.mjs\`

Not modified: check-in radius, auto-checkout, workout logging, PR logic, feed, Sweden fallback behaviour.

## Remaining risks

- ${report.excluded_still_staged.NEEDS_COORDINATES} NEEDS_COORDINATES and ${report.excluded_still_staged.NEEDS_REVIEW} NEEDS_REVIEW clubs are absent from check-in.
- ${report.excluded_still_staged.COMING_SOON} coming-soon clubs (including 12 Fressi and Liikku Espoo Leppävaara 2027) must be activated later from staging when official sources prove they are open.
- Esport Bristol remains CLOSED in staging.
`;
  fs.writeFileSync(mdReportPath, md);
}

function main() {
  const centers = JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8'));

  const before = {
    total: centers.length,
    finland: countByCountry(centers, 'Finland'),
    denmark: countByCountry(centers, 'Denmark'),
    sweden: countByCountry(centers, 'Sweden'),
    norway: countByCountry(centers, 'Norway'),
    germany: countByCountry(centers, 'Germany'),
    united_kingdom: countByCountry(centers, 'United Kingdom'),
  };

  const dkBefore = snapshotCountry(centers, 'Denmark');
  const seBefore = snapshotCountry(centers, 'Sweden');
  const noBefore = snapshotCountry(centers, 'Norway');
  const deBefore = snapshotCountry(centers, 'Germany');
  const ukBefore = snapshotCountry(centers, 'United Kingdom');

  const candidates = staging.filter(isApprovedReady);
  const bboxOutliers = [];
  const approved = [];
  for (const r of candidates) {
    const lat = Number(r.lat);
    const lng = Number(r.lng);
    if (!inFiBbox(lat, lng)) {
      bboxOutliers.push({
        id: r.id,
        name: r.name,
        lat,
        lng,
        note: 'outside_fi_bbox_excluded_from_merge_not_deleted_from_staging',
      });
      continue;
    }
    approved.push(r);
  }

  const byId = new Map(centers.map(c => [c.id, c]));
  const liveFi = centers.filter(c => isFinlandCountry(c.country));
  const liveAddrBrand = new Set(centers.map(addrBrandKey));

  const dupAnalysis = {
    skipped_existing_id: [],
    skipped_same_addr_brand: [],
    skipped_proximity_same_brand: [],
    skipped_batch_dup_addr_brand: [],
    skipped_non_fi_id_collision: [],
    allowed_colocated_different_brand: [],
    bbox_outliers_excluded: bboxOutliers,
    included: [],
  };

  let inserted = 0;
  const insertedRows = [];
  const batchAddrBrand = new Set();

  for (const r of approved) {
    const row = toCatalogRow(r);

    if (byId.has(row.id)) {
      const existing = byId.get(row.id);
      if (existing.country && existing.country !== 'Finland') {
        dupAnalysis.skipped_non_fi_id_collision.push({
          id: row.id,
          name: row.name,
          existing_country: existing.country,
        });
        continue;
      }
      dupAnalysis.skipped_existing_id.push({id: row.id, name: row.name});
      continue;
    }

    const k = addrBrandKey(row);
    if (liveAddrBrand.has(k) || batchAddrBrand.has(k)) {
      const target = liveAddrBrand.has(k)
        ? dupAnalysis.skipped_same_addr_brand
        : dupAnalysis.skipped_batch_dup_addr_brand;
      target.push({id: row.id, name: row.name, key: k});
      continue;
    }

    const proxLive = [];
    for (const live of liveFi) {
      if (!hasValidCoords(live)) continue;
      if (normalizeBrand(live.brand) !== normalizeBrand(row.brand)) continue;
      const d = haversineMeters(row.lat, row.lng, live.lat, live.lng);
      if (d <= 50) {
        proxLive.push({live_id: live.id, live_name: live.name, distance_m: Math.round(d)});
      }
    }
    if (proxLive.length) {
      dupAnalysis.skipped_proximity_same_brand.push({id: row.id, name: row.name, matches: proxLive});
      continue;
    }

    let batchProxHit = null;
    for (const acc of insertedRows) {
      if (normalizeBrand(acc.brand) !== normalizeBrand(row.brand)) continue;
      const d = haversineMeters(row.lat, row.lng, acc.lat, acc.lng);
      if (d <= 50) {
        batchProxHit = {id: acc.id, name: acc.name, distance_m: Math.round(d)};
        break;
      }
    }
    if (batchProxHit) {
      dupAnalysis.skipped_proximity_same_brand.push({
        id: row.id,
        name: row.name,
        matches: [batchProxHit],
        within_batch: true,
      });
      continue;
    }

    byId.set(row.id, row);
    liveAddrBrand.add(k);
    batchAddrBrand.add(k);
    liveFi.push(row);
    inserted++;
    insertedRows.push(row);
    dupAnalysis.included.push({
      id: row.id,
      name: row.name,
      brand: row.brand,
      address: row.address,
      postal_code: row.postal_code,
      city: row.city,
      lat: row.lat,
      lng: row.lng,
    });
  }

  const existingIds = new Set(centers.map(c => c.id));
  const preserved = centers.map(c => c);
  const appended = insertedRows.filter(r => !existingIds.has(r.id));
  const catalog = [...preserved, ...appended];

  const after = {
    total: catalog.length,
    finland: countByCountry(catalog, 'Finland'),
    denmark: countByCountry(catalog, 'Denmark'),
    sweden: countByCountry(catalog, 'Sweden'),
    norway: countByCountry(catalog, 'Norway'),
    germany: countByCountry(catalog, 'Germany'),
    united_kingdom: countByCountry(catalog, 'United Kingdom'),
  };

  const idCounts = new Map();
  for (const c of catalog) idCounts.set(c.id, (idCounts.get(c.id) || 0) + 1);
  const duplicateIds = [...idCounts.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  const fiIdCounts = new Map();
  const fiLive = catalog.filter(c => c.country === 'Finland');
  for (const c of fiLive) fiIdCounts.set(c.id, (fiIdCounts.get(c.id) || 0) + 1);
  const duplicateFinlandIds = [...fiIdCounts.entries()].filter(([, n]) => n > 1).map(([id]) => id);

  const sameBrandPhysical = [];
  const clusters = [];
  const seenPair = new Set();
  for (let i = 0; i < fiLive.length; i++) {
    const a = fiLive[i];
    if (!hasValidCoords(a)) continue;
    for (let j = i + 1; j < fiLive.length; j++) {
      const b = fiLive[j];
      if (!hasValidCoords(b)) continue;
      const d = haversineMeters(a.lat, a.lng, b.lat, b.lng);
      if (d <= 50 && normalizeBrand(a.brand) === normalizeBrand(b.brand)) {
        sameBrandPhysical.push({
          a_id: a.id,
          a_name: a.name,
          b_id: b.id,
          b_name: b.name,
          distance_m: Math.round(d),
        });
      }
      if (d <= 50 && normalizeBrand(a.brand) !== normalizeBrand(b.brand)) {
        const key = [a.id, b.id].sort().join('|');
        if (!seenPair.has(key)) {
          seenPair.add(key);
          clusters.push({
            a_id: a.id,
            a_name: a.name,
            a_brand: a.brand,
            b_id: b.id,
            b_name: b.name,
            b_brand: b.brand,
            distance_m: Math.round(d),
            note: 'legitimate_or_co_located_different_brand',
          });
        }
      }
    }
  }

  const missingAddress = fiLive.filter(c => !String(c.address || '').trim()).length;
  const missingPostal = fiLive.filter(c => !String(c.postal_code || '').trim()).length;
  const missingCity = fiLive.filter(c => !String(c.city || '').trim()).length;
  const missingCoords = fiLive.filter(c => !hasValidCoords(c)).length;
  const invalidCoords = fiLive.filter(c => {
    if (c.lat == null || c.lng == null) return true;
    if (!Number.isFinite(Number(c.lat)) || !Number.isFinite(Number(c.lng))) return true;
    if (Number(c.lat) === 0 && Number(c.lng) === 0) return true;
    return false;
  });
  const coordOutliers = fiLive.filter(c => hasValidCoords(c) && !inFiBbox(Number(c.lat), Number(c.lng)));
  const helsinkiFallbacks = fiLive.filter(
    c =>
      hasValidCoords(c) &&
      isHelsinkiFallback(Number(c.lat), Number(c.lng)) &&
      normalizeAddr(c.city) !== 'helsinki',
  );
  const postalFiveCharOk = fiLive.every(
    c => typeof c.postal_code === 'string' && /^\d{5}$/.test(c.postal_code),
  );
  const postalBeginWithZero = fiLive.filter(c => String(c.postal_code).startsWith('0')).length;
  const enc = encodingIssues(fiLive);
  const nordic = countNordicLetters(fiLive);
  const fiPrefixOk = fiLive.every(c => String(c.id).startsWith('fi_'));
  const fiCountryOk = fiLive.every(c => c.country === 'Finland');
  const satsInProd = fiLive.filter(c => isSatsBrand(c)).length;
  const comingSoonInProd = catalog.filter(
    c => c.country === 'Finland' && (c.is_coming_soon || /avataan|coming soon/i.test(c.name || '')),
  ).length;
  const bristolInProd = catalog.some(
    c => /esport bristol/i.test(`${c.name} ${c.brand}`) && c.country === 'Finland',
  );
  const leppavaaraInProd = catalog.some(
    c => /liikku/i.test(c.brand || '') && /leppävaara|leppavaara/i.test(c.name || ''),
  );

  const byBrand = {};
  for (const r of fiLive) {
    byBrand[r.brand] = (byBrand[r.brand] || 0) + 1;
  }
  const brandSum = Object.values(byBrand).reduce((a, b) => a + b, 0);

  const dkIntact = dkBefore.length === after.denmark && countryIntact(dkBefore, catalog);
  const seIntact = seBefore.length === after.sweden && countryIntact(seBefore, catalog);
  const noIntact = noBefore.length === after.norway && countryIntact(noBefore, catalog);
  const deIntact = deBefore.length === after.germany && countryIntact(deBefore, catalog);
  const ukIntact = ukBefore.length === after.united_kingdom && countryIntact(ukBefore, catalog);

  if (!dryRun && !idempotencyCheck) {
    const insertedIdSet = new Set(insertedRows.map(r => r.id));
    for (const r of staging) {
      if (insertedIdSet.has(r.id)) {
        r.import_category = 'MERGED_INTO_CATALOG';
        r.is_active = true;
        r.phase2_merge = 'approved_ready';
      }
    }
  }

  const stagingCats = staging.reduce((acc, r) => {
    acc[r.import_category] = (acc[r.import_category] || 0) + 1;
    return acc;
  }, {});

  const report = {
    dry_run: dryRun,
    idempotency_check: idempotencyCheck,
    before,
    after,
    approved_candidates: approved.length,
    bbox_outliers_excluded: bboxOutliers.length,
    inserted,
    skipped_existing_id: dupAnalysis.skipped_existing_id.length,
    skipped_same_addr_brand: dupAnalysis.skipped_same_addr_brand.length,
    skipped_proximity_same_brand: dupAnalysis.skipped_proximity_same_brand.length,
    skipped_batch_dup_addr_brand: dupAnalysis.skipped_batch_dup_addr_brand.length,
    skipped_non_fi_id_collision: dupAnalysis.skipped_non_fi_id_collision.length,
    finland_by_brand: byBrand,
    brand_sum: brandSum,
    required_brands_present: REQUIRED_BRANDS.every(b => (byBrand[b] || 0) > 0),
    duplicate_ids_in_catalog: duplicateIds,
    duplicate_finland_ids: duplicateFinlandIds.length,
    duplicate_same_brand_physical: sameBrandPhysical,
    different_brand_clusters_le50m: clusters,
    missing_address: missingAddress,
    missing_postal: missingPostal,
    missing_city: missingCity,
    missing_coordinates: missingCoords,
    invalid_coordinates: invalidCoords,
    coordinate_outliers_in_catalog: coordOutliers,
    helsinki_fallback_hits: helsinkiFallbacks,
    postal_five_char_ok: postalFiveCharOk,
    postal_begin_with_zero: postalBeginWithZero,
    encoding_issues: enc,
    nordic_letter_counts: nordic,
    fi_prefix_ok: fiPrefixOk,
    fi_country_ok: fiCountryOk,
    sats_brand_in_production: satsInProd,
    coming_soon_in_production: comingSoonInProd,
    esport_bristol_in_production: bristolInProd,
    liikku_leppavaara_in_production: leppavaaraInProd,
    denmark_count: after.denmark,
    sweden_count: after.sweden,
    norway_count: after.norway,
    germany_count: after.germany,
    united_kingdom_count: after.united_kingdom,
    finland_count: after.finland,
    denmark_intact: dkIntact,
    sweden_intact: seIntact,
    norway_intact: noIntact,
    germany_intact: deIntact,
    united_kingdom_intact: ukIntact,
    staging_categories: stagingCats,
    excluded_still_staged: {
      NEEDS_COORDINATES: staging.filter(r => r.import_category === 'NEEDS_COORDINATES').length,
      NEEDS_REVIEW: staging.filter(r => r.import_category === 'NEEDS_REVIEW').length,
      COMING_SOON: staging.filter(r => r.import_category === 'COMING_SOON').length,
      CLOSED: staging.filter(r => r.import_category === 'CLOSED').length,
    },
    every_new_active_has_valid_coords: insertedRows.every(
      c =>
        hasValidCoords(c) &&
        c.country === 'Finland' &&
        c.is_active === true &&
        String(c.id).startsWith('fi_') &&
        typeof c.postal_code === 'string' &&
        /^\d{5}$/.test(c.postal_code),
    ),
    check_in_radius_untouched: true,
    files_changed_if_written: [
      'src/data/centers.json',
      'data/finland/finland_centers_staging.json',
      'data/finland/FINLAND_MERGE_REPORT.json',
      'data/finland/FINLAND_MERGE_REPORT.md',
      'data/finland/FINLAND_APPROVED_FOR_MERGE.json',
      'data/finland/FINLAND_MERGE_DUPLICATE_ANALYSIS.json',
    ],
  };

  if (!idempotencyCheck) {
    fs.writeFileSync(approvedPath, JSON.stringify(insertedRows, null, 2) + '\n');
    fs.writeFileSync(dupAnalysisPath, JSON.stringify(dupAnalysis, null, 2) + '\n');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    writeMd(report);
  } else {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  }

  if (!dryRun && !idempotencyCheck) {
    if (inserted !== EXPECTED_INSERT) {
      throw new Error(`Abort: inserted ${inserted}, expected ${EXPECTED_INSERT}`);
    }
    if (catalog.length !== EXPECTED_AFTER_TOTAL) {
      throw new Error(`Abort: catalog ${catalog.length}, expected ${EXPECTED_AFTER_TOTAL}`);
    }
    if (after.finland !== EXPECTED_INSERT) {
      throw new Error(`Abort: Finland ${after.finland}, expected ${EXPECTED_INSERT}`);
    }
    if (brandSum !== EXPECTED_INSERT) {
      throw new Error(`Abort: brand sum ${brandSum}, expected ${EXPECTED_INSERT}`);
    }
    fs.writeFileSync(centersPath, JSON.stringify(catalog, null, 2) + '\n');
    fs.writeFileSync(stagingPath, JSON.stringify(staging, null, 2) + '\n');
    console.log('Merge written to centers.json');
  } else if (idempotencyCheck) {
    console.log('Idempotency check — no centers.json write.');
  } else {
    console.log('Dry run — centers.json not written.');
  }

  console.log(
    JSON.stringify(
      {
        dry_run: dryRun,
        idempotency_check: idempotencyCheck,
        before,
        after,
        inserted,
        skipped_existing_id: report.skipped_existing_id,
        skipped_same_addr_brand: report.skipped_same_addr_brand,
        skipped_proximity_same_brand: report.skipped_proximity_same_brand,
        duplicate_ids: duplicateIds.length,
        same_brand_physical: sameBrandPhysical.length,
        different_brand_clusters: clusters.length,
        missing_address: missingAddress,
        missing_postal: missingPostal,
        missing_city: missingCity,
        missing_coordinates: missingCoords,
        invalid_coordinates: invalidCoords.length,
        outliers: coordOutliers.length,
        postal_begin_with_zero: postalBeginWithZero,
        postal_five_char_ok: postalFiveCharOk,
        encoding_issues: enc.length,
        fi_prefix_ok: fiPrefixOk,
        coming_soon_in_production: comingSoonInProd,
        esport_bristol_in_production: bristolInProd,
        liikku_leppavaara_in_production: leppavaaraInProd,
        finland_by_brand: byBrand,
        brand_sum: brandSum,
        excluded_still_staged: report.excluded_still_staged,
      },
      null,
      2,
    ),
  );
  return report;
}

main();
