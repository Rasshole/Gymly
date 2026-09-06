/**
 * Moldova production merge safety — post-merge catalog integrity.
 * Does NOT run full Moldova Production QA.
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
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {resolveGymOrStub} from '../src/utils/gymDisplay';
import {buildGymSearchEntry} from '../src/services/gymSearch/gymSearchIndex';
import type {DanishGym} from '../src/data/danishGyms';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|ChiÈ|BÄƒl/;

const EXPECTED_TOTAL = 11921; // live after Montenegro merge
const MD_MERGE_AFTER_TOTAL = 11749; // frozen Moldova merge report
const EXPECTED_MD = 28;
const PRE_MERGE_SHA =
  '86c6c63b17b1bcce9cd69071f2ff7dc7cc97e7440c921b9001bc88a5a07adcd6';
const POST_MERGE_SHA =
  '753f4651f4a6b75576165c61ab0ef604aff41575a90118fc96956bc40094aec8';
const LIVE_CATALOG_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d'; // frozen Moldova merge report
const LIVE_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';

const EXPECTED_BRANDS: Record<string, number> = {
  'BIGSPORT GYM': 13,
  'Energy Fitness': 3,
  'XTZ Fitness': 4,
  Adrenalin: 3,
  Heracles: 1,
  'Alexia Fitness & Wellness': 1,
  MaxGym: 1,
  'Wellness Era': 1,
  Sportmaster: 1,
};

function fakeGym(partial: Partial<DanishGym> & {id: string}): DanishGym {
  return {
    id: partial.id,
    name: partial.name ?? 'Probe',
    city: partial.city ?? 'Chișinău',
    address: partial.address ?? 'str. Test 1',
    postalCode: partial.postalCode ?? 'MD-2001',
    country: 'Moldova',
    region: 'Moldova',
    latitude: partial.latitude ?? 47.01,
    longitude: partial.longitude ?? 28.86,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'str. Test 1',
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

describe('Moldova merge safety', () => {
  const moldova = ALL_GYM_CENTERS.filter(c => c.country === 'Moldova');
  const reportPath = path.join(__dirname, '../data/moldova/MOLDOVA_MERGE_REPORT.json');
  const approvedPath = path.join(
    __dirname,
    '../data/moldova/MOLDOVA_APPROVED_FOR_MERGE.json',
  );
  const stagingPath = path.join(
    __dirname,
    '../data/moldova/moldova_centers_staging.json',
  );
  const readyPath = path.join(
    __dirname,
    '../data/moldova/MOLDOVA_PHASE2_READY_TO_IMPORT.json',
  );
  const idemPath = path.join(
    __dirname,
    '../data/moldova/MOLDOVA_MERGE_IDEMPOTENCY.json',
  );
  const dupPath = path.join(
    __dirname,
    '../data/moldova/MOLDOVA_MERGE_DUPLICATE_ANALYSIS.json',
  );
  const tnPath = path.join(
    __dirname,
    '../data/moldova/MOLDOVA_TRANSNISTRIA_AUDIT.json',
  );
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >;
  const approved = JSON.parse(fs.readFileSync(approvedPath, 'utf8')) as Array<{
    id: string;
    eligibility_path?: string;
    brand: string;
    name: string;
    address: string;
    postal_code: string;
    city: string;
    lat: number;
    lng: number;
  }>;
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as Array<{
    id: string;
    import_category: string;
    brand: string;
    name: string;
  }>;
  const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as Array<{id: string}>;
  const idem = JSON.parse(fs.readFileSync(idemPath, 'utf8')) as {
    second_run_insertions: number;
    final_catalog: number;
    moldova: number;
    result: string;
  };
  const dup = JSON.parse(fs.readFileSync(dupPath, 'utf8')) as {
    unexplained_hard_duplicates?: number;
  };
  const tn = JSON.parse(fs.readFileSync(tnPath, 'utf8')) as {policy?: string};

  test('catalog 11831; Moldova 28; live SHA; merge-report SHA frozen', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(moldova.length).toBe(EXPECTED_MD);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('md_')).length).toBe(EXPECTED_MD);
    const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
    expect(sha).toBe(LIVE_SHA);
    expect(report.pre_merge_sha256).toBe(PRE_MERGE_SHA);
    expect(report.post_merge_sha256).toBe(POST_MERGE_SHA);
    expect(report.before.total).toBe(11721);
    expect(report.before.moldova).toBe(0);
    expect(report.inserted).toBe(28);
    expect(report.withheld).toBe(0);
    expect(report.after.total).toBe(MD_MERGE_AFTER_TOTAL);
    expect(report.after.moldova).toBe(EXPECTED_MD);
    expect(report.after.san_marino).toBe(6);
    expect(report.after.monaco).toBe(4);
    expect(report.after.andorra).toBe(12);
    expect(report.after.liechtenstein).toBe(7);
    expect(report.after.iceland).toBe(27);
    expect(report.verdict).toMatch(/MERGE COMPLETE/i);
  });

  test('eligibility 23 Class A + 5 SMI; brand breakdown', () => {
    expect(report.eligibility_breakdown?.CHAIN_CLASS_A).toBe(23);
    expect(report.eligibility_breakdown?.SMALL_MARKET_INDEPENDENT).toBe(5);
    expect(report.eligibility_breakdown?.TOTAL).toBe(28);
    const byElig = {CHAIN_CLASS_A: 0, SMALL_MARKET_INDEPENDENT: 0};
    for (const a of approved) {
      byElig[a.eligibility_path as keyof typeof byElig]++;
    }
    expect(byElig.CHAIN_CLASS_A).toBe(23);
    expect(byElig.SMALL_MARKET_INDEPENDENT).toBe(5);
    for (const [brand, n] of Object.entries(EXPECTED_BRANDS)) {
      expect(report.brand_breakdown?.[brand]).toBe(n);
      expect(moldova.filter(c => c.brand === brand).length).toBe(n);
    }
  });

  test('ID-set equality: Phase2 READY == approved == production == MERGED', () => {
    const prodIds = new Set(moldova.map(c => c.id));
    const readyIds = new Set(ready.map(r => r.id));
    const approvedIds = new Set(approved.map(r => r.id));
    const mergedIds = new Set(
      staging
        .filter(r => r.import_category === 'MERGED_INTO_CATALOG')
        .map(r => r.id),
    );
    expect(prodIds).toEqual(readyIds);
    expect(prodIds).toEqual(approvedIds);
    expect(prodIds).toEqual(mergedIds);
    expect(prodIds.size).toBe(28);
    expect(report.staging_reconciliation?.reconciliation).toBe('28 == 28 == 28 == 28');
    expect(report.staging_reconciliation?.metadata_drift).toBe('NONE');
  });

  test('Energy Telecentru premises + Adrenalin Transnistria policy', () => {
    const tele = moldova.find(
      c => c.brand === 'Energy Fitness' && /Telecentru/i.test(c.name || ''),
    );
    expect(tele).toBeTruthy();
    expect(tele!.lat).toBe(46.994935);
    expect(tele!.lng).toBe(28.832949);
    expect(String(tele!.address)).toMatch(/29\/5/);
    expect(moldova.filter(c => c.brand === 'Energy Fitness').length).toBe(3);

    expect(tn.policy).toBe('INCLUDE_AS_MOLDOVA_TERRITORIAL');
    expect(report.transnistria_policy).toBe('INCLUDE_AS_MOLDOVA_TERRITORIAL');
    expect(report.separate_transnistria_prefix).toBe(false);
    expect(GYM_ID_PREFIX.moldova).toBe('md_');
    const adr = moldova.filter(c => c.brand === 'Adrenalin');
    expect(adr.length).toBe(3);
    expect(adr.every(c => c.country === 'Moldova')).toBe(true);
    expect(adr.every(c => c.id.startsWith('md_'))).toBe(true);
    expect(moldova.some(c => /Bender Shevchenko/i.test(c.name || ''))).toBe(false);
  });

  test('independents live; exclusions absent; DQ gates', () => {
    expect(moldova.filter(c => c.brand === 'Heracles').length).toBe(1);
    expect(moldova.filter(c => c.brand === 'Alexia Fitness & Wellness').length).toBe(1);
    expect(moldova.filter(c => c.brand === 'MaxGym').length).toBe(1);
    expect(moldova.filter(c => c.brand === 'Wellness Era').length).toBe(1);
    expect(moldova.filter(c => c.brand === 'Sportmaster').length).toBe(1);
    expect(moldova.filter(c => /Aquaterra/i.test(c.brand || '')).length).toBe(0);
    expect(moldova.filter(c => /Unica/i.test(c.brand || '')).length).toBe(0);
    expect(moldova.filter(c => /EcoSport/i.test(c.brand || '')).length).toBe(0);
    expect(moldova.filter(c => /municipal/i.test(c.name || '')).length).toBe(0);
    expect(report.excluded_leakage?.result).toBe('PASS');
    expect(report.territorial_safety?.romanian_outliers).toBe(0);
    expect(report.territorial_safety?.ukrainian_outliers).toBe(0);
    expect(dup.unexplained_hard_duplicates).toBe(0);
    expect(report.unexplained_hard_duplicates).toBe(0);
    expect(report.rebrand_validation?.unresolved_conflicts).toBe(0);

    for (const c of moldova) {
      expect(c.id).toMatch(/^md_[a-f0-9]{10}$/);
      expect(isMoldovaCountry(c.country)).toBe(true);
      expect(MOLDOVA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(isPlausibleMoldovaCoordinate(c.lat!, c.lng!)).toBe(true);
      expect(MOJIBAKE_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
      expect(String(c.address || '').trim().length).toBeGreaterThan(3);
    }
  });

  test('idempotency, scale, check-in, country/search smoke', () => {
    expect(idem.second_run_insertions).toBe(0);
    expect(idem.final_catalog).toBe(MD_MERGE_AFTER_TOTAL);
    expect(idem.moldova).toBe(28);
    expect(idem.result).toBe('PASS');
    expect(report.global_scale?.crossed_12500).toBe(false);
    expect(report.global_scale?.global_stress_qa_required).toBe(false);
    expect(report.performance?.architecture).toBe('KEEP CLIENT-SIDE');
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.check_in?.allow_199m).toBe(true);
    expect(report.check_in?.allow_200m).toBe(true);
    expect(report.check_in?.block_201m).toBe(true);

    expect(gymCountryTranslationKey('Moldova')).toBe('countries.moldova');
    const stub = resolveGymOrStub('md_nonexistent_test');
    expect(String((stub as {region?: string}).region || '')).toMatch(/Moldova/i);
    const entry = buildGymSearchEntry(
      fakeGym({
        id: moldova[0].id,
        name: moldova[0].name,
        city: moldova[0].city,
        brand: moldova[0].brand,
      }),
    );
    expect(entry.haystack).toMatch(/moldova/i);
    expect(String(moldova[0].name)).not.toMatch(/^md_/);

    const ids = ALL_GYM_CENTERS.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
