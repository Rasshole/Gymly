/**
 * Moldova Phase 1 staging validation — discovery + staging only.
 * Production centers.json must remain frozen. No merge in Phase 1.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleMoldovaCoordinate,
  MOLDOVA_POSTAL_RE,
  isMoldovaCountry,
  isSanMarinoCountry,
  isMonacoCountry,
  isAndorraCountry,
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

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº|ChiÈ|BÄƒl/;
const FALLBACK_COORD_SOURCES =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const CURRENT_PRODUCTION_TOTAL = 11921; // live after Bosnia merge
const LIVE_PRODUCTION_SHA256 =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';
const PHASE1_REPORT_SHA256 =
  '86c6c63b17b1bcce9cd69071f2ff7dc7cc97e7440c921b9001bc88a5a07adcd6';
const PHASE1_PRODUCTION_TOTAL = 11721;

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
  territory?: string;
  transnistria?: boolean;
};

function fakeGym(partial: Partial<DanishGym> & {id: string}): DanishGym {
  return {
    id: partial.id,
    name: partial.name ?? 'Probe Gym',
    city: partial.city ?? 'Chișinău',
    address: partial.address ?? 'bd. Ștefan cel Mare 1',
    postalCode: partial.postalCode ?? 'MD-2001',
    country: 'Moldova',
    region: 'Moldova',
    latitude: partial.latitude ?? 47.01,
    longitude: partial.longitude ?? 28.86,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe Gym',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'bd. Ștefan cel Mare 1',
      postal_code: partial.postalCode ?? 'MD-2001',
      city: partial.city ?? 'Chișinău',
      country: 'Moldova',
      lat: partial.latitude ?? 47.01,
      lng: partial.longitude ?? 28.86,
      is_active: true,
      is_coming_soon: false,
    },
  } as DanishGym;
}

describe('Moldova Phase 1 staging', () => {
  // Live staging is Phase 2; Phase 1 conclusions frozen under phase2/
  const stagingPath = path.join(
    __dirname,
    '../data/moldova/phase2/phase1_staging_snapshot.json',
  );
  const readyPath = path.join(
    __dirname,
    '../data/moldova/MOLDOVA_PHASE1_READY_TO_IMPORT.json',
  );
  const reportPath = path.join(
    __dirname,
    '../data/moldova/MOLDOVA_PHASE1_READINESS_REPORT.json',
  );
  const rebrandPath = path.join(
    __dirname,
    '../data/moldova/MOLDOVA_PHASE1_REBRAND_MAP.json',
  );
  const inventoryPath = path.join(
    __dirname,
    '../data/moldova/phase2/phase1_inventory_freeze.json',
  );
  const transnistriaPath = path.join(
    __dirname,
    '../data/moldova/phase2/phase1_transnistria_freeze.json',
  );
  const dupPath = path.join(
    __dirname,
    '../data/moldova/phase2/phase1_dup_freeze.json',
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
    independent_candidate_count?: number;
    municipal_candidate_count?: number;
    moldova_live?: number;
    san_marino_live?: number;
    monaco_live?: number;
    andorra_live?: number;
    liechtenstein_live?: number;
    iceland_live?: number;
    projected_catalog_if_merged?: number;
    crosses_12500?: boolean;
    global_stress_qa_required_now?: boolean;
    dq_gates?: Record<string, number>;
    unique_staged?: number;
    merge_ready?: boolean;
    transnistria_policy?: string;
  };
  const rebrand = JSON.parse(fs.readFileSync(rebrandPath, 'utf8')) as {
    unresolved_conflicts?: number;
  };
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8')) as {
    small_market?: {recommended_model?: string};
    class_a_chains?: number;
  };
  const transnistria = JSON.parse(fs.readFileSync(transnistriaPath, 'utf8')) as {
    policy?: string;
    separate_country_prefix?: boolean;
    ready_count?: number;
  };
  const dup = JSON.parse(fs.readFileSync(dupPath, 'utf8')) as {
    unexplained_hard_duplicates?: number;
  };
  const centersRaw = fs.readFileSync(centersPath);
  const centers = JSON.parse(centersRaw.toString('utf8')) as Array<{
    id: string;
    country?: string;
  }>;
  const sha = crypto.createHash('sha256').update(centersRaw).digest('hex');

  it('production reflects Moldova merge (11749 / MD 28); Phase 1 report SHA frozen', () => {
    expect(centers.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(centers.filter(c => c.country === 'Moldova').length).toBe(28);
    expect(centers.filter(c => c.id.startsWith('md_')).length).toBe(28);
    expect(centers.filter(c => c.country === 'San Marino').length).toBe(6);
    expect(centers.filter(c => c.country === 'Monaco').length).toBe(4);
    expect(centers.filter(c => c.country === 'Andorra').length).toBe(12);
    expect(centers.filter(c => c.country === 'Liechtenstein').length).toBe(7);
    expect(centers.filter(c => c.country === 'Iceland').length).toBe(27);
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(report.production_total).toBe(PHASE1_PRODUCTION_TOTAL);
    expect(report.production_sha256).toBe(PHASE1_REPORT_SHA256);
    expect(report.moldova_live).toBe(0);
    expect(report.san_marino_live).toBe(6);
    expect(report.monaco_live).toBe(4);
    expect(report.andorra_live).toBe(12);
    expect(report.liechtenstein_live).toBe(7);
    expect(report.iceland_live).toBe(27);
  });

  it('Phase 1 snapshot IDs unique md_*; Phase 1 READY artifact frozen', () => {
    const ids = staging.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(GYM_ID_PREFIX.moldova).toBe('md_');
    expect(staging.length).toBe(73);
    for (const r of staging) {
      expect(r.id).toMatch(/^md_[a-f0-9]{10}$/);
      expect(VALID_STATUS.has(r.import_category)).toBe(true);
    }
  });

  it('READY purity: Class A only, valid postcodes/coords, no contamination', () => {
    expect(ready.length).toBe(report.ready_count);
    expect(ready.length).toBe(15);
    for (const r of ready) {
      expect(r.import_category).toBe('READY_TO_IMPORT');
      expect(r.eligibility_candidate).toBe('CHAIN_CLASS_A');
      expect(r.country).toBe('Moldova');
      expect(r.territory).toBe('Moldova');
      expect(r.transnistria).toBeFalsy();
      expect(MOLDOVA_POSTAL_RE.test(r.postal_code)).toBe(true);
      expect(r.lat).not.toBeNull();
      expect(r.lng).not.toBeNull();
      expect(isPlausibleMoldovaCoordinate(r.lat!, r.lng!)).toBe(true);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(['BIGSPORT GYM', 'Energy Fitness']).toContain(r.brand);
    }
    expect(report.dq_gates?.romanian_ready_outliers).toBe(0);
    expect(report.dq_gates?.ukrainian_ready_outliers).toBe(0);
    expect(report.dq_gates?.fallback_ready_coords).toBe(0);
    expect(report.dq_gates?.invalid_ready_postcodes).toBe(0);
    expect(report.dq_gates?.unresolved_ready_coords).toBe(0);
    expect(report.dq_gates?.mojibake).toBe(0);
  });

  it('no excluded/closed rows in READY artifact; mojibake = 0', () => {
    for (const r of ready) {
      expect(r.import_category).not.toBe('EXCLUDED');
      expect(r.import_category).not.toBe('CLOSED');
    }
    for (const r of staging) {
      const blob = `${r.name} ${r.address} ${r.city} ${r.brand}`;
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
    }
  });

  it('duplicates and rebrands do not block with unresolved hard conflicts', () => {
    expect(dup.unexplained_hard_duplicates).toBe(0);
    expect(rebrand.unresolved_conflicts).toBe(0);
    expect(report.dq_gates?.unexplained_hard_duplicates).toBe(0);
    expect(report.dq_gates?.rebrand_unresolved).toBe(0);
  });

  it('Transnistria decision represented; no READY; no separate country prefix', () => {
    expect(transnistria.policy).toBe('TERRITORIALLY_HELD_NEEDS_REVIEW');
    expect(transnistria.separate_country_prefix).toBe(false);
    expect(transnistria.ready_count).toBe(0);
    expect(report.transnistria_policy).toBe('TERRITORIALLY_HELD_NEEDS_REVIEW');
    const tn = staging.filter(r => r.transnistria);
    expect(tn.length).toBeGreaterThanOrEqual(4);
    for (const r of tn) {
      expect(r.import_category).not.toBe('READY_TO_IMPORT');
      expect(r.id.startsWith('md_')).toBe(true);
    }
  });

  it('country detection, labels, search aliases, orphan md_* stub', () => {
    expect(isMoldovaCountry('Moldova')).toBe(true);
    expect(isMoldovaCountry('Republic of Moldova')).toBe(true);
    expect(isMoldovaCountry('Republica Moldova')).toBe(true);
    expect(isMoldovaCountry('Moldavien')).toBe(true);
    expect(isMoldovaCountry('Romania')).toBe(false);
    expect(gymCountryTranslationKey('Moldova')).toBe('countries.moldova');
    expect(en.countries.moldova).toBe('Moldova');
    expect(da.countries.moldova).toBe('Moldova');
    expect(sv.countries.moldova).toBe('Moldavien');
    expect(nb.countries.moldova).toBe('Moldova');

    const entry = buildGymSearchEntry(
      fakeGym({
        id: 'md_testsearch',
        name: 'BIGSPORT GYM Buiucani',
        city: 'Chișinău',
        brand: 'BIGSPORT GYM',
      }),
    );
    expect(entry.haystack).toMatch(/moldova|republica moldova|moldavien/i);
    expect(entry.haystack).toMatch(/chisinau|chișinău/i);

    const stub = resolveGymOrStub('md_nonexistent_test');
    expect(stub).toBeTruthy();
    expect(String((stub as {region?: string}).region || '')).toMatch(/Moldova/i);

    expect(isPlausibleMoldovaCoordinate(47.01, 28.86)).toBe(true); // Chișinău
    expect(isPlausibleMoldovaCoordinate(47.1585, 27.6014)).toBe(false); // Iași RO
    expect(isPlausibleMoldovaCoordinate(46.4825, 30.7233)).toBe(false); // Odesa UA
    expect(isSanMarinoCountry('San Marino')).toBe(true);
    expect(isMonacoCountry('Monaco')).toBe(true);
    expect(isAndorraCountry('Andorra')).toBe(true);
  });

  it('Phase 2 required; projected catalog under 12500; no merge', () => {
    expect(report.phase2_required).toBe(true);
    expect(report.small_market_model).toBe('INDEPENDENT_PHASE_RECOMMENDED');
    expect(inventory.small_market?.recommended_model).toBe(
      'INDEPENDENT_PHASE_RECOMMENDED',
    );
    expect(report.class_a_chains).toBe(2);
    expect(report.ready_count).toBe(15);
    expect(report.needs_review_count).toBeGreaterThanOrEqual(15);
    expect(report.needs_coordinates_count).toBe(1);
    expect(report.projected_catalog_if_merged).toBe(11736);
    expect(report.crosses_12500).toBe(false);
    expect(report.global_stress_qa_required_now).toBe(false);
    expect(report.merge_ready).toBe(false);
    expect(report.verdict).toBe('MOLDOVA PHASE 2 REQUIRED BEFORE MERGE');
  });

  it('check-in / auto-checkout radius remain 200 m', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
  });
});
