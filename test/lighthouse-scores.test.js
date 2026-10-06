/* The weekly Lighthouse workflow pipes a report through scoresFrom and
 * publishes the result as README badges. The refusals matter most: a category
 * Lighthouse could not score must stop the run, not publish a badge reading
 * "null". Expected numbers are the 2026-10-06 baseline run of
 * https://benchcard.app/, written out by hand. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scoresFrom } from '../scripts/lighthouse-scores.mjs';

const SCRIPT = new URL('../scripts/lighthouse-scores.mjs', import.meta.url).pathname;

const report = (formFactor, [perf, a11y, bp, seo]) => ({
  requestedUrl: 'https://benchcard.app/',
  finalDisplayedUrl: 'https://benchcard.app/',
  fetchTime: '2026-10-06T12:00:00.000Z',
  lighthouseVersion: '12.8.2',
  configSettings: { formFactor },
  categories: {
    performance: { score: perf },
    accessibility: { score: a11y },
    'best-practices': { score: bp },
    seo: { score: seo },
  },
});
const mobile = () => report('mobile', [0.75, 0.96, 0.79, 1]);

test('scoresFrom turns the mobile baseline into 75/96/79/100', () => {
  assert.deepEqual(scoresFrom(mobile()), {
    url: 'https://benchcard.app/',
    formFactor: 'mobile',
    fetchTime: '2026-10-06T12:00:00.000Z',
    lighthouseVersion: '12.8.2',
    performance: 75,
    accessibility: 96,
    bestPractices: 79,
    seo: 100,
  });
});

test('scoresFrom turns the desktop baseline into 99/96/78/100', () => {
  const s = scoresFrom(report('desktop', [0.99, 0.96, 0.78, 1]));
  assert.equal(s.formFactor, 'desktop');
  assert.deepEqual([s.performance, s.accessibility, s.bestPractices, s.seo], [99, 96, 78, 100]);
});

test('scoresFrom refuses a category Lighthouse could not score, naming it', () => {
  const r = mobile();
  r.categories['best-practices'].score = null;
  assert.throws(() => scoresFrom(r), /best-practices/);
});

test('scoresFrom refuses a report missing a category, naming it', () => {
  const r = mobile();
  delete r.categories.seo;
  assert.throws(() => scoresFrom(r), /seo/);
});

const run = content => {
  const file = join(mkdtempSync(join(tmpdir(), 'lh-')), 'report.json');
  writeFileSync(file, content);
  return spawnSync(process.execPath, [SCRIPT, file], { encoding: 'utf8' });
};

test('the CLI prints the scores as 2-space JSON with a trailing newline and exits 0', () => {
  const r = run(JSON.stringify(mobile()));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, JSON.stringify(scoresFrom(mobile()), null, 2) + '\n');
  assert.equal(JSON.parse(r.stdout).performance, 75);
});

test('the CLI exits 1 with the error on stderr for a bad report', () => {
  const bad = mobile();
  bad.categories.performance.score = null;
  const r = run(JSON.stringify(bad));
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /performance/);
});
