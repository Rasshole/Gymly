/**
 * Austria production merge safety — post-merge catalog integrity.
 * Validates 335 safe READY rows merged into centers.json (349 canonical minus 14 MYGYM encoding duplicates).
 */
import fs from 'fs';
import path from 'path';
import {ALL_GYM_CENTERS, getEffectiveLatLng} from '../src/data/centerRegistry';
import {getActiveGymsByCountry} from '../src/data/danishGyms';
import {findGymById} from '../src/utils/gymDisplay';
import {formatGymCountryLabel, gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {createTranslator} from '../src/i18n/translate';
import en from '../src/i18n/translations/en';
import {normalizeGymSearchValue} from '../src/services/gymSearch/gymSearchNormalize';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';

const AT_POSTAL_RE = /^\d{4}$/;
const AT_BOUNDS = {latMin: 46.35, latMax: 49.05, lngMin: 9.45, lngMax: 17.2};
const MOJIBAKE_RE = /Ã.|�|â€/;
const LITERAL_ESCAPE_RE = /\\x[0-9a-fA-F]{2}/;

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function normalizeBrand(b: string): string {
  return String(b || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeAddr(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

describe('Austria merge safety', () => {
  const austria = ALL_GYM_CENTERS.filter(c => c.country === 'Austria');
  const reportPath = path.join(__dirname, '../data/austria/AUSTRIA_MERGE_REPORT.json');
  const approvedPath = path.join(__dirname, '../data/austria/AUSTRIA_APPROVED_FOR_MERGE.json');

  test('total catalog = 10050; Austria = 335', () => {
    expect(ALL_GYM_CENTERS.length).toBe(10050);
    expect(austria.length).toBe(335);
  });

  test('existing country counts unchanged', () => {
    const counts: Record<string, number> = {};
    ALL_GYM_CENTERS.forEach(c => {
      counts[c.country] = (counts[c.country] || 0) + 1;
    });
    expect(counts['Denmark']).toBe(354);
    expect(counts['Sweden']).toBe(639);
    expect(counts['Norway']).toBe(535);
    expect(counts['Finland']).toBe(429);
    expect(counts['Germany']).toBe(1424);
    expect(counts['United Kingdom']).toBe(1474);
    expect(counts['Netherlands']).toBe(600);
    expect(counts['France']).toBe(1712);
    expect(counts['Spain']).toBe(976);
    expect(counts['Italy']).toBe(588);
    expect(counts['Belgium']).toBe(363);
    expect(counts['Poland']).toBe(621);
    expect(counts['Austria']).toBe(335);
  });

  test('all Austria IDs are unique at_*', () => {
    const ids = austria.map(c => c.id);
    expect(new Set(ids).size).toBe(335);
    expect(ids.every(id => id.startsWith('at_'))).toBe(true);
  });

  test('Austria rows have valid postcodes, coords, names, brands, addresses', () => {
    for (const c of austria) {
      expect(c.country).toBe('Austria');
      expect(c.is_active).toBe(true);
      expect(String(c.name || '').trim().length).toBeGreaterThan(0);
      expect(String(c.brand || '').trim().length).toBeGreaterThan(0);
      expect(String(c.address || '').trim().length).toBeGreaterThan(0);
      expect(String(c.city || '').trim().length).toBeGreaterThan(0);
      expect(typeof c.postal_code).toBe('string');
      expect(AT_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(Number.isFinite(c.lat)).toBe(true);
      expect(Number.isFinite(c.lng)).toBe(true);
      expect(c.lat).not.toBe(0);
      expect(c.lng).not.toBe(0);
      expect(c.lat! >= AT_BOUNDS.latMin && c.lat! <= AT_BOUNDS.latMax).toBe(true);
      expect(c.lng! >= AT_BOUNDS.lngMin && c.lng! <= AT_BOUNDS.lngMax).toBe(true);
      const blob = `${c.name} ${c.address} ${c.city} ${c.brand}`;
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
      expect(LITERAL_ESCAPE_RE.test(blob)).toBe(false);
    }
  });

  test('no same-brand same-address duplicates', () => {
    const keys = new Set<string>();
    for (const c of austria) {
      const k = [
        normalizeAddr(c.address || ''),
        String(c.postal_code || '').trim(),
        normalizeAddr(c.city || ''),
        normalizeBrand(c.brand || ''),
      ].join('|');
      expect(keys.has(k)).toBe(false);
      keys.add(k);
    }
  });

  test('retained John Harris close pair has different addresses', () => {
    const pairs: Array<{a: string; b: string; d: number; sameAddr: boolean}> = [];
    for (let i = 0; i < austria.length; i++) {
      for (let j = i + 1; j < austria.length; j++) {
        const a = austria[i]!;
        const b = austria[j]!;
        if (normalizeBrand(a.brand) !== normalizeBrand(b.brand)) continue;
        const d = haversineMeters(a.lat!, a.lng!, b.lat!, b.lng!);
        if (d < 100) {
          const sameAddr =
            normalizeAddr(a.address || '') === normalizeAddr(b.address || '') &&
            a.postal_code === b.postal_code;
          pairs.push({a: a.id, b: b.id, d: Math.round(d), sameAddr});
        }
      }
    }
    expect(pairs.some(p => p.sameAddr)).toBe(false);
    expect(pairs.length).toBe(1);
    expect(pairs[0]?.d).toBe(60);
  });

  test('brand breakdown sums to 335', () => {
    const byBrand: Record<string, number> = {};
    austria.forEach(c => {
      byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
    });
    expect(byBrand['FITINN']).toBe(51);
    expect(byBrand['Mrs.Sporty']).toBe(50);
    expect(byBrand['clever fit']).toBe(40);
    expect(byBrand['MYGYM']).toBe(23);
    expect(byBrand['INJOY']).toBe(35);
    expect(byBrand['Speedfit']).toBe(31);
    expect(byBrand['HappyFit']).toBe(29);
    expect(byBrand['Anytime Fitness']).toBe(22);
    expect(byBrand['McFIT']).toBe(15);
    expect(byBrand['John Harris Fitness']).toBe(12);
    expect(byBrand['Fit Fabrik']).toBe(12);
    expect(byBrand['JOHN REED']).toBe(7);
    expect(byBrand['Fitness First']).toBe(4);
    expect(byBrand['Holmes Place']).toBe(3);
    expect(byBrand["Gold's Gym"]).toBe(1);
    expect(Object.values(byBrand).reduce((a, b) => a + b, 0)).toBe(335);
  });

  test('CHECK_IN_RADIUS_METERS = 200 unchanged', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
  });

  test('merge report confirms 335 inserted and 10K crossed', () => {
    expect(fs.existsSync(reportPath)).toBe(true);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    expect(report.inserted).toBe(335);
    expect(report.before.total).toBe(9715);
    expect(report.before.austria).toBe(0);
    expect(report.after.total).toBe(10050);
    expect(report.after.austria).toBe(335);
    expect(report.checkpoint_10k.threshold_crossed).toBe(true);
    expect(report.checkpoint_10k.amount_above_10000).toBe(50);
    expect(report.encoding_duplicates_withheld).toHaveLength(14);
    expect(report.global_qa_lock.country_expansion_allowed).toBe(false);
  });

  test('staging reconciliation: 335 MERGED, 14 DUPLICATE, exclusions preserved', () => {
    const stagingPath = path.join(__dirname, '../data/austria/austria_centers_staging.json');
    const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8'));
    const merged = staging.filter((r: {import_category: string}) => r.import_category === 'MERGED_INTO_CATALOG');
    const duplicate = staging.filter((r: {import_category: string}) => r.import_category === 'DUPLICATE');
    const ready = staging.filter((r: {import_category: string}) => r.import_category === 'READY_TO_IMPORT');
    expect(merged.length).toBe(335);
    expect(duplicate.length).toBe(14);
    expect(ready.length).toBe(0);
    expect(staging.filter((r: {import_category: string}) => r.import_category === 'NEEDS_COORDINATES').length).toBe(9);
    expect(staging.filter((r: {import_category: string}) => r.import_category === 'NEEDS_REVIEW').length).toBe(8);
    expect(staging.filter((r: {import_category: string}) => r.import_category === 'CLOSED').length).toBe(1);
    const prodIds = new Set(austria.map(c => c.id));
    const mergedIds = new Set(merged.map((r: {id: string}) => r.id));
    expect([...prodIds].every(id => mergedIds.has(id))).toBe(true);
  });

  test('approved for merge matches production Austria set', () => {
    const approved = JSON.parse(fs.readFileSync(approvedPath, 'utf8'));
    expect(approved.length).toBe(335);
    const prodIds = new Set(austria.map(c => c.id));
    expect(approved.every((r: {id: string}) => prodIds.has(r.id))).toBe(true);
  });

  test('structural smoke: registry, search, country label', () => {
    const sample = austria[0]!;
    expect(findGymById(sample.id)?.id).toBe(sample.id);
    expect(getActiveGymsByCountry('Austria').length).toBe(335);
    expect(formatGymCountryLabel('Austria', createTranslator(en as any))).toBe('Austria');
    expect(gymCountryTranslationKey('Austria')).toBe('countries.austria');
    expect(normalizeGymSearchValue('Wien')).toBeTruthy();
    const {lat, lng} = getEffectiveLatLng(sample);
    expect(Number.isFinite(lat)).toBe(true);
    expect(Number.isFinite(lng)).toBe(true);
  });
});
