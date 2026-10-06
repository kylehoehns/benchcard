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

const runMany = reports => {
  const dir = mkdtempSync(join(tmpdir(), 'lh-'));
  const files = reports.map((content, i) => {
    const file = join(dir, `report-${i + 1}.json`);
    writeFileSync(file, content);
    return file;
  });
  return spawnSync(process.execPath, [SCRIPT, ...files], { encoding: 'utf8' });
};
const run = content => runMany([content]);

test('the CLI prints the scores as 2-space JSON with a trailing newline and exits 0', () => {
  const r = run(JSON.stringify(mobile()));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, [
    '{',
    '  "url": "https://benchcard.app/",',
    '  "formFactor": "mobile",',
    '  "fetchTime": "2026-10-06T12:00:00.000Z",',
    '  "lighthouseVersion": "12.8.2",',
    '  "performance": 75,',
    '  "accessibility": 96,',
    '  "bestPractices": 79,',
    '  "seo": 100',
    '}',
    '',
  ].join('\n'));
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

/* #344: one run on a shared runner is noisy, so the workflow runs three and
 * publishes the median of each category on its own. */
test('scoresFrom takes the median of three performance scores, 60/76/67 -> 67', () => {
  const s = scoresFrom([
    report('mobile', [0.60, 1, 0.82, 1]),
    report('mobile', [0.76, 1, 0.82, 1]),
    report('mobile', [0.67, 1, 0.82, 1]),
  ]);
  assert.equal(s.performance, 67);
});

test('scoresFrom takes each category\'s median on its own, not the whole middle run', () => {
  // Middle performance (70) is in run 2; middle accessibility (90) is in run 3.
  const s = scoresFrom([
    report('mobile', [0.60, 0.80, 0.50, 1]),
    report('mobile', [0.70, 1.00, 0.60, 1]),
    report('mobile', [0.80, 0.90, 0.70, 1]),
  ]);
  assert.deepEqual([s.performance, s.accessibility, s.bestPractices, s.seo], [70, 90, 60, 100]);
});

test('scoresFrom takes the mean of the two middle scores for an even count, 70 and 75 -> 73', () => {
  const s = scoresFrom([report('mobile', [0.70, 1, 1, 1]), report('mobile', [0.75, 1, 1, 1])]);
  assert.equal(s.performance, 73);
});

test('scoresFrom takes fetchTime from the last report and keeps url, formFactor and version', () => {
  const first = report('mobile', [0.6, 1, 1, 1]);
  const last = report('mobile', [0.7, 1, 1, 1]);
  last.fetchTime = '2026-10-06T12:05:00.000Z';
  const s = scoresFrom([first, last]);
  assert.equal(s.fetchTime, '2026-10-06T12:05:00.000Z');
  assert.deepEqual([s.url, s.formFactor, s.lighthouseVersion], ['https://benchcard.app/', 'mobile', '12.8.2']);
});

test('scoresFrom refuses a bad report in any position, naming the category', () => {
  const bad = mobile();
  bad.categories.seo.score = null;
  assert.throws(() => scoresFrom([mobile(), bad, mobile()]), /seo/);
  assert.throws(() => scoresFrom([mobile(), mobile(), bad]), /seo/);
});

test('the CLI takes three reports and prints the median', () => {
  const r = runMany([0.60, 0.76, 0.67].map(p => JSON.stringify(report('mobile', [p, 1, 0.82, 1]))));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).performance, 67);
});

test('the CLI exits 1 with nothing on stdout when the second or third report is bad', () => {
  const bad = mobile();
  bad.categories.accessibility.score = null;
  for (const order of [[mobile(), bad, mobile()], [mobile(), mobile(), bad]]) {
    const r = runMany(order.map(x => JSON.stringify(x)));
    assert.equal(r.status, 1);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /accessibility/);
  }
});

test('the CLI exits 1 when given no report path', () => {
  const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
});

test('scoresFrom refuses an empty list of reports', () => {
  assert.throws(() => scoresFrom([]), /no reports/i);
});
