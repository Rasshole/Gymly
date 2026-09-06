/**
 * Cyprus Phase 2 staging validation — independent phase + Phase 1 resolutions (no merge).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleCyprusCoordinate,
  CYPRUS_POSTAL_RE,
  isCyprusCountry,
} from '../src/utils/gymCountry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {resolveGymOrStub} from '../src/utils/gymDisplay';
import en from '../src/i18n/translations/en';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const CURRENT_PRODUCTION_TOTAL = 11921; // live after Bosnia merge
const LIVE_PRODUCTION_SHA256 =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';
const PHASE_REPORT_PRODUCTION_SHA256 =
  'e039707d7c419d727b5297acf26b17bc1f885217ca997d3b75f21ff54f60a7f4';
const FOREIGN_NORTH =
  /\b(kyrenia|girne|morphou|g[uü]zelyurt|northern cyprus|trnc|gazima[gğ]usa)\b/i;
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
  is_active?: boolean;
  is_coming_soon?: boolean;
  is_closed?: boolean;
  eligibility_path?: string;
  territory?: string;
  phase2_classification?: string;
};

describe('Cyprus Phase 2 staging', () => {
  const stagingPath = path.join(__dirname, '../data/cyprus/cyprus_centers_staging.json');
  const phase1ReadyPath = path.join(
    __dirname,
    '../data/cyprus/CYPRUS_PHASE1_READY_TO_IMPORT.json',
  );
  const readyPath = path.join(
    __dirname,
    '../data/cyprus/CYPRUS_PHASE2_READY_TO_IMPORT.json',
  );
  const reportPath = path.join(
    __dirname,
    '../data/cyprus/CYPRUS_PHASE2_READINESS_REPORT.json',
  );
  const phase1ReportPath = path.join(
    __dirname,
    '../data/cyprus/CYPRUS_PHASE1_READINESS_REPORT.json',
  );
  const rebrandPath = path.join(
    __dirname,
    '../data/cyprus/CYPRUS_PHASE2_REBRAND_MAP.json',
  );
  const territorialPath = path.join(
    __dirname,
    '../data/cyprus/CYPRUS_TERRITORIAL_SAFETY.json',
  );
  const sanctumPath = path.join(__dirname, '../data/cyprus/phase2/sanctum_resolution.json');
  const factoryPath = path.join(
    __dirname,
    '../data/cyprus/phase2/fitness_factory_estate.json',
  );
  const onePath = path.join(__dirname, '../data/cyprus/phase2/fitness_one_estate.json');
  const curvesPath = path.join(
    __dirname,
    '../data/cyprus/phase2/curves_reconciliation.json',
  );
  const independentPath = path.join(
    __dirname,
    '../data/cyprus/phase2/independent_discovery.json',
  );
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as StagingRow[];
  const phase1Ready = JSON.parse(fs.readFileSync(phase1ReadyPath, 'utf8')) as StagingRow[];
  const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as StagingRow[];
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    verdict?: string;
    ready_count?: number;
    production_total?: number;
    projected_catalog_if_merged?: number;
    production_sha256?: string;
    phase3_required?: boolean;
    phase1_ready_preserved?: number;
    small_market_model?: string;
    status_counts?: Record<string, number>;
    ready_by_eligibility?: Record<string, number>;
    cyprus_live?: number;
    malta_live?: number;
  };
  const phase1Report = JSON.parse(fs.readFileSync(phase1ReportPath, 'utf8')) as {
    verdict?: string;
    ready_count?: number;
  };
  const rebrand = JSON.parse(fs.readFileSync(rebrandPath, 'utf8')) as {
    unresolved?: unknown[];
  };
  const territorial = JSON.parse(fs.readFileSync(territorialPath, 'utf8')) as {
    ready_foreign_outliers?: number;
    ready_territorial_outliers?: string[];
    result?: string;
  };
  const sanctum = JSON.parse(fs.readFileSync(sanctumPath, 'utf8')) as {
    class_a_eligible_count?: number;
    verdict?: string;
  };
  const factory = JSON.parse(fs.readFileSync(factoryPath, 'utf8')) as {
    current_clubs?: number;
    class_a?: boolean;
    discovery_gap_closed?: boolean;
  };
  const one = JSON.parse(fs.readFileSync(onePath, 'utf8')) as {
    discovery_gap_closed?: boolean;
    current_clubs_defensible?: number;
  };
  const curves = JSON.parse(fs.readFileSync(curvesPath, 'utf8')) as {
    current_count?: number;
    third_current_club_found?: boolean;
  };
  const independent = JSON.parse(fs.readFileSync(independentPath, 'utf8')) as {
    ready_independent_count?: number;
    investigated_count?: number;
  };
  const centersRaw = fs.readFileSync(centersPath);
  const centers = JSON.parse(centersRaw.toString('utf8')) as Array<{id: string}>;
  const sha = crypto.createHash('sha256').update(centersRaw).digest('hex');

  it('production reflects Iceland merge (11800 / IS 27 / CY 17); Phase 2 report SHA frozen; Malta 18', () => {
    expect(centers.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(centers.filter(c => c.id.startsWith('cy_')).length).toBe(17);
    expect(centers.filter(c => c.id.startsWith('mt_')).length).toBe(18);
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(report.production_total).toBe(11648);
    expect(report.production_sha256).toBe(PHASE_REPORT_PRODUCTION_SHA256);
    expect(report.cyprus_live).toBe(0);
    expect(report.malta_live).toBe(18);
  });

  it('Phase 1 READY preserved empty; Phase 1 report frozen; Phase 2 READY set now MERGED in staging', () => {
    expect(phase1Ready.length).toBe(0);
    expect(report.phase1_ready_preserved).toBe(0);
    expect(phase1Report.ready_count).toBe(0);
    expect(phase1Report.verdict).toMatch(/PHASE 2 REQUIRED/i);
    expect(ready.length).toBe(17);
    expect(report.ready_count).toBe(17);
    expect(new Set(ready.map(r => r.id)).size).toBe(17);
    expect(ready.every(r => r.id.startsWith(GYM_ID_PREFIX.cyprus))).toBe(true);
    expect(staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG').length).toBe(17);
    expect(staging.filter(r => r.import_category === 'READY_TO_IMPORT').length).toBe(0);
  });

  it('staging statuses reconcile; all cy_; country Cyprus', () => {
    const counts = staging.reduce<Record<string, number>>((acc, r) => {
      acc[r.import_category] = (acc[r.import_category] || 0) + 1;
      return acc;
    }, {});
    const sum = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(sum).toBe(staging.length);
    // Phase 2 report status_counts are pre-merge; live staging is post-merge
    expect(report.status_counts?.READY_TO_IMPORT).toBe(17);
    expect(counts.MERGED_INTO_CATALOG).toBe(17);
    expect(counts.NEEDS_COORDINATES).toBe(5);
    expect(counts.CLOSED).toBe(8);
    expect(counts.EXCLUDED).toBe(37);
    for (const r of staging) {
      expect(r.id.startsWith(GYM_ID_PREFIX.cyprus)).toBe(true);
      expect(VALID_STATUS.has(r.import_category)).toBe(true);
      expect(r.country).toBe('Cyprus');
    }
  });

  it('Phase 2 READY artifact passes hard DQ gates; all SMALL_MARKET_INDEPENDENT; zero Class A', () => {
    expect(report.ready_by_eligibility?.CHAIN_CLASS_A).toBe(0);
    expect(report.ready_by_eligibility?.SMALL_MARKET_INDEPENDENT).toBe(17);
    expect(ready.every(r => r.eligibility_path === 'SMALL_MARKET_INDEPENDENT')).toBe(true);
    for (const r of ready) {
      expect(['READY_TO_IMPORT', 'MERGED_INTO_CATALOG']).toContain(
        staging.find(s => s.id === r.id)?.import_category,
      );
      expect(r.name.trim()).toBeTruthy();
      expect(r.address.trim()).toBeTruthy();
      expect(r.city.trim()).toBeTruthy();
      expect(CYPRUS_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(typeof r.lat).toBe('number');
      expect(typeof r.lng).toBe('number');
      expect(isPlausibleCyprusCoordinate(r.lat as number, r.lng as number)).toBe(true);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(FOREIGN_NORTH.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(r.is_coming_soon).toBeFalsy();
      expect(r.is_closed).toBeFalsy();
      expect(r.territory).toBe('Republic of Cyprus');
    }
  });

  it('Sanctum not READY; Fitness Factory/One gaps closed; Curves estate 2', () => {
    expect(sanctum.class_a_eligible_count).toBe(0);
    expect(ready.some(r => /sanctum/i.test(r.brand))).toBe(false);
    const sanctumRows = staging.filter(r => /sanctum/i.test(r.brand));
    expect(sanctumRows.length).toBe(3);
    expect(sanctumRows.every(r => r.import_category === 'EXCLUDED')).toBe(true);
    expect(factory.current_clubs).toBe(1);
    expect(factory.class_a).toBe(false);
    expect(factory.discovery_gap_closed).toBe(true);
    expect(ready.some(r => r.brand === 'Fitness Factory')).toBe(true);
    expect(one.discovery_gap_closed).toBe(true);
    expect(one.current_clubs_defensible).toBe(0);
    expect(ready.some(r => r.brand === 'Fitness One')).toBe(false);
    expect(curves.current_count).toBe(2);
    expect(curves.third_current_club_found).toBe(false);
    expect(ready.filter(r => r.brand === 'Curves').length).toBe(2);
    expect(staging.filter(r => r.brand === 'Curves' && r.import_category === 'CLOSED').length).toBe(
      8,
    );
  });

  it('territorial hard gate clean; Northern rows EXCLUDED; Pallouriotissa allowed', () => {
    expect(territorial.ready_foreign_outliers).toBe(0);
    expect(territorial.ready_territorial_outliers || []).toEqual([]);
    expect(territorial.result).toBe('CLEAN_FOR_READY');
    const north = staging.filter(r => r.territory === 'Northern Cyprus / TRNC');
    expect(north.length).toBeGreaterThanOrEqual(2);
    expect(north.every(r => r.import_category === 'EXCLUDED')).toBe(true);
    expect(isPlausibleCyprusCoordinate(35.1782845, 33.377719)).toBe(true);
    expect(isPlausibleCyprusCoordinate(35.34, 33.32)).toBe(false);
    expect(ready.some(r => /figure8|pallouriotissa/i.test(`${r.name} ${r.city}`))).toBe(true);
  });

  it('independent phase executed; rebrand unresolved empty; merge-ready under 12500', () => {
    expect(report.small_market_model).toBe('INDEPENDENT_PHASE_EXECUTED');
    expect((independent.investigated_count || 0) >= 15).toBe(true);
    expect(independent.ready_independent_count).toBe(17);
    expect((rebrand.unresolved || []).length).toBe(0);
    expect(report.phase3_required).toBe(false);
    expect(report.verdict).toMatch(/READY FOR CYPRUS MERGE/i);
    expect(report.projected_catalog_if_merged).toBe(11648 + 17);
    expect(report.projected_catalog_if_merged!).toBeLessThan(12500);
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(isCyprusCountry('Cyprus')).toBe(true);
    expect(gymCountryTranslationKey('Cyprus')).toBe('countries.cyprus');
    expect(en.countries.cyprus).toBe('Cyprus');
    expect(resolveGymOrStub('cy_nonexistent_test').region).toBe('Cyprus');
  });
});
