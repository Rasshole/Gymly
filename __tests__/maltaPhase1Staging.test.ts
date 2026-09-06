/**
 * Malta Deep Phase 1 staging — existing production reconciliation (no catalog writes).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleMaltaCoordinate,
  MALTA_POSTAL_RE,
  isMaltaCountry,
} from '../src/utils/gymCountry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {normalizeGymSearchValue} from '../src/services/gymSearch/gymSearchNormalize';
import {buildGymSearchEntry} from '../src/services/gymSearch/gymSearchIndex';
import {resolveGymOrStub} from '../src/utils/gymDisplay';
import en from '../src/i18n/translations/en';
import type {DanishGym} from '../src/data/danishGyms';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const CURRENT_PRODUCTION_TOTAL = 11923;
const LIVE_PRODUCTION_SHA256 =
  '6f40fba98eb351c54ecc076278c18d49349b0f42e7b18c4532710aa523f89c38';
const FOREIGN = /\b(sicily|sicilia|italy|italia|tunisia|libya)\b/i;

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
  operator_class?: string;
  phase1_disposition?: string;
};

function fakeGym(partial: Partial<DanishGym> & {id: string}): DanishGym {
  return {
    id: partial.id,
    name: partial.name ?? 'Probe Gym',
    city: partial.city ?? 'Sliema',
    address: partial.address ?? 'Tigné Point',
    postalCode: partial.postalCode ?? 'TPO 0001',
    country: 'Malta',
    region: 'Malta',
    latitude: partial.latitude ?? 35.9073,
    longitude: partial.longitude ?? 14.511,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe Gym',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'Tigné Point',
      postal_code: partial.postalCode ?? 'TPO 0001',
      city: partial.city ?? 'Sliema',
      country: 'Malta',
      lat: partial.latitude ?? 35.9073,
      lng: partial.longitude ?? 14.511,
      is_active: true,
    },
  };
}

describe('Malta Deep Phase 1 staging (existing production)', () => {
  const dataDir = path.join(__dirname, '../data/malta');
  const phase1Dir = path.join(dataDir, 'phase1');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'malta_centers_staging.json'), 'utf8'),
  ) as Row[];
  const ready = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_PHASE1_READY_TO_IMPORT.json'), 'utf8'),
  ) as Row[];
  const existingSnap = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_EXISTING_PRODUCTION_SNAPSHOT.json'), 'utf8'),
  ) as Row[];
  const report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_PHASE1_READINESS_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const cross = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_PHASE1_CROSS_BORDER_AUDIT.json'), 'utf8'),
  ) as Record<string, number>;
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_PHASE1_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {hard_duplicate_conflicts: number; diacritic_duplicate_conflicts: number};
  const chain = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_PHASE1_CHAIN_AUDIT.json'), 'utf8'),
  ) as {
    summary: {
      final_class_a_chain_count: number;
      final_class_a_ready_count: number;
      chain_estate_gaps: number;
    };
  };
  const postcodeModel = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_POSTCODE_MODEL.json'), 'utf8'),
  ) as {regex: string};
  const shaBefore = fs.readFileSync(path.join(phase1Dir, 'PHASE1_SHA_BEFORE.txt'), 'utf8').trim();
  const shaAfter = fs.readFileSync(path.join(phase1Dir, 'PHASE1_SHA_AFTER.txt'), 'utf8').trim();
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');

  test('production frozen at 11923 / Malta 18 / SHA unchanged', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Malta').length).toBe(18);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('mt_')).length).toBe(18);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(shaBefore).toBe(LIVE_PRODUCTION_SHA256);
    expect(shaAfter).toBe(LIVE_PRODUCTION_SHA256);
    expect(report.baseline_malta).toBe(18);
    expect(report.existing_malta_production).toBe(true);
    expect(existingSnap.length).toBe(18);
  });

  test('prior-country counts unchanged', () => {
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Lithuania').length).toBe(61);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Latvia').length).toBe(33);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Estonia').length).toBe(69);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Slovenia').length).toBe(33);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Croatia').length).toBe(80);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Serbia').length).toBe(63);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Iceland').length).toBe(27);
  });

  test('staging: 18 READY = existing production; zero genuinely new READY', () => {
    expect(ready.length).toBe(18);
    expect(report.ready_count).toBe(18);
    expect(report.ready_already_in_production).toBe(18);
    expect(report.genuinely_new_ready).toBe(0);
    expect(report.actual_potential_new_delta).toBe(0);
    const sc = report.status_counts as Record<string, number>;
    expect(sc.READY_TO_IMPORT).toBe(18);
    expect(sc.COMING_SOON).toBe(1);
    expect(sc.CLOSED).toBe(3);
    expect(sc.EXCLUDED).toBeGreaterThan(20);
    expect(sc.NEEDS_REVIEW).toBeGreaterThan(30);
  });

  test('existing production 18/18 overlap — exact ID reconciliation', () => {
    const rec = report.existing_production_reconciliation as {
      exact_id_overlap: number;
      ready_missing_from_production: string[];
      production_not_in_phase1_ready: string[];
    };
    expect(rec.exact_id_overlap).toBe(18);
    expect(rec.ready_missing_from_production).toEqual([]);
    expect(rec.production_not_in_phase1_ready).toEqual([]);
    expect(report.projected_catalog_after_future_merge).toBe(CURRENT_PRODUCTION_TOTAL);
  });

  test('Class A chains: BGM 10, 24/7 4, Challenger 4 — complete open estates', () => {
    const byBrand = ready.reduce<Record<string, number>>((acc, r) => {
      acc[r.brand] = (acc[r.brand] ?? 0) + 1;
      return acc;
    }, {});
    expect(byBrand['Best Gyms Malta']).toBe(10);
    expect(byBrand['24/7 Fitness Club']).toBe(4);
    expect(byBrand['Challenger Fitness']).toBe(4);
    expect(chain.summary.final_class_a_chain_count).toBe(3);
    expect(chain.summary.final_class_a_ready_count).toBe(18);
    expect(chain.summary.chain_estate_gaps).toBe(0);
  });

  test('all READY rows: mt_ IDs, Malta postcodes, premises coords, no leakage', () => {
    const ids = ready.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of ready) {
      expect(r.id.startsWith(GYM_ID_PREFIX.malta)).toBe(true);
      expect(r.country).toBe('Malta');
      expect(MALTA_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(typeof r.lat).toBe('number');
      expect(typeof r.lng).toBe('number');
      expect(isPlausibleMaltaCoordinate(r.lat as number, r.lng as number)).toBe(true);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(FOREIGN.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
    }
    expect(report.specialist_ready_leakage).toBe(0);
    expect(report.institutional_ready_leakage).toBe(0);
    expect(report.hotel_resort_ready_leakage).toBe(0);
  });

  test('COMING_SOON Birgu / EXCLUDED Class E / CLOSED legacy not in READY', () => {
    expect(ready.some(r => /birgu/i.test(r.name))).toBe(false);
    expect(ready.some(r => r.brand === 'Fort Fitness')).toBe(false);
    expect(ready.some(r => r.brand === 'Cynergi')).toBe(false);
    expect(ready.some(r => r.brand === 'Marion Mizzi Wellbeing')).toBe(false);
    const coming = staging.filter(r => r.import_category === 'COMING_SOON');
    expect(coming.length).toBe(1);
    expect(coming[0]!.name.toLowerCase()).toContain('birgu');
  });

  test('cross-border / duplicate / postcode model', () => {
    expect(cross.italy_ready_outliers).toBe(0);
    expect(cross.sicily_ready_outliers).toBe(0);
    expect(cross.other_foreign_ready_outliers).toBe(0);
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(dup.diacritic_duplicate_conflicts).toBe(0);
    expect(new RegExp(postcodeModel.regex).test('SLM 1234')).toBe(true);
    expect(new RegExp(postcodeModel.regex).test('BKR 1610')).toBe(true);
  });

  test('country resolution / search / check-in / scale', () => {
    expect(isMaltaCountry('Malta')).toBe(true);
    expect(isMaltaCountry('MT')).toBe(true);
    expect(gymCountryTranslationKey('Malta')).toBe('countries.malta');
    expect(en.countries.malta).toBe('Malta');
    const stub = resolveGymOrStub('mt_nonexistent_test');
    expect(String(stub.name || stub.city || '').length).toBeGreaterThan(0);
    const g = fakeGym({id: 'mt_probe_sliema', name: 'Best Gyms Sliema', city: 'Sliema'});
    const entry = buildGymSearchEntry(g);
    expect(normalizeGymSearchValue(entry.haystack).includes('malta')).toBe(true);
    expect(normalizeGymSearchValue(entry.haystack).includes('sliema')).toBe(true);
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.phase2_required).toBe(true);
    expect(report.verdict).toMatch(/PHASE 2 REQUIRED/i);
    expect(report.projected_crosses_12500).toBe(false);
    expect(report.architecture).toBe('KEEP CLIENT-SIDE');
    expect(report.malta_infrastructure_present).toBe(true);
  });
});
