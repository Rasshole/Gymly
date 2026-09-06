/**
 * Import / geocode Norwegian gyms into the EXISTING centers.json catalog.
 *
 * Architecture note:
 * Gymly does NOT store the gym directory in Supabase. Source of truth is
 * `src/data/centers.json` (same as Denmark / Sweden). Supabase only stores
 * text `gym_id` references on check-ins, favorites, etc.
 *
 * SAFETY:
 * - Never invents coordinates
 * - Never activates a gym without lat/lng
 * - Idempotent merge by `id` (no_*)
 * - Does not delete or rewrite DK/SE rows
 * - Default is dry analysis / geocode staging only
 *
 * Usage:
 *   node scripts/import-norway-centers.mjs                 # report only
 *   node scripts/import-norway-centers.mjs --geocode       # Nominatim → update staging
 *   node scripts/import-norway-centers.mjs --geocode --limit=5
 *   node scripts/import-norway-centers.mjs --merge         # merge READY (with coords) into centers.json
 *
 * Requires network for --geocode (Nominatim, ~1 req/sec, countrycodes=no).
 */
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const stagingPath = path.join(root, 'data/norway/norway_centers_staging.json');
const centersPath = path.join(root, 'src/data/centers.json');
const reportPath = path.join(root, 'data/norway/norway_import_run_report.json');
const geocodeReviewPath = path.join(root, 'data/norway/norway_geocode_review.json');
const geocodeReviewCsvPath = path.join(root, 'data/norway/norway_geocode_review.csv');

