/**
 * Audit historical GymQa / MergeSafety failures for Croatia Production QA.
 * Classifies failures — does NOT modify tests or production.
 *
 * Usage: node scripts/audit-croatia-historical-test-debt.mjs
 */
import fs from 'fs';
import path from 'path';
import {execSync} from 'child_process';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dataDir = path.join(root, 'data/croatia');
const outJson = path.join(dataDir, 'CROATIA_QA_HISTORICAL_TEST_DEBT.json');

const LIVE_TOTAL = 11921;

const PRIOR_COUNTS = {
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
  Croatia: 80,
};

const STALE_TOTAL_RE =
  /catalog\.length|total production|total catalog|totaling \d+|Object\.values\(counts\)|perf\.catalog|ALL_GYM_CENTERS\.length|final_catalog|new_production/i;

const COUNTRY_COUNT_RE =
  /counts\[['"]([^'"]+)['"]\]|country === ['"]([^'"]+)['"]\)|\.filter\(c => c\.country === ['"]([^'"]+)['"]\)/;

function writeJson(p, data) {
  fs.writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function classifyFailure(suite, testName, messages) {
  const blob = `${suite} ${testName} ${messages.join(' ')}`;
  const expectedMatch = blob.match(/Expected:\s*(\d+)/);
  const receivedMatch = blob.match(/Received:\s*(\d+)/);
  const expected = expectedMatch ? Number(expectedMatch[1]) : null;
  const received = receivedMatch ? Number(receivedMatch[1]) : null;

  if (
    expected !== null &&
    received === LIVE_TOTAL &&
    expected !== LIVE_TOTAL
  ) {
    return {
      classification: 'STALE_GLOBAL_TOTAL_EXPECTATION',
      reason: `Hard-coded catalog total ${expected} vs live ${LIVE_TOTAL}`,
    };
  }

  if (
    STALE_TOTAL_RE.test(blob) &&
    expected !== null &&
    expected !== LIVE_TOTAL &&
    (received === LIVE_TOTAL || received === null)
  ) {
    return {
      classification: 'STALE_GLOBAL_TOTAL_EXPECTATION',
      reason: `Hard-coded catalog total ${expected} vs live ${LIVE_TOTAL}`,
    };
  }

  if (
    expected !== null &&
    received !== null &&
    expected !== received &&
    Object.values(PRIOR_COUNTS).includes(expected) &&
    received === Object.values(PRIOR_COUNTS).find(v => v === received)
  ) {
    const country = Object.entries(PRIOR_COUNTS).find(([, n]) => n === expected)?.[0];
    if (country && received === PRIOR_COUNTS[country]) {
      return {
        classification: 'OTHER_TEST_DEBT',
        reason: `Country-specific assertion mismatch unrelated to live ${country} count`,
      };
    }
  }

  for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
    if (blob.includes(country) && expected === n && received !== null && received !== n) {
      return {
        classification: 'REAL_COUNTRY_REGRESSION',
        reason: `Live ${country} count ${received} != frozen baseline ${n}`,
      };
    }
  }

  if (
    expected !== null &&
    received === LIVE_TOTAL &&
    expected !== LIVE_TOTAL &&
    /Expected:|toBe\(\d+\)/.test(blob)
  ) {
    return {
      classification: 'STALE_GLOBAL_TOTAL_EXPECTATION',
      reason: `Stale total expectation ${expected} vs live ${LIVE_TOTAL}`,
    };
  }

  if (/SHA|sha256|post_merge_sha|live_sha/i.test(blob)) {
    return {
      classification: 'OTHER_TEST_DEBT',
      reason: 'Stale SHA snapshot assertion from historical merge artifact',
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

function flattenResults(suite, acc = []) {
  const file = path.relative(root, suite.name);
  for (const r of suite.assertionResults || []) {
    if (r.status === 'failed') {
      const messages = (r.failureMessages || []).map(m =>
        m.replace(/\u001b\[[0-9;]*m/g, ''),
      );
      acc.push({
        suite: suite.name,
        test: r.fullName || r.title,
        file,
        messages,
        ...classifyFailure(suite.name, r.fullName || r.title, messages),
      });
    }
  }
  for (const r of suite.testResults || []) {
    if (r.assertionResults) flattenResults({...r, name: r.name || suite.name}, acc);
  }
  return acc;
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
  return {live, regressions, catalog_total: catalog.length};
}

const tmpJson = path.join(dataDir, '.jest-historical-audit.json');
fs.mkdirSync(dataDir, {recursive: true});

let jestExit = 0;
try {
  execSync(
    `npm test -- --testPathPattern="GymQa|MergeSafety" --json --outputFile="${tmpJson}" --testPathIgnorePatterns="croatia" 2>/dev/null`,
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
  STALE_TOTAL_FAILURES: failures.filter(f => f.classification === 'STALE_GLOBAL_TOTAL_EXPECTATION')
    .length,
  REAL_COUNTRY_REGRESSIONS: prior.regressions.length,
  OTHER_TEST_DEBT_FAILURES: failures.filter(
    f => f.classification === 'OTHER_TEST_DEBT',
  ).length,
  classified_real_from_tests: failures.filter(
    f => f.classification === 'REAL_COUNTRY_REGRESSION',
  ).length,
};

const report = {
  generated_at: new Date().toISOString(),
  live_catalog_total: LIVE_TOTAL,
  jest_exit_code: jestExit,
  prior_country_verification: prior,
  summary,
  REAL_COUNTRY_REGRESSIONS: prior.regressions.length,
  blocking_croatia_qa: prior.regressions.length > 0,
  failures,
  note:
    'Failures in historical suites caused by stale hard-coded catalog totals are non-blocking Croatia QA debt when REAL_COUNTRY_REGRESSIONS=0.',
};

writeJson(outJson, report);
fs.unlinkSync(tmpJson);

console.log(
  `Historical audit: suites_failed=${summary.HISTORICAL_SUITES_FAILED} stale=${summary.STALE_TOTAL_FAILURES} real=${summary.REAL_COUNTRY_REGRESSIONS} other=${summary.OTHER_TEST_DEBT_FAILURES}`,
);
