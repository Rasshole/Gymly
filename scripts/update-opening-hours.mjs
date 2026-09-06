/**
 * Parse opening-hours TSV and generate src/data/gymHours.json
 *
 * Usage: node scripts/update-opening-hours.mjs [path/to/dataset.tsv]
 */
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tsvPath = process.argv[2] || path.join(root, 'data/opening-hours-dataset.tsv');
const centersPath = path.join(root, 'src/data/centers.json');
const outPath = path.join(root, 'src/data/gymHours.json');
const reportPath = path.join(root, 'data/opening-hours-import-report.json');

const CHAIN_MAP = {
  ARCA: 'ARCA',
  SHC: 'Sporting Health Club',
  'LOOP Fitness': 'LOOP Fitness',
  'Fitness X': 'Fitness X',
  SATS: 'SATS',
  PureGym: 'PureGym',
  STC: 'STC',
  Actic: 'Actic',
  'Nordic Wellness': 'Nordic Wellness',
  Fitness24Seven: 'Fitness24Seven',
  'Friskis & Svettis': 'Friskis & Svettis',
};

const COUNTRY_MAP = {DK: 'Denmark', SE: 'Sweden', Sweden: 'Sweden', Denmark: 'Denmark'};

const CLOSED = new Set([
  'lukket',
  'stangt',
  'stängt',
  'stängt',
  'closed',
  'staengt',
  'n/a',
]);

const UNSTAFFED = new Set([
  'ingen',
  'ikke bemandet',
  'obemannat',
  'unstaffed',
  'fuldt bemandet',
  'bemandet i hele abningstiden',
  'bemandet i hele åbningstiden',
  'personale i hele abningstiden',
]);

function normalize(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/æ/g, 'ae')
    .replace(/ö/g, 'o')
    .replace(/ä/g, 'a')
    .replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseTimeRange(value) {
  const v = (value || '').trim();
  if (!v) return null;
  const lower = normalize(v);
  if (CLOSED.has(lower) || lower.includes('could not retrieve')) return 'closed';
  if (lower === '24 timer' || lower === '24h' || lower.includes('abent 24')) {
    return {is24h: true};
  }
  const m = v.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
  if (!m) return null;
  let open = m[1].padStart(5, '0');
  let close = m[2].padStart(5, '0');
  if (open.length === 4) open = '0' + open;
  if (close.length === 4) close = '0' + close;
  // 05:00-04:59 style = 24/7 access
  if (close === '04:59' && open.startsWith('05:')) return {is24h: true};
  if (close === '00:00' && open.startsWith('05:')) close = '24:00';
  if (close === '24:00' || close === '23:59') {
    // keep as-is
  }
  return {open, close};
}

function parseStaffed(value, openRange, notes) {
  const v = (value || '').trim();
  if (!v || v.toLowerCase() === 'se noter') {
    if (notes && notes.toLowerCase().startsWith('bem.')) return notes.replace(/^bem\.\s*/i, '');
    if (notes) return notes;
    return undefined;
  }
  const lower = normalize(v);
  if (CLOSED.has(lower)) return null;
  if (lower === 'ingen' || lower === 'ikke bemandet' || lower === 'obemannat') return null;
  if (lower.includes('fuldt bemandet') || lower.includes('bemandet i hele')) {
    if (openRange && openRange.open) return `${openRange.open}-${openRange.close}`;
    return 'Fuldt bemandet';
  }
  // Pass through complex schedules as display strings (normalize times to HH:MM)
  return v
    .replace(/(\d{1,2})[:.](\d{2})/g, (_, h, m) => `${h.padStart(2, '0')}:${m}`)
    .replace(/\s*&\s*/g, ' & ')
    .replace(/\s*\+\s*/g, ' & ');
}

function dayEntry(openVal, staffedVal, notes) {
  const openRange = parseTimeRange(openVal);
  if (openRange === 'closed') return null;
  if (openRange?.is24h) {
    return {
      open: '00:00',
      close: '24:00',
      staffed: parseStaffed(staffedVal, {open: '00:00', close: '24:00'}, notes),
    };
  }
  if (!openRange) return null;
  const staffed = parseStaffed(staffedVal, openRange, notes);
  return {
    open: openRange.open,
    close: openRange.close,
    ...(staffed !== undefined ? {staffed} : {}),
  };
}