const doGeocode = process.argv.includes('--geocode');
const doGeocodePhase2 = process.argv.includes('--geocode-phase2');
const doGeocodePhase3 = process.argv.includes('--geocode-phase3');
const doMerge = process.argv.includes('--merge');
const phase2NewPath = path.join(root, 'data/norway/phase2_new_centers_staging.json');
const phase3NewPath = path.join(root, 'data/norway/phase3/phase3_new_centers_staging.json');
let limit = null;
for (const a of process.argv) {
  if (a.startsWith('--limit=')) {
    const n = parseInt(a.split('=')[1], 10);
    if (Number.isFinite(n) && n > 0) limit = n;
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const USER_AGENT = `GymlyNorwayGeocoder/1.0 (${process.env.NOMINATIM_EMAIL || 'dev-local'})`;

/** Mainland + islands rough bounds — reject anything clearly outside Norway. */
const NO_BOUNDS = {latMin: 57.8, latMax: 71.4, lngMin: 4.3, lngMax: 31.8};

const REJECT_TYPES = new Set([
  'country',
  'state',
  'county',
  'municipality',
  'city',
  'town',
  'village',
  'hamlet',
  'suburb',
  'neighbourhood',
  'quarter',
  'city_district',
  'borough',
  'administrative',
]);

function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
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

function inNorwayBounds(lat, lng) {
  return (
    lat >= NO_BOUNDS.latMin &&
    lat <= NO_BOUNDS.latMax &&
    lng >= NO_BOUNDS.lngMin &&
    lng <= NO_BOUNDS.lngMax
  );
}

function extractPostcode(item) {
  const fromAddr = item.address?.postcode;
  if (fromAddr) return String(fromAddr).replace(/\s+/g, '').slice(0, 4);
  const m = String(item.display_name || '').match(/\b(\d{4})\b/);
  return m ? m[1] : null;
}

function cityTokensMatch(expectedCity, item) {
  const city = normalizeText(expectedCity);
  if (!city) return true;
  const addr = item.address || {};
  const candidates = [
    addr.city,
    addr.town,
    addr.village,
    addr.municipality,
    addr.suburb,
    addr.city_district,
    item.display_name,
  ]
    .filter(Boolean)
    .map(normalizeText);
  // Accept if expected city appears in any candidate blob
  return candidates.some(c => c.includes(city) || city.includes(c.split(' ')[0]));
}

function isTooCoarse(item) {
  const t = String(item.type || '').toLowerCase();
  const c = String(item.class || '').toLowerCase();
  if (REJECT_TYPES.has(t)) return true;
  if (c === 'boundary' || c === 'place') {
    // place=house etc. is fine; place=city/town already in REJECT_TYPES
    if (REJECT_TYPES.has(t)) return true;
  }
  return false;
}

/**
 * Score a Nominatim candidate against the staged gym.
 * Higher = better. Returns null if hard-reject.
 */
function scoreCandidate(item, gym) {
  const lat = parseFloat(item.lat);
  const lng = parseFloat(item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!inNorwayBounds(lat, lng)) return null;
  if (String(item.address?.country_code || '').toLowerCase() === 'se') return null;
  if (String(item.address?.country_code || '').toLowerCase() === 'dk') return null;

  if (isTooCoarse(item)) {
    return {reject: 'coarse_place_type', lat, lng, item};
  }

  const expectedPostal = String(gym.postal_code || '').replace(/\s+/g, '');
  const gotPostal = extractPostcode(item);
  let score = Number(item.importance) || 0;
  const reasons = [];

  const addrNorm = normalizeText(gym.address);
  const display = normalizeText(item.display_name);
  const house = normalizeText(item.address?.house_number || '');
  const road = normalizeText(item.address?.road || item.address?.pedestrian || '');
  const hm = String(gym.address || '').match(/\b(\d+[a-zA-Z]?)\b/);
  const houseMatch =
    hm && house && normalizeText(hm[1]) === house ? true : false;
  const roadMatch = !!(road && addrNorm.includes(road));
  const strongStreet = houseMatch && roadMatch;

  if (expectedPostal) {
    if (gotPostal === expectedPostal) {
      score += 5;
      reasons.push('postal_exact');
    } else if (gotPostal) {
      // Phase 2: allow postal mismatch only with strong street+house match
      // (shopping centers / OSM postal boundary quirks).
      if (strongStreet) {
        score += 1;
        reasons.push('postal_mismatch_soft_street_ok');
      } else {
        return {reject: 'postal_mismatch', lat, lng, item, gotPostal, expectedPostal};
      }
    } else {
      score -= 1;
      reasons.push('postal_missing_on_result');
    }
  }

  const cityOk = cityTokensMatch(gym.city, item);
  if (!cityOk) {
    // Soft city mismatch only when postal exact (postal place vs municipality naming)
    if (expectedPostal && gotPostal === expectedPostal && (roadMatch || strongStreet)) {
      score += 1;
      reasons.push('city_mismatch_soft_postal_ok');
    } else {
      return {reject: 'city_mismatch', lat, lng, item};
    }
  } else {
    score += 2;
    reasons.push('city_ok');
  }

  if (addrNorm && display.includes(addrNorm)) {
    score += 4;
    reasons.push('full_address_in_display');
  } else if (roadMatch) {
    score += 2;
    reasons.push('road_match');
    if (houseMatch) {
      score += 2;
      reasons.push('house_number_match');
    }
  } else if (addrNorm) {
    const tokens = addrNorm.split(' ').filter(t => t.length > 2 && !/^\d+$/.test(t));
    const hits = tokens.filter(t => display.includes(t)).length;
    if (hits === 0) {
      return {reject: 'address_no_overlap', lat, lng, item};
    }
    score += Math.min(hits, 3);
    reasons.push(`token_hits_${hits}`);
  }

  return {score, lat, lng, item, reasons, gotPostal};
}

async function nominatimSearchRaw(params) {
  const u = new URL('https://nominatim.openstreetmap.org/search');
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') u.searchParams.set(k, String(v));
  }
  u.searchParams.set('format', 'json');
  u.searchParams.set('addressdetails', '1');
  u.searchParams.set('limit', '5');
  u.searchParams.set('countrycodes', 'no');
  const res = await fetch(u, {
    headers: {'User-Agent': USER_AGENT, Accept: 'application/json'},
  });
  if (!res.ok) {
    throw new Error(`Nominatim HTTP ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function geocodeGym(gym) {
  const queries = [];
  // 1) Free-form street + postal + city (preferred)
  queries.push({
    label: 'address_postal_city',
    params: {q: `${gym.address}, ${gym.postal_code} ${gym.city}, Norway`},
  });
  // 2) Structured street search
  queries.push({
    label: 'structured',
    params: {
      street: gym.address,
      city: gym.city,
      postalcode: gym.postal_code,
      country: 'Norway',
    },
  });

  const allCandidates = [];
  const seen = new Set();
  for (const q of queries) {
    const raw = await nominatimSearchRaw(q.params);
    for (const item of raw) {
      const key = `${item.lat},${item.lon},${item.osm_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      allCandidates.push({...item, _query: q.label});
    }
    await sleep(1100);
  }

  const scored = [];
  const rejected = [];
  for (const item of allCandidates) {
    const s = scoreCandidate(item, gym);
    if (!s) continue;
    if (s.reject) {
      rejected.push(s);
      continue;
    }
    scored.push(s);
  }
  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      status: 'failed',
      reason: rejected[0]?.reject || 'no_candidates',
      candidates: allCandidates.length,
      rejected: rejected.slice(0, 3).map(r => ({
        reject: r.reject,
        lat: r.lat,
        lng: r.lng,
        display: r.item?.display_name,
      })),
    };
  }

  // Prefer house-number matches when present
  scored.sort((a, b) => {
    const ah = a.reasons.includes('house_number_match') ? 1 : 0;
    const bh = b.reasons.includes('house_number_match') ? 1 : 0;
    if (bh !== ah) return bh - ah;
    return b.score - a.score;
  });

  const best = scored[0];
  const second = scored[1];
  // Ambiguous if two strong matches are far apart — unless best has house number and second doesn't
  if (
    second &&
    second.score >= best.score - 1.5 &&
    haversineMeters(best.lat, best.lng, second.lat, second.lng) > 150
  ) {
    const bestHouse = best.reasons.includes('house_number_match');
    const secondHouse = second.reasons.includes('house_number_match');
    if (!(bestHouse && !secondHouse)) {
      return {
        status: 'ambiguous',
        reason: 'multiple_strong_candidates',
        best,
        second,
        distance_m: Math.round(
          haversineMeters(best.lat, best.lng, second.lat, second.lng),
        ),
        candidate_count: scored.length,
      };
    }
  }

  // Suspicious: very low address confidence
  const suspicious =
    !best.reasons.includes('postal_exact') ||
    (!best.reasons.includes('full_address_in_display') &&
      !best.reasons.includes('house_number_match') &&
      !best.reasons.includes('road_match'));

  return {
    status: suspicious ? 'suspicious' : 'ok',
    best,
    candidate_count: scored.length,
    all_scored: scored.slice(0, 3).map(s => ({
      score: s.score,
      lat: s.lat,
      lng: s.lng,
      reasons: s.reasons,
      display: s.item.display_name,
      query: s.item._query,
    })),
  };
}

