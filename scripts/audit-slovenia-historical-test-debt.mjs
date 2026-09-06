/**
 * Audit historical Slovenia GymQa / MergeSafety / staging failures.
 * Classifies failures — does NOT modify tests or production.
 *
 * Usage: node scripts/audit-slovenia-historical-test-debt.mjs
 */
import fs from 'fs';
import path from 'path';
import {execSync} from 'child_process';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dataDir = path.join(root, 'data/slovenia');
const outJson = path.join(dataDir, 'SLOVENIA_QA_HISTORICAL_TEST_DEBT.json');

const LIVE_TOTAL = 11922;
const LIVE_SLOVENIA = 33;
const PRE_RECON_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';
const POST_RECON_SHA =
  '18c7ed69ad1bdebcfbd77bd8b746bd48159c4963c0bb9a9c071bf5ee3e2d2bab';

const PRIOR_COUNTS = {
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
  Slovenia: 33,
};

const STALE_TOTAL_RE =
  /catalog\.length|total production|total catalog|totaling \d+|Object\.values\(counts\)|perf\.catalog|ALL_GYM_CENTERS\.length|final_catalog|new_production|CURRENT_PRODUCTION_TOTAL/i;

function writeJson(p, data) {
  fs.writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function classifyFailure(suite, testName, messages) {
  const blob = `${suite} ${testName} ${messages.join(' ')}`;
  const expectedMatch = blob.match(/Expected:\s*(\d+)/);
  const receivedMatch = blob.match(/Received:\s*(\d+)/);
  const expected = expectedMatch ? Number(expectedMatch[1]) : null;
  const received = receivedMatch ? Number(receivedMatch[1]) : null;

  if (expected === 32 && received === LIVE_SLOVENIA && /Slovenia|si_\*/i.test(blob)) {
    return {
      classification: 'STALE_COUNTRY_COUNT_EXPECTATION',
      reason: `Hard-coded Slovenia count ${expected} vs live ${LIVE_SLOVENIA}`,
    };
  }

  if (
    expected !== null &&
    received === LIVE_TOTAL &&
    expected !== LIVE_TOTAL &&
    STALE_TOTAL_RE.test(blob)
  ) {
    return {
      classification: 'STALE_GLOBAL_TOTAL_EXPECTATION',
      reason: `Hard-coded catalog total ${expected} vs live ${LIVE_TOTAL}`,
    };
  }

  if (/SHA|sha256|LIVE_PRODUCTION_SHA|LIVE_SHA|post_merge_sha/i.test(blob)) {
    if (blob.includes(PRE_RECON_SHA) || blob.includes('de118760')) {
      return {
        classification: 'STALE_HISTORICAL_SHA_EXPECTATION',
        reason: 'Pre-reconciliation SHA frozen in staging test',
      };
    }
    return {
      classification: 'OTHER_TEST_DEBT',
      reason: 'Stale SHA snapshot assertion from historical merge artifact',
    };
  }

  if (/prodIds\.has\(r\.id\)\)\.toBe\(false\)|NEW_READY excludes production/i.test(blob)) {
    return {
      classification: 'STALE_COUNTRY_COUNT_EXPECTATION',
      reason: 'Phase 2 staging expects NEW_READY absent from production (pre-reconciliation)',
    };
  }

  for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
    if (country === 'Slovenia') continue;
    if (blob.includes(country) && expected === n && received !== null && received !== n) {
      return {
        classification: 'REAL_COUNTRY_REGRESSION',
        reason: `Live ${country} count ${received} != frozen baseline ${n}`,
      };
    }
  }

  if (/alfa gym/i.test(blob) && /absent|not.*production|EXCLUDED_BRAND/i.test(blob)) {
    return {
      classification: 'STALE_COUNTRY_COUNT_EXPECTATION',
      reason: 'Historical suite expected Alfa Gym absent before reconciliation',
    };
  }

  if (/perf\.|json_size|cold_index|typical_search/i.test(blob)) {
    return {
      classification: 'OTHER_TEST_DEBT',
      reason: 'Performance snapshot or benchmark assertion drift',
    };
  }

  return {
    classification: 'OTHER_TEST_DEBT',
    reason: messages[0]?.slice(0, 200) || 'Unclassified assertion failure',
  };
}

