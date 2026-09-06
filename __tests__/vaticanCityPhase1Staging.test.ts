/**
 * Vatican City Phase 1 staging validation — discovery + staging only.
 * Production centers.json must remain frozen. Zero public gyms is a valid outcome.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleVaticanCityCoordinate,
  VATICAN_CITY_POSTAL_RE,
  isVaticanCityCountry,
  isSanMarinoCountry,
  isMonacoCountry,
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

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const CURRENT_PRODUCTION_TOTAL = 11721;
const LIVE_PRODUCTION_SHA256 =
  '86c6c63b17b1bcce9cd69071f2ff7dc7cc97e7440c921b9001bc88a5a07adcd6';

const VALID_STATUS = new Set([
  'READY_TO_IMPORT',
  'NEEDS_COORDINATES',
  'NEEDS_REVIEW',
  'COMING_SOON',
  'CLOSED',
  'DUPLICATE',
  'LEGACY',
  'EXCLUDED',
  'EXCLUDED_FOREIGN_ITALY',
  'EXCLUDED_INSTITUTIONAL',
  'EXCLUDED_PRIVATE',
  'EXCLUDED_SECURITY',
  'EXCLUDED_SPECIALIST',
  'MERGED_INTO_CATALOG',
]);

type StagingRow = {
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
  access_class?: string;
  territory?: string;
  inside_vatican_gate?: boolean;
};

function fakeGym(partial: Partial<DanishGym> & {id: string}): DanishGym {
  return {
    id: partial.id,
    name: partial.name ?? 'Probe Gym',
    city: partial.city ?? 'Città del Vaticano',
    address: partial.address ?? 'Via del Pellegrino 1',
    postalCode: partial.postalCode ?? '00120',
    country: 'Vatican City',
    region: 'Vatican City',
    latitude: partial.latitude ?? 41.9022,
    longitude: partial.longitude ?? 12.4539,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe Gym',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'Via del Pellegrino 1',
      postal_code: partial.postalCode ?? '00120',
      city: partial.city ?? 'Città del Vaticano',
      country: 'Vatican City',
      lat: partial.latitude ?? 41.9022,
      lng: partial.longitude ?? 12.4539,
      is_active: true,
      is_coming_soon: false,
    },
  } as DanishGym;
}

describe('Vatican City Phase 1 staging', () => {
  const stagingPath = path.join(
    __dirname,
    '../data/vatican-city/vatican_city_centers_staging.json',
  );
  const readyPath = path.join(
    __dirname,
    '../data/vatican-city/VATICAN_CITY_PHASE1_READY_TO_IMPORT.json',
  );
  const reportPath = path.join(
    __dirname,
    '../data/vatican-city/VATICAN_CITY_PHASE1_READINESS_REPORT.json',
  );
  const inventoryPath = path.join(
    __dirname,
    '../data/vatican-city/vatican_city_chain_inventory.json',
  );
  const territorialPath = path.join(
    __dirname,
    '../data/vatican-city/VATICAN_CITY_TERRITORIAL_AUDIT.json',
  );
  const falsePositivesPath = path.join(
    __dirname,
    '../data/vatican-city/VATICAN_CITY_FALSE_POSITIVES.json',
  );
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as StagingRow[];
  const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as StagingRow[];
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    production_total?: number;
    production_sha256?: string;
    ready_count?: number;
    needs_review_count?: number;
    needs_coordinates_count?: number;
    status_counts?: Record<string, number>;
    small_market_model?: string;
    phase2_required?: boolean;
    verdict?: string;
    class_a_chains?: number;
    class_a_locations?: number;
    vatican_city_live?: number;
    san_marino_live?: number;
    monaco_live?: number;
    andorra_live?: number;
    liechtenstein_live?: number;
    iceland_live?: number;
    projected_catalog_if_merged?: number;
    dq_gates?: Record<string, number>;
    unique_staged?: number;
    athletica_vaticana_eligible_public_gym?: boolean;
    swiss_guard_catalog_relevant?: boolean;
    zero_gym_validation?: {result?: string; unexplained_discovery_gaps?: number};
  };
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8')) as {
    class_a_chains?: number;
    class_a_locations?: number;
    small_market?: {recommended_model?: string};
  };
  const territorial = JSON.parse(fs.readFileSync(territorialPath, 'utf8')) as {
    postcode_policy?: {alone_sufficient?: boolean; vatican_city_state?: string};
    gate_results?: Record<string, boolean>;
  };
  const falsePositives = JSON.parse(fs.readFileSync(falsePositivesPath, 'utf8')) as Array<{
    id: string;
    inside_vatican_gate?: boolean;
  }>;
  const centersRaw = fs.readFileSync(centersPath);
  const centers = JSON.parse(centersRaw.toString('utf8')) as Array<{
    id: string;
    country?: string;
  }>;
  const sha = crypto.createHash('sha256').update(centersRaw).digest('hex');

  it('production freeze 11721 / VA 0 / SM 6 / MC 4; SHA match', () => {
    expect(centers.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(centers.filter(c => c.country === 'Vatican City').length).toBe(0);
    expect(centers.filter(c => c.id.startsWith('va_')).length).toBe(0);
    expect(centers.filter(c => c.country === 'San Marino').length).toBe(6);
    expect(centers.filter(c => c.country === 'Monaco').length).toBe(4);
    expect(centers.filter(c => c.country === 'Andorra').length).toBe(12);
    expect(centers.filter(c => c.country === 'Liechtenstein').length).toBe(7);
    expect(centers.filter(c => c.country === 'Iceland').length).toBe(27);
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(report.production_total).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(report.production_sha256).toBe(LIVE_PRODUCTION_SHA256);
    expect(report.vatican_city_live).toBe(0);
    expect(report.san_marino_live).toBe(6);
    expect(report.monaco_live).toBe(4);
    expect(report.andorra_live).toBe(12);
    expect(report.liechtenstein_live).toBe(7);
    expect(report.iceland_live).toBe(27);
  });

  it('staging IDs valid va_* unique; statuses consistent', () => {
    const ids = staging.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(staging.length).toBeGreaterThanOrEqual(10);
    expect(report.unique_staged).toBe(staging.length);
    for (const r of staging) {
      expect(r.id).toMatch(/^va_[a-f0-9]{10}$/);
      expect(VALID_STATUS.has(r.import_category)).toBe(true);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
    }
  });

  it('READY empty; ZERO_PUBLIC_GYM_MARKET_CONFIRMED; Phase 2 not required', () => {
    expect(ready.length).toBe(0);
    expect(report.ready_count).toBe(0);
    expect(report.needs_review_count).toBe(0);
    expect(report.needs_coordinates_count).toBe(0);
    expect(report.status_counts?.READY_TO_IMPORT ?? 0).toBe(0);
    expect(report.status_counts?.NEEDS_REVIEW ?? 0).toBe(0);
    expect(report.status_counts?.NEEDS_COORDINATES ?? 0).toBe(0);
    expect(report.small_market_model).toBe('ZERO_PUBLIC_GYM_MARKET_CONFIRMED');
    expect(inventory.small_market?.recommended_model).toBe('ZERO_PUBLIC_GYM_MARKET_CONFIRMED');
    expect(report.class_a_chains).toBe(0);
    expect(report.class_a_locations).toBe(0);
    expect(inventory.class_a_chains).toBe(0);
    expect(inventory.class_a_locations).toBe(0);
    expect(report.phase2_required).toBe(false);
    expect(report.verdict).toBe('VATICAN CITY AUDIT COMPLETE — ZERO PUBLIC GYMS CONFIRMED');
    expect(report.athletica_vaticana_eligible_public_gym).toBe(false);
    expect(report.swiss_guard_catalog_relevant).toBe(false);
    expect(report.zero_gym_validation?.result).toBe('PASS');
    expect(report.zero_gym_validation?.unexplained_discovery_gaps).toBe(0);
  });

  it('territorial gate accepts Vatican core; rejects Rome / extraterritorial probes', () => {
    expect(isPlausibleVaticanCityCoordinate(41.9022, 12.4539)).toBe(true); // Basilica
    expect(isPlausibleVaticanCityCoordinate(41.9065, 12.4536)).toBe(true); // Museums
    expect(isPlausibleVaticanCityCoordinate(41.904, 12.45)).toBe(true); // Gardens
    expect(isPlausibleVaticanCityCoordinate(41.903, 12.4608)).toBe(false); // Omega
    expect(isPlausibleVaticanCityCoordinate(41.9019, 12.4595)).toBe(false); // Pio XII
    expect(isPlausibleVaticanCityCoordinate(41.9024, 12.4615)).toBe(false); // Conciliazione
    expect(isPlausibleVaticanCityCoordinate(41.8969, 12.4464)).toBe(false); // Campo Pio XI
    expect(isPlausibleVaticanCityCoordinate(41.8892, 12.4705)).toBe(false); // San Calisto
    expect(territorial.gate_results?.["St Peter's Basilica"]).toBe(true);
    expect(territorial.gate_results?.['Omega Fitness Club']).toBe(false);
    expect(territorial.postcode_policy?.vatican_city_state).toBe('00120');
    expect(territorial.postcode_policy?.alone_sufficient).toBe(false);
    expect(VATICAN_CITY_POSTAL_RE.test('00120')).toBe(true);
    expect(VATICAN_CITY_POSTAL_RE.test('00193')).toBe(false);
  });

  it('Italian false positives excluded; no READY Italian contamination', () => {
    expect(falsePositives.length).toBeGreaterThanOrEqual(5);
    expect(falsePositives.every(r => r.inside_vatican_gate === false)).toBe(true);
    expect(
      staging.some(
        r => /Omega Fitness/i.test(r.brand) && r.import_category === 'EXCLUDED_FOREIGN_ITALY',
      ),
    ).toBe(true);
    expect(
      staging.some(
        r => /Campo Pio XI/i.test(r.brand) && r.import_category === 'EXCLUDED_FOREIGN_ITALY',
      ),
    ).toBe(true);
    expect(
      staging.some(
        r =>
          /San Calisto|Casa Vaticana/i.test(r.name) &&
          r.import_category === 'EXCLUDED_FOREIGN_ITALY',
      ),
    ).toBe(true);
    expect(report.dq_gates?.italian_contamination).toBe(0);
    expect(ready.every(r => isPlausibleVaticanCityCoordinate(r.lat as number, r.lng as number))).toBe(
      true,
    );
  });

  it('institutional/security facilities classified; not READY', () => {
    expect(
      staging.some(
        r =>
          /Swiss Guard/i.test(r.brand) &&
          r.import_category === 'EXCLUDED_SECURITY' &&
          r.access_class === 'B_SECURITY_PERSONNEL_ONLY',
      ),
    ).toBe(true);
    expect(
      staging.some(
        r =>
          /Athletica Vaticana/i.test(r.brand) &&
          r.territory === 'Vatican City' &&
          r.import_category === 'EXCLUDED_INSTITUTIONAL',
      ),
    ).toBe(true);
    expect(
      staging.some(
        r =>
          /St\. Joseph/i.test(r.brand) && r.import_category === 'EXCLUDED_INSTITUTIONAL',
      ),
    ).toBe(true);
    expect(staging.every(r => r.import_category !== 'READY_TO_IMPORT')).toBe(true);
    for (const r of staging) {
      if (r.territory === 'Vatican City' && r.lat != null && r.lng != null) {
        expect(isPlausibleVaticanCityCoordinate(r.lat, r.lng)).toBe(true);
        expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      }
    }
  });

  it('country / display / i18n / search support va_ and Vatican City', () => {
    expect(isVaticanCityCountry('Vatican City')).toBe(true);
    expect(isVaticanCityCountry('Vatican')).toBe(true);
    expect(isVaticanCityCountry('VA')).toBe(true);
    expect(isVaticanCityCountry('Città del Vaticano')).toBe(true);
    expect(isVaticanCityCountry('Citta del Vaticano')).toBe(true);
    expect(isVaticanCityCountry('Vatican City State')).toBe(true);
    expect(isVaticanCityCountry('Vatikanstaten')).toBe(true);
    expect(isVaticanCityCountry('Italy')).toBe(false);
    expect(isSanMarinoCountry('San Marino')).toBe(true);
    expect(isMonacoCountry('Monaco')).toBe(true);
    expect(GYM_ID_PREFIX.vaticanCity).toBe('va_');
    expect(gymCountryTranslationKey('Vatican City')).toBe('countries.vaticanCity');
    expect(en.countries.vaticanCity).toBe('Vatican City');
    expect(da.countries.vaticanCity).toBe('Vatikanstaten');
    expect(sv.countries.vaticanCity).toBe('Vatikanstaten');
    expect(nb.countries.vaticanCity).toBe('Vatikanstaten');
    expect(resolveGymOrStub('va_nonexistent_test').region).toBe('Vatican City');
    const g = fakeGym({
      id: 'va_probe_va',
      name: 'Probe Vatican',
      city: 'Città del Vaticano',
    });
    const entry = buildGymSearchEntry(g);
    expect(normalizeGymSearchValue(entry.haystack).includes('vatican')).toBe(true);
    expect(normalizeGymSearchValue(entry.haystack).includes('citta del vaticano')).toBe(true);
    expect(normalizeGymSearchValue(entry.haystack).includes('vatikanstaten')).toBe(true);
  });

  it('check-in unchanged; projected under 12500; DQ clean', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.projected_catalog_if_merged).toBe(11721);
    expect(report.projected_catalog_if_merged!).toBeLessThan(12500);
    expect(report.dq_gates?.duplicate_ids).toBe(0);
    expect(report.dq_gates?.hard_duplicate_problems).toBe(0);
    expect(report.dq_gates?.unresolved_rebrand_conflicts).toBe(0);
    expect(report.dq_gates?.hotel_spa_private_leakage).toBe(0);
    expect(report.dq_gates?.postcode_only_vatican_classifications).toBe(0);
    expect(report.dq_gates?.extraterritorial_as_vatican).toBe(0);
  });
});