function toCatalogRow(staging) {
  const hasCoords =
    staging.lat != null &&
    staging.lng != null &&
    Number.isFinite(staging.lat) &&
    Number.isFinite(staging.lng);
  return {
    id: staging.id,
    name: staging.name,
    brand: staging.brand,
    address: staging.address || '',
    postal_code: staging.postal_code || '',
    city: staging.city,
    country: 'Norway',
    lat: hasCoords ? staging.lat : null,
    lng: hasCoords ? staging.lng : null,
    is_active: hasCoords === true,
  };
}

function canAttemptGeocode(c) {
  if (!c.address || !String(c.address).trim()) {
    return {ok: false, reason: 'missing_address'};
  }
  if (!c.postal_code || !String(c.postal_code).trim()) {
    return {ok: false, reason: 'missing_postal'};
  }
  if (!c.city || !String(c.city).trim()) {
    return {ok: false, reason: 'missing_city'};
  }
  // Address-pending without a resolved street address: skip
  if (
    c.verification_status === 'location_known_address_pending' &&
    !c.address_resolved_phase2 &&
    !c.phase2_ready_for_geocode
  ) {
    return {ok: false, reason: 'address_pending_skip'};
  }
  // Incomplete without postal already caught above
  if (c.import_category === 'SKIP_INCOMPLETE' && !c.postal_code) {
    return {ok: false, reason: 'incomplete_skip'};
  }
  // NEEDS_REVIEW without coords but with full address: allow (phase2 re-geocode)
  return {ok: true};
}