function buildGymHours(row) {
  const notes = row.notes?.trim();
  const days = {
    monday: dayEntry(row.monThuOpen, row.monThuStaffed, notes),
    tuesday: dayEntry(row.monThuOpen, row.monThuStaffed, notes),
    wednesday: dayEntry(row.monThuOpen, row.monThuStaffed, notes),
    thursday: dayEntry(row.monThuOpen, row.monThuStaffed, notes),
    friday: dayEntry(row.friOpen, row.friStaffed, notes),
    saturday: dayEntry(row.satOpen, row.satStaffed, notes),
    sunday: dayEntry(row.sunOpen, row.sunStaffed, notes),
  };

  const hasAnyOpen = Object.values(days).some(Boolean);
  if (!hasAnyOpen) return null;

  const all24 =
    [row.monThuOpen, row.friOpen, row.satOpen, row.sunOpen].every(v => {
      const p = parseTimeRange(v);
      return p?.is24h || normalize(v).includes('24');
    }) &&
    days.monday?.open === '00:00' &&
    days.monday?.close === '24:00';

  const entry = {gymId: ''};
  for (const [k, v] of Object.entries(days)) {
    if (v) entry[k] = v;
  }
  if (all24) entry.isOpen24Hours = true;
  if (notes && !notes.toLowerCase().includes('assumed')) {
    entry.notes = notes;
  }
  return entry;
}

function parseTsv(content) {
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0].split('\t');
  const idx = name => header.indexOf(name);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    if (cols.length < 5) continue;
    const chain = cols[idx('Chain')]?.trim();
    if (!chain || chain === 'Chain') continue;
    rows.push({
      chain,
      country: cols[idx('Country')]?.trim(),
      center: cols[idx('Center')]?.trim(),
      address: cols[idx('Address')]?.trim(),
      monThuOpen: cols[idx('Mon-Thu Open')]?.trim(),
      monThuStaffed: cols[idx('Mon-Thu Staffed')]?.trim(),
      friOpen: cols[idx('Fri Open')]?.trim(),
      friStaffed: cols[idx('Fri Staffed')]?.trim(),
      satOpen: cols[idx('Sat Open')]?.trim(),
      satStaffed: cols[idx('Sat Staffed')]?.trim(),
      sunOpen: cols[idx('Sun Open')]?.trim(),
      sunStaffed: cols[idx('Sun Staffed')]?.trim(),
      notes: cols[idx('Notes')]?.trim(),
    });
  }
  return rows;
}

function centerTokens(center, brand) {
  let name = center.name || '';
  name = name.replace(/^PureGym\s*[—–-]\s*/i, '');
  name = name.replace(/^SATS\s*[—–-]\s*/i, '');
  name = name.replace(/^SHC\s+/i, '');
  name = name.replace(/^ARCA\s+/i, '');
  name = name.replace(/^LOOP Fitness\s+/i, '');
  name = name.replace(/^Nordic Wellness\s+/i, '');
  name = name.replace(/^Fitness24Seven\s+/i, '');
  name = name.replace(/^Actic\s+/i, '');
  name = name.replace(/^Friskis & Svettis\s+/i, '');
  name = name.replace(/^STC\s+/i, '');

  const tokens = new Set();
  const add = s => {
    const n = normalize(s);
    if (n.length >= 2) tokens.add(n);
    n.split(' ').filter(w => w.length >= 3).forEach(w => tokens.add(w));
  };

  add(name);
  add(center.city);
  add(center.address);

  if (brand === 'Fitness X') {
    const parts = name.split(',');
    if (parts.length > 1) add(parts[parts.length - 1]);
    // TSV uses "City - Location" while codebase uses "City, Location"
    add(name.replace(',', ' ').replace(/\s*-\s*/g, ' '));
  }

  return tokens;
}

function rowTokens(row) {
  const tokens = new Set();
  const add = s => {
    const n = normalize(s);
    if (n.length >= 2) tokens.add(n);
    n.split(' ').filter(w => w.length >= 3).forEach(w => tokens.add(w));
  };

  let center = row.center;
  // Fitness X: "Aarhus C - Ankersgade" → "Ankersgade"
  center = center.replace(/^[^:]+:\s*-\s*/, '');
  center = center.replace(/^[A-Za-zÀ-ÿ\s]+\s+-\s+/, '');
  add(center);
  add(row.center.replace(/\s*-\s*/g, ' '));
  add(row.address);
  if (row.address) {
    const street = row.address.split(',')[0];
    add(street);
  }

  const cityFromCenter = row.center.match(/^([A-Za-zÀ-ÿ\s]+)\s+-/);
  if (cityFromCenter) add(cityFromCenter[1]);

  return tokens;
}

