/**
 * Geocode centers_sweden.json (Nominatim) and merge into src/data/centers.json.
 * Google Geocoding may be disabled; Nominatim works without API key.
 *
 *   node scripts/merge-sweden-centers.mjs
 *   node scripts/merge-sweden-centers.mjs --skip-geocode   # merge only
 */
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const swedenPath = path.join(root, 'centers_sweden.json');
const centersPath = path.join(root, 'src/data/centers.json');
const skipGeocode = process.argv.includes('--skip-geocode');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const USER_AGENT = `GymlySwedenGeocoder/1.0 (${process.env.NOMINATIM_EMAIL || 'dev-local'})`;

async function nominatimSearch(query) {
  const u = new URL('https://nominatim.openstreetmap.org/search');
  u.searchParams.set('q', query);
  u.searchParams.set('format', 'json');
  u.searchParams.set('limit', '1');
  u.searchParams.set('countrycodes', 'se');
  const res = await fetch(u, {
    headers: {'User-Agent': USER_AGENT, Accept: 'application/json'},
  });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  const lat = parseFloat(data[0].lat);
  const lon = parseFloat(data[0].lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {lat, lng: lon};
}

function normalizeSwedenCenter(c) {
  return {
    id: c.id,
    name: c.name,
    brand: c.brand,
    address: c.address,
    postal_code: c.postal_code,
    city: c.city,
    country: c.country === 'SE' ? 'Sweden' : c.country,
    lat: c.lat ?? null,
    lng: c.lng ?? null,
    is_active: c.is_active !== false,
    ...(c.is_coming_soon ? {is_coming_soon: true} : {}),
  };
}

async function geocodeSweden(centers) {
  let ok = 0;
  let miss = 0;
  for (let i = 0; i < centers.length; i++) {
    const c = centers[i];
    if (c.lat != null && c.lng != null) continue;
    const q1 = `${c.address}, ${c.postal_code} ${c.city}, Sweden`;
    const q2 = `${c.postal_code} ${c.city}, Sweden`;
    process.stdout.write(`[${i + 1}/${centers.length}] ${c.name.slice(0, 42).padEnd(43)}`);
    let p = await nominatimSearch(q1);
    if (!p) {
      await sleep(1100);
      p = await nominatimSearch(q2);
    }
    if (p) {
      c.lat = Math.round(p.lat * 1e6) / 1e6;
      c.lng = Math.round(p.lng * 1e6) / 1e6;
      ok++;
      console.log(`OK ${c.lat}, ${c.lng}`);
    } else {
      miss++;
      console.log('INGEN KOORDINATER');
    }
    if (i < centers.length - 1) await sleep(1100);
  }
  console.log(`Geocoded: ${ok}/${centers.length}, missing: ${miss}`);
  return centers;
}

async function main() {
  if (!fs.existsSync(swedenPath)) {
    throw new Error(`Missing ${swedenPath} — run node import_sweden_gyms.js first`);
  }

  let sweden = JSON.parse(fs.readFileSync(swedenPath, 'utf8'));
  if (!Array.isArray(sweden)) throw new Error('centers_sweden.json must be an array');

  if (!skipGeocode) {
    console.log(`Geocoding ${sweden.length} Swedish centers via Nominatim…`);
    sweden = await geocodeSweden(sweden);
    fs.writeFileSync(swedenPath, JSON.stringify(sweden, null, 2), 'utf8');
    console.log('Updated', swedenPath);
  }

  const existing = JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const ids = new Set(existing.map(c => c.id));
  const normalized = sweden.map(normalizeSwedenCenter);
  const toAdd = normalized.filter(c => !ids.has(c.id));
  const skipped = normalized.length - toAdd.length;

  const merged = [...existing, ...toAdd];
  fs.writeFileSync(centersPath, JSON.stringify(merged, null, 2), 'utf8');

  console.log(`Merged: ${existing.length} existing + ${toAdd.length} new = ${merged.length} total`);
  if (skipped) console.log(`Skipped ${skipped} duplicate id(s)`);
  const withCoords = toAdd.filter(c => c.lat != null).length;
  console.log(`New centers with coordinates: ${withCoords}/${toAdd.length}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
