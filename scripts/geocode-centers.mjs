/**
 * Fylder lat/lng i src/data/centers.json via Nominatim (OpenStreetMap).
 * Kræver netværk. Respekterer ~1 anmodning/sek. (Nominatim brugsbetingelser).
 *
 *   node scripts/geocode-centers.mjs
 *   node scripts/geocode-centers.mjs --dry-run
 *   node scripts/geocode-centers.mjs --limit=5
 *   node scripts/geocode-centers.mjs --all-missing
 *   (tilføj --all-missing for at geokode også inaktive / coming-soon uden koordinater)
 *
 * Sæt evt. NOMINATIM_EMAIL (valgfri kontakt for User-Agent).
 */
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {getApproxLatLngForPostalCode} from './dkPostalPrefix.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outPath = path.join(root, 'src/data/centers.json');

const sleep = ms => new Promise(r => setTimeout(r, ms));

const USER_AGENT = `GymlyCentersGeocoder/1.0 (${
  process.env.NOMINATIM_EMAIL || 'dev-local'
})`;

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  /** Standard: kun kort-relevante centre (active, ikke coming-soon). */
  const mapCentersOnly = !process.argv.includes('--all-missing');
  let limit = null;
  for (const a of process.argv) {
    if (a.startsWith('--limit=')) {
      const n = parseInt(a.split('=')[1], 10);
      if (Number.isFinite(n) && n > 0) {
        limit = n;
      }
    }
  }
  return {dryRun, mapCentersOnly, limit};
}

async function nominatimSearch(query) {
  const u = new URL('https://nominatim.openstreetmap.org/search');
  u.searchParams.set('q', query);
  u.searchParams.set('format', 'json');
  u.searchParams.set('limit', '1');
  u.searchParams.set('countrycodes', 'dk');
  const res = await fetch(u, {
    headers: {'User-Agent': USER_AGENT, Accept: 'application/json'},
  });
  if (!res.ok) {
    throw new Error(`Nominatim HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }
  const first = data[0];
  const lat = parseFloat(first.lat);
  const lon = parseFloat(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  return {lat, lon};
}

function needsGeocode(c, mapCentersOnly) {
  if (mapCentersOnly && (!c.is_active || c.is_coming_soon)) {
    return false;
  }
  if (c.lat != null && c.lng != null && Number.isFinite(c.lat) && Number.isFinite(c.lng)) {
    return false;
  }
  return true;
}

async function main() {
  const {dryRun, mapCentersOnly, limit} = parseArgs();
  const raw = fs.readFileSync(outPath, 'utf8');
  const centers = JSON.parse(raw);
  if (!Array.isArray(centers)) {
    throw new Error('centers.json must be an array');
  }

  const toDo = [];
  for (const c of centers) {
    if (needsGeocode(c, mapCentersOnly)) {
      toDo.push(c);
    }
  }
  const slice = limit != null ? toDo.slice(0, limit) : toDo;

  console.log(
    'Centers with missing lat/lng:',
    toDo.length,
    '→ will process:',
    slice.length,
    dryRun ? '(dry-run)' : '',
  );

  let okNominatim = 0;
  let okPostal = 0;
  let err = 0;
  for (let i = 0; i < slice.length; i += 1) {
    const c = slice[i];
    /** address indeholder allerede "gade, postnr by" (compile-centers) */
    const q1 = [c.address, c.country || 'Denmark'].filter(Boolean).join(', ');
    const q2 = [`${c.postal_code} ${c.city}`.trim(), c.country || 'Denmark']
      .filter(Boolean)
      .join(', ');
    console.log(
      `[${i + 1}/${slice.length}] ${c.id} — ${q1.slice(0, 80)}${q1.length > 80 ? '...' : ''}`,
    );
    if (dryRun) {
      if (i < slice.length - 1) {
        await sleep(1100);
      }
      continue;
    }
    try {
      let p = await nominatimSearch(q1);
      if (!p) {
        await sleep(1100);
        p = await nominatimSearch(q2);
        if (p) {
          console.log(`  (retry: post+by) → ${p.lat} ${p.lon}`);
        }
      }
      if (p) {
        c.lat = Math.round(p.lat * 1e6) / 1e6;
        c.lng = Math.round(p.lon * 1e6) / 1e6;
        okNominatim += 1;
        console.log('  →', c.lat, c.lng);
      } else {
        const a = getApproxLatLngForPostalCode(c.postal_code);
        c.lat = a.lat;
        c.lng = a.lng;
        okPostal += 1;
        console.warn(
          `  → [postnummer-fallback] ${c.lat} ${c.lng} (efter 2 Nominatim-miss)`,
        );
      }
    } catch (e) {
      err += 1;
      const a = getApproxLatLngForPostalCode(c.postal_code);
      c.lat = a.lat;
      c.lng = a.lng;
      okPostal += 1;
      console.error('  → error, bruger post-fallback', e.message, c.lat, c.lng);
    }
    if (i < slice.length - 1) {
      await sleep(1100);
    }
  }

  if (!dryRun && slice.length > 0) {
    fs.writeFileSync(outPath, JSON.stringify(centers, null, 2), 'utf8');
    console.log('Wrote', outPath, 'nominatim', okNominatim, 'postal-fallback', okPostal, 'errors', err);
  } else if (dryRun) {
    console.log('Dry run — no file written');
  } else {
    console.log('Nothing to do');
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
