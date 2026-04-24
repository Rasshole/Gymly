/**
 * Compiles data/centers/USER_MASTER_SPEC.txt → src/data/centers.json
 * Run: node scripts/compile-centers.mjs
 */
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const specPath = path.join(root, 'data/centers/USER_MASTER_SPEC.txt');
const outPath = path.join(root, 'src/data/centers.json');

const ACCENT = {æ: 'ae', ø: 'oe', å: 'aa', Æ: 'ae', Ø: 'oe', Å: 'aa'};

function slugify(s) {
  return s
    .trim()
    .split('')
    .map(c => ACCENT[c] || c)
    .join('')
    .toLowerCase()
    .replace(/[']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * "Street…, 1234 City" → { address, postal_code, city }
 * Uses last ", NNNN " before remainder as postal + city.
 */
function parseStreetPostalCity(body) {
  const m = body.match(/^(.*),\s*(\d{4})\s+(.+)$/);
  if (!m) {
    return null;
  }
  return {
    address: m[1].trim().replace(/\s+/g, ' '),
    postal_code: m[2],
    city: m[3].trim().replace(/\s+/g, ' '),
  };
}

function normalizeCity(c) {
  let x = c.replace(/\bÅrhus\b/g, 'Aarhus');
  x = x.replace(/\bKobenhavn\b/g, 'København');
  return x;
}

/**
 * Stable id: brand + postal + full street line (unique within DK postcodes).
 */
function makeId(brand, address, postal, city) {
  const base = [slugify(brand), postal, slugify(city), slugify(address)].join('-');
  if (base.length < 4) {
    return `${slugify(brand)}-${postal}-unknown`;
  }
  return base.slice(0, 128);
}

function parse() {
  let raw = fs.readFileSync(specPath, 'utf8');
  raw = raw.replace(/<\/user_query>\s*$/i, '');

  const i0 = raw.indexOf('--------------------------------------------------\nMASTER CENTER DATABASE');
  const i1 = raw.indexOf(
    '--------------------------------------------------\nIMPLEMENTATION DETAILS',
  );
  if (i0 < 0) {
    throw new Error('Could not find MASTER CENTER DATABASE');
  }
  const block = i1 > 0 ? raw.slice(i0, i1) : raw.slice(i0);
  const lines = block.split('\n');

  let currentBrand = 'PureGym';
  let comingSoon = false;
  const out = [];
  const seenIds = new Set();

  for (const line0 of lines) {
    const line = line0.trim();
    if (line === 'MASTER CENTER DATABASE') {
      continue;
    }
    if (line === '--------------------------------------------------' || !line) {
      continue;
    }
    if (/^COMING SOON\s*\/\s*BRAND:/i.test(line)) {
      const p = line.split(/BRAND:\s*/i);
      if (p[1]) {
        currentBrand = p[1].trim();
        comingSoon = true;
      }
      continue;
    }
    if (line.startsWith('BRAND:')) {
      currentBrand = line.replace(/^BRAND:\s*/i, '').trim();
      comingSoon = false;
      continue;
    }
    if (!line.startsWith('- ')) {
      continue;
    }

    const item = line.slice(2);
    if (!item) {
      continue;
    }

    const hasEm = item.includes('—');
    let brand = currentBrand;
    let namePart = '';
    let rest = item;

    if (hasEm) {
      const iEm = item.indexOf('—');
      const left = item.slice(0, iEm).trim();
      const right = item.slice(iEm + 1).trim();
      if (!right) {
        continue;
      }
      if (left.startsWith('LOOP Fitness')) {
        namePart = left;
        rest = right;
        brand = 'LOOP Fitness';
      } else if (left.startsWith('SHC ')) {
        namePart = left;
        rest = right;
        brand = 'Sporting Health Club';
      } else if (left.startsWith('ARCA ')) {
        namePart = left;
        rest = right;
        brand = 'ARCA';
      } else if (currentBrand === 'SATS') {
        namePart = left;
        rest = right;
        brand = 'SATS';
      } else {
        // Fitness X style: "Aarhus C, Ankersgade — address…"
        namePart = left;
        rest = right;
        brand = currentBrand;
      }
    } else {
      // PureGym: rest is full "Street, pc city"
      namePart = '';
      rest = item;
    }

    const parsed = parseStreetPostalCity(rest);
    if (!parsed) {
      console.warn('SKIP (parse):', item);
      continue;
    }
    const city = normalizeCity(parsed.city);
    const postal = parsed.postal_code;
    const address = parsed.address;

    let name;
    if (namePart) {
      if (brand === 'SATS' && !namePart.toLowerCase().includes('sats')) {
        name = `SATS — ${namePart}`;
      } else {
        name = namePart;
      }
    } else {
      const short = address.split(',')[0] || address;
      name = `${brand} — ${short}`;
    }

    const id = makeId(brand, address, postal, city);
    let finalId = id;
    let n = 0;
    while (seenIds.has(finalId)) {
      n += 1;
      finalId = `${id}-x${n}`;
    }
    seenIds.add(finalId);

    out.push({
      id: finalId,
      name,
      brand,
      address: `${address}, ${postal} ${city}`,
      postal_code: postal,
      city,
      country: 'Denmark',
      lat: null,
      lng: null,
      is_active: !comingSoon,
      is_coming_soon: comingSoon || undefined,
    });
  }

  return out;
}

const centers = parse();
/** Bevar geokode fra forrige centers.json (samme id), så gen-compile ikke nulstiller lat/lng. */
const prevById = new Map();
try {
  if (fs.existsSync(outPath)) {
    const prev = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    if (Array.isArray(prev)) {
      for (const c of prev) {
        if (
          c &&
          c.id != null &&
          c.lat != null &&
          c.lng != null &&
          Number.isFinite(c.lat) &&
          Number.isFinite(c.lng)
        ) {
          prevById.set(c.id, {lat: c.lat, lng: c.lng});
        }
      }
    }
  }
} catch {
  // ignore
}
let restored = 0;
for (const c of centers) {
  const p = prevById.get(c.id);
  if (p) {
    c.lat = p.lat;
    c.lng = p.lng;
    restored += 1;
  }
}
fs.writeFileSync(outPath, JSON.stringify(centers, null, 2), 'utf8');
console.log('Wrote', outPath, 'count', centers.length, 'geocode restored for ids', restored);
