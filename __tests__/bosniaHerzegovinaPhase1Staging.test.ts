/**
 * Bosnia & Herzegovina Phase 1 staging validation — discovery + staging only.
 * Production centers.json must remain frozen. No merge in Phase 1.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleBosniaHerzegovinaCoordinate,
  BOSNIA_HERZEGOVINA_POSTAL_RE,
  isBosniaHerzegovinaCountry,
  isCroatiaCountry,
  isMontenegroCountry,
  isNorthMacedoniaCountry,
} from '../src/utils/gymCountry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
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
const CURRENT_PRODUCTION_TOTAL = 11921;
const LIVE_PRODUCTION_SHA256 =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';
const PHASE1_FROZEN_SHA =
  '6df5a27d1671a5b5721b63e04b2f4e891ed3c5058fa24ede7d370eaaeb1f5112';

const VALID_STATUS = new Set([
  'READY_TO_IMPORT',
  'NEEDS_COORDINATES',
  'NEEDS_REVIEW',
  'COMING_SOON',
  'CLOSED',
  'DUPLICATE',
  'LEGACY',
  'EXCLUDED',
  'MERGED_INTO_CATALOG',
]);

const REQUIRED_CITIES = [
  'Sarajevo',
  'Banja Luka',
  'Tuzla',
  'Mostar',
  'Zenica',
  'Bijeljina',
  'Bihać',
  'Brčko',
  'Prijedor',
  'Doboj',
  'Trebinje',
  'Cazin',
  'Travnik',
  'Gradačac',
  'Gračanica',
  'Živinice',
  'Lukavac',
  'Visoko',
  'Goražde',
  'Konjic',
  'Bugojno',
  'Jajce',
  'Livno',
];

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
  eligibility_candidate?: string;
  territory?: string;
  foreign_probe?: boolean;
  entity?: string;
};

function fakeGym(partial: Partial<DanishGym> & {id: string}): DanishGym {
  return {
    id: partial.id,
    name: partial.name ?? 'Probe Gym',
    city: partial.city ?? 'Sarajevo',
    address: partial.address ?? 'Ferhadija 1',
    postalCode: partial.postalCode ?? '71000',
    country: 'Bosnia and Herzegovina',
    region: 'Bosnia and Herzegovina',
    latitude: partial.latitude ?? 43.8563,
    longitude: partial.longitude ?? 18.4131,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe Gym',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'Ferhadija 1',
      postal_code: partial.postalCode ?? '71000',
      city: partial.city ?? 'Sarajevo',
      country: 'Bosnia and Herzegovina',
      lat: partial.latitude ?? 43.8563,
      lng: partial.longitude ?? 18.4131,
      is_active: true,
      is_coming_soon: false,
    },
  } as DanishGym;
}

describe('Bosnia & Herzegovina Phase 1 staging (no production merge)', () => {
  const dataDir = path.join(__dirname, '../data/bosnia-herzegovina');
  const stagingPath = path.join(dataDir, 'phase1/phase1_staging_snapshot.json');
  const reportPath = path.join(
    dataDir,
    'BOSNIA_HERZEGOVINA_PHASE1_READINESS_REPORT.json',
  );
  const readyPath = path.join(
    dataDir,
    'BOSNIA_HERZEGOVINA_PHASE1_READY_TO_IMPORT.json',
  );
  const rebrandPath = path.join(
    dataDir,
    'BOSNIA_HERZEGOVINA_PHASE1_REBRAND_MAP.json',
  );
  const dupPath = path.join(
    dataDir,
    'BOSNIA_HERZEGOVINA_PHASE1_DUPLICATE_ANALYSIS.json',
  );
  const chainPath = path.join(
    dataDir,
    'BOSNIA_HERZEGOVINA_PHASE1_CHAIN_INVENTORY.json',
  );
  const cityPath = path.join(dataDir, 'BOSNIA_HERZEGOVINA_CITY_COVERAGE.json');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as StagingRow[];
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >;
  const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as StagingRow[];
  const rebrand = JSON.parse(fs.readFileSync(rebrandPath, 'utf8')) as {
    unresolved_conflicts?: number;
  };
  const dup = JSON.parse(fs.readFileSync(dupPath, 'utf8')) as {
    hard_duplicate_conflicts?: number;
  };
  const chain = JSON.parse(fs.readFileSync(chainPath, 'utf8')) as Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >;
  const cityCov = JSON.parse(fs.readFileSync(cityPath, 'utf8')) as {
    cities: Record<string, string>;
  };
  const centersRaw = fs.readFileSync(centersPath);
  const centers = JSON.parse(centersRaw.toString('utf8')) as Array<{
    id: string;
    country?: string;
  }>;
  const sha = crypto.createHash('sha256').update(centersRaw).digest('hex');

  test('production reflects BA merge (11831 / BA 31); Phase 1 report freeze', () => {
    expect(centers.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(centers.filter(c => c.country === 'Bosnia and Herzegovina').length).toBe(31);
    expect(centers.filter(c => c.id.startsWith('ba_')).length).toBe(31);
    expect(centers.filter(c => c.country === 'North Macedonia').length).toBe(25);
    expect(centers.filter(c => c.country === 'Montenegro').length).toBe(26);
    expect(centers.filter(c => c.country === 'Moldova').length).toBe(28);
    expect(centers.filter(c => c.country === 'San Marino').length).toBe(6);
    expect(centers.filter(c => c.country === 'Monaco').length).toBe(4);
    expect(centers.filter(c => c.country === 'Andorra').length).toBe(12);
    expect(centers.filter(c => c.country === 'Liechtenstein').length).toBe(7);
    expect(centers.filter(c => c.country === 'Iceland').length).toBe(27);
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(report.production_total).toBe(11800);
    expect(report.production_sha256).toBe(PHASE1_FROZEN_SHA);
    expect(report.bosnia_herzegovina_live).toBe(0);
    expect(report.ba_prefix_live).toBe(0);
    expect(GYM_ID_PREFIX.bosniaHerzegovina).toBe('ba_');
  });

  test('staging IDs unique ba_*; statuses valid; READY = 0; Phase 2 required', () => {
    const ids = staging.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(staging.length).toBeGreaterThan(50);
    for (const r of staging) {
      expect(r.id).toMatch(/^ba_[a-f0-9]{10}$/);
      expect(VALID_STATUS.has(r.import_category)).toBe(true);
    }
    expect(ready.length).toBe(0);
    expect(report.ready_to_import).toBe(0);
    expect(report.needs_review).toBeGreaterThan(20);
    expect(report.needs_coordinates).toBeGreaterThan(10);
    expect(report.excluded).toBeGreaterThan(30);
    expect(report.qualifying_class_a_chains).toBe(0);
    expect(report.class_a_locations).toBe(0);
    expect(report.potential_class_a_operators).toBe(2);
    expect(report.small_market_assessment).toBe('MIXED_CHAIN_INDEPENDENT');
    expect(report.phase2_required).toBe(true);
    expect(report.merge_ready).toBe(false);
    expect(report.verdict).toBe(
      'BOSNIA & HERZEGOVINA PHASE 2 REQUIRED BEFORE MERGE',
    );
  });

  test('entity unity: Federation/RS/Brčko → Bosnia; no separate prefix', () => {
    expect(report.federation_rs_brcko_unified).toBe(true);
    expect(report.separate_entity_prefix).toBe(false);
    const baRows = staging.filter(
      r => r.territory === 'Bosnia and Herzegovina' && !r.foreign_probe,
    );
    expect(baRows.every(r => r.country === 'Bosnia and Herzegovina')).toBe(true);
    expect(baRows.some(r => r.entity === 'Republika Srpska')).toBe(true);
    expect(baRows.some(r => r.entity === 'Federation of BiH')).toBe(true);
    expect(baRows.some(r => r.entity === 'Brčko District')).toBe(true);
    expect(staging.every(r => !r.id.startsWith('rs_'))).toBe(true);
    expect(staging.every(r => !r.id.startsWith('fbih_'))).toBe(true);
  });

  test('DQ: postcodes/coords for reviewable rows; no READY leakage', () => {
    const reviewable = staging.filter(
      r =>
        !r.foreign_probe &&
        (r.territory === 'Bosnia and Herzegovina' || !r.territory) &&
        ['NEEDS_REVIEW', 'NEEDS_COORDINATES', 'READY_TO_IMPORT'].includes(
          r.import_category,
        ) &&
        r.discovery_class !== 'regional_gap' &&
        r.discovery_class !== 'international_probe',
    );
    for (const r of reviewable) {
      if (r.postal_code && r.postal_code !== 'n/a') {
        expect(BOSNIA_HERZEGOVINA_POSTAL_RE.test(String(r.postal_code))).toBe(
          true,
        );
      }
      if (r.lat != null && r.lng != null) {
        expect(isPlausibleBosniaHerzegovinaCoordinate(r.lat, r.lng)).toBe(true);
        expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(
          false,
        );
      }
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city} ${r.brand}`)).toBe(
        false,
      );
    }
    expect(report.data_quality.hotel_spa_leakage_ready).toBe(0);
    expect(report.data_quality.foreign_ready).toEqual([]);
    expect(report.data_quality.fallback_ready).toEqual([]);
  });

  test('Class A audit + chain inventory; Sarajevo/Banja Luka deep audits', () => {
    expect(chain.qualifying_class_a_chains).toBe(0);
    expect(chain.potential_class_a_operators).toBe(2);
    expect(chain.operators['ALL IN FITNESS'].discovered_units).toBe(3);
    expect(chain.operators['Kron Fitness'].discovered_units).toBe(4);
    expect(
      staging.filter(r => r.brand === 'ALL IN FITNESS' && r.city === 'Sarajevo')
        .length,
    ).toBe(3);
    expect(
      staging.filter(r => r.brand === 'Kron Fitness').length,
    ).toBe(4);
    expect(staging.filter(r => r.city === 'Sarajevo').length).toBeGreaterThan(10);
    expect(staging.filter(r => r.city === 'Banja Luka').length).toBeGreaterThan(3);
    expect(staging.filter(r => r.city === 'Tuzla').length).toBeGreaterThan(1);
    expect(staging.filter(r => r.city === 'Mostar').length).toBeGreaterThan(1);
    expect(
      staging.some(
        r => r.city === 'Istočno Sarajevo' && r.city !== 'Sarajevo',
      ),
    ).toBe(true);
  });

  test('city coverage terminal; B/D gaps 0; cross-border 0', () => {
    for (const city of REQUIRED_CITIES) {
      expect(cityCov.cities[city]).toBeTruthy();
      expect(report.city_coverage[city]).toBeTruthy();
    }
    expect(report.unexplained_b_gaps).toBe(0);
    expect(report.unexplained_d_gaps).toBe(0);
    expect(report.cross_border.croatia_ready).toBe(0);
    expect(report.cross_border.serbia_ready).toBe(0);
    expect(report.cross_border.montenegro_ready).toBe(0);
    expect(dup.hard_duplicate_conflicts ?? report.data_quality.hard_duplicate_conflicts).toBe(
      0,
    );
    expect(rebrand.unresolved_conflicts ?? 0).toBe(0);
  });

  test('country resolution, i18n, orphan ba_*, search index', () => {
    expect(isBosniaHerzegovinaCountry('Bosnia and Herzegovina')).toBe(true);
    expect(isBosniaHerzegovinaCountry('Bosnia & Herzegovina')).toBe(true);
    expect(isBosniaHerzegovinaCountry('BiH')).toBe(true);
    expect(isBosniaHerzegovinaCountry('Bosna i Hercegovina')).toBe(true);
    expect(isBosniaHerzegovinaCountry('Republika Srpska')).toBe(true);
    expect(isBosniaHerzegovinaCountry('Brčko District')).toBe(true);
    expect(isCroatiaCountry('Bosnia and Herzegovina')).toBe(false);
    expect(isMontenegroCountry('Bosnia and Herzegovina')).toBe(false);
    expect(isNorthMacedoniaCountry('Bosnia and Herzegovina')).toBe(false);
    expect(gymCountryTranslationKey('Bosnia and Herzegovina')).toBe(
      'countries.bosniaHerzegovina',
    );
    expect(en.countries.bosniaHerzegovina).toBe('Bosnia and Herzegovina');
    expect(da.countries.bosniaHerzegovina).toBeTruthy();
    expect(sv.countries.bosniaHerzegovina).toBeTruthy();
    expect(nb.countries.bosniaHerzegovina).toBeTruthy();

    const stub = resolveGymOrStub('ba_nonexistent_test');
    expect(String((stub as {region?: string}).region || '')).toMatch(
      /Bosnia/i,
    );

    const entry = buildGymSearchEntry(
      fakeGym({
        id: 'ba_testprobe01',
        name: 'Probe Gym Sarajevo',
        city: 'Sarajevo',
        brand: 'Probe',
      }),
    );
    expect(entry.haystack.toLowerCase()).toMatch(
      /bosnia|bih|sarajevo|сарајевo|hercegovina/,
    );
  });

  test('projected 11831 post-merge; check-in; Phase 1 SHA artifacts frozen', () => {
    expect(report.projected_catalog).toBe(11800);
    expect(report.crosses_12500).toBe(false);
    expect(report.global_stress_qa_required_now).toBe(false);
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    const shaAfter = crypto
      .createHash('sha256')
      .update(fs.readFileSync(centersPath))
      .digest('hex');
    expect(shaAfter).toBe(LIVE_PRODUCTION_SHA256);
    const shaBefore = fs
      .readFileSync(
        path.join(dataDir, 'BOSNIA_HERZEGOVINA_PHASE1_SHA_BEFORE.txt'),
        'utf8',
      )
      .trim();
    const shaAfterFile = fs
      .readFileSync(
        path.join(dataDir, 'BOSNIA_HERZEGOVINA_PHASE1_SHA_AFTER.txt'),
        'utf8',
      )
      .trim();
    expect(shaBefore).toBe(PHASE1_FROZEN_SHA);
    expect(shaAfterFile).toBe(PHASE1_FROZEN_SHA);
  });
});
