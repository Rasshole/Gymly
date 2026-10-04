#!/usr/bin/env node
/**
 * Gymly i18n coverage gate vs English master.
 * Usage: npm run i18n:coverage
 */
const {spawnSync} = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const entry = path.join(__dirname, 'i18n-coverage-run.mts');

const r = spawnSync(
  'npx',
  ['--yes', 'tsx', entry],
  {cwd: root, encoding: 'utf8', shell: process.platform === 'win32'},
);
process.stdout.write(r.stdout || '');
process.stderr.write(r.stderr || '');
process.exit(r.status ?? 1);