function scoreMatch(center, row, brand) {
  const ct = centerTokens(center, brand);
  const rt = rowTokens(row);
  let score = 0;
  for (const t of rt) {
    if (ct.has(t)) score += t.length >= 6 ? 4 : 2;
  }
  const cn = normalize(center.city);
  const rc = normalize(row.center.split('-')[0] || row.center);
  if (cn && rc.includes(cn)) score += 5;
  if (cn && normalize(row.address).includes(cn)) score += 3;

  // Strong match on street/address overlap
  if (row.address && center.address) {
    const rowStreet = normalize(row.address.split(',')[0]);
    const centerStreet = normalize(center.address.split(',')[0]);
    if (rowStreet && centerStreet) {
      if (rowStreet === centerStreet) score += 20;
      else if (rowStreet.includes(centerStreet) || centerStreet.includes(rowStreet)) score += 12;
      else {
        const rowWords = rowStreet.split(' ').filter(w => w.length >= 4);
        const centerWords = centerStreet.split(' ').filter(w => w.length >= 4);
        for (const w of rowWords) {
          if (centerWords.includes(w)) score += 5;
        }
      }
    }
  }

  // LOOP: "LOOP Fitness Aabenraa" ↔ row center "Aabenraa"
  if (brand === 'LOOP Fitness') {
    const loc = normalize(center.name.replace(/^loop fitness\s+/i, ''));
    const rowLoc = normalize(row.center);
    if (loc && rowLoc && (loc === rowLoc || loc.startsWith(rowLoc) || rowLoc.startsWith(loc))) {
      score += 15;
    }
  }

  // PureGym row labels like "KBH N Esromgade" ↔ address contains esromgade
  if (brand === 'PureGym') {
    const parts = row.center.split(/\s+/);
    const locPart = normalize(parts.slice(2).join(' ') || parts.slice(1).join(' '));
    if (locPart && normalize(center.address).includes(locPart)) score += 15;
    if (locPart && normalize(center.name).includes(locPart)) score += 10;
  }

  return score;
}

function dedupeRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = `${row.chain}|${row.country}|${normalize(row.center)}`;
    map.set(key, row);
  }
  return [...map.values()];
}

function main() {
  const tsv = fs.readFileSync(tsvPath, 'utf8');
  const centers = JSON.parse(fs.readFileSync(centersPath, 'utf8'));
  const rows = dedupeRows(parseTsv(tsv)).sort(
    (a, b) => (b.address?.length || 0) - (a.address?.length || 0),
  );

  const matched = [];
  const unmatchedRows = [];
  const usedCenterIds = new Set();
  const hoursById = {};

  for (const row of rows) {
    const brand = CHAIN_MAP[row.chain];
    const country = COUNTRY_MAP[row.country];
    if (!brand || !country) {
      unmatchedRows.push({...row, reason: 'unknown chain/country'});
      continue;
    }

    const openMissing = [row.monThuOpen, row.friOpen, row.satOpen, row.sunOpen].every(
      v => !v || CLOSED.has(normalize(v)) || v.toLowerCase().includes('could not retrieve'),
    );
    if (openMissing) {
      unmatchedRows.push({...row, reason: 'no hours data'});
      continue;
    }

    const candidates = centers.filter(
      c => c.brand === brand && (c.country === country || normalize(c.country) === normalize(country)),
    );

    let best = null;
    let bestScore = 0;
    for (const c of candidates) {
      if (usedCenterIds.has(c.id)) continue;
      const s = scoreMatch(c, row, brand);
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }

    if (!best || bestScore < 4) {
      unmatchedRows.push({...row, reason: `no match (best score ${bestScore})`});
      continue;
    }

    const hours = buildGymHours(row);
    if (!hours) {
      unmatchedRows.push({...row, reason: 'failed to parse hours'});
      continue;
    }

    hours.gymId = best.id;
    hoursById[best.id] = hours;
    usedCenterIds.add(best.id);
    matched.push({
      id: best.id,
      name: best.name,
      chain: row.chain,
      center: row.center,
      score: bestScore,
    });
  }

  const unmatchedCenters = centers.filter(c => !hoursById[c.id]).map(c => ({
    id: c.id,
    brand: c.brand,
    name: c.name,
    city: c.city,
    country: c.country,
  }));

  const output = Object.values(hoursById);
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');

  const report = {
    generatedAt: new Date().toISOString(),
    tsvRows: rows.length,
    matched: matched.length,
    unmatchedRows: unmatchedRows.length,
    unmatchedCenters: unmatchedCenters.length,
    matchedSamples: matched.slice(0, 20),
    unmatchedRowSamples: unmatchedRows.slice(0, 40),
    unmatchedCenterSamples: unmatchedCenters.slice(0, 40),
    fullUnmatchedRows: unmatchedRows,
    fullUnmatchedCenters: unmatchedCenters,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

  console.log(`Wrote ${output.length} center hours to ${outPath}`);
  console.log(`Matched: ${matched.length}, unmatched TSV rows: ${unmatchedRows.length}, centers without hours: ${unmatchedCenters.length}`);
  console.log(`Report: ${reportPath}`);
}

main();
