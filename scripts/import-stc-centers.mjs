/**
 * Import STC gyms from CSV → geocode (Nominatim) → centers_stc.json → merge into centers.json
 *
 *   node scripts/import-stc-centers.mjs [path/to/stc_gyms_sweden.csv]
 *   node scripts/import-stc-centers.mjs --skip-geocode
 */
import fs from 'fs';
import path from 'path';
import {createHash} from 'crypto';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const defaultCsv = path.join(
  process.env.HOME,
  'Desktop/Gymly/App screenshots/stc_gyms_sweden.csv',
);
const outPath = path.join(root, 'centers_stc.json');
const centersPath = path.join(root, 'src/data/centers.json');
const skipGeocode = process.argv.includes('--skip-geocode');
const csvArg = process.argv.find(a => a.endsWith('.csv'));
const csvPath = csvArg ? path.resolve(csvArg) : defaultCsv;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const USER_AGENT = `GymlyStcGeocoder/1.0 (${process.env.NOMINATIM_EMAIL || 'dev-local'})`;

function makeId(name, address) {
  const hash = createHash('md5').update(`${name}${address}`).digest('hex').slice(0, 10);
  return `se_stc_${hash}`;
}

function parseCsv(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((h, i) => [h, (values[i] || '').trim()]));
  });
}

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

function toGymCenter(row) {
  return {
    id: makeId(row.name, row.address),
    name: row.name,
    brand: row.chain || 'STC',
    address: row.address,
    postal_code: row.zip,
    city: row.city,
    country: row.country === 'SE' ? 'Sweden' : row.country,
    lat: null,
    lng: null,
    is_active: true,
  };
}

async function geocodeCenters(centers) {
  let ok = 0;
  let miss = 0;
  for (let i = 0; i < centers.length; i++) {
    const c = centers[i];
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
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found: ${csvPath}`);
  }

  const rows = parseCsv(csvPath);
  console.log(`Parsed ${rows.length} STC locations from ${csvPath}`);

  let centers = rows.map(toGymCenter);

  const idSet = new Set();
  for (const c of centers) {
    if (idSet.has(c.id)) {
      console.warn('Duplicate id in CSV:', c.id, c.name);
    }
    idSet.add(c.id);
  }

  if (!skipGeocode) {
    console.log('Geocoding via Nominatim…');
    centers = await geocodeCenters(centers);
  }

  fs.writeFileSync(outPath, JSON.stringify(centers, null, 2), 'utf8');
  console.log('Wrote', outPath);

  const existing = JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const existingIds = new Set(existing.map(c => c.id));
  const toAdd = centers.filter(c => !existingIds.has(c.id));
  const skipped = centers.length - toAdd.length;

  const merged = [...existing, ...toAdd];
  fs.writeFileSync(centersPath, JSON.stringify(merged, null, 2), 'utf8');

  console.log(`Merged: ${existing.length} existing + ${toAdd.length} new = ${merged.length} total`);
  if (skipped) console.log(`Skipped ${skipped} duplicate id(s)`);
  const withCoords = toAdd.filter(c => c.lat != null).length;
  console.log(`STC with coordinates: ${withCoords}/${toAdd.length}`);
  console.log(`Final centers.json count: ${merged.length}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
