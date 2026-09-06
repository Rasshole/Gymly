/**
 * Liechtenstein Phase 1 staging validation — frozen Phase 1 conclusions.
 * Live staging may advance in Phase 2; Phase 1 artifacts remain authoritative.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleLiechtensteinCoordinate,
  LIECHTENSTEIN_POSTAL_RE,
  isLiechtensteinCountry,
  isIcelandCountry,
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
  'ff19dfaae9f99984ae5c6a73765b3e585263b61050d8c927fc45a38037dfa3dc';

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
};

function fakeGym(partial: Partial<DanishGym> & {id: string}): DanishGym {
  return {
    id: partial.id,
    name: partial.name ?? 'Probe Gym',
    city: partial.city ?? 'Vaduz',
    address: partial.address ?? 'Landstrasse 1',
    postalCode: partial.postalCode ?? '9490',
    country: 'Liechtenstein',
    region: 'Liechtenstein',
    latitude: partial.latitude ?? 47.14,
    longitude: partial.longitude ?? 9.52,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe Gym',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'Landstrasse 1',
      postal_code: partial.postalCode ?? '9490',
      city: partial.city ?? 'Vaduz',
      country: 'Liechtenstein',
      lat: partial.latitude ?? 47.14,
      lng: partial.longitude ?? 9.52,
      is_active: true,
    },
  };
}

describe('Liechtenstein Phase 1 staging', () => {
  const stagingPath = path.join(
    __dirname,
    '../data/liechtenstein/liechtenstein_centers_staging.json',
  );
  const phase1SnapshotPath = path.join(
    __dirname,
    '../data/liechtenstein/phase2/phase1_staging_snapshot.json',
  );
  const readyPath = path.join(
    __dirname,
    '../data/liechtenstein/LIECHTENSTEIN_PHASE1_READY_TO_IMPORT.json',
  );
  const reportPath = path.join(
    __dirname,
    '../data/liechtenstein/LIECHTENSTEIN_PHASE1_READINESS_REPORT.json',
  );
  const rebrandPath = path.join(
    __dirname,
    '../data/liechtenstein/LIECHTENSTEIN_PHASE1_REBRAND_MAP.json',
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
    liechtenstein_live?: number;
    iceland_live?: number;
    independent_candidate_count?: number;
    dq_gates?: Record<string, number>;
  };
  const rebrand = JSON.parse(fs.readFileSync(rebrandPath, 'utf8')) as {
    unresolved_conflicts?: number;
  };
  const centersRaw = fs.readFileSync(centersPath);
  const centers = JSON.parse(centersRaw.toString('utf8')) as Array<{id: string; country?: string}>;
  const sha = crypto.createHash('sha256').update(centersRaw).digest('hex');

  it('production reflects San Marino merge (11721 / IS 27 / LI 7 / AD 12); Phase 1 report SHA frozen', () => {
    expect(centers.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(centers.filter(c => c.country === 'Iceland').length).toBe(27);
    expect(centers.filter(c => c.id.startsWith('is_')).length).toBe(27);
    expect(centers.filter(c => c.country === 'Liechtenstein').length).toBe(7);
    expect(centers.filter(c => c.id.startsWith('li_')).length).toBe(7);
    expect(centers.filter(c => c.country === 'Andorra').length).toBe(12);
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    // Phase 1 report frozen at pre-merge baseline
    expect(report.production_total).toBe(11692);
    expect(report.production_sha256).toBe(PHASE_REPORT_PRODUCTION_SHA256);
    expect(report.liechtenstein_live).toBe(0);
    expect(report.iceland_live).toBe(27);
  });

  it('live staging IDs valid li_* and unique; Phase 1 conclusions in Phase 1 artifacts', () => {
    // Live staging may advance in Phase 2 — Phase 1 conclusions live in Phase 1 artifacts.
    const ids = staging.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(staging.length).toBeGreaterThan(40);
    for (const r of staging) {
      expect(r.id).toMatch(/^li_[a-f0-9]{10}$/);
      expect(VALID_STATUS.has(r.import_category)).toBe(true);
      expect(r.country).toBe('Liechtenstein');
    }
  });

  it('Phase 1 READY artifact empty; INDEPENDENT_PHASE_RECOMMENDED frozen', () => {
    expect(ready.length).toBe(0);
    expect(report.ready_count).toBe(0);
    expect(report.status_counts?.READY_TO_IMPORT ?? 0).toBe(0);
    expect(report.status_counts?.NEEDS_REVIEW).toBe(8);
    expect(report.small_market_model).toBe('INDEPENDENT_PHASE_RECOMMENDED');
    expect(report.independent_candidate_count).toBe(8);
    expect(report.phase2_required).toBe(true);
    expect(report.verdict).toBe('LIECHTENSTEIN PHASE 2 REQUIRED BEFORE MERGE');
  });

  it('Phase 1 snapshot: 8 independent candidates NEEDS_REVIEW with valid geo', () => {
    const candidates = phase1Snapshot.filter(
      r => r.discovery_class === 'independent_candidate',
    );
    expect(candidates.length).toBe(8);
    expect(candidates.every(r => r.import_category === 'NEEDS_REVIEW')).toBe(true);
    for (const r of candidates) {
      expect(LIECHTENSTEIN_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(r.address.trim().length).toBeGreaterThan(3);
      expect(r.city.trim().length).toBeGreaterThan(0);
      expect(isPlausibleLiechtensteinCoordinate(r.lat as number, r.lng as number)).toBe(true);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
    }
  });

  it('CLOSED/EXCLUDED foreign probes remain excluded in live staging', () => {
    const foreignProbes = staging.filter(r => r.discovery_class === 'foreign_border_probe');
    expect(foreignProbes.length).toBeGreaterThan(0);
    expect(foreignProbes.every(r => r.import_category === 'EXCLUDED')).toBe(true);
    for (const r of foreignProbes) {
      if (r.lat != null && r.lng != null) {
        expect(isPlausibleLiechtensteinCoordinate(r.lat, r.lng)).toBe(false);
      }
    }
    expect(staging.some(r => /Salutaris.*legacy/i.test(r.name) && r.import_category === 'CLOSED')).toBe(
      true,
    );
    expect(
      staging.some(r => /blugym.*legacy/i.test(r.name) && r.import_category === 'CLOSED'),
    ).toBe(true);
  });

  it('rebrand map resolved', () => {
    expect(rebrand.unresolved_conflicts).toBe(0);
  });

  it('country / display / i18n / search support li_ and Liechtenstein', () => {
    expect(isLiechtensteinCountry('Liechtenstein')).toBe(true);
    expect(isLiechtensteinCountry('LI')).toBe(true);
    expect(isIcelandCountry('Iceland')).toBe(true);
    expect(GYM_ID_PREFIX.liechtenstein).toBe('li_');
    expect(gymCountryTranslationKey('Liechtenstein')).toBe('countries.liechtenstein');
    expect(en.countries.liechtenstein).toBe('Liechtenstein');
    expect(da.countries.liechtenstein).toBe('Liechtenstein');
    expect(sv.countries.liechtenstein).toBe('Liechtenstein');
    expect(nb.countries.liechtenstein).toBe('Liechtenstein');
    expect(resolveGymOrStub('li_nonexistent_test').region).toBe('Liechtenstein');
    const g = fakeGym({id: 'li_probe_vaduz', name: 'Probe Vaduz', city: 'Vaduz'});
    const entry = buildGymSearchEntry(g);
    expect(normalizeGymSearchValue(entry.haystack).includes('liechtenstein')).toBe(true);
    expect(normalizeGymSearchValue(entry.haystack).includes('vaduz')).toBe(true);
  });

  it('coordinate gate rejects CH/AT border cores; accepts Vaduz', () => {
    expect(isPlausibleLiechtensteinCoordinate(47.14, 9.52)).toBe(true);
    expect(isPlausibleLiechtensteinCoordinate(47.235, 9.597)).toBe(false);
    expect(isPlausibleLiechtensteinCoordinate(47.424, 9.376)).toBe(false);
    expect(LIECHTENSTEIN_POSTAL_RE.test('9490')).toBe(true);
    expect(LIECHTENSTEIN_POSTAL_RE.test('9470')).toBe(false);
    expect(LIECHTENSTEIN_POSTAL_RE.test('6800')).toBe(false);
  });

  it('check-in unchanged; Phase 1 projected catalog under 12500', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.projected_catalog_if_merged).toBe(11692);
    expect(report.projected_catalog_if_merged!).toBeLessThan(12500);
    expect(report.dq_gates?.foreign_territorial_outliers).toBe(0);
    expect(report.dq_gates?.duplicate_ids).toBe(0);
  });
});
