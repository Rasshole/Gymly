/**
 * Monaco Phase 1 staging validation — discovery + staging only.
 * Production centers.json must remain frozen.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleMonacoCoordinate,
  MONACO_POSTAL_RE,
  isMonacoCountry,
  isAndorraCountry,
  isLiechtensteinCountry,
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
const PHASE_REPORT_PRODUCTION_SHA256 =
  'bde8ba6b5ac7467078e971732e0deeb42e3fb338f5280f390d8395714792f02f';

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
  district?: string;
  territory?: string;
};

function fakeGym(partial: Partial<DanishGym> & {id: string}): DanishGym {
  return {
    id: partial.id,
    name: partial.name ?? 'Probe Gym',
    city: partial.city ?? 'Monte-Carlo',
    address: partial.address ?? 'Avenue de Monte-Carlo 1',
    postalCode: partial.postalCode ?? '98000',
    country: 'Monaco',
    region: 'Monaco',
    latitude: partial.latitude ?? 43.738,
    longitude: partial.longitude ?? 7.424,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe Gym',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'Avenue de Monte-Carlo 1',
      postal_code: partial.postalCode ?? '98000',
      city: partial.city ?? 'Monte-Carlo',
      country: 'Monaco',
      lat: partial.latitude ?? 43.738,
      lng: partial.longitude ?? 7.424,
      is_active: true,
    },
  };
}

describe('Monaco Phase 1 staging', () => {
  const stagingPath = path.join(__dirname, '../data/monaco/monaco_centers_staging.json');
  const phase1SnapshotPath = path.join(
    __dirname,
    '../data/monaco/phase2/phase1_staging_snapshot.json',
  );
  const readyPath = path.join(
    __dirname,
    '../data/monaco/MONACO_PHASE1_READY_TO_IMPORT.json',
  );
  const reportPath = path.join(
    __dirname,
    '../data/monaco/MONACO_PHASE1_READINESS_REPORT.json',
  );
  const rebrandPath = path.join(
    __dirname,
    '../data/monaco/MONACO_PHASE1_REBRAND_MAP.json',
  );
  const inventoryPath = path.join(
    __dirname,
    '../data/monaco/monaco_chain_inventory.json',
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
    status_counts?: Record<string, number>;
    phase2_required?: boolean;
    verdict?: string;
    small_market_model?: string;
    projected_catalog_if_merged?: number;
    monaco_live?: number;
    andorra_live?: number;
    liechtenstein_live?: number;
    iceland_live?: number;
    independent_candidate_count?: number;
    municipal_candidate_count?: number;
    class_a_chains?: number;
    class_a_locations?: number;
    dq_gates?: Record<string, number>;
    district_coverage?: Record<string, string>;
    unique_staged?: number;
  };
  const rebrand = JSON.parse(fs.readFileSync(rebrandPath, 'utf8')) as {
    unresolved_conflicts?: number;
  };
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8')) as {
    small_market?: {recommended_model?: string};
  };
  const centersRaw = fs.readFileSync(centersPath);
  const centers = JSON.parse(centersRaw.toString('utf8')) as Array<{id: string; country?: string}>;
  const sha = crypto.createHash('sha256').update(centersRaw).digest('hex');

  it('production reflects San Marino merge (11721 / MC 4 / AD 12); Phase 1 report SHA frozen', () => {
    expect(centers.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(centers.filter(c => c.country === 'Andorra').length).toBe(12);
    expect(centers.filter(c => c.country === 'Liechtenstein').length).toBe(7);
    expect(centers.filter(c => c.country === 'Iceland').length).toBe(27);
    expect(centers.filter(c => c.country === 'Monaco').length).toBe(4);
    expect(centers.filter(c => c.id.startsWith('mc_')).length).toBe(4);
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(report.production_total).toBe(11711);
    expect(report.production_sha256).toBe(PHASE_REPORT_PRODUCTION_SHA256);
    expect(report.monaco_live).toBe(0);
    expect(report.andorra_live).toBe(12);
    expect(report.liechtenstein_live).toBe(7);
  });

  it('live staging IDs valid mc_* unique; Phase 1 conclusions in Phase 1 artifacts', () => {
    const ids = staging.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(staging.length).toBeGreaterThanOrEqual(39);
    expect(report.unique_staged).toBe(39);
    for (const r of staging) {
      expect(r.id).toMatch(/^mc_[a-f0-9]{10}$/);
      expect(VALID_STATUS.has(r.import_category)).toBe(true);
      if (r.discovery_class !== 'foreign_border_probe') {
        expect(r.country).toBe('Monaco');
      }
    }
  });

  it('Phase 1 READY artifact empty; INDEPENDENT_PHASE_RECOMMENDED frozen', () => {
    expect(ready.length).toBe(0);
    expect(report.ready_count).toBe(0);
    expect(report.status_counts?.READY_TO_IMPORT ?? 0).toBe(0);
    expect(report.status_counts?.NEEDS_REVIEW).toBe(4);
    expect(report.small_market_model).toBe('INDEPENDENT_PHASE_RECOMMENDED');
    // Live inventory may advance to INDEPENDENT_PHASE_EXECUTED in Phase 2
    expect(
      inventory.small_market?.recommended_model === 'INDEPENDENT_PHASE_RECOMMENDED' ||
        inventory.small_market?.recommended_model === 'INDEPENDENT_PHASE_EXECUTED',
    ).toBe(true);
    expect(report.independent_candidate_count).toBe(2);
    expect(report.municipal_candidate_count).toBe(2);
    expect(report.class_a_chains).toBe(0);
    expect(report.class_a_locations).toBe(0);
    expect(report.phase2_required).toBe(true);
    expect(report.verdict).toBe('MONACO PHASE 2 REQUIRED BEFORE MERGE');
  });

  it('Phase 1 snapshot: independent + municipal candidates NEEDS_REVIEW with valid MC geo', () => {
    const candidates = phase1Snapshot.filter(
      r =>
        r.discovery_class === 'independent_candidate' ||
        r.discovery_class === 'municipal_sports_center',
    );
    expect(candidates.length).toBe(4);
    expect(candidates.every(r => r.import_category === 'NEEDS_REVIEW')).toBe(true);
    expect(
      candidates.every(r => r.eligibility_candidate === 'SMALL_MARKET_INDEPENDENT'),
    ).toBe(true);
    for (const r of candidates) {
      expect(MONACO_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(r.address.trim().length).toBeGreaterThan(3);
      expect(r.city.trim().length).toBeGreaterThan(0);
      expect(isPlausibleMonacoCoordinate(r.lat as number, r.lng as number)).toBe(true);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
    }
    expect(candidates.some(r => /Fit Factory/i.test(r.brand))).toBe(true);
    expect(candidates.some(r => /Eclub/i.test(r.brand))).toBe(true);
    expect(candidates.some(r => /Hercule/i.test(r.brand))).toBe(true);
    expect(candidates.some(r => /Stade Louis II/i.test(r.brand))).toBe(true);
  });

  it('hotel/spa/private/specialist excluded; World Class Cap-d\'Ail French border EXCLUDED', () => {
    expect(
      staging.some(r => /39 Monte-Carlo/i.test(r.name) && r.import_category === 'EXCLUDED'),
    ).toBe(true);
    expect(
      staging.some(r => /Fairmont/i.test(r.brand) && r.import_category === 'EXCLUDED'),
    ).toBe(true);
    expect(
      staging.some(r => /Thermes Marins/i.test(r.brand) && r.import_category === 'EXCLUDED'),
    ).toBe(true);
    expect(
      staging.some(r => /The Forge/i.test(r.brand) && r.import_category === 'EXCLUDED'),
    ).toBe(true);
    const worldClass = staging.find(r => /World Class/i.test(r.brand) && /Cap/i.test(r.name))!;
    expect(worldClass.import_category).toBe('EXCLUDED');
    expect(worldClass.discovery_class).toBe('foreign_border_probe');
    expect(worldClass.territory).toBe('France');
    expect(isPlausibleMonacoCoordinate(worldClass.lat as number, worldClass.lng as number)).toBe(
      false,
    );
  });

  it('foreign border probes EXCLUDED; French READY contamination 0', () => {
    const foreignProbes = staging.filter(r => r.discovery_class === 'foreign_border_probe');
    expect(foreignProbes.length).toBeGreaterThanOrEqual(5);
    expect(foreignProbes.every(r => r.import_category === 'EXCLUDED')).toBe(true);
    for (const r of foreignProbes) {
      if (r.lat != null && r.lng != null) {
        expect(isPlausibleMonacoCoordinate(r.lat, r.lng)).toBe(false);
      }
    }
    expect(report.dq_gates?.french_contamination).toBe(0);
    expect(report.dq_gates?.foreign_territorial_outliers).toBe(0);
    expect(ready.every(r => isPlausibleMonacoCoordinate(r.lat as number, r.lng as number))).toBe(
      true,
    );
  });

  it('districts audited; rebrand unresolved = 0', () => {
    for (const d of [
      'Monte-Carlo',
      'La Condamine',
      'Fontvieille',
      'Larvotto',
      'Monaco-Ville',
      'Moneghetti',
      'Jardin Exotique',
      'La Rousse',
    ]) {
      expect(report.district_coverage?.[d]).toBeTruthy();
    }
    expect(rebrand.unresolved_conflicts).toBe(0);
  });

  it('country / display / i18n / search support mc_ and Monaco', () => {
    expect(isMonacoCountry('Monaco')).toBe(true);
    expect(isMonacoCountry('MC')).toBe(true);
    expect(isAndorraCountry('Andorra')).toBe(true);
    expect(isLiechtensteinCountry('Liechtenstein')).toBe(true);
    expect(GYM_ID_PREFIX.monaco).toBe('mc_');
    expect(gymCountryTranslationKey('Monaco')).toBe('countries.monaco');
    expect(en.countries.monaco).toBe('Monaco');
    expect(da.countries.monaco).toBe('Monaco');
    expect(sv.countries.monaco).toBe('Monaco');
    expect(nb.countries.monaco).toBe('Monaco');
    expect(resolveGymOrStub('mc_nonexistent_test').region).toBe('Monaco');
    const g = fakeGym({
      id: 'mc_probe_mc',
      name: 'Probe Monte-Carlo',
      city: 'Monte-Carlo',
    });
    const entry = buildGymSearchEntry(g);
    expect(normalizeGymSearchValue(entry.haystack).includes('monaco')).toBe(true);
    expect(normalizeGymSearchValue(entry.haystack).includes('monte carlo')).toBe(true);
  });

  it('coordinate / postcode gates reject FR cores; accept Fontvieille / Larvotto', () => {
    expect(isPlausibleMonacoCoordinate(43.7276, 7.4154)).toBe(true); // Stade Louis II
    expect(isPlausibleMonacoCoordinate(43.7462, 7.4348)).toBe(true); // Larvotto
    expect(isPlausibleMonacoCoordinate(43.7208, 7.4052)).toBe(false); // Cap-d'Ail
    expect(isPlausibleMonacoCoordinate(43.7512, 7.4235)).toBe(false); // Beausoleil
    expect(isPlausibleMonacoCoordinate(43.762, 7.457)).toBe(false); // Roquebrune
    expect(MONACO_POSTAL_RE.test('98000')).toBe(true);
    expect(MONACO_POSTAL_RE.test('06320')).toBe(false); // Cap-d'Ail FR
    expect(MONACO_POSTAL_RE.test('06240')).toBe(false); // Beausoleil FR
  });

  it('check-in unchanged; projected catalog under 12500; DQ clean', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.projected_catalog_if_merged).toBe(11711);
    expect(report.projected_catalog_if_merged!).toBeLessThan(12500);
    expect(report.dq_gates?.duplicate_ids).toBe(0);
    expect(report.dq_gates?.invalid_postcodes).toBe(0);
    expect(report.dq_gates?.mojibake).toBe(0);
    expect(report.dq_gates?.unresolved_rebrand_conflicts).toBe(0);
  });
});