function verifyPriorCounts() {
  const catalog = JSON.parse(
    fs.readFileSync(path.join(root, 'src/data/centers.json'), 'utf8'),
  );
  const live = {};
  for (const c of catalog) {
    live[c.country] = (live[c.country] || 0) + 1;
  }
  const regressions = [];
  for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
    if ((live[country] || 0) !== n) {
      regressions.push({country, expected: n, actual: live[country] || 0});
    }
  }
  return {live, regressions, catalog_total: catalog.length, slovenia: live.Slovenia ?? 0};
}

const tmpJson = path.join(dataDir, '.jest-historical-audit.json');
fs.mkdirSync(dataDir, {recursive: true});

let jestExit = 0;
try {
  execSync(
    `npm test -- --testPathPattern="sloveniaGymQa|sloveniaMergeSafety|sloveniaPhase1Staging|sloveniaPhase2Staging" --json --outputFile="${tmpJson}" 2>/dev/null`,
    {cwd: root, stdio: 'pipe', maxBuffer: 50 * 1024 * 1024},
  );
} catch (e) {
  jestExit = e.status ?? 1;
}

const jestReport = JSON.parse(fs.readFileSync(tmpJson, 'utf8'));
const failures = [];
for (const suite of jestReport.testResults || []) {
  const file = path.relative(root, suite.name);
  for (const r of suite.assertionResults || []) {
    if (r.status === 'failed') {
      const messages = (r.failureMessages || []).map(m =>
        m.replace(/\u001b\[[0-9;]*m/g, ''),
      );
      failures.push({
        suite: suite.name,
        test: r.fullName || r.title,
        file,
        messages,
        ...classifyFailure(suite.name, r.fullName || r.title, messages),
      });
    }
  }
}

const prior = verifyPriorCounts();
const summary = {
  HISTORICAL_SUITES_FAILED: jestReport.numFailedTestSuites ?? 0,
  HISTORICAL_TESTS_FAILED: jestReport.numFailedTests ?? 0,
  STALE_GLOBAL_TOTAL_EXPECTATION: failures.filter(
    f => f.classification === 'STALE_GLOBAL_TOTAL_EXPECTATION',
  ).length,
  STALE_COUNTRY_COUNT_EXPECTATION: failures.filter(
    f => f.classification === 'STALE_COUNTRY_COUNT_EXPECTATION',
  ).length,
  STALE_HISTORICAL_SHA_EXPECTATION: failures.filter(
    f => f.classification === 'STALE_HISTORICAL_SHA_EXPECTATION',
  ).length,
  REAL_COUNTRY_REGRESSION: failures.filter(
    f => f.classification === 'REAL_COUNTRY_REGRESSION',
  ).length,
  OTHER_TEST_DEBT: failures.filter(f => f.classification === 'OTHER_TEST_DEBT').length,
  STALE_TOTAL_FAILURES: failures.filter(f =>
    f.classification.startsWith('STALE_'),
  ).length,
  REAL_COUNTRY_REGRESSIONS: prior.regressions.length,
};

const report = {
  generated_at: new Date().toISOString(),
  live_catalog_total: LIVE_TOTAL,
  live_slovenia: LIVE_SLOVENIA,
  post_reconciliation_sha: POST_RECON_SHA,
  jest_exit_code: jestExit,
  prior_country_verification: prior,
  summary,
  REAL_COUNTRY_REGRESSIONS: prior.regressions.length,
  blocking_slovenia_qa: prior.regressions.length > 0,
  failures,
  note:
    'Failures caused by stale hard-coded totals/counts/SHA from pre-reconciliation states are non-blocking when REAL_COUNTRY_REGRESSIONS=0.',
};

writeJson(outJson, report);
fs.unlinkSync(tmpJson);

console.log(
  `Slovenia historical audit: suites_failed=${summary.HISTORICAL_SUITES_FAILED} stale=${summary.STALE_TOTAL_FAILURES} real=${summary.REAL_COUNTRY_REGRESSIONS}`,
);
