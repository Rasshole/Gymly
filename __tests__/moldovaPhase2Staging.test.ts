/**
 * Moldova Phase 2 staging validation — final READY reconciliation.
 * Production centers.json must remain frozen. No merge in Phase 2.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleMoldovaCoordinate,
  MOLDOVA_POSTAL_RE,
  isMoldovaCountry,
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

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|ChiÈ|BÄƒl/;
const FALLBACK_COORD_SOURCES =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const CURRENT_PRODUCTION_TOTAL = 11921; // live after Bosnia merge
const LIVE_PRODUCTION_SHA256 =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';
const PHASE2_REPORT_SHA256 =
  '86c6c63b17b1bcce9cd69071f2ff7dc7cc97e7440c921b9001bc88a5a07adcd6';
const PHASE2_PRODUCTION_TOTAL = 11721;

const P1_INDEPENDENTS = [
  'md_7c20c053f6',
  'md_d7324c8264',
  'md_b1a848b890',
  'md_4477ca297c',
  'md_558a5c0acb',
  'md_392d634c67',
  'md_9b715c6e1a',
  'md_9673fe6184',
  'md_50311952c3',
  'md_0ccd5951da',
  'md_02edf6fc7e',
  'md_2ef49a6f3c',
  'md_4e70de1fcd',
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
  eligibility_candidate?: string | null;
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

describe('Moldova Phase 2 staging', () => {
  const stagingPath = path.join(
    __dirname,
    '../data/moldova/moldova_centers_staging.json',
  );
  const phase1SnapPath = path.join(
    __dirname,
    '../data/moldova/phase2/phase1_staging_snapshot.json',
  );
  const readyPath = path.join(
    __dirname,
    '../data/moldova/MOLDOVA_PHASE2_READY_TO_IMPORT.json',
  );
  const reportPath = path.join(
    __dirname,
    '../data/moldova/MOLDOVA_PHASE2_READINESS_REPORT.json',
  );
  const rebrandPath = path.join(
    __dirname,
    '../data/moldova/MOLDOVA_PHASE2_REBRAND_MAP.json',
  );
  const inventoryPath = path.join(
    __dirname,
    '../data/moldova/moldova_chain_inventory.json',
  );
  const transnistriaPath = path.join(
    __dirname,
    '../data/moldova/MOLDOVA_TRANSNISTRIA_AUDIT.json',
  );
  const dupPath = path.join(
    __dirname,
    '../data/moldova/moldova_duplicate_analysis.json',
  );
  const decisionPath = path.join(
    __dirname,
    '../data/moldova/phase2/independent_decision_table.json',
  );
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as StagingRow[];
  const phase1Snap = JSON.parse(fs.readFileSync(phase1SnapPath, 'utf8')) as StagingRow[];
  const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as StagingRow[];
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as Record<
    string,
    unknown
  >;
  const rebrand = JSON.parse(fs.readFileSync(rebrandPath, 'utf8')) as {
    unresolved_conflicts?: number;
  };
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8')) as {
    adrenalin_estate_active?: number;
    adrenalin_qualifies_class_a?: boolean;
    unica_sport_classification?: string;
    transnistria_policy?: string;
  };
  const transnistria = JSON.parse(fs.readFileSync(transnistriaPath, 'utf8')) as {
    policy?: string;
    separate_country_prefix?: boolean;
    adrenalin_active_clubs?: number;
    adrenalin_class_a?: boolean;
  };
  const dup = JSON.parse(fs.readFileSync(dupPath, 'utf8')) as {
    unexplained_hard_duplicates?: number;
  };
  const decisions = JSON.parse(fs.readFileSync(decisionPath, 'utf8')) as Array<{
    id: string;
    phase2_verdict: string;
  }>;
  const centersRaw = fs.readFileSync(centersPath);
  const centers = JSON.parse(centersRaw.toString('utf8')) as Array<{
    id: string;
    country?: string;
  }>;
  const sha = crypto.createHash('sha256').update(centersRaw).digest('hex');
  const stagingIds = new Set(staging.map(r => r.id));

  it('production reflects Moldova merge (11749 / MD 28); Phase 2 report freeze', () => {
    expect(centers.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(centers.filter(c => c.country === 'Moldova').length).toBe(28);
    expect(centers.filter(c => c.id.startsWith('md_')).length).toBe(28);
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(report.production_total).toBe(PHASE2_PRODUCTION_TOTAL);
    expect(report.production_sha256).toBe(PHASE2_REPORT_SHA256);
    expect(report.moldova_live).toBe(0);
  });

  it('recovers all Phase 1 candidates (73) and 13 independent IDs', () => {
    expect(phase1Snap.length).toBe(73);
    expect(report.phase1_recovered).toBe(true);
    expect(report.phase1_staged).toBe(73);
    expect(report.phase1_ready).toBe(15);
    for (const r of phase1Snap) {
      expect(stagingIds.has(r.id)).toBe(true);
    }
    for (const id of P1_INDEPENDENTS) {
      expect(stagingIds.has(id)).toBe(true);
    }
    expect(decisions.length).toBe(13);
    expect(new Set(decisions.map(d => d.id)).size).toBe(13);
  });

  it('READY IDs unique md_*; Phase 2 READY artifact purity (pre-merge snapshot)', () => {
    expect(GYM_ID_PREFIX.moldova).toBe('md_');
    const ids = ready.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ready.length).toBe(28);
    expect(report.ready_count).toBe(28);
    for (const r of ready) {
      expect(r.id).toMatch(/^md_[a-f0-9]{10}$/);
      expect(r.import_category).toBe('READY_TO_IMPORT');
      expect(r.country).toBe('Moldova');
      expect(['CHAIN_CLASS_A', 'SMALL_MARKET_INDEPENDENT']).toContain(
        r.eligibility_candidate,
      );
      expect(MOLDOVA_POSTAL_RE.test(r.postal_code)).toBe(true);
      expect(r.address && r.address.length).toBeGreaterThan(3);
      expect(r.lat).not.toBeNull();
      expect(r.lng).not.toBeNull();
      expect(isPlausibleMoldovaCoordinate(r.lat!, r.lng!)).toBe(true);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
    }
    expect(ready.some(r => r.import_category === 'EXCLUDED')).toBe(false);
    expect(ready.some(r => r.import_category === 'CLOSED')).toBe(false);
  });

  it('BIGSPORT / Energy / Telecentru / XTZ / Adrenalin estates', () => {
    const big = ready.filter(r => r.brand === 'BIGSPORT GYM');
    const energy = ready.filter(r => r.brand === 'Energy Fitness');
    const xtz = ready.filter(r => r.brand === 'XTZ Fitness');
    const adr = ready.filter(r => r.brand === 'Adrenalin');
    expect(big.length).toBe(13);
    expect(energy.length).toBe(3);
    expect(energy.some(r => /Telecentru/i.test(r.name))).toBe(true);
    expect(report.energy_telecentru_status).toBe('READY_TO_IMPORT');
    expect(xtz.length).toBe(4);
    expect(adr.length).toBe(3);
    expect(inventory.adrenalin_estate_active).toBe(3);
    expect(inventory.adrenalin_qualifies_class_a).toBe(true);
    expect(transnistria.adrenalin_active_clubs).toBe(3);
    expect(transnistria.adrenalin_class_a).toBe(true);
  });

  it('independent + municipal decisions reconciled', () => {
    const byId = Object.fromEntries(staging.map(r => [r.id, r]));
    // Live staging post-merge: approved independents are MERGED_INTO_CATALOG
    expect(['READY_TO_IMPORT', 'MERGED_INTO_CATALOG']).toContain(
      byId.md_7c20c053f6.import_category,
    ); // Heracles
    expect(['READY_TO_IMPORT', 'MERGED_INTO_CATALOG']).toContain(
      byId.md_d7324c8264.import_category,
    ); // Alexia
    expect(['READY_TO_IMPORT', 'MERGED_INTO_CATALOG']).toContain(
      byId.md_b1a848b890.import_category,
    ); // MaxGym
    expect(['READY_TO_IMPORT', 'MERGED_INTO_CATALOG']).toContain(
      byId.md_4477ca297c.import_category,
    ); // Wellness Era
    expect(byId.md_392d634c67.import_category).toBe('EXCLUDED'); // Aquaterra
    expect(byId.md_9424c5e181.import_category).toBe('EXCLUDED'); // municipal
    expect(report.needs_review_count).toBe(0);
    expect(report.needs_coordinates_count).toBe(0);
  });

  it('Unica excluded; Transnistria INCLUDE_AS_MOLDOVA_TERRITORIAL', () => {
    expect(inventory.unica_sport_classification).toBe(
      'EXCLUDED_WOMEN_ONLY_SPECIALIST',
    );
    expect(report.unica_still_excluded).toBe(true);
    expect(transnistria.policy).toBe('INCLUDE_AS_MOLDOVA_TERRITORIAL');
    expect(transnistria.separate_country_prefix).toBe(false);
    expect(report.transnistria_policy).toBe('INCLUDE_AS_MOLDOVA_TERRITORIAL');
    const tnReady = ready.filter(
      r => r.transnistria || r.city === 'Tiraspol' || r.city === 'Bender',
    );
    expect(tnReady.length).toBe(3);
  });

  it('DQ: no RO/UA READY, no mojibake, no hard dups/rebrands, no B/D gaps', () => {
    const dq = report.dq_gates as Record<string, number>;
    expect(dq.romanian_ready_outliers).toBe(0);
    expect(dq.ukrainian_ready_outliers).toBe(0);
    expect(dq.fallback_ready_coords).toBe(0);
    expect(dq.mojibake).toBe(0);
    expect(dq.unexplained_hard_duplicates).toBe(0);
    expect(dq.rebrand_unresolved).toBe(0);
    expect(dup.unexplained_hard_duplicates).toBe(0);
    expect(rebrand.unresolved_conflicts).toBe(0);
    expect(report.unexplained_b_gaps).toBe(0);
    expect(report.unexplained_d_gaps).toBe(0);
    for (const r of staging) {
      const blob = `${r.name} ${r.address} ${r.city} ${r.brand}`;
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
    }
  });

  it('eligibility breakdown + projected catalog + merge verdict', () => {
    expect(report.class_a_ready).toBe(23);
    expect(report.smi_ready).toBe(5);
    expect(report.projected_catalog_if_merged).toBe(11749);
    expect(report.crosses_12500).toBe(false);
    expect(report.global_stress_qa_required_now).toBe(false);
    expect(report.phase3_required).toBe(false);
    expect(report.merge_ready).toBe(true);
    expect(report.verdict).toBe('READY FOR MOLDOVA MERGE');
    expect(report.new_legitimate_gyms_discovered).toBe(4);
  });

  it('country/search/orphan + radii', () => {
    expect(isMoldovaCountry('Moldova')).toBe(true);
    expect(gymCountryTranslationKey('Moldova')).toBe('countries.moldova');
    expect(en.countries.moldova).toBeTruthy();
    expect(da.countries.moldova).toBeTruthy();
    expect(sv.countries.moldova).toBe('Moldavien');
    expect(nb.countries.moldova).toBeTruthy();
    const entry = buildGymSearchEntry(
      fakeGym({id: 'md_p2search', name: 'Adrenalin Orion', city: 'Tiraspol'}),
    );
    expect(entry.haystack).toMatch(/moldova|tiraspol/i);
    const stub = resolveGymOrStub('md_nonexistent_test');
    expect(String((stub as {region?: string}).region || '')).toMatch(/Moldova/i);
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
  });
});
