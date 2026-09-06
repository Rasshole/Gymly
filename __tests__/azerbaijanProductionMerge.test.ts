/**
 * Azerbaijan production merge — post-merge catalog integrity (+46 greenfield).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleAzerbaijanCoordinate,
  AZERBAIJAN_POSTAL_RE,
  isAzerbaijanCountry,
} from '../src/utils/gymCountry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {normalizeGymSearchValue} from '../src/services/gymSearch/gymSearchNormalize';
import {searchGyms} from '../src/services/gymSearch/gymSearchEngine';
import {findNearestGym} from '../src/utils/nearestGym';
import {resolveGymOrStub} from '../src/utils/gymDisplay';
import en from '../src/i18n/translations/en';
import type {DanishGym} from '../src/data/danishGyms';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|\uFFFD|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;

const EXPECTED_TOTAL = 12385;
const EXPECTED_AZERBAIJAN = 46;
const EXPECTED_AM = 36;
const EXPECTED_GE = 25;
const EXPECTED_TR = 198;
const EXPECTED_BY = 46;
const EXPECTED_UA = 105;
const EXPECTED_MT = 24;
const EXPECTED_BYTES_BEFORE = 3844273;
const PRE_MERGE_SHA =
  '7ddc9977a7273668b3fcc6edb68b9a490b873e478bccd1e51b9f31710a2585e7';

const CLASS_A_COUNTS: Record<string, number> = {
  'FS Club Network': 3,
};

const CURATED_COUNTS: Record<string, number> = {
  'World Class Azerbaijan': 1,
  '1st Fitness': 1,
  FitClub: 1,
  'Fit Way': 1,
  Pulse: 1,
  "Gold's Gym": 1,
  'Sport Life': 1,
  'Dream Body': 1,
};

const EXPECTED_CITY_COUNTS: Record<string, number> = {
  Baku: 21,
  Sumqayit: 12,
  Ganja: 8,
  Mingachevir: 2,
  Lankaran: 2,
  Masazır: 1,
};

const PRIOR_COUNTS: Record<string, number> = {
  Armenia: 36,
  Georgia: 25,
  Turkey: 198,
  Belarus: 46,
  Ukraine: 105,
  Malta: 24,
  Lithuania: 61,
  Latvia: 33,
  Estonia: 69,
  Slovenia: 33,
  Croatia: 80,
  Serbia: 63,
  Kosovo: 18,
  Albania: 9,
  'Bosnia and Herzegovina': 31,
  'North Macedonia': 25,
  Montenegro: 26,
  Moldova: 28,
  'San Marino': 6,
  Monaco: 4,
  Andorra: 12,
  Liechtenstein: 7,
  Iceland: 27,
};

function toGym(c: (typeof ALL_GYM_CENTERS)[number]): DanishGym {
  return {
    id: c.id,
    name: c.name,
    city: c.city,
    address: c.address,
    postalCode: c.postal_code,
    country: c.country,
    region: 'Azerbaijan',
    latitude: c.lat!,
    longitude: c.lng!,
    brand: c.brand,
    _center: c as never,
  };
}

describe('Azerbaijan production merge (+46 greenfield)', () => {
  const dataDir = path.join(__dirname, '../data/azerbaijan');
  const centersPath = path.join(__dirname, '../src/data/centers.json');
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
  const bytes = fs.statSync(centersPath).size;

  const report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_PRODUCTION_MERGE_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const approved = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_APPROVED_FOR_PRODUCTION.json'), 'utf8'),
  ) as Array<{id: string; brand: string; city: string; name: string; address: string}>;
  const idem = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_MERGE_IDEMPOTENCY.json'), 'utf8'),
  ) as {idempotent: boolean; second_run: {insertions: number}};
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_MERGE_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {
    hard_duplicate_conflicts: number;
    azerbaijani_transliteration_duplicate_conflicts: number;
  };
  const brandInv = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_MERGE_OPERATOR_INVENTORY.json'), 'utf8'),
  ) as {production: Record<string, number>; total: number; other_approved: number};
  const geoInv = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_MERGE_GEOGRAPHY_INVENTORY.json'), 'utf8'),
  ) as {production_cities: Record<string, number>};
  const shaBefore = fs
    .readFileSync(path.join(dataDir, 'AZERBAIJAN_MERGE_SHA_BEFORE.txt'), 'utf8')
    .trim();
  const shaAfter = fs
    .readFileSync(path.join(dataDir, 'AZERBAIJAN_MERGE_SHA_AFTER.txt'), 'utf8')
    .trim();
  const phase2Report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_PHASE2_READINESS_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;

  const azerbaijan = ALL_GYM_CENTERS.filter(c => c.id.startsWith('az_'));

  test('post total = 12385 / Azerbaijan = 46 / SHA changed from pre-merge', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(azerbaijan.length).toBe(EXPECTED_AZERBAIJAN);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('am_')).length).toBe(EXPECTED_AM);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ge_')).length).toBe(EXPECTED_GE);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('tr_')).length).toBe(EXPECTED_TR);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('by_')).length).toBe(EXPECTED_BY);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ua_')).length).toBe(EXPECTED_UA);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('mt_')).length).toBe(EXPECTED_MT);
    expect(shaBefore).toBe(PRE_MERGE_SHA);
    expect(sha).toBe(shaAfter);
    expect(sha).not.toBe(PRE_MERGE_SHA);
    expect(report.production_bytes_before).toBe(EXPECTED_BYTES_BEFORE);
    expect(bytes).toBeGreaterThan(EXPECTED_BYTES_BEFORE);
  });

  test('approved = 46 and matches production Azerbaijan IDs exactly', () => {
    expect(approved.length).toBe(46);
    const approvedIds = new Set(approved.map(r => r.id));
    const prodIds = new Set(azerbaijan.map(r => r.id));
    expect(approvedIds.size).toBe(46);
    expect(prodIds.size).toBe(46);
    for (const id of approvedIds) {
      expect(prodIds.has(id)).toBe(true);
    }
  });

  test('Phase 2 provenance — 434 recovered, NR/NC = 0, estate gaps = 0', () => {
    expect(phase2Report.phase1_rows_recovered).toBe(434);
    expect(phase2Report.phase1_nr_resolved).toBe(406);
    expect(phase2Report.needs_review).toBe(0);
    expect(phase2Report.needs_coordinates).toBe(0);
    expect(phase2Report.final_approved_azerbaijan).toBe(46);
    expect(phase2Report.class_a_estate_gaps).toBe(0);
    expect(phase2Report.missed_class_a_estate_gaps).toBe(0);
    expect(phase2Report.material_d_gaps_count).toBe(0);
    expect(phase2Report.class_a_semantics_correct).toBe('YES');
    expect(phase2Report.verdict).toBe('READY FOR AZERBAIJAN PRODUCTION MERGE');
  });

  test('Class A brand inventory exact — FS Club Network 3; curated operators ×1 NOT Class A', () => {
    const byBrand = azerbaijan.reduce<Record<string, number>>((acc, r) => {
      acc[r.brand] = (acc[r.brand] ?? 0) + 1;
      return acc;
    }, {});
    for (const [brand, n] of Object.entries(CLASS_A_COUNTS)) {
      expect(byBrand[brand]).toBe(n);
    }
    for (const [brand, n] of Object.entries(CURATED_COUNTS)) {
      expect(byBrand[brand]).toBe(n);
    }
    expect(Object.values(byBrand).reduce((a, b) => a + b, 0)).toBe(46);
    expect(brandInv.total).toBe(46);
    expect(brandInv.other_approved).toBe(35);
  });

  test('merge delta exact — 46 insertions, 0 updates, 0 removals', () => {
    const delta = report.delta as {
      insertions: number;
      updates: number;
      removals: number;
      total_before: number;
      total_after: number;
    };
    expect(delta.insertions).toBe(46);
    expect(delta.updates).toBe(0);
    expect(delta.removals).toBe(0);
    expect(delta.total_before).toBe(12339);
    expect(delta.total_after).toBe(12385);
  });

  test('all 46 rows production-grade — az_ IDs, postcodes, coords, no leakage', () => {
    const exIds = new Set(
      (
        JSON.parse(
          fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_PHASE2_EXCLUDED.json'), 'utf8'),
        ) as Array<{id: string}>
      ).map(r => r.id),
    );
    const nrIds = new Set(
      (
        JSON.parse(
          fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_PHASE2_NEEDS_REVIEW.json'), 'utf8'),
        ) as Array<{id: string}>
      ).map(r => r.id),
    );
    for (const r of azerbaijan) {
      expect(r.id).toMatch(/^az_[a-f0-9]{10}$/);
      expect(r.country).toBe('Azerbaijan');
      expect(AZERBAIJAN_POSTAL_RE.test(r.postal_code)).toBe(true);
      expect(isPlausibleAzerbaijanCoordinate(r.lat!, r.lng!)).toBe(true);
      expect(r.is_active).not.toBe(false);
      expect(exIds.has(r.id)).toBe(false);
      expect(nrIds.has(r.id)).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(String(r.name).startsWith('az_')).toBe(false);
      expect(String(r.city).toLowerCase()).not.toMatch(/nakhchivan|naxcivan|naxçıvan/);
    }
  });

  test('city inventory — Baku 21, Sumqayit 12, Ganja 8, regional cities exact', () => {
    for (const [city, n] of Object.entries(EXPECTED_CITY_COUNTS)) {
      expect(geoInv.production_cities[city]).toBe(n);
    }
    expect(Object.values(geoInv.production_cities).reduce((a, b) => a + b, 0)).toBe(46);
  });

  test('Nakhchivan and conflict-area production = 0', () => {
    const nak = azerbaijan.filter(r =>
      /nakhchivan|naxcivan|naxçıvan/i.test(`${r.city} ${r.name}`),
    );
    expect(nak.length).toBe(0);
    expect(
      azerbaijan.filter(r => (r as {conflict_region?: boolean}).conflict_region).length,
    ).toBe(0);
  });

  test('prior-country counts unchanged', () => {
    for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
      expect(ALL_GYM_CENTERS.filter(c => c.country === country).length).toBe(n);
    }
  });

  test('country resolution / search / check-in / idempotency / scale', () => {
    expect(isAzerbaijanCountry('Azerbaijan')).toBe(true);
    expect(gymCountryTranslationKey('Azerbaijan')).toBe('countries.azerbaijan');
    expect(en.countries.azerbaijan).toBeTruthy();
    expect(GYM_ID_PREFIX.azerbaijan).toBe('az_');

    expect(searchGyms('Azerbaijan').some(h => h.gym.country === 'Azerbaijan')).toBe(true);
    expect(searchGyms('Azərbaycan').some(h => h.gym.country === 'Azerbaijan')).toBe(true);
    expect(searchGyms('Baku').some(h => h.gym.country === 'Azerbaijan')).toBe(true);
    expect(searchGyms('Bakı').some(h => h.gym.country === 'Azerbaijan')).toBe(true);
    expect(searchGyms('Ganja').some(h => h.gym.country === 'Azerbaijan')).toBe(true);
    expect(searchGyms('Sumqayit').some(h => h.gym.country === 'Azerbaijan')).toBe(true);
    expect(searchGyms('FS Club Network').some(h => h.gym.country === 'Azerbaijan')).toBe(true);

    const probe = azerbaijan[0];
    const gym = toGym(probe);
    const resolved = resolveGymOrStub(probe.id);
    expect(resolved?.country).toBe('Azerbaijan');
    expect(normalizeGymSearchValue(resolved?.name ?? '')).not.toBe(probe.id);

    const near = findNearestGym(40.4093, 49.8671, [gym]);
    expect(near?.country).toBe('Azerbaijan');

    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);

    expect(idem.idempotent).toBe(true);
    expect(idem.second_run.insertions).toBe(0);
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(dup.azerbaijani_transliteration_duplicate_conflicts).toBe(0);
    expect(report.verdict).toBe('AZERBAIJAN MERGE COMPLETE — WAITING FOR QA');
    expect(report.projected_catalog_total).toBe(12385);
    expect(report.remaining_headroom).toBe(115);
    expect(report.crosses_12500).toBe(false);
    expect(report.global_stress_qa_required).toBe(false);
    expect(report.global_stress_qa_run).toBe(false);
    expect(report.architecture).toBe('KEEP CLIENT-SIDE');
  });
});
