/**
 * Andorra Phase 1 staging validation — discovery + staging only.
 * Production centers.json must remain frozen.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleAndorraCoordinate,
  ANDORRA_POSTAL_RE,
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
const PHASE1_REPORT_SHA256 =
  'b4f155e2501d10af07eded1ca1342f06784f5f122f4e51bb081ebf943cdb0bbc';

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
  parish?: string;
  territory?: string;
};

function fakeGym(partial: Partial<DanishGym> & {id: string}): DanishGym {
  return {
    id: partial.id,
    name: partial.name ?? 'Probe Gym',
    city: partial.city ?? 'Andorra la Vella',
    address: partial.address ?? 'Avinguda Meritxell 1',
    postalCode: partial.postalCode ?? 'AD500',
    country: 'Andorra',
    region: 'Andorra',
    latitude: partial.latitude ?? 42.5063,
    longitude: partial.longitude ?? 1.5218,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe Gym',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'Avinguda Meritxell 1',
      postal_code: partial.postalCode ?? 'AD500',
      city: partial.city ?? 'Andorra la Vella',
      country: 'Andorra',
      lat: partial.latitude ?? 42.5063,
      lng: partial.longitude ?? 1.5218,
      is_active: true,
    },
  };
}

describe('Andorra Phase 1 staging', () => {
  const stagingPath = path.join(__dirname, '../data/andorra/andorra_centers_staging.json');
  const phase1SnapshotPath = path.join(
    __dirname,
    '../data/andorra/phase2/phase1_staging_snapshot.json',
  );
  const readyPath = path.join(
    __dirname,
    '../data/andorra/ANDORRA_PHASE1_READY_TO_IMPORT.json',
  );
  const reportPath = path.join(
    __dirname,
    '../data/andorra/ANDORRA_PHASE1_READINESS_REPORT.json',
  );
  const rebrandPath = path.join(
    __dirname,
    '../data/andorra/ANDORRA_PHASE1_REBRAND_MAP.json',
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
    andorra_live?: number;
    liechtenstein_live?: number;
    iceland_live?: number;
    independent_candidate_count?: number;
    municipal_candidate_count?: number;
    class_a_chains?: number;
    class_a_locations?: number;
    dq_gates?: Record<string, number>;
    parish_coverage?: Record<string, string>;
    unique_staged?: number;
  };
  const rebrand = JSON.parse(fs.readFileSync(rebrandPath, 'utf8')) as {
    unresolved_conflicts?: number;
  };
  const centersRaw = fs.readFileSync(centersPath);
  const centers = JSON.parse(centersRaw.toString('utf8')) as Array<{id: string; country?: string}>;
  const sha = crypto.createHash('sha256').update(centersRaw).digest('hex');

  it('production reflects San Marino merge (11721 / LI 7 / IS 27 / AD 12); Phase 1 report SHA frozen', () => {
    expect(centers.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(centers.filter(c => c.country === 'Liechtenstein').length).toBe(7);
    expect(centers.filter(c => c.id.startsWith('li_')).length).toBe(7);
    expect(centers.filter(c => c.country === 'Iceland').length).toBe(27);
    expect(centers.filter(c => c.country === 'Andorra').length).toBe(12);
    expect(centers.filter(c => c.id.startsWith('ad_')).length).toBe(12);
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(report.production_total).toBe(11699);
    expect(report.production_sha256).toBe(PHASE1_REPORT_SHA256);
    expect(report.andorra_live).toBe(0);
    expect(report.liechtenstein_live).toBe(7);
    expect(report.iceland_live).toBe(27);
  });

  it('live staging IDs valid ad_* unique; Phase 1 conclusions in Phase 1 artifacts', () => {
    const ids = staging.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(staging.length).toBeGreaterThanOrEqual(53);
    expect(report.unique_staged).toBe(53);
    for (const r of staging) {
      expect(r.id).toMatch(/^ad_[a-f0-9]{10}$/);
      expect(VALID_STATUS.has(r.import_category)).toBe(true);
      expect(r.country).toBe('Andorra');
    }
  });

  it('Phase 1 READY artifact empty; INDEPENDENT_PHASE_RECOMMENDED frozen', () => {
    expect(ready.length).toBe(0);
    expect(report.ready_count).toBe(0);
    expect(report.status_counts?.READY_TO_IMPORT ?? 0).toBe(0);
    expect(report.status_counts?.NEEDS_REVIEW).toBe(13);
    expect(report.status_counts?.EXCLUDED).toBe(40);
    expect(report.small_market_model).toBe('INDEPENDENT_PHASE_RECOMMENDED');
    expect(report.independent_candidate_count).toBe(7);
    expect(report.municipal_candidate_count).toBe(6);
    expect(report.class_a_chains).toBe(1);
    expect(report.class_a_locations).toBe(3);
    expect(report.phase2_required).toBe(true);
    expect(report.verdict).toBe('ANDORRA PHASE 2 REQUIRED BEFORE MERGE');
  });

  it('Phase 1 snapshot: independent candidates NEEDS_REVIEW with valid AD geo', () => {
    const candidates = phase1Snapshot.filter(r => r.discovery_class === 'independent_candidate');
    expect(candidates.length).toBe(7);
    expect(candidates.every(r => r.import_category === 'NEEDS_REVIEW')).toBe(true);
    for (const r of candidates) {
      expect(ANDORRA_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(r.address.trim().length).toBeGreaterThan(3);
      expect(r.city.trim().length).toBeGreaterThan(0);
      expect(isPlausibleAndorraCoordinate(r.lat as number, r.lng as number)).toBe(true);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
    }
    expect(candidates.some(r => /Duplex/i.test(r.brand))).toBe(true);
    expect(candidates.some(r => /NEXT/i.test(r.brand))).toBe(true);
    expect(
      candidates.filter(r => /Urban Gym|AnyósPark/i.test(r.brand)).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('Phase 1 snapshot municipals NEEDS_REVIEW; Caldea/CrossFit excluded in live staging', () => {
    const municipal = phase1Snapshot.filter(r => r.discovery_class === 'municipal_sports_center');
    expect(municipal.length).toBe(6);
    expect(municipal.every(r => r.import_category === 'NEEDS_REVIEW')).toBe(true);
    expect(
      staging.some(r => /Caldea/i.test(r.name) && r.import_category === 'EXCLUDED'),
    ).toBe(true);
    expect(
      staging.filter(r => /CrossFit/i.test(r.brand) && r.import_category === 'EXCLUDED').length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('foreign border probes EXCLUDED; Spanish/French READY contamination 0', () => {
    const foreignProbes = staging.filter(r => r.discovery_class === 'foreign_border_probe');
    expect(foreignProbes.length).toBeGreaterThanOrEqual(4);
    expect(foreignProbes.every(r => r.import_category === 'EXCLUDED')).toBe(true);
    for (const r of foreignProbes) {
      if (r.lat != null && r.lng != null) {
        expect(isPlausibleAndorraCoordinate(r.lat, r.lng)).toBe(false);
      }
    }
    expect(report.dq_gates?.spanish_contamination).toBe(0);
    expect(report.dq_gates?.french_contamination).toBe(0);
    expect(report.dq_gates?.foreign_territorial_outliers).toBe(0);
    expect(ready.every(r => isPlausibleAndorraCoordinate(r.lat as number, r.lng as number))).toBe(
      true,
    );
  });

  it('all 7 parishes audited; rebrand unresolved = 0', () => {
    const parishes = [
      'Andorra la Vella',
      'Escaldes-Engordany',
      'La Massana',
      'Canillo',
      'Ordino',
      'Encamp',
      'Sant Julià de Lòria',
    ];
    for (const p of parishes) {
      expect(report.parish_coverage?.[p]).toBeTruthy();
    }
    expect(rebrand.unresolved_conflicts).toBe(0);
  });

  it('country / display / i18n / search support ad_ and Andorra', () => {
    expect(isAndorraCountry('Andorra')).toBe(true);
    expect(isAndorraCountry('AD')).toBe(true);
    expect(isLiechtensteinCountry('Liechtenstein')).toBe(true);
    expect(GYM_ID_PREFIX.andorra).toBe('ad_');
    expect(gymCountryTranslationKey('Andorra')).toBe('countries.andorra');
    expect(en.countries.andorra).toBe('Andorra');
    expect(da.countries.andorra).toBe('Andorra');
    expect(sv.countries.andorra).toBe('Andorra');
    expect(nb.countries.andorra).toBe('Andorra');
    expect(resolveGymOrStub('ad_nonexistent_test').region).toBe('Andorra');
    const g = fakeGym({
      id: 'ad_probe_alv',
      name: 'Probe Andorra la Vella',
      city: 'Andorra la Vella',
    });
    const entry = buildGymSearchEntry(g);
    expect(normalizeGymSearchValue(entry.haystack).includes('andorra')).toBe(true);
    expect(normalizeGymSearchValue(entry.haystack).includes('andorra la vella')).toBe(true);
  });

  it('coordinate / postcode gates reject ES/FR cores; accept ALV / Pas de la Casa', () => {
    expect(isPlausibleAndorraCoordinate(42.5063, 1.5218)).toBe(true);
    expect(isPlausibleAndorraCoordinate(42.5425, 1.7335)).toBe(true); // Pas de la Casa
    expect(isPlausibleAndorraCoordinate(42.358, 1.456)).toBe(false); // La Seu d'Urgell
    expect(isPlausibleAndorraCoordinate(42.59, 1.801)).toBe(false); // L'Hospitalet
    expect(ANDORRA_POSTAL_RE.test('AD500')).toBe(true);
    expect(ANDORRA_POSTAL_RE.test('AD700')).toBe(true);
    expect(ANDORRA_POSTAL_RE.test('25700')).toBe(false); // Spanish
    expect(ANDORRA_POSTAL_RE.test('09110')).toBe(false); // French
  });

  it('check-in unchanged; projected catalog under 12500; DQ clean', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.projected_catalog_if_merged).toBe(11699); // Phase 1 freeze
    expect(report.projected_catalog_if_merged!).toBeLessThan(12500);
    expect(report.dq_gates?.duplicate_ids).toBe(0);
    expect(report.dq_gates?.invalid_postcodes).toBe(0);
    expect(report.dq_gates?.mojibake).toBe(0);
    expect(report.dq_gates?.unresolved_rebrand_conflicts).toBe(0);
  });
});
