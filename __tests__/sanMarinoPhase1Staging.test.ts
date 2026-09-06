/**
 * San Marino Phase 1 staging validation — discovery + staging only.
 * Production centers.json must remain frozen.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleSanMarinoCoordinate,
  SAN_MARINO_POSTAL_RE,
  isSanMarinoCountry,
  isMonacoCountry,
  isAndorraCountry,
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
const FALLBACK_COORD_SOURCES = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const CURRENT_PRODUCTION_TOTAL = 11921; // live after Bosnia merge
const LIVE_PRODUCTION_SHA256 =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';
const PHASE1_REPORT_SHA256 =
  '0e21508d09f038bcd4d20d59f37f8b09d326faa9ecacf262e09db330852e0c28';

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
  castello?: string;
  district?: string;
  territory?: string;
};

function fakeGym(partial: Partial<DanishGym> & {id: string}): DanishGym {
  return {
    id: partial.id,
    name: partial.name ?? 'Probe Gym',
    city: partial.city ?? 'Serravalle',
    address: partial.address ?? 'Strada del Bargello 1',
    postalCode: partial.postalCode ?? '47891',
    country: 'San Marino',
    region: 'San Marino',
    latitude: partial.latitude ?? 43.95,
    longitude: partial.longitude ?? 12.45,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe Gym',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'Strada del Bargello 1',
      postal_code: partial.postalCode ?? '47891',
      city: partial.city ?? 'Serravalle',
      country: 'San Marino',
      lat: partial.latitude ?? 43.95,
      lng: partial.longitude ?? 12.45,
      is_active: true,
      is_coming_soon: false,
    },
  } as DanishGym;
}

describe('San Marino Phase 1 staging', () => {
  const stagingPath = path.join(
    __dirname,
    '../data/san-marino/san_marino_centers_staging.json',
  );
  const phase1SnapshotPath = path.join(
    __dirname,
    '../data/san-marino/phase2/phase1_staging_snapshot.json',
  );
  const readyPath = path.join(
    __dirname,
    '../data/san-marino/SAN_MARINO_PHASE1_READY_TO_IMPORT.json',
  );
  const reportPath = path.join(
    __dirname,
    '../data/san-marino/SAN_MARINO_PHASE1_READINESS_REPORT.json',
  );
  const rebrandPath = path.join(
    __dirname,
    '../data/san-marino/SAN_MARINO_PHASE1_REBRAND_MAP.json',
  );
  const inventoryPath = path.join(
    __dirname,
    '../data/san-marino/san_marino_chain_inventory.json',
  );
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as StagingRow[];
  const phase1Snapshot = (
    fs.existsSync(phase1SnapshotPath)
      ? JSON.parse(fs.readFileSync(phase1SnapshotPath, 'utf8'))
      : staging
  ) as StagingRow[];
  const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as StagingRow[];
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    production_total?: number;
    production_sha256?: string;
    ready_count?: number;
    needs_review_count?: number;
    status_counts?: Record<string, number>;
    small_market_model?: string;
    phase2_required?: boolean;
    verdict?: string;
    class_a_chains?: number;
    class_a_locations?: number;
    independent_candidate_count?: number;
    municipal_candidate_count?: number;
    san_marino_live?: number;
    monaco_live?: number;
    andorra_live?: number;
    liechtenstein_live?: number;
    iceland_live?: number;
    projected_catalog_if_merged?: number;
    dq_gates?: Record<string, number>;
    castello_coverage?: Record<string, string>;
    unexplained_castello_bd_gaps?: number;
    unique_staged?: number;
  };
  const rebrand = JSON.parse(fs.readFileSync(rebrandPath, 'utf8')) as {
    unresolved_conflicts?: number;
  };
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8')) as {
    small_market?: {recommended_model?: string};
    class_a_chains?: number;
  };
  const centersRaw = fs.readFileSync(centersPath);
  const centers = JSON.parse(centersRaw.toString('utf8')) as Array<{
    id: string;
    country?: string;
  }>;
  const sha = crypto.createHash('sha256').update(centersRaw).digest('hex');

  it('production reflects San Marino merge (11721 / SM 6 / MC 4); Phase 1 report SHA frozen', () => {
    expect(centers.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(centers.filter(c => c.country === 'San Marino').length).toBe(6);
    expect(centers.filter(c => c.id.startsWith('sm_')).length).toBe(6);
    expect(centers.filter(c => c.country === 'Monaco').length).toBe(4);
    expect(centers.filter(c => c.country === 'Andorra').length).toBe(12);
    expect(centers.filter(c => c.country === 'Liechtenstein').length).toBe(7);
    expect(centers.filter(c => c.country === 'Iceland').length).toBe(27);
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(report.production_total).toBe(11715);
    expect(report.production_sha256).toBe(PHASE1_REPORT_SHA256);
    expect(report.san_marino_live).toBe(0);
    expect(report.monaco_live).toBe(4);
    expect(report.andorra_live).toBe(12);
    expect(report.liechtenstein_live).toBe(7);
    expect(report.iceland_live).toBe(27);
  });

  it('live staging IDs valid sm_* unique; Phase 1 conclusions in Phase 1 artifacts', () => {
    const ids = staging.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(staging.length).toBeGreaterThanOrEqual(40);
    expect(report.unique_staged).toBe(47);
    for (const r of staging) {
      expect(r.id).toMatch(/^sm_[a-f0-9]{10}$/);
      expect(VALID_STATUS.has(r.import_category)).toBe(true);
      if (r.discovery_class !== 'foreign_border_probe' && r.discovery_class !== 'international_chain_probe') {
        if (r.import_category === 'NEEDS_REVIEW' || r.import_category === 'READY_TO_IMPORT') {
          expect(r.country).toBe('San Marino');
        }
      }
    }
  });

  it('Phase 1 READY artifact empty; INDEPENDENT_PHASE_RECOMMENDED frozen', () => {
    expect(ready.length).toBe(0);
    expect(report.ready_count).toBe(0);
    expect(report.status_counts?.READY_TO_IMPORT ?? 0).toBe(0);
    expect(report.status_counts?.NEEDS_REVIEW).toBe(6);
    expect(report.small_market_model).toBe('INDEPENDENT_PHASE_RECOMMENDED');
    // Live inventory may advance to INDEPENDENT_PHASE_EXECUTED in Phase 2
    expect(
      inventory.small_market?.recommended_model === 'INDEPENDENT_PHASE_RECOMMENDED' ||
        inventory.small_market?.recommended_model === 'INDEPENDENT_PHASE_EXECUTED',
    ).toBe(true);
    expect(report.class_a_chains).toBe(0);
    expect(report.class_a_locations).toBe(0);
    expect(inventory.class_a_chains).toBe(0);
    expect(report.independent_candidate_count).toBe(5);
    expect(report.municipal_candidate_count).toBe(1);
    expect(report.phase2_required).toBe(true);
    expect(report.verdict).toBe('SAN MARINO PHASE 2 REQUIRED BEFORE MERGE');
  });

  it('Phase 1 snapshot: NEEDS_REVIEW candidates have valid SM postcode/coords; SMI path', () => {
    const candidates = phase1Snapshot.filter(r => r.import_category === 'NEEDS_REVIEW');
    expect(candidates.length).toBe(6);
    expect(
      candidates.every(r => r.eligibility_candidate === 'SMALL_MARKET_INDEPENDENT'),
    ).toBe(true);
    for (const r of candidates) {
      expect(SAN_MARINO_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(r.address.trim().length).toBeGreaterThan(3);
      expect(r.city.trim().length).toBeGreaterThan(0);
      expect(String(r.castello || r.district || '').length).toBeGreaterThan(0);
      expect(isPlausibleSanMarinoCoordinate(r.lat as number, r.lng as number)).toBe(true);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
    }
    expect(candidates.some(r => /Dynamic/i.test(r.brand))).toBe(true);
    expect(candidates.some(r => /Phisicol/i.test(r.brand))).toBe(true);
    expect(candidates.some(r => /Energia/i.test(r.brand))).toBe(true);
    expect(candidates.some(r => /MOVE/i.test(r.brand))).toBe(true);
    expect(candidates.some(r => /Body Building|FSBB/i.test(`${r.brand} ${r.name}`))).toBe(
      true,
    );
    expect(candidates.some(r => /FitLife/i.test(r.brand))).toBe(true);
  });

  it('Italian border probes EXCLUDED; Multieventi excluded; Italian READY = 0', () => {
    const foreignProbes = staging.filter(r => r.discovery_class === 'foreign_border_probe');
    expect(foreignProbes.length).toBeGreaterThanOrEqual(4);
    expect(foreignProbes.every(r => r.import_category === 'EXCLUDED')).toBe(true);
    for (const r of foreignProbes) {
      if (r.lat != null && r.lng != null) {
        expect(isPlausibleSanMarinoCoordinate(r.lat, r.lng)).toBe(false);
      }
    }
    expect(
      staging.some(
        r => /Multieventi/i.test(r.brand) && r.import_category === 'EXCLUDED',
      ),
    ).toBe(true);
    expect(report.dq_gates?.italian_contamination).toBe(0);
    expect(report.dq_gates?.foreign_territorial_outliers).toBe(0);
    expect(ready.every(r => isPlausibleSanMarinoCoordinate(r.lat as number, r.lng as number))).toBe(
      true,
    );
  });

  it('all 9 castelli audited; unexplained B/D gaps = 0; rebrand clean', () => {
    for (const c of [
      'San Marino',
      'Borgo Maggiore',
      'Serravalle',
      'Domagnano',
      'Fiorentino',
      'Acquaviva',
      'Faetano',
      'Chiesanuova',
      'Montegiardino',
    ]) {
      expect(report.castello_coverage?.[c]).toBeTruthy();
    }
    expect(report.unexplained_castello_bd_gaps).toBe(0);
    expect(rebrand.unresolved_conflicts).toBe(0);
  });

  it('country / display / i18n / search support sm_ and San Marino', () => {
    expect(isSanMarinoCountry('San Marino')).toBe(true);
    expect(isSanMarinoCountry('SM')).toBe(true);
    expect(isSanMarinoCountry('RSM')).toBe(true);
    expect(isMonacoCountry('Monaco')).toBe(true);
    expect(isAndorraCountry('Andorra')).toBe(true);
    expect(GYM_ID_PREFIX.sanMarino).toBe('sm_');
    expect(gymCountryTranslationKey('San Marino')).toBe('countries.sanMarino');
    expect(en.countries.sanMarino).toBe('San Marino');
    expect(da.countries.sanMarino).toBe('San Marino');
    expect(sv.countries.sanMarino).toBe('San Marino');
    expect(nb.countries.sanMarino).toBe('San Marino');
    expect(resolveGymOrStub('sm_nonexistent_test').region).toBe('San Marino');
    const g = fakeGym({
      id: 'sm_probe_sm',
      name: 'Probe Dogana',
      city: 'Dogana',
    });
    const entry = buildGymSearchEntry(g);
    expect(normalizeGymSearchValue(entry.haystack).includes('san marino')).toBe(true);
    expect(normalizeGymSearchValue(entry.haystack).includes('dogana')).toBe(true);
  });

  it('coordinate / postcode gates reject IT cores; accept Dogana / Borgo Maggiore', () => {
    expect(isPlausibleSanMarinoCoordinate(43.9812605, 12.4971575)).toBe(true); // Dynamic
    expect(isPlausibleSanMarinoCoordinate(43.9461526, 12.4561009)).toBe(true); // Phisicol
    expect(isPlausibleSanMarinoCoordinate(44.039515, 12.5666)).toBe(false); // Rimini
    expect(isPlausibleSanMarinoCoordinate(44.0090513, 12.4448198)).toBe(false); // Verucchio
    expect(isPlausibleSanMarinoCoordinate(43.9901369, 12.5171741)).toBe(false); // Coriano
    expect(isPlausibleSanMarinoCoordinate(43.8965, 12.344)).toBe(false); // San Leo
    expect(SAN_MARINO_POSTAL_RE.test('47891')).toBe(true);
    expect(SAN_MARINO_POSTAL_RE.test('47826')).toBe(false); // Verucchio IT
    expect(SAN_MARINO_POSTAL_RE.test('47923')).toBe(false); // Rimini IT
  });

  it('check-in unchanged; projected under 12500; DQ clean', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.projected_catalog_if_merged).toBe(11715);
    expect(report.projected_catalog_if_merged!).toBeLessThan(12500);
    expect(report.dq_gates?.duplicate_ids).toBe(0);
    expect(report.dq_gates?.invalid_postcodes).toBe(0);
    expect(report.dq_gates?.mojibake).toBe(0);
    expect(report.dq_gates?.unresolved_rebrand_conflicts).toBe(0);
    expect(report.dq_gates?.hard_duplicate_problems).toBe(0);
  });
});
