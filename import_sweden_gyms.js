#!/usr/bin/env node
/**
 * Gymly – Swedish Gym Importer
 * Læser sweden_gyms_complete.csv, geocoder via Google Maps,
 * og outputter centers_sweden.json klar til merge med src/data/centers.json
 *
 * Kopier denne fil + sweden_gyms_complete.csv til Gymly-projektets rod og kør:
 *   node import_sweden_gyms.js
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const { createHash } = require('crypto');

// Load .env automatisk
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const idx = line.indexOf('=');
    if (idx > 0) {
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[k]) process.env[k] = v;
    }
  });
}

const API_KEY = process.env.GOOGLE_MAPS_API_KEY
             || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
             || process.env.MAPS_API_KEY
             || '';

if (!API_KEY) {
  console.error('Ingen Google Maps API key fundet i .env');
  process.exit(1);
}

const CSV  = path.join(process.cwd(), 'sweden_gyms_complete.csv');
const OUT  = path.join(process.cwd(), 'centers_sweden.json');

const makeId = (n, c) => 'se_' + createHash('md5').update(n+c).digest('hex').slice(0,10);

function geocode(addr, zip, city) {
  return new Promise(resolve => {
    const q = encodeURIComponent(`${addr}, ${zip} ${city}, Sweden`);
    https.get(`https://maps.googleapis.com/maps/api/geocode/json?address=${q}&key=${API_KEY}`, res => {
      let d = '';
      res.on('data', x => d += x);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          if (j.status === 'OK') {
            resolve(j.results[0].geometry.location);
          } else resolve({ lat: null, lng: null });
        } catch { resolve({ lat: null, lng: null }); }
      });
    }).on('error', () => resolve({ lat: null, lng: null }));
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('Gymly Swedish Gym Importer');
  const lines = fs.readFileSync(CSV, 'utf8').trim().split('\n');
  const headers = lines[0].split(',');
  const rows = lines.slice(1).map(l => {
    const v = l.split(',');
    return Object.fromEntries(headers.map((h,i) => [h.trim(), (v[i]||'').trim()]));
  });
  console.log(`${rows.length} gyms fundet\n`);

  const centers = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    process.stdout.write(`[${i+1}/${rows.length}] ${r.name.substring(0,45).padEnd(46)}`);
    const { lat, lng } = await geocode(r.address, r.zip, r.city);
    centers.push({
      id: makeId(r.name, r.city),
      name: r.name,
      brand: r.chain,
      address: r.address,
      postal_code: r.zip,
      city: r.city,
      country: 'SE',
      lat: lat || null,
      lng: lng || null,
      is_active: true,
      is_coming_soon: false,
    });
    console.log(lat ? `OK ${lat.toFixed(4)}, ${lng.toFixed(4)}` : 'INGEN KOORDINATER');
    await sleep(50);
  }

  fs.writeFileSync(OUT, JSON.stringify(centers, null, 2));
  console.log(`\nFaerdig! ${centers.filter(c=>c.lat).length}/${centers.length} geocodet`);
  console.log(`Gemt: centers_sweden.json`);
  console.log(`\nNaeste: Sig til Cursor "Merge centers_sweden.json ind i src/data/centers.json"`);
}

main().catch(console.error);
