/**
 * Belarus Deep Phase 1 staging — discovery + staging only (no catalog writes).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleBelarusCoordinate,
  BELARUS_POSTAL_RE,
  isBelarusCountry,
} from '../src/utils/gymCountry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {normalizeGymSearchValue} from '../src/services/gymSearch/gymSearchNormalize';
import {buildGymSearchEntry} from '../src/services/gymSearch/gymSearchIndex';
import {resolveGymOrStub} from '../src/utils/gymDisplay';
import en from '../src/i18n/translations/en';
import da from '../src/i18n/translations/da';
import sv from '../src/i18n/translations/sv';
import nb from '../src/i18n/translations/nb';
import type {DanishGym} from '../src/data/danishGyms';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|\uFFFD|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const CURRENT_PRODUCTION_TOTAL = 12034;
const LIVE_PRODUCTION_SHA256 =
  'bec3945dd35bb8bf9cc57046110736a5fa267a673445cf4a26dba6ed92d64e05';
const LIVE_PRODUCTION_BYTES = 3746747;
const FOREIGN = /\b(warsaw|bialystok|terespol|vilnius|lviv|smolensk)\b/i;

type Row = {
  id: string;
  brand: string;
  name: string;
  address: string;
  postal_code: string;
  city: string;
  country: string;
  lat: number | null;
  lng: number | null;
  import_category: string;
  coord_source?: string | null;
  discovery_class?: string;
};

function fakeGym(partial: Partial<DanishGym> & {id: string}): DanishGym {
  return {
    id: partial.id,
    name: partial.name ?? 'Probe Gym',
    city: partial.city ?? 'Minsk',
    address: partial.address ?? 'pr. Nezavisimosti 3',
    postalCode: partial.postalCode ?? '220030',
    country: 'Belarus',
    region: 'Belarus',
    latitude: partial.latitude ?? 53.9,
    longitude: partial.longitude ?? 27.56,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe Gym',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'pr. Nezavisimosti 3',
      postal_code: partial.postalCode ?? '220030',
      city: partial.city ?? 'Minsk',
      country: 'Belarus',
      lat: partial.latitude ?? 53.9,
      lng: partial.longitude ?? 27.56,
      is_active: true,
    },
  };
}

describe('Belarus Deep Phase 1 staging (no production merge)', () => {
  const dataDir = path.join(__dirname, '../data/belarus');
  const phase1Dir = path.join(dataDir, 'phase1');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'belarus_centers_staging.json'), 'utf8'),
  ) as Row[];
  const ready = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'BELARUS_PHASE1_READY_TO_IMPORT.json'), 'utf8'),
  ) as Row[];
  const existingSnap = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'BELARUS_EXISTING_PRODUCTION_SNAPSHOT.json'), 'utf8'),
  ) as Row[];
  const report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'BELARUS_PHASE1_READINESS_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const cross = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'BELARUS_PHASE1_CROSS_BORDER_AUDIT.json'), 'utf8'),
  ) as Record<string, number>;
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'BELARUS_PHASE1_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {hard_duplicate_conflicts: number};
  const chain = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'BELARUS_PHASE1_CHAIN_AUDIT.json'), 'utf8'),
  ) as {
    summary: {
      final_class_a_chain_count: number;
      final_class_a_ready_count: number;
      chain_estate_gaps: number;
    };
  };
  const postcodeModel = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'BELARUS_POSTCODE_MODEL.json'), 'utf8'),
  ) as {regex: string};
  const shaBefore = fs.readFileSync(path.join(phase1Dir, 'PHASE1_SHA_BEFORE.txt'), 'utf8').trim();
  const shaAfter = fs.readFileSync(path.join(phase1Dir, 'PHASE1_SHA_AFTER.txt'), 'utf8').trim();
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
  const bytes = fs.statSync(centersPath).size;

  test('production frozen at 12034 / Ukraine 105 / Malta 24 / SHA / bytes unchanged', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Ukraine').length).toBe(105);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ua_')).length).toBe(105);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Malta').length).toBe(24);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Belarus').length).toBe(0);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('by_')).length).toBe(0);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(bytes).toBe(LIVE_PRODUCTION_BYTES);
    expect(shaBefore).toBe(LIVE_PRODUCTION_SHA256);
    expect(shaAfter).toBe(LIVE_PRODUCTION_SHA256);
    expect(report.baseline_malta).toBe(24);
    expect(report.baseline_ukraine).toBe(105);
    expect(report.existing_belarus_production).toBe(false);
    expect(existingSnap.length).toBe(0);
  });

  test('prior-country counts unchanged', () => {
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Lithuania').length).toBe(61);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Latvia').length).toBe(33);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Estonia').length).toBe(69);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Serbia').length).toBe(63);
  });

  test('staging inventory — 58 total, 38 READY, buckets exclusive', () => {
    const sc = report.status_counts as Record<string, number>;
    expect(staging.length).toBe(58);
    expect(ready.length).toBe(38);
    expect(sc.READY_TO_IMPORT).toBe(38);
    expect(sc.NEEDS_REVIEW).toBe(9);
    expect(sc.NEEDS_COORDINATES).toBe(0);
    expect(sc.COMING_SOON).toBe(1);
    expect(sc.EXCLUDED).toBe(10);
    expect(sc.CLOSED).toBe(0);
    expect(report.genuinely_new_ready).toBe(38);
    const cats = staging.map(r => r.import_category);
    expect(cats.every(c => c.length > 0)).toBe(true);
    expect(new Set(staging.map(r => r.id)).size).toBe(staging.length);
  });

  test('Class A chains: Adrenalin 26 READY, Lifestyle 3, Fox Club 4, Olympic 2', () => {
    const byBrand = ready.reduce<Record<string, number>>((acc, r) => {
      acc[r.brand] = (acc[r.brand] ?? 0) + 1;
      return acc;
    }, {});
    expect(byBrand.Adrenalin).toBe(26);
    expect(byBrand.Lifestyle).toBe(3);
    expect(byBrand['Fox Club']).toBe(4);
    expect(byBrand.Olympic).toBe(2);
    expect(chain.summary.final_class_a_chain_count).toBe(4);
    expect(chain.summary.final_class_a_ready_count).toBe(35);
    expect(chain.summary.chain_estate_gaps).toBeGreaterThan(0);
  });

  test('all READY rows: by_ IDs, Belarus postcodes, plausible coords, no leakage', () => {
    const csIds = new Set(
      (
        JSON.parse(
          fs.readFileSync(path.join(dataDir, 'BELARUS_PHASE1_COMING_SOON.json'), 'utf8'),
        ) as Row[]
      ).map(r => r.id),
    );
    const exIds = new Set(
      (
        JSON.parse(
          fs.readFileSync(path.join(dataDir, 'BELARUS_PHASE1_EXCLUDED.json'), 'utf8'),
        ) as Row[]
      ).map(r => r.id),
    );
    for (const r of ready) {
      expect(r.id).toMatch(/^by_[a-f0-9]{10}$/);
      expect(r.country).toBe('Belarus');
      expect(BELARUS_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(typeof r.lat).toBe('number');
      expect(typeof r.lng).toBe('number');
      expect(isPlausibleBelarusCoordinate(r.lat as number, r.lng as number)).toBe(true);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(String(r.name).startsWith('by_')).toBe(false);
      expect(FOREIGN.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(csIds.has(r.id)).toBe(false);
      expect(exIds.has(r.id)).toBe(false);
    }
    const dq = report.data_quality as Record<string, number>;
    expect(Object.values(dq).every(v => v === 0)).toBe(true);
  });

  test('excluded / specialist / hotel / cross-border safety', () => {
    expect(report.specialist_ready_leakage).toBe(0);
    expect(report.hotel_resort_ready_leakage).toBe(0);
    expect(cross.poland_ready_outliers ?? cross.belarus_ready_outliers).toBeDefined();
    expect(cross.poland_ready_outliers ?? 0).toBe(0);
    expect(cross.ukraine_ready_outliers ?? 0).toBe(0);
    expect(cross.lithuania_ready_outliers ?? 0).toBe(0);
    expect(cross.latvia_ready_outliers ?? 0).toBe(0);
    expect(cross.russia_ready_outliers ?? 0).toBe(0);
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(new RegExp(postcodeModel.regex).test('220030')).toBe(true);
    expect(new RegExp(postcodeModel.regex).test('220030')).toBe(true);
  });

  test('country resolution / search / check-in / scale / Phase 2 verdict', () => {
    expect(isBelarusCountry('Belarus')).toBe(true);
    expect(isBelarusCountry('BY')).toBe(true);
    expect(isBelarusCountry('Беларусь')).toBe(true);
    expect(gymCountryTranslationKey('Belarus')).toBe('countries.belarus');
    expect(en.countries.belarus).toBe('Belarus');
    expect(da.countries.belarus).toBe('Hviderusland');
    expect(sv.countries.belarus).toBe('Vitryssland');
    expect(nb.countries.belarus).toBe('Hviterussland');
    expect(GYM_ID_PREFIX.belarus).toBe('by_');
    expect(resolveGymOrStub('by_nonexistent_test').country).toBe('Belarus');
    const g = fakeGym({id: 'by_probe_minsk', name: 'Adrenalin Minsk', city: 'Minsk', brand: 'Adrenalin'});
    const entry = buildGymSearchEntry(g);
    expect(normalizeGymSearchValue(entry.haystack).includes('belarus')).toBe(true);
    expect(normalizeGymSearchValue(entry.haystack).includes('minsk')).toBe(true);
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.phase2_required).toBe(true);
    expect(report.verdict).toBe('BELARUS PHASE 2 REQUIRED — UNRESOLVED DISCOVERY / RECONCILIATION');
    expect(report.projected_catalog_after_future_merge).toBe(12034 + ready.length);
    expect(report.catalog_headroom_to_12500).toBe(466);
    expect(report.projected_crosses_12500).toBe(false);
    expect(report.global_stress_qa_will_be_required_after_future_merge).toBe(false);
    expect(report.architecture).toBe('KEEP CLIENT-SIDE');
  });
});