async function geocodeStaging(rows) {
  const stats = {
    ok: 0,
    suspicious_accepted: 0,
    failed: 0,
    ambiguous: 0,
    skipped: 0,
    attempted: 0,
    by_skip_reason: {},
  };

  for (let i = 0; i < rows.length; i++) {
    const c = rows[i];
    if (c.lat != null && c.lng != null) continue;

    const gate = canAttemptGeocode(c);
    if (!gate.ok) {
      stats.skipped++;
      stats.by_skip_reason[gate.reason] =
        (stats.by_skip_reason[gate.reason] || 0) + 1;
      c.geocode_status = gate.reason;
      if (
        gate.reason === 'address_pending_skip' ||
        gate.reason === 'needs_review_skip'
      ) {
        c.import_category = 'NEEDS_REVIEW';
        c.lat = null;
        c.lng = null;
        c.is_active = false;
      }
      continue;
    }

    if (limit != null && stats.attempted >= limit) break;
    stats.attempted++;

    process.stdout.write(
      `[${stats.attempted}] ${String(c.name).slice(0, 42).padEnd(43)}`,
    );

    let result;
    try {
      result = await geocodeGym(c);
    } catch (err) {
      console.log(`ERROR ${err.message}`);
      c.geocode_status = 'error';
      c.geocode_error = String(err.message);
      c.lat = null;
      c.lng = null;
      c.is_active = false;
      if (c.import_category !== 'POSSIBLE_DUPLICATE') {
        c.import_category = 'NEEDS_COORDINATES';
      }
      stats.failed++;
      await sleep(1100);
      continue;
    }

    if (result.status === 'ok' || result.status === 'suspicious') {
      const {lat, lng, reasons, item} = result.best;
      c.lat = Math.round(lat * 1e6) / 1e6;
      c.lng = Math.round(lng * 1e6) / 1e6;
      // Staging only — do not merge; keep inactive until merge approval
      c.is_active = false;
      c.geocode_status = result.status;
      c.geocode_reasons = reasons;
      c.geocode_display = item.display_name;
      c.geocode_candidates = result.candidate_count;
      c.geocode_top = result.all_scored;
      if (c.import_category === 'POSSIBLE_DUPLICATE') {
        // Keep category so merge still requires manual decision, but coords filled
        c.geocode_note = 'co_located_address_pair';
      } else {
        c.import_category = 'READY_TO_IMPORT';
      }
      if (result.status === 'ok') stats.ok++;
      else {
        stats.suspicious_accepted++;
        c.geocode_suspicious = true;
      }
      console.log(
        `${result.status.toUpperCase()} ${c.lat}, ${c.lng} | ${reasons.join(',')}`,
      );
    } else if (result.status === 'ambiguous') {
      stats.ambiguous++;
      c.lat = null;
      c.lng = null;
      c.is_active = false;
      c.geocode_status = 'ambiguous';
      c.geocode_reason = result.reason;
      c.geocode_distance_m = result.distance_m;
      c.geocode_candidates_detail = {
        best: {
          lat: result.best.lat,
          lng: result.best.lng,
          score: result.best.score,
          display: result.best.item.display_name,
        },
        second: {
          lat: result.second.lat,
          lng: result.second.lng,
          score: result.second.score,
          display: result.second.item.display_name,
        },
      };
      if (c.import_category !== 'POSSIBLE_DUPLICATE') {
        c.import_category = 'NEEDS_REVIEW';
      }
      console.log(
        `AMBIGUOUS ${result.distance_m}m apart | kept null`,
      );
    } else {
      stats.failed++;
      c.lat = null;
      c.lng = null;
      c.is_active = false;
      c.geocode_status = 'failed';
      c.geocode_reason = result.reason;
      c.geocode_rejected = result.rejected;
      if (c.import_category !== 'POSSIBLE_DUPLICATE') {
        c.import_category = 'NEEDS_COORDINATES';
      }
      console.log(`FAIL ${result.reason}`);
    }
  }

  console.log(
    `Geocode done OK=${stats.ok} suspicious=${stats.suspicious_accepted} fail=${stats.failed} ambiguous=${stats.ambiguous} skipped=${stats.skipped} attempted=${stats.attempted}`,
  );
  return stats;
}

