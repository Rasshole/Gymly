/**
 * Serbia Phase 2 staging — all NR/NC resolved; READY merge candidate set.
 * Production centers.json must remain frozen. No merge in Phase 2.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleSerbiaCoordinate,
  SERBIA_POSTAL_RE,
  isSerbiaCountry,
  isKosovoCountry,
  isPlausibleKosovoCoordinate,
} from '../src/utils/gymCountry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {buildGymSearchEntry} from '../src/services/gymSearch/gymSearchIndex';
import {resolveGymOrStub} from '../src/utils/gymDisplay';
import en from '../src/i18n/translations/en';
import type {DanishGym} from '../src/data/danishGyms';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE =
  /fallback|centroid|city_center|postcode_center|capital.?fallback|city.?approx|directory_.*_premises/i;

const CURRENT_PRODUCTION_TOTAL = 11921;
const LIVE_SHA =
  'f32fd0af4b1efe26d3da5676264b9a08bdc47ed6bd0a472b8b3278578896f5c5';
const PHASE2_REPORT_TOTAL = 11858;
const PHASE2_REPORT_SHA = LIVE_SHA;

const P1_UNRESOLVED = new Set([
  'rs_f8562f5e78',
  'rs_93ddb58ab3',
  'rs_5c79da95f6',
  'rs_825b0335b1',
  'rs_a47abd9ea2',
  'rs_9596b790d8',
  'rs_efbb875eff',
  'rs_f955330fd9',
  'rs_064e4634c1',
  'rs_8b20b0ed95',
  'rs_037d24163a',
  'rs_763ca61d6d',
  'rs_a3cad43398',
  'rs_d0fec55354',
  'rs_f335c0079e',
  'rs_a62cccd3b8',
  'rs_094f59b42e',
  'rs_94a4d4c0b0',
  'rs_51ba98e5d2',
  'rs_4d85bf1ecc',
  'rs_74d93260bd',
  'rs_afae4b6c7d',
  'rs_a367065cde',
  'rs_b1e6db43f7',
  'rs_a4fee2be29',
  'rs_e8816f6865',
  'rs_c9b36210af',
  'rs_eb6b483124',
  'rs_6811175dcc',
  'rs_7bef7e159b',
  'rs_12604c3213',
  'rs_5351db6c9a',
  'rs_5394153402',
  'rs_ac2408e2eb',
  'rs_ae567c47e8',
  'rs_f0538b1a73',
  'rs_ab6da833fd',
  'rs_ce93e07316',
  'rs_46c05a109d',
  'rs_45e1837d4e',
]);

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
  eligibility_path?: string;
  eligibility_candidate?: string;
  phase2_classification?: string;
  foreign_probe?: boolean;
  territory?: string;
  hotel_spa_risk?: boolean;
  phase2_new?: boolean;
};

function fakeGym(partial: Partial<DanishGym> & {id: string}): DanishGym {
  return {
    id: partial.id,
    name: partial.name ?? 'Probe Gym',
    city: partial.city ?? 'Belgrade',
    address: partial.address ?? 'Knez Mihailova 1',
    postalCode: partial.postalCode ?? '11000',
    country: 'Serbia',
    region: 'Serbia',
    latitude: partial.latitude ?? 44.8176,
    longitude: partial.longitude ?? 20.4633,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe Gym',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'Knez Mihailova 1',
      postal_code: partial.postalCode ?? '11000',
      city: partial.city ?? 'Belgrade',
      country: 'Serbia',
      lat: partial.latitude ?? 44.8176,
      lng: partial.longitude ?? 20.4633,
      is_active: true,
      is_coming_soon: false,
    },
  } as DanishGym;
}

describe('Serbia Phase 2 staging (no production merge)', () => {
  const dataDir = path.join(__dirname, '../data/serbia');
  const centersPath = path.join(__dirname, '../src/data/centers.json');
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');

  const p1 = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'phase2/phase1_staging_snapshot.json'), 'utf8'),
  ) as Row[];
  const staging = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'serbia_centers_staging.json'), 'utf8'),
  ) as Row[];
  const ready = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SERBIA_PHASE2_READY_TO_IMPORT.json'), 'utf8'),
  ) as Row[];
  const report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SERBIA_PHASE2_READINESS_REPORT.json'), 'utf8'),
  ) as Record<string, // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any>;
  const decisions = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'phase2/decisions.json'), 'utf8'),
  ) as {decisions: Array<Record<string, string>>};
  const rebrand = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SERBIA_PHASE2_REBRAND_MAP.json'), 'utf8'),
  ) as {unresolved_conflicts?: number};
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SERBIA_PHASE2_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {hard_duplicate_conflicts?: number};
  const chain = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SERBIA_PHASE2_CHAIN_INVENTORY.json'), 'utf8'),
  ) as Record<string, // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any>;
  const cross = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SERBIA_PHASE2_CROSS_BORDER_AUDIT.json'), 'utf8'),
  ) as Record<string, number>;
  const geocode = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SERBIA_PHASE2_GEOCODE_REVIEW.json'), 'utf8'),
  ) as Record<string, number>;

  test('Phase 2 report frozen (11858 / RS 0); live catalog 11921 post-merge', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    const liveSha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
    expect(liveSha).not.toBe(PHASE2_REPORT_SHA);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Serbia').length).toBe(63);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('rs_')).length).toBe(63);
    expect(report.production_total).toBe(PHASE2_REPORT_TOTAL);
    expect(report.production_sha256).toBe(PHASE2_REPORT_SHA);
    expect(report.serbia_live).toBe(0);
    expect(report.rs_prefix_live).toBe(0);
    expect(GYM_ID_PREFIX.serbia).toBe('rs_');
  });

  test('prior-country regressions intact including Kosovo 18', () => {
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Kosovo').length).toBe(18);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Albania').length).toBe(9);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Bosnia and Herzegovina').length).toBe(
      31,
    );
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'North Macedonia').length).toBe(25);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Montenegro').length).toBe(26);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Moldova').length).toBe(28);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'San Marino').length).toBe(6);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Monaco').length).toBe(4);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Andorra').length).toBe(12);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Liechtenstein').length).toBe(7);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Iceland').length).toBe(27);
  });

  test('Phase 1 recovered exactly; all 126 IDs preserved', () => {
    expect(report.phase1_recovered).toBe(true);
    expect(p1.length).toBe(126);
    expect(report.phase1_staging_total).toBe(126);
    expect(report.phase1_ids_preserved).toBe('126/126');
    expect(report.phase1_unresolved_recovered).toBe(40);
    const p1Ids = new Set(p1.map(r => r.id));
    for (const id of P1_UNRESOLVED) {
      expect(p1Ids.has(id)).toBe(true);
      expect(staging.some(r => r.id === id)).toBe(true);
    }
    for (const id of p1Ids) {
      expect(staging.some(r => r.id === id)).toBe(true);
    }
  });

  test('NR=0 NC=0; READY=63; Class A=59 SMI=4; merge-ready verdict', () => {
    expect(report.needs_review).toBe(0);
    expect(report.needs_coordinates).toBe(0);
    expect(staging.filter(r => r.import_category === 'NEEDS_REVIEW').length).toBe(0);
    expect(staging.filter(r => r.import_category === 'NEEDS_COORDINATES').length).toBe(0);
    expect(ready.length).toBe(63);
    expect(report.ready_to_import).toBe(63);
    expect(report.chain_class_a_ready).toBe(59);
    expect(report.small_market_independent_ready).toBe(4);
    expect(report.qualifying_class_a_chains).toBe(4);
    expect(report.phase1_promoted_to_ready).toBe(0);
    expect(report.phase1_excluded).toBe(40);
    expect(report.new_legitimate_gyms_discovered).toBe(7);
    expect(report.new_class_a_chains_found).toBe(1);
    expect(report.new_class_a_ready_locations).toBe(3);
    expect(report.market).toBe('MIXED_CHAIN_INDEPENDENT');
    expect(report.verdict).toBe('READY FOR SERBIA MERGE');
    expect(report.merge_ready).toBe(true);
    expect(report.phase3_required).toBe(false);
  });

  test('all 40 original unresolved terminally decided', () => {
    expect(decisions.decisions.length).toBe(40);
    for (const d of decisions.decisions) {
      expect(P1_UNRESOLVED.has(d.id)).toBe(true);
      expect(['READY_TO_IMPORT', 'EXCLUDED', 'CLOSED']).toContain(d.final_status);
    }
    const excluded = decisions.decisions.filter(d => d.final_status === 'EXCLUDED').length;
    expect(excluded).toBe(40);
  });

  test('Class A estates reconciled: Ahilej 33, Non Stop 16, Mega Gym 7, Gym Town 3', () => {
    expect(chain.operators?.Ahilej?.class_a).toBe(true);
    expect(chain.operators?.Ahilej?.ready).toBe(33);
    expect(chain.operators?.Ahilej?.estate_complete).toBe(true);
    expect(chain.operators?.['Non Stop Fitness']?.ready).toBe(16);
    expect(chain.operators?.['Non Stop Fitness']?.estate_complete).toBe(true);
    expect(chain.operators?.['Mega Gym']?.ready).toBe(7);
    expect(chain.operators?.['Mega Gym']?.estate_complete).toBe(true);
    expect(chain.operators?.['Gym Town']?.ready).toBe(3);
    expect(chain.operators?.['Gym Town']?.class_a).toBe(true);
    expect(chain.operators?.['Gym Town']?.estate_complete).toBe(true);
    expect(chain.chain_estate_gaps).toBe(0);
    expect(ready.filter(r => r.brand === 'Ahilej').length).toBe(33);
    expect(ready.filter(r => r.brand === 'Non Stop Fitness').length).toBe(16);
    expect(ready.filter(r => r.brand === 'Mega Gym').length).toBe(7);
    expect(ready.filter(r => r.brand === 'Gym Town').length).toBe(3);
  });

  test('READY purity: rs_*, Serbia, postcodes, coords, no fallback/mojibake', () => {
    expect(new Set(ready.map(r => r.id)).size).toBe(63);
    for (const r of ready) {
      expect(r.id).toMatch(/^rs_[a-f0-9]{10}$/);
      expect(r.country).toBe('Serbia');
      expect(isSerbiaCountry(r.country)).toBe(true);
      expect(isKosovoCountry(r.country)).toBe(false);
      expect(SERBIA_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(r.lat).not.toBeNull();
      expect(r.lng).not.toBeNull();
      expect(isPlausibleSerbiaCoordinate(r.lat!, r.lng!)).toBe(true);
      expect(isPlausibleKosovoCoordinate(r.lat!, r.lng!)).toBe(false);
      expect(FALLBACK_RE.test(String(r.coord_source || ''))).toBe(false);
      expect(['CHAIN_CLASS_A', 'SMALL_MARKET_INDEPENDENT']).toContain(r.eligibility_path);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city} ${r.brand}`)).toBe(false);
      expect(String(r.name || '')).not.toMatch(/^rs_/);
    }
  });

  test('leakage gates: hotel/spa, specialist, institutional, Kosovo', () => {
    expect(report.leakage.hotel_spa_ready).toBe(0);
    expect(report.leakage.specialist_ready).toBe(0);
    expect(report.leakage.institutional_ready).toBe(0);
    expect(cross.kosovo_ready_outliers).toBe(0);
    expect(cross.mitrovica_identity_collisions).toBe(0);
    expect(cross.serbia_presevo_bujanovac_country_errors).toBe(0);
    expect(cross.bosnia_ready).toBe(0);
    expect(cross.montenegro_ready).toBe(0);
    expect(cross.mk_ready).toBe(0);
    expect(cross.bg_ready).toBe(0);
    expect(cross.romania_ready).toBe(0);
    expect(cross.hungary_ready).toBe(0);
    expect(cross.croatia_ready).toBe(0);
  });

  test('municipal candidates terminal; geocode quality; staging merged post-merge', () => {
    expect(staging.find(r => r.id === 'rs_46c05a109d')?.import_category).toBe('EXCLUDED');
    expect(staging.find(r => r.id === 'rs_45e1837d4e')?.import_category).toBe('EXCLUDED');
    expect(staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG').length).toBe(63);
    expect(staging.filter(r => r.import_category === 'READY_TO_IMPORT').length).toBe(0);
    expect(geocode.fallback_ready).toBe(0);
    expect(geocode.centroid_ready).toBe(0);
    expect(geocode.invalid_postcodes).toBe(0);
    expect(geocode.missing_coords).toBe(0);
  });

  test('city coverage terminal; B/D gaps 0; duplicates/rebrands', () => {
    expect(report.unexplained_b_gaps).toBe(0);
    expect(report.unexplained_d_gaps).toBe(0);
    expect(report.city_coverage.Belgrade).toBe('READY_present');
    expect(report.city_coverage['Novi Sad']).toBe('READY_present');
    expect(report.city_coverage['Niš']).toBe('READY_present');
    expect(dup.hard_duplicate_conflicts ?? report.data_quality.hard_duplicates).toBe(0);
    expect(report.data_quality.multilingual_duplicates).toBe(0);
    expect(rebrand.unresolved_conflicts ?? 0).toBe(0);
    expect(report.data_quality.legacy_ready_leakage).toBe(0);
  });

  test('projected catalog; check-in 200 m; Phase 2 SHA artifacts; orphan rs_*', () => {
    expect(report.projected_catalog).toBe(11921);
    expect(report.crosses_12500).toBe(false);
    expect(report.global_stress_qa_required_after_merge).toBe(false);
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.serbia_specific_radius_override).toBe(0);
    const shaBefore = fs
      .readFileSync(path.join(dataDir, 'phase2/PHASE2_SHA_BEFORE.txt'), 'utf8')
      .trim();
    const shaAfter = fs
      .readFileSync(path.join(dataDir, 'phase2/PHASE2_SHA_AFTER.txt'), 'utf8')
      .trim();
    expect(shaBefore).toBe(PHASE2_REPORT_SHA);
    expect(shaAfter).toBe(PHASE2_REPORT_SHA);

    expect(gymCountryTranslationKey('Serbia')).toBe('countries.serbia');
    expect(en.countries.serbia).toBe('Serbia');
    const stub = resolveGymOrStub('rs_nonexistent_test');
    expect(String((stub as {region?: string}).region || '')).toMatch(/Serbia/i);

    const entry = buildGymSearchEntry(
      fakeGym({
        id: 'rs_test_probe',
        name: 'Sky Experience Belgrade',
        city: 'Belgrade',
        brand: 'Sky Experience',
      }),
    );
    expect(entry.haystack.toLowerCase()).toMatch(/serbia|beograd|srbija/i);
    expect(staging.length).toBe(133);
    expect(report.total_staging).toBe(133);
  });
});