function writeReviewArtifacts(staging) {
  const review = staging.map(r => ({
    id: r.id,
    name: r.name,
    brand: r.brand,
    address: r.address || '',
    postal_code: r.postal_code || '',
    city: r.city || '',
    latitude: r.lat,
    longitude: r.lng,
    geocode_status: r.geocode_status || (r.lat != null ? 'ok' : 'pending'),
    import_category: r.import_category,
    verification_status: r.verification_status || null,
    geocode_display: r.geocode_display || null,
    geocode_reasons: r.geocode_reasons || null,
    geocode_suspicious: r.geocode_suspicious || false,
    geocode_reason: r.geocode_reason || null,
  }));
  fs.writeFileSync(geocodeReviewPath, JSON.stringify(review, null, 2) + '\n', 'utf8');

  const esc = v => {
    const s = v == null ? '' : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = [
    'name',
    'brand',
    'address',
    'postal_code',
    'city',
    'latitude',
    'longitude',
    'geocode_status',
    'import_category',
  ];
  const lines = [header.join(',')];
  for (const r of review) {
    lines.push(
      [
        r.name,
        r.brand,
        r.address,
        r.postal_code,
        r.city,
        r.latitude,
        r.longitude,
        r.geocode_status,
        r.import_category,
      ]
        .map(esc)
        .join(','),
    );
  }
  fs.writeFileSync(geocodeReviewCsvPath, lines.join('\n') + '\n', 'utf8');
  return {json: geocodeReviewPath, csv: geocodeReviewCsvPath};
}

function mergeIntoCenters(stagingRows) {
  const centers = JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const beforeCount = centers.length;
  const byId = new Map(centers.map(c => [c.id, c]));
  let inserted = 0;
  let updated = 0;
  let skippedNoCoords = 0;
  let skippedExisting = 0;
  const insertedIds = [];

  for (const s of stagingRows) {
    const hasCoords =
      s.lat != null &&
      s.lng != null &&
      Number.isFinite(s.lat) &&
      Number.isFinite(s.lng) &&
      !(s.lat === 0 && s.lng === 0);

    // Only merge rows with reliable coordinates (includes approved co-located brands).
    // Never import NEEDS_COORDINATES / NEEDS_REVIEW / incomplete / ambiguous without coords.
    if (!hasCoords) {
      skippedNoCoords++;
      continue;
    }

    const row = toCatalogRow(s);
    row.is_active = true;
    const existing = byId.get(row.id);
    if (existing) {
      if (existing.country && existing.country !== 'Norway') {
        skippedExisting++;
        continue;
      }
      byId.set(row.id, {...existing, ...row});
      updated++;
    } else {
      byId.set(row.id, row);
      inserted++;
      insertedIds.push(row.id);
    }

    // Mark staging row as merged (keep unresolved rows untouched for later cleanup)
    s.import_category = 'MERGED_INTO_CATALOG';
    s.is_active = true;
  }

  const next = [...byId.values()];
  fs.writeFileSync(centersPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
  return {
    before_count: beforeCount,
    after_count: next.length,
    inserted,
    updated,
    skippedNoCoords,
    skippedExisting,
    insertedIds,
    total: next.length,
  };
}

function buildPostGeocodeSummary(staging, geocodeStats) {
  const withCoords = staging.filter(r => r.lat != null && r.lng != null);
  const withoutCoords = staging.filter(r => r.lat == null || r.lng == null);
  const byChain = {};
  for (const r of staging) {
    const b = r.brand || '?';
    if (!byChain[b]) {
      byChain[b] = {total: 0, geocoded: 0, missing: 0};
    }
    byChain[b].total++;
    if (r.lat != null && r.lng != null) byChain[b].geocoded++;
    else byChain[b].missing++;
  }
  const byCategory = {};
  for (const r of staging) {
    byCategory[r.import_category] = (byCategory[r.import_category] || 0) + 1;
  }
  const byGeocodeStatus = {};
  for (const r of staging) {
    const s = r.geocode_status || 'unset';
    byGeocodeStatus[s] = (byGeocodeStatus[s] || 0) + 1;
  }

  const triaden = staging.find(r => /sats triaden/i.test(r.name));
  const mudo = staging.find(r => /mudo.*lørenskog|mudo.*lorenskog/i.test(r.name));

  return {
    total_staged: staging.length,
    successfully_geocoded: withCoords.length,
    failed_geocoding: geocodeStats?.failed ?? null,
    ambiguous_geocoding: geocodeStats?.ambiguous ?? null,
    remaining_without_coordinates: withoutCoords.length,
    by_chain: byChain,
    by_category: byCategory,
    by_geocode_status: byGeocodeStatus,
    ready_to_import: staging.filter(r => r.import_category === 'READY_TO_IMPORT')
      .length,
    needs_manual_review: staging.filter(
      r =>
        r.import_category === 'NEEDS_REVIEW' ||
        r.import_category === 'POSSIBLE_DUPLICATE',
    ).length,
    needs_coordinates: staging.filter(r => r.import_category === 'NEEDS_COORDINATES')
      .length,
    skip_incomplete: staging.filter(r => r.import_category === 'SKIP_INCOMPLETE')
      .length,
    suspicious_coords: staging.filter(r => r.geocode_suspicious).map(r => ({
      name: r.name,
      address: r.address,
      lat: r.lat,
      lng: r.lng,
      reasons: r.geocode_reasons,
      display: r.geocode_display,
    })),
    ambiguous_rows: staging
      .filter(r => r.geocode_status === 'ambiguous')
      .map(r => ({
        name: r.name,
        address: r.address,
        detail: r.geocode_candidates_detail,
      })),
    sats_triaden_mudo: {
      sats_triaden: triaden
        ? {
            name: triaden.name,
            address: triaden.address,
            postal_code: triaden.postal_code,
            city: triaden.city,
            lat: triaden.lat,
            lng: triaden.lng,
            category: triaden.import_category,
            geocode_status: triaden.geocode_status,
          }
        : null,
      mudo_lorenskog: mudo
        ? {
            name: mudo.name,
            address: mudo.address,
            postal_code: mudo.postal_code,
            city: mudo.city,
            lat: mudo.lat,
            lng: mudo.lng,
            category: mudo.import_category,
            geocode_status: mudo.geocode_status,
          }
        : null,
      same_coords:
        triaden?.lat != null &&
        mudo?.lat != null &&
        triaden.lat === mudo.lat &&
        triaden.lng === mudo.lng,
      note: 'Both kept staged; co-located brands at shared address are allowed.',
    },
    centers_json_untouched: true,
    merge_ran: false,
  };
}

async function main() {
  if (!fs.existsSync(stagingPath)) {
    console.error('Missing staging file. Run the Excel normalize step first.');
    console.error(stagingPath);
    process.exit(1);
  }

  // Safety: refuse merge unless explicitly requested (caller must not pass --merge for this phase)
  if (doMerge && (doGeocode || doGeocodePhase2 || doGeocodePhase3)) {
    console.error('Refusing combined geocode + --merge in one run for safety.');
    console.error('Run geocode first, review, then --merge separately.');
    process.exit(1);
  }

  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8'));
  const summary = {
    staging_rows: staging.length,
    ready_before: staging.filter(r => r.import_category === 'READY_TO_IMPORT').length,
    needs_coords_before: staging.filter(r => r.import_category === 'NEEDS_COORDINATES')
      .length,
    geocode: null,
    geocode_phase2_new: null,
    geocode_phase3_new: null,
    merge: null,
    note: 'No production write unless --merge. Gyms live in centers.json, not Supabase.',
  };

  if (doGeocode || doGeocodePhase2 || doGeocodePhase3) {
    console.log('Geocoding unresolved staging/phase2 rows with address+postal...');
    summary.geocode = await geocodeStaging(staging);
    fs.writeFileSync(stagingPath, JSON.stringify(staging, null, 2) + '\n', 'utf8');
    if (fs.existsSync(phase2NewPath)) {
      const phase2New = JSON.parse(fs.readFileSync(phase2NewPath, 'utf8'));
      // Also geocode unresolved phase2 rows
      const p2stats = await geocodeStaging(phase2New);
      summary.geocode_phase2_new = p2stats;
      fs.writeFileSync(phase2NewPath, JSON.stringify(phase2New, null, 2) + '\n', 'utf8');
    }
  }

  if ((doGeocodePhase2 || doGeocodePhase3) && fs.existsSync(phase2NewPath) && !summary.geocode_phase2_new) {
    const phase2New = JSON.parse(fs.readFileSync(phase2NewPath, 'utf8'));
    console.log(`Geocoding phase2 new candidates: ${phase2New.length}`);
    summary.geocode_phase2_new = await geocodeStaging(phase2New);
    fs.writeFileSync(phase2NewPath, JSON.stringify(phase2New, null, 2) + '\n', 'utf8');
  }

  if (doGeocodePhase3 && fs.existsSync(phase3NewPath)) {
    const phase3New = JSON.parse(fs.readFileSync(phase3NewPath, 'utf8'));
    console.log(`Geocoding phase3 new candidates: ${phase3New.length}`);
    summary.geocode_phase3_new = await geocodeStaging(phase3New);
    fs.writeFileSync(phase3NewPath, JSON.stringify(phase3New, null, 2) + '\n', 'utf8');
    fs.writeFileSync(
      path.join(root, 'data/norway/phase3/phase3_geocode_review.json'),
      JSON.stringify(
        phase3New.map(r => ({
          id: r.id,
          name: r.name,
          brand: r.brand,
          address: r.address || '',
          postal_code: r.postal_code || '',
          city: r.city || '',
          latitude: r.lat,
          longitude: r.lng,
          geocode_status: r.geocode_status || null,
          import_category: r.import_category,
        })),
        null,
        2,
      ) + '\n',
      'utf8',
    );
  }

  const reviewPaths = writeReviewArtifacts(staging);
  summary.post = buildPostGeocodeSummary(staging, summary.geocode);
  summary.review_files = reviewPaths;

  if (doMerge) {
    summary.merge = mergeIntoCenters(staging);
    fs.writeFileSync(stagingPath, JSON.stringify(staging, null, 2) + '\n', 'utf8');
    const reviewPathsAfter = writeReviewArtifacts(staging);
    summary.review_files = reviewPathsAfter;
    summary.post = buildPostGeocodeSummary(staging, summary.geocode);
    console.log('\nMerge complete.');
    console.log(JSON.stringify(summary.merge, null, 2));
  } else {
    console.log('\nDry run — not merging into centers.json.');
  }

  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');
  console.log('\nReport:', reportPath);
  if (summary.review_files) {
    console.log('Review JSON:', summary.review_files.json);
    console.log('Review CSV:', summary.review_files.csv);
  }
  if (!doMerge && summary.post) {
    console.log(JSON.stringify(summary.post, null, 2));
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
